# UI Kit Notes — Magic UI · Tremor · Superpowers

> Durable reference distilled from the three packages the owner uploaded
> (magicui-main, tremor-main, superpowers-main) for the pre-launch interface
> push. Canonical sources: github.com/magicuidesign/magicui,
> github.com/tremorlabs/tremor, github.com/obra/superpowers.
>
> ⚠️ **Stack reality check:** Magic UI and Tremor are **React + Tailwind
> (+ motion/Recharts)** libraries. adlytic is **Hono + server-rendered
> template-literal HTML + vanilla JS + self-hosted Chart.js** (RTL Arabic,
> dark gold theme). Nothing here is imported as-is — we **port the pattern**
> (exact animation params below) into `layout.ts` CSS + page JS. Do not add
> React/Tailwind for this.

---

## 1. Magic UI — animated components worth porting

Portable effects, with the real parameters read from source:

| Component | Core mechanics (from source) | Vanilla port | Where in adlytic |
|---|---|---|---|
| **number-ticker** | motion spring `damping:60, stiffness:100`, starts on `useInView(once)`, renders via `Intl.NumberFormat`, `decimalPlaces` | `requestAnimationFrame` count-up ~800ms with ease-out cubic (`1-(1-t)^3`), `toLocaleString('en-US')`, trigger once via `IntersectionObserver` | KPI values: hero spend cards (dashboard), `camp-kpi-value` (campaigns) |
| **blur-fade** | `duration:0.4s, delay, blur:'6px'`, hidden `{y:6, opacity:0, filter:blur(6px)}` → visible, in-view once | CSS `@keyframes blur-fade-in {from{opacity:0;transform:translateY(6px);filter:blur(6px)}}` 0.4s ease-out + per-section `animation-delay` stagger (0/0.06/0.12s…); gate with IntersectionObserver or just on-load for above-fold | Section entrances on dashboard + campaigns (KPI row → charts → table) |
| **border-beam** | animated gradient dot orbiting the border via `offset-path: rect(0 auto auto 0 round <radius>)` + `offsetDistance 0→100%`, `duration:6s`, mask `padding-box/border-box` trick | Pure CSS: absolutely-positioned ::after w/ small gradient segment, `offset-path: rect(...)`, `@keyframes {to{offset-distance:100%}}`. **Chromium/Safari 17+ only** → guard `@supports (offset-path: rect(0 0 0 0))`, fallback = current static gold border | Highlight ONE hero element only: the **Main Move card** (الخطوة الأهم) |
| **animated-list** | items enter `scale:0→1, opacity:0→1, originY:0`, spring `stiffness:350, damping:40`, one item per `delay:1000ms` | CSS transition `.25s cubic-bezier(.34,1.56,.64,1)` (springy overshoot) toggled by class; JS reveals feed items sequentially | AI Monitor ticker items / توصيات feed |
| shine-border / shimmer-button | slow gradient sweep on CTA | CSS `background-position` keyframes | primary CTAs only (زر الترقية/الربط) — use sparingly |
| marquee | infinite translateX loop, pause on hover | **already implemented** as `ticker-track` in dashboard — skip |

**RTL note:** offset-path beam + shimmer directions are physical; verify they
read naturally in RTL (reverse `animation-direction` if the sweep feels
backwards). Number ticker output stays LTR inside `unicode-bidi` guards we
already have on `.kpi-value`.

**Respect `prefers-reduced-motion`:** wrap every new animation in
`@media (prefers-reduced-motion: no-preference)` — layout.ts already has a
reduce block at the bottom.

---

## 2. Tremor — dashboard patterns worth porting

Tremor's value here is **information design**, not its React code:

| Component | Pattern (from source) | Port sketch | Where in adlytic |
|---|---|---|---|
| **BarList** | ranked horizontal bars; width = `max((value/maxValue)*100, 2)%`, label overlays bar, value right-aligned | plain divs — we already ship this math as `.spend-bar` in the campaigns table | formalize for "أفضل الحملات إنفاقاً" mini-panel on dashboard |
| **Tracker** | row of equal segments (`size-full`, 4px outer radius, per-segment `color` + `tooltip`) | flex row of 30 divs (green/amber/red/gray) + title tooltip | **data-freshness strip**: last 30 days — synced day = green, partial = amber, missing = gray. Answers "هل بياناتي كاملة؟" at a glance |
| **CategoryBar** | stacked % segments from `values[]` (sum-normalized) + optional marker | one flex bar with weighted children | budget split نشطة/متوقفة, or spend share per objective |
| **ProgressCircle** | SVG circle, `stroke-dasharray` percent | 40-line vanilla SVG helper | campaign health score in the inspector modal |
| **SparkChart** | tiny axis-less area chart | Chart.js line, `display:false` axes, 40×120px canvas, no tooltip | **sparkline column** (آخر 7 أيام) in the campaigns table rows |
| Badge/delta conventions | ▲/▼ + dim success/error backgrounds | **already matches** our `.hero-delta` / `.kpi-delta` | keep |
| Table | zebra, sticky header, right-aligned numerics, tnum | mostly done; consider sticky `thead` on desktop | campaigns table |

Tremor chart palette/interaction rules broadly agree with the dataviz skill we
already applied (recessive grids, direct labels, one hue per series).

---

## 3. Superpowers — process skills (not UI)

Workflow discipline for the launch push; apply the method, no code to port:

- **writing-plans / executing-plans** — batch each UI upgrade into a written
  checklist with verification per item (we already work this way; keep it).
- **verification-before-completion** — never claim done without running it:
  our Playwright harness (phone 390px + desktop 1280px, mocked APIs,
  canvas-pixel assertions) is the standing verifier for every UI change.
- **systematic-debugging** — reproduce → instrument → single root cause →
  verify (this is how the sidebar-overflow and CDN-empty-charts bugs fell).
- **finishing-a-development-branch** — our convention: work on
  `claude/save-for-reuse-djv4h8`, ff-merge to `main` per verified batch.

---

## 4. Pre-launch shortlist (priority order, all verifiable in the harness)

1. **Number ticker** on hero/KPI values — biggest perceived-quality win, ~1h, zero risk.
2. **Blur-fade stagger** on dashboard/campaigns sections — page feels orchestrated, ~1h.
3. **Tracker freshness strip** (30-day sync quality) — real information, unique to us, ~2h incl. endpoint reuse of daily_stats presence.
4. **Sparkline column** in campaigns table (7-day spend trend per row) — Ads-Manager-grade, ~2h (data already in daily_stats; needs per-campaign series in the ?days= aggregate or a light second query).
5. **Border-beam on Main Move** — the one aesthetic risk, behind `@supports`, ~45min.

Rules: one signature effect per page, everything behind
`prefers-reduced-motion`, re-run the harness (charts painted, no overflow,
RTL intact) before merging each item.
