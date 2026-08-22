# 06 — Meta capability and permission closure

No new capability system was built; the existing one was audited.

## Status vocabulary

`AVAILABLE` · `UNAVAILABLE` · `NOT_GRANTED` · `NOT_TESTED` ·
`CRITERION_INVALIDATED` · `UNKNOWN`

`NOT_TESTED` is **not** collapsed into `UNAVAILABLE` — a probe that never ran
is a different fact from one that ran and failed. The admin status primitive
(`web/pages/adminStatus.ts`) enforces the visual distinction too: `NOT_TESTED`
renders dashed and muted, `UNAVAILABLE` renders as a solid failure, and
`test_admin_os` asserts they cannot render identically.

## Authority scope

Adlytic remains a **read-only** Meta intelligence product. Intended authority
is `ads_read`. The period-insight read added during this closure uses the same
scope, the same transport and the same client — it is an extra query, not a new
capability. No `ads_management`, no `business_management`, and no Meta mutation
control exists in any admin surface (asserted by the Observatory write traps
and the admin containment tests).

## Token handling

```
TOKEN_URL_RISK = CLOSED
```

`MetaClient` sends the token in an `Authorization: Bearer` header and never in
a query string. **One call site violated that**: `server.ts`'s manual-connect
verification hand-rolled a `fetch` with `access_token=` in the URL, so a
thrown fetch error would have carried the token into that handler's own
`console.warn`, plus any proxy log or error tracker along the way. Fixed to use
the header, matching the canonical convention. A regression test asserts no
token appears in a URL anywhere in `src/`.

`metaCapabilityProbe.ts` redacts `access_token=` from any echoed URL before it
reaches a capability matrix, because such a matrix is a document people paste
around.

Raw tokens live only under the canonical encrypted ownership
(`services/tokenEncryption.ts`); nothing else persists them.

## API version

Pinned through `config.meta.apiVersion` and registered as a dependency in
`intelligence/metaDependencyGraph.ts`, so a version bump surfaces in
`test_dependency_drift` rather than as a silent behaviour change.
