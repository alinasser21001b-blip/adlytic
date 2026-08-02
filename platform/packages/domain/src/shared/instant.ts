/**
 * Instant — an explicit point in time, always supplied by the caller.
 *
 * @blueprint §6 Reservation · D09 · D11 · D30
 * @owner platform-foundation
 * @why Blueprint v3 requires every countdown to run on SERVER time, never the
 *      device's — a user changing their phone clock must not change a
 *      reservation. Making time a parameter rather than an ambient global is
 *      how that becomes structurally true instead of a convention, and it is
 *      what lets every time-dependent rule be tested deterministically.
 * @implements domain/instant
 */

/** Milliseconds since the Unix epoch, as measured by the server. */
export type Instant = number & { readonly __brand: "Instant" };

export const instant = (epochMs: number): Instant => epochMs as Instant;

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const plus = (t: Instant, ms: number): Instant => instant(t + ms);
export const minus = (a: Instant, b: Instant): number => a - b;
export const isBefore = (a: Instant, b: Instant): boolean => a < b;
export const isAfter = (a: Instant, b: Instant): boolean => a > b;

/**
 * A clock is an explicit dependency, never a module-level import. Services
 * supply the server clock; tests supply a fixed one.
 */
export type Clock = { now(): Instant };

export const fixedClock = (at: Instant): Clock => ({ now: () => at });
