#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Add & Link PostgreSQL Database (Non-Interactive)
#  Uses Railway GraphQL API + CLI directly
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
RAILWAY_TOKEN="Y6P7RXH9qtUjm8BWt9dgnbZKx2eH5sW-KvkZfwYCRaP"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Add PostgreSQL Database            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link the project service first
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$SERVICE_ID" 2>/dev/null || true

echo "▶ Step 1: Check existing services via Railway API..."
SERVICES=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { project(id: \\\"$PROJECT_ID\\\") { services { edges { node { id name } } } } }\"}" 2>/dev/null)

echo "  Services: $SERVICES"
echo ""

echo "▶ Step 2: Add PostgreSQL plugin via Railway API..."
CREATE_RESULT=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { pluginCreate(input: { name: \\\"Postgres\\\", projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", type: DATABASE }) { id name } }\"}" 2>/dev/null)

echo "  Create result: $CREATE_RESULT"
echo ""

# Alternative: try newer API format
echo "▶ Step 2b: Try newer service create API..."
CREATE2=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { serviceCreate(input: { name: \\\"Postgres\\\", projectId: \\\"$PROJECT_ID\\\", source: { image: \\\"ghcr.io/railwayapp-templates/postgres-ssl:edge\\\" } }) { id name } }\"}" 2>/dev/null)

echo "  Create2 result: $CREATE2"
echo ""

echo "▶ Step 3: Try railway CLI add with service flag..."
railway add --plugin postgresql --service "$SERVICE_ID" 2>&1 || \
railway add -d postgresql --service "$SERVICE_ID" 2>&1 || \
echo "  Direct add with service flag failed"
echo ""

echo "▶ Step 4: Check variables now..."
railway variables 2>&1 | head -20
echo ""

echo "▶ Step 5: Check via API for Postgres URL..."
ALL_VARS=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"query { variables(projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", serviceId: \\\"$SERVICE_ID\\\") }\"}" 2>/dev/null)

echo "  Variables via API: $ALL_VARS"
echo ""

echo "Press Enter to close..."
read
