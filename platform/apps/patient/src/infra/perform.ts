/**
 * Effects, performed — the store's declarations turned into I/O.
 *
 * @blueprint §21 · Rule 4 · GET /v1/catalogue/search · POST /v1/auth/phone · POST /v1/auth/verify
 * @owner patient-app
 * @why The store emits effects that SAY what should happen; this is the one
 *      place that DOES it, and it answers back in intents — so the round trip
 *      is store → effect → port → intent → store, and every screen re-renders
 *      from state that went through the reducer. No port result ever touches a
 *      screen directly, which is what keeps "never trust the client" checkable:
 *      the reducer is the only door.
 *
 *      Each effect returns at most one intent. An effect that wants to say two
 *      things is two effects, and keeping that rule here means the runner
 *      cannot become a second reducer.
 */
import { instant } from "@dawai/domain";
import type { Effect, Intent } from "../app/store.js";
import type { CataloguePort, Environment, IdentityPort } from "../ports.js";

export type Ports = {
  readonly catalogue: CataloguePort;
  readonly identity: IdentityPort;
  readonly env: Environment;
  /** Stable per install. The verify contract requires it for device binding. */
  readonly deviceId: string;
  /** flushOutbox is started here but owned by the caller: it mutates the
   *  outbox over time and reports through the store, not through a return. */
  readonly startFlush: () => void;
  readonly emit: (event: string, attributes: Readonly<Record<string, string | number | boolean>>) => void;
  readonly capture: () => void;
  /**
   * Who the server says just signed in.
   *
   * The store gets the same fact as an `authenticated` intent, and that intent
   * moves the SESSION. It cannot move the AUTHORITY: §5 rule 2 forbids the
   * store from deriving a permission, so `authority()` is supplied from
   * outside and the composition root is the only thing positioned to answer
   * it. Without this the runtime never learned that anyone had signed in, and
   * a patient who had just verified their number was refused order scope on
   * the request they verified in order to send.
   *
   * It is a separate port rather than a second return value because an effect
   * answers with at most one intent — that rule is what keeps this runner from
   * becoming a second reducer.
   */
  readonly onVerified: (accountId: string, subjectId: string) => void;
};

export async function perform(effect: Effect, ports: Ports): Promise<Intent | null> {
  switch (effect.kind) {
    case "search": {
      const result = await ports.catalogue.search(effect.query);
      return { kind: "searchResolved", query: effect.query, result };
    }

    case "requestCode": {
      const res = await ports.identity.requestCode(effect.e164);
      // A failed request issues no challenge, and the store's E6 renders the
      // resend path. Nothing to say back — the absence of codeIssued IS the
      // answer, and inventing a synthetic challenge would put a fake id in
      // the session.
      if (res.kind === "failed") return null;
      return { kind: "codeIssued", challengeId: res.value.challengeId, at: instant(ports.env.now()) };
    }

    case "verifyCode": {
      const res = await ports.identity.verify(effect.challengeId, effect.code, ports.deviceId);
      // A failure is still an answer the screen needs. Returning null left E6
      // spinning with no verdict and no way out.
      if (res.kind === "failed") return { kind: "codeCheckFailed", challengeId: effect.challengeId };
      const v = res.value;
      switch (v.kind) {
        // The server's judgement travels AS a judgement. The store moves the
        // challenge machine along the edge the server picked; nothing here or
        // there re-derives expiry or attempts.
        case "verified":
          // Told BEFORE the intent is returned, so the authority the reducer
          // reads on the very next dispatch already knows who signed in.
          ports.onVerified(v.accountId, v.subjectId);
          return { kind: "authenticated", accountId: v.accountId, subjectId: v.subjectId };
        case "wrongCode": return { kind: "codeJudged", challengeId: effect.challengeId, verdict: "wrong", attemptsLeft: v.attemptsLeft };
        case "expired": return { kind: "codeJudged", challengeId: effect.challengeId, verdict: "expired" };
        case "tooManyAttempts": return { kind: "codeJudged", challengeId: effect.challengeId, verdict: "exhausted" };
        case "suspended": return null; // E13's case — a separate slice owns that screen.
      }
      return null;
    }

    case "flushOutbox":
      ports.startFlush();
      return null;

    case "emit":
      ports.emit(effect.event, effect.attributes);
      return null;

    case "capturePrescription":
      ports.capture();
      return null;

    default: {
      /**
       * A new Effect kind is a COMPILE error here, not a silent no-op.
       *
       * The app shipped with two runners: this one, complete, imported by
       * nothing, and a copy in App.tsx that never handled `requestCode` or
       * `verifyCode`. A patient submitting a phone number emitted an effect
       * that fell on the floor, and nothing said so — because an unhandled
       * case in a switch is just a switch that ends. This makes the omission
       * impossible to compile.
       */
      const unhandled: never = effect;
      throw new Error(`no runner for effect ${JSON.stringify(unhandled)}`);
    }
  }
}
