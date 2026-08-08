# Ad-Analytics / Marketing-Intelligence SaaS: Competitive Study for Adlytic

**Prepared:** 2026-08-08
**Client context:** Adlytic — Arabic-first Meta Ads intelligence tool for small Iraqi SMBs (~15 clients). Campaign mix dominated by **click-to-WhatsApp / Messenger "messages" objectives**, not e-commerce purchases. Small spend, sparse data, no Shopify, no website conversion pixel in many cases.

---

## Method and evidence limits — read this first

This session's egress proxy **blocked direct page fetches to every vendor domain** (triplewhale.com, northbeam.io, madgicx.com, funnel.io, supermetrics.com, databox.com, whatagraph.com, and even wikipedia.org all returned `EGRESS_BLOCKED`). Verified via `curl $HTTPS_PROXY/__agentproxy/status` — the policy denies these hosts; this is not a TLS or config problem.

Consequently **all evidence below is derived from web search over vendor pages, vendor help-centre articles, and third-party review/comparison sites**, not from first-hand reading of the vendor pages themselves. I have:

- Marked every claim I could not corroborate as **"not publicly documented"** or **"not verified"**.
- Avoided inventing feature detail. Where a vendor's treatment of Meta campaign objectives or messaging conversions is simply not discussed anywhere in public material, I say so — this is itself a finding, and an important one for Adlytic.
- Flagged pricing as **indicative**; several of these vendors (Northbeam, Hyros, Sprinklr, Adverity, Smartly) do not publish prices at all, and the numbers circulating on review sites vary widely.

Two structural findings worth stating up front, because they recur in every section:

1. **Almost none of these tools document objective-aware behaviour.** The industry's public material talks about ROAS, CAC, AOV, LTV and purchase conversions. "Campaign objective" as a first-class classification concept is essentially absent from published documentation across the entire set. Rule engines (Revealbot, Madgicx, Optmyzr) expose whatever metrics the ad API returns, which *technically* includes messaging metrics, but nothing in their marketing or docs suggests the product *reasons* about objective.
2. **Nobody in this set is built for click-to-WhatsApp.** The only public tooling that handles CTWA properly comes from a different category entirely — conversational/CRM platforms (Infobip, respond.io) — not from ad-analytics SaaS. That is Adlytic's opening.

---

# Platform-by-platform

---

## 1. Triple Whale

**1. Campaign classification.** No public evidence of a Meta-objective-aware classification model. Triple Whale organises around **channel → campaign → ad set → ad** and around attribution models, not around campaign objective or optimization goal. There is no documented "campaign type" concept and no documented funnel-stage grouping (prospecting/retargeting) as a native taxonomy — users construct that with filters and naming conventions. *Objective-awareness: not publicly documented; assumed absent.*

**2. KPIs.** Emphatically **one-size-fits-all and e-commerce-shaped**: blended ROAS, MER, CAC, AOV, LTV, new-customer CAC, contribution margin. The Triple Pixel and the whole Summary page are built around *purchases*. Creative Analytics adds hook rate / thumb-stop rate. There is no documented KPI set that switches when the campaign objective changes.

**3. Funnel model.** Funnel analysis exists as a **paid add-on** (conversion analytics module: funnel analysis, site-search analytics) and is a **website/session funnel** — landing → product view → ATC → checkout → purchase. It is a Shopify session funnel, not an ad-delivery funnel (impression → click → landing). Drop-off is shown, but only for on-site steps.

**4. Explaining underperformance.** **Moby**, a conversational AI agent trained on data from a claimed 50,000+ brands and $82B+ GMV, plus an autonomous agent suite (Sonar Optimize, Compass). This is narrative/LLM explanation rather than deterministic diagnostics. Notably, independent reviewers report that **below roughly $5M revenue, Moby produces hallucinations and irrelevant suggestions** ([rule1 review](https://rule1.ai/articles/triple-whale-review)) — a direct warning for Adlytic's data scale.

**5. Benchmarks.** Has a real benchmarking product — **Triple Benchmarks / Trends**, documented in their KB ([kb.triplewhale.com Benchmarks Dashboard](https://kb.triplewhale.com/en/articles/6476726-benchmarks-dashboard)), covering **21+ product categories** sourced from the aggregate network. It is **peer-cohort benchmarking by vertical and size**, not own-account baselining. Whether they disclose per-cell sample size or confidence intervals is **not publicly documented** — the marketing emphasises the size of the total network ("50,000+ brands"), which is a headline number, not a per-cohort n.

**6. Recommendations.** Conversational (ask Moby) plus autonomous agents that can act. Evidence-linking exists in the sense that Moby cites the data it queried, but there is **no publicly documented severity ranking** of findings.

**7. Unique value.** Single pane of glass for a Shopify DTC brand: attribution + P&L + creative + retention + an AI analyst, pre-verticalized so it works day one without a data team.

**8. Pricing (indicative).** Free tier $0; Starter ~$179/mo annual (some sources ~$129–149); Advanced ~$259/mo annual; Enterprise custom above ~$20M GMV. Add-ons (Compass MMM, retention, conversion analytics) priced separately.

**Where it fails for a messages campaign:** completely. No purchase event = no ROAS = the entire Summary page, attribution engine, and benchmark set are blank or meaningless. There is no Shopify to connect. A "messaging conversations started" event has no home in the data model.

Sources: [Triple Whale pricing](https://www.triplewhale.com/pricing), [KB: Benchmarks](https://kb.triplewhale.com/en/articles/6476726-benchmarks-dashboard), [Benchmarks Are Back](https://www.triplewhale.com/blog/benchmarks-are-back), [rule1 review](https://rule1.ai/articles/triple-whale-review), [usermaven pricing](https://usermaven.com/blog/triple-whale-pricing)

---

## 2. Northbeam

**1. Campaign classification.** Channel- and campaign-level, driven by attribution modelling. No documented objective-awareness, no "campaign type" concept, no native funnel-stage taxonomy. Northbeam's organising axis is **attribution window and model** (first-touch, last-touch, linear, its own ML model), not campaign intent.

**2. KPIs.** Purchase-centric and *more* so than Triple Whale: attributed revenue, ROAS by model, CAC, new-customer ROAS, contribution margin. Northbeam's differentiator is claimed **methodological rigour** — deterministic view-through, holdout testing, fractional credit that never sums above actual sales. All of that machinery presupposes a revenue event.

**3. Funnel model.** Models the **customer journey across touchpoints** (multi-touch paths) rather than a delivery funnel with drop-off stages. It answers "which touchpoints contributed to this sale", not "where did users leak between impression and conversion".

**4. Explaining underperformance.** Primarily **analytical, not narrative**: you diagnose by comparing attribution models and running incrementality/holdout tests. Reviewers consistently note Northbeam has **no creative-intelligence module** comparable to Triple Whale's. AI narrative layer: not publicly documented to the depth Triple Whale's is.

**5. Benchmarks.** No public evidence of an industry-benchmark product. Northbeam's comparison baseline is **your own account across models and time**, plus holdout tests — arguably a *more* honest approach than peer benchmarks. Sample-size disclosure: not publicly documented.

**6. Recommendations.** Northbeam positions as a measurement source of truth; it surfaces data for humans and does **not** present itself as a one-click action tool. No documented severity ranking.

**7. Unique value.** Statistical credibility. It's the tool a brand buys when it stops trusting Meta's self-reported ROAS and has enough spend for modelling to converge.

**8. Pricing (indicative).** Not published. Third-party reports: from ~$1,000/mo, escalating past ~$2,500/mo at $1M+/month GMV.

**Where it fails for a messages campaign:** total failure, and worse than Triple Whale — the product *is* the attribution model, and there is no revenue to attribute. Also **statistically inapplicable at Iraqi SMB spend**: MMM, holdout tests and incrementality require volume that a ~$500/month advertiser will never produce.

Sources: [Improvado comparison](https://improvado.io/blog/northbeam-vs-triple-whale), [wetracked head-to-head](https://www.wetracked.io/post/northbeam-vs-triple-whale), [QRY attribution tools](https://www.weareqry.com/blog/marketing-attribution-tools-northbeam-vs-rockerbox-vs-triple-whale)

---

## 3. Hyros

**1. Campaign classification.** Organised around **funnels and traffic sources**, and notably around **lead/call stages** rather than product SKUs. Hyros is unusual in this set: it was built for high-ticket info-product and coaching funnels, where the conversion is a booked call, not a cart. No documented Meta-objective awareness, but the **non-purchase conversion model is native**, which is the closest structural analogue to Adlytic's messaging use case in this entire study.

**2. KPIs.** Revenue and ROAS remain primary, but the KPI chain includes **leads, calls booked, calls taken, qualified vs unqualified calls, close rate, attributed LTV**. This is a genuinely multi-stage, non-e-commerce KPI set. Not objective-aware in the Meta sense, but not purchase-only either.

**3. Funnel model.** The strongest explicit funnel of the group: ad → click → opt-in → call booked → call held → qualified → close, with tracking of **calls all the way to close** and attribution of the close back to the specific ad. Drop-off between stages is inherently visible.

**4. Explaining underperformance.** Positioned as a data-accuracy fix ("up to 50% more attribution than platform-native") plus a separate **AIR Agent** AI optimization product. Diagnostic narrative with evidence: not publicly documented in detail. Much of the "explanation" is delivered by their **1-to-1 dedicated data analyst**, i.e. humans, not software.

**5. Benchmarks.** No public evidence of an industry benchmark product. Baseline is your own account and your own attribution deltas.

**6. Recommendations.** AI ad optimization + human analyst. Severity ranking: not publicly documented.

**7. Unique value.** Cross-channel server-side tracking of **offline and conversational conversions** (calls, emails) that pixels miss, plus attributed LTV. The only vendor here whose core competence is "the conversion doesn't happen on a web page".

**8. Pricing (indicative).** Not published; demo-gated. Third-party reports: from ~$297/mo, commonly $799–$1,500/mo, agency tiers several thousand. AIR Agent ~$0.10/message, ~$50/mo floor.

**Where it fails for a messages campaign:** *conceptually* the closest fit — but practically inaccessible. The price floor alone exceeds many Iraqi SMBs' total monthly ad spend, it is call/phone-centric rather than WhatsApp-chat-centric, and it requires meaningful funnel instrumentation. **Its funnel model is nonetheless the single best thing in this study for Adlytic to learn from.**

Sources: [Hyros pricing](https://hyros.com/pricing-ai-tracking), [Hyros call tracking](https://hyros.com/call-tracking), [profitableads review](https://www.profitableads.com/hyros-review/), [adlibrary review](https://adlibrary.com/posts/hyros-review-2026)

---

## 4. Madgicx

**1. Campaign classification.** Meta-native, so it works at campaign/ad-set/ad level and inherits Meta's structure. Madgicx historically marketed an **"AI Audience"/persona and tactic taxonomy** and one-click "automation tactics" that encode best-practice strategies. Whether it branches logic on campaign objective is **not publicly documented**; the rule engine exposes Meta API metrics, so messaging metrics are likely *selectable* as rule conditions even if the product doesn't reason about them.

**2. KPIs.** ROAS/CPA-centric in all public material. Creative metrics via the Ad Creative Optimizer. No documented objective-aware KPI switching.

**3. Funnel model.** Not a funnel-analytics product. It models **audience/tactic coverage** (cold/warm/hot audience layers) rather than an impression→conversion drop-off funnel. Audience-layer thinking is a rough proxy for funnel stage and is the nearest thing to funnel-stage grouping in this set.

**4. Explaining underperformance.** **AI Marketer** — an AI agent that runs an **account audit surfacing weaknesses, opportunities and actionable insights**. This is the closest commercial analogue to what Adlytic wants to build: an automated diagnostic pass over a Meta account that outputs findings. Whether findings carry evidence trails or severity scores is **not publicly documented**.

**5. Benchmarks.** No documented industry-benchmark product. Baselines appear to be account-relative.

**6. Recommendations.** Explicitly **one-click**: one-click automation tactics, one-click reports, autonomous budget/bid actions. Low-expertise-friendly by design — "lets new advertisers deploy best-practice strategies without understanding complex rule logic". Severity ranking: not publicly documented.

**7. Unique value.** The most SMB-accessible AI Meta-ads copilot: cheap entry price, opinionated defaults, does the thinking for advertisers who can't write rules.

**8. Pricing (indicative).** From ~$49/mo; ~$99/mo up to $2,500 ad spend; ~$329/mo at $20–30K spend; $499+/mo agency. Tracking Pro +$49/mo per account. Flat fee, not % of spend. 20–25% annual discount.

**Where it fails for a messages campaign:** its recommendation library, audit heuristics and "best-practice tactics" are trained on and written for purchase/ROAS optimization. An audit that tells a WhatsApp advertiser to "improve ROAS" or "fix your catalog" is noise. But of all the platforms here, **Madgicx's product shape is the one Adlytic most resembles** — and its price band is the one Adlytic must beat.

Sources: [Madgicx pricing](https://madgicx.com/pricing), [adlibrary review](https://adlibrary.com/posts/madgicx-review-2026), [ai-cmo review](https://ai-cmo.net/tools/madgicx), [Superscale pricing breakdown](https://superscale.ai/alternatives/madgicx/pricing)

---

## 5. AdEspresso (by Hootsuite)

**1. Campaign classification.** Campaign creation and A/B-test-centric. Classification is by **experiment/variant**, not objective. Confirmed still operating in 2026 (acquired by Hootsuite Feb 2017), but described by reviewers as receiving **few meaningful updates**.

**2. KPIs.** Standard Meta delivery KPIs (CPC, CTR, CPM, cost per result, conversions). Because it reports "cost per result", it *inherits* Meta's objective-relative result definition — a low-effort form of objective-awareness that most competitors don't even have. Not verified as an intentional design choice.

**3. Funnel model.** No funnel model. Flat campaign reporting plus experiment comparison.

**4. Explaining underperformance.** A/B testing is the mechanism: you learn what underperforms by testing variants, not by diagnostics. Reviewers describe its **AI features as "thin"**.

**5. Benchmarks.** AdEspresso historically published widely-cited **public Facebook Ads cost benchmarks by industry/country** as marketing content. In-product cohort benchmarking: not publicly documented.

**6. Recommendations.** Basic optimization suggestions and automated rules. No documented evidence-linked or severity-ranked recommendation system.

**7. Unique value.** The cleanest **multi-variant A/B testing workflow** for Meta — better than native Ads Manager for structured experimentation, at mid-market price.

**8. Pricing (indicative).** Historically ~$49–$259/mo tiers; current 2026 pricing **not reliably verifiable** from search results. Mark as not publicly confirmed.

**Where it fails for a messages campaign:** less catastrophically than the DTC tools, because it's objective-agnostic delivery reporting rather than ROAS-locked. But it offers no messaging-specific insight, no funnel, no Arabic, and it is a stagnating product.

Sources: [adlibrary review](https://adlibrary.com/posts/adespresso-review-2026), [TrustRadius pricing](https://www.trustradius.com/products/adespresso/pricing), [Hootsuite acquisition](https://www.hootsuite.com/newsroom/press-releases/hootsuite-acquires-adespresso)

---

## 6. Revealbot (Bïrch)

**1. Campaign classification.** None beyond the ad platform's own hierarchy. Revealbot is a **rule engine**, not a classifier. It does, notably, expose a **"exclude learning phase ad sets"** condition — evidence that it models *delivery state* even though it doesn't model objective.

**2. KPIs.** Whatever the ad APIs return, used as **rule conditions**: ROAS, CPA, CTR, frequency, spend. Fully generic — which paradoxically makes it *more* usable for messaging campaigns than any DTC tool, since "cost per messaging conversation started" is an available Meta metric and can in principle be a rule condition. **Not verified** that this specific metric is selectable in their builder — search returned no documentation either way.

**3. Funnel model.** None. No drop-off analysis.

**4. Explaining underperformance.** Purely **rule-based alerting**: "if CPA > $25 AND frequency > 3.0 AND CTR < 1.2%, pause and notify Slack." No narrative, no AI explanation, no evidence synthesis. The human writes the diagnosis into the rule.

**5. Benchmarks.** None. Thresholds are hand-set by the user — which means the tool provides **zero help deciding what "bad" is**. This is the single biggest gap in the rule-engine category and a direct opportunity for Adlytic.

**6. Recommendations.** No recommendations — only **actions you pre-authorised**. Actions execute automatically (pause, scale budget, duplicate, alert). No severity ranking.

**7. Unique value.** The most flexible and reliable automation rule builder on the market: 15+ conditions per rule, AND/OR logic, rolling averages, time windows, 15-minute execution intervals, cross-platform.

**8. Pricing (indicative).** From $99/mo up to $10K managed ad spend; ~$399/mo at $100K. Spend-tiered. ~15–20% annual discount.

**Where it fails for a messages campaign:** it doesn't fail on data — it fails on **judgement**. It will happily automate a messaging campaign if you already know the right thresholds. Adlytic's SMBs don't. Also: $99/mo is expensive relative to their spend, and there's no Arabic.

Sources: [adlibrary Revealbot review](https://adlibrary.com/posts/revealbot-review-2026), [AdStellar pricing](https://www.adstellar.ai/blog/revealbot-pricing), [get-ryze review](https://www.get-ryze.ai/blog/revealbot-review-2026-facebook-ads-automation)

---

## 7. Smartly.io

**1. Campaign classification.** Enterprise campaign orchestration across Meta, Google, TikTok, Pinterest, Snapchat, Amazon, Reddit, Spotify, YouTube and 200+ CTV services. Organised around **campaign templates and automated buying rules**. Objective-awareness: **not publicly documented** at the granularity we need; the platform certainly *sets* objectives when launching, but there's no public evidence of objective-aware *analysis*.

**2. KPIs.** Cross-channel performance metrics, heavily creative-performance weighted. Their published proof points are creative-production metrics (1.9M assets generated, 30x faster production, 27% average performance lift). Not objective-aware in any documented way.

**3. Funnel model.** Not a funnel-analytics product. Three suites — **Creative, Media, Intelligence** — with Intelligence handling unified cross-channel analytics.

**4. Explaining underperformance.** AI-driven optimization within the Media suite; creative performance attribution within Intelligence. Diagnostic narrative with evidence: not publicly documented.

**5. Benchmarks.** Publishes aggregate performance claims from its customer base; an in-product cohort benchmarking feature is **not publicly documented**.

**6. Recommendations.** Automated media buying acts directly rather than recommending. One-click creative refresh at scale (e.g. Foot Locker refreshing 10,000+ product images in one click).

**7. Unique value.** Creative production at industrial scale, welded to automated cross-channel media buying. Nothing else does creative *generation* + *buying* + *measurement* in one loop.

**8. Pricing (indicative).** Not published. Third-party reports: from ~$2,500/mo, commonly €5k+/mo or a % of spend, with $4,000–5,000/mo effective minimums and median annual cost cited around $90k. Targets advertisers spending $50K+/month.

**Where it fails for a messages campaign:** irrelevant by scale, not just by objective. The minimum contract is roughly 100x an Iraqi SMB's annual ad spend. Not a competitor; a source of ideas only.

Sources: [adlibrary review](https://adlibrary.com/posts/smartly-io-review-2026), [checkthat pricing](https://checkthat.ai/brands/smartly/pricing), [Capterra](https://www.capterra.com/p/160821/Smartly/)

---

## 8. Sprinklr (Marketing / Advertising)

**1. Campaign classification.** Enterprise unified-CXM taxonomy — campaigns are classified within a broader governance model spanning Service, Social, Insights, Marketing and Advertising modules. Objective-aware ad analysis: **not publicly documented**.

**2. KPIs.** Cross-channel paid + owned + earned metrics, with AI-powered **asset allocation and budgeting insights**. Breadth over depth; not objective-specific.

**3. Funnel model.** Not documented as an ad-delivery funnel product. Sprinklr's funnel thinking sits in customer-journey/CXM terms.

**4. Explaining underperformance.** AI analytics that "identify successful campaigns that resonate with your target markets", plus AI-powered ad comment moderation. Evidence-linked diagnostics: not publicly documented.

**5. Benchmarks.** Sprinklr Insights (a separately-licensed module) does social listening and competitive benchmarking. Ad-performance cohort benchmarks with disclosed n: not publicly documented.

**6. Recommendations.** AI budget/asset allocation recommendations. Severity ranking: not publicly documented.

**7. Unique value.** One vendor for **paid ads + organic social + customer service + listening**. Interesting for Adlytic conceptually: Sprinklr is the only vendor here that treats **ad comments and inbound conversations as first-class**, which is structurally relevant to a WhatsApp/Messenger world — though implemented for enterprise contact centres.

**8. Pricing (indicative).** Quote-only. Vendr data cited: enterprise contracts from ~$50,000/yr, median ~$129,380/yr, tightly-scoped single-module from ~$26,000/yr. **Self-serve program and its 30-day trial discontinued 30 April 2026.**

**Where it fails for a messages campaign:** priced entirely out of reach. Its conversation-centricity is the only transferable idea.

Sources: [Chatarmin pricing analysis](https://chatarmin.com/en/blog/sprinklr-pricing), [getvoip pricing guide](https://getvoip.com/blog/sprinklr-pricing/), [Merciv](https://www.merciv.com/blog/sprinklr-insights-pricing)

---

## 9. Supermetrics

**1. Campaign classification.** **None — by design.** Supermetrics is an ETL/data-pipeline vendor. It moves fields; it does not interpret them. Campaign objective is available as a *field* from the Meta connector, so a Supermetrics user can group by it — but the product supplies no semantics.

**2. KPIs.** Any metric the source API exposes, including messaging metrics. No prioritisation, no opinion.

**3. Funnel model.** None. You build it downstream in Looker Studio / BigQuery / Sheets.

**4. Explaining underperformance.** New **AI Agents** (2026) that "explain marketing performance trends and provide actionable insights", plus ChatGPT/Claude integrations for natural-language querying. This is a recent, thin layer on top of a pipeline product.

**5. Benchmarks.** None.

**6. Recommendations.** Minimal; emerging via AI Agents. Not evidence-ranked.

**7. Unique value.** 100+ connectors, reliable extraction, plus a **Connector Builder** (Feb 2026) for custom sources. It is plumbing, and good plumbing.

**8. Pricing (indicative).** US tiers: Starter ~$37/mo, Growth ~$177/mo, Enterprise custom; other sources cite $29/mo single-connector and $159/mo Core. **Annual billing only as of 2026.** Charged per data source *and* per destination — costs compound fast.

**Where it fails for a messages campaign:** it doesn't fail, it just doesn't help. It will faithfully deliver `messaging_conversations_started` into a spreadsheet and leave the SMB owner exactly as confused as before. Relevant to Adlytic only as a **build-vs-buy consideration for the data layer** — and at Adlytic's scale, calling the Meta Marketing API directly is cheaper.

Sources: [Coefficient pricing guide](https://coefficient.io/supermetrics-pricing), [Coupler pricing guide](https://blog.coupler.io/supermetrics-pricing/), [Windsor pricing overview](https://windsor.ai/supermetrics-pricing-overview/)

---

## 10. Databox

**1. Campaign classification.** Generic KPI-dashboard tool across 100+ sources. No ad-objective concept. Classification is by **metric and data source**, plus user-defined goals.

**2. KPIs.** User-selected. Databox's opinion is expressed through **Goals** (target vs actual) and **Benchmarks**, not through a curated KPI set.

**3. Funnel model.** No native ad funnel. Users assemble funnel-shaped dashboards manually.

**4. Explaining underperformance.** **Alerts and goal-tracking** — threshold and anomaly notifications — plus performance summaries. Rule-based, not diagnostic-narrative.

**5. Benchmarks — the standout.** Databox has the **most methodologically transparent benchmarking in this entire study**, and it is the single most directly copyable idea for Adlytic. Per their help docs ([Benchmark your data](https://help.databox.com/benchmark-your-data), [How data is calculated in Benchmark Groups](https://help.databox.com/how-is-data-being-calculated-in-the-benchmark-groups)):
   - Benchmarks come from **anonymised, aggregated data from participating contributors** — a data co-op model where you contribute to see.
   - Groups are defined by **size, sector, revenue and business type**, or any combination.
   - The display shows **median, quartiles (top 25% / bottom 25%), lowest and highest values, and — critically — the contributor count**.
   - **Minimum participation thresholds must be met before data appears at all.**
   - Calculated monthly.

   That is: disclosed n, disclosed distribution rather than a single number, and a suppression rule for thin cells. Almost nobody else in this study does any of the three.

**6. Recommendations.** Percentile positioning tells you where you stand; it does not tell you what to do. No documented action recommendations.

**7. Unique value.** Cheap, broad, transparent peer benchmarking + goal tracking for SMBs and agencies.

**8. Pricing (indicative).** Free tier exists; paid tiers historically ~$47–$135+/mo scaling on data sources and users. **Current 2026 figures not verified** (site blocked).

**Where it fails for a messages campaign:** no messaging-specific benchmark cohorts, no Arabic, no Iraq/MENA peer set. But the *mechanism* — contribute-to-see, disclose n, suppress thin cells, show quartiles — is exactly what Adlytic needs.

Sources: [Databox: Benchmark your data](https://help.databox.com/benchmark-your-data), [Databox: How Benchmark Group data is calculated](https://help.databox.com/how-is-data-being-calculated-in-the-benchmark-groups), [Computan on Benchmark Groups](https://www.computan.com/blog/the-power-of-databox-benchmark-groups-in-business-and-marketing)

---

## 11. Whatagraph

**1. Campaign classification.** None. Reporting/visualisation layer over ~55 native integrations plus custom API. Classification is by **client, data source and widget**.

**2. KPIs.** Whatever the agency puts on the report. No opinion, no objective-awareness.

**3. Funnel model.** None natively; funnel-looking widgets can be assembled.

**4. Explaining underperformance.** Not its job. Whatagraph produces **white-labelled client reports**; the agency writes the explanation.

**5. Benchmarks.** None documented.

**6. Recommendations.** None.

**7. Unique value.** Fast, genuinely white-labelled, drag-and-drop client reporting with cross-source data blending — the agency-deliverable layer.

**8. Pricing (indicative).** Start ~$229/mo (annual), Boost ~$463/mo, Max from ~$812/mo, Enterprise custom. Priced on **source credits** — 20 credits on Start is exhausted by five clients × four sources.

**Where it fails for a messages campaign:** it will render messaging metrics in a chart. It provides zero intelligence. Relevant to Adlytic only as evidence that **agencies pay real money purely for presentation** — and that a source-credit pricing model punishes exactly Adlytic's many-small-clients shape.

Sources: [AgencyAnalytics on Whatagraph pricing](https://agencyanalytics.com/blog/whatagraph-pricing), [socialrails pricing](https://socialrails.com/blog/whatagraph-pricing), [Capterra](https://www.capterra.com/p/146220/Whatagraph/)

---

## 12. Funnel.io

**1. Campaign classification.** Despite the name, **not a funnel-analytics product**. It is an enterprise marketing data pipeline (590+ connectors) whose real strength is **normalisation**: harmonising field names, currencies, timezones and campaign naming across sources. It has strong **data-transformation and taxonomy tooling**, so a user *can* build an objective-based classification — but Funnel supplies the machinery, not the taxonomy.

**2. KPIs.** Source-agnostic. No curated set.

**3. Funnel model.** None as a UI concept.

**4. Explaining underperformance.** Not a diagnostic tool. Has **advanced measurement modules**: marketing mix modelling, digital attribution, incrementality testing — all requiring substantial data volume.

**5. Benchmarks.** None documented.

**6. Recommendations.** None. It does offer **data activation** (pushing conversions back via Meta Conversions API and Google Ads Conversions API), which is action-adjacent.

**7. Unique value.** Best-in-class connector breadth plus rigorous data normalisation, with governance (workspaces, roles, audit logs, SSO, regional data centres).

**8. Pricing (indicative).** Turbulent in 2026: free plan closed to new users Dec 2025; Starter raised to $400/mo in Feb 2026 then **cut back to $200/mo in March 2026 after customer pushback**. Priced on **flexpoints** scaling with connectors, destinations, data volume and reporting granularity. Tiers: Lite (<5 connectors), Business (5–20), Enterprise (20+ or €300k/mo spend).

**Where it fails for a messages campaign:** neutral, like Supermetrics. Its MMM/incrementality modules are **statistically inapplicable** at SMB spend. The **Conversions API activation** capability is the one genuinely interesting piece for CTWA — feeding downstream conversation outcomes back to Meta.

Sources: [MetricNexus pricing](https://metricnexus.ai/blog/funnel-io-pricing), [twominutereports pricing](https://twominutereports.com/blog/funnel-io-pricing), [dataslayer on the $400→$200 change](https://www.dataslayer.ai/blog/funnel-io-alternative-2026-why-marketing-teams-are-switching-to-fixed-price-solutions), [portermetrics review](https://portermetrics.com/en/compare/funnel-overview/)

---

## 13. Polar Analytics

**1. Campaign classification.** Shopify-centric, warehouse-native. Organised by **channel and acquisition metric**. No documented objective-awareness.

**2. KPIs.** Pre-built e-commerce dashboards: P&L, ad spend, **blended CAC, ROAS**, LTV, cohorts, product performance, inventory. Fully one-size-fits-all and purchase-locked.

**3. Funnel model.** Acquisition → retention framing rather than an impression-to-conversion drop-off funnel.

**4. Explaining underperformance.** **24/7 monitoring with Slack and email snapshots and alerts** — a genuinely good SMB-friendly pattern (push the insight to where the owner already is, don't wait for a dashboard visit). Plus AI-powered insights in the higher tier.

**5. Benchmarks.** Not publicly documented as a product feature.

**6. Recommendations.** Alert-driven. Severity ranking: not publicly documented.

**7. Unique value.** **Warehouse-native** (dedicated Snowflake per customer) analytics with first-party pixel and Klaviyo enrichment — you own your data and can extend it, without a data team.

**8. Pricing (indicative).** Analyze ~$300–350/mo; Analyze+Enrich ~$400/mo; Audiences $470/mo; AI-Analytics from ~$810/mo; ~$1,020/mo at $6M GMV with attribution; Enterprise custom above $20M GMV. Scales on **Monthly Tracked Orders**.

**Where it fails for a messages campaign:** completely — it is literally priced on *orders*, a unit that does not exist for a WhatsApp advertiser. The **Slack/email push-alert pattern** is the transferable idea (substitute WhatsApp).

Sources: [Polar on Shopify App Store](https://apps.shopify.com/polar-analytics), [MerchantFlow pricing](https://merchantflow.ai/compare/polar-analytics), [aisystemscommerce review](https://www.aisystemscommerce.com/post/polar-analytics-review-2026-warehouse-native-ecommerce-intelligence-omnichannel-brands)

---

## 14. Motion (motionapp.com)

**1. Campaign classification.** Classifies by **creative attribute**, not campaign structure: hooks, visual formats, messaging angles, talent, via AI tagging. This is a genuinely different and valuable classification axis — it answers "what kind of ad is this" rather than "where does it sit in the account tree". Objective-awareness: not publicly documented.

**2. KPIs.** Proprietary **stage-scores: Hook, Watch, Click, Conversion** — with explicit formulas (**Hook Rate = 3-second views / impressions; Hold Rate = ThruPlay / 3-second views**). This is the most **funnel-shaped KPI system in the study**, and crucially the first three stages are **objective-independent**: they work identically for a purchase campaign and a WhatsApp campaign, because they measure attention, not commerce.

**3. Funnel model.** The **attention funnel**: impression → 3-sec view → thruplay → click → conversion, with a named score per stage. Drop-off between stages is the core diagnostic — a weak Hook Rate localises the problem to the first three seconds; a strong hook with weak click localises it to the message-to-offer bridge. **This is the best funnel model in this study for Adlytic's purposes.**

**4. Explaining underperformance.** Diagnosis-by-localisation: side-by-side creative comparison with metrics **overlaid directly on the visual asset**, so the evidence is the ad itself. Plus an **Inspo** section of competitor ads from public ad libraries.

**5. Benchmarks — the second standout, and the most statistically honest in this study.** Motion's [Creative Benchmarks 2026](https://motionapp.com/thumbstop-pulse/creative-benchmarks-2026) discloses methodology openly: **578,750 creatives, 6,015 advertiser accounts, $1.29B spend**, with an explicit definition of a "winner" (spends ≥10× its account median **and** ≥$500 total). They publish **hit rate by spend tier — ~3.8% for Micro accounts (<$10K/month) rising to ~8.2% for Enterprise ($1M+/month)** — and then, remarkably, **warn against misreading their own numbers**: a low hit rate is "a statistical feature of how Meta distributes spend, not proof of weak creative", and formats should not be judged on hit rate without absolute volume context ([Winners are rare](https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare)). They explicitly note that accounts that test more will show *lower* hit rates.

   Two lessons for Adlytic: **(a) benchmark cohorts must be segmented by spend tier**, because performance distributions differ materially by account size; **(b) publishing the caveat alongside the number builds more trust than the number alone.**

**6. Recommendations.** Insight-first rather than action-first: Motion tells you which creative works and why, and you act in Ads Manager. No one-click actions documented. No severity ranking documented.

**7. Unique value.** The creative feedback loop. Connecting creative *attributes* to performance at scale is something no attribution tool does, and it is directly actionable by the person making the ads.

**8. Pricing (indicative).** From **$250/mo** for brands spending up to $50,000/month; Pro and Growth custom for $50K+ and $250K+ monthly spend. 2,100+ teams, $14B annual ad spend analysed.

**Where it fails for a messages campaign:** its Conversion score assumes a purchase/conversion event, so the bottom of its funnel breaks. **But the top three-quarters — Hook, Watch, Click — transfer perfectly to CTWA**, because a WhatsApp advertiser has exactly the same attention problem. Motion is the platform Adlytic should study hardest.

Sources: [Motion FAQ](https://motionapp.com/faq), [Creative Benchmarks 2026](https://motionapp.com/thumbstop-pulse/creative-benchmarks-2026), [Winners are rare](https://motionapp.com/library/research/creative-benchmarks-2026/winners-are-rare), [rule1 review](https://rule1.ai/articles/motion-app-review), [Foxwell takeaways](https://www.foxwelldigital.com/blog/motion-creative-benchmarks-2026-8-key-takeaways)

---

## 15. Lifetimely (by AMP)

**1. Campaign classification.** Channel and campaign drill-down layered on **cohort definitions**: acquisition date, first product, channel, geography. Cohort-as-classification is a distinctive axis. No objective-awareness.

**2. KPIs.** LTV, CAC, contribution profit, payback period, repeat rate. Deeply purchase-locked — LTV has no meaning without repeat orders.

**3. Funnel model.** **Temporal rather than spatial**: instead of impression→click→conversion, Lifetimely models value accumulation over time per cohort. A different and underused framing.

**4. Explaining underperformance.** Cohort comparison — this month's acquisitions vs last quarter's at the same age. Predictive LTV model built on a claimed $100B+ GMV across 45,000+ stores. No documented narrative diagnostics.

**5. Benchmarks.** The predictive LTV model is trained on cross-store data, which is benchmark-adjacent, but no user-facing peer-benchmark product is documented and no sample-size disclosure per cohort is documented.

**6. Recommendations.** Minimal. It is an analysis tool.

**7. Unique value.** The best cheap answer to "how much can I afford to pay for a customer?" — and a **genuinely generous free tier**.

**8. Pricing (indicative).** **Free up to 50 orders/month with all features** — the most generous free tier in the category. First paid tier $149/mo; higher tier $299/mo with a dedicated Slack channel.

**Where it fails for a messages campaign:** entirely, on data. No orders, no LTV. **But the strategic idea transfers and matters enormously**: an Iraqi restaurant or clinic acquiring customers via WhatsApp has repeat business too, and "what is a WhatsApp lead worth over 6 months" is the question that would let Adlytic's clients rationally set a cost-per-conversation target. The **freemium-by-volume pricing model** is also the single most relevant pricing lesson in this study for a market with low willingness to pay.

Sources: [Lifetimely on Shopify App Store](https://apps.shopify.com/lifetimely-lifetime-value-and-profit-analytics), [AMP analytics product page](https://useamp.com/products/analytics), [ATTN review](https://www.attnagency.com/blog/lifetimely-shopify-review)

---

## 16. Optmyzr

**1. Campaign classification.** Google-Ads-first (with Meta/Microsoft/Amazon support). Classification is by **account structure and campaign type** — and notably Google Ads *does* have a strong native campaign-type concept (Search, Shopping, PMax, Display), which Optmyzr respects with **type-specific tooling** (dedicated Shopping campaign management, PMax-specific optimizations). **This is the closest thing in the study to genuine "campaign type awareness" — the recommendation set changes based on what kind of campaign it is.** That is precisely the pattern Adlytic wants, applied to Meta objectives instead of Google campaign types.

**2. KPIs.** PPC-standard: CPA, ROAS, impression share, quality score, search-term waste. Type-aware in that Shopping and PMax get different metric emphases.

**3. Funnel model.** No drop-off funnel. Keyword → click → conversion, flat.

**4. Explaining underperformance.** **PPC audits** that surface account health issues and performance trends, plus the **Rule Engine** — a visual if/then builder positioned as "Google Ads scripts without code". Blends rule-based alerting with structured audit findings.

**5. Benchmarks.** Optmyzr publishes PPC benchmark research; an in-product cohort-benchmark feature is **not publicly documented**.

**6. Recommendations.** The clearest **one-click optimization** model in the study: recommendations like "pause these underperforming keywords" or "adjust these bids" are surfaced as reviewable suggestions you accept with one click. **Human-in-the-loop by design** — suggest, show the data, let the human approve. Severity ranking: not publicly documented, though findings are grouped by optimization type.

**7. Unique value.** Suggest-then-approve automation for PPC professionals: more opinionated than Revealbot, more controllable than fully-autonomous tools.

**8. Pricing (indicative).** Essentials from ~$299/mo (usage-based); Premium ~$389/mo; some sources cite ~$249/mo entry; enterprise tiers can exceed $1,000/mo. Scales on ad spend and account count.

**Where it fails for a messages campaign:** it's a Google Ads product first; Meta support is secondary and its heuristic library is keyword/search-centric. Irrelevant to CTWA directly. **The suggest-with-evidence-then-one-click-approve interaction model is its transferable gift.**

Sources: [paceads review](https://paceads.com/blog/optmyzr-review-2026-pricing-features-and-where-it-breaks), [groas cost breakdown](https://www.groas.com/post/optmyzr-pricing-review-2026-cost-breakdown-vs-groas-autonomous-management), [Capterra](https://www.capterra.com/p/156308/Optmyzr/)

---

## 17. Adverity

**1. Campaign classification.** Enterprise data-integration platform (600+ connectors). Offers **automated transformations and governance controls** so a customer can impose their own taxonomy — including objective-based grouping — but ships no ad-domain taxonomy of its own.

**2. KPIs.** Source-agnostic.

**3. Funnel model.** None.

**4. Explaining underperformance.** **Adverity Intelligence** — AI plus conversational interfaces ("Data Conversations", Notebooks) letting users query in plain English — plus **automated data-quality monitoring**, which is a genuinely distinctive form of diagnostics: it tells you when your *data* is broken, not just your campaigns. For Adlytic, "your pixel/tracking is broken" is often the real answer, and few competitors surface it.

**5. Benchmarks.** None documented.

**6. Recommendations.** AI-driven insights; not action-oriented.

**7. Unique value.** Connector breadth + data-quality monitoring + conversational querying for enterprise data teams.

**8. Pricing.** **Not published.** Custom, based on data volume, source count, seats and support tier. G2 reviewers describe it as expensive and note it "massively scales up costs when having multiple accounts" — a warning about multi-client pricing shapes.

**Where it fails for a messages campaign:** not applicable at this scale. **Data-quality monitoring as a first-class feature is the one idea worth stealing.**

Sources: [Improvado on Adverity](https://improvado.io/blog/adverity-reviews), [Capterra](https://www.capterra.com/p/162524/DataTap/), [Gartner Peer Insights](https://www.gartner.com/reviews/product/adverity-1761777242)

---

## Bonus: what actually serves click-to-WhatsApp today

Because the answer to "who handles messaging objectives well?" turned out to be "nobody in the ad-analytics category", it's worth naming who does:

- **Infobip — Meta Ads Reporting for Business Messaging**: tracks chat initiation, response time, conversion rate, **cost per conversation**, and ROAS by tying Meta ad data to the conversation platform. ([Infobip docs](https://www.infobip.com/docs/integrations/meta-ads-reporting-for-business-messaging))
- **respond.io**: Paid Ads attribution inside Contacts and Lifecycle reports — shows which WhatsApp ad campaigns produce leads and tracks them **New Lead → Paying Customer**. ([respond.io](https://respond.io/blog/click-to-whatsapp-ads))
- **Meta Conversions API for CTWA**: the sanctioned mechanism for feeding post-conversation outcomes (qualified lead, sale) back to Meta so the algorithm optimises toward business value rather than raw conversation count. ([Meta CAPI for CTWA](https://academy.insiderone.com/docs/meta-conversions-api-for-click-to-whatsapp-ads))

The strategic read: these are **conversation-platform vendors reaching backwards into ad reporting**. Their weakness is that they are messaging infrastructure first — they report, they don't diagnose, and they require the client to run their inbox. **Adlytic can come from the opposite direction: ad intelligence first, conversation-aware by design.** That is a defensible position that no vendor in the main study occupies.

Key metric definition to build on: **"Messaging Conversations Started"** counts each time a *unique* user initiates a chat after clicking the ad — note the deduplication, which matters for how Adlytic computes cost-per-conversation and why it will diverge from click counts.

---

# Comparison matrix

| Platform | Campaign Classification | KPI System | Funnel Model | Benchmarking | Recommendations | AI | Unique Value |
|---|---|---|---|---|---|---|---|
| **Triple Whale** | Channel/campaign + attribution model. No objective concept | One-size-fits-all, purchase-locked (ROAS, MER, CAC, AOV, LTV) | On-site session funnel (paid add-on); no delivery funnel | Peer cohorts, 21+ categories, 50k+ brands; **n per cohort not documented** | Conversational; no severity ranking | **Moby** agent + autonomous agents; hallucinates below ~$5M rev | Verticalized DTC all-in-one |
| **Northbeam** | Channel + attribution model | Purchase-only, model-rigorous | Multi-touch journey, not drop-off | Own-account + holdout tests; no industry benchmarks | Measurement, not actions | Modelling-led, minimal narrative | Statistical credibility |
| **Hyros** | Funnel + traffic source; **non-purchase conversions native** | Multi-stage: leads → calls → qualified → close, + attributed LTV | **Best explicit multi-stage funnel** (ad→call→close) | Own-account attribution deltas | AIR Agent + human analyst | AIR Agent (~$0.10/msg) | Tracks conversions that don't happen on a page |
| **Madgicx** | Meta-native + audience/tactic layers | ROAS/CPA-centric | Audience layers (cold/warm/hot) as funnel proxy | Not documented | **One-click tactics**; no severity ranking | **AI Marketer** account audit | Cheapest AI Meta copilot for SMBs |
| **AdEspresso** | By experiment/variant | Delivery metrics incl. Meta "cost per result" (objective-relative by inheritance) | None | Public industry cost benchmarks (content, not in-product) | Basic rules | "Thin" per reviewers | Best multi-variant A/B testing |
| **Revealbot** | None — ad-platform hierarchy only (+ learning-phase state) | Fully generic; any API metric as rule condition | None | **None — user sets all thresholds** | Pre-authorised auto-actions only | None | Most flexible rule engine |
| **Smartly.io** | Enterprise orchestration, cross-channel | Cross-channel, creative-weighted | None | Aggregate claims only | Automated buying acts directly | Creative gen AI (AI Studio) | Creative production × automated buying |
| **Sprinklr** | Enterprise CXM taxonomy | Broad paid+owned+earned | CXM journey, not ad funnel | Insights module (separate license) | AI budget/asset allocation | Yes, broad | Ads + service + listening in one |
| **Supermetrics** | **None (ETL)** — objective available as a raw field | Any metric, no opinion | None | None | Emerging AI Agents | AI Agents + ChatGPT/Claude integration | Connector breadth, Connector Builder |
| **Databox** | Metric/source + user goals | User-selected + Goals | None native | **Best-in-class: contributor counts, quartiles, minimum-participation thresholds** | Percentile positioning only | Limited | **Transparent peer benchmarks** |
| **Whatagraph** | Client/source/widget | Whatever's on the report | None | None | None | Minimal | White-label client reporting |
| **Funnel.io** | Normalisation/taxonomy machinery, no shipped taxonomy | Source-agnostic | **None despite the name** | None | Data activation via Meta/Google CAPI | Limited | Normalisation + governance at 590+ connectors |
| **Polar Analytics** | Channel, Shopify-centric | Purchase-locked (CAC, ROAS, LTV) | Acquisition → retention | Not documented | **Slack/email push alerts 24/7** | AI insights in top tier | Warehouse-native (own Snowflake) |
| **Motion** | **By creative attribute** (hook, format, angle, talent) via AI tagging | **Stage scores: Hook / Watch / Click / Conversion** — first 3 objective-independent | **Best attention funnel** w/ explicit drop-off (Hook Rate, Hold Rate) | **Most honest: 578,750 creatives, 6,015 accounts, $1.29B; hit rate by spend tier; publishes caveats against misreading** | Insight-first, act elsewhere | AI creative tagging | Creative attribute → performance loop |
| **Lifetimely** | Cohort (date, first product, channel, geo) | LTV/CAC/payback, purchase-locked | **Temporal** (value over cohort age) | Predictive model on $100B+ GMV; no user-facing benchmarks | Minimal | Predictive LTV | "What can I afford to pay?" + **generous free tier** |
| **Optmyzr** | **Campaign-type-aware** (Search/Shopping/PMax get different tooling) | PPC-standard, type-weighted | None | Published research, not in-product | **Suggest → show evidence → one-click approve** | Rule engine + audits | Human-in-the-loop PPC automation |
| **Adverity** | Customer-defined via transformations | Source-agnostic | None | None | AI insights, not actions | **Data Conversations** NL querying + **data-quality monitoring** | Enterprise data quality + governance |

---

# What Adlytic should adopt

Prioritised. P0 items are the differentiators; P1 are strong supports; P2 are later.

### P0-1. Make campaign objective the primary classification axis — nobody else does
This is the clearest unoccupied position in the entire market. Across 17 platforms, **objective-aware analysis is essentially undocumented**. Concretely:

- Store and display **both** Meta's *campaign objective* (e.g. Engagement/Messages, Traffic, Leads) **and** the ad set's *optimization goal* (e.g. Conversations, Link Clicks, Landing Page Views). These diverge constantly and the divergence is itself a finding: a "Messages" campaign optimising for link clicks is a misconfiguration Adlytic can detect and explain in one sentence.
- Build a **campaign-type taxonomy** — the Optmyzr pattern applied to Meta. `Messages/WhatsApp`, `Messages/Messenger`, `Traffic`, `Leads`, `Engagement`, `Awareness`, `Sales`. Every downstream behaviour (KPI set, thresholds, diagnostics, benchmark cohort) keys off this type.
- **Refuse to show inapplicable KPIs.** A messages campaign should never render a ROAS column. Showing a blank or zero ROAS teaches SMB owners that the tool is broken.

### P0-2. Ship an objective-aware KPI ladder, with the messaging ladder as the flagship
Steal Motion's stage-score structure, replace its bottom stage:

> **Impression → 3-sec view (Hook Rate) → ThruPlay (Hold Rate) → Link Click (CTR) → Conversation Started (Conversion-to-Chat Rate) → First Reply → Qualified Lead → Sale**

The first four stages come free from the Meta API and are **objective-independent** — they work for a Baghdad clothing shop exactly as they work for a US DTC brand. Stages 5–7 are Adlytic's proprietary layer and require either a WhatsApp Business API connection or lightweight manual client input.

Publish the formulas openly the way Motion does (`Hook Rate = 3-second views / impressions`). Transparent formulas build trust with sceptical small advertisers far faster than a black-box score.

### P0-3. Diagnose by localising the drop-off, not by narrating
This is the highest-value idea in the study and it is nearly free to implement. Because the funnel is a chain of ratios, **underperformance always localises to one link**:

| Where the ratio breaks | What it means | What to tell the client (in Arabic) |
|---|---|---|
| Low Hook Rate | Creative fails in 3 seconds | Change the opening frame/thumbnail |
| Good Hook, low Hold | Message loses them mid-video | Shorten; front-load the offer |
| Good Hold, low CTR | Interest without intent | Weak/unclear call to action |
| Good CTR, low Conversation Start | They clicked but didn't message | Broken deep-link, wrong number, WhatsApp not configured, slow load |
| Conversations start, no replies | **Business-side failure, not ad failure** | Your team isn't answering fast enough |

That last row is critical and nothing in this study can produce it. For an Iraqi SMB, **the single most common cause of "my ads don't work" is likely a slow or absent reply on WhatsApp, not the campaign.** A tool that can say "your ads delivered 84 conversations; 51 were never answered" delivers more value than every attribution model in this report combined.

Every finding must ship with its **evidence trail**: the metric, its value, the comparison baseline, the time window, and the sample size behind it. Optmyzr's suggest-with-evidence and Motion's metrics-overlaid-on-the-creative are the interaction references.

### P0-4. Own-account baselines first; peer benchmarks only with disclosed n and suppression
The most defensible statistical position at ~15 clients and small spend. Adopt **Databox's disclosure discipline** and **Motion's spend-tier segmentation**:

- **Primary baseline = the account's own trailing distribution.** "This ad set's cost per conversation is 3,200 IQD; your own 90-day median is 1,900 IQD." This needs no peer data, is immune to sample-size objections, and is what the client actually cares about.
- **Peer benchmarks are P1, and gated.** Do not display a cohort benchmark unless a **minimum participation threshold** is met (Databox's rule). Suggest ≥5 distinct accounts *and* ≥ some minimum conversation volume per cell.
- **Show a distribution, not a number**: median plus quartiles. A single "industry average CPM" is the most misleading artefact in this whole industry.
- **Always print the n.** "Based on 7 Iraqi retail accounts, last 30 days."
- **Segment cohorts by spend tier**, per Motion's finding that hit rates differ ~2x between micro and enterprise accounts. Comparing a $200/month advertiser to a $5,000/month one is malpractice.
- **Suppress, don't guess.** When data is thin, say "not enough data yet" — Motion publishes caveats against misreading its own benchmarks and gains credibility for it. Adlytic serves clients who have been burned by confident-sounding agencies; honesty is a product feature.

### P0-5. Explicit statistical-confidence gating on every claim
Adlytic's defining constraint is small n. Turn it into a feature. Every insight card carries a state:

- **Confident** — enough conversions/spend/days to act.
- **Early signal** — directionally interesting, keep watching.
- **Not enough data** — say so, and say *how much longer* or *how much more spend* is needed to know.

Simple rules (e.g. suppress cost-per-conversation comparisons below ~20–30 conversations, suppress creative comparisons below a minimum impression floor, never call a winner inside the learning phase — Revealbot's `exclude learning phase` condition is the precedent) will prevent the failure mode reviewers report for Triple Whale's Moby at small scale: **confident nonsense**.

### P1-6. Deliver via WhatsApp, not a dashboard
Polar Analytics pushes snapshots and alerts to Slack and email because owners don't log into dashboards. Adlytic's clients don't use Slack — **they live in WhatsApp**. A weekly Arabic WhatsApp summary plus threshold alerts ("your cost per conversation doubled yesterday") is probably a bigger retention driver than the web app. This also matches the language and literacy reality of the market far better than a dense BI interface.

### P1-7. Severity-ranked, evidence-backed, human-approved recommendations
Combine Optmyzr's approve-flow with Madgicx's accessibility:

- Rank findings by **estimated wasted spend**, not by rule order. An SMB spending $300/month can act on maybe two things a week; showing 15 findings is showing none.
- Every recommendation: **what, why (with the numbers), how confident, expected effect, and one button**.
- **Human-in-the-loop, always.** Do not auto-pause campaigns for clients who don't fully understand what happened. Trust is the scarcest resource with 15 clients.

### P1-8. Data-quality / configuration diagnostics as a first-class feature
Adverity's insight generalises: often the problem is the **setup**, not the performance. For CTWA specifically these checks are cheap and high-value — WhatsApp number not connected, wrong optimization goal for the objective, ad set stuck in learning, budget too low to exit learning, audience overlap, no creative rotation, campaign with zero delivery. This is a checklist, not ML, and it will produce most of Adlytic's early wins.

### P2-9. Creative-attribute tagging (the Motion play, Arabic-aware)
Tag creatives by attribute — offer type, Arabic dialect used, price shown or not, product shot vs lifestyle, human face vs none, text overlay density — and correlate with Hook Rate and Conversation Rate. Aggregated across 15 clients this becomes **proprietary Iraqi-market creative knowledge that no global vendor can replicate**. Start with manual tagging; automate later.

### P2-10. Lead-value modelling (the Lifetimely idea, transposed)
Once conversation outcomes are captured, model **value per conversation** by client and vertical, so the tool can compute a defensible target cost-per-conversation and finally answer "am I actually making money?" — the question ROAS answers for e-commerce and nothing currently answers for WhatsApp advertisers.

### P2-11. Meta Conversions API for CTWA
Feed qualified-lead and sale events back to Meta so campaigns optimise toward business value rather than raw conversation volume. Funnel.io's data-activation module and Meta's own CTWA CAPI docs are the pattern. Genuinely differentiating, and it makes Adlytic causally responsible for improvement rather than merely descriptive.

### P2-12. Pricing: follow Lifetimely, not Whatagraph
Lifetimely's **free-up-to-50-orders/month, all features** tier is the right shape for a low-willingness-to-pay market: free below a usage floor, paid above it, with the floor set so a genuinely tiny advertiser pays nothing and a growing one converts naturally. Explicitly avoid **Whatagraph's source-credit** and **Polar's per-order** models — both punish exactly Adlytic's many-small-clients profile. Benchmark price ceiling: Madgicx's ~$49/mo entry is the number Adlytic must sit well below.

---

# What Adlytic should deliberately NOT copy

### 1. ROAS, MER, AOV and blended-CAC as headline KPIs
The organising metrics of Triple Whale, Northbeam, Polar and Lifetimely. **There is no purchase event, no order value, and no cart.** Adopting ROAS-shaped KPIs would force fabricated revenue inputs and produce numbers no one can act on. Adlytic's headline metric should be **cost per qualified conversation**, and eventually **cost per closed sale from conversation** — both of which require the client to tell the tool what happened after the chat.

### 2. Multi-touch attribution and pixel-based journey stitching
Northbeam's and Triple Whale's core technology. It does not transfer: there is often **no website at all**, so no pixel, no session, no journey to stitch. The conversion happens inside WhatsApp, which is end-to-end encrypted and outside any pixel's reach. Building attribution infrastructure would be the single most expensive wrong turn available.

### 3. Marketing mix modelling, incrementality tests and holdout experiments
Northbeam's and Funnel.io's premium modules. These require **orders of magnitude more data than an Iraqi SMB will ever generate**. MMM on a $400/month account is numerology. Adlytic should not ship it, and should be prepared to explain why when a client asks for "the thing the American tool has".

### 4. LLM-narrated insight without data-sufficiency gating
The most dangerous idea here. Reviewers report Triple Whale's Moby **hallucinating and producing irrelevant suggestions below ~$5M revenue** — and *every* Adlytic client is far below that line. An AI that generates fluent Arabic explanations of statistically meaningless fluctuations will destroy trust faster than no AI at all. Use the LLM for **translation, phrasing and tone** over deterministically-computed findings; never let it invent the finding. Constrain it to a fixed diagnostic template with the numbers injected.

### 5. Global "industry average" benchmarks
CTR/CPM/CPC benchmarks published by AdEspresso, Optmyzr and others are dominated by US/EU e-commerce. **Iraqi CPMs, CTRs and cost-per-conversation are structurally different** — different auction density, different purchasing power, different device and connectivity mix, different content norms. Importing a foreign benchmark would make almost every Iraqi client look artificially good or bad at random. Own-account baselines first; local cohorts only when n permits.

### 6. Fully autonomous auto-pause / auto-scale
Revealbot's, Madgicx's and Smartly's model. At small spend the **variance is enormous** — a single day's noise can trip any sane threshold. Auto-pausing a campaign that was merely having a bad Tuesday, for a client who doesn't understand what happened, is an unrecoverable trust failure. Recommend and require approval.

### 7. Complex rule builders as the primary interface
Revealbot's 15-conditions-with-AND/OR builder assumes a professional media buyer. Adlytic's users are shop and clinic owners. Even Madgicx concedes this, marketing "one-click tactics" precisely so users **don't** have to understand rule logic. Adlytic should ship opinionated defaults and never require a user to author a boolean expression.

### 8. Per-data-source or per-order pricing
Whatagraph's source credits, Polar's monthly tracked orders, Supermetrics' per-source-and-per-destination charging. All three punish the many-small-accounts shape, and per-order pricing is meaningless without orders. Adverity reviewers' complaint that costs "massively scale up when having multiple accounts" is the exact trap.

### 9. Dashboard-first delivery
Triple Whale, Polar and Databox assume a user who opens a BI tool. Adlytic's users will not, reliably. Build the insight-delivery channel (WhatsApp/Arabic summary) as the primary surface and treat the dashboard as the depth layer.

### 10. Feature breadth as a strategy
Sprinklr, Smartly and Adverity win enterprise deals on surface area. With 15 clients, breadth is fatal. **One thing done uniquely well — objective-aware messaging-campaign diagnostics in Arabic with honest statistics — beats twenty features done adequately.**

### 11. Attributed LTV and cohort retention modelling — *yet*
Lifetimely's core. Right idea, wrong sequencing. It requires outcome data Adlytic does not yet collect. Build the conversation-outcome capture loop first (P0-2 stages 5–7); the LTV layer becomes possible and valuable only afterwards.

---

## Closing read

The competitive landscape splits cleanly into four groups, and **all four leave the same gap open**:

1. **DTC attribution** (Triple Whale, Northbeam, Polar, Lifetimely) — sophisticated, expensive, and structurally dependent on a purchase event Adlytic's clients don't have.
2. **Meta automation** (Madgicx, Revealbot, AdEspresso, Optmyzr) — mechanically capable of handling messaging metrics, but supplying no judgement about what those metrics *should* be, and priced from $49–$299/month.
3. **Data plumbing** (Supermetrics, Funnel.io, Adverity, Whatagraph, Databox) — objective-neutral, insight-free. Databox's benchmark transparency is the one jewel.
4. **Enterprise** (Smartly, Sprinklr) — irrelevant by price.

The gap: **objective-aware, funnel-localised, statistically-honest diagnostics for messaging campaigns, in Arabic, at SMB spend.** Three of the best mechanisms Adlytic needs already exist and are proven — Motion's stage-score attention funnel, Databox's disclosed-n benchmark discipline, and Optmyzr's suggest-with-evidence-then-approve loop — but **no one has assembled them for a non-e-commerce, non-English, low-data market.** That combination, plus the conversation-side data no ad platform can see (reply rates, unanswered chats, qualified leads), is a genuinely defensible product.

**Caveat repeated:** vendor pages were unreachable from this environment. Before making build decisions on any single vendor claim above — particularly the "not publicly documented" items around objective-awareness — verify directly against vendor documentation or a trial account.
