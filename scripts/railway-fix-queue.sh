#!/usr/bin/env bash
# One-time fix: point worker/cron services at skip configs, deploy adlytic only.
# Usage: RAILWAY_TOKEN=xxx bash scripts/railway-fix-queue.sh
set -euo pipefail

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
ADLYTIC_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
API="https://backboard.railway.app/graphql/v2"

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "Set RAILWAY_TOKEN from https://railway.app/account/tokens (No Team token)."
  exit 1
fi

gql() {
  curl -fsS -X POST "$API" \
    -H "Authorization: Bearer $RAILWAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

echo "Listing services..."
gql "{\"query\":\"query { project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }\"}"

echo "Deploying adlytic only..."
gql "{\"query\":\"mutation { serviceInstanceDeploy(serviceId: \\\"$ADLYTIC_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", latestCommit: true) }\"}"

echo "Done. In Railway UI also set:"
echo "  adlytic                 -> Config File: /railway.json"
echo "  thriving-manifestation  -> Config File: /railway.sync-worker.json  (or Disable autodeploy)"
echo "  lively-insight          -> Config File: /railway.worker.json         (or Disable autodeploy)"
