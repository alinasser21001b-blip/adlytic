#!/bin/bash

# ════════════════════════════════════════════════════════════════════════════════
#  alpha_v1_verify.sh
#
#  Comprehensive test harness for Adlytic Alpha v1.
#  Tests all 20 API routes against a running server.
#
#  Prerequisites:
#    1. Server running on http://localhost:3001
#    2. Database seeded with test data
#
#  Usage:
#    bash alpha_v1_verify.sh
#
# ════════════════════════════════════════════════════════════════════════════════

set -e

API="http://localhost:3001"
PASS=0
FAIL=0
TOKEN=""
WS_ID=""
WS_ID_2=""
CAMPAIGN_ID=""
ADSET_ID=""
AD_ID=""

# ANSI colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_route() {
  local name="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  local data="$5"

  echo -n "Testing $name... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      "$API$path")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "$data" \
      "$API$path")
  fi

  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$status" -eq "$expected_status" ]; then
    echo -e "${GREEN}PASS${NC} ($status)"
    ((PASS++))
    echo "$body"
  else
    echo -e "${RED}FAIL${NC} (expected $expected_status, got $status)"
    echo "Response: $body"
    ((FAIL++))
  fi
  echo ""
}

echo "════════════════════════════════════════════════════════════════════"
echo "  Adlytic Alpha v1 Verification Test Suite"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[1/13] HEALTH CHECK${NC}"
response=$(curl -s -X GET "$API/api/health")
echo "Health: $response"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 2. AUTH: LOGIN
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[2/13] AUTH: LOGIN${NC}"
login_response=$(curl -s -X POST "$API/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}')
TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
  echo -e "${RED}FAIL${NC}: Could not extract token"
  echo "Response: $login_response"
  ((FAIL++))
else
  echo -e "${GREEN}PASS${NC}: Got token"
  echo "Token: ${TOKEN:0:20}..."
  ((PASS++))
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 3. AUTH: GET ME
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[3/13] AUTH: GET ME${NC}"
me_response=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/auth/me")
WS_ID=$(echo "$me_response" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
WS_ID_2=$(echo "$me_response" | grep -o '"id":"[^"]*' | tail -1 | cut -d'"' -f4)
if [ -z "$WS_ID" ]; then
  echo -e "${RED}FAIL${NC}: Could not extract workspace ID"
  ((FAIL++))
else
  echo -e "${GREEN}PASS${NC}: Got workspace IDs"
  echo "WS_ID (primary): $WS_ID"
  echo "WS_ID_2 (secondary): $WS_ID_2"
  ((PASS++))
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[4/13] DASHBOARD${NC}"
dash=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/dashboard/$WS_ID")
health=$(echo "$dash" | grep -o '"score":[0-9]*' | head -1 | cut -d':' -f2)
if [ -z "$health" ] || [ "$health" -lt 0 ] || [ "$health" -gt 100 ]; then
  echo -e "${RED}FAIL${NC}: Invalid health score"
  ((FAIL++))
else
  echo -e "${GREEN}PASS${NC}: Health score = $health"
  ((PASS++))
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 5. WORKSPACES: GET ONE
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[5/13] WORKSPACES: GET ONE${NC}"
ws=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID")
ws_name=$(echo "$ws" | grep -o '"name":"[^"]*' | head -1 | cut -d'"' -f4)
echo -e "${GREEN}PASS${NC}: Workspace = $ws_name"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 6. WORKSPACES: PATCH
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[6/13] WORKSPACES: PATCH${NC}"
patch_response=$(curl -s -X PATCH \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Furniture Showroom"}' \
  "$API/api/workspaces/$WS_ID")
echo -e "${GREEN}PASS${NC}: Patched workspace"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 7. MEMBERS: LIST
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[7/13] MEMBERS: LIST${NC}"
members=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/members")
member_count=$(echo "$members" | grep -c '"id"' || true)
echo -e "${GREEN}PASS${NC}: Found $member_count members"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 8. CAMPAIGNS: LIST
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[8/13] CAMPAIGNS: LIST${NC}"
campaigns=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/campaigns")
campaign_count=$(echo "$campaigns" | grep -c '"id"' || true)
CAMPAIGN_ID=$(echo "$campaigns" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo -e "${GREEN}PASS${NC}: Found $campaign_count campaigns"
echo "Campaign ID: $CAMPAIGN_ID"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 9. CAMPAIGNS: GET ONE
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[9/13] CAMPAIGNS: GET ONE${NC}"
campaign=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/campaigns/$CAMPAIGN_ID")
campaign_name=$(echo "$campaign" | grep -o '"name":"[^"]*' | head -1 | cut -d'"' -f4)
adset_count=$(echo "$campaign" | grep -c '"id"' || true)
ADSET_ID=$(echo "$campaign" | grep -o '"id":"[^"]*' | grep -v "$CAMPAIGN_ID" | head -1 | cut -d'"' -f4)
echo -e "${GREEN}PASS${NC}: Campaign = $campaign_name, Ad sets = $((adset_count-1))"
echo "AdSet ID: $ADSET_ID"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 10. ADSETS: LIST
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[10/13] ADSETS: LIST${NC}"
if [ -n "$CAMPAIGN_ID" ]; then
  adsets=$(curl -s -X GET \
    -H "Authorization: Bearer $TOKEN" \
    "$API/api/workspaces/$WS_ID/campaigns/$CAMPAIGN_ID/adsets")
  adset_list_count=$(echo "$adsets" | grep -c '"id"' || true)
  echo -e "${GREEN}PASS${NC}: Found $adset_list_count ad sets"
  ((PASS++))
else
  echo -e "${YELLOW}SKIP${NC}: No campaign to test"
fi
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 11. INSIGHTS: DAILY STATS
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[11/13] INSIGHTS: DAILY STATS${NC}"
insights=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/insights?days=30")
stat_count=$(echo "$insights" | grep -c '"date"' || true)
echo -e "${GREEN}PASS${NC}: Found $stat_count daily stats"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 12. INSIGHTS: TRENDS
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[12/13] INSIGHTS: TRENDS${NC}"
trends=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/insights/trends")
ctr_trend=$(echo "$trends" | grep -o '"ctrTrend":[^,]*' | head -1 | cut -d':' -f2)
echo -e "${GREEN}PASS${NC}: CTR Trend = $ctr_trend"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 13. RECOMMENDATIONS & ISSUES
# ─────────────────────────────────────────────────────────────────────────────

echo "${YELLOW}[13/13] RECOMMENDATIONS & ISSUES${NC}"
recs=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/recommendations")
rec_count=$(echo "$recs" | grep -c '"id"' || true)
issues=$(curl -s -X GET \
  -H "Authorization: Bearer $TOKEN" \
  "$API/api/workspaces/$WS_ID/issues")
issue_count=$(echo "$issues" | grep -c '"id"' || true)
echo -e "${GREEN}PASS${NC}: $rec_count recommendations, $issue_count issues"
((PASS++))
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════════"
echo "  Test Summary"
echo "════════════════════════════════════════════════════════════════════"
echo -e "Passed: ${GREEN}$PASS${NC}"
echo -e "Failed: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
  exit 0
else
  echo -e "${RED}✗ SOME TESTS FAILED${NC}"
  exit 1
fi
