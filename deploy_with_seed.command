#!/bin/bash
# Deploy with seed in start command, then monitor
cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/DEPLOY_SEED_LOG.txt) 2>&1

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
TOKEN="zMZ0YijRXZk30TLwOjrlYYxe3KENCHi_dRHW2hR9znw"

echo "=== Deploy with Seed ==="
date
echo ""

railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$SERVICE_ID" 2>/dev/null || true

echo "▶ Deploying (start command now includes seed)..."
railway up --detach --service "$SERVICE_ID" 2>&1 || railway up --detach 2>&1
echo ""

echo "▶ Monitoring for 15 minutes (build + seed takes ~3-5 min)..."
SUCCESS=false
for i in {1..60}; do
  echo -n "  [$i/60] $(date +%H:%M:%S) "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 10 \
    https://adlytic-production.up.railway.app/api/health 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo -n "health=✅200 "
    LOGIN=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
      --max-time 15 2>/dev/null)

    if echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('token') else 1)" 2>/dev/null; then
      echo "login=✅ PASS"
      SUCCESS=true
      break
    else
      ERR=$(echo "$LOGIN" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    msg=d.get('message',d.get('error','?'))
    print(msg[:100])
except:
    import sys
    print(sys.stdin.read()[:80])
" 2>/dev/null || echo "$LOGIN" | head -c 80)
      echo "login=❌ $ERR"
    fi
  else
    echo "health=$STATUS"
  fi
  sleep 15
done

echo ""
if [ "$SUCCESS" = "true" ]; then
  TOKEN_VAL=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    --max-time 15 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token','')[:30])" 2>/dev/null)

  echo "╔══════════════════════════════════════════════════════╗"
  echo "║          ✅ DEPLOYMENT COMPLETE — PASS!              ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo "PUBLIC_URL: https://adlytic-production.up.railway.app"
  echo "STATUS: PASS"
  echo "Token prefix: $TOKEN_VAL..."
  echo "https://adlytic-production.up.railway.app" > DEPLOYMENT_URL.txt
  echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
else
  echo "⚠️ Not passing yet. Checking latest deployment status..."
  DEPLOYS=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"query { deployments(input: { projectId: \\\"$PROJECT_ID\\\", serviceId: \\\"$SERVICE_ID\\\" }, first: 2) { edges { node { id status createdAt } } } }\"}" 2>/dev/null)
  echo "  $DEPLOYS"
fi

echo ""
echo "Press Enter to close..."
read
