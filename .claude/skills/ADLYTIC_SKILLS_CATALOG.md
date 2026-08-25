# Adlytic Skills Catalog — SaaS · Analytics · UI

Curated agent skills installed for building **Adlytic** (multi-tenant ads intelligence SaaS): product scaffolding, analytics engines/dashboards, and frontend/console UI.

Installed under: `.claude/skills/`  
Branch: `cursor/adlytic-saas-analytics-ui-skills-a2e9`

## GG protocol

When a user message ends with **`GG`**, the agent must use **all relevant available skills** (and download missing ones from the sources below if needed). See root `AGENTS.md` / `CLAUDE.md`.

---

## Already in repo (keep using)

| Skill | Role for Adlytic |
|---|---|
| `frontend-design` | Distinctive UI direction (avoid AI-slop) |
| `web-artifacts-builder` | Multi-component HTML/React artifacts |
| `theme-factory` | Theme tokens for decks/docs/pages |
| `webapp-testing` | Playwright UI verification |
| `database-designer` / `database-schema-designer` / `sql-database-assistant` | Schema + queries |
| `api-design-reviewer` / `api-test-suite-builder` | API contracts & tests |
| `observability-designer` / `performance-profiler` | Metrics & perf |
| `env-secrets-manager` / `secrets-vault-manager` | Secrets |
| `ci-cd-pipeline-builder` / `docker-development` / `release-manager` | Ship & ops |
| `rag-architect` / `llm-cost-optimizer` / `prompt-governance` | AI features |
| `spec-driven-workflow` / `focused-fix` | Delivery discipline |

---

## 1) SaaS product building (NEW)

| Skill | What it does | Direct download / source |
|---|---|---|
| `saas-scaffolder` | Auth, multi-tenancy, Stripe billing, dashboard boilerplate | https://github.com/borghei/Claude-Skills/tree/main/engineering/saas-scaffolder |
| `kreatsaas-saas-builder` | End-to-end SaaS phases: discovery → design → architecture → develop → deploy | https://github.com/ananddtyagi/cc-marketplace/tree/main/plugins/kreatsaas |
| `stripe-integration-expert` | Production Stripe subscription patterns | https://github.com/borghei/Claude-Skills/tree/main/engineering/stripe-integration-expert |
| `stripe-payments` | Checkout, PaymentIntents, webhooks, customer portal | https://github.com/jezweb/claude-skills/tree/main/plugins/integrations/skills/stripe-payments |
| `saas-metrics-coach` | SaaS KPIs: MRR, churn, LTV, CAC, retention | https://github.com/borghei/Claude-Skills/tree/main/finance/saas-metrics-coach |
| `feature-flags-architect` | Plan gating / feature flags for SaaS tiers | https://github.com/borghei/Claude-Skills/tree/main/engineering/feature-flags-architect |
| `pricing-strategy` | Pricing & packaging decisions | https://github.com/borghei/Claude-Skills/tree/main/business-growth/pricing-strategy |
| `churn-prevention` | Retention / churn playbooks | https://github.com/borghei/Claude-Skills/tree/main/business-growth/churn-prevention |
| `onboarding-cro` | Activation & onboarding conversion | https://github.com/borghei/Claude-Skills/tree/main/business-growth/onboarding-cro |
| `paywall-upgrade-cro` | Upgrade / paywall conversion | https://github.com/borghei/Claude-Skills/tree/main/business-growth/paywall-upgrade-cro |

**ZIP downloads (whole repos):**
- https://github.com/borghei/Claude-Skills/archive/refs/heads/main.zip
- https://github.com/jezweb/claude-skills/archive/refs/heads/main.zip
- https://github.com/ananddtyagi/cc-marketplace/archive/refs/heads/main.zip

---

## 2) Analytics / analytical product (NEW)

| Skill | What it does | Direct download / source |
|---|---|---|
| `product-analytics` | Metric trees, instrumentation, retention funnels | https://github.com/borghei/Claude-Skills/tree/main/product-team/product-analytics |
| `analytics-engineer` | Analytics engineering (models, metrics layer) | https://github.com/borghei/Claude-Skills/tree/main/data-analytics/analytics-engineer |
| `data-analyst` | Analysis workflows & insight framing | https://github.com/borghei/Claude-Skills/tree/main/data-analytics/data-analyst |
| `business-intelligence` | BI dashboards & reporting patterns | https://github.com/borghei/Claude-Skills/tree/main/data-analytics/business-intelligence |
| `data-scientist` | Statistical / ML analysis patterns | https://github.com/borghei/Claude-Skills/tree/main/data-analytics/data-scientist |
| `senior-data-engineer` | Pipelines, warehouses, reliability | https://github.com/borghei/Claude-Skills/tree/main/engineering/senior-data-engineer |
| `senior-data-scientist` | Advanced modeling guidance | https://github.com/borghei/Claude-Skills/tree/main/engineering/senior-data-scientist |
| `data-quality-auditor` | Data integrity checks (fits Adlytic sync quality) | https://github.com/borghei/Claude-Skills/tree/main/engineering/data-quality-auditor |
| `campaign-analytics` | Campaign performance analytics | https://github.com/borghei/Claude-Skills/tree/main/marketing/campaign-analytics |
| `analytics-tracking` | Event tracking plans & instrumentation | https://github.com/borghei/Claude-Skills/tree/main/marketing/analytics-tracking |
| `metrics-dashboard` | Metrics dashboard design | https://github.com/borghei/Claude-Skills/tree/main/project-management/discovery/metrics-dashboard |
| `north-star-metric` | North-star metric definition | https://github.com/borghei/Claude-Skills/tree/main/project-management/execution/north-star-metric |
| `csv-data-summarizer` | Auto CSV insights + charts | https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill |
| `d3js-visualization` | Custom interactive D3 charts | https://github.com/chrisvoncsefalvay/claude-d3js-skill |

**ZIP downloads:**
- https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill/archive/refs/heads/main.zip
- https://github.com/chrisvoncsefalvay/claude-d3js-skill/archive/refs/heads/main.zip

---

## 3) UI / frontend / SaaS console (NEW)

| Skill | What it does | Direct download / source |
|---|---|---|
| `taste-saas` | Linear/Vercel/Notion/Stripe-density SaaS console (sidebar, tables, KPIs, Cmd+K) | https://github.com/hrhrng/taste-saas-skill |
| `ayla-saas-admin-ui` | Full admin design system: tokens, tables, forms, ~30 screens | https://github.com/taleilon/Ayla-Saas-Admin-UI-UX-Pro |
| `senior-frontend` | Senior FE architecture & patterns | https://github.com/borghei/Claude-Skills/tree/main/engineering/senior-frontend |
| `ui-design-system` | Design-system construction | https://github.com/borghei/Claude-Skills/tree/main/product-team/ui-design-system |
| `design-system-lead` | Design-system leadership / governance | https://github.com/borghei/Claude-Skills/tree/main/product-team/design-system-lead |
| `product-designer` | Product UX design workflows | https://github.com/borghei/Claude-Skills/tree/main/product-team/product-designer |
| `design-auditor` | Visual/layout audit | https://github.com/borghei/Claude-Skills/tree/main/engineering/design-auditor |
| `anydesign` | Extract design system from image/URL/Figma → `design.md` | https://github.com/uxKero/anydesign |
| `ui-ux-pro-max` | High-density UI/UX patterns pack | https://github.com/majiayu000/claude-skill-registry (path: `skills/data/0-ui-ux-pro-max`) |
| `landing-page` | Marketing landing pages | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/landing-page |
| `design-system` | FE design-system skill (jezweb) | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/design-system |
| `shadcn-ui` | shadcn/ui component patterns | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/shadcn-ui |
| `design-review` | Design review checklist | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/design-review |
| `design-loop` | Iterative design loop | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/design-loop |
| `tailwind-theme-builder` | Tailwind theme tokens | https://github.com/jezweb/claude-skills/tree/main/plugins/frontend/skills/tailwind-theme-builder |
| `ux-audit` | UX audit | https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/skills/ux-audit |
| `responsiveness-check` | Responsive QA | https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/skills/responsiveness-check |
| `onboarding-ux` | Product onboarding UX | https://github.com/jezweb/claude-skills/tree/main/plugins/dev-tools/skills/onboarding-ux |
| `frontend-slides` | Animated HTML decks (pitch / demos) | https://github.com/zarazhangrui/frontend-slides |

**ZIP downloads:**
- https://github.com/hrhrng/taste-saas-skill/archive/refs/heads/main.zip
- https://github.com/taleilon/Ayla-Saas-Admin-UI-UX-Pro/archive/refs/heads/main.zip
- https://github.com/uxKero/anydesign/archive/refs/heads/main.zip
- https://github.com/zarazhangrui/frontend-slides/archive/refs/heads/main.zip
- https://github.com/jezweb/claude-skills/archive/refs/heads/main.zip

---

## 4) Process skills for shipping UI/SaaS (NEW — Superpowers)

| Skill | Source |
|---|---|
| `verification-before-completion` | https://github.com/obra/superpowers/tree/main/skills/verification-before-completion |
| `writing-plans` | https://github.com/obra/superpowers/tree/main/skills/writing-plans |
| `executing-plans` | https://github.com/obra/superpowers/tree/main/skills/executing-plans |
| `systematic-debugging` | https://github.com/obra/superpowers/tree/main/skills/systematic-debugging |
| `finishing-a-development-branch` | https://github.com/obra/superpowers/tree/main/skills/finishing-a-development-branch |

**ZIP:** https://github.com/obra/superpowers/archive/refs/heads/main.zip

---

## Recommended shortlist for Adlytic next

Use these first (highest leverage for this codebase):

1. **`taste-saas`** — console density for dashboard/campaigns
2. **`ayla-saas-admin-ui`** — admin screen catalog + tables/forms
3. **`product-analytics` + `campaign-analytics`** — metric trees & campaign KPIs
4. **`data-quality-auditor`** — sync freshness / integrity (matches Adlytic Tracker strip)
5. **`saas-scaffolder` + `stripe-payments`** — tenancy + billing when you monetize
6. **`d3js-visualization`** — custom charts beyond Chart.js when needed
7. **`frontend-design`** (already present) + **`design-auditor`** — visual quality gate
8. **`verification-before-completion`** — Playwright gate before claiming done

> Stack note: Adlytic is Hono + server-rendered HTML + Chart.js (RTL Arabic). Prefer **porting patterns** from React/Tailwind skills (taste-saas, Ayla, Tremor/Magic UI notes in `UI_KIT_NOTES.md`) rather than importing React wholesale.

---

## How to re-download yourself

```bash
# Example: one skill folder from borghei pack
git clone --depth 1 https://github.com/borghei/Claude-Skills.git /tmp/Claude-Skills
cp -R /tmp/Claude-Skills/engineering/saas-scaffolder .claude/skills/saas-scaffolder

# Or ZIP
curl -L -o taste-saas.zip https://github.com/hrhrng/taste-saas-skill/archive/refs/heads/main.zip
unzip taste-saas.zip
cp -R taste-saas-skill-main/skills/taste-saas .claude/skills/taste-saas
```

---

## Security note

Quick scan run on install:
- `taste-saas/check.mjs` uses Node `exec` for local visual layout audit — expected tooling, not remote exfiltration.
- `johunsang/kreatsaas` upstream repo returned 404; installed marketplace command copy from `ananddtyagi/cc-marketplace` instead.

---

## Source index (all repos used)

| Repo | URL |
|---|---|
| borghei/Claude-Skills | https://github.com/borghei/Claude-Skills |
| jezweb/claude-skills | https://github.com/jezweb/claude-skills |
| hrhrng/taste-saas-skill | https://github.com/hrhrng/taste-saas-skill |
| taleilon/Ayla-Saas-Admin-UI-UX-Pro | https://github.com/taleilon/Ayla-Saas-Admin-UI-UX-Pro |
| chrisvoncsefalvay/claude-d3js-skill | https://github.com/chrisvoncsefalvay/claude-d3js-skill |
| coffeefuelbump/csv-data-summarizer-claude-skill | https://github.com/coffeefuelbump/csv-data-summarizer-claude-skill |
| uxKero/anydesign | https://github.com/uxKero/anydesign |
| zarazhangrui/frontend-slides | https://github.com/zarazhangrui/frontend-slides |
| obra/superpowers | https://github.com/obra/superpowers |
| majiayu000/claude-skill-registry | https://github.com/majiayu000/claude-skill-registry |
| ananddtyagi/cc-marketplace | https://github.com/ananddtyagi/cc-marketplace |
| anthropics/skills (already mirrored) | https://github.com/anthropics/skills |

---

## 5) Additional download batch (installed locally)

These were downloaded in a second pass after the first PR commit:

### UI / Magic UI / Tremor / Admin

| Skill | Source |
|---|---|
| `frontend-magic-ui` | claude-skill-registry `skills/data/frontend-magic-ui` |
| `magicui` / `magic-ui-generator` / `magicui-magic-ui` | registry + magicuidesign/magicui |
| `magicui-patterns` | Component sources from https://github.com/magicuidesign/magicui (number-ticker, blur-fade, border-beam, …) |
| `tremor-patterns` | Component sources from https://github.com/tremorlabs/tremor (BarList, Tracker, SparkChart, …) |
| `tremor-design-system` | registry `skills/design/tremor-design-system` |
| `creating-dashboards` | registry `skills/design/creating-dashboards` |
| `aceternity-ui` / `frontend-aceternity` | registry |
| `admin-dashboard` / `admin-dashboard-qa` / `admin-design` / `admin-crud` | registry |
| `frontend-shadcn` / `shadcn` / `frontend-master` | registry |
| `dashboard-creator` / `kpi-dashboard-template` / `visualization-expert` / `add-metric` | registry |

**ZIP sources:**
- https://github.com/magicuidesign/magicui/archive/refs/heads/main.zip
- https://github.com/tremorlabs/tremor/archive/refs/heads/main.zip
- https://github.com/majiayu000/claude-skill-registry/archive/refs/heads/main.zip

### SaaS growth / analytics extras

| Skill | Source |
|---|---|
| `signup-flow-cro` / `page-cro` / `revenue-operations` / `channel-economics` | borghei/Claude-Skills |
| `activation-funnel` / `growth-marketer` / `ab-test-setup` / `ux-researcher-designer` | borghei/Claude-Skills |
| `stripe-integration` | registry `skills/data/6-stripe-integration` |

All of the above are already present under `.claude/skills/` — no manual download needed.
