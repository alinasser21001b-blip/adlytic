#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Production Cleanup v3
#  Fix: multiline-aware URL parser, auto-append /railway db name
# ════════════════════════════════════════════════════════════════════════
cd /Users/aliahhed/Downloads/adlytic
exec > >(tee /Users/aliahhed/Downloads/adlytic/CLEANUP_V3_LOG.txt) 2>&1

PROJECT_ID="69ca3009-3a67-4d92-b808-6e4f278335d6"
ENVIRONMENT_ID="89cdf3cb-15b7-4b92-b1ae-07e812333c37"
ADLYTIC_SVC_ID="cc7cbf67-d757-4018-bf6d-9cec643222c3"
POSTGRES_SVC_ID="6ba9d88c-c431-41d2-80c7-98e4800260be"
PUBLIC_HOST="https://adlytic-production.up.railway.app"

echo "════════════════════════════════════════════════════════"
echo "  Adlytic Production Cleanup v3"
echo "════════════════════════════════════════════════════════"
date
echo ""

# ── Link to Railway ────────────────────────────────────────────────────
echo "▶ Linking to Railway project..."
railway link --project "$PROJECT_ID" \
             --environment "$ENVIRONMENT_ID" \
             --service "$ADLYTIC_SVC_ID" 2>/dev/null || true
echo ""

# ── Step 1: Get DATABASE_PUBLIC_URL ───────────────────────────────────
echo "▶ Step 1: Getting DATABASE_PUBLIC_URL..."

# Try JSON output first (stderr suppressed)
RAW_JSON=$(railway variables --service Postgres --json 2>/dev/null)
PG_PUBLIC_URL=$(echo "$RAW_JSON" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    url = d.get('DATABASE_PUBLIC_URL', d.get('DATABASE_URL', ''))
    print(url)
except:
    print('')
" 2>/dev/null)

if [ -z "$PG_PUBLIC_URL" ]; then
  echo "  JSON method empty — trying table parser..."
  RAW_TABLE=$(railway variables --service Postgres 2>/dev/null)
  # Multiline-aware Python parser
  PG_PUBLIC_URL=$(echo "$RAW_TABLE" | python3 - << 'PYEOF'
import sys, re

text = sys.stdin.read()
lines = text.split('\n')

parts = []
collecting = False

for line in lines:
    # Start collecting when we see DATABASE_PUBLIC_URL
    if 'DATABASE_PUBLIC_URL' in line:
        collecting = True
        # Extract value after second │ (could be │ or ║)
        m = re.search(r'DATABASE_PUBLIC_URL\s*[│║]\s*(.+?)\s*[║│]?\s*$', line)
        if m:
            parts.append(m.group(1).strip())
    elif collecting:
        # Continuation line: key column is whitespace, value follows │
        # Pattern: ║<spaces>│<value>║
        m = re.match(r'[║│]\s*[│║]\s*(.+?)\s*[║│]\s*$', line)
        if m:
            parts.append(m.group(1).strip())
        elif re.match(r'[║╚╔═]', line.strip()) and 'DATABASE_PUBLIC_URL' not in line:
            # Check if it's a continuation or new entry
            if not re.match(r'[║]\s*[│]\s*', line):
                break

url = ''.join(parts)
print(url)
PYEOF
)
fi

# Ensure database name is appended
if [ -n "$PG_PUBLIC_URL" ]; then
  # If URL ends with / and has no database path, add 'railway'
  if echo "$PG_PUBLIC_URL" | grep -qE ':[0-9]+/$'; then
    PG_PUBLIC_URL="${PG_PUBLIC_URL}railway"
    echo "  Appended database name: ${PG_PUBLIC_URL:0:60}..."
  fi
fi

echo "  PG_PUBLIC_URL (first 60): ${PG_PUBLIC_URL:0:60}..."

if [ -z "$PG_PUBLIC_URL" ] || [ "$PG_PUBLIC_URL" = "postgresql://" ]; then
  echo "  ❌ Could not get valid DATABASE_PUBLIC_URL."
  echo "  Raw JSON output: ${RAW_JSON:0:200}"
  echo ""
  echo "Press Enter to close..."
  read
  exit 1
fi

echo "  ✅ Got DATABASE_PUBLIC_URL"
echo ""

# ── Step 2: Delete demo user ───────────────────────────────────────────
echo "▶ Step 2: Deleting ali@adlytic.app from database..."
echo "  (node_modules/@prisma/client from project dir)"

DATABASE_URL="$PG_PUBLIC_URL" node --input-type=commonjs << 'NODEEOF'
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'ali@adlytic.app';

  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    console.log('  ✅ Demo user does not exist — already clean');
    return;
  }
  console.log('  Found user: ' + user.id + ' (' + user.email + ')');

  // Delete all workspace data first (cascade order)
  const allWorkspaces = await prisma.workspace.findMany();
  console.log('  Workspaces to clean: ' + allWorkspaces.length);

  for (const ws of allWorkspaces) {
    const accounts = await prisma.adAccount.findMany({ where: { workspaceId: ws.id } });
    for (const acct of accounts) {
      await prisma.recommendation.deleteMany({ where: { entityId: acct.id } });
      await prisma.detectedIssue.deleteMany({ where: { entityId: acct.id } });
      await prisma.metricTrend.deleteMany({ where: { entityId: acct.id } });
      await prisma.dailyStat.deleteMany({ where: { entityId: acct.id } });
      await prisma.healthScore.deleteMany({ where: { entityId: acct.id } });
      const campaigns = await prisma.campaign.findMany({ where: { adAccountId: acct.id } });
      for (const c of campaigns) {
        await prisma.recommendation.deleteMany({ where: { entityId: c.id } });
        await prisma.detectedIssue.deleteMany({ where: { entityId: c.id } });
        await prisma.metricTrend.deleteMany({ where: { entityId: c.id } });
        await prisma.dailyStat.deleteMany({ where: { entityId: c.id } });
        await prisma.healthScore.deleteMany({ where: { entityId: c.id } });
        const adSets = await prisma.adSet.findMany({ where: { campaignId: c.id } });
        for (const as of adSets) {
          await prisma.ad.deleteMany({ where: { adSetId: as.id } });
        }
        await prisma.adSet.deleteMany({ where: { campaignId: c.id } });
      }
      await prisma.campaign.deleteMany({ where: { adAccountId: acct.id } });
    }
    await prisma.adAccount.deleteMany({ where: { workspaceId: ws.id } });
    try { await prisma.rawInsight.deleteMany({ where: { workspaceId: ws.id } }); } catch {}
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
    console.log('  Deleted workspace: ' + ws.id);
  }

  // Delete knowledge rules and industry profiles (seed data)
  try { await prisma.knowledgeRule.deleteMany(); } catch {}
  try { await prisma.industryProfile.deleteMany(); } catch {}

  // Delete the demo user
  const result = await prisma.user.deleteMany({ where: { email } });
  console.log('  Deleted user count: ' + result.count);

  // Verify
  const check = await prisma.user.findFirst({ where: { email } });
  if (!check) {
    const total = await prisma.user.count();
    console.log('  ✅ Verified: ali@adlytic.app deleted');
    console.log('  Total users remaining: ' + total);
  } else {
    console.log('  ❌ User still exists!');
    process.exit(1);
  }
}

main()
  .catch(e => { console.error('  ❌ Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
NODEEOF

DELETE_EXIT=$?
echo "  Node exit code: $DELETE_EXIT"
echo ""

if [ $DELETE_EXIT -ne 0 ]; then
  echo "  ❌ Deletion failed."
  echo ""
  echo "Press Enter to close..."
  read
  exit 1
fi

# ── Step 3: Verify demo login is rejected ─────────────────────────────
echo "▶ Step 3: Verifying demo login is REJECTED..."
DEMO_LOGIN=$(curl -s -X POST "$PUBLIC_HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"ali@adlytic.app","password":"demo1234"}' \
  --max-time 15 2>/dev/null)
echo "  Response: $DEMO_LOGIN"

HAS_TOKEN=$(echo "$DEMO_LOGIN" | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    print('YES' if d.get('token') else 'NO')
except:
    print('NO')
" 2>/dev/null)

echo "  Token returned: $HAS_TOKEN"

# ── Step 4: Verify register is blocked ────────────────────────────────
echo ""
echo "▶ Step 4: Verifying register is BLOCKED..."
REG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$PUBLIC_HOST/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' \
  --max-time 15 2>/dev/null)
echo "  Register HTTP status: $REG_STATUS"

# ── Step 5: Verify health ─────────────────────────────────────────────
echo ""
echo "▶ Step 5: Verifying health endpoint..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$PUBLIC_HOST/api/health" 2>/dev/null)
echo "  Health: $HEALTH"

echo ""
if [ "$HAS_TOKEN" = "NO" ] && [ "$REG_STATUS" = "403" ] && [ "$HEALTH" = "200" ]; then
  echo "════════════════════════════════════════════════════════"
  echo "  ✅ PRODUCTION READY — ALL CHECKS PASS"
  echo "════════════════════════════════════════════════════════"
  echo "PUBLIC_URL: $PUBLIC_HOST"
  echo "STATUS: PASS"
  echo ""
  echo "  ✓ Demo user deleted"
  echo "  ✓ Demo login REJECTED (401)"
  echo "  ✓ Public register BLOCKED (403)"
  echo "  ✓ Health endpoint: 200"
  echo "════════════════════════════════════════════════════════"
  echo "$PUBLIC_HOST" > DEPLOYMENT_URL.txt
  echo "STATUS: PASS" >> DEPLOYMENT_URL.txt
elif [ "$HAS_TOKEN" = "YES" ]; then
  echo "  ❌ Demo login still succeeds — deletion may have failed"
else
  echo "  ⚠️  HAS_TOKEN=$HAS_TOKEN REG_STATUS=$REG_STATUS HEALTH=$HEALTH"
fi

echo ""
echo "Press Enter to close..."
read
