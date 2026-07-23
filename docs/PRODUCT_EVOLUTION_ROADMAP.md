# Adlytic — Product Evolution Roadmap

**Version:** 1.0 · **Date:** 2026-07-15 (pre-launch) · **Scope:** everything after tomorrow's launch
**Method:** market research first → Meta data taxonomy → product/UX audit → codebase audit → prioritized plan
**Prime directive:** evolve without destabilizing. Nothing in this document is a launch blocker.

---

## 1. Market Intelligence Findings

Research across the competitive landscape (July 2026), grouped by philosophy rather than feature list:

### 1.1 The four philosophies in the market

| Philosophy | Representatives | What they sell | Their weakness |
|---|---|---|---|
| **Autonomous agent** | Madgicx (AI Marketer + Cortex), Triple Whale (Moby 2 agents) | "The AI audits 24/7 and tells you exactly what to do next" — and increasingly *does it* (budget allocation, creative scaling) | Black-box actions scare SMBs; e-commerce/ROAS-centric; English-only |
| **Deterministic rules** | Revealbot/Bïrch | Deepest condition→action engine: 15-min intervals, AND/OR stacking, learning-phase guardrails | Rules-based, not intelligent — executes what you specify, never explains *why* |
| **Creative intelligence** | Motion, Hawky, Atria | Hook rate (>30% good, <25% investigate), thumb-stop, hold rate; fatigue = frequency >3.5 in 7d **and** engagement −25% vs first-week baseline; ~half of creatives retire before day 28 | Creative-only lens; assumes a sophisticated buyer |
| **Narrative BI** | ThoughtSpot, Polar (5 purpose-built agents), Databox | 2026 bar: "a narrative that explains what the data means and why it matters," proactive decision-ready insights on first-party data | Generic BI; no Meta-native diagnosis; enterprise pricing |

### 1.2 Convergent patterns everyone landed on (why they matter)

1. **Executive summary first** — one score/sentence before any chart (Madgicx audit verdict, Moby weekly leadership report, ThoughtSpot narrative). *Why: SMB owners decide in 30 seconds.*
2. **Health/grade scoring** — a single 0–100 or A–F that trends. *Why: converts anxiety into a number you can watch.*
3. **One diagnosis, not four warnings** — mature tools correlate (CTR↓ + frequency↑ + CPM↑ ⇒ fatigue). *Why: separate alerts transfer the analysis burden back to the user.*
4. **Anomalies are pushed, not pulled** — Moby's threshold agents, Slack/email alerts. *Why: SMBs don't open dashboards daily; the tool must reach them.*
5. **Guardrailed automation** — Bïrch's "exclude learning phase" checkbox is the trust pattern. *Why: SMBs accept automation only with visible brakes.*
6. **Evidence + confidence attached to every claim** — the 2026 differentiator vs 2023-era "AI insights."
7. **Scheduled narrative reports** — weekly email to the owner is table stakes (Whatagraph/AgencyAnalytics built businesses on it).

### 1.3 Adlytic's defensible position (the gap nobody fills)

Every tool above is **English-first, e-commerce/ROAS-first, US/EU-priced**. Adlytic's segment — **Arabic-speaking SMBs running messaging-objective campaigns (WhatsApp/Messenger conversations, not pixel purchases)** — is structurally underserved:

- ROAS-centric tools literally cannot score a messaging campaign (no revenue signal) — Adlytic's cost-per-conversation intelligence is the correct KPI frame.
- Advisor-grade Arabic (already shipped: Meta-official Arabic terms + plain-language explanations) is a moat none of them will bother building.
- Agent v2 with 16 grounded tools + anti-hallucination post-check already exceeds what most SMB tools ship. The gap is **packaging** (proactive delivery, unified diagnosis), not capability.

**Positioning sentence:** *"Meta gives you numbers. Adlytic tells you what happened, why, how serious it is, what to do — and how sure it is."*

---

## 2. Meta Data Taxonomy — what to sync, show, and never show

Currently synced (`DEFAULT_INSIGHT_FIELDS`): spend, impressions, reach, clicks, inline_link_clicks, unique_clicks, ctr, unique_ctr, cpc, cpm, frequency, actions, action_values, cost_per_action_type, purchase_roas. Plus hourly + audience breakdowns, learning_stage_info.

### 2.1 Classification

| Tier | Metrics | Treatment |
|---|---|---|
| **Critical (decision-driving)** | spend, results (messages+purchases+leads), cost/result, CTR, frequency, learning phase | Layer 1–2. Always paired with a verdict. |
| **Important (diagnostic)** | CPM, reach, unique CTR, **quality_ranking / engagement_rate_ranking / conversion_rate_ranking** ⚠️not synced, **hook rate & ThruPlay** ⚠️not synced, **landing_page_view vs link_clicks** ⚠️not synced, placement breakdown | Layer 3 "why" evidence. Feed the diagnosis engine; surface only inside explanations. |
| **Secondary (context)** | CPC, impressions, video_p25–p100, hourly pattern, audience breakdown | Layer 4–5. Charts and drill-downs only. |
| **Rarely useful** | clicks (all), cost_per_unique_click, social spend | Available in CSV export; never a card. |
| **Never show directly** | attribution windows raw, auction bid internals, raw action arrays | Consumed by engines only. |

### 2.2 The three unexploited goldmines (highest ROI data work)

1. **Ad relevance diagnostics** (`quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking`, values: above/average/below-35/below-20). This is Meta *itself* telling us why an ad underperforms — e.g. quality=below + engagement=above ⇒ clickbait perception; quality=above + conversion=below ⇒ landing/offer problem. Zero inference required; pure translation into Arabic advice. **Effort: S (add 3 fields to sync + map). Impact: 5/5.**
2. **Video funnel** (`video_thruplay_watched_actions`, `video_p25..p100`, 3s views ⇒ hook rate = 3s/impressions). Unlocks Motion-grade creative fatigue *leading* indicators instead of our current lagging CTR-decline detector. **Effort: M. Impact: 4/5.**
3. **Landing funnel leak** (`landing_page_view` vs `inline_link_clicks`): clicks without page views = slow page/broken link — an insight no CTR chart can produce. For messaging campaigns the analog is conversations-started vs replies (already partially tracked). **Effort: S. Impact: 4/5.**

---

## 3–4. Product & UX Audit (dashboard as shipped today)

### What already matches the 2026 bar (keep, do not touch)

- Health gauge + estimated fallback («~» honesty marker) · Quick/Advanced mode · single AI entry point (FAB) · Meta-official Arabic terminology + glossary popovers · meaning-colored sparklines (neutral spend) · compact empty states · evidence bars on AI replies · weekly report with WoW deltas · tenant isolation (audited) · security posture (audited pre-launch).

### The one structural UX problem left: four surfaces answer the same question

"ماذا أفعل الآن؟" is currently answered by **(a)** Main Move (تشخيص + حل), **(b)** AI Recommendations (نفّذ الآن), **(c)** Predictions (تنبيهات ذكية), **(d)** Weekly report recommendations. We deduplicated *data* this week; the remaining duplication is *purpose*. Users cannot tell which surface is authoritative.

**Fix (post-launch, incremental): the Decision Center.** One prioritized feed, fed by all four generators, ranked by `severity × expected impact × confidence`, each item carrying the same card contract: *what → why → evidence → action → confidence → risk*. The four existing renderers become feed sources, not sections. No backend rewrite: a client-side merger first (S), then a server-side `GET /api/workspaces/:id/decisions` that unifies (M).

### Progressive disclosure mapping (target = current page, re-layered)

| Layer | Content | Today's components (mapped, not rebuilt) |
|---|---|---|
| 1. Executive | score + one sentence + top action | Health gauge + exec pulse (merge into one strip) |
| 2. Decisions | unified feed | Main Move + recs + predictions + weekly recs |
| 3. Why | cause + evidence drawer | existing drill-downs, Investigation report, rankings (new data) |
| 4. Metrics | KPI grid + trends | hero cards + charts (as-is) |
| 5. Raw | tables, CSV, advanced panels | التحليلات المتقدمة (as-is, collapsed) |

**Navigation** stays 7 items; rename لوحة التحكم content order to match layers; add "Creatives" page only after video-funnel sync lands (§2.2).

---

## 5. AI Capability Audit

| Capability | Status | Gap |
|---|---|---|
| Grounded tool agent (16 tools) | ✅ strong | Expose T11 budget simulator in UI (backend done, no surface) |
| Anti-hallucination post-check | ✅ | — |
| Offline fallback replies | ✅ | — |
| Insight quality gate | ✅ | — |
| **Cross-metric single diagnosis** | ⚠️ partial (diagnoses.ts correlates some) | Formalize the pipeline: pattern → cause → impact → confidence → recommendation → evidence, with fatigue/auction/creative/landing causes as first-class outputs |
| **Confidence calibration** | ⚠️ cosmetic | Track outcomes (RecommendationLog exists): after 7d, did the metric move as predicted? Feed back into displayed confidence |
| **Proactive delivery** | ❌ | Weekly report exists but is pull-only. Add email (later WhatsApp) push |
| Learning loop | ⚠️ designed (v3 doc), partial | Wire RecommendationExecution outcomes into recommendation ranking |

### The Unified Diagnosis Engine (flagship post-launch feature)

Pipeline (mostly existing pieces, new orchestration): RawInsight/DailyStat → PatternEngine (exists) → **CauseResolver (new, ~300 lines)** — rulebook mapping signal combinations to causes:

```
CTR↓ + frequency↑ + CPM↑ + results↓            ⇒ AUDIENCE_FATIGUE   (conf: high)
CPM↑ alone, CTR flat                            ⇒ AUCTION_PRESSURE   (conf: med)
quality=below + engagement=above                ⇒ CLICKBAIT_PERCEPTION
conversion_ranking=below + CTR healthy          ⇒ LANDING_OR_OFFER
hook<25% + thruplay/3s low                      ⇒ CREATIVE_HOOK_WEAK
learning_phase stuck + budget edits frequent    ⇒ LEARNING_RESET_LOOP
```

→ BusinessImpact (money at stake from spendWindow) → Confidence (signal count + data days) → one Decision Center card. **Never emit the component signals as separate warnings once a cause consumes them.**

---

## 6. Language Layer (المستشار، لا الجدول)

Already shipped: Meta terms + plain subtitles. Next: a central **insight translator** (`src/knowledge/insightLanguage.ts`) so every engine emits `{ metric, direction, magnitude, cause }` and one module renders Arabic/English advisor copy. Examples the module must produce:

- CTR 1.9%↓ → «الناس يشاهدون إعلانك لكن لا ينقرون — التصميم يفقد الانتباه.»
- frequency 5.8 → «نفس الجمهور رأى إعلانك مرات كثيرة — الملل يقلّل النتائج.»
- CPM +42% → «تدفع أكثر من المعتاد للوصول — منافسة أعلى أو جمهور مُشبع.»
- conversions↓ → «حملتك تجلب عملاء أقل من الأسبوع الماضي.»

Rule: **the number is evidence, the sentence is the product.** Numbers stay visible (trust), sentences lead (understanding).

---

## 7. Recommendation Engine — contract upgrade

Add to the recommendation schema (backward-compatible optional fields):
`expectedImpact { metric, range, currency? }` · `riskLevel (low/med/high)` · `timeHorizonDays` · `evidenceRefs[]` (issue/snapshot ids) · `outcome { actedAt?, observedDelta?, verdict? }`.

Ranking = severity × normalized expected impact × calibrated confidence. Dedupe server-side by cause fingerprint (client fingerprint logic exists — promote it). Generic advice is banned by the existing insight gate; extend the gate to reject recommendations lacking `evidenceRefs`.

---

## 8. Technical / Architecture Audit

Verified healthy: tenant isolation on all 39 workspace routes; admin fully guarded (fail-closed); no SQL injection; secrets fail-fast; XSS-safe rendering; webhook signatures; graceful shutdown; tsc clean; zero TODO/FIXME.

| Area | Finding | Action | Effort/Risk |
|---|---|---|---|
| `server.ts` 5,100+ lines | single file, 100+ routes | Split into `routes/{auth,admin,workspace,ai,webhooks}.ts` — mechanical move, no logic change | M / low |
| `dashboardPage.ts` 3,700 lines (client JS in template strings) | no type-checking of client code; syntax risk (mitigated by script-check harness) | Extract remaining sections into `dashboard/sections/*` modules (pattern exists: kpis, issues, diagnoses); longer-term: compile client TS to `/public` bundle | M / low |
| Dashboard DTO cost | recomputed per request | Per-workspace cache (60s TTL, bust on sync-complete) — pulse endpoint already separates volatile fields | S / low |
| DB indexes | `DailyStat @@index([entityId, date])` ✅; verify `BreakdownStat`, `CampaignBrainSnapshot` under EXPLAIN with 90d data | Add covering indexes as measured | S / low |
| Health score coverage | server score often null (client estimates) | Nightly job: compute account-level HealthScore for all active accounts (algorithm exists) | S / low |
| Rate limiting | in-memory Maps — correct for 1 Railway instance | Move to Redis **only when** scaling to 2+ instances (flag exists for BullMQ path) | M / med (later) |
| Scale path | SERVICE_ROLE + BULLMQ flags already built | Order: worker split → Redis → BullMQ → multi-API + Redis limits | staged |
| CSP `unsafe-inline` | acceptable now (no 3rd-party scripts) | Nonce-based CSP when client bundle lands | S / low (later) |

---

## 9. Prioritized Roadmap

### Wave 0 — launch week (zero-risk only)
| # | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| 0.1 | Verify Railway env vars (server fail-fasts by design) | XS | 5 | none |
| 0.2 | Watch logs: DASHBOARD_TIMEOUT, sync failures, client-errors | XS | 4 | none |
| 0.3 | Nightly health-score job (fills the «~» gauge with real scores) | S | 4 | low |

### Wave 1 — first 30 days (intelligence, no UI upheaval)
| # | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| 1.1 | Sync ad relevance rankings (3 fields) + translate to advice | S | **5** | low |
| 1.2 | CauseResolver: unified diagnosis (fatigue/auction/landing/creative) replacing sibling warnings | M | **5** | med — gate behind flag, A/B against current issues list |
| 1.3 | Weekly report → scheduled email (HTML of existing report) | M | 4 | low |
| 1.4 | Expose budget simulator (T11) as UI action on scale/pause cards | S | 4 | low |
| 1.5 | Insight translator module; migrate top-20 copy strings | S | 4 | low |
| 1.6 | Recommendation outcome tracking (acted? delta after 7d?) | M | 4 | low |

### Wave 2 — 30–60 days (Decision Center + creative intelligence)
| # | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| 2.1 | Decision Center feed (client merge → server endpoint) replacing 4 surfaces | M | **5** | med — keep old sections behind Advanced toggle during transition |
| 2.2 | Video funnel sync (thruplay, p25–p100, hook rate) + fatigue leading indicators (freq>3.5 ∧ engagement −25% baseline) | M | 4 | low |
| 2.3 | Creatives page (per-ad hook/hold/fatigue table + verdicts) | M | 4 | low |
| 2.4 | Landing funnel leak detector (link_clicks vs landing_page_view) | S | 3 | low |
| 2.5 | routes/ split of server.ts | M | 3 (velocity) | low |
| 2.6 | Confidence calibration from outcome data | M | 4 | low |

### Wave 3 — 60–90 days (proactive + guardrailed action)
| # | Item | Effort | Impact | Risk |
|---|---|---|---|---|
| 3.1 | Anomaly push (email → WhatsApp) with user thresholds (Moby pattern) | M | 5 | med |
| 3.2 | Guardrailed one-click actions: pause/budget±20% via Meta API, learning-phase brake, daily cap, undo, full audit log (MetaAuditLog exists) | L | **5** | **high** — feature-flag per workspace, opt-in, start pause-only |
| 3.3 | Monthly narrative report | S | 3 | low |
| 3.4 | Dashboard DTO cache + client bundle build | M | 3 | med |
| 3.5 | Benchmarks by objective/industry from IndustryProfile + anonymized aggregates | M | 4 | med (privacy review) |

---

## 10. Risk Register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unified diagnosis mislabels a cause → wrong advice | med | Confidence floor to show; always attach evidence; keep raw issues in Layer 5; calibrate vs outcomes (1.6) |
| Write-actions (3.2) damage a live account | low/high-impact | Opt-in flag, pause-only first, learning-phase brake, spend cap, undo window, audit log |
| New synced fields inflate Meta API usage → rate limits | med | Fields ride existing insight calls (same endpoint, more fields = ~zero extra calls); monitor `x-business-use-case-usage` (metaUsage tracking exists) |
| Decision Center confuses existing users | med | Transition period with old sections under Advanced; changelog in-app |
| Scope creep pre-launch | high | **This document authorizes nothing before launch except Wave 0.** |

---

## 11. Expected Impact Summary

- **Wave 1** turns the same synced data into *named causes with Meta's own diagnostics* — the "understanding, not numbers" promise becomes literal, at small effort.
- **Wave 2** collapses four "what should I do" surfaces into one authoritative feed and adds the creative leading indicators competitors charge $99+/mo for.
- **Wave 3** crosses the moat: from advisor to *guardrailed operator* — the Madgicx/Moby capability, delivered with the trust affordances (brakes, undo, evidence) that make SMBs actually enable it, in Arabic, for messaging-first campaigns nobody else scores correctly.

**North-star product test (every release):** a non-professional opens the dashboard and within 60 seconds can state — what happened, why, how serious, what to do next, and how confident the system is. If a change doesn't serve that sentence, it doesn't ship.
