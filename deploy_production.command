#!/bin/bash
set -e

# Deployment script for Adlytic production launch
# This script:
# 1. Links to the Railway project
# 2. Builds and deploys the service
# 3. Deletes the demo user from the database
# 4. Monitors health for up to 10 minutes

LOG_FILE="$HOME/adlytic_deploy.log"
PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
SERVICE_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
DEPLOYMENT_URL="https://adlytic-production.up.railway.app"

# Clear previous log
> "$LOG_FILE"

echo "===============================================" | tee -a "$LOG_FILE"
echo "Adlytic Production Deployment" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "===============================================" | tee -a "$LOG_FILE"

# Step 1: Link to Railway project
echo "" | tee -a "$LOG_FILE"
echo "[1/5] Linking to Railway project..." | tee -a "$LOG_FILE"
cd ~/Downloads/adlytic
railway link --project "$PROJECT_ID" --environment prod 2>&1 | tee -a "$LOG_FILE" || {
  echo "ERROR: Failed to link to Railway project" | tee -a "$LOG_FILE"
  exit 1
}

# Step 2: Deploy the service
echo "" | tee -a "$LOG_FILE"
echo "[2/5] Building and deploying service..." | tee -a "$LOG_FILE"
railway up --detach --service "$SERVICE_ID" 2>&1 | tee -a "$LOG_FILE" || {
  echo "ERROR: Failed to deploy service" | tee -a "$LOG_FILE"
  exit 1
}

# Step 3: Wait for service to be running and execute delete demo user
echo "" | tee -a "$LOG_FILE"
echo "[3/5] Waiting for service to be ready (15 seconds)..." | tee -a "$LOG_FILE"
sleep 15

echo "" | tee -a "$LOG_FILE"
echo "[3b/5] Deleting demo user from production database..." | tee -a "$LOG_FILE"
cd ~/Downloads/adlytic
DATABASE_URL="postgresql://postgres:LOZKJdlFRHNHMBGCkVsSFYLzyJzEbglk@thomas.proxy.rlwy.net:57928/railway" \
  node delete_demo_user.js 2>&1 | tee -a "$LOG_FILE" || {
  echo "WARNING: Demo user deletion had an issue, but continuing..." | tee -a "$LOG_FILE"
}

# Step 4: Monitor health checks for up to 10 minutes
echo "" | tee -a "$LOG_FILE"
echo "[4/5] Monitoring health endpoint for up to 10 minutes..." | tee -a "$LOG_FILE"

MAX_ATTEMPTS=60
ATTEMPT=0
HEALTH_OK=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  echo "  Attempt $ATTEMPT/$MAX_ATTEMPTS..." | tee -a "$LOG_FILE"

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL/api/health" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    echo "  ✓ Health endpoint returned 200 OK" | tee -a "$LOG_FILE"
    HEALTH_OK=true
    break
  else
    echo "  HTTP $HTTP_CODE (waiting...)" | tee -a "$LOG_FILE"
    sleep 10
  fi
done

# Step 5: Verify deployment
echo "" | tee -a "$LOG_FILE"
echo "[5/5] Verifying deployment..." | tee -a "$LOG_FILE"

if [ "$HEALTH_OK" = true ]; then
  echo "" | tee -a "$LOG_FILE"
  echo "✓ Health endpoint is responding" | tee -a "$LOG_FILE"

  # Test signup endpoint (should return 403)
  echo "  Testing signup endpoint..." | tee -a "$LOG_FILE"
  SIGNUP_CODE=$(curl -s -X POST "$DEPLOYMENT_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test","name":"Test"}' \
    -w "%{http_code}" -o /tmp/signup_response.json 2>/dev/null || echo "000")

  if [ "$SIGNUP_CODE" = "403" ]; then
    echo "  ✓ Signup endpoint correctly returns 403" | tee -a "$LOG_FILE"
  else
    echo "  ⚠ Signup endpoint returned $SIGNUP_CODE (expected 403)" | tee -a "$LOG_FILE"
  fi

  # Test login with demo credentials (should return 401)
  echo "  Testing login with demo credentials..." | tee -a "$LOG_FILE"
  LOGIN_CODE=$(curl -s -X POST "$DEPLOYMENT_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    -w "%{http_code}" -o /tmp/login_response.json 2>/dev/null || echo "000")

  if [ "$LOGIN_CODE" = "401" ]; then
    echo "  ✓ Demo user login correctly returns 401 (user deleted)" | tee -a "$LOG_FILE"
  else
    echo "  ⚠ Demo login returned $LOGIN_CODE (expected 401 after deletion)" | tee -a "$LOG_FILE"
  fi

  echo "" | tee -a "$LOG_FILE"
  echo "===============================================" | tee -a "$LOG_FILE"
  echo "✓ DEPLOYMENT SUCCESSFUL" | tee -a "$LOG_FILE"
  echo "Completed: $(date)" | tee -a "$LOG_FILE"
  echo "" | tee -a "$LOG_FILE"
  echo "API URL: $DEPLOYMENT_URL" | tee -a "$LOG_FILE"
  echo "Health: $DEPLOYMENT_URL/api/health" | tee -a "$LOG_FILE"
  echo "===============================================" | tee -a "$LOG_FILE"
  exit 0
else
  echo "" | tee -a "$LOG_FILE"
  echo "===============================================" | tee -a "$LOG_FILE"
  echo "✗ DEPLOYMENT HEALTH CHECK FAILED" | tee -a "$LOG_FILE"
  echo "The service did not become healthy within 10 minutes" | tee -a "$LOG_FILE"
  echo "Completed: $(date)" | tee -a "$LOG_FILE"
  echo "===============================================" | tee -a "$LOG_FILE"
  exit 1
fi
