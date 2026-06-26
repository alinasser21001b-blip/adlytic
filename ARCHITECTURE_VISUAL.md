# Adlytic — دليل البنية المعمارية المرئي

> مرجع سريع للمحادثات الجديدة. آخر تحديث: 2026-06-26

**المخطط الرئيسي (نموذج الوكالة):** [MASTER_DIAGRAM.md](./MASTER_DIAGRAM.md)

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

## 1. نظرة عامة — Overview

```mermaid
flowchart LR
  subgraph Product["المنتج Adlytic"]
    A[لوحة تحليلات Meta Ads]
    B[نموذج وكالة — Workspaces متعددة]
    C[وضع مبتدئ / احترافي]
  end
  subgraph Stack["التقنيات"]
    D[Node 20+ / TypeScript]
    E[Hono API]
    F[Prisma + PostgreSQL]
    G[SSR HTML — بدون React SPA]
  end
  subgraph Deploy["النشر"]
    H[Railway]
    I[adlytic-production.up.railway.app]
  end
  Product --> Stack --> Deploy
```

## 2. البنية المعمارية — Architecture Layers

```mermaid
flowchart TB
  subgraph UI["طبقة الواجهة Web UI"]
    P1["/dashboard — Pro"]
    P2["/dashboard — Beginner"]
    P3["/workspace — ربط Meta"]
    P4["/campaigns · /settings · /ai"]
  end
  subgraph API["طبقة API — Hono server.ts"]
    R1["Auth JWT"]
    R2["Workspace routes"]
    R3["Meta OAuth"]
    R4["Dashboard DTO"]
    R5["Sync jobs"]
  end
  subgraph SVC["Services"]
    S1["metaOAuth.ts"]
    S2["accountToken.ts"]
    S3["getDashboard.ts"]
    S4["tokenEncryption.ts"]
  end
  subgraph WRK["Workers"]
    W1["syncAccount.ts — ETL"]
    W2["runEngines.ts"]
    W3["brainNarrationCron"]
  end
  subgraph ENG["Engines Pipeline"]
    E1["AnalyticsEngine → metric_trends"]
    E2["RulesEngine → detected_issues"]
    E3["RecommendationEngine"]
    E4["HealthScoreEngine → health_scores"]
    E5["AdlyticIntelligenceSystem V5"]
  end
  subgraph DATA["البيانات"]
    DB[(PostgreSQL)]
    META[Meta Graph API v20.0]
  end
  UI -->|fetch /api/*| API
  API --> SVC
  API --> WRK
  WRK --> ENG
  SVC --> DB
  WRK --> DB
  W1 --> META
  ENG --> DB
```

## 3. نموذج البيانات — Entity Diagram

```mermaid
erDiagram
  User ||--o{ WorkspaceMember : "عضوية"
  Workspace ||--o{ WorkspaceMember : "يملك"
  Workspace ||--o{ AdAccount : "حسابات إعلانية"
  Workspace ||--o{ MetaConnection : "اتصالات Meta"
  MetaConnection ||--o{ AdAccount : "connectionId"
  AdAccount ||--o{ Campaign : ""
  Campaign ||--o{ AdSet : ""
  AdSet ||--o{ Ad : ""
  Ad }o--|| AdCreative : "creativeId"
  AdAccount ||--o{ SyncJob : ""
  AdAccount {
    string externalAccountId
    string currency
    int currencyMinorFactor
    string accessTokenEncrypted
    enum tokenSource
  }
  MetaConnection {
    string businessId
    enum tokenType
    string accessTokenEncrypted
    string[] grantedAssetIds
  }
  DailyStat {
    enum entityType
    string entityId
    date date
    bigint spend
    bigint impressions
    bigint reach
    float ctr
    float cpm
    float roas
  }
  RawInsight {
    json rawJson
  }
  OAuthState {
    string state PK
    string kind
    datetime expiresAt
  }
```

## 4. تدفق الربط — Connection Paths

```mermaid
flowchart TD
  START["زر Connect Meta Ads"] --> FLAG{META_SYSTEM_USER_ENABLED?}

  FLAG -->|false| LEGACY["Legacy OAuth"]
  LEGACY --> L1["GET /api/meta/oauth/start"]
  L1 --> L2["OAuthState في DB"]
  L2 --> L3["Meta dialog → callback"]
  L3 --> L4["exchangeCode → long-lived token"]
  L4 --> L5["getAdAccounts → اختيار حساب"]
  L5 --> L6["POST /api/meta/oauth/connect"]

  FLAG -->|true| SU["System User path"]
  SU --> SU1{META_SYSTEM_USER_TOKEN?}
  SU1 -->|yes| SU2["resolveSystemUserConnection"]
  SU1 -->|no| SU3["FB Login for Business config_id"]
  SU3 --> SU4["callback → MetaConnection upsert"]

  MANUAL["Connect manually دائماً مرئي"] --> M1["POST /workspaces/:id/ad-accounts"]
  M1 --> M2["validate token + act_ ID"]
  M2 --> M3["currencyMinorFactorFor"]
  M3 --> M4["kickoffInitialSync 180d"]

  DEV1["META_DIRECT_TOKEN"] --> BYPASS["تجاوز OAuth"]
  DEV2["META_MOCK_AUTH"] --> MOCK["جلسة تجريبية"]
```

**Token resolution priority** (`accountToken.ts`):

- `tokenSource = SYSTEM_USER` + `connectionId` → token from `MetaConnection`
- else → `AdAccount.accessTokenEncrypted`

## 5. تدفق المزامنة — Sync / ETL

```mermaid
sequenceDiagram
  participant T as Trigger
  participant J as SyncJob
  participant W as SyncAccountWorker
  participant M as Meta Graph API
  participant IM as insightMapper
  participant DB as PostgreSQL
  participant E as runEngines

  T->>J: create job (windowSince/until)
  T->>W: syncChunked(jobId) أو sync()
  W->>W: pg_try_advisory_lock
  W->>W: heal IQD factor if needed
  loop كل 7 أيام chunk
    W->>M: getInsights(level=account/campaign)
    M-->>W: MetaInsightRow[]
    W->>DB: raw_insights.append
    W->>IM: mapMetaInsight(row, factor)
    IM-->>W: NormalizedInsight
    W->>DB: daily_stats.upsert
    W->>J: progress / chunksDone
  end
  W->>DB: ad_accounts.lastSyncedAt
  W->>E: Analytics→Rules→Rec→Health
  Note over E: V5 Intelligence shadow write
```

**Auto-sync** (`serve.ts`): every 6h, serial per account, 3-day backfill default.

## 6. الرياضيات والمقاييس — Formulas

```mermaid
flowchart LR
  subgraph Meta["Meta Graph — major units"]
    MS["spend: 1200 IQD"]
    MC["cpc, cpm"]
  end
  subgraph Mapper["insightMapper.ts"]
    F["factor = currencyMinorFactorFor"]
    SM["spendMinor = round(major × factor)"]
  end
  subgraph DB["daily_stats"]
    DS["spend BIGINT minor"]
  end
  subgraph Dash["getDashboard.ts"]
    CTR["CTR = Σclicks/Σimpr × 100"]
    CPM["CPM = ΣspendMajor/Σimpr × 1000"]
    DISP["display = minor / factor"]
  end
  Meta --> F --> SM --> DS --> Dash
```

| Metric | Formula | File |
|--------|---------|------|
| spendMinor | `round(spendMajor × factor)` | insightMapper |
| IQD factor | `1` | currency.ts |
| USD factor | `100` | currency.ts |
| CTR window | `Σclicks/Σimpressions×100` | getDashboard |
| CPM window | `(ΣspendMajor/Σimpressions)×1000` | getDashboard |
| ROAS | Meta `purchase_roas` OR `revenueMinor/spendMinor` | insightMapper |
| trend Δ% | `(current−prior)/prior` | analytics/trend |
| intraDaySpendPct | `todaySpend/todayBudget×100` | getDashboard |
| IQD repair | if `stored≈meta×100` → `meta×1` | iqdRepair |

## 7. لوحة التحكم — Dashboard Flow

```mermaid
flowchart TD
  COOKIE["dashboard_mode cookie"] -->|pro| PRO["dashboardPage.ts"]
  COOKIE -->|beginner| BGN["beginnerDashboardPage.ts"]
  PRO --> API["GET /api/dashboard/:workspaceId"]
  BGN --> API
  API --> GD["getDashboard()"]
  GD --> DS["daily_stats window 30d"]
  GD --> MT["metric_trends deltas"]
  GD --> DI["detected_issues + knowledge_rules"]
  GD --> HS["health_scores v2"]
  GD --> BR["CampaignBrainSnapshot optional"]
  GD --> DTO["DashboardDTO JSON"]
  DTO --> RENDER["SSR client JS renders KPIs/charts"]
```

## 8. الأمان — Security

```mermaid
flowchart TD
  LOGIN["POST /api/auth/login"] --> JWT["JWT 7d — sub, email, ver"]
  JWT --> AUTH["Authorization: Bearer"]
  AUTH --> VERIFY["verifyToken + tokenVersion match"]
  VERIFY --> MEMBER["checkMember(userId, workspaceId)"]
  TOKEN["Meta token"] --> ENC["AES-256-GCM encryptToken"]
  ENC --> DB["access_token_encrypted"]
  ENC --> KEY["TOKEN_ENCRYPTION_KEY 64 hex"]
  ISO["Workspace isolation"] --> MEMBER
```

**Meta 190 handling:**

- Legacy/manual → `AdAccount` PAUSED, token nulled
- System User → `MetaConnection` NEEDS_REGRANT
