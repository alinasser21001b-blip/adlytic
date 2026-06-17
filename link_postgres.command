#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Link PostgreSQL (Non-Interactive Input Piping)
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
RAILWAY_TOKEN="Y6P7RXH9qtUjm8BWt9dgnbZKx2eH5sW-KvkZfwYCRaP"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Adlytic → Link PostgreSQL (Non-Interactive)     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link to the service
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$SERVICE_ID" 2>/dev/null || true

echo "▶ Method 1: Add via Railway GraphQL API (serviceInstanceCreate)..."

# Try to create a PostgreSQL template service via API
RESULT1=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { templateDeploy(input: { projectId: \\\"$PROJECT_ID\\\", environmentId: \\\"$ENVIRONMENT_ID\\\", services: [{ serviceName: \\\"Postgres\\\", source: { image: \\\"postgres:15\\\" }, variables: [{ name: \\\"POSTGRES_USER\\\", value: \\\"adlytic\\\" }, { name: \\\"POSTGRES_PASSWORD\\\", value: \\\"adlytic_pass_2024\\\" }, { name: \\\"POSTGRES_DB\\\", value: \\\"adlytic\\\" }] }] }) { id } }\"
  }" 2>/dev/null)
echo "  templateDeploy: $RESULT1"
echo ""

echo "▶ Method 2: Pipe input to railway add plugin..."
# Pipe "adlytic" then newline to select the service
result2=$(printf 'adlytic\n' | railway add --plugin postgresql 2>&1)
echo "  $result2"
echo ""

echo "▶ Method 3: Try railway add with --name flag..."
result3=$(railway add --plugin postgresql --name postgres-db 2>&1)
echo "  $result3"
echo ""

echo "▶ Method 4: Try YES input piping..."
result4=$(printf 'y\n' | railway add --plugin postgresql 2>&1)
echo "  $result4"
echo ""

echo "▶ Method 5: Deploy Postgres as a Docker service via API..."
RESULT5=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $RAILWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation serviceCreate(\$input: ServiceCreateInput!) { serviceCreate(input: \$input) { id name } }\",
    \"variables\": {
      \"input\": {
        \"name\": \"postgres\",
        \"projectId\": \"$PROJECT_ID\",
        \"source\": {
          \"image\": \"postgres:15\"
        }
      }
    }
  }" 2>/dev/null)
echo "  serviceCreate: $RESULT5"
echo ""

echo "▶ Method 6: Set DATABASE_URL directly with external Postgres..."
# Create a simple postgres URL using Railway's managed postgres
# Use railway run env to check what's available inside the service
railway run --service "$SERVICE_ID" "env | grep -i database" 2>&1 || true
echo ""

echo "▶ Final: Check current variables..."
railway variables 2>&1 | grep -v "^$"

echo ""
echo "Press Enter to close..."
read
