# 12 — Permission Matrix

## Principals

| Principal | Is |
|---|---|
| `patient` | An account acting on its own record |
| `proxy:VIEW` | A family member who may read a subject's record |
| `proxy:ORDER` | …and may request and reserve on their behalf |
| `proxy:CONFIRM` | …and may confirm dose events |
| `pharmacy:assistant` | Counter staff, unlicensed |
| `pharmacy:pharmacist` | **Verified licensed** pharmacist |
| `pharmacy:manager` | Branch operations |
| `pharmacy:owner` | Pharmacy account owner |
| `owner:support` | Platform support |
| `owner:clinical` | Platform clinical governance |
| `owner:admin` | Platform administration |
| `system` | Scheduled jobs and internal callers |

**Proxy scopes are additive and ordered:** `VIEW < ORDER < CONFIRM`. A grant is
two-sided (requested and approved), revocable at any time by the subject,
scoped, and audited. Revocation withdraws the permission; it never deletes the
record of the grant having existed.

## Clinical data

| Action | patient | VIEW | ORDER | CONFIRM | pharmacist | manager | support | clinical | admin |
|---|---|---|---|---|---|---|---|---|---|
| Read own timeline | ✓ | — | — | — | — | — | — | — | — |
| Read subject timeline | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ⚠ | ⚠ | ✗ |
| Append dose event | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Create schedule | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Upload prescription | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Read prescription image | ✓ | ✗ | ✗ | ✓ | ⚠ | ✗ | ⚠ | ⚠ | ✗ |
| Edit or delete a clinical record | **✗ nobody** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Append a correction | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ⚠ | ✗ |
| Read allergies | ✓ | ✓ | ✓ | ✓ | ⚠ | ✗ | ✗ | ⚠ | ✗ |

✓ permitted · ✗ denied · ⚠ permitted only under a named condition, below

**Conditions on ⚠:**
- `pharmacist` reads a prescription image **only while a hold is active** for
  that request, and only that image. Access ends with the hold.
- `pharmacist` reads allergies **only for the medicine being dispensed**, never
  the full list.
- `support` reads anything identified **only inside a consented, time-boxed
  support session** with a banner visible to the user, fully logged.
- `clinical` reads **de-identified** data by default. Identified access
  requires a recorded reason and appears in the patient's own access log.
- `clinical` may append a correction **only through Clinical Records**, with
  attribution. There is no direct write path.

**Nobody edits or deletes a clinical record. There is no role for it, no
break-glass for it, and no endpoint for it.**

## Reservations

| Action | patient | ORDER | assistant | pharmacist | manager | support | admin |
|---|---|---|---|---|---|---|---|
| Create request | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| See requester identity before selection | — | — | **✗** | **✗** | **✗** | ⚠ | ✗ |
| Send offer | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Decline with reason | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Select an offer | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Confirm hold** | ✗ | ✗ | **✗** | **✓** | ✗ | ✗ | ✗ |
| Refuse hold with reason | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Verify pickup code | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Cancel | ✓ | ✓ | ✗ | ✗ | ✗ | ⚠ | ✗ |
| Extend a hold | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✗ |

**Only a verified pharmacist may confirm a hold.** This is the single most
important row in this document. The prototype allowed an unverified account on
an unverified pharmacy to stamp pharmacist authorship on clinical records — a
reproduced exploit, and the reason this row is enforced at the service layer
against a credential rather than at the route against a token claim.

**No pharmacy principal sees requester identity before selection.** Not by
policy, but because the projection served to the pharmacy does not contain it.

## Inventory

| Action | assistant | pharmacist | manager | owner | admin |
|---|---|---|---|---|---|
| Record a movement | ✓ | ✓ | ✓ | ✓ | ✗ |
| Record a spot count | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Set a quantity directly** | **✗ nobody — no such operation exists** | ✗ | ✗ | ✗ | ✗ |
| Edit or delete a movement | ✗ | ✗ | ✗ | ✗ | ✗ |
| Read own branch stock | ✓ | ✓ | ✓ | ✓ | ⚠ |
| Read another pharmacy's stock | ✗ | ✗ | ✗ | ✗ | ⚠ |

## Platform administration

| Action | support | clinical | admin |
|---|---|---|---|
| Approve pharmacy verification | ✗ | ✗ | ✓ |
| Suspend a pharmacy | ✗ | ⚠ safety only | ✓ |
| Start a consented support session | ✓ | ✗ | ✓ |
| Publish a knowledge release | ✗ | ✓ | ✗ |
| Withdraw a clinical claim | ✗ | ✓ | ✗ |
| Change an interaction rule | ✗ | ✓ | ✗ |
| Toggle a clinical-safety feature flag | ✗ | ✓ two-person | ✗ |
| Toggle an operational feature flag | ✗ | ✗ | ✓ |
| Send a broadcast notification | ✗ | ⚠ safety only | ✓ two-person |
| Read the audit log | ✓ own actions | ✓ | ✓ |
| **Modify the audit log** | **✗ nobody** | ✗ | ✗ |
| Grant a role | ✗ | ✗ | ✓ two-person |
| Deactivate a user account | ⚠ with ticket | ✗ | ✓ |
| Export platform data | ✗ | ⚠ de-identified | ✓ two-person |

**Two-person actions require a second admin's approval before they take
effect.** Anything that can reach every user at once — a broadcast, a role
grant, a bulk export — is not a single person's decision.

## Enforcement

| Layer | Enforces |
|---|---|
| **Client** | Nothing. Hidden UI is not a permission. |
| **Gateway** | Token audience matches the persona of the endpoint; rate limits; idempotency |
| **Service** | Every authority check, on every call path, including internal callers |
| **Projection** | Pharmacy-facing views do not *contain* patient identity — it cannot leak because it is not there |
| **Database** | Row-level constraints; append-only enforced by permission, not by convention |
| **Audit** | Every access to identified clinical data, whether or not it was permitted |

**Four rules that this matrix depends on:**

1. **Authority is checked in the service, not the route.** Route middleware
   gets bypassed the first time an internal caller is added.
2. **A missing link returns 404, not 403.** 403 confirms the record exists,
   turning any lookup into an identity oracle. The prototype's `GET /family`
   did exactly this.
3. **Least privilege wins on ambiguity.** Where multiple grants could apply,
   the narrowest is used — never the first found, and never the widest.
4. **A check that returns a boolean will eventually be ignored.** Authority
   functions throw; they do not return `false` for a caller to forget to
   handle.
