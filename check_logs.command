#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Check Railway Logs
# ════════════════════════════════════════════════════════════════════════

cd /Users/aliahhed/Downloads/adlytic

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Railway Build Logs                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Link to project
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 \
             --environment 89cdf3cb-15b7-4b92-b1ae-07e812333c37 \
             --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || true

echo ""
echo "▶ Fetching recent deployment logs (last 100 lines)..."
echo ""

railway logs --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>&1 | tail -100 | tee RAILWAY_LOGS.txt

echo ""
echo "▶ Logs saved to RAILWAY_LOGS.txt"
echo ""
echo "▶ Current service status:"
curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 10 https://adlytic-production.up.railway.app/api/health 2>/dev/null
echo ""
echo ""
echo "Press Enter to close..."
read
