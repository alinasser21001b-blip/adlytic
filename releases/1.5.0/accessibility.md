# Accessibility Verification — Dawai Platform 1.5.0

Manifest: `release-manifest.yaml` · Policy: 1.0.0
Verified by: `ci:ui-kit-verify@workflow-v1`
Tool: playwright-chromium build 1194
Scope: `dawai-site/dawai-ui-kit.html`, 23 screens, viewports 390px and 320px,
flags snapshot `flags-2026-08-02-01`.

## Method

A headless Chromium run navigated to every screen id via `go()` and asserted,
per screen and per viewport:

- zero `pageerror` and zero `console.error`
- `documentElement.scrollWidth <= clientWidth` (offending element reported on
  mismatch)
- every `button`, `a`, `[role=button]`, `input`, `select` at >= 44 x 44 px,
  excluding the dev-navigation bar
- every `input`, `textarea`, `select` at a computed `font-size` >= 16px
- every interactive element carries a non-empty accessible name
- no duplicate element ids
- every `onclick` / `onchange` / `oninput` handler resolves to a real function
- every `go('...')` target id exists in the document

## Result: PASS

Final run reported no failures other than an `ERR_CONNECTION_RESET` on the
Google Fonts request, which is the sandbox blocking external egress. The
documented system font stack is the fallback and renders correctly.

## Defects found and fixed during verification

| # | Defect | Fix |
|---|---|---|
| 1 | Horizontal overflow of 18px on all six pharmacist screens at both 390px and 320px. `.rx` used `margin:0 -1.15rem` as a full-bleed trick inside a container that has no horizontal padding, so the background box extended past the viewport on both sides. | Removed the negative margin. Horizontal padding is now owned solely by `.top` and `.pad`. |
| 2 | Account button rendered at 42 x 42 px, below the 44px touch-target floor. The size came from an inline `style` attribute, which also bypassed the token system the file mandates. | Replaced with an `.avatar` component class sized from `var(--tap)`. |
| 3 | Headings fell back to bare `sans-serif` when Noto Kufi Arabic failed to load. | Added `system-ui` to the heading stack. |

## Not covered by this gate

Keyboard traversal and focus management are verified separately under the
`keyboard` gate, which is still pending. Screen-reader announcement order has
not been verified by a human on a real assistive stack.
