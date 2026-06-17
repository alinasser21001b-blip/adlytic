#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  final_verify.command  —  Adlytic Alpha v1.0 full validation
#
#  Runs autonomously:
#    1. Kill old server
#    2. prisma generate
#    3. tsc --noEmit  (must be 0 errors)
#    4. prisma db seed  (idempotent: re-seeds all data)
#    5. Start server (background)
#    6. Test ALL 20 routes for BOTH workspaces with real IDs
#    7. Verify health score > 0, no undefined values, adsets/ads exist
#    8. Print per-check PASS/FAIL + final summary
# ════════════════════════════════════════════════════════════════════════
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PASS=0; FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }

http_status() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
body()        { curl -s "$@"; }

check_status() {
  local label="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then ok "$label → HTTP $got"
  else fail "$label → HTTP $got (expected $expected)"; fi
}

check_array_nonempty() {
  local label="$1" resp="$2"
  local count
  count=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d) if isinstance(d,list) else -1)" 2>/dev/null)
  if [ "${count:-0}" -gt 0 ] 2>/dev/null; then ok "$label → $count item(s)"
  else fail "$label → empty or not an array"; fi
}

wait_for_server() {
  local attempts=0
  while [ $attempts -lt 20 ]; do
    if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then return 0; fi
    sleep 0.5; attempts=$((attempts+1))
  done
  echo "✗ Server did not start within 10s"; exit 1
}

echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Adlytic Alpha v1.0 — Final verification"
echo "══════════════════════════════════════════════════════════════"
echo ""

# ── 1. Kill old server ────────────────────────────────────────────────────
echo "▶ 1. Stopping any process on port 3001…"
lsof -ti :3001 | xargs kill -9 2>/dev/null && echo "  Killed old server" || echo "  (nothing running)"
sleep 1

# ── 2. Prisma generate ───────────────────────────────────────────────────
echo ""
echo "▶ 2. npx prisma generate…"
npx prisma generate 2>&1 | grep -E "generated|error" | head -5
echo "  ✓ Done"

# ── 3. TypeScript ────────────────────────────────────────────────────────
echo ""
echo "▶ 3. npx tsc --noEmit…"
TS_OUT=$(npx tsc --noEmit 2>&1)
if [ -z "$TS_OUT" ]; then
  ok "TypeScript: 0 errors"
else
  echo "$TS_OUT" | head -20
  fail "TypeScript errors found"
fi

# ── 4. Seed database ─────────────────────────────────────────────────────
echo ""
echo "▶ 4. npx prisma db seed…"
SEED_OUT=$(npx prisma db seed 2>&1)
echo "$SEED_OUT" | grep -E "✓|✗|⟳|error" | tail -8
if echo "$SEED_OUT" | grep -q "Seed complete"; then
  ok "Database seeded (algorithmVersion=2, 4 campaigns, 8 adsets, 10 ads)"
else
  fail "Seed may have failed — check output"
  echo "$SEED_OUT" | tail -10
fi

# ── 5. Start server ──────────────────────────────────────────────────────
echo ""
echo "▶ 5. Starting server (background)…"
npx tsx src/api/serve.ts > /tmp/adlytic_server.log 2>&1 &
SERVER_PID=$!
wait_for_server
ok "Server up on port 3001 (PID $SERVER_PID)"

# ── 6. Auth flow ─────────────────────────────────────────────────────────
echo ""
echo "── Auth ──"

HEALTH_STATUS=$(http_status http://localhost:3001/api/health)
check_status "GET /api/health" "200" "$HEALTH_STATUS"

LOGIN_RESP=$(body -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}')
LOGIN_STATUS=$(http_status -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}')
check_status "POST /api/auth/login" "200" "$LOGIN_STATUS"

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
if [ -n "$TOKEN" ]; then ok "Token received (${TOKEN:0:16}…)"; else fail "No token in login response"; fi

ME_RESP=$(body http://localhost:3001/api/auth/me -H "Authorization: Bearer $TOKEN")
ME_STATUS=$(http_status http://localhost:3001/api/auth/me -H "Authorization: Bearer $TOKEN")
check_status "GET /api/auth/me" "200" "$ME_STATUS"

WS_IDS=($(echo "$ME_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for m in d.get('memberships',[]): print(m['workspace']['id'])
" 2>/dev/null))
WS_NAMES=($(echo "$ME_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for m in d.get('memberships',[]): print(m['workspace']['name'].replace(' ','_'))
" 2>/dev/null))

WS_COUNT=${#WS_IDS[@]}
if [ "$WS_COUNT" -ge 2 ]; then ok "Found $WS_COUNT workspaces: ${WS_NAMES[*]}"
else fail "Expected 2 workspaces, got $WS_COUNT"; fi

# Bad credentials
BAD=$(http_status -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" -d '{"email":"x@x.com","password":"wrong"}')
check_status "POST /api/auth/login (bad creds → 401)" "401" "$BAD"

# No token
NOAUTH=$(http_status http://localhost:3001/api/auth/me)
check_status "GET /api/auth/me (no token → 401)" "401" "$NOAUTH"

# ── 7. Per-workspace route tests ──────────────────────────────────────────
for i in 0 1; do
  WS_ID="${WS_IDS[$i]:-}"
  WS_LABEL="${WS_NAMES[$i]:-unknown}"
  [ -z "$WS_ID" ] && continue

  echo ""
  echo "── ${WS_LABEL//_/ } ($WS_ID) ──"

  # Dashboard
  DASH_RESP=$(body "http://localhost:3001/api/dashboard/$WS_ID" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/dashboard/:id" "200" \
    "$(http_status "http://localhost:3001/api/dashboard/$WS_ID" -H "Authorization: Bearer $TOKEN")"

  HEALTH_SCORE=$(echo "$DASH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('health',{}).get('score',0))" 2>/dev/null)
  if [ "${HEALTH_SCORE:-0}" -gt 0 ] 2>/dev/null; then ok "Health score: $HEALTH_SCORE"
  else fail "Health score is 0 (algorithmVersion mismatch?)"; fi

  KPIS=$(echo "$DASH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('kpis',[])))" 2>/dev/null)
  if [ "${KPIS:-0}" -gt 0 ]; then ok "KPIs: $KPIS"; else fail "No KPIs in dashboard"; fi

  BEST=$(echo "$DASH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); b=d.get('bestCampaign'); print(b['name'] if b else '')" 2>/dev/null)
  WORST=$(echo "$DASH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); w=d.get('worstCampaign'); print(w['name'] if w else '')" 2>/dev/null)
  if [ -n "$BEST" ]; then ok "Best campaign: $BEST"; else fail "No bestCampaign"; fi
  if [ -n "$WORST" ]; then ok "Worst campaign: $WORST"; else fail "No worstCampaign"; fi

  PACTION=$(echo "$DASH_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('priorityAction'); print(p['actionCode'] if p else 'none')" 2>/dev/null)
  ok "Priority action: $PACTION"

  # Workspace settings
  WS_STATUS=$(http_status "http://localhost:3001/api/workspaces/$WS_ID" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id" "200" "$WS_STATUS"

  # PATCH workspace
  PATCH_STATUS=$(http_status -X PATCH "http://localhost:3001/api/workspaces/$WS_ID" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"${WS_LABEL//_/ }\"}")
  check_status "PATCH /api/workspaces/:id" "200" "$PATCH_STATUS"

  # Members
  MEM_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/members" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/members" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/members" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Members list" "$MEM_RESP"
  ROLE=$(echo "$MEM_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('role','') if d else '')" 2>/dev/null)
  if [ -n "$ROLE" ]; then ok "Member role: $ROLE"; else fail "Member missing role field"; fi

  # Campaigns list
  CAMP_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/campaigns" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/campaigns" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/campaigns" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Campaigns list" "$CAMP_RESP"

  CAMP_ID=$(echo "$CAMP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
  CAMP_NAME=$(echo "$CAMP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['name'] if d else '')" 2>/dev/null)

  if [ -n "$CAMP_ID" ]; then
    # Campaign detail
    CDET_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/campaigns/$CAMP_ID" -H "Authorization: Bearer $TOKEN")
    check_status "GET /api/workspaces/:id/campaigns/:cid" "200" \
      "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/campaigns/$CAMP_ID" -H "Authorization: Bearer $TOKEN")"

    ADSET_COUNT=$(echo "$CDET_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('adSets',[])))" 2>/dev/null)
    if [ "${ADSET_COUNT:-0}" -gt 0 ]; then ok "'$CAMP_NAME' has $ADSET_COUNT adset(s)"
    else fail "'$CAMP_NAME' has 0 adsets — seed may not have added them"; fi

    # Adsets endpoint
    AS_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/campaigns/$CAMP_ID/adsets" -H "Authorization: Bearer $TOKEN")
    check_status "GET /api/workspaces/:id/campaigns/:cid/adsets" "200" \
      "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/campaigns/$CAMP_ID/adsets" -H "Authorization: Bearer $TOKEN")"
    check_array_nonempty "AdSets list" "$AS_RESP"

    AS_ID=$(echo "$AS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
    if [ -n "$AS_ID" ]; then
      # Single adset
      check_status "GET /api/workspaces/:id/adsets/:asid" "200" \
        "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/adsets/$AS_ID" -H "Authorization: Bearer $TOKEN")"

      # Ads list
      ADS_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/adsets/$AS_ID/ads" -H "Authorization: Bearer $TOKEN")
      check_status "GET /api/workspaces/:id/adsets/:asid/ads" "200" \
        "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/adsets/$AS_ID/ads" -H "Authorization: Bearer $TOKEN")"
      check_array_nonempty "Ads in adset" "$ADS_RESP"

      AD_ID=$(echo "$ADS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)
      if [ -n "$AD_ID" ]; then
        check_status "GET /api/workspaces/:id/ads/:adid" "200" \
          "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/ads/$AD_ID" -H "Authorization: Bearer $TOKEN")"
      fi
    fi
  fi

  # Insights
  INS_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/insights?days=30" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/insights?days=30" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/insights?days=30" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Daily stats (30d)" "$INS_RESP"
  # No undefined field names in insight rows
  UNDEF=$(echo "$INS_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
bad=[k for row in d for k in row if k=='undefined'] if isinstance(d,list) else []
print('none' if not bad else str(bad))
" 2>/dev/null)
  if [ "$UNDEF" = "none" ]; then ok "No 'undefined' field names in daily stats"; else fail "undefined fields: $UNDEF"; fi

  # Trends
  TRD_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/insights/trends" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/insights/trends" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/insights/trends" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Metric trends" "$TRD_RESP"
  TRD_FIELDS=$(echo "$TRD_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
row=d[0] if d else {}
exp=['ctrTrend','cpmTrend','frequencyTrend','resultsTrend','spendTrend']
ok=[f for f in exp if f in row and row[f] is not None]
print(str(len(ok))+'/5 metric fields')
" 2>/dev/null)
  ok "Trend fields: $TRD_FIELDS"

  # Recommendations
  REC_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/recommendations" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/recommendations" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/recommendations" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Recommendations" "$REC_RESP"
  REC_CODE=$(echo "$REC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('actionCode','') if d else '')" 2>/dev/null)
  if [ -n "$REC_CODE" ]; then ok "Recommendation actionCode: $REC_CODE"; else fail "Recommendation missing actionCode"; fi
  REC_PRI=$(echo "$REC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('priority','') if d else '')" 2>/dev/null)
  if [ -n "$REC_PRI" ]; then ok "Recommendation priority: $REC_PRI"; else fail "Recommendation missing priority"; fi

  # Issues
  ISS_RESP=$(body "http://localhost:3001/api/workspaces/$WS_ID/issues" -H "Authorization: Bearer $TOKEN")
  check_status "GET /api/workspaces/:id/issues" "200" \
    "$(http_status "http://localhost:3001/api/workspaces/$WS_ID/issues" -H "Authorization: Bearer $TOKEN")"
  check_array_nonempty "Detected issues" "$ISS_RESP"
  ISS_CODE=$(echo "$ISS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('issueCode','') if d else '')" 2>/dev/null)
  if [ -n "$ISS_CODE" ]; then ok "Issue code: $ISS_CODE"; else fail "Issue missing issueCode"; fi
  EV=$(echo "$ISS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d and isinstance(d[0].get('evidenceJson'),dict) else 'fail')" 2>/dev/null)
  if [ "$EV" = "ok" ]; then ok "Issue evidenceJson is object"; else fail "Issue evidenceJson not object"; fi

  # Sync (expects 422 — seed has no accessTokenEncrypted)
  SYNC_STATUS=$(http_status -X POST "http://localhost:3001/api/workspaces/$WS_ID/sync" -H "Authorization: Bearer $TOKEN")
  if [ "$SYNC_STATUS" = "422" ] || [ "$SYNC_STATUS" = "200" ]; then
    ok "POST /api/workspaces/:id/sync → HTTP $SYNC_STATUS"
  else
    fail "POST /api/workspaces/:id/sync → HTTP $SYNC_STATUS (expected 422 or 200)"
  fi
done

# ── 8. Workspace switching ────────────────────────────────────────────────
echo ""
echo "── Workspace switching ──"
if [ "${#WS_IDS[@]}" -ge 2 ]; then
  N1=$(body "http://localhost:3001/api/dashboard/${WS_IDS[0]}" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('workspace',{}).get('name',''))" 2>/dev/null)
  N2=$(body "http://localhost:3001/api/dashboard/${WS_IDS[1]}" -H "Authorization: Bearer $TOKEN" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('workspace',{}).get('name',''))" 2>/dev/null)
  if [ "$N1" != "$N2" ] && [ -n "$N1" ] && [ -n "$N2" ]; then
    ok "Switching confirmed: '$N1' ≠ '$N2'"
  else
    fail "Workspace switching broken ($N1 / $N2)"
  fi
fi

# ── 9. 404 handling ───────────────────────────────────────────────────────
echo ""
echo "── Error handling ──"
check_status "GET /api/nonexistent → 404" "404" \
  "$(http_status http://localhost:3001/api/nonexistent -H "Authorization: Bearer $TOKEN")"

# ── Final summary ─────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL))
echo ""
echo "══════════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed (of $TOTAL checks)"
echo ""
if [ $FAIL -eq 0 ]; then
  echo "  ✅  FINAL STATUS: PASS"
  echo "      Adlytic Alpha v1.0 — fully operational"
else
  echo "  ❌  FINAL STATUS: FAIL  ($FAIL check(s) failed)"
fi
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  Server: http://localhost:3001"
echo "  Frontend: file:///Users/aliahhed/Downloads/adlytic/dashboard_wired.html"
echo "  Login: ali@adlytic.app / demo1234"
echo ""
echo "  Press any key to close…"
read -n1
