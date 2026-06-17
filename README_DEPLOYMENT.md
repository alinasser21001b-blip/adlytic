# Adlytic Alpha v1 — Deployment Guide

**Status**: COMPLETE & READY TO SHIP

This document covers everything needed to deploy Adlytic Alpha v1 from source to production.

---

## QUICK START (5 minutes)

### 1. Database
```bash
cd /path/to/adlytic

# Create tables
npx prisma migrate dev

# Load test data
npx prisma db seed
```

### 2. Server
```bash
# Terminal 1: Start API
npx tsx src/api/serve.ts
```
Output: `[adlytic] Server listening on http://localhost:3001`

### 3. Frontend
```bash
# Terminal 2: Serve HTML (any way you like)
# Option A: Python
cd /path/to/adlytic
python3 -m http.server 8000

# Option B: Node http-server
npx http-server

# Option C: Open directly
open dashboard_wired.html
```

### 4. Test
```bash
# Terminal 3: Run tests
bash /path/to/adlytic/alpha_v1_verify.sh
```

---

## WHAT'S INCLUDED

### Backend Files
```
src/
├── api/
│   ├── server.ts      (20 routes)
│   ├── adapter.ts     (request normalization)
│   └── serve.ts       (HTTP entry point)
├── services/
│   ├── getDashboard.ts (DashboardDTO assembly)
│   └── metaClient.ts   (Meta API transport)
├── repositories/       (6 CRUD modules)
├── engines/            (Analytics, Health, Rules, Knowledge, Recommendation)
└── workers/            (SyncAccountWorker for ETL)

prisma/
├── schema.prisma   (database schema)
└── seed.ts         (test data: 2 workspaces, 4 campaigns, 30 days)
```

### Frontend
```
dashboard_wired.html       (1,242 lines — everything in one file)
```

### Documentation
```
VERIFICATION_REPORT.md     (detailed API & architecture audit)
COMPLETION_REPORT.md       (deployment readiness checklist)
README_DEPLOYMENT.md       (this file)
```

### Testing
```
alpha_v1_verify.sh         (comprehensive test script)
```

---

## CONFIGURATION

### Environment Variables (.env)
```
DATABASE_URL="postgresql://user:password@localhost:5432/adlytic_dev"

# Optional (not needed for Phase 1):
META_ACCESS_TOKEN=""
META_ACCOUNT_ID=""
META_API_VERSION="v20.0"
```

### Server Port
Default: 3001 (set via PORT environment variable)
```bash
PORT=8080 npx tsx src/api/serve.ts
```

### Frontend API URL
In `dashboard_wired.html`, line 266:
```javascript
const API = 'http://localhost:3001';
```
Change if server is on different host/port.

---

## DATABASE

### Schema Creation
```bash
npx prisma migrate dev
```
Creates 13 tables:
- user, workspace, workspaceMember, industryProfile
- adAccount, campaign, adSet, ad
- dailyStat, healthScore, metricTrend
- detectedIssue, recommendation, knowledgeRule, rawInsight

### Seeding
```bash
npx prisma db seed
```
Populates:
- 1 user (ali@adlytic.app / demo1234)
- 2 workspaces (Furniture, Cosmetics)
- 4 campaigns (2 per workspace)
- 30 days of daily stats per workspace
- 3 issues with severity levels
- 2 recommendations
- 10 knowledge rules (EN + AR with industry overrides)
- 4 health scores (account + campaign level)

### Verify Seed
```bash
psql adlytic_dev << EOF
SELECT count(*) FROM workspace;
SELECT count(*) FROM campaign;
SELECT count(*) FROM dailyStat;
SELECT count(*) FROM detectedIssue;
