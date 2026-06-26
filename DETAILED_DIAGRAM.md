# Adlytic — الرسم التفصيلي للنظام

> مخططات Mermaid شاملة لدورة حياة Adlytic بالكامل — مستخرجة من الكود.
>
> **للتفاصيل النصية:** [HOW_IT_WORKS.md](./HOW_IT_WORKS.md)
>
> آخر مراجعة: 2026-06-26

---

## 1. نظرة عامة رئيسية — MASTER OVERVIEW

```mermaid
flowchart TB
  subgraph AUTH["المصادقة — Authentication"]
    L1["POST /api/auth/login"]
    L2["bcrypt + JWT 7d — sub, email, ver"]
    L3["localStorage Bearer token"]
  end

  subgraph WS["مساحة العمل — Workspace"]
    W1["POST /api/workspaces"]
    W2["WorkspaceMember — OWNER / MANAGER / VIEWER"]
    W3["GET /workspace — صفحة الربط"]
  end

  subgraph META["ربط Meta — 5 مسارات"]
    M1["META_MOCK_AUTH"]
    M2["META_DIRECT_TOKEN"]
    M3["META_SYSTEM_USER + token/config_id"]
    M4["Legacy OAuth"]
    M5["POST /api/workspaces/:id/ad-accounts"]
  end

  subgraph ETL["مزامنة ETL"]
    S1["kickoffInitialSync — 180d"]
    S2["auto-sync — 3d كل 6h"]
    S3["SyncJob + syncChunked"]
    S4["7-day chunks — CHUNK_SIZE_DAYS"]
  end

  subgraph STORE["التخزين — PostgreSQL"]
    DB1["raw_insights — audit trail"]
    DB2["daily_stats — normalized"]
    DB3["Campaign → AdSet → Ad"]
  end

  subgraph ENG["المحركات — Engines"]
    E1["AnalyticsEngine → metric_trends"]
    E2["RulesEngine → detected_issues"]
    E3["RecommendationEngine"]
    E4["HealthScoreEngine v2 — 40/25/20/15"]
    E5["AdlyticIntelligenceSystem V5 shadow"]
    E6["runBrainOrchestrator → brain snapshots"]
  end

  subgraph DASH["لوحة التحكم — Dashboard"]
    D1["Cookie pro / beginner"]
    D2["GET /api/dashboard/:workspaceId"]
    D3["getDashboard DTO"]
    D4["SSR + pulse poll 60s"]
  end

  L1 --> L2 --> L3
  L3 --> W1 --> W2 --> W3
  W3 --> M1 & M2 & M3 & M4 & M5
  M1 & M2 & M3 & M4 & M5 --> S1
  S1 --> S3 --> S4
  S2 --> S3
  S3 --> DB1 --> DB2
  S3 --> DB3
  DB2 --> E1 --> E2 --> E3 --> E4 --> E5
  E4 --> E6
  DB2 --> D2
  E1 & E2 & E3 & E4 & E6 --> D2
  D1 --> D2 --> D3 --> D4
```

**شرح:** Adlytic منصة وكالة متعددة المستأجرين: المستخدم يسجّل الدخول بـ JWT، ينشئ Workspace، ويربط حساب Meta عبر أحد خمسة مسارات. بعد الربط تبدأ مزامنة ETL (180 يوماً أولاً، ثم 3 أيام تلقائياً كل 6 ساعات) وتُخزَّن البيانات في PostgreSQL. محركات التحليل تشتغل بعد كل sync ناجح، ثم `getDashboard` يجمّع DTO للوحة Pro أو Beginner.

---

## 2. مسارات ربط Meta — META CONNECTION

```mermaid
flowchart TD
  START["GET /api/meta/oauth/start?workspaceId="]
  START --> CHECK_MEMBER["checkMember + JWT verify"]

  CHECK_MEMBER --> MOCK{META_MOCK_AUTH?}
  MOCK -->|true| MOCK_CB["GET /api/meta/oauth/mock-callback"]
  MOCK_CB --> MOCK_SEED["seedMockAdAccountData — mock_act_*"]
  MOCK_CB --> MOCK_SKIP["تخطي Graph API الحقيقي"]

  MOCK -->|false| DIRECT{META_DIRECT_TOKEN?}
  DIRECT -->|token صالح + accounts > 0| DT_SESSION["oauthSessions Map — 30min TTL"]
  DT_SESSION --> DT_URL["redirect /meta/connect?session=…"]
  DIRECT -->|0 accounts أو خطأ| SU_FLAG

  DIRECT -->|غير مضبوط| SU_FLAG{META_SYSTEM_USER_ENABLED?}

  SU_FLAG -->|true| SU_TOKEN{META_SYSTEM_USER_TOKEN?}
  SU_TOKEN -->|yes| SU_RESOLVE["resolveSystemUserConnection"]
  SU_RESOLVE --> SU_UPSERT["upsertMetaConnection — tokenSource=SYSTEM_USER"]
  SU_UPSERT --> SU_CONNECT["/meta/connect?session=…"]

  SU_TOKEN -->|no| SU_CFG{META_LOGIN_CONFIG_ID?}
  SU_CFG -->|yes| SU_OAUTH["getBusinessLoginUrl — config_id"]
  SU_OAUTH --> SU_CB["GET /api/meta/oauth/callback — kind=system_user"]
  SU_CB --> SU_CONN_ROW["MetaConnection + AdAccount.connectionId"]

  SU_CFG -->|no| MANUAL_HINT["configured:false — فتح modal يدوي"]

  SU_FLAG -->|false| LEGACY{META_APP_ID + SECRET?}
  LEGACY -->|yes| LEG_START["createOAuthState kind=legacy — DB ~10min"]
  LEG_START --> LEG_URL["Meta scope dialog — ads_read"]
  LEG_URL --> LEG_CB["GET /api/meta/oauth/callback"]
  LEG_CB --> LEG_EX["exchangeCode → getLongLivedToken"]
  LEG_EX --> LEG_ACCT["GET /api/meta/oauth/accounts/:sessionId"]
  LEG_ACCT --> LEG_CONN["POST /api/meta/oauth/connect"]
  LEG_CONN --> LEG_ENC["encryptToken → AdAccount.accessTokenEncrypted"]

  LEGACY -->|no| MANUAL_HINT

  MANUAL_HINT --> MANUAL["POST /api/workspaces/:id/ad-accounts"]
  MANUAL --> M_VAL["Graph validate act_ — id,name,currency,timezone"]
  M_VAL --> M_FACTOR["currencyMinorFactorFor — IQD=1 USD=100"]
  M_FACTOR --> M_ENC["encryptToken على AdAccount"]
  M_ENC --> M_SYNC["kickoffInitialSync — INITIAL_BACKFILL_DAYS=180"]

  LEG_ENC --> FINAL_SYNC["syncChunked + SyncJob"]
  SU_CONN_ROW --> FINAL_SYNC
  M_SYNC --> FINAL_SYNC
  DT_URL --> FINAL_SYNC
  LEG_CONN --> FINAL_SYNC
```

**شرح:** أولوية `oauth/start` ثابتة في الكود: Mock → Direct Token → System User → Legacy OAuth → تلميح يدوي. المسار اليدوي (`POST /ad-accounts`) متاح دائماً ويتحقق من `act_` عبر Graph API. كل مسار ناجح ينتهي بـ `syncChunked` لـ 180 يوماً.

**Token resolution** (`accountToken.ts`): `tokenSource=SYSTEM_USER` + `connectionId` → `MetaConnection.accessTokenEncrypted`؛ وإلا → `AdAccount.accessTokenEncrypted`.

---

## 3. خط أنابيب المزامنة — SYNC ETL

```mermaid
sequenceDiagram
  participant T as Trigger
  participant API as server.ts
  participant J as SyncJob
  participant W as SyncAccountWorker
  participant L as pg_advisory_lock
  participant M as Meta Graph API v20
  participant IM as insightMapper
  participant DB as PostgreSQL
  participant E as runEngines
  participant B as runBrainOrchestrator

  Note over T: Triggers: connect 180d · auto-sync 3d/6h · POST /sync · repair-iqd 90d

  T->>API: kickoffInitialSync / syncAllAccounts / manual sync
  API->>J: create SyncJob — windowSince, windowUntil, chunksTotal
  API->>W: syncChunked(jobId) أو sync() incremental

  W->>L: pg_try_advisory_lock(hash adAccountId)
  alt lock held
    W-->>API: skip — sync already running
  end

  W->>W: healIqdAccountFactors if currencyFactorNeedsHeal

  loop كل chunk — CHUNK_SIZE_DAYS=7 — most-recent-first
    W->>M: getInsights level=account/campaign
    M-->>W: MetaInsightRow[] — spend major units
    W->>DB: raw_insights.append — audit JSON
    W->>IM: mapMetaInsight(row, currencyMinorFactor)
    IM-->>W: spendMinor, ctr, cpm, roas, messages
    W->>DB: daily_stats.upsert — unique entityType+entityId+date
    W->>J: update progress, chunksDone, cursorDate
    W->>W: INTER_CHUNK_DELAY_MS=300
  end

  W->>W: syncCampaigns — non-fatal
  W->>W: syncAdSetsAndAds — non-fatal
  W->>W: syncBreakdowns — non-fatal
  W->>W: syncLifetimeTotals → lifetimeSpendMinor
  W->>DB: ad_accounts.lastSyncedAt = now()
  W->>L: advisory unlock — finally block

  W->>E: Analytics → Rules → Recommendation → Health
  Note over E: V5 AdlyticIntelligenceSystem — shadow, non-fatal
  E->>DB: metric_trends, detected_issues, recommendations, health_scores

  opt initial connect / repair / manual sync complete
    W->>B: runBrainOrchestrator
    B->>DB: campaign_brain_snapshots
  end
```

**شرح:** المزامنة الأولى تغطي **180 يوماً** بقطع **7 أيام** (الأحدث أولاً). Auto-sync كل **6 ساعات** يستخدم `sync()` بنافذة **3 أيام** فقط. Advisory lock يمنع sync متزامن لنفس الحساب. بعد ETL تُشغَّل المحركات بالترتيب الإلزامي، ثم Brain orchestrator عند الربط الأول.

---

## 4. نموذج البيانات — DATA MODEL

```mermaid
erDiagram
  User ||--o{ WorkspaceMember : "memberships"
  Workspace ||--o{ WorkspaceMember : "members"
  Workspace ||--o{ AdAccount : "adAccounts"
  Workspace ||--o{ MetaConnection : "metaConnections"
  Workspace ||--o{ PaymentEvent : "paymentEvents"
  Workspace ||--o{ RecommendationExecution : "executions"
  Workspace }o--o| IndustryProfile : "industryProfile"

  MetaConnection ||--o{ AdAccount : "connectionId"
  AdAccount ||--o{ Campaign : "campaigns"
  AdAccount ||--o{ SyncJob : "syncJobs"
  AdAccount ||--o{ AdCreative : "adCreatives"

  Campaign ||--o{ AdSet : "adSets"
  AdSet ||--o{ Ad : "ads"
  Ad }o--o| AdCreative : "creativeId"

  Recommendation ||--o| RecommendationExecution : "execution"
  IndustryProfile ||--o{ KnowledgeRule : "knowledgeRules"

  User {
    string id PK
    string email UK
    int tokenVersion
    enum locale
  }

  Workspace {
    string id PK
    string name
    enum tier
    enum subscriptionStatus
    string stripeCustomerId UK
  }

  WorkspaceMember {
    string workspaceId FK
    string userId FK
    enum role OWNER_MANAGER_VIEWER
  }

  AdAccount {
    string id PK
    string workspaceId FK
    string externalAccountId act_
    string currency
    int currencyMinorFactor
    string accessTokenEncrypted
    enum tokenSource
    string connectionId FK
    datetime lastSyncedAt
  }

  MetaConnection {
    string id PK
    string workspaceId FK
    string businessId
    enum tokenType
    string accessTokenEncrypted
    string[] grantedAssetIds
    enum status ACTIVE_REVOKED_NEEDS_REGRANT
  }

  OAuthState {
    string state PK
    string workspaceId
    string kind legacy_system_user
    datetime expiresAt
  }

  SyncJob {
    string id PK
    string adAccountId FK
    enum status
    int windowDays
    int chunksDone
    int chunksTotal
  }

  DailyStat {
    enum entityType ACCOUNT_CAMPAIGN_AD_SET_AD
    string entityId
    date date UK
    bigint spend
    bigint impressions
    float ctr cpm roas
  }

  RawInsight {
    enum entityType
    string entityId
    date date
    json rawJson
  }

  BreakdownStat {
    string breakdownKey
    string breakdownValue
    bigint spend impressions
  }

  MetricTrend {
    float ctrTrend cpmTrend resultsTrend
    int windowDays
  }

  DetectedIssue {
    enum issueCode
    enum severity
    json evidenceJson
  }

  KnowledgeRule {
    enum issueCode
    enum locale EN_AR
    json causesJson recommendationsJson
  }

  Recommendation {
    enum priority
    string actionCode
    json sourceIssuesJson
  }

  HealthScore {
    int score
    json breakdownJson
    int algorithmVersion
  }

  CampaignBrainSnapshot {
    string workspaceId
    string campaignId
    date tickDate
    json payload
    json narrationJson
  }

  CampaignIntelligenceReport {
    string adAccountId
    date date
    float healthScore
  }

  CampaignIntelligenceReport ||--o{ CampaignSignal : "signals"
  CampaignIntelligenceReport ||--o{ CampaignIssue : "issues"
  CampaignIntelligenceReport ||--o{ CampaignRecommendation : "recommendations"

  PaymentEvent {
    enum eventType
    enum source STRIPE_WHATSAPP
  }

  ProcessedStripeEvent {
    string id PK
    string type
  }
```

**شرح:** Prisma يعرّف عزل المستأجر عبر `Workspace` → `AdAccount`. التسلسل الهرمي Meta (`Campaign → AdSet → Ad`) يُ mirrored مع `DailyStat` لكل مستوى `EntityType`. مخرجات المحركات (`metric_trends`, `detected_issues`, `recommendations`, `health_scores`) منفصلة عن V5 shadow tables و V6 brain snapshots.

---

## 5. رياضيات المقاييس — METRICS MATH

```mermaid
flowchart LR
  subgraph META["Meta Graph API — major units"]
    MS["spend: 1200 IQD أو 12.50 USD"]
    MA["actions: messages, purchases"]
    MR["purchase_roas من Meta"]
  end

  subgraph FACTOR["currencyMinorFactor — currency.ts"]
    IQD["IQD → factor = 1"]
    USD["USD/EUR → factor = 100"]
    RESOLVE["resolveCurrencyMinorFactor — IQD يفرض 1"]
  end

  subgraph MAP["insightMapper.ts"]
    SM["spendMinor = round major × factor"]
    RM["revenueMinor من action_values"]
    ROAS_MAP["roas = purchase_roas OR revenueMinor/spendMinor"]
    MSG["pickMessages — نوع واحد canonical"]
  end

  subgraph DB["daily_stats"]
    DS["spend BIGINT minor · impressions · clicks"]
    DS2["ctr cpm frequency roas per day"]
  end

  subgraph DASH["getDashboard.ts — window 30d default"]
    MONEY["displayMajor = spendMinor / factor"]
    CTR["CTR = Σclicks / Σimpressions × 100"]
    CPM["CPM = ΣspendMajor / Σimpressions × 1000"]
    TREND["deltas من metric_trends — AnalyticsEngine"]
    FREQ["frequency = mean daily — not true window reach"]
    ROAS_D["ROAS من daily_stats.roas أو revenue/spend"]
  end

  subgraph REPAIR["iqdRepair.ts — POST repair-iqd"]
    HEAL["healIqdAccountFactors → factor=1"]
    RESCALE["stored ≈ meta×100 → meta×1"]
    RESYNC["syncChunked 90d"]
  end

  MS --> RESOLVE --> SM
  IQD & USD --> RESOLVE
  MA --> RM
  MR --> ROAS_MAP
  SM --> DS
  ROAS_MAP --> DS2
  MSG --> DS
  DS --> MONEY
  DS --> CTR & CPM & ROAS_D
  TREND --> DASH
  HEAL --> RESCALE --> RESYNC --> DS
```

**شرح:** Meta يرسل `spend` بوحدات major (دينار كامل أو دولار بكسور). `insightMapper` يحوّل إلى minor عبر `currencyMinorFactor` (IQD=1، USD=100). `getDashboard` يجمع نوافذ زمنية بـ Σ وليس mean-of-rates. إصلاح IQD يعالج legacy factor=100 ويعيد sync 90 يوماً.

---

## 6. خط أنابيب المحركات — ENGINES PIPELINE

```mermaid
flowchart LR
  subgraph INPUT["مدخلات — post-sync"]
    IN1["daily_stats"]
    IN2["metric_trends prior run"]
  end

  subgraph PIPE["runEngines.ts — ترتيب ثابت"]
    A["1 AnalyticsEngine"]
    R["2 RulesEngine"]
    REC["3 RecommendationEngine"]
    H["4 HealthScoreEngine v2"]
    V5["5 AdlyticIntelligenceSystem"]
  end

  subgraph OUT["مخرجات DB"]
    O1["metric_trends"]
    O2["detected_issues"]
    O3["recommendations max 1/entity/date"]
    O4["health_scores algorithmVersion=2"]
    O5["campaign_intelligence_reports — shadow"]
  end

  subgraph HEALTH["HealthScoreEngine weights"]
    W1["trend 40% — results ctr cpm 3:2:1"]
    W2["ctr 25%"]
    W3["frequency 20%"]
    W4["cpm 15%"]
  end

  subgraph BRAIN["post initial sync"]
    BO["runBrainOrchestrator"]
    BS["campaign_brain_snapshots"]
    NC["brainNarrationCron — separate Railway 10min"]
  end

  IN1 --> A --> O1
  O1 --> R --> O2
  O2 --> REC --> O3
  O3 --> H --> O4
  W1 & W2 & W3 & W4 --> H
  H --> V5 --> O5
  O4 --> BO --> BS
  BS --> NC
```

**شرح:** ترتيب المحركات **لا يُغيَّر** — كل محرك يقرأ مخرجات السابق. Health v2 يوزّن trend 40%، ctr 25%، frequency 20%، cpm 15%. V5 shadow write غير fatal ولا يُقرأ من Dashboard الرئيسي. Brain orchestrator يعمل بعد sync الأولي/repair ويكتب snapshots؛ narration عبر cron منفصل.

**RulesEngine detectors:** audienceFatigue, decliningResults, risingCostPerResult, highFrequency, lowCtr.

---

## 7. لوحة التحكم — DASHBOARD

```mermaid
flowchart TB
  subgraph ENTRY["نقاط الدخول SSR"]
    R1["GET /dashboard"]
    R2["GET /campaigns · /recommendations · /settings"]
  end

  subgraph MODE["وضع العرض — Cookie"]
    C1["dashboard_mode=pro — default"]
    C2["dashboard_mode=beginner"]
    TOGGLE["POST /api/dashboard-mode — 1 year cookie"]
    C1 --> PRO["dashboardPage.ts — LTR full KPIs"]
    C2 --> BGN["beginnerDashboardPage.ts — RTL simplified"]
  end

  subgraph API["Dashboard API"]
    GD["GET /api/dashboard/:workspaceId"]
    GP["GET /api/dashboard/pulse/:workspaceId — 60s poll"]
    AUTH["JWT + checkMember"]
  end

  subgraph DTO["getDashboard DTO sections"]
    SEC1["workspace — Workspace + AdAccount + IndustryProfile"]
    SEC2["health — health_scores v2 latest"]
    SEC3["kpis — daily_stats 30d + metric_trends deltas"]
    SEC4["trendSeries — daily chart data"]
    SEC5["issues — detected_issues + KnowledgeEngine AR/EN"]
    SEC6["priorityAction — top recommendations"]
    SEC7["bestCampaign / worstCampaign"]
    SEC8["brain — CampaignBrainSnapshot optional"]
    EMPTY["empty:true — no ad account"]
  end

  subgraph PULSE["Live Pulse fields"]
    P1["burnRate — sum payload.v2.velocity"]
    P2["intraDaySpendPct — today spend / budget"]
    P3["dnaMatchPct — goldStandard mean"]
    P4["savedSpend — pause burnRate × 4h × 7d"]
  end

  subgraph RENDER["Client render"]
    JS["inline JS — apiFetch Bearer"]
    CHART["KPI cards + trend charts"]
    POLL["setInterval 60s → pulse endpoint"]
  end

  R1 --> MODE
  TOGGLE --> C1 & C2
  PRO & BGN --> GD
  GD --> AUTH
  AUTH --> SEC1 & SEC2 & SEC3 & SEC4 & SEC5 & SEC6 & SEC7 & SEC8
  AUTH --> EMPTY
  SEC3 --> RENDER
  GP --> PULSE --> POLL
  JS --> CHART
```

**شرح:** Pro و Beginner يستخدمان **نفس** `GET /api/dashboard/:workspaceId` — الفرق في SSR template و cookie فقط. DTO يجمع KPIs من `daily_stats`، trends من `metric_trends`، issues م localized، و brain section اختياري. Pulse يُ polled كل 60 ثانية للإنفاق اليومي.

---

## 8. الأمان — SECURITY

```mermaid
flowchart TB
  subgraph AUTH["JWT Authentication"]
    LOGIN["POST /api/auth/login — bcrypt 12 rounds"]
    JWT["signToken — sub, email, ver — TTL 7d"]
    VERIFY["verifyToken + User.tokenVersion match"]
    REVOKE["increment tokenVersion — logout all"]
    BEARER["Authorization: Bearer header"]
  end

  subgraph AUTHZ["Authorization — server.ts"]
    CM["checkMember userId workspaceId"]
    ROLE["VIEWER blocked: connect, sync, patch workspace"]
    OWNER["OWNER required: Stripe checkout"]
    ADMIN["PLATFORM_ADMIN_EMAILS — adminGuard"]
  end

  subgraph ENCRYPT["Token Encryption — tokenEncryption.ts"]
    ALG["AES-256-GCM"]
    KEY["TOKEN_ENCRYPTION_KEY — 64 hex = 32 bytes"]
    FMT["iv:authTag:ciphertext hex"]
    STORE["AdAccount.accessTokenEncrypted OR MetaConnection"]
    DEV["dev without key → plaintext warned"]
  end

  subgraph ISO["Workspace Isolation"]
    Q1["every query scoped workspaceId"]
    Q2["AdAccount.workspaceId FK cascade"]
    Q3["resolveAccountToken per account"]
  end

  subgraph META190["Meta Error 190 — handleMeta190"]
    DETECT["Graph API OAuthException code 190"]
    LEG["Legacy OAuth / manual / DIRECT"]
    LEG_ACT["AdAccount.status = PAUSED"]
    LEG_NULL["accessTokenEncrypted = null"]
    SU["System User — tokenSource=SYSTEM_USER"]
    SU_ACT["MetaConnection.status = NEEDS_REGRANT"]
    SU_KEEP["AdAccount stays ACTIVE"]
  end

  subgraph RATE["Rate Limiting — in-memory"]
    RL1["login 10 / 15min per IP"]
    RL2["register 5 / hour per IP"]
  end

  LOGIN --> JWT --> BEARER --> VERIFY --> CM
  CM --> ROLE & OWNER
  BEARER --> Q3 --> ENCRYPT
  DETECT --> LEG --> LEG_ACT --> LEG_NULL
  DETECT --> SU --> SU_ACT --> SU_KEEP
```

**شرح:** JWT يُ revoked عبر `tokenVersion`. توكنات Meta مشفّرة AES-256-GCM قبل التخزين. كل route workspace-scoped يمر بـ `checkMember`. خطأ Meta 190 (token منتهي) يُعالج حسب مصدر التوكن: legacy/manual يُ pause الحساب، System User يُ mark الاتصال NEEDS_REGRANT.

---

## 9. نموذج الوكالة — AGENCY MODEL

```mermaid
flowchart LR
  subgraph AGENCY["الوكالة — Agency Operator"]
    APP["Meta Developer App واحد — Adlytic"]
    ENV["JWT_SECRET + TOKEN_ENCRYPTION_KEY"]
    HOST["Railway — adlytic-production.up.railway.app"]
    REV["App Review pending — System User blocked"]
  end

  subgraph TENANTS["Workspaces — عزل per client"]
    WS1["Workspace — Client A"]
    WS2["Workspace — Client B"]
    WS3["Workspace — Client N"]
  end

  subgraph CLIENT["لكل زبون — Client"]
    ACT["act_ numeric ID — not email"]
    TOK["long-lived token OR OAuth session"]
    CUR["currency IQD or USD"]
  end

  subgraph CONNECT["مسار الربط الموثوق اليوم"]
    GE["Graph API Explorer — ads_read"]
    MAN["POST /api/workspaces/:id/ad-accounts"]
    VAL["validate + encrypt + kickoffInitialSync 180d"]
  end

  subgraph FUTURE["مسار مستقبلي — META_SYSTEM_USER_ENABLED"]
    FB["FB Login for Business — config_id"]
    MC["MetaConnection per Business BM"]
    SU_TOK["token على connection not account"]
  end

  subgraph DATA["عزل البيانات"]
    ISO["checkMember قبل أي query"]
    ENC["token مشفر per workspace account"]
    ONE["one ad account per workspace — Phase 1"]
  end

  APP --> WS1 & WS2 & WS3
  ENV --> HOST
  WS1 --> ACT & TOK & CUR
  GE --> MAN --> VAL
  APP --> FB --> MC --> SU_TOK
  WS1 & WS2 & WS3 --> ISO & ENC & ONE
```

**شرح:** الوكالة (مثل ترجمان) تدير **تطبيق Meta واحد** على Railway وتنشئ **Workspace منفصل** لكل زبون. كل زبون يوفّر `act_<id>` و token (يدوي اليوم، OAuth/System User لاحقاً). البيانات معزولة بـ `workspaceId` — لا مشاركة tokens أو stats بين workspaces.

---

## مرجع سريع — Constants

| الثابت | القيمة | السياق |
|--------|--------|--------|
| `INITIAL_BACKFILL_DAYS` | 180 | connect / OAuth |
| `DEFAULT_INCREMENTAL_BACKFILL_DAYS` | 3 | auto-sync |
| `MAX_BACKFILL_DAYS` | 365 | manual sync cap |
| `CHUNK_SIZE_DAYS` | 7 | Meta API chunks |
| `SYNC_INTERVAL_MS` | 6h | serve.ts loop |
| `RAW_INSIGHTS_RETAIN_DAYS` | 90 | prune job |
| `HEALTH_ALGORITHM_VERSION` | 2 | health_scores |
| `META_API_VERSION` | v20.0 | Graph API |

---

## ملفات مرجعية — Key Files

| الموضوع | المسار |
|---------|--------|
| Boot + auto-sync | `src/api/serve.ts` |
| Routes + OAuth | `src/api/server.ts` |
| ETL worker | `src/workers/syncAccount.ts` |
| Engines | `src/workers/runEngines.ts` |
| Dashboard DTO | `src/services/getDashboard.ts` |
| Schema | `prisma/schema.prisma` |
| Token crypto | `src/services/tokenEncryption.ts` |
| Meta 190 | `src/services/accountToken.ts` |
