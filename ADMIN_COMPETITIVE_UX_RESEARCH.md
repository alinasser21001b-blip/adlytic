# ADMIN COMPETITIVE UX RESEARCH

Evidence discipline: every row is labelled **OBSERVED** (documented or
directly readable in public sources), **INFERRED** (reasoned from observed
behaviour, marked as reasoning), or **NOT_OBSERVED** (could not be verified —
never filled in from imagination).

---

## Adopted

### Navigation by operator job, not system architecture — OBSERVED
**Source**: [Stripe dashboard breakdown](https://www.925studios.co/blog/stripe-dashboard-design-breakdown) — navigation organised around Payments, Payouts, Customers, Disputes.
**Problem**: an admin thinks "who is broken", not "which table".
**Adopted**: sections named الرئيسية / مساحات العمل / الزبائن / الإيرادات / الدعم / البنية التحتية.
**Rejected**: Stripe's finance-specific vocabulary. Adlytic's operator manages *integrations and freshness*, not settlements.

### Colour = state only — OBSERVED
**Source**: [Stripe apps design guidance](https://docs.stripe.com/stripe-apps/design).
**Adopted, and hardened**: colour is *reinforcement*; every status also carries a glyph and an Arabic word. A red dot and an amber dot are the same dot in greyscale or to a colour-blind operator.

### "The chart is a summary, the table is the truth" — OBSERVED
**Source**: Stripe reporting patterns.
**Adopted**: the console has **no decorative charts at all**. Numbers and tables only.
**Rejected**: adding a sparkline to fill space.

### One consolidated attention queue — OBSERVED
**Source**: [Datadog on managing monitors at scale](https://www.datadoghq.com/blog/dashboards-monitors-at-scale/); teams pipe Sentry alerts into a single queue so engineers watch one list.
**Adopted**: a single "يحتاج انتباهك" merging subsystem, connection, sync and freshness problems.
**Rejected**: alerting, muting, on-call routing — Adlytic has no notification system, and a queue implying one would be a false promise.

### Tools that report on their own signal quality — OBSERVED
**Source**: Datadog Monitor Quality surfaces flapping monitors and ones muted too long.
**Adopted as the core principle**: `UNKNOWN` and `NOT_TESTED` are first-class answers, and the console names what it could not observe.
**Extension beyond what was observed**: Datadog reports on *monitor* quality; Adlytic reports on *its own epistemic* limits. That is our own, not copied.

### Platform verdict outranks local opinion — OBSERVED
**Source**: [Meta Account Quality](https://goodmorningco.com/blog/meta-ads-account-quality-notifications) — restricted delivery is often the hidden cause of performance drops.
**Adopted**: `metaAccountStatus !== 1` marks the workspace BLOCKED regardless of how healthy our own plumbing looks.
**Rejected**: importing Meta's Quality Ranking into an Adlytic health number — that is a *capability→intelligence* conversion, forbidden.

### Progressive disclosure: summary → evidence → raw — OBSERVED
**Source**: Stripe patterns for empty/loading/error states; Sentry issue triage depth.
**Adopted**: workspace row headline → separate connection/data axes → last sync error → raw account id in LTR mono.

---

## Explicitly rejected

| pattern | source | why rejected |
|---|---|---|
| Composite "health score" | common across SaaS dashboards | No defensible source exists. Inventing one reproduces inside the console the exact error the product exists to detect. |
| Onboarding progress checklist in sidebar | Stripe — OBSERVED | Adlytic's admin is a single operator, not a self-serve signup. |
| Alert muting / snoozing | Datadog — OBSERVED | Implies a notification system we do not have. |
| Per-workspace intelligence column | INFERRED from ad-intelligence products | Would read `UNKNOWN` in every row today. |

---

## NOT_OBSERVED — recorded as unknown

Internal operator/admin consoles of **Triple Whale, Northbeam, Motion,
Madgicx** could not be verified from public sources during this audit: no
public demo of the admin surface, no documentation of internal state
handling. Their marketing sites describe *customer-facing analytics*, which is
a different product than an operator console.

**No pattern was attributed to them.** Any future claim about their behaviour
must cite an actual observation.

Also NOT_OBSERVED: AWS Console, Vercel, Linear, Cloudflare, Supabase and
PostHog internal-operator surfaces were not inspected in this pass. The
patterns adopted above stand on Stripe, Datadog/Sentry and Meta evidence
alone — which was sufficient, and honest about its scope.
