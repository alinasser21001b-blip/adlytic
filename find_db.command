#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Find & Link Database
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Find & Link Database               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link to the service
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 \
             --environment 89cdf3cb-15b7-4b92-b1ae-07e812333c37 \
             --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || true

echo "▶ Railway CLI version:"
railway --version

echo ""
echo "▶ All services in project:"
railway service 2>&1

echo ""
echo "▶ Trying to add PostgreSQL database..."
railway add -d postgresql 2>&1 | tee /tmp/railway_add_output.txt

echo ""
echo "▶ Add output:"
cat /tmp/railway_add_output.txt

echo ""
echo "▶ Waiting 30s for database to provision..."
sleep 30

echo ""
echo "▶ Current variables after add:"
railway variables 2>&1

echo ""
echo "▶ Trying to get Postgres URL directly..."
# Try switching to postgres service and getting its url
railway variables --service Postgres 2>&1 | head -20 || true
railway variables --service postgres 2>&1 | head -20 || true
railway variables --service PostgreSQL 2>&1 | head -20 || true

echo ""
echo "▶ Full project variable dump:"
railway variables --json 2>&1 | python3 -m json.tool 2>/dev/null | head -50

echo ""
echo "Press Enter to close..."
read
