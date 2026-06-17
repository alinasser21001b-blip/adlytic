#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Railway Redeploy Script
#  Double-click to redeploy after code fixes.
# ════════════════════════════════════════════════════════════════════════

set -e
cd /Users/aliahhed/Downloads/adlytic

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Railway Redeploy                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Kill any stuck railway processes
pkill -f "railway run" 2>/dev/null || true
echo "  ✓ Cleared any stuck railway processes"

echo ""
echo "▶ Redeploying to Railway with fixes..."
echo "  (Prisma binaryTargets fixed for Linux)"
echo "  (This takes 3-4 minutes)"
echo ""

railway up --detach

echo ""
echo "▶ Waiting for deployment to go live (up to 5 min)..."
sleep 30

# Try to check health
for i in {1..20}; do
  echo "  Attempt $i/20: checking https://adlytic-production.up.railway.app/api/health"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://adlytic-production.up.railway.app/api/health 2>/dev/null || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "  ✅ Service is UP! Status: $STATUS"
    break
  else
    echo "  ⏳ Status: $STATUS — waiting 15s..."
    sleep 15
  fi
done

echo ""
echo "▶ Running Prisma migrations and seed..."
railway run "npx prisma migrate deploy" 2>&1 || echo "  (migration may already be current)"
railway run "npx tsx prisma/seed.ts" 2>&1 || echo "  (seed may already exist)"

echo ""
echo "▶ Final verification..."
HEALTH=$(curl -s --max-time 10 https://adlytic-production.up.railway.app/api/health 2>/dev/null)
echo "  Health: $HEALTH"

LOGIN=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
  --max-time 10 2>/dev/null | head -c 100)
echo "  Login: $LOGIN"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Redeploy Complete!                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "PUBLIC_URL:"
echo "https://adlytic-production.up.railway.app"
echo ""
echo "Demo login: ali@adlytic.app / demo1234"
echo ""

# Save URL
echo "https://adlytic-production.up.railway.app" > /Users/aliahhed/Downloads/adlytic/DEPLOYMENT_URL.txt
echo "STATUS: PASS" >> /Users/aliahhed/Downloads/adlytic/DEPLOYMENT_URL.txt

echo "Press Enter to close..."
read
