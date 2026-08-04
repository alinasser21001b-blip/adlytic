# 00 — Project overview

> Read `START_HERE.md` first if you have not. This file assumes you know that
> the repository holds two products and that Dawai itself exists in two shapes.

---

## 1. What Dawai is

**Dawai (دوائي — "my medicine") is a time-bounded medicine request and pharmacy
offer network for Iraq, Baghdad first.**

A patient asks for one or more medicines. The platform asks every eligible
nearby pharmacy branch **at the same moment**. Pharmacies answer with structured
offers — per requested line: available at a price, unavailable with a reason, or
a substitute proposed by a licensed pharmacist. The patient compares the answers,
accepts one, the pharmacy confirms, a hold begins with a pickup code, and the
patient collects at the counter.

The product is a **coordination layer over information that already exists but
is trapped behind phone calls**. It holds no stock data, moves no goods and
handles no money.

### What Dawai explicitly is not

Every one of these is a deliberate exclusion, not an unbuilt feature:

| Not | Why | Reference |
|---|---|---|
| A delivery service | Delivering prescription medicine is a separate, harder-to-license product | §3 Phase 0 scope |
| A payment platform | **Nobody pays in Phase 0 or Phase 1, and nothing is built that assumes revenue** | **D43** |
| A diagnosis tool | The clinical engine's forbidden list starts here | §7 refusals |
| A dose calculator | Same | §7 refusals |
| An interaction checker | Phase 0 performs **no** interaction checking, and says so in the product | **D16** |
| An allergy record | Allergies are removed from Phase 0 entirely, including from the permission matrix | **D17** |
| A prescription reader | No OCR, no extraction, no machine reading of any image | **D18**, §7 refusals |
| A pharmacy ERP / stock system | The stock module was removed from Phase 0 | §3, and see BD-10 |
| A controlled-substance channel | Controlled items are refused outright, at the moment they are tapped | **D42** |
| A public price list | There is no public price anywhere; a price exists only inside an offer made to one patient | **D08** |
| A ratings site | Post-pickup ratings are removed; the price dispute is the only signal collected | **D31** |

---

## 2. The problem it solves

**For the patient.** A person who needs a medicine today has no way to find out
which pharmacy has it except to ask each one. In Baghdad that is a sequence of
phone calls or a walk between shops, made by someone who is often frightened,
often elderly, and often standing outside a closed pharmacy at 11pm. The failure
mode is not inconvenience — it is a person who gives up and does not take the
medicine.

**For the pharmacist.** The mirror problem: constant phone interruptions asking
"do you have X" while a customer waits at the counter. Each call costs attention
and produces no revenue when the answer is no.

**The structural observation:** both sides are spending time on *availability
discovery*, and neither side has any record of it afterwards. Dawai makes that
one broadcast, one comparison and one hold.

---

## 3. Why it exists — the market thesis

Four choices define the strategy, and each narrows risk deliberately:

1. **Baghdad first.** A two-sided marketplace fails on liquidity, not on
   features. One district with real patient density and real pharmacy
   participation beats national coverage with neither. **D40** makes the launch
   district a *configuration value that must be set before the first pharmacy is
   verified* — an architectural constraint rather than a hope.

2. **Arabic-first and RTL-native, not localised.** The typography rules are
   correctness rules, not taste: letter spacing is fixed at zero because Arabic
   is a connected script; the font stack is Arabic-first because a Latin-first
   stack with an Arabic fallback produces inconsistent weight mid-sentence; every
   Latin run inside Arabic text is bidi-isolated because otherwise a price
   reorders and the patient reads the wrong number
   (`packages/design/src/tokens/type.ts`, `rtl.ts`).

3. **No payment, no delivery in v1.** Both are separate regulatory products.
   **D41** scopes Phase 0 so that *it does not depend on the regulatory answer* —
   the platform can prove the discovery and reservation loop while the licensing
   question is still open.

4. **The record is the durable asset.** **D22**: the medication record is built
   from *completed pickups* and nothing else — Phase 0 predicts nothing, infers
   nothing, and the `DispenseRecord` is append-only with no UPDATE or DELETE
   permission granted to any role. Over time that becomes a real adherence graph
   that a pure discovery marketplace would never accumulate. **D23** makes the
   Phase 0 exit criterion test exactly that belief before Phase 2 is built on it.

---

## 4. Product philosophy

Seven principles run through every file in `platform/`. They are quoted here in
the form the code states them, because the code states them better than a
summary would.

### 4.1 Search is not a promise

Availability is a *signal with an age*, never a guarantee. Cached search results
are labelled with how old they are and never presented as live
(`model/search.ts` — the `offline` state carries `cachedAt`; `ports.ts` —
`Fetched<T>` has a `cached` variant that a screen must label). Only a confirmed
reservation is a commitment.

### 4.2 A stated absence beats a partial check

From `packages/domain/src/clinical/gates.ts`:

> Blueprint v3 §7 is unusually explicit that Phase 0 performs NO automated
> clinical checking, and that **a partial check a user believes is complete is
> more dangerous than a stated absence**. This module therefore contains only
> refusals and authorisations — it never returns "safe", "clear" or "no
> interactions found", and there is no code path that could.

`GateOutcome` is `"ALLOWED" | "REFUSED"`. There is no `SAFE`.

### 4.3 Every load-bearing quantity is fixed, once, in the domain

The independent review's central finding about v1 was that it settled principles
and left every number undefined, so a build team would invent six of them.
Blueprint v3 fixed each one, and `packages/domain/src/marketplace/rules.ts` is
where they live as executable constants: three request windows (20m / 4h / 48h),
max 8 lines per request, a 5-minute refusal grace, a 10-reservation minimum
sample, a 60-day honoured window. **No controller ever needs to know what "soon"
means.**

### 4.4 A refusal is a product surface

`REFUSAL` is a closed set (`shared/refusal.ts`). Every reason traces to a
Blueprint decision. Leaving the set open invites a new refusal string to be
invented in a controller, which is exactly the hidden business logic Rule 3
forbids. The domain returns a *code*; the app words it. The domain never decides
how a refusal is phrased.

### 4.5 The user's work survives everything

**D26**: a pending action survives authentication. **D27**: a queued request is
visible, cancellable, and never presented as sent. R2's failed upload keeps the
photograph — *a patient who has already held a piece of paper up to a camera must
not be asked to do it again because a connection dropped*.

### 4.6 The failure names the condition, never the person

**D37**. «الصورة مو واضحة» ("the image isn't clear"), never «صورة سيئة» ("bad
photo"). `model/prescription.ts` `whatToFix()` returns, for each cause, a
sentence about something the patient can change about the next photograph and an
action. None of them evaluates the patient.

### 4.7 Motion must teach something

§27. Every motion token carries a required `teaches` field, and an entry without
one does not type-check (`packages/design/src/tokens/motion.ts`). Motion with no
answer to "what did this teach the user?" is *latency in a costume*.

---

## 5. Phase 0 — scope, prerequisites and exit criteria

**D24: Phase 0 is a closed system.** It contains everything it needs and
references no later phase. Nothing in it is conditional — which is why
`packages/config/src/flags.ts` ships `PHASE_0_FLAGS = []` and says so
explicitly: a flag added there would gate behaviour the Blueprint does not
describe.

### In scope

- **Patient**: guest browsing and search without an account; phone+OTP sign-in
  requested at the first action that needs one; a request of 1–8 lines with an
  urgency window; an optional prescription photograph; district-based location
  (never GPS); structured offers; per-line substitution consent; reservation with
  a pickup code; the outbox; the access log; the dispense history.
- **Pharmacy**: application with licence documents; verification lifecycle;
  opening hours including a Ramadan alternative week (**D33**); coverage,
  capacity and pause controls; a ranked-by-nothing inbox; structured offers;
  confirm → hold → handover; private reliability metrics.
- **Platform/operator**: the verification queue; catalogue curation; the four
  exit metrics; the audit log; suspension.

### Out of scope for Phase 0

Payment, delivery, insurance, refills, public ratings, stock quantities,
interaction checking, allergy data, OCR, controlled substances, biometrics and
any premium OS capability (**D35**), two-person controls (**D20** — because
Phase 0 has no action that needs one), Kurdish (**D34** — the schema slot is
reserved, the font stack is not, because a font stack for a language we do not
ship would be a claim we cannot honour).

### The five prerequisites before the first request

From §3, and the reason `@dawai/config` exists at all:

1. The launch district is named in configuration (**D40**).
2. Verified pharmacy branches exist in it.
3. Every catalogue item carries pack size, prescription flag and controlled flag
   — enforced as a database constraint: `state='requestable'` requires all three
   NOT NULL.
4. The operator can verify a branch and set its map point (**D10**).
5. The audit path is live before the first identified read.

### The four exit criteria

Each has a screen in the owner console *inside Phase 0*, because a metric with
no screen is a metric nobody reads:

| Metric | Screen | Fed by | Meaning |
|---|---|---|---|
| Fill rate | O12 | `request.broadcast` → `offer.sent` | Did asking produce answers? |
| Honoured rate | O13 | `reservation.confirmed` / `.refused` / `.collected` | Is a confirmation worth trusting? |
| Answer time | O14 | `request.broadcast` → `offer.sent` | Median under 15 seconds |
| Repeat rate | O15 | `dispense.recorded` | **D23** — the riskiest belief: will a patient come back? |

---

## 6. Phase roadmap

The roadmap is expressed in the build as **stages**, and `platform/README.md`
publishes their status. This is the honest version:

| Stage | Contains | Status |
|---|---|---|
| 1 | Repository foundation, config, secrets, logging, telemetry, feature flags | **built** |
| 2 | Shared design system | **built** |
| 3 | Navigation, auth, session, offline, networking | **built** |
| 4 | Domain layer — entities, machines, rules, events | **built** |
| 5 | Infrastructure — repositories, storage, sync, queues, notifications, audit | **client half built; no server** |
| 6 | Patient app | **core loop runs end to end; 4 screens have no component, S1 has a stand-in** |
| 7 | Pharmacy app | blocked on 2, 3, 5 |
| 8 | Owner console | blocked on 2, 3, 5 |

**Stage 4 was deliberately built before Stages 2 and 3.** Rule 3 places every
business rule in the domain, and no layer above it can be correct until those
rules exist and are proven. This ordering is the reason the domain is 100%
testable with no infrastructure today.

**Stage 5 is split rather than done.** What exists: one HTTP transport
classifying through `@dawai/net`; ports over the declared contracts; the outbox
flusher driving retry, backoff and idempotency; the effect runner closing the
store → server → store loop. What does not exist: **a server**. Stage 6 depends
on that split — the loop is walkable because the development server answers, not
because a backend does.

### Beyond Phase 0

Named in the decision register but deliberately not designed:

- **Phase 1** — still no revenue (**D43**), broader districts.
- **Phase 2** — built on the medication record; gated by D23's repeat-rate proof.
- **Phase 3** — clinical governance authority and the 2am safety path are named
  as *Phase 3 prerequisites* (**D21**), i.e. Dawai may not offer clinical advice
  until a named clinical governance authority exists.

---

## 7. The repository, mapped

So that nobody spends an afternoon in the wrong directory:

| Path | What it is | Dawai? |
|---|---|---|
| `platform/` | **The current Dawai engineering track.** Blueprint v3 monorepo. | ✅ **work here** |
| `dawai-platform/` | An earlier complete full-stack Dawai (Hono + Postgres). Deployable. | ✅ reference |
| `docs/product/v3/` | Blueprint v3: `blueprint-v3.html`, `phase0.js` (133 screens), `register.js` (D01–D43) | ✅ **frozen authority** |
| `docs/technical/` | Technical architecture: 11 HTML docs + `model.js` (12 services, 21 entities, 54 events, 67 endpoints, 22 tables, 11 gaps) + `validate.mjs` | ✅ **frozen authority** |
| `docs/knowledge-base/` | This knowledge base | ✅ |
| `docs/architecture/`, `docs/design/`, `docs/dawai/`, `docs/product/` | Earlier design/architecture waves; `docs/design/*` is generated from Blueprint v3 by `platform/tools/design/` | ✅ derived |
| `review/` | Generated screen gallery: `index.html`, `data.json`, screenshots, responsive captures, `.baseline.json` | ✅ generated |
| `dawai-site/`, `dawai-developed.html`, `dawai-ui-preview.html`, `pharmacy/` | Design prototypes, served at `/design/` on the preview deploy | ✅ prototype |
| `hub/`, `qareeb-platform/` | Earlier "Qareeb" healthcare-hub experiments | ⚠️ adjacent, not current |
| `src/`, `prisma/`, `test_*.ts`, `run*.ts`, `*.command`, `ADLYTIC_*`, root `package.json` | **Adlytic** — an ads-intelligence platform. Unrelated product. | ❌ **not Dawai** |
| `.github/workflows/` | `platform.yml` (Dawai gates), `technical-architecture.yml`, `release-governance.yml`, `deploy-adlytic.yml` | mixed |

**The deployed preview URL serves `platform/`**: repo-root `netlify.toml` sets
`base = "platform"`, and `platform/tools/assemble-preview.mjs` puts the app at
`/`, the design prototype at `/design/` and the screen gallery at `/review/`.
