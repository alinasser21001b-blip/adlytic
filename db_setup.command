#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Database Setup
#  Adds PostgreSQL plugin and sets DATABASE_URL
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Database Setup                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link to the service
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 \
             --environment 89cdf3cb-15b7-4b92-b1ae-07e812333c37 \
             --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || true

echo "▶ Current environment variables:"
railway variables 2>&1 | head -30
echo ""

echo "▶ Checking if PostgreSQL plugin exists..."
railway status 2>&1 | head -20
echo ""

echo "▶ Adding PostgreSQL plugin (if not present)..."
railway add --plugin postgresql 2>&1 || echo "  (may already exist)"
echo ""

echo "▶ Waiting 10s for plugin to provision..."
sleep 10

echo "▶ Environment variables after plugin add:"
railway variables 2>&1 | head -30
echo ""

echo "▶ Checking DATABASE_URL..."
DB_URL=$(railway variables --json 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('DATABASE_URL','NOT_FOUND'))" 2>/dev/null || echo "NOT_FOUND")
echo "  DATABASE_URL: $DB_URL"
echo ""

if [ "$DB_URL" != "NOT_FOUND" ] && [ -n "$DB_URL" ]; then
  echo "✅ DATABASE_URL is set!"
  echo ""
  echo "▶ Running Prisma migrations..."
  DATABASE_URL="$DB_URL" npx prisma migrate deploy 2>&1 | tail -10
  echo ""
  echo "▶ Running seed..."
  DATABASE_URL="$DB_URL" npx tsx prisma/seed.ts 2>&1 | tail -10
else
  echo "⚠️  DATABASE_URL not found. Manual intervention needed."
  echo "  Go to: https://railway.com/project/69ca3009-3a67-4d92-b808-6e4f278335d6"
  echo "  Add PostgreSQL plugin to the project and link to adlytic service"
fi

echo ""
echo "▶ Final health check:"
curl -s https://adlytic-production.up.railway.app/api/health 2>/dev/null
echo ""
echo ""
echo "▶ Final login test:"
curl -s -X POST https://adlytic-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
  --max-time 10 2>/dev/null | head -c 200
echo ""
echo ""
echo "Press Enter to close..."
read
