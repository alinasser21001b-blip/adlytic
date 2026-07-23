#!/usr/bin/env bash
# Run once after cancelling Railway queues.
# Usage: bash scripts/railway-setup-once.sh
set -euo pipefail

cat "$(dirname "$0")/../railway.setup.txt"

echo ""
echo "─── Optional: deploy adlytic only via CLI ───"
echo "  railway login"
echo "  bash deploy-adlytic-only.command"
echo ""

if [ -n "${RAILWAY_TOKEN:-}" ]; then
  ADLYTIC_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
  ENV_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
  echo "RAILWAY_TOKEN set — triggering adlytic deploy..."
  curl -fsS -X POST "https://backboard.railway.app/graphql/v2" \
    -H "Authorization: Bearer $RAILWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { serviceInstanceDeploy(serviceId: \\\"$ADLYTIC_ID\\\", environmentId: \\\"$ENV_ID\\\", latestCommit: true) }\"}"
  echo ""
  echo "Deploy triggered."
fi
