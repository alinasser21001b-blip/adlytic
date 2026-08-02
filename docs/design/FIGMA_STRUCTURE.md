# Figma Structure

How the file must be organised for Engineering to consume it without asking
questions. The constraint driving all of this: **the code is organised by
screen contract and screen state, and the review dashboard photographs exactly
those.** A Figma organised differently forces a manual translation step on every
handoff, and that step is where drift starts.

---

## 1. File and page structure

```
Dawai — Patient App
├── 00 · Cover                    version, date, status, what changed
├── 01 · Foundations              tokens: colour, type, space, radius, elevation, motion
├── 02 · Components               the component library (see §3)
├── 03 · Screens · Entry          E1–E13
├── 04 · Screens · Find           F1–F8
├── 05 · Screens · Request        R1–R13
├── 06 · Screens · Reservation    V1–V8
├── 07 · Screens · Subjects       S1–S12
├── 08 · Screens · Account        M1–M15
├── 09 · Flows                    the journeys, as flows rather than screens
├── 10 · Motion                   transition specifications
└── 11 · Handoff notes            open questions, decisions, Blueprint queries
```

Page groups **mirror the Blueprint's own screen groups** (`Entry`, `Subjects`,
`Find`, `Request`, `Reservation`, `Account`, `Pharmacy apply`, `Pharmacy`,
`Operator`). Those group names come from `docs/product/v3/phase0.js` and are the
same names used in `SCREEN_INVENTORY.md`, the review dashboard and the code.

The Pharmacy (31 screens) and Operator (24 screens) groups are out of scope for
this handoff — the patient app is what exists. They will need their own file,
using the same structure and a **different persona palette** (the design system
already declares three: patient/calm, pharmacy/fast, owner/certain).

---

## 2. Frame naming — this one is not negotiable

```
<ScreenId> · <state>
```

Examples, matching the ids Engineering already uses:

```
F2 · results
F2 · loading
F2 · empty
F2 · offline
F2 · error
R9 · consent-outstanding
V2 · held
V2 · cached
V2 · nearly-expired
```

**Why exactly this:** the review dashboard's screenshots are named
`<screen>-<state>.png` and the shared screen registry keys states by the same
id. Matching names means a design frame and its built screenshot can be placed
side by side automatically. Mismatched names mean a person does the matching, by
eye, every review.

The screen ids are fixed by Blueprint v3. **Do not rename them, do not
prettify them, do not drop them from the frame name.** `Search Results` is not
an acceptable substitute for `F2 · results`.

Every state listed in `SCREEN_INVENTORY.md` for a screen needs a frame. A screen
with four declared states and one frame is an incomplete delivery.

---

## 3. Component library structure

```
02 · Components
├── Foundations
│   ├── Label            (5 type roles × colour roles)
│   ├── Digits           (tabular)
│   └── Bidi             (Latin-in-Arabic isolation examples)
├── Actions
│   ├── Primary          default / pressed / disabled / busy
│   ├── Secondary        default / pressed
│   ├── Choice           selected / unselected / pressed
│   └── IconButton       default / pressed / disabled
├── Containers
│   ├── InfoCard         default / muted
│   ├── ActionCard       default / pressed / muted
│   └── Sheet            modal chrome — DOES NOT EXIST YET
├── Navigation
│   ├── Header           with back / without back / with progress
│   ├── TabBar           DOES NOT EXIST YET
│   └── Footer           one action / action + explanation / none
├── States
│   ├── Skeleton         list / detail / form
│   ├── Empty            teaching / quiet
│   ├── Error
│   ├── Offline
│   └── PermissionRefused
└── Inputs
    ├── TextField        DOES NOT EXIST YET — default/focus/error/disabled
    └── Stepper          default / at floor
```

Component names must match `apps/patient/src/ui/kit.tsx` exactly where a
component already exists. `Primary`, `Secondary`, `Choice`, `ActionCard`,
`InfoCard`, `Label`, `Digits`, `Bidi`, `Screen`, `StateBlock`, `RedirectNote`.
A rename in Figma becomes a rename in code, which is a real cost for no gain.

**Every component must use variants, not separate frames**, with property names
matching the code's props: `disabled`, `busy`, `selected`, `muted`.

---

## 4. Foundations page — how tokens must be expressed

**Colours as semantic styles, never as raw hexes on layers.** The style names
must be the 15 role names already in the code:

```
surface · surfaceRaised · surfaceSunken · line
ink · inkMuted · inkSubtle
accent · onAccent
success · onSuccess
warning · onWarning
alert · onAlert
```

Two modes (light, dark) via Figma variables. Engineering maps them
mechanically into `packages/design/src/tokens/color.ts`; a role that exists in
Figma and not in code, or vice versa, is a build failure the contrast test will
surface immediately.

**Type styles named by role**, not by size: `display`, `title`, `headline`,
`body`, `caption`. Each carries size, line-height, weight, and letter-spacing 0.
Two of the five (`display`, `caption`) are barred from clinical content in code —
label them so in Figma, because a designer setting a dosage in `caption` is
writing an unbuildable design.

**Spacing as variables** on the existing 4pt scale: `0 4 8 12 16 20 24 32 40 48 64`.
Named `space-0` … `space-10` to match the code's numeric keys.

**Radius:** `sm 8 · md 12 · lg 16 · xl 22 · pill 999`.

**Tap targets:** `min 44 · patientPrimary 48 · pharmacyPrimary 56`. Show these
as a visible overlay on at least one screen per group, because the build
measures every control against them.

**Elevation:** all five levels (`flat`, `raised`, `overlay`, `sheet`, `alert`) —
currently declared in code and never specified.

---

## 5. Motion page

One frame per motion token, each showing: the property animated, duration,
easing as **cubic-bézier numbers** (not a curve name — "spring" is not
implementable without values), and the reduced-motion fallback.

The eight tokens and what each is documented to teach:

| Token | Duration | Teaches |
| --- | --- | --- |
| `screenPush` | 350ms | where you are in the hierarchy |
| `sheetPresent` | 300ms | this is temporary and layered above |
| `sheetDrag` | 1:1 with the finger | you are in control of it |
| `skeletonToReal` | 150ms | the wait is over |
| `responderArrive` | 200ms | someone answered, just now |
| `doseConfirmed` | 250ms | it was recorded |
| `undoDwell` | 4000ms | you still have time |
| `errorShake` | 200ms | that input, not another |

Durations may be changed. What may not be dropped is the *teaching purpose* —
each token exists to communicate something specific, and a motion that does not
communicate it is decoration.

---

## 6. Flows page

One flow per journey, using the same step ids the code uses. The patient
request flow is declared in `packages/navigation/src/flow.ts` as:

```
R1 → R2 (optional) → R6 → R7 → R8 → V1 ⇒ V2
abandons to S1
```

Show, for each flow: the screens in order, the optional steps, where success
lands, where abandonment lands, and the guard redirects (a guest touching a
protected action goes to E4 with the reason and the pending action preserved).

---

## 7. Handoff notes page

Three columns, kept live for the duration of the engagement:

- **Open questions** — anything the designer needs from Product or Engineering.
- **Decisions made** — with a date, so an argument settled once stays settled.
- **Blueprint queries** — anything the design wants to change that §8 of
  `DESIGN_HANDOFF_REQUIREMENTS.md` lists as frozen. These are raised, not
  absorbed.

---

## 8. Delivery hygiene

- **Auto-layout everywhere.** Engineering reads padding and gap off the layer;
  an absolutely-positioned design has to be measured by hand, and measurements
  taken by hand are wrong.
- **All spacing on the 4pt scale.** A 6pt gap in Figma becomes an argument in code.
- **No detached instances** in delivered screens. A detached component is a
  divergence nobody notices until it ships.
- **RTL is the design direction.** Do not design in LTR and mirror later; Arabic
  line lengths, wrapping and the position of Latin drug names are all different,
  and the mirror step is where RTL bugs are born.
- **Real Arabic content**, from the built screens. `Lorem ipsum` hides the two
  problems that matter: Arabic runs longer than English, and drug names are
  Latin runs inside Arabic sentences.
- **Every frame at 390pt**, plus the 320pt and 430pt variants required by R-21
  for the densest screens (R8, R9, V2, R1).
