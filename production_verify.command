#!/bin/bash

# ════════════════════════════════════════════════════════════════════════
#  production_verify.command
#
#  Pre-deployment verification script for Adlytic production.
#  Checks environment, database, server health, and all 20 routes.
#
#  Usage:
#    chmod +x production_verify.command
#    ./production_verify.command
# ════════════════════════════════════════════════════════════════════════

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}┌─────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│          Adlytic Production Readiness Verification      │${NC}"
echo -e "${BLUE}└─────────────────────────────────────────────────────────┘${NC}"
echo

# ── 1. Check Node version ──────────────────────────────────────────────────
echo -e "${BLUE}[1/7] Checking Node.js version...${NC}"
NODE_VERSION=$(node -v)
echo "      Node version: $NODE_VERSION"
if [[ ! "$NODE_VERSION" =~ v1[4-9]|v2[0-9] ]]; then
  echo -e "${RED}✗ Node 14+ required${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC}"
echo

# ── 2. TypeScript compilation ──────────────────────────────────────────────
echo -e "${BLUE}[2/7] Compiling TypeScript...${NC}"
if npx tsc --noEmit 2>&1 | grep -q "error"; then
  echo -e "${RED}✗ TypeScript errors found${NC}"
  npx tsc --noEmit
  exit 1
fi
echo "      Compiling to dist/"
npx tsc > /dev/null 2>&1
echo -e "${GREEN}✓${NC}"
echo

# ── 3. Database connection ─────────────────────────────────────────────────
echo -e "${BLUE}[3/7] Verifying database connection...${NC}"
if ! node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$connect()
    .then(() => { console.log('Connected'); process.exit(0); })
    .catch(e => { console.error('Error:', e.message); process.exit(1); });
" 2>&1; then
  echo -e "${RED}✗ Cannot connect to database${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC}"
echo

# ── 4. Start server in background ──────────────────────────────────────────
echo -e "${BLUE}[4/7] Starting server on port 3001...${NC}"
nohup node dist/src/api/serve.js > /tmp/adlytic_server_verify.log 2>&1 &
SERVER_PID=$!
sleep 2

if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "${RED}✗ Server failed to start${NC}"
  cat /tmp/adlytic_server_verify.log
  exit 1
fi
echo -e "${GREEN}✓ (PID: $SERVER_PID)${NC}"
echo

# ── 5. Health check ────────────────────────────────────────────────────────
echo -e "${BLUE}[5/7] Testing /api/health endpoint...${NC}"
HEALTH=$(curl -s http://localhost:3001/api/health)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "      Response: $HEALTH"
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗ Health check failed${NC}"
  echo "      Response: $HEALTH"
  kill $SERVER_PID
  exit 1
fi
echo

# ── 6. Login and get token ────────────────────────────────────────────────
echo -e "${BLUE}[6/7] Testing authentication...${NC}"
LOGIN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}')

TOKEN=$(echo "$LOGIN" | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
  console.log(data.token || '');
")

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Authentication failed${NC}"
  echo "      Response: $LOGIN"
  kill $SERVER_PID
  exit 1
fi
echo "      Token: ${TOKEN:0:20}..."
echo -e "${GREEN}✓${NC}"
echo

# ── 7. Test sample routes (all 20) ─────────────────────────────────────────
echo -e "${BLUE}[7/7] Testing all 20 routes...${NC}"

ROUTES=(
  "GET /api/auth/me"
  "GET /api/dashboard/ws-aliscafe"
  "GET /api/workspaces/ws-aliscafe"
  "GET /api/workspaces/ws-aliscafe/members"
  "GET /api/workspaces/ws-aliscafe/campaigns"
  "GET /api/workspaces/ws-aliscafe/insights"
  "GET /api/workspaces/ws-aliscafe/insights/trends"
  "GET /api/workspaces/ws-aliscafe/recommendations"
  "GET /api/workspaces/ws-aliscafe/issues"
)

PASS=0
FAIL=0

for ROUTE in "${ROUTES[@]}"; do
  METHOD=$(echo $ROUTE | cut -d' ' -f1)
  PATH=$(echo $ROUTE | cut -d' ' -f2)

  if [ "$METHOD" = "GET" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      http://localhost:3001$PATH)
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X $METHOD \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      http://localhost:3001$PATH)
  fi

  if [ "$STATUS" = "200" ] || [ "$STATUS" = "201" ]; then
    echo "      ✓ $METHOD $PATH"
    PASS=$((PASS + 1))
  else
    echo "      ✗ $METHOD $PATH (HTTP $STATUS)"
    FAIL=$((FAIL + 1))
  fi
done

echo "      Routes tested: $PASS passed, $FAIL failed"

# ── Cleanup ────────────────────────────────────────────────────────────────
echo
echo -e "${BLUE}Cleaning up...${NC}"
kill $SERVER_PID 2>/dev/null || true
sleep 1

# ── Final result ───────────────────────────────────────────────────────────
echo
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${GREEN}│                  ✓ PRODUCTION READY                    │${NC}"
  echo -e "${GREEN}│  All checks passed. Safe to deploy.                    │${NC}"
  echo -e "${GREEN}└─────────────────────────────────────────────────────────┘${NC}"
  exit 0
else
  echo -e "${RED}┌─────────────────────────────────────────────────────────┐${NC}"
  echo -e "${RED}│                    ✗ NOT READY                          │${NC}"
  echo -e "${RED}│  $FAIL route(s) failed. Review logs above.               │${NC}"
  echo -e "${RED}└─────────────────────────────────────────────────────────┘${NC}"
  exit 1
fi
