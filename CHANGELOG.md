# Changelog

Version numbers in this file are injected from `release-manifest.yaml` by
`tools/release/generate.mjs`. Do not type one by hand.

## Platform {{platform}} — {{status}}

### Added
- Release governance framework. `release-manifest.yaml` is the sole
  operational source of truth for release identity, compatibility, governance
  policy, approved runtime configuration, verification status, and artifacts.
- Ten independent validators (`tools/release/validate.mjs`) plus a generator
  (`tools/release/generate.mjs`) that produces every human-readable release
  document and can prove the outputs were not hand-edited.
- UI claim bindings: elements rendering clinical outputs carry the claim,
  contract, and knowledge release they render, verified against the manifest.
- `dawai-site/dawai-ui-kit.html` — single-file UI reference, 23 screens.
- `dawai-site/release-governance.html` — governance dashboard, rendering
  entirely from generated data.

### Changed
- `safety-alert` contract to `3.0.0` (breaking).
