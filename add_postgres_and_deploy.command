#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Add Postgres (correct flags) + Deploy
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/ADD_DB_LOG.txt) 2>&1

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
REAL_TOKEN="zMZ0YijRXZk30TLwOjrlYYxe3KENCHi_dRHW2hR9znw"

echo "=== Adlytic: Add PostgreSQL & Deploy ==="
date
echo ""

# Link to service
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$SERVICE_ID" 2>/dev/null || true

echo "▶ Step 1: Test Railway API with real access token..."
ME=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $REAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email } }"}' 2>/dev/null)
echo "  Me: $ME"
echo ""

echo "▶ Step 2: Add PostgreSQL via CLI (railway add -d postgres)..."
echo "  Running: railway add -d postgres"
railway add -d postgres 2>&1
ADD_EXIT=$?
echo "  Exit code: $ADD_EXIT"
echo ""

echo "▶ Step 3: Wait 25s for Postgres to provision..."
sleep 25
echo ""

echo "▶ Step 4: Check services in project..."
railway service 2>&1 | head -20
echo ""

echo "▶ Step 5: Check adlytic service variables..."
railway variables 2>&1
echo ""

echo "▶ Step 6: Check Postgres service variables (try various names)..."
railway variables --service Postgres 2>&1 | head -15 || true
railway variables --service postgres 2>&1 | head -15 || true
railway variables --service "Postgres" 2>&1 | head -5 || true
echo ""

# Try to get actual DATABASE_URL from Postgres service via API
echo "▶ Step 7: Get all project variables via Railway API..."
VARS=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $REAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { variables(projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", serviceId: \\\"$SERVICE_ID\\\") }\"}" 2>/dev/null)
echo "  Adlytic vars via API: $VARS"
echo ""

echo "▶ Step 8: List all project services via API to find Postgres service ID..."
SERVICES=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $REAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }\"}" 2>/dev/null)
echo "  Services: $SERVICES"
echo ""

# Check if DATABASE_URL is now populated
DB_URL=$(railway variables --json 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('DATABASE_URL', 'NOT_FOUND'))
except:
    print('PARSE_ERROR')
" 2>/dev/null)
echo "▶ Step 9: DATABASE_URL value: [$DB_URL]"
echo ""

if [ -z "$DB_URL" ] || [ "$DB_URL" = "NOT_FOUND" ] || [ "$DB_URL" = "PARSE_ERROR" ]; then
  echo "▶ Step 10: DATABASE_URL still empty. Setting reference to Postgres service..."
  railway variables set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" 2>&1 || \
  railway variables set "DATABASE_URL=\${{postgres.DATABASE_URL}}" 2>&1 || \
  echo "  Failed to set reference"
  echo ""
  echo "▶ Wait 10s more..."
  sleep 10

  DB_URL2=$(railway variables --json 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('DATABASE_URL', 'STILL_EMPTY'))
except:
    print('ERROR')
" 2>/dev/null)
  echo "  DATABASE_URL after set: [$DB_URL2]"
else
  echo "  ✅ DATABASE_URL is set: ${DB_URL:0:50}..."
fi
echo ""

echo "▶ Step 11: Redeploy service..."
railway up --detach --service "$SERVICE_ID" 2>&1 || railway up --detach 2>&1 || echo "Deploy triggered"
echo ""

echo "▶ Step 12: Monitor health endpoint (10 minutes)..."
SUCCESS=false
for i in {1..40}; do
  echo -n "  [$i/40] "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    https://adlytic-production.up.railway.app/api/health 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo "✅ HTTP $STATUS — Service UP"
    SUCCESS=true
    break
  else
    echo "⏳ HTTP $STATUS — waiting 15s..."
    sleep 15
  fi
done

if [ "$SUCCESS" = "true" ]; then
  echo ""
  echo "▶ Step 13: Test login..."
  LOGIN=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    --max-time 15 2>/dev/null)
  echo "  Login: $LOGIN" | head -c 300
  echo ""

  if echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('token') else 1)" 2>/dev/null; then
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║          ✅ DEPLOYMENT COMPLETE — PASS!              ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo "PUBLIC_URL: https://adlytic-production.up.railway.app"
    echo "STATUS: PASS"
    echo "https://adlytic-production.up.railway.app" > DEPLOYMENT_URL.txt
    echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
  else
    echo "⚠️ Service up but login failed. DB issue may persist."
    echo "  Full login response: $LOGIN"
  fi
else
  echo "❌ Service did not come up in 10 minutes"
fi

echo ""
echo "Press Enter to close..."
read
