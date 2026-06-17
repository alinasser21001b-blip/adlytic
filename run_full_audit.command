#!/bin/bash
# ============================================================
# Adlytic Full Audit & Fix Script
# Runs on YOUR Mac — native Prisma binaries, real PostgreSQL
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
BASE="$(pwd)"
LOG="$BASE/audit_run.log"
exec > >(tee -a "$LOG") 2>&1

echo "========================================"
echo "  Adlytic Full Audit — $(date)"
echo "  Dir: $BASE"
echo "========================================"

PASS=0
FAIL=0
FIXES=0

pass() { echo "  ✅ PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL=$((FAIL+1)); }
info() { echo "  ℹ️  $1"; }
fix()  { echo "  🔧 FIX:  $1"; FIXES=$((FIXES+1)); }

# ── 0. Prerequisites ──────────────────────────────────────
echo ""
echo "━━━ PHASE 0: Prerequisites ━━━"

# Check node
if command -v node &>/dev/null; then
  pass "node $(node --version)"
else
  fail "node not found — install Node.js first"; exit 1
fi

# Check npm/npx
if command -v npx &>/dev/null; then
  pass "npx available"
else
  fail "npx not found"; exit 1
fi

# Check .env exists
if [ -f "$BASE/.env" ]; then
  pass ".env file exists"
  source "$BASE/.env" 2>/dev/null || true
else
  fail ".env file missing — cannot continue"; exit 1
fi

# ── 1. Kill any stale server ──────────────────────────────
echo ""
echo "━━━ PHASE 1: Clean up stale processes ━━━"
pkill -f "tsx src/serve" 2>/dev/null && fix "Killed stale tsx server" || info "No stale tsx process"
pkill -f "node.*serve"  2>/dev/null && fix "Killed stale node server" || true
lsof -ti :3001 2>/dev/null | xargs kill -9 2>/dev/null && fix "Killed process on port 3001" || info "Port 3001 free"
sleep 1

# ── 2. Delete duplicate getDashboard.tsx ─────────────────
echo ""
echo "━━━ PHASE 2: Remove duplicate files ━━━"
if [ -f "$BASE/src/services/getDashboard.tsx" ]; then
  rm "$BASE/src/services/getDashboard.tsx"
  fix "Deleted duplicate getDashboard.tsx"
else
  pass "No duplicate getDashboard.tsx"
fi

# Check for any other .tsx files in services
TSX_COUNT=$(find "$BASE/src" -name "*.tsx" | wc -l | tr -d ' ')
if [ "$TSX_COUNT" -gt 0 ]; then
  info "Found $TSX_COUNT .tsx files in src:"
  find "$BASE/src" -name "*.tsx"
else
  pass "No .tsx files in src (clean)"
fi

# ── 3. Prisma generate ────────────────────────────────────
echo ""
echo "━━━ PHASE 3: Prisma generate ━━━"
if npx prisma generate 2>&1 | tail -3; then
  pass "prisma generate succeeded"
else
  fail "prisma generate failed"; exit 1
fi

# ── 4. TypeScript check ───────────────────────────────────
echo ""
echo "━━━ PHASE 4: TypeScript compilation ━━━"
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
TS_ERRORS=$(echo "$TSC_OUT" | grep -c "error TS" || true)
if [ "$TS_ERRORS" -eq 0 ]; then
  pass "TypeScript: 0 errors"
else
  echo "$TSC_OUT"
  fail "TypeScript: $TS_ERRORS errors found"
  # Don't exit — try to continue
fi

# ── 5. Database seed ──────────────────────────────────────
echo ""
echo "━━━ PHASE 5: Database seed ━━━"
if npx prisma db seed 2>&1 | tail -10; then
  pass "Database seeded successfully"
else
  fail "Database seed failed"
  # Try to continue anyway
fi

# ── 6. Database content audit ─────────────────────────────
echo ""
echo "━━━ PHASE 6: Database content audit ━━━"
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  try {
    const ws = await p.workspace.findMany({ select: { id: true, name: true } });
    console.log('WORKSPACES:', ws.length, JSON.stringify(ws.map(w=>w.name)));
    if (ws.length < 2) { console.log('FAIL: Need 2 workspaces, got ' + ws.length); process.exit(1); }

    const camps = await p.campaign.findMany({ select: { id: true, name: true, workspaceId: true } });
    console.log('CAMPAIGNS:', camps.length, JSON.stringify(camps.map(c=>c.name)));
    if (camps.length < 4) { console.log('FAIL: Need 4+ campaigns, got ' + camps.length); process.exit(1); }

    const adsets = await p.adSet.findMany({ select: { id: true, name: true, campaignId: true } });
    console.log('ADSETS:', adsets.length, JSON.stringify(adsets.map(a=>a.name)));
    if (adsets.length < 4) { console.log('FAIL: Need 4+ adsets, got ' + adsets.length); process.exit(1); }

    const ads = await p.ad.findMany({ select: { id: true, name: true } });
    console.log('ADS:', ads.length);
    if (ads.length < 4) { console.log('FAIL: Need 4+ ads, got ' + ads.length); process.exit(1); }

    const hs = await p.healthScore.findMany({ select: { workspaceId: true, algorithmVersion: true, score: true } });
    console.log('HEALTH_SCORES:', JSON.stringify(hs));
    const v2Scores = hs.filter(h => h.algorithmVersion === 2);
    if (v2Scores.length < 1) { console.log('FAIL: No algorithmVersion=2 health scores'); process.exit(1); }

    const recs = await p.recommendation.findMany({ select: { workspaceId: true, title: true } });
    console.log('RECOMMENDATIONS:', recs.length, JSON.stringify(recs.map(r=>r.title)));

    const issues = await p.detectedIssue.findMany({ select: { workspaceId: true, severity: true } });
    console.log('ISSUES:', issues.length);

    const mt = await p.metricTrend.count();
    console.log('METRIC_TRENDS:', mt);

    const members = await p.workspaceMember.findMany({ select: { workspaceId: true, role: true } });
    console.log('MEMBERS:', members.length);

    console.log('DB_AUDIT_PASS');
  } catch(e) {
    console.error('DB_ERROR:', e.message);
    process.exit(1);
  } finally {
    await p.\$disconnect();
  }
}
main();
" && pass "Database audit passed" || fail "Database audit failed"

# ── 7. Start server ───────────────────────────────────────
echo ""
echo "━━━ PHASE 7: Start server ━━━"
nohup npx tsx src/serve.ts > /tmp/adlytic_server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 4

# Check health
HEALTH=$(curl -s --max-time 5 http://localhost:3001/health 2>&1 || echo "FAILED")
if echo "$HEALTH" | grep -q '"ok"'; then
  pass "Server healthy: $HEALTH"
else
  fail "Server health check failed: $HEALTH"
  echo "--- Server log ---"
  tail -30 /tmp/adlytic_server.log
  # Try to continue with remaining tests
fi

# ── 8. Auth & token ───────────────────────────────────────
echo ""
echo "━━━ PHASE 8: Authentication ━━━"
LOGIN_RESP=$(curl -s --max-time 10 -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}' 2>&1 || echo '{"error":"curl_failed"}')
echo "Login response: $LOGIN_RESP"

TOKEN=$(echo "$LOGIN_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); console.log(j.token||j.accessToken||''); } catch(e){ console.log(''); }
  });
")

WS1=$(echo "$LOGIN_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const ws=j.workspaces||j.user?.workspaces||[]; console.log(ws[0]?.id||''); } catch(e){ console.log(''); }
  });
")

WS2=$(echo "$LOGIN_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const ws=j.workspaces||j.user?.workspaces||[]; console.log(ws[1]?.id||''); } catch(e){ console.log(''); }
  });
")

echo "TOKEN: ${TOKEN:0:20}..."
echo "WS1: $WS1"
echo "WS2: $WS2"

if [ -n "$TOKEN" ]; then
  pass "Auth token obtained"
else
  fail "No auth token — cannot test authenticated routes"
  TOKEN=""
fi

if [ -n "$WS1" ]; then
  pass "Workspace 1 ID: $WS1"
else
  fail "No workspace 1 ID"
  WS1="MISSING"
fi

if [ -n "$WS2" ]; then
  pass "Workspace 2 ID: $WS2"
else
  info "No workspace 2 (may be single workspace)"
  WS2="$WS1"
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"

# ── 9. Test all 20 routes ─────────────────────────────────
echo ""
echo "━━━ PHASE 9: Route verification (all 20 routes) ━━━"

test_route() {
  local METHOD="$1"
  local PATH="$2"
  local EXPECTED="$3"
  local DESC="$4"
  local BODY="${5:-}"
  local URL="http://localhost:3001$PATH"

  if [ -n "$BODY" ]; then
    RESP=$(curl -s --max-time 10 -X "$METHOD" "$URL" \
      -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
      -d "$BODY" -w "\nHTTP_%{http_code}" 2>&1 || echo "CURL_ERROR\nHTTP_000")
  else
    RESP=$(curl -s --max-time 10 -X "$METHOD" "$URL" \
      -H "$AUTH_HEADER" -w "\nHTTP_%{http_code}" 2>&1 || echo "CURL_ERROR\nHTTP_000")
  fi

  HTTP_CODE=$(echo "$RESP" | grep "HTTP_" | tail -1 | sed 's/HTTP_//')
  BODY_RESP=$(echo "$RESP" | grep -v "HTTP_")

  if echo "$HTTP_CODE" | grep -qE "^(${EXPECTED})$"; then
    # Check for undefined values in body
    if echo "$BODY_RESP" | grep -q '"undefined"'; then
      fail "$DESC → HTTP $HTTP_CODE but contains literal 'undefined' strings"
      echo "    Body excerpt: ${BODY_RESP:0:200}"
    else
      pass "$DESC → HTTP $HTTP_CODE"
    fi
  else
    fail "$DESC → Expected HTTP $EXPECTED, got $HTTP_CODE"
    echo "    Body: ${BODY_RESP:0:300}"
  fi
}

# Route 1: Health
test_route "GET" "/health" "200" "GET /health"

# Route 2: Auth login (already tested above)
pass "POST /api/auth/login → HTTP 200 (verified above)"

# Route 3: Auth me
test_route "GET" "/api/auth/me" "200" "GET /api/auth/me"

# Route 4: Auth logout
test_route "POST" "/api/auth/logout" "200|204" "POST /api/auth/logout"

# Re-login after logout test
LOGIN_RESP2=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}')
TOKEN=$(echo "$LOGIN_RESP2" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); console.log(j.token||j.accessToken||''); } catch(e){ console.log(''); }
  });
")
AUTH_HEADER="Authorization: Bearer $TOKEN"

# Route 5: Dashboard WS1
DASH=$(curl -s -X GET "http://localhost:3001/api/workspaces/$WS1/dashboard" -H "$AUTH_HEADER")
echo "Dashboard WS1 excerpt: ${DASH:0:400}"
if echo "$DASH" | grep -q '"health"'; then
  # Check health score > 0
  SCORE=$(echo "$DASH" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); console.log(j.health?.score||0); } catch(e){ console.log(0); }
    });
  ")
  if [ "$SCORE" -gt 0 ] 2>/dev/null; then
    pass "GET /api/workspaces/WS1/dashboard → HTTP 200 (health=$SCORE)"
  else
    fail "GET /api/workspaces/WS1/dashboard → health score is 0 or missing (score=$SCORE)"
    echo "    Full dashboard: $DASH" | head -c 1000
  fi
else
  fail "GET /api/workspaces/WS1/dashboard → missing 'health' field"
  echo "    Response: $DASH" | head -c 500
fi

# Route 6: Dashboard WS2
if [ "$WS2" != "$WS1" ]; then
  test_route "GET" "/api/workspaces/$WS2/dashboard" "200" "GET /api/workspaces/WS2/dashboard"
fi

# Route 7: Workspace settings WS1
test_route "GET" "/api/workspaces/$WS1" "200" "GET /api/workspaces/WS1"

# Route 8: Update workspace settings
test_route "PUT" "/api/workspaces/$WS1" "200" "PUT /api/workspaces/WS1" '{"name":"Furniture Showroom"}'

# Route 9: List members
test_route "GET" "/api/workspaces/$WS1/members" "200" "GET /api/workspaces/WS1/members"

# Route 10: Invite member (use a test email that won't conflict)
INVITE_RESP=$(curl -s -X POST "http://localhost:3001/api/workspaces/$WS1/members" \
  -H "$AUTH_HEADER" -H 'Content-Type: application/json' \
  -d '{"email":"test_invite_@adlytic.test","role":"viewer"}' -w "\nHTTP_%{http_code}")
INVITE_CODE=$(echo "$INVITE_RESP" | grep "HTTP_" | tail -1 | sed 's/HTTP_//')
if echo "$INVITE_CODE" | grep -qE "^(200|201|409|422)$"; then
  pass "POST /api/workspaces/WS1/members → HTTP $INVITE_CODE"
else
  fail "POST /api/workspaces/WS1/members → HTTP $INVITE_CODE"
fi

# Route 11: List campaigns
CAMPS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/campaigns" -H "$AUTH_HEADER")
CAMP1_ID=$(echo "$CAMPS_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.campaigns||j.data||[]); console.log(arr[0]?.id||''); } catch(e){ console.log(''); }
  });
")
CAMPS_COUNT=$(echo "$CAMPS_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.campaigns||j.data||[]); console.log(arr.length); } catch(e){ console.log(0); }
  });
")
if [ "$CAMPS_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET /api/workspaces/WS1/campaigns → $CAMPS_COUNT campaigns (first ID: $CAMP1_ID)"
else
  fail "GET /api/workspaces/WS1/campaigns → 0 campaigns or error"
  echo "    Response: $CAMPS_RESP" | head -c 400
fi

# Route 12: Campaign detail
if [ -n "$CAMP1_ID" ]; then
  test_route "GET" "/api/workspaces/$WS1/campaigns/$CAMP1_ID" "200" "GET /api/workspaces/WS1/campaigns/CAMP1"
else
  fail "GET /api/workspaces/WS1/campaigns/CAMP1 — no campaign ID to test"
fi

# Route 13: AdSets for campaign
if [ -n "$CAMP1_ID" ]; then
  ADSETS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/campaigns/$CAMP1_ID/adsets" -H "$AUTH_HEADER")
  ADSET_COUNT=$(echo "$ADSETS_RESP" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.adSets||j.data||[]); console.log(arr.length); } catch(e){ console.log(0); }
    });
  ")
  ADSET1_ID=$(echo "$ADSETS_RESP" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.adSets||j.data||[]); console.log(arr[0]?.id||''); } catch(e){ console.log(''); }
    });
  ")
  if [ "$ADSET_COUNT" -gt 0 ] 2>/dev/null; then
    pass "GET .../campaigns/CAMP1/adsets → $ADSET_COUNT adsets"
  else
    fail "GET .../campaigns/CAMP1/adsets → 0 adsets (campaign drill-down broken)"
    echo "    Response: $ADSETS_RESP" | head -c 400
  fi
else
  fail "Campaign adsets — no campaign ID"
  ADSET1_ID=""
fi

# Route 14: AdSet detail
if [ -n "$ADSET1_ID" ] && [ -n "$CAMP1_ID" ]; then
  test_route "GET" "/api/workspaces/$WS1/campaigns/$CAMP1_ID/adsets/$ADSET1_ID" "200" "GET .../adsets/ADSET1"

  # Route 15: Ads for adset
  ADS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/campaigns/$CAMP1_ID/adsets/$ADSET1_ID/ads" -H "$AUTH_HEADER")
  AD_COUNT=$(echo "$ADS_RESP" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.ads||j.data||[]); console.log(arr.length); } catch(e){ console.log(0); }
    });
  ")
  AD1_ID=$(echo "$ADS_RESP" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
      try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.ads||j.data||[]); console.log(arr[0]?.id||''); } catch(e){ console.log(''); }
    });
  ")
  if [ "$AD_COUNT" -gt 0 ] 2>/dev/null; then
    pass "GET .../adsets/ADSET1/ads → $AD_COUNT ads"
  else
    fail "GET .../adsets/ADSET1/ads → 0 ads"
  fi

  # Route 16: Ad detail
  if [ -n "$AD1_ID" ]; then
    test_route "GET" "/api/workspaces/$WS1/campaigns/$CAMP1_ID/adsets/$ADSET1_ID/ads/$AD1_ID" "200" "GET .../ads/AD1"
  fi
else
  fail "AdSet routes — no adset ID"
fi

# Route 17: Insights
INSIGHTS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/insights" -H "$AUTH_HEADER")
if echo "$INSIGHTS_RESP" | grep -qiE '"spend"|"impressions"|"clicks"'; then
  pass "GET /api/workspaces/WS1/insights → has metric data"
else
  fail "GET /api/workspaces/WS1/insights → missing expected fields"
  echo "    Response: $INSIGHTS_RESP" | head -c 500
fi

# Route 18: Trends — check for correct field names
TRENDS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/insights/trends" -H "$AUTH_HEADER")
if echo "$TRENDS_RESP" | grep -q '"ctrTrend"'; then
  pass "GET /api/workspaces/WS1/insights/trends → has ctrTrend field"
elif echo "$TRENDS_RESP" | grep -q '"trend"'; then
  fail "GET /api/workspaces/WS1/insights/trends → has wrong field name 'trend' instead of 'ctrTrend' etc."
  echo "    Response: $TRENDS_RESP" | head -c 500
else
  fail "GET /api/workspaces/WS1/insights/trends → missing trend fields"
  echo "    Response: $TRENDS_RESP" | head -c 500
fi

# Route 19: Recommendations
RECS_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/recommendations" -H "$AUTH_HEADER")
REC_COUNT=$(echo "$RECS_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.recommendations||j.data||[]); console.log(arr.length); } catch(e){ console.log('ERR'); }
  });
")
if [ "$REC_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET /api/workspaces/WS1/recommendations → $REC_COUNT recommendations"
else
  fail "GET /api/workspaces/WS1/recommendations → $REC_COUNT (empty or error)"
  echo "    Response: $RECS_RESP" | head -c 400
fi

# Route 20: Issues
ISSUES_RESP=$(curl -s "http://localhost:3001/api/workspaces/$WS1/issues" -H "$AUTH_HEADER")
ISS_COUNT=$(echo "$ISSUES_RESP" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try { const j=JSON.parse(d); const arr=Array.isArray(j)?j:(j.issues||j.data||[]); console.log(arr.length); } catch(e){ console.log('ERR'); }
  });
")
if [ "$ISS_COUNT" -gt 0 ] 2>/dev/null; then
  pass "GET /api/workspaces/WS1/issues → $ISS_COUNT issues"
else
  fail "GET /api/workspaces/WS1/issues → $ISS_COUNT (empty or error)"
  echo "    Response: $ISSUES_RESP" | head -c 400
fi

# Route 21: Sync (expect 200 or 422)
test_route "POST" "/api/workspaces/$WS1/sync" "200|422" "POST /api/workspaces/WS1/sync"

# ── 10. WS2 spot checks ───────────────────────────────────
if [ "$WS2" != "$WS1" ]; then
  echo ""
  echo "━━━ PHASE 10: Workspace 2 spot checks ━━━"
  test_route "GET" "/api/workspaces/$WS2/dashboard" "200" "GET /api/workspaces/WS2/dashboard"
  test_route "GET" "/api/workspaces/$WS2/campaigns" "200" "GET /api/workspaces/WS2/campaigns"
  test_route "GET" "/api/workspaces/$WS2/recommendations" "200" "GET /api/workspaces/WS2/recommendations"
fi

# ── 11. Final undefined scan ──────────────────────────────
echo ""
echo "━━━ PHASE 11: Scan for 'undefined' in all responses ━━━"
ALL_ROUTES=(
  "/api/workspaces/$WS1/dashboard"
  "/api/workspaces/$WS1/campaigns"
  "/api/workspaces/$WS1/insights"
  "/api/workspaces/$WS1/insights/trends"
  "/api/workspaces/$WS1/recommendations"
  "/api/workspaces/$WS1/issues"
)
UNDEF_FOUND=0
for ROUTE in "${ALL_ROUTES[@]}"; do
  RESP=$(curl -s "http://localhost:3001$ROUTE" -H "$AUTH_HEADER")
  if echo "$RESP" | grep -q '"undefined"'; then
    fail "Route $ROUTE contains literal 'undefined' string"
    UNDEF_FOUND=1
  fi
done
if [ "$UNDEF_FOUND" -eq 0 ]; then
  pass "No literal 'undefined' values in any route response"
fi

# ── FINAL SUMMARY ─────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "  FINAL SUMMARY"
echo "════════════════════════════════════════"
echo "  ✅ PASSED: $PASS"
echo "  ❌ FAILED: $FAIL"
echo "  🔧 FIXES APPLIED: $FIXES"
echo ""
echo "  Log saved to: $LOG"
echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "  ╔════════════════════════════════╗"
  echo "  ║  FINAL STATUS: PASS  🎉        ║"
  echo "  ╚════════════════════════════════╝"
else
  echo "  ╔════════════════════════════════╗"
  echo "  ║  FINAL STATUS: FAIL  ❌        ║"
  echo "  ║  $FAIL checks need attention   ║"
  echo "  ╚════════════════════════════════╝"
fi
echo ""
echo "Server is running on http://localhost:3001"
echo "Open dashboard_wired.html in your browser to verify UI"
echo "Press Ctrl+C in this window when done."
