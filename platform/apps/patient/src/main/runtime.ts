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
import { flush } from "../infra/flush.js";
import type { Runtime } from "../App.js";
import type { Environment, SearchResponse } from "../ports.js";
import type { Effect, Intent } from "../app/store.js";
import type { Host } from "./host.js";

const DEVICE_ID_KEY = "dawai.deviceId";
const CACHE_PREFIX = "dawai.search.";

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
  onIntent: (intent: Intent) => void,
  session: () => Session = () => NO_SESSION,
): Promise<Assembled> {
  const deviceId = await deviceIdFrom(host);

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

  let outbox: Outbox = emptyOutbox();
  const runtime: Runtime = {
    catalogue: makeCatalogue(http, searchCache(host), now),
    identity: makeIdentity(http),
    env,
    deviceId,
    startFlush: () => {
      void flush(outbox, {
        http,
        random: host.random,
        sleep: host.sleep,
        current: () => outbox,
        onChange: (next) => { outbox = next; },
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
        if (shot) onIntent({ kind: "captured", imageId: shot.imageId, localUri: shot.localUri });
      });
    },
    // §8 — a record carries the event, when, a correlation id and dimensions.
    // Never content: a district id is a dimension, a medicine name is not.
    telemetry: { emit: (record) => host.log(JSON.stringify({ level: "info", ...record })) },
    onVerified: (accountId, subjectId) => {
      verified = { account: asAccountId(accountId), subject: asSubjectId(subjectId) };
    },
    authority: () => {
      const s = session();
      if (verified === null)
        return authorityFrom(s.relationships, s.account, s.subject, s.memorialised, s.districtId);

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
      return authorityFrom(relationships, verified.account, verified.subject, s.memorialised, s.districtId);
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
