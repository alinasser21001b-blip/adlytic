# Adlytic — المخطط المعماري الرئيسي

> نموذج الوكالة العربية — تطبيق Meta واحد، Workspace لكل زبون، ربط يدوي/OAuth، ETL، ومقاييس موحّدة.
>
> مرجع الكود: `ARCHITECTURE_VISUAL.md` · `SESSION_HANDOFF.md` · آخر تحديث: 2026-06-26

---

## المخطط الرئيسي — Hero Architecture

```mermaid
flowchart LR
  subgraph Agency["الوكالة (Agency)"]
    A1["تطبيق Meta واحد — Adlytic"]
    A2["Workspace لكل زبون"]
  end

  subgraph Client["الزبون (Client)"]
    C1["حساب إعلاني act_"]
    C2["ربط Manual أو OAuth"]
  end

  subgraph Platform["Adlytic Platform"]
    P1["Hono API — Workspace routes"]
    P2["syncAccount — ETL worker"]
    P3["insightMapper"]
    P4[(PostgreSQL)]
    P5["runEngines pipeline"]
    P6["getDashboard — SSR"]
  end

  subgraph Metrics["المقاييس (Metrics)"]
    M1["Meta Graph API v20.0"]
    M2["currencyMinorFactor\nIQD = 1 · USD = 100"]
    M3["CTR · CPM · ROAS · trend"]
  end

  A1 --- A2
  A2 --> C2
  C1 --- C2
  C2 --> P1
  P1 --> P2
  P2 --> M1
  M1 --> P3
  P3 --> M2
  M2 --> P4
  P4 --> P5
  P5 --> P4
  P4 --> P6
  P6 --> M3
```

---

## التدفق التشغيلي — زبون بجانبك الآن

مسار عملي عند وجود زبون أمامك مباشرة (Manual Connect كمسار موثوق اليوم):

```mermaid
flowchart LR
  O1["1 · إنشاء Workspace للزبون"]
  O2["2 · Graph Explorer\ntoken ads_read"]
  O3["3 · Manual Connect\nact_ + عملة IQD"]
  O4["4 · kickoffInitialSync\n90–180 يوم"]
  O5["5 · لوحة التحكم\nتحقق spend vs Meta"]

  O1 --> O2 --> O3 --> O4 --> O5
```

---

## دليل الرموز — Legend

| الرمز / المصطلح | المعنى |
|-----------------|--------|
| **تطبيق Meta واحد** | تطبيق Adlytic الواحد على developers.facebook.com — الوكالة (ترجمان) تديره لكل الزبائن |
| **Workspace** | مساحة معزولة لكل زبون — `User` + `WorkspaceMember` + `AdAccount` |
| **Manual / OAuth** | `POST /api/workspaces/:id/ad-accounts` أو `GET /api/meta/oauth/start` |
| **Meta Graph API** | `getInsights` — spend بـ major units (مثلاً `"1200"` IQD) |
| **insightMapper** | `spendMinor = round(spendMajor × factor)` → `daily_stats` |
| **IQD = 1** | عملة بلا كسور عشرية — `currency.ts` |
| **USD = 100** | سنتات — factor افتراضي للعملات ذات منزلتين |
| **runEngines** | Analytics → Rules → Recommendation → Health (+ V5 shadow) |
| **getDashboard** | تجميع نوافذ زمنية: CTR = Σclicks/Σimpr×100، CPM، ROAS |
| **زبون بجانبك الآن** | تدفق تشغيلي فوري: workspace → token → connect → sync → verify |

---

## ملاحظات معمارية سريعة

- **عزل البيانات:** كل `AdAccount` مربوط بـ `workspaceId` — `checkMember()` قبل أي API.
- **حل التوكن:** `accountToken.ts` — `MetaConnection` (System User) أو `AdAccount.accessTokenEncrypted` (legacy/manual).
- **إصلاح IQD:** `iqdRepair.ts` + `POST /api/workspaces/:id/repair-iqd` عند factor خاطئ (=100).
- **مزامنة تلقائية:** `serve.ts` — كل 6 ساعات، backfill 3 أيام افتراضياً.
