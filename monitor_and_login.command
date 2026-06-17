#!/bin/bash
# Monitor new deployment and test login
cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/MONITOR_LOG.txt) 2>&1

echo "=== Monitor New Deployment ==="
date
echo "Waiting for build to complete and new service to start..."
echo ""

SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
TOKEN="zMZ0YijRXZk30TLwOjrlYYxe3KENCHi_dRHW2hR9znw"

# First verify the DATABASE_URL variable is set on adlytic service
echo "▶ Current DATABASE_URL on adlytic service:"
railway link --project "$PROJECT_ID" \
             --environment "89cdf3cb-15b7-4b92-b1ae-07e812333c37" \
             --service "$SERVICE_ID" 2>/dev/null || true
DB_URL=$(railway variables --json 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('DATABASE_URL', 'NOT_FOUND'))
except:
    print('ERROR')
" 2>/dev/null)
echo "  DATABASE_URL: $DB_URL"
echo ""

# Check build status via API
echo "▶ Latest deployments via API:"
DEPLOYS=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { deployments(input: { projectId: \\\"$PROJECT_ID\\\", serviceId: \\\"$SERVICE_ID\\\" }, first: 2) { edges { node { id status createdAt } } } }\"}" 2>/dev/null)
echo "  Deployments: $DEPLOYS"
echo ""

echo "▶ Monitoring for 15 minutes..."
SUCCESS=false
for i in {1..60}; do
  echo -n "  [$i/60] $(date +%H:%M:%S) "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    https://adlytic-production.up.railway.app/api/health 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo -n "health=✅200 "
    # Try login
    LOGIN=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
      --max-time 15 2>/dev/null)

    if echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('token') else 1)" 2>/dev/null; then
      echo "login=✅ PASS"
      SUCCESS=true
      break
    else
      # Extract short error
      ERR=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); m=d.get('message','?'); print(m[:80])" 2>/dev/null || echo "$LOGIN" | head -c 80)
      echo "login=❌ $ERR"
    fi
  else
    echo "health=$STATUS — waiting..."
  fi
  sleep 15
done

echo ""
if [ "$SUCCESS" = "true" ]; then
  # Run seed if needed
  echo "▶ Testing if user exists..."
  LOGIN2=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    --max-time 15 2>/dev/null)
  TOKEN_VAL=$(echo "$LOGIN2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)

  if [ -n "$TOKEN_VAL" ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║          ✅ DEPLOYMENT COMPLETE — PASS!              ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo "PUBLIC_URL: https://adlytic-production.up.railway.app"
    echo "STATUS: PASS"
    echo "https://adlytic-production.up.railway.app" > DEPLOYMENT_URL.txt
    echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
  fi
else
  echo "⚠️ Login not working yet after 15 minutes"
  echo "▶ Checking deployment status via API..."
  DEPLOYS2=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query { deployments(input: { projectId: \\\"$PROJECT_ID\\\", serviceId: \\\"$SERVICE_ID\\\" }, first: 2) { edges { node { id status createdAt } } } }\"}" 2>/dev/null)
  echo "  Deployments: $DEPLOYS2"
fi

echo ""
echo "Press Enter to close..."
read
