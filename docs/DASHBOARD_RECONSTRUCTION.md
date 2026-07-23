# Dashboard Reconstruction — Audit, Verdicts, and What Shipped

Executed under full-authority mandate: rebuild the dashboard around decisions,
eliminate every duplicate, preserve all business logic. Companion to
`PRODUCT_EVOLUTION_ROADMAP.md` (market research + data taxonomy) and
`OVERNIGHT_PROGRESS.md` (the relevance-intelligence vertical).

## 1. UX / IA audit — the core finding

The dashboard had accreted 17 sections whose order reflected *when they were
built*, not *how a merchant thinks*. The reading order was inverted: raw
numbers (KPI grid) appeared before the summary (executive pulse), and the
single most important element — the diagnosed problem + its fix (main move) —
sat below four screens of metrics. Three pieces of information had two or
three homes each.

## 2. Redundancy report — every verdict

| Section | Verdict | Reason |
|---|---|---|
| Campaigns table (inside "التحليلات المتقدمة") | **REMOVED** | 1:1 duplicate of the /campaigns page — the textbook Phase-5 case. Detailed campaign management has exactly one home. |
| Spotlight (best campaign / opportunity) | **REMOVED** | Best-performer shown in 3 places: spotlight, weekly report highlights, AI recs scale card. Weekly + recs keep it (they add comparison / action). |
| AI context strip (4 pills) | **REMOVED** | Sync time + campaign count already live in the command bar; "window: 30d" is static noise. |
| Exec pulse score chip | already conditional | Hidden whenever the gauge shows the same number (previous round). |
| Window KPIs / weekly metrics dedup | done in previous rounds | Advanced panel shows only reach/frequency/clicks/CPC; weekly keeps only WoW-comparison metrics. |
| Live insights | **KEPT** | Distinct job: time-sensitive "what is happening now" items with freshness stamp. |
| Timeline | **KEPT** (self-hides) | Already hides when it carries only the sync ping. |
| Brain box (secondary tasks) | **KEPT** (self-hides) | Collapses to chart-only when it has nothing beyond the primary task. |
| Diagnoses panel (advanced) | **KEPT** | Evidence layer: extra diagnoses beyond the primary — progressive disclosure level 3. |

Dead code removed with the sections: `renderCampaignsTable`,
`renderSpotlight`, `deriveOpportunity`, `renderAiContextStrip`, their
safeRender calls, and every orphaned CSS rule (~9KB of source).

## 3. The new information architecture (Phase 6 hierarchy, applied literally)

```
 1. Command bar            chrome: greeting, health pill, sync, mode toggle
 2. Executive pulse        ما الوضع؟ one sentence + urgent-count + CTA
 3. Health gauge           كم هو خطير؟ score /100 + band + counters
 4. Main move              المشكلة الأهم: تشخيص + لماذا + حل + ثقة
 5. Predictions (alerts)   إنذارات مبكرة قبل أن تتأثر
 6. AI recommendations     الفرص وخطواتك القادمة (نفّذ الآن)
 7. Creative health strip  حكم Meta على إبداعاتك (يظهر عند الحاجة فقط)
 8. Quick actions          اختصارات بضغطة واحدة
 9. Live insights          ماذا يحدث الآن (سياق حي)
10. KPI cards + sparklines الأرقام التفصيلية — بعد القرار لا قبله
11. Spend chart (+ tasks)  الأدلة البصرية
12. Timeline               آخر الأحداث (يختفي إن كان فارغ المعنى)
13. Weekly report          المقارنة الأسبوعية
14. Advanced <details>     نبض مباشر · مؤشرات إضافية · اتجاهات · تشخيصات
```

Quick mode = layers 1–8 exactly (the executive layers). It previously hid the
main move — the decision itself — which contradicted its own purpose; fixed.

## 4. What was deliberately NOT rebuilt (risk honesty)

- **Other pages** (campaigns/ai/tasks/settings): already redesigned in earlier
  phases of this session under the same design system; the campaigns page is
  now the *only* home of campaign management, which this round strengthened.
- **Navigation/sidebar**: structurally sound (8 entries, one home per job).
  Candidate follow-up: fold the "المهام" page into the dashboard's decision
  layer — needs owner input on workflow, flagged not executed.
- **Charting library / component framework swap**: zero user value against
  regression risk on a live product overnight.

## 5. Verification performed

- `tsc --noEmit` clean after every step.
- Both pages' embedded client JS parsed via `new Function` harness (this
  caught a real would-be production breaker earlier in the session).
- Generated-HTML sanity: 182 ids, no true duplicates; section order matches
  the target IA.
- All unit suites re-run: relevance 16/16, offline-reply 14/14.

## 6. Remaining roadmap (priority order, from the full research)

1. Video/hook-rate creative intelligence (additive sync, same pattern as
   relevance rankings).
2. Fold المهام page into the decision layer (needs owner decision).
3. Weekly report → email (needs a Resend key).
4. Guardrailed Meta write-actions (opt-in, human-reviewed — never autonomous).
