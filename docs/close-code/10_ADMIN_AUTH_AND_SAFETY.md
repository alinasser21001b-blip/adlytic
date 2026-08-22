# 10 — Admin authorization and route safety

```
ADMIN_AUTHORIZATION_GAPS      = 0
ADMIN_DESTRUCTIVE_ACTION_SAFETY = PASS
```

## Coverage

Every one of the 40 `/api/admin/*` routes has `requirePlatformAdmin` within
its handler. Every `/admin/*` page route goes through the `adminPage` gate —
**except `/admin/login`**, which must stay public because gating the login
door locks everyone out. Both facts are now asserted in `test_admin_os.ts` §3.

That matters because they were already true. Nothing *enforced* them, so route
41 would have been guarded only if someone remembered. The rule is now
mechanical.

## Server-side, not UI-side

A page that hides a control is not a guard. `test_admin_os` asserts no admin
page branches on admin-ness client-side (`isPlatformAdmin ?`,
`role === 'admin'`); the decision belongs to the route, which refuses before
rendering. Deep links are therefore protected identically to navigation.

## Workspace admin ≠ platform admin

`requirePlatformAdmin` checks platform-admin identity
(`api/adminGuard.ts::isPlatformAdminEmail`), which is distinct from workspace
membership or a workspace-level role. A workspace admin cannot enumerate
platform-wide operational data.

## Destructive routes

Account data purge funnels through `services/accountDataPurge.ts` and is
reachable only from a `PRIVILEGED_MUTATION` admin surface behind
`requirePlatformAdmin`. Read-only surfaces — the Brain Observatory in
particular — cannot invoke it: the Observatory is asserted to make no write of
any kind, including through raw SQL and `$transaction`.

## Not closed

No audit trail of privileged actions exists. This is why the admin IA has **no
SECURITY_AND_AUDIT section** — rendering the heading over settings and payment
events would claim a capability the platform does not have. Recorded in doc 13
with its reopening trigger.
