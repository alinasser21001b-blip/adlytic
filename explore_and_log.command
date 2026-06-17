#!/bin/bash
# Run explore and log to file
cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/EXPLORE_LOG.txt) 2>&1

echo "=== Railway CLI Explore ==="
date
echo ""

echo "▶ Railway CLI version:"
railway --version
echo ""

echo "▶ railway add --help:"
railway add --help 2>&1
echo ""

echo "▶ Config token:"
cat ~/.railway/config.json 2>/dev/null || echo "No config file"
echo ""

echo "▶ Test me query with config token:"
TOKEN=$(python3 -c "import json,sys; d=json.load(open('/Users/aliahhed/.railway/config.json')); print(d.get('token', d.get('accessToken','NOT_FOUND')))" 2>/dev/null || echo "PARSE_FAILED")
echo "  Token (first 20): ${TOKEN:0:20}..."

ME=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email } }"}' 2>/dev/null)
echo "  Me query result: $ME"
echo ""

echo "▶ Test with hardcoded token:"
HT="Y6P7RXH9qtUjm8BWt9dgnbZKx2eH5sW-KvkZfwYCRaP"
ME2=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $HT" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ me { id email } }"}' 2>/dev/null)
echo "  Hardcoded token me: $ME2"
echo ""

echo "▶ Check current railway variables:"
railway link --project 69ca3009-3a67-4d92-b808-6e4f278335d6 \
             --environment 89cdf3cb-15b7-4b92-b1ae-07e812333c37 \
             --service cc7cbf67-d757-4018-bf6d-9cec643222c3 2>/dev/null || true
railway variables 2>&1
echo ""

echo "▶ Check services in project:"
railway service list 2>&1 || railway service 2>&1 | head -5 || echo "No service list"
echo ""

echo "▶ Try: railway add --plugin postgresql (pipe newline):"
result=$(printf '\n' | timeout 30 railway add --plugin postgresql 2>&1 || true)
echo "  Output: $result"
echo ""

echo "▶ Try: railway add -d postgresql:"
result2=$(timeout 30 railway add -d postgresql 2>&1 || true)
echo "  Output2: $result2"
echo ""

echo "▶ Variables after add attempts:"
railway variables 2>&1
echo ""

echo "=== DONE ==="
