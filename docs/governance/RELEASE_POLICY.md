# Dawai Release Policy

**Policy version: 1.0.0**

> **The release manifest is the sole source of truth for release identity,
> compatibility, governance policy, approved runtime configuration,
> verification status, and release artifacts. All human-readable release
> documents are generated from it or cryptographically linked to it.**

And the clinical invariant it exists to protect:

> **A clinical output is valid only when code, contract, knowledge, evidence,
> verification, and runtime configuration reference mutually compatible,
> approved versions.**

## Structure

```
release-manifest.yaml          ← the only source of truth
        │
        ├── VERSION                      generated
        ├── CHANGELOG.md                 generated / auto-updated
        ├── releases/<v>/compatibility.md generated
        ├── releases/<v>/RELEASE_NOTES.md prose by humans, numbers injected
        ├── dawai-site/release-data.js    generated (governance dashboard)
        ├── release evidence index        linked by hash
        ├── CI validation inputs          read from manifest
        └── deployment metadata           read from manifest
```

Never write a `Platform` version, a `Knowledge Release`, or a compatibility
range into two files by hand. Every reference number appearing in the
changelog, the release notes, the compatibility report, the dashboard, or the
deployment metadata is extracted from the manifest in CI.

Human-written documents may use the placeholder tokens `{{platform}}`,
`{{knowledge}}`, `{{policy}}`, `{{releaseId}}`, and `{{status}}`. The generator
fills them. This is the escape hatch that makes "never write a version number
twice" survivable in daily practice rather than aspirational.

## Policy version

`governance.policyVersion` separates **the release rules a release was judged
by** from the product components themselves.

| Change | Bumps `policyVersion` | Example |
|---|---|---|
| Wording of an internal guide, no executable effect | PATCH | Clarifying prose in the feature-flag policy |
| New CI check or new evidence type, backward-compatible with current releases | MINOR | Adding a stale-reference check |
| Changing a condition that determines release validity, or redefining mandatory evidence | MAJOR | Requiring a signed verification per gate before publication |

Platform 1.5.0 stays bound to Policy 1.0.0 permanently, even after the policy
becomes 2.0.0. **Do not rewrite history to make an old release appear to have
passed rules that did not exist when it shipped.** An audit trail that improves
retroactively is not an audit trail.

## Validators

Each validator is independent in what it checks, and every one receives the
same manifest as its reference input:

```
release-manifest.yaml
        │
        ├── validate-manifest-schema
        ├── validate-policy
        ├── validate-contracts
        ├── validate-knowledge
        ├── validate-evidence
        ├── validate-runtime
        ├── validate-feature-flags
        ├── validate-ui-claim-bindings
        ├── validate-verification
        ├── validate-artifacts
        └── generate-release-output
```

This does not mean a validator may not read an artifact the manifest names — it
means **paths, versions, and acceptance ranges come from one manifest**. For
example `validate-evidence` reads claims and their source records, but it
learns the required `Knowledge Release` and `Evidence Schema` from the
manifest, never from another compatibility file.

Every registered validator appears in the report even when it produced no
findings. A validator that threw, was renamed, or was quietly deleted must not
be indistinguishable from one that passed — that is how a gate silently
narrows.

```bash
node tools/release/validate.mjs            # gate for the current status
node tools/release/validate.mjs --release  # additionally assert releasability
node tools/release/generate.mjs            # write generated outputs
node tools/release/generate.mjs --check    # fail if outputs are stale/edited
```

## Auditable verification

`pass` alone is worthless a year later. Every verification gate stores:

| Field | Meaning |
|---|---|
| `status` | `pass` \| `fail` \| `pending` \| `not-applicable` |
| `verifiedAt` | ISO 8601 run or review time |
| `verifiedBy` | CI identity, workflow, or the responsible reviewer role |
| `evidence` | A stable path to a report that exists |
| `evidenceHash` | SHA-256 of the report contents |
| `toolVersion` | Version of the checking tool, where automated |
| `scope` | What was actually examined — screens, devices, flags, contracts |

The hash is the load-bearing field. It binds the verdict to the exact bytes of
the report, so a report cannot be revised after the gate opened. The generator
**reports** hash drift and never silently restamps it: a hash a script
refreshes on its own proves nothing, because the point is that a changed report
must be re-verified by a person.

This mirrors software-supply-chain provenance practice, where an attestation is
bound to an artifact digest so a claim cannot be transferred to a different
build than the one it was made about.

## UI claim binding

Every UI element that renders a clinical output declares which claim it is
rendering:

```html
<div class="pill"
     data-clinical-claim="CLM-INT-IBU-WARF-001"
     data-clinical-contract="interaction-check@2.1.0"
     data-knowledge-release="2026.08.1">
```

The UI does not use this data to decide whether a claim is valid. The UI
**only displays** an output produced by a verified contract and knowledge
layer. It carries the reference so an internal audit can walk from a screen to
the claim, its source, its reviewer, and its release without guessing.

`validate-ui-claim-bindings` enforces that every rendered claim exists, is not
withdrawn, cites a contract this release actually ships, and cites the active
knowledge release. **A withdrawn claim still rendered in the UI is the single
most dangerous defect this framework can catch**, and it is the one no amount
of code review reliably finds, because the withdrawal happens in a different
repository from the screen.

The binding attaches only to clinical outputs. Attaching it to operational copy
empties it of meaning: a claim reference asserts "this text passed clinical
review", and a reference that is sometimes decorative cannot be trusted when it
is not.

## Release rule

CI may not set `status: released` unless **all** of the following hold:

```
Manifest schema valid
Policy version supported
All declared contracts compatible
Knowledge release and evidence schema compatible
All published claims approved and evidence-complete
Runtime configuration hash matches the approved snapshot
Every required verification has a signed, hashed evidence file
All release-gate approvals completed
All generated artifacts match the manifest
```

A compatibility report carrying the word "Compatible" is never produced over a
release with incomplete verification. The report is quotable; an incorrect one
does more damage than none.

## Additional invariants enforced by the validators

- A **breaking clinical contract** cannot ship in a PATCH release. A breaking
  safety change concealed in a patch version is the most dangerous shape a
  release can take.
- A **published claim whose review date has passed** is not published — it is
  stale, and the validator forces it to `review-due`. Stale clinical content
  presented as current is the exact failure this framework exists to catch.
- A **feature flag with high clinical impact** may not be enabled in an
  approved snapshot. A `review-required` flag may not be enabled until the
  clinical approval is recorded.
- A **flag past its `removeBy` version** blocks the release. A flag with no
  `removeBy` is permanent complexity pretending to be temporary.
- A **generated file that no longer matches the manifest** blocks the release,
  whether it went stale or someone edited it. A hand-edited generated file is a
  second source of truth wearing a disguise.
