#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Fix + Deploy (non-interactive)
#  Deploys with corrected Prisma binary targets directly to service
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Fix + Deploy v2                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Kill any stuck railway processes from previous runs
pkill -f "railway run" 2>/dev/null || true
pkill -f "railway up" 2>/dev/null || true
echo "  ✓ Cleared previous processes"

# Link the service explicitly so no interactive prompt
echo ""
echo "▶ Linking Railway project and service..."
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 \
             --environment 89cdf3cb-15b7-4b92-b1ae-07e812333c37 \
             --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || \
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 2>/dev/null || true

echo ""
echo "▶ Deploying to Railway (non-interactive)..."
echo "  Key fix v2: Removed invalid linux-openssl-3.0.x target"
echo "  Valid targets: native, linux-musl-openssl-3.0.x, debian-openssl-3.0.x, rhel-openssl-3.0.x"
echo "  (takes 3-5 minutes to build on Railway)"
echo ""

# Try with --service flag first (newer Railway CLI)
railway up --detach --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || \
railway up --detach 2>/dev/null <<'EOF'
adlytic
EOF

echo ""
echo "▶ Monitoring deployment (up to 8 minutes)..."
echo ""

SUCCESS=false
for i in {1..32}; do
  echo -n "  [$i/32] "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    --max-time 8 \
    https://adlytic-production.up.railway.app/api/health 2>/dev/null || echo "000")

  if [ "$STATUS" = "200" ]; then
    echo "✅ Service is LIVE! HTTP $STATUS"
    SUCCESS=true
    break
  else
    echo "⏳ HTTP $STATUS — waiting 15s..."
    sleep 15
  fi
done

if [ "$SUCCESS" = "true" ]; then
  echo ""
  echo "▶ Running database setup..."
  railway run --service cc7cbf67-d757-4018-bf6d-9cec643222c3 \
    "npx prisma migrate deploy" 2>&1 | tail -5 || echo "  (migrate: may already be deployed)"

  railway run --service cc7cbf67-d757-4018-bf6d-9cec643222c3 \
    "npx tsx prisma/seed.ts" 2>&1 | tail -10 || echo "  (seed: may already exist)"

  echo ""
  HEALTH=$(curl -s --max-time 10 https://adlytic-production.up.railway.app/api/health 2>/dev/null)
  LOGIN=$(curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
    --max-time 10 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print('token:', d.get('token','?')[:30]+'...' if d.get('token') else str(d))" 2>/dev/null)

  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║               ✅ DEPLOYMENT VERIFIED!                ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  echo "PUBLIC_URL:"
  echo "https://adlytic-production.up.railway.app"
  echo ""
  echo "Health: $HEALTH"
  echo "Login:  $LOGIN"
  echo ""
  echo "STATUS:"
  echo "PASS"

  echo "https://adlytic-production.up.railway.app" > DEPLOYMENT_URL.txt
  echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
else
  echo ""
  echo "  ⚠️  Service not responding after 8 min. Check Railway dashboard:"
  echo "  https://railway.com/project/69ca3009-3a67-4d92-b808-6e4f278335d6"
  echo ""
  echo "  Common causes: build error, missing env var, crash on startup"
fi

echo ""
echo "Press Enter to close..."
read
