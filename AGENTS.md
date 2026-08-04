# Adlytic — Agent Instructions

## GG protocol (mandatory)

When the user's message ends with **`GG`** (or contains a clear `GG` directive at the end):

1. **Maximal skill mode is ON** for that turn.
2. **Use every relevant installed skill** under `.claude/skills/` that can improve the result — do not stop at one skill if several apply.
3. Prefer the Adlytic shortlist first, then expand:
   - SaaS: `saas-scaffolder`, `stripe-payments`, `saas-metrics-coach`, `feature-flags-architect`
   - Analytics: `product-analytics`, `campaign-analytics`, `data-quality-auditor`, `analytics-engineer`, `d3js-visualization`, `creating-dashboards`
   - UI: `taste-saas`, `ayla-saas-admin-ui`, `magicui-patterns`, `tremor-patterns`, `frontend-design`, `design-auditor`, `ux-audit`
   - Process: `writing-plans`, `executing-plans`, `verification-before-completion`, `systematic-debugging`
4. **If a needed capability is missing locally**, fetch/install skills from outside the repo (GitHub skill repos, registries, ZIP sources listed in `.claude/skills/ADLYTIC_SKILLS_CATALOG.md`) and use them in the same turn when practical.
5. Still respect stack reality: Adlytic is Hono + server-rendered HTML + Chart.js (RTL). **Port patterns** from React/Tailwind skills; do not force a React rewrite unless the user asks.
6. Acknowledge briefly that GG mode is active, then execute — do not ask whether to use skills.

Catalog: `.claude/skills/ADLYTIC_SKILLS_CATALOG.md`
