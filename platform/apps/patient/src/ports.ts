/**
 * The patient app's ports — what it needs from the outside, stated as types.
 *
 * @blueprint GET /v1/catalogue/search · GET /v1/catalogue/items/{id} · POST /v1/requests · CatalogueItem · Request
 * @owner patient-app
 * @why Stage 5 infrastructure does not exist yet, and inventing a transport
 *      here would put an implementation decision inside the screens. A port is
 *      the narrowest honest statement of the dependency: every endpoint named
 *      below is declared in the technical model, every method returns the
 *      transport `Outcome` the retry policy already classifies, and the tests
 *      supply fakes. Nothing in this file performs I/O.
 */
import type { Outcome } from "@dawai/net";

/**
 * A catalogue row as the patient app needs it. The clinical flags are the
 * three `Clinical.gateRequestLine` reads — they are carried on the row so a
 * screen never has to ask a second service before it can refuse (D42 refuses
 * a controlled item at the moment it is tapped, not after a round trip).
 */
export type CatalogueHit = {
  readonly itemId: string;
  /** Arabic display name. */
  readonly name: string;
  /** The Latin name people also type and read on the box. Isolated at render. */
  readonly latinName: string;
  readonly form: string;
  readonly strength: string;
  readonly requestable: boolean;
  readonly requiresPrescription: boolean;
  readonly isControlled: boolean;
};

export type SearchResponse = {
  readonly hits: readonly CatalogueHit[];
  /** Server time the rows were produced. Shown as age when served from cache
   *  (§4 F2 offline state showsAge). */
  readonly at: number;
};

export type Fetched<T> =
  | { readonly kind: "fresh"; readonly value: T }
  /** Served from the device cache because the network was unavailable. The
   *  screen must label it, never present it as live. */
  | { readonly kind: "cached"; readonly value: T; readonly cachedAt: number }
  | { readonly kind: "failed"; readonly outcome: Outcome };

export interface CataloguePort {
  /** GET /v1/catalogue/search */
  search(query: string, signal?: AbortSignal): Promise<Fetched<SearchResponse>>;
}

/** What POST /v1/requests carries. Assembled by the draft, sent by the outbox. */
export type RequestSubmission = {
  readonly subjectId: string;
  readonly urgency: "now" | "today" | "soon";
  readonly districtId: string;
  readonly lines: readonly {
    readonly itemId: string;
    readonly packs: number;
    readonly prescriptionImageId: string | null;
  }[];
};

/* ── Identity — the declared auth contract, as a port ─────────────────── */

/** What POST /v1/auth/phone answers with. `resendAfter` is the server's word
 *  on when another SMS may be requested; the client renders it, never decides
 *  it. */
export type ChallengeIssued = {
  readonly challengeId: string;
  readonly resendAfter: number;
};

/**
 * What POST /v1/auth/verify can say. Each variant is one of the DECLARED
 * responses — 200, 400 wrong_code { attemptsLeft }, 410 challenge_expired,
 * 429 too_many_attempts, 403 account_suspended — and nothing else, so a screen
 * cannot receive an answer the API contract does not contain.
 */
export type VerifyResult =
  | { readonly kind: "verified"; readonly accountId: string; readonly subjectId: string }
  | { readonly kind: "wrongCode"; readonly attemptsLeft: number }
  | { readonly kind: "expired" }
  | { readonly kind: "tooManyAttempts" }
  | { readonly kind: "suspended" };

export interface IdentityPort {
  /** POST /v1/auth/phone */
  requestCode(e164: string, signal?: AbortSignal): Promise<Fetched<ChallengeIssued>>;
  /** POST /v1/auth/verify */
  verify(challengeId: string, code: string, deviceId: string, signal?: AbortSignal): Promise<Fetched<VerifyResult>>;
}

/**
 * Ids and time are injected for the same reason the domain refuses them: a
 * screen that mints an idempotency key from a clock cannot be tested, and an
 * idempotency key that changes between retries is not one.
 */
export interface Environment {
  /** Server-corrected epoch milliseconds. Never the raw device clock — a user
   *  changing their phone clock must not change a countdown. */
  now(): number;
  /** A fresh opaque id. Used for outbox item ids and idempotency keys. */
  newId(): string;
  /** Whether the device currently believes it has a connection. Advisory only:
   *  the outbox is the authority on whether something was sent. */
  online(): boolean;
}
