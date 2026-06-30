# Workspace Isolation Audit — Phase 6a

**Generated:** 2026-06-29
**Branch:** `feat/horizontal-scaling`
**Scope:** All `prisma.*.{findMany, findFirst, findFirstOrThrow, update, updateMany, delete, deleteMany}` calls in `src/`.
**Excluded:** `findUnique`/`findUniqueOrThrow` by primary key (inherently single-row).

## Methodology

For every multi-row or mutation query, classify the call site as:

- ✅ **Safe** — `workspaceId` or `adAccountId` (which is itself workspace-scoped) is in the `where`, AND the value is derived from server-validated context (not raw user input).
- 🟡 **Indirectly safe** — no explicit workspace filter, but an upstream guard (`checkMember`, validated-then-mutate, internal system call) makes cross-tenant access impossible in practice. Document the guard.
- 🔴 **Risky** — workspace boundary is implicit or absent and a multi-tenant exploit is plausible. Requires a code change.
- ⚪ **N/A (system-level)** — worker/cron/maintenance code that intentionally iterates all rows. No user input flows in. Document why it's safe.

The standard safe pattern used across the API is:

```ts
const member = await checkMember(userId, workspaceId);   // auth gate
if (!member) return 403;
const { account } = await getAccount(workspaceId);       // workspace-scoped fetch
// downstream queries filter by { adAccountId: account.id } or { id: x, adAccountId: account.id }
```

---

## 🔴 Risky Findings (require remediation)

### R-1. Global-scope AdAccount upsert during OAuth/connect flows
**Locations:** `src/api/server.ts:2724`, `src/api/server.ts:2828`, `src/api/server.ts:3006`

```ts
const existing = await prisma.adAccount.findFirst({
  where: { platform: 'META', externalAccountId: account.id },   // ⚠️ no workspaceId
});
if (existing) {
  await prisma.adAccount.update({
    where: { id: existing.id },
    data: { ...newTokens, workspaceId, /* ... */ },              // ⚠️ workspaceId overwritten
  });
}
```

**Risk:** If the same Meta ad account (`act_12345`) is connected to two different Adlytic workspaces (User A in Workspace A, User B in Workspace B who both have Meta access to the same business asset), then whoever reconnects last **takes ownership** of the row, and the other workspace loses access — silently.

**Impact:** Account hijack between Adlytic workspaces. Even if "one workspace per ad account" is the product invariant, the current code does not enforce it: there is no explicit error like "this Meta ad account is already linked to a different Adlytic workspace."

**Severity:** High in a multi-tenant production environment. Today's beta likely has zero collisions; with sold customers, it's a matter of time before two of them share access to the same agency-managed ad account.

**Recommended fix (Phase 6c or earlier if launching paid):**
```ts
const existing = await prisma.adAccount.findFirst({
  where: { platform: 'META', externalAccountId: account.id },
});
if (existing && existing.workspaceId !== workspaceId) {
  return c.json({
    error: 'This Meta ad account is already connected to a different Adlytic workspace. Contact support to transfer it.',
    code: 'ACCOUNT_ALREADY_LINKED_ELSEWHERE',
  }, 409);
}
// then proceed with workspace-scoped upsert as normal
```

This is a 3-line change at each of the three sites. Suggest folding it into a `findOrAssertOwnedAdAccount(workspaceId, externalId)` helper to keep the three sites in lock-step.

---

## 🟡 Indirectly Safe (document the guard, no code change needed)

### S-1. `workspaceMember.delete({ where: { id: memberId } })`
**Location:** `src/api/server.ts:1498`

The delete uses only `memberId`. **Guarded** by line 1481 immediately above:
```ts
const target = await prisma.workspaceMember.findFirst({
  where: { id: req.params['memberId'], workspaceId: req.params['workspaceId'] },
});
if (!target) return c.json({ error: 'Member not found' }, 404);
```
The find-then-delete forms a validate-then-mutate guard. The TOCTOU window (between find and delete) is benign in this app's semantics. ✅ No change needed.

### S-2. `oAuthState.delete({ where: { state } })`
**Location:** `src/api/server.ts:610`

Uses the cryptographically random `state` nonce, which is single-use and high-entropy. Equivalent to a UUID — not cross-tenant exploitable. ✅

### S-3. `oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } })`
**Location:** `src/api/server.ts:597`

System-level expiry cleanup. Acts on global state by design. ⚪

### S-4. User-scoped operations (`user.update`, `user.delete`)
**Locations:** `src/api/server.ts:668, 732, 755, 768, 1020, 849`

Every call uses `where: { id: <authenticated userId> }` or admin-only routes (the admin endpoint at 984/1020 is itself guarded by an admin role check). ✅

### S-5. Account deletion cascade
**Location:** `src/api/server.ts:3065–3094` (workspace-scoped account delete)

Line 3065 first verifies ownership:
```ts
const acct = await prisma.adAccount.findFirst({ where: { id: accountId, workspaceId } });
```
All subsequent `deleteMany` calls use `entityId: accountId` or `entityId: { in: campaignIds }` where `campaignIds` was derived from the workspace-scoped `acct`. ✅

### S-6. Workspace deletion cascade (user.delete path)
**Location:** `src/api/server.ts:812–845`

Line 812 fetches the user's owned memberships, then iterates and deletes. All cascading deletes (rawInsight, dailyStat, etc.) use `entityId: acct.id` where `acct` came from a user-scoped iteration. ✅

### S-7. Campaign / AdSet / Ad / DailyStat / HealthScore / Recommendation / DetectedIssue findMany
**Locations:** Many sites in `src/api/server.ts:1515, 1605, 1955, 1997, 2036, 2074, 2096, 2246, ...`

All accessed via the standard pattern: `checkMember` → `getAccount(workspaceId)` → query filtered by `{ adAccountId: account.id }` or `{ entityType, entityId: account.id }` or `{ entityType, entityId: campaign.id }` where `campaign` itself was validated against `account.id`. ✅

### S-8. `prisma.metaConnection.findUnique` followed by workspace check
**Location:** `src/api/server.ts:2720–2722`

```ts
const connection = await prisma.metaConnection.findUnique({ where: { id: session.connectionId } });
if (!connection || connection.workspaceId !== workspaceId) {
  return c.json({ error: 'Connection not found for this workspace' }, 404);
}
```
Validate-then-act pattern, explicit. ✅

---

## ⚪ System-Level (no user input; safe by design)

### N-1. Token refresh cron
**File:** `src/workers/refreshMetaTokens.ts:75, 84, 25, 43, 135`

Iterates all ad accounts with expiring tokens globally and refreshes. No user input. ✅

### N-2. IQD currency repair
**File:** `src/lib/iqdRepair.ts:163, 195, 219, 229, 237, 279, 296`

System maintenance: heals legacy currency rows globally. No user input. ✅

### N-3. Raw insights retention sweep
**File:** `src/api/serve.ts:252`

```ts
prisma.rawInsight.deleteMany({ where: { ingestedAt: { lt: cutoffDate } } })
```
Time-based purge across all tenants. By design. ✅

### N-4. Brain narration cron
**File:** `src/workers/brainNarrationCron.ts:91, 145, 158, 175, 204, 234, 250`

Iterates `campaignBrainSnapshot` rows globally and writes narration. System-level, no user input. ✅

### N-5. History rollup cron
**File:** `src/workers/rollupHistory.ts:196, 204`

Cross-workspace history rollup. By design. ✅

### N-6. Sync worker queries
**File:** `src/workers/syncAccount.ts:324, 382, 416, 472, 485, 540, 640, 893, 1072, 1105, 1179, 1231, 1245`

All queries filter by `adAccountId` (the worker is invoked with a validated adAccountId from a SyncJob). The SyncJob row itself is created by a workspace-scoped route. ✅

### N-7. Engines (Health, Analytics, Knowledge, Rules, Recommendation, Intelligence)
**Files:** `src/engines/*/*.ts`

Engines are called by sync flows with a known `accountId`/`campaignId`. All internal queries scope by these IDs. The intelligence/knowledge rules tables are intentionally global (universal rules). ✅

### N-8. AI Context builders
**Files:** `src/services/v2ContextAssembler.ts:133, 140, 179, 186`, `src/services/aiContextBuilderV5.ts:112`

Take `adAccountId` / `campaignId` as input from already-scoped routes. ✅

### N-9. Initial bootstrap account loader
**File:** `src/api/serve.ts:116`

```ts
accounts = await prisma.adAccount.findMany({ where: { /* active accounts */ } });
```
Boot-time iteration for the auto-sync loop. No user input. ✅

---

## ✅ Safe Patterns (canonical examples to copy)

| Pattern | Example | Why |
|---|---|---|
| Workspace + entity composite | `{ id: req.params['campaignId'], adAccountId: account.id }` | Both keys; `account.id` came from workspace-scoped `getAccount` | server.ts:1597 |
| Workspace-direct | `{ workspaceId }` | Direct foreign-key scope | getCampaignHistory.ts:127 |
| EntityId from validated parent | `{ entityType, entityId: campaign.id }` after composite lookup | Transitive scope through validated campaign | server.ts:1606 |
| Self-only | `{ id: <authenticated userId> }` | User can only mutate themselves | server.ts:732 |

---

## Summary

| Severity | Count | Action |
|---|---|---|
| 🔴 Risky | **1** (three call sites of the same pattern) | Fix before paid-tier launch |
| 🟡 Indirectly safe | 8 | Document; no code change |
| ⚪ System-level | 9 | Document; no code change |
| ✅ Safe | majority | Pattern is well-established |

**Bottom line:** The codebase is *substantially* multi-tenant-safe at the data-access layer. The one real finding (**R-1: cross-workspace ad-account hijack via globally-scoped upsert**) is a 3-line fix at three near-identical sites. Recommend folding into Phase 6c (multi-tenant hardening) or fast-tracking before the first paying customer who shares Meta agency access.

**Not in scope of this audit (separate work items):**
- Authorization at the resource level (role checks: VIEWER vs MANAGER vs OWNER) — partially audited; full audit is its own task.
- Race conditions during concurrent writes (e.g. two members updating workspace settings simultaneously) — Phase 6c with `SELECT FOR UPDATE` or optimistic concurrency.
- Rate limiting per workspace — Phase 6b (depends on Redis being available).
- API surface authentication coverage (every route guarded) — assumed verified by route-by-route eyeball; spot-checks consistent.
