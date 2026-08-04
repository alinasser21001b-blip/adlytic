# 08 — Navigation

Navigation philosophy, the derived graph, back behaviour, guards, deep links, and
the tab/stack structure for all three apps.

---

## 1. The philosophy, in one principle

**Principle 2:** *the app must never feel like a collection of pages, and must
never dead-end.*

Hand-wiring navigation makes both of those a matter of vigilance. So:

> **The graph is derived from the screen contracts, never hand-wired.** An orphan
> screen and a trap become findable **graph properties**, and back behaviour is
> answered **once** rather than re-decided on every screen.
> — `packages/navigation/src/graph.ts`

Four consequences you can rely on:

1. Adding a screen contract adds a node. There is no second list to update.
2. `unreachable(graph)`, `traps(graph)` and `danglingExits(graph)` are functions
   a **test** calls, not a review checklist item.
3. `resolveBack` is the only implementation of "back" in the product.
4. A screen's position in a journey — *where am I, what came before, what comes
   next, how far along* — is derived by `progressAt()` from a declared flow, so
   **no screen hard-codes an answer**.

---

## 2. Building the graph

```ts
GRAPH = buildGraph(
  CORE_LOOP.map(c => ({ id, exits, back, destination })),
  guardDestinations(ROUTE_GUARDS),
)
```

**Entry points** are: every screen whose back is `none` or `replace`, **plus**
`alsoEntry` — screens a user arrives at without any screen exiting to them.

> A guard redirect is the third such arrival, alongside a tab bar and a
> notification. **Omitting them reports a perfectly reachable screen as an
> orphan, which is a bug in the check and not in the app.**

`guardDestinations()` derives that list by **asking each guard** with a
maximally-denied session, rather than listing destinations by hand — a hand list
would go stale the first time a guard's destination changed, and the staleness
would show up as an "unreachable screen" nobody could explain.

### The three graph properties

| Function | Finds | Meaning |
|---|---|---|
| `unreachable(g)` | Screens no entry point can reach | A screen a user cannot get to |
| `traps(g)` | Screens with no exits **and** `back: none` | Nowhere to go and no way back |
| `danglingExits(g)` | Exits naming a screen that does not exist | **A button that goes nowhere** |
| `flowGaps(g, flows)` | Flow steps / `completesAt` / `abandonsTo` not in the graph | A journey the user can begin and cannot finish |

---

## 3. Back — resolved once, for the whole app

Four declared behaviours (`BackBehaviour` in `@dawai/design`):

| Kind | Meaning | Rule |
|---|---|---|
| `pop` | Ordinary stack pop | |
| `dismiss(returnsTo)` | Close a modal, return to its opener | |
| `replace(with, why)` | A screen the user **must not return to** | Completed deletion, signed-out state, a notification arrival |
| `none(why)` | Only where the OS gesture would leave the app | **Must state the reason** — `auditContract` rejects a bare `none` |

`resolveBack(graph, current, history)` returns one of four results:

```
pop     → { kind: "pop", to }         the stack had something beneath
replace → { kind: "replace", to }     dismiss / replace, or a deep-linked pop
stay    → { kind: "stay", why }       a tab root with history — stay put
exitApp → { kind: "exitApp" }         a tab root with no history
```

**A pop with an empty history is not an error** — it is a tab root, or a screen
that was deep-linked into. The answer is to land on that destination's **root**
(`rootOf`), not to crash and not to exit silently. *Principle 2: back must be
predictable, including at the edges.*

### The one place the reducer overrides the graph

E4's «مو هسه — رجعني لطلبي». A contract's `back` can only name one fixed screen,
so E4 declares `dismiss → S1` — and that sent a patient to Today's stand-in
instead of the request it had just named back to them.

**The distinguishing fact is a preserved action** (D26), and the guard put it
there on the way in:

- R7 dismisses with **nothing pending** → lands exactly where the graph says.
- E4 dismisses with **a pending action** → lands on the screen the patient was
  using when the guard stopped them.

**The pending intent itself is not the destination.** It records the screen the
guard *refused*, which is where D26 replays them **after** they sign in. Sending
them there on the way out would push them forward into the refusal they just
declined.

---

## 4. Deep links resolve to a stack, never a bare screen

`stackFor(graph, target)` walks **back** from the target to an entry point and
returns the whole stack.

> Landing on a detail with no parent traps the user, and **a notification is the
> most common way to arrive somewhere with no history.**

`parentOf` is deterministic — first by declaration order — so a deep-linked stack
is **the same every time**. A cycle guard prevents an infinite walk.

| URL | Target | Stack behaviour |
|---|---|---|
| `dawai://reservation/{id}` | TodayStack → V2 | **Pushes S1 beneath, so back is never a dead end** |
| `dawai://request/{id}` | TodayStack → R7 or R8 | |
| `dawai://grant/{id}` | MeStack → S7 | |
| `dawai://watch/{id}` | MeStack → R12 | |
| `dawai-rx://request/{id}` | Pharmacy InboxStack → P5 | P3 pushed beneath |

---

## 5. Route guards

`packages/navigation/src/guards.ts`. **The client enforces nothing** (§5 rule 1).

> A guard here exists purely so the user is not shown a door that will be
> slammed — **the server still refuses, always.** Rule 4 also applies: a guard may
> only ASK the domain, never compute a rule itself.

### The three guards

| Guard | Blueprint | Refuses when | Redirects to | Reason code |
|---|---|---|---|---|
| `requireSession` | D26 · §3.2 | not authenticated | **E4** | `SESSION_REQUIRED` |
| `requireOrderScope` | §5 clinical matrix | the domain did not grant `order` | S4 | `ORDER_SCOPE_REQUIRED` |
| `blockMemorialised` | D04 | the active subject is memorialised | S1 | `SUBJECT_MEMORIALISED` |

**A redirect, never a blank refusal.** Principle 2 says no dead ends, so a
blocked route must land somewhere useful with a reason the user reads.

**`RedirectReason` is a code, not a sentence**, and the reason is worth quoting:

> Navigation is persona-agnostic: the pharmacy and owner apps run on the same
> graph. A guard that returns Arabic patient copy is a shared rule with an
> opinion about one app's screens — the same mistake domain refusals avoid by
> returning `REFUSAL.*` and letting the app do the wording. It also **duplicated**:
> «هذا السجل صار للقراءة فقط» was written here AND in the patient app's refusal
> wording, so the two could drift into saying different things about the same
> event.
>
> Closed on purpose. **A new reason with no wording is a compile error in the app
> that must word it.**

**`hasOrderScope` is supplied, never computed.** It comes from the domain's
`Authority.authorise` answer via the composition root's `authority()` — §5 rule 2
forbids the store from deriving a permission.

**First refusal wins.** `runGuards` returns the first refusal, so the reason the
user reads is *the first thing that actually stopped them* rather than the last.

### The route table

Declared **once**, so a new screen cannot be added without deciding what protects
it:

```
R1  requireSession · requireOrderScope · blockMemorialised
R6  requireSession · requireOrderScope · blockMemorialised
R7  requireSession
R8  requireSession
R11 requireSession
R13 requireSession
V1  requireSession
V2  requireSession
V4  requireSession
S1  requireSession
F1  []   ← deliberately unguarded
F2  []   ← deliberately unguarded
```

> F1 and F2 are deliberately unguarded — **a guest browses and searches before
> giving us anything (§3.1)**, and the account is asked for at the first action
> that needs one.

### Guards run twice: at the door and at the action

`store.ts` `doSend` re-runs R6's guards at the moment of sending:

> §5 rule 1 — the guard runs again **at the action**, not only at the door. A
> screen that was opened while permitted may be acted on after the grant was
> revoked, and **the disabled button on R6 is a courtesy, not a control.**

### What happens when a guard's destination is not built

`redirect()` in the store:

> When the destination is one this build does not contain, the user **stays where
> they are and reads the reason**. That is not a redesign of the guard — the
> verdict is unchanged and the server still refuses — it is the only honest
> handling of a redirect this slice cannot draw. Navigating to a screen with no
> contract would render nothing, which is worse than staying put with an
> explanation.

---

## 6. Flows and progress

A `Flow` declares a goal, ordered steps (each with a **verb-phrase label**, never
a screen name), `completesAt` and `abandonsTo` — **never nowhere**.

`progressAt(flow, screen, skipped)` returns:

```
{ stepIndex, totalSteps, label, previous, next, goal }
```

**Optional steps the journey will not take are excluded from the denominator**,
so «٢ من ٣» never counts a step that will not happen — R2 (the prescription
photo) is optional and only some request lines need it.

**The `goal` is shown when a flow is interrupted**, so resuming does not require
the user to remember why they were there.

`auditFlow` fails a flow with no steps, no goal, no `completesAt`, no
`abandonsTo`, a repeated screen, an unlabelled step, or **every** step optional
(*"this is not a flow"*).

---

## 7. Navigator structure — all three apps

**Role isolation is achieved by shipping different navigators, not by branching
inside one.** A patient build contains **no** pharmacy route, so the class of leak
that v1 hit twice is *unrepresentable*. Verified at release by an import check on
each bundle.

### Patient

```
RootNavigator (a SWITCH, not a stack)
├── GuestNavigator
├── AuthNavigator      E4 → E5 → E6 → E7 → E8
└── AppNavigator
    ├── Today  TodayStack   E-resolved → S1 → S2(modal) → V2 → V8 → S12
    ├── Find   FindStack    F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8
    └── Me     MeStack      M1 → M2…M15, S4 → S5…S11, R12, R13
Modals: R1 (full-screen; owns R2–R11 and V1) · S2 (sheet) · R13 (sheet)
```

### Pharmacy

```
RootNavigator (switch)
├── ApplyNavigator      PA1–PA9
├── StaffAuthNavigator  P1, P2
└── BranchNavigator
    ├── Requests      P3 → P4 → P5 → P6/P7 → P8 → P9
    ├── Reservations  P10 → P11 → P12/P13 → P14 → P15 → P16
    └── Branch        P17 → P18…P31
Modals: P6 (compose offer — sheet, thumb-reachable) · P31 (queued actions)
```

Guards: `requireStaffSession` (per-person PIN, **30-minute idle timeout, because
the device sits on a counter**), `requireManager` (assistant and pharmacist see
branch settings **read-only**), `requirePharmacist` (**the control is ABSENT, not
disabled — a disabled control invites a workaround**), `requireVerified` (an
unverified applicant reaches only `ApplyNavigator`).

### Owner

A single console over O1–O24, web only.

---

## 8. How the patient app actually navigates today

There is **no router library**. `App.tsx` switches components on `state.screen`,
and every navigation decision is made by the pure reducer.

```
intent { kind: "open", screen }
  → isBuilt(screen)?           no  → no-op (defence; nothing renders such a control)
  → ROUTE_GUARDS[screen]
  → runGuards(guards, guardShape(state, authority))
     allow  → navigate(state, screen)
     refuse → interrupt(session, pendingIntent)   ← D26, before redirecting
            → redirect(state, verdict.redirectTo, verdict.because)
```

`navigate()` decides **push vs replace from the contract**:

```ts
pushes = contract.back.kind === "pop" || contract.back.kind === "dismiss"
history = pushes ? [...history, current] : []
```

A modal that is the root of its own presentation **replaces** rather than stacks;
everything else **pushes**, so back has something to pop.

`redirectBecause` is cleared on every navigation, so a destination explains
itself **only** when a guard actually sent the user there.

### The `isBuilt` invariant

```ts
isBuilt = (s) => CONTRACTS.has(s) && !(s in NO_COMPONENT)
```

*A contract this build cannot draw is indistinguishable, to everything that asks,
from a screen it does not contract at all* — which is what callers were always
assuming. See TD-19 in `18-technical-debt.md` for what it cost when it did not
mean that.

---

## 9. Navigation invariants, and the tests that hold them

| Invariant | Held by |
|---|---|
| No unreachable screen | `unreachable(GRAPH)` is empty — `screens/navigation.test.ts` |
| No trap | `traps(GRAPH)` is empty; also structurally, since `auditContract` rejects "no exits and no back" |
| No button that goes nowhere | `danglingExits(GRAPH)` — plus `isBuilt` gating what renders |
| Every flow completable | `flowGaps(GRAPH, PATIENT_FLOWS)` is empty |
| Back is predictable at the edges | `resolveBack` handles empty history as `stay` / `exitApp` / root-replace |
| A deep link never traps | `stackFor` builds the full stack |
| A guard destination is never an orphan | `guardDestinations` feeds `alsoEntry` |
| Exactly one primary per screen per state | The `ScreenContract` type + `auditContract` |
| No screen belongs to no destination | `Location.destination` is a required closed union |
