# 06 — Native Mobile UX

## What "native" actually obliges

Native is not a visual style. It is a set of promises the operating system has
already made to the user on our behalf, which we are not free to break.

| Promise | Obligation |
|---|---|
| Gestures work | Edge-swipe back on both platforms. Not a decoration — muscle memory. |
| Scroll feels physical | Momentum, rubber-band, and it must never be re-implemented in JS. |
| The keyboard is respected | Content scrolls above it, focused field stays visible, sheets resize. |
| Sheets are draggable | Detents, a grabber, dismiss by drag. A fixed modal that only closes by a button reads as a web page. |
| Safe areas are honoured | Notch, dynamic island, home indicator, and the *keyboard* inset. |
| Tap feedback is immediate | Under 100ms, always, even when the network response is seconds away. |
| The system decides some things | Text size, reduce motion, contrast, dark mode. We follow; we do not override. |
| Back means back | The Android hardware back button follows the same stack as the visual one. |

## What the current web layout must stop doing

Named because the prototype does each of them.

| Web habit | Native replacement |
|---|---|
| A `<div>` scroll container per screen | One native scroll view per screen, with sticky headers as a platform primitive |
| Full-page navigation on tap | Stack push with the platform transition and interactive back |
| Fixed bottom bar overlaying content | Real tab bar with correct safe-area inset and content inset |
| `alert()` / `confirm()` | Native alert with destructive-action styling and the correct button order per platform |
| A custom overlay for choices | Action sheet |
| Toast rolled by hand | Snackbar (Android) / transient banner (iOS), with an undo affordance where the action is reversible |
| Hover states | There is no hover. Pressed and long-press states instead. |
| `100vh` | Safe-area-aware layout. `100vh` is wrong on every iOS device with a keyboard open. |
| An input at 14px | 16px minimum, or iOS zooms the viewport and the user loses the page |
| Spinners for everything | Skeletons matching final layout; spinners only for indeterminate waits under a second |

## Layout system

**Spacing: 4pt grid.** Tokens `space.1` = 4 … `space.10` = 48. No arbitrary
values. Every raw number in a stylesheet is a future inconsistency.

**Touch targets: 44×44pt minimum, 48 preferred for primary actions.** In the
pharmacy app, where the device is used one-handed at speed, primary actions are
**56pt** and sit in the bottom third of the screen.

**Type scale, Arabic-tuned:**

| Role | Size | Line height | Note |
|---|---|---|---|
| Display | 34 | 1.25 | Numbers and codes only |
| Title | 22 | 1.4 | Arabic needs more than Latin here |
| Headline | 17 | 1.5 | |
| Body | 16 | 1.65 | Never below 16 |
| Caption | 13 | 1.6 | Never for anything clinical |

`letter-spacing: 0` everywhere. Always. Arabic is connected; tracking it breaks
the joins. This is not a preference that a designer may override.

## Arabic-first native specifics

RTL is where most "native" ports quietly fail.

1. **Mirror the whole layout, not the strings.** Back chevrons point right.
   Progress fills right-to-left. Swipe-back is from the right edge. Charts read
   right-to-left.
2. **Do not mirror everything.** Media controls, clock faces, and anything
   representing physical direction of travel stay as they are. Mirroring a play
   button is a bug, not localisation.
3. **Isolate every foreign run.** Latin drug names, dosages, prices, phone
   numbers, and codes each get bidi isolation. Without it, a price next to
   Arabic text reorders and the user reads the wrong number.
4. **One numeral system per surface.** Pick Arabic-Indic or Western and hold
   it. Iraqi users read both fluently; mixing them inside a single comparison
   is a defect. Make it a user preference, applied globally, never mixed.
5. **Test the longest real string, not the label.** Arabic medicine names and
   pharmacy names run long. Layouts must survive them without truncating the
   part that identifies the item.
6. **Fonts must be Arabic-first.** A Latin-first stack with Arabic fallback
   produces inconsistent weights and broken joins mid-sentence.

## Motion

**Rule: every animation must answer "what did this teach the user?" If the
answer is nothing, it is latency wearing a costume.**

| Motion | Duration | Teaches |
|---|---|---|
| Stack push/pop | Platform default | Where you are in the hierarchy |
| Sheet present | 300ms, platform spring | This is temporary and layered over |
| Safety bar morph | 380ms | It is the *same* bar changing state, not a new one arriving |
| Blister strip depletion | 500ms ease | Your supply is finishing |
| Skeleton to content | 150ms cross-fade | The wait is over |
| Undo snackbar | 4s dwell | You still have time |

All of it suppressed under `prefers-reduced-motion`, which on iOS means
cross-fade rather than nothing at all.

## Platform-specific divergence

We do not build one UI and ship it twice.

| Concern | iOS | Android |
|---|---|---|
| Primary navigation | Tab bar, bottom | Navigation bar, bottom |
| Secondary actions | Context menu on long-press | Overflow menu |
| Destructive confirm | Action sheet, red text, cancel last | Alert dialog, cancel left |
| Create action | Prominent tab-bar item or toolbar button | FAB |
| Refresh | Pull-to-refresh | Pull-to-refresh + swipe refresh indicator |
| Share | Share sheet | Share intent |
| Date entry | Wheel | Material picker |
| Haptics | Impact / notification feedback | Vibration effect |
| Wallet | Add to Apple Wallet | Add to Google Wallet |

## The three personas' visual languages

| | Patient | Pharmacy | Owner |
|---|---|---|---|
| Ground | Warm light paper | Deep green-black | Neutral surface |
| Density | Generous — one decision per screen | Dense — many decisions visible | Tabular — comparison first |
| Accent | Calm mint | High-contrast lime | Functional blue |
| Type | Larger, more line height | Compact, tabular numerals | Tabular throughout |
| Motion | Present and reassuring | Minimal — speed is the feature | Almost none |
| Emotional target | Calm | Fast | Certain |

These share **tokens and primitives**, never components with a persona branch.
A component that reads `if (persona === …)` is where the separation begins to
rot; it is a lint error.

## Native capabilities to use properly

| Capability | Use |
|---|---|
| Camera | Prescription capture, with live edge detection and a retake path |
| Push (APNs/FCM) | Offer arrived, hold confirmed, expiring soon, dose due |
| Live Activity / ongoing notification | The reservation countdown, on the lock screen where it belongs |
| Wallet | The reservation pass as a real pass |
| Biometrics | Unlock the clinical record on a shared device |
| Secure enclave / keystore | Tokens and any cached clinical data |
| Background fetch | Refresh offers while the app is closed |
| Maps | Native map, native directions handoff |
| Share | Export a record |
| Shortcuts / App Actions | "Reorder my mother's medicine" |
| Widgets | Next dose, active reservation |

**Live Activity is the highest-value native feature in this list.** The
reservation countdown belongs on the lock screen — that is precisely the moment
the patient is anxious and looking at their phone.
