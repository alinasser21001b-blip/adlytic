#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Complete Database Setup (Comprehensive)
# ════════════════════════════════════════════════════════════════════════

set -e
cd /Users/aliahhed/Downloads/adlytic

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
RAILWAY_TOKEN="Y6P7RXH9qtUjm8BWt9dgnbZKx2eH5sW-KvkZfwYCRaP"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Adlytic → Complete Database Setup               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link to the adlytic service
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$SERVICE_ID" 2>/dev/null || true

echo "▶ Step 1: Add PostgreSQL to project (piping selection)..."
# Pipe a newline to auto-select the first/only service (adlytic)
ADD_OUTPUT=$(printf '\n' | railway add --plugin postgresql 2>&1 || true)
echo "  Output: $ADD_OUTPUT"
echo ""

echo "▶ Waiting 15s for PostgreSQL to provision..."
sleep 15
echo ""

echo "▶ Step 2: Check variables for DATABASE_URL..."
DB_URL=$(railway variables --json 2>&1 | \
  python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('DATABASE_URL', 'NOT_FOUND'))
except:
    print('PARSE_ERROR')
" 2>/dev/null)
echo "  DATABASE_URL: $DB_URL"
echo ""

if [ "$DB_URL" = "NOT_FOUND" ] || [ "$DB_URL" = "PARSE_ERROR" ] || [ -z "$DB_URL" ]; then
  echo "▶ Step 3: DATABASE_URL not found. Setting reference variable..."
  # Try setting a reference to the Postgres service variable
  railway variables --service "$SERVICE_ID" set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" 2>&1 || \
  railway variables set "DATABASE_URL=\${{Postgres.DATABASE_URL}}" 2>&1 || \
  echo "  Reference variable set failed"

  echo ""
  echo "▶ Step 4: Wait 10s and check variables again..."
  sleep 10

  DB_URL2=$(railway variables --json 2>&1 | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('DATABASE_URL', 'STILL_NOT_FOUND'))
except Exception as e:
    print(f'ERROR: {e}')
" 2>/dev/null)
  echo "  DATABASE_URL after set: $DB_URL2"
  echo ""
fi

echo "▶ Step 5: Try using Railway API to create Postgres service..."
# Use the Railway GraphQL API to get services in the project
SERVICES_QUERY=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  --data-raw "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }\"}" 2>/dev/null)
echo "  Project services: $SERVICES_QUERY"
echo ""

echo "▶ Step 6: Deploy and wait for service with working DB..."
railway up --detach --service "$SERVICE_ID" 2>/dev/null || railway up --detach 2>/dev/null || true

echo "▶ Monitoring for 8 minutes..."
SUCCESS=false
for i in {1..32}; do
  echo -n "  [$i/32] "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 8 \
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
  echo "▶ Testing login..."
  LOGIN_RESULT=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    --max-time 15 2>/dev/null)
  echo "  Login: $LOGIN_RESULT" | head -c 200
  echo ""

  if echo "$LOGIN_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('token') else 1)" 2>/dev/null; then
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║            ✅ DEPLOYMENT COMPLETE — PASS!            ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo ""
    echo "PUBLIC_URL: https://adlytic-production.up.railway.app"
    echo "STATUS: PASS"
    echo "https://adlytic-production.up.railway.app" > DEPLOYMENT_URL.txt
    echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
  else
    echo "⚠️ Login failed — DB issue persists"
    echo "  Need to manually set DATABASE_URL in Railway dashboard"
    echo "  https://railway.com/project/$PROJECT_ID"
  fi
fi

echo ""
echo "Press Enter to close..."
read
