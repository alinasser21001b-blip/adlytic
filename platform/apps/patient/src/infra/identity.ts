/**
 * IdentityPort over the declared auth contract.
 *
 * @blueprint §4 E5 · §4 E6 · POST /v1/auth/phone · POST /v1/auth/verify
 * @owner identity-service
 * @why This file is a translation, not a policy. The API contract declares
 *      exactly what each endpoint can say — 202 with a challenge, 400
 *      wrong_code with attemptsLeft, 410 expired, 429 rate-limited, 403
 *      suspended — and the port's job is to map each declared response onto the
 *      typed result the store already handles, so an undeclared response
 *      surfaces as a failure rather than being guessed into meaning.
 *
 *      Nothing here retries. A verification is a conversation, not a queued
 *      write: retrying a code submission behind the patient's back could spend
 *      their attempts on their behalf, which is the one thing the attempt
 *      budget exists to prevent.
 */
import type { Http } from "./http.js";
import type { ChallengeIssued, Fetched, IdentityPort, ProfileResult, VerifyResult } from "../ports.js";

const num = (v: unknown, fallback: number): number => (typeof v === "number" ? v : fallback);
/** A count the server must have sent. Absent is not zero — see the 400 branch. */
const count = (v: unknown): number | null => (typeof v === "number" && v >= 0 ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function makeIdentity(http: Http): IdentityPort {
  return {
    async requestCode(e164, signal) {
      const res = await http.post("/v1/auth/phone", { phone: e164 }, { ...(signal ? { signal } : {}) });
      if (res.outcome.kind === "accepted") {
        const body = (res.body ?? {}) as Record<string, unknown>;
        const challengeId = str(body["challengeId"]);
        // A 202 without a challengeId is a server defect, and pretending it
        // was a network blip would make the patient retry into the same wall.
        if (!challengeId) return { kind: "failed", outcome: { kind: "permanent", reason: "202 without challengeId" } };
        return { kind: "fresh", value: { challengeId, resendAfter: num(body["resendAfter"], 45) } };
      }
      return { kind: "failed", outcome: res.outcome };
    },

    async verify(challengeId, code, deviceId, signal) {
      const res = await http.post("/v1/auth/verify", { challengeId, code, deviceId }, { ...(signal ? { signal } : {}) });
      const body = (res.body ?? {}) as Record<string, unknown>;

      // Each declared response, by its declared status. The out-of-contract
      // default at the bottom is the honest answer for anything else.
      if (res.status === 200) {
        const account = (body["account"] ?? {}) as Record<string, unknown>;
        const subjects = Array.isArray(body["subjects"]) ? (body["subjects"] as Record<string, unknown>[]) : [];
        const accountId = str(account["accountId"]);
        // §2 — the self subject is created atomically with the account, so a
        // 200 always carries at least one subject. Its absence is a defect.
        const subjectId = str(subjects[0]?.["subjectId"]);
        if (!accountId || !subjectId)
          return { kind: "failed", outcome: { kind: "permanent", reason: "200 without account/subject" } };
        return { kind: "fresh", value: { kind: "verified", accountId, subjectId } };
      }
      if (res.status === 400) {
        // A 400 without attemptsLeft used to default to 0, and the store reads
        // 0 as exhausted: a patient's FIRST wrong digit would have told them
        // they had used all five attempts and spent the challenge. The field is
        // declared on this response, so its absence is a server defect and is
        // named like every other one here rather than guessed into the harshest
        // possible meaning.
        const attemptsLeft = count(body["attemptsLeft"]);
        if (attemptsLeft === null)
          return { kind: "failed", outcome: { kind: "permanent", reason: "400 without attemptsLeft" } };
        return { kind: "fresh", value: { kind: "wrongCode", attemptsLeft } };
      }
      if (res.status === 410) return { kind: "fresh", value: { kind: "expired" } };
      if (res.status === 429) return { kind: "fresh", value: { kind: "tooManyAttempts" } };
      if (res.status === 403) return { kind: "fresh", value: { kind: "suspended" } };
      return { kind: "failed", outcome: res.outcome };
    },

    /**
     * PATCH /v1/me — the end of E7 and E8, sent as one call.
     *
     * Both fields together, because the contract takes both and an account
     * with a name and no district is one that cannot make a request. The
     * declared refusal is `invalid_district`, and it is a real possibility
     * rather than defensive coding: the district list this build ships is
     * bundled (TD-17) and is not the server's coverage map, so a district the
     * client accepted can still be one the server does not serve.
     */
    async updateMe(name, districtId, signal): Promise<Fetched<ProfileResult>> {
      const res = await http.patch("/v1/me", { name, districtId }, signal === undefined ? {} : { signal });
      if (res.outcome.kind === "accepted") return { kind: "fresh", value: { kind: "saved" } };
      const body = (res.body ?? {}) as Record<string, unknown>;
      if (res.status === 400 && body["error"] === "invalid_district")
        return { kind: "fresh", value: { kind: "invalidDistrict" } };
      return { kind: "failed", outcome: res.outcome };
    },
  };
}

/** Narrow re-export so the store's effect runner can name the port's answer
 *  without knowing HTTP existed. */
export type { ChallengeIssued, VerifyResult, ProfileResult, Fetched };
