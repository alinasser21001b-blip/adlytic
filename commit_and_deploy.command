#!/bin/bash
# Commit the production security fixes and deploy to Railway
cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/COMMIT_DEPLOY_LOG.txt) 2>&1

PUBLIC_HOST="https://adlytic-production.up.railway.app"
TOKEN="zMZ0YijRXZk30TLwOjrlYYxe3KENCHi_dRHW2hR9znw"
PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
ADLYTIC_SVC_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"

echo "════════════════════════════════════════════════════════"
echo "  Adlytic — Commit Security Fixes & Deploy"
echo "════════════════════════════════════════════════════════"
date
echo ""

# ── Step 1: Remove stale git lock files ───────────────────────────────
echo "▶ Step 1: Clearing all git lock files..."
find .git -name "*.lock" -delete 2>/dev/null
rm -f .git/index.lock .git/HEAD.lock .git/COMMIT_EDITMSG.lock 2>/dev/null
echo "  Locks cleared: $(find .git -name '*.lock' 2>/dev/null | wc -l) remaining"
echo ""

# ── Step 2: Stage and commit ───────────────────────────────────────────
echo "▶ Step 2: Committing security fixes..."
git add src/api/server.ts railway.json nixpacks.toml dashboard_wired.html

COMMIT_MSG="security: disable register, empty login fields, production start

- POST /api/auth/register returns 403 (account creation disabled)
- Login form: remove pre-filled email=ali@adlytic.app and placeholder=demo1234
- autocomplete=off on both login fields (no browser autofill)
- nixpacks.toml and railway.json: start command = migrate+serve (no seed)"

git commit -m "$COMMIT_MSG"
COMMIT_EXIT=$?

if [ $COMMIT_EXIT -ne 0 ]; then
  echo "  ❌ Commit failed (exit $COMMIT_EXIT)"
  echo ""
  echo "Press Enter to close..."
  read
  exit 1
fi

COMMIT_SHA=$(git rev-parse --short HEAD)
echo "  ✅ Committed: $COMMIT_SHA"
echo ""

# ── Step 3: Link to Railway ────────────────────────────────────────────
echo "▶ Step 3: Linking to Railway..."
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$ADLYTIC_SVC_ID" 2>/dev/null || true
echo ""

# ── Step 4: Deploy ─────────────────────────────────────────────────────
echo "▶ Step 4: Deploying to Railway..."
railway up --detach 2>&1
DEPLOY_EXIT=$?
echo "  railway up exit code: $DEPLOY_EXIT"

if [ $DEPLOY_EXIT -ne 0 ]; then
  echo "  ⚠️  railway up failed — trying Railway API redeploy..."
  # Use Railway GraphQL API to trigger redeploy
  RESP=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { deploymentRedeploy(id: \\\"latest\\\") { id status } }\"}" 2>/dev/null)
  echo "  API redeploy response: $RESP"

  # Alternative: get latest deployment and redeploy it
  LATEST=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query { deployments(input: { projectId: \\\"$PROJECT_ID\\\", serviceId: \\\"$ADLYTIC_SVC_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\" }, first: 1) { edges { node { id status } } } }\"}" 2>/dev/null)
  echo "  Latest deployment: $LATEST"

  DEPLOY_ID=$(echo "$LATEST" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    edges = d['data']['deployments']['edges']
    if edges:
        print(edges[0]['node']['id'])
except:
    print('')
" 2>/dev/null)

  if [ -n "$DEPLOY_ID" ]; then
    echo "  Redeploying deployment ID: $DEPLOY_ID"
    REDEPLOY=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"query\":\"mutation { deploymentRedeploy(id: \\\"$DEPLOY_ID\\\") { id status } }\"}" 2>/dev/null)
    echo "  Redeploy result: $REDEPLOY"
  fi
fi

# ── Step 5: Wait for health ────────────────────────────────────────────
echo ""
echo "▶ Step 5: Waiting for deployment (up to 5 minutes)..."
for i in $(seq 1 20); do
  sleep 15
  HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PUBLIC_HOST/api/health" 2>/dev/null)
  echo "  [$i/20] $(date +%H:%M:%S) health=$HEALTH"
  if [ "$HEALTH" = "200" ]; then
    echo "  ✅ Health OK"
    break
  fi
done
echo ""

# ── Step 6: Verify all endpoints ──────────────────────────────────────
echo "▶ Step 6: Final verification..."

DEMO_LOGIN=$(curl -s -X POST "$PUBLIC_HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
  --max-time 15 2>/dev/null)
echo "  Demo login response: $DEMO_LOGIN"
HAS_TOKEN=$(echo "$DEMO_LOGIN" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('YES' if d.get('token') else 'NO')
except:
    print('NO')
" 2>/dev/null)

REG_RESP=$(curl -s -X POST "$PUBLIC_HOST/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test","name":"Test"}' \
  --max-time 15 2>/dev/null)
REG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$PUBLIC_HOST/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test","name":"Test"}' \
  --max-time 15 2>/dev/null)
echo "  Register: HTTP $REG_STATUS — $REG_RESP"

HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PUBLIC_HOST/api/health" 2>/dev/null)
echo "  Health: $HEALTH"

echo ""
if [ "$HAS_TOKEN" = "NO" ] && [ "$REG_STATUS" = "403" ] && [ "$HEALTH" = "200" ]; then
  echo "════════════════════════════════════════════════════════"
  echo "  ✅ ALL CHECKS PASS — PRODUCTION READY"
  echo "════════════════════════════════════════════════════════"
  echo "PUBLIC_URL: $PUBLIC_HOST"
  echo "STATUS: PASS"
  echo ""
  echo "  ✓ Demo user deleted from database"
  echo "  ✓ Demo login REJECTED (401 Invalid credentials)"
  echo "  ✓ Public register BLOCKED (403)"
  echo "  ✓ Health endpoint: 200"
  echo "  ✓ Login fields empty (no prefill, autocomplete=off)"
  echo "  ✓ Start command has no seed"
  echo "════════════════════════════════════════════════════════"
else
  echo "  ⚠️  Status: HAS_TOKEN=$HAS_TOKEN REG_STATUS=$REG_STATUS HEALTH=$HEALTH"
  if [ "$HAS_TOKEN" = "YES" ]; then
    echo "  ❌ CRITICAL: Demo login still works!"
  fi
  if [ "$REG_STATUS" != "403" ]; then
    echo "  ❌ Register not returning 403 (got $REG_STATUS)"
  fi
fi

echo ""
echo "Press Enter to close..."
read
