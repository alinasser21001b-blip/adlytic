/**
 * @blueprint §5 · §9 · D01 · D04
 * @owner identity-service
 * @why §5 rules 3 and 4 are the two that v1 violated in ways a code review did
 *      not catch — an identity oracle, and a widest-grant-wins ambiguity.
 */
import { describe, it, expect } from "vitest";
import { authorise, type Relationship } from "./authority.js";
import { asAccountId, asSubjectId } from "../shared/ids.js";
import { isOk, isErr } from "../shared/result.js";
import { REFUSAL } from "../shared/refusal.js";

const me = asAccountId("acct-1");
const other = asAccountId("acct-2");
const subj = asSubjectId("subj-1");
const alive = { memorialised: false };

describe("§5 rule 3 — a missing relationship is indistinguishable from a forbidden one", () => {
  it("a subject that does not exist and one you may not see give the SAME refusal", () => {
    const nonexistent = authorise([], me, asSubjectId("nope"), "view", alive);
    const forbidden = authorise(
      [{ kind: "self", account: other, subject: subj }], me, subj, "view", alive,
    );
    expect(isErr(nonexistent) && nonexistent.error.code).toBe(REFUSAL.NOT_FOUND_OR_NOT_YOURS);
    expect(isErr(forbidden) && forbidden.error.code).toBe(REFUSAL.NOT_FOUND_OR_NOT_YOURS);
    expect(JSON.stringify(nonexistent)).toBe(JSON.stringify(forbidden));
  });
});

describe("§5 rule 4 — least privilege wins on ambiguity", () => {
  it("a peer view grant is chosen over guardianship when view is enough", () => {
    const rels: Relationship[] = [
      { kind: "guardian", account: me, subject: subj },
      { kind: "peer", account: me, subject: subj, scope: "view" },
    ];
    const r = authorise(rels, me, subj, "view", alive);
    expect(isOk(r) && r.value.kind).toBe("peer");
  });
  it("guardianship is used when the peer scope is insufficient", () => {
    const rels: Relationship[] = [
      { kind: "guardian", account: me, subject: subj },
      { kind: "peer", account: me, subject: subj, scope: "view" },
    ];
    const r = authorise(rels, me, subj, "order", alive);
    expect(isOk(r) && r.value.kind).toBe("guardian");
  });
});

describe("§5 — scopes are ordered and additive", () => {
  it("view does not grant order", () => {
    const rels: Relationship[] = [{ kind: "peer", account: me, subject: subj, scope: "view" }];
    expect(isErr(authorise(rels, me, subj, "order", alive))).toBe(true);
  });
  it("order grants view", () => {
    const rels: Relationship[] = [{ kind: "peer", account: me, subject: subj, scope: "order" }];
    expect(isOk(authorise(rels, me, subj, "view", alive))).toBe(true);
  });
});

describe("D04 — a memorialised subject accepts no new activity, but stays readable", () => {
  const rels: Relationship[] = [{ kind: "guardian", account: me, subject: subj }];
  const gone = { memorialised: true };
  it("refuses order", () => {
    const r = authorise(rels, me, subj, "order", gone);
    expect(isErr(r) && r.error.code).toBe(REFUSAL.SUBJECT_MEMORIALISED);
  });
  it("still allows view for an existing grant holder", () => {
    expect(isOk(authorise(rels, me, subj, "view", gone))).toBe(true);
  });
});
