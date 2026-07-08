#!/bin/bash
# Deploy ONLY the adlytic production service (skips worker/cron queue).
set -euo pipefail

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
URL="https://adlytic-production.up.railway.app"

echo "=== Adlytic: deploy adlytic service only ==="
echo "Requires: railway login (railway login)"
echo ""

if ! command -v railway >/dev/null 2>&1; then
  echo "Installing Railway CLI..."
  npm install -g @railway/cli
fi

railway link --project "$PROJECT_ID" --environment "$ENVIRONMENT_ID" --service "$SERVICE_ID"

echo "Deploying service $SERVICE_ID ..."
railway up --detach --service "$SERVICE_ID"

echo "Waiting for health..."
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/health" || echo 000)
  esc=$(curl -sL "$URL/login" | grep -c 'function escHtml' || true)
  echo "  attempt $i: HTTP $code, escHtml=$esc"
  if [ "$code" = "200" ] && [ "$esc" -ge 1 ]; then
    echo "Deploy live: $URL"
    exit 0
  fi
  sleep 10
done

echo "Health check timed out — open Railway → adlytic → Deployments for logs."
exit 1
