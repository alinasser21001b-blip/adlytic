/**
 * The composition root — the first place the whole application exists.
 *
 * @blueprint §3 · §5 · §8 · §21 · D26 · D28
 * @owner patient-app
 * @why TD-1 has said since the first slice that nothing constructs a Runtime
 *      and nothing mounts App.tsx, so every screen, the reducer, the ports and
 *      the effect loop were proved in isolation and the assembled application
 *      had never started once. This is the assembly.
 *
 *      It is the ONLY file allowed to read a clock or a random source. Every
 *      other module takes them as parameters, which is what makes the domain
 *      deterministic and the store testable; the values have to enter
 *      somewhere, and this is the named door. tools/layer-check.mjs enforces
 *      that it is the only one.
 */
import { Authority, isOk, asAccountId, asSubjectId, type SubjectId, type AccountId } from "@dawai/domain";
import { empty as emptyOutbox, type Outbox } from "@dawai/offline";
import { BUSINESS_EVENT } from "@dawai/observability";
import { makeHttp } from "../infra/http.js";
import { makeCatalogue, type SearchCache } from "../infra/catalogue.js";
import { makeIdentity } from "../infra/identity.js";
import { makeRequests } from "../infra/requests.js";
import { makeMarketplace } from "../infra/marketplace.js";
import { makeMedia } from "../infra/media.js";
import { flush } from "../infra/flush.js";
import type { Runtime } from "../App.js";
import type { Environment, SearchResponse } from "../ports.js";
import type { Effect, Intent } from "../app/store.js";
import type { Host } from "./host.js";

const DEVICE_ID_KEY = "dawai.deviceId";
const CACHE_PREFIX = "dawai.search.";

/**
 * How often a live request is re-read while pharmacies are still answering.
 *
 * R7 is a countdown a patient is watching, and D09's shortest window is twenty
 * minutes — so an answer that takes half a minute to appear on a screen the
 * patient is staring at reads as an app that has stopped working. Three
 * seconds is short enough that an offer feels like it arrived and long enough
 * that a twenty-minute window is hundreds of reads rather than thousands.
 *
 * It is a transport interval, not a product rule: nothing a patient sees is
 * derived from it, and the loop ends when the answers do rather than after a
 * number of tries.
 */
const WATCH_INTERVAL_MS = 3_000;

/**
 * How often a screen showing a countdown is re-rendered.
 *
 * One second, because E6 counts in seconds — «تكدر تطلب رمز جديد بعد ٤٥
 * ثانية» — and a countdown that lags its own unit reads as broken. The
 * minute-granular ones (R7's window, V2's hold) cost a re-render they do not
 * strictly need; one timer for the app is worth more than four that each know
 * their own unit.
 *
 * It runs only while a screen that draws the clock is on top, so an app
 * sitting on the search screen wakes for nothing.
 */
const TICK_MS = 1_000;

/** The id the server minted for a request it accepted. Read defensively — this
 *  is a response body, and a field that is not a string is a field we do not
 *  have. Without an id there is nothing to watch, and saying so beats watching
 *  `undefined`. */
function requestIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const request = (body as Record<string, unknown>)["request"];
  if (typeof request !== "object" || request === null) return null;
  const id = (request as Record<string, unknown>)["requestId"];
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * When the reply window closes — the SERVER's answer, carried on the 201.
 *
 * D09 fixes three windows and only three, and the client does not compute
 * which one applies: `POST /v1/requests` answers with `windowEndsAt` and this
 * reads it. Absent means the watch has no end it can trust, which is handled
 * where it is used rather than by inventing one here.
 */
function windowEndsAtOf(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const at = (body as Record<string, unknown>)["windowEndsAt"];
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

/**
 * The device identity, minted once and kept.
 *
 * The verify contract binds a session to it, so a value that changes between
 * launches would ask the patient to verify again every time they opened the
 * app. Read first, mint only if absent.
 */
export async function deviceIdFrom(host: Host): Promise<string> {
  const kept = await host.store.read(DEVICE_ID_KEY);
  if (kept !== null && kept !== "") return kept;
  const minted = host.newId();
  await host.store.write(DEVICE_ID_KEY, minted);
  return minted;
}

/** F2's offline promise, kept against whatever the host gives us to write to. */
export function searchCache(host: Host): SearchCache {
  return {
    async read(query) {
      const raw = await host.store.read(CACHE_PREFIX + query);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { value: SearchResponse; at: number };
        return { value: parsed.value, at: parsed.at };
      } catch {
        // A cache entry we cannot parse is one an older build wrote in a shape
        // this one does not know. Treating it as absent is right: the network
        // path runs and rewrites it. The catalogue port validates every row it
        // returns from here regardless.
        return null;
      }
    },
    async write(query, value, at) {
      await host.store.write(CACHE_PREFIX + query, JSON.stringify({ value, at }));
    },
  };
}

/**
 * What the app is allowed to do, from the domain's answer.
 *
 * The store never derives a permission (§5 rule 2). Until a session exists
 * there are no relationships, so `authorise` refuses and the app has view-only
 * authority — which is exactly what a guest is, and what sends them to E4 at
 * the first action that needs an account (D26).
 */
export function authorityFrom(
  relationships: readonly Authority.Relationship[],
  account: AccountId | null,
  subject: SubjectId | null,
  memorialised: boolean,
  districtId: string,
) {
  const may = (need: "view" | "order"): boolean =>
    account !== null && subject !== null
    && isOk(Authority.authorise(relationships, account, subject, need, { memorialised }));
  return {
    hasOrderScope: may("order"),
    activeSubjectMemorialised: memorialised,
    districtId,
  };
}

export type Session = {
  readonly relationships: readonly Authority.Relationship[];
  readonly account: AccountId | null;
  readonly subject: SubjectId | null;
  readonly memorialised: boolean;
  readonly districtId: string;
};

/** A cold start: nobody signed in, nothing granted. */
export const NO_SESSION: Session = {
  relationships: [], account: null, subject: null, memorialised: false, districtId: "",
};

export type Assembled = {
  readonly runtime: Runtime;
  /** The outbox lives here because the flusher mutates it over time and the
   *  store reads it back. Exposed so a host can persist it. */
  outbox: () => Outbox;
};

/**
 * Build the running application.
 *
 * Everything is wired from the host: no module below this line reads a clock,
 * a network or a disk on its own.
 */
export async function createRuntime(
  host: Host,
  session: () => Session = () => NO_SESSION,
): Promise<Assembled> {
  const deviceId = await deviceIdFrom(host);

  /**
   * Where the app is listening, once it has mounted.
   *
   * Null until then, and null again after it unmounts. Both are real states: a
   * runtime is built BEFORE the app can be rendered, so anything that resolves
   * in that window has nowhere to go, and dropping it is the honest outcome —
   * an offer nobody is on screen to see is an offer the next read returns
   * anyway.
   */
  let sink: ((intent: Intent) => void) | null = null;
  const onIntent = (intent: Intent): void => { sink?.(intent); };

  /**
   * §21 — the clock is server-corrected, never the raw device clock, because a
   * patient changing their phone clock must not change a countdown. There is
   * no server yet (TD-1), so the correction is zero and this is the device
   * clock: stated here rather than implied, so the day a server arrives the
   * one place to apply its offset is obvious.
   */
  const now = (): number => host.clock();

  const env: Environment = { now, newId: host.newId, online: host.online };
  const http = makeHttp(host.baseUrl, globalThis.fetch as never);

  /**
   * Who verified, for as long as the app is open.
   *
   * Deliberately not persisted. POST /v1/auth/verify answers with a `session`
   * alongside the account, and nothing here models or stores that token yet
   * (TD-1) — so writing an account id to disk and treating a later launch as
   * signed in would be the app claiming an authenticated session it does not
   * hold. Closing the app signs out, honestly, until there is a token to keep.
   */
  let verified: { readonly account: AccountId; readonly subject: SubjectId } | null = null;
  /** Where this account searches from. E8's answer, and null until it has one
   *  — a guest has no district and the app must not pretend otherwise. */
  let district: string | null = null;

  /**
   * The queue as this runtime last saw it.
   *
   * NOT a second copy of the store's: `startFlush` is handed the store's
   * outbox and every change is reported straight back as an intent, so the
   * store stays the single owner. This holds it only for the duration of a
   * delivery, because the flusher needs to re-read it between items — that is
   * how a cancellation made mid-flight is seen instead of being sent anyway.
   */
  let outbox: Outbox = emptyOutbox();
  const requests = makeRequests(http);

  /**
   * Watch a live request until every pharmacy has answered.
   *
   * §8 says the patient is TOLD when pharmacies reply, and being told is a
   * push notification — which a browser build does not have and a device build
   * does not exist to receive (TD-1, TD-2). Reading the declared endpoint on
   * an interval is the honest stand-in: it produces the same intents a push
   * would, from the same contract, so the app above this line cannot tell the
   * difference and does not need to. It is registered as TD-21 rather than
   * left to look like the intended design.
   *
   * It stops when nobody is still thinking. A branch that has answered will
   * not answer again, so once `thinking` reaches zero there is nothing further
   * to learn and the loop is a battery cost with no result — which matters on
   * the phones this product is for.
   */
  const watch = async (requestId: string, windowEndsAt: number | null): Promise<void> => {
    for (;;) {
      /**
       * The window closes, and so does this.
       *
       * Stopping only when every branch has answered was wrong, and wrong in
       * the direction that costs a patient something: a branch that is asked
       * and never answers is ORDINARY — it is why D09 has a window at all and
       * why R11 exists — so `thinking` stays above zero indefinitely and this
       * polled every three seconds for as long as the app was open. On the
       * longest window that is a request every three seconds for two days, on
       * the phones and the data plans this product is for.
       */
      if (windowEndsAt !== null && host.clock() >= windowEndsAt) return;

      const seen = await requests.read(requestId);
      if (seen.kind === "failed") {
        // A dropped connection is not the end of the wait. The window is still
        // open, the pharmacies are still answering, and the next read is the
        // recovery — R7 keeps its countdown rather than claiming the request
        // failed, which it has not.
        await host.sleep(WATCH_INTERVAL_MS);
        continue;
      }
      for (const offer of seen.value.offers) onIntent({ kind: "offerArrived", offer });
      if (seen.value.responders.thinking === 0) return;
      await host.sleep(WATCH_INTERVAL_MS);
    }
  };
  const runtime: Runtime = {
    catalogue: makeCatalogue(http, searchCache(host), now),
    identity: makeIdentity(http),
    marketplace: makeMarketplace(http),
    media: makeMedia(http),
    env,
    deviceId,
    startFlush: (queued) => {
      outbox = queued;
      void flush(outbox, {
        http,
        random: host.random,
        sleep: host.sleep,
        current: () => outbox,
        onChange: (next) => {
          outbox = next;
          onIntent({ kind: "outboxChanged", outbox: next });
        },
        onAccepted: (item, body) => {
          // The only write this app makes today, named by the operation the
          // outbox stored at enqueue rather than assumed. When a second write
          // joins it, this stops being a match and starts being a switch.
          if (item.operation !== "POST /v1/requests") return;
          const id = requestIdOf(body);
          if (id !== null) void watch(id, windowEndsAtOf(body));
        },
      });
    },
    emit: (event, attributes) => {
      // The closed set is the contract (§8). A name outside it is a defect in
      // the caller, and saying so is more useful than sending it.
      if (!Object.values(BUSINESS_EVENT).includes(event as never))
        host.log(JSON.stringify({ level: "error", message: "unregistered telemetry event", event }));
      else host.log(JSON.stringify({ level: "info", message: event, attributes }));
    },
    capture: () => {
      if (!host.camera) return; // TD-9 — R2 offers typing the name instead.
      void host.camera().then((shot) => {
        if (shot) onIntent({ kind: "captured", localUri: shot.localUri });
      });
    },
    // §8 — a record carries the event, when, a correlation id and dimensions.
    // Never content: a district id is a dimension, a medicine name is not.
    telemetry: { emit: (record) => host.log(JSON.stringify({ level: "info", ...record })) },
    connect: (send) => {
      sink = send;
      return () => { if (sink === send) sink = null; };
    },
    ticks: (onTick) => {
      // Driven by the host's sleep rather than a raw timer, for the same
      // reason the clock is: this file is the one door those come through, and
      // a test substitutes both together.
      let live = true;
      void (async () => {
        while (live) {
          await host.sleep(TICK_MS);
          if (live) onTick();
        }
      })();
      return () => { live = false; };
    },
    onVerified: (accountId, subjectId) => {
      verified = { account: asAccountId(accountId), subject: asSubjectId(subjectId) };
    },
    onDistrict: (districtId) => { district = districtId; },
    authority: () => {
      const s = session();
      const districtId = district ?? s.districtId;
      if (verified === null)
        return authorityFrom(s.relationships, s.account, s.subject, s.memorialised, districtId);

      /**
       * §9 — an Account always owns exactly one self Subject, created
       * ATOMICALLY with it by POST /v1/auth/verify. That is a domain-model
       * invariant, not a guess: the relationship exists the instant the
       * account does, so a client that has just been handed both ids by that
       * endpoint knows the self relationship holds.
       *
       * It is stated here rather than assumed anywhere else. The store never
       * derives a permission (§5 rule 2) and the screens never ask; the
       * relationship goes to `Authority.authorise`, which decides. If the
       * domain refuses — a memorialised subject, for instance (D04) — the
       * refusal stands, exactly as it would for a grant that came from a
       * server. Nothing here bypasses the check; it supplies the fact the
       * check needs.
       *
       * A GRANT over someone else's record is a different matter and is NOT
       * inferred: GET /v1/me carries `grants[]` and no port reads it yet, so
       * a guardian or a peer still has no order scope in this build.
       */
      const relationships: readonly Authority.Relationship[] = [
        ...s.relationships,
        { kind: "self", account: verified.account, subject: verified.subject },
      ];
      return authorityFrom(relationships, verified.account, verified.subject, s.memorialised, districtId);
    },
    onEffectFailed: (effect: Effect, cause: unknown) => {
      host.log(JSON.stringify({
        level: "error", message: "effect failed", effect: effect.kind,
        cause: cause instanceof Error ? cause.message : String(cause),
      }));
    },
  };

  return { runtime, outbox: () => outbox };
}
