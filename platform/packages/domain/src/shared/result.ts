/**
 * Result — the domain's only way to fail.
 *
 * @blueprint §5 rule 2 · §5 rule 3
 * @owner platform-foundation
 * @why A rule that returns a boolean will eventually be ignored by a caller who
 *      forgets to check it. A rule that throws loses the reason. Result carries
 *      the reason and cannot be used without unwrapping, so a caller cannot
 *      accidentally proceed on a refusal.
 * @implements domain/result
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/**
 * Unwrap or throw. Intended for tests and for callers that have already
 * checked. Never for production control flow — that is what `isOk` is for.
 */
export function expect<T, E>(r: Result<T, E>, message: string): T {
  if (r.ok) return r.value;
  throw new Error(`${message}: ${JSON.stringify(r.error)}`);
}

export function map<T, U, E>(r: Result<T, E>, f: (t: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

export function flatMap<T, U, E>(r: Result<T, E>, f: (t: T) => Result<U, E>): Result<U, E> {
  return r.ok ? f(r.value) : r;
}

/** Collect, keeping the FIRST error. Ordering matters for reproducible refusals. */
export function all<T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], E> {
  const out: T[] = [];
  for (const r of rs) { if (!r.ok) return r; out.push(r.value); }
  return ok(out);
}
