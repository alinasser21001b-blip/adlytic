#!/bin/bash
cd /Users/aliahhed/Downloads/adlytic

echo "╔══════════════════════════════════════════════════════╗"
echo "║     Railway CLI Commands & Database Options         ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

echo "▶ Railway CLI version:"
railway --version
echo ""

echo "▶ railway add --help:"
railway add --help 2>&1
echo ""

echo "▶ railway up --help (checking available flags):"
railway up --help 2>&1 | head -20
echo ""

echo "▶ Current project token from config:"
cat ~/.railway/config.json 2>/dev/null || echo "No config file found"
echo ""

echo "▶ Test Railway API auth with 'me' query:"
TOKEN=$(cat ~/.railway/config.json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('accessToken',''))" 2>/dev/null || echo "Y6P7RXH9qtUjm8BWt9dgnbZKx2eH5sW-KvkZfwYCRaP")
echo "  Token prefix: ${TOKEN:0:20}..."

ME_RESULT=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: railway-cli/5.14.0" \
  -d '{"query":"{ me { id email } }"}' 2>/dev/null)
echo "  Me query: $ME_RESULT"
echo ""

echo "▶ Test project query:"
PROJECT_RESULT=$(curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: railway-cli/5.14.0" \
  -d '{"query":"{ project(id: \"69ca3009-3a67-4d92-b808-6e4f278335d6\") { id name services { edges { node { id name } } } } }"}' 2>/dev/null)
echo "  Project services: $PROJECT_RESULT"
echo ""

echo "▶ Try non-interactive database add with YES piped:"
# Try different approaches
printf 'y\n' | railway add --plugin postgresql --yes 2>&1 || \
printf '\n' | railway add --plugin postgresql 2>&1 | head -10 || \
echo "  All add methods failed"

echo ""
echo "Press Enter to close..."
read
