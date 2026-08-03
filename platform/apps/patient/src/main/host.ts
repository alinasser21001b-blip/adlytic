/**
 * The platform, as an interface — everything the app cannot decide for itself.
 *
 * @blueprint §3 · §21 · D28
 * @owner patient-app
 * @why The composition root has to touch a clock, a random source, a network
 *      and a place to keep bytes, and every one of those is different on a
 *      phone and in a browser. Naming them here means `createRuntime` is
 *      ordinary testable code and the platform-specific part is a handful of
 *      one-line functions per host.
 *
 *      It is also the honest boundary for what does not exist yet. There is no
 *      device build (TD-2) and no camera (TD-9), so a host that cannot take a
 *      photograph says so by returning null rather than by pretending.
 */

/** Where bytes live between launches. D28: the encrypted cache dies with the
 *  session key, which only a real store can honour — so this is an interface,
 *  never a Map. */
export interface Store {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
}

export type Host = {
  /**
   * The base URL every request is made against. Supplied rather than derived:
   * a build that guesses its own backend is a build that can point at the
   * wrong one.
   */
  readonly baseUrl: string;
  /** Epoch milliseconds from the platform. `createRuntime` corrects it. */
  readonly clock: () => number;
  /** Opaque, unguessable, unique. Used for outbox ids and idempotency keys. */
  readonly newId: () => string;
  /** What the platform believes about connectivity. Advisory (§21): the outbox
   *  remains the authority on whether something was actually sent. */
  readonly online: () => boolean;
  readonly store: Store;
  readonly sleep: (ms: number) => Promise<void>;
  readonly random: () => number;
  /**
   * Take a photograph, or null if this host cannot. R2 offers typing the name
   * instead, so a host without a camera is a reduced app rather than a broken
   * one — which is what TD-9 has been describing.
   */
  /**
   * Take a photograph, or null if this host cannot.
   *
   * It answers with a LOCAL uri and nothing else. It used to answer with an
   * `imageId` too, which a platform cannot know: an id is minted by the media
   * service when the bytes reach it, so the interface was asking the host
   * either to talk to the API — a host that does that is not a host — or to
   * make one up. Uploading is the app's job, and `MediaPort` does it.
   *
   * Null when the patient dismissed the picker without choosing.
   */
  readonly camera: null | (() => Promise<{ readonly localUri: string } | null>);
  /** Where a structured log line goes. */
  readonly log: (line: string) => void;
};
