#!/bin/bash

# ════════════════════════════════════════════════════════════════════════
#  reset_demo_data.command
#
#  Resets the Adlytic database to the initial demo state.
#  Drops all data and re-runs the seed script.
#
#  ⚠ WARNING: This DESTROYS all data in the database.
#
#  Usage:
#    chmod +x reset_demo_data.command
#    ./reset_demo_data.command
# ════════════════════════════════════════════════════════════════════════

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${RED}╔═════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                     ⚠ WARNING ⚠                        ║${NC}"
echo -e "${RED}║                                                         ║${NC}"
echo -e "${RED}║  This command will DELETE ALL DATA in the database      ║${NC}"
echo -e "${RED}║  and restore it to the demo seed state.                 ║${NC}"
echo -e "${RED}║                                                         ║${NC}"
echo -e "${RED}║  There is NO UNDO. Backup first if needed.              ║${NC}"
echo -e "${RED}╚═════════════════════════════════════════════════════════╝${NC}"
echo
echo -e "${YELLOW}Type 'yes, delete everything' to continue:${NC}"
read -p "> " CONFIRM

if [ "$CONFIRM" != "yes, delete everything" ]; then
  echo "Cancelled."
  exit 0
fi

echo
echo -e "${BLUE}Resetting database...${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ── 1. Drop and recreate schema ────────────────────────────────────────────
echo -e "${BLUE}[1/3] Dropping and recreating database schema...${NC}"

if ! npx prisma db push --force-reset --skip-generate 2>&1 | head -20; then
  echo -e "${RED}✗ Failed to reset database schema${NC}"
  echo "  Ensure DATABASE_URL is set and database is accessible."
  exit 1
fi

echo -e "${GREEN}✓${NC}"
echo

# ── 2. Run seed script ─────────────────────────────────────────────────────
echo -e "${BLUE}[2/3] Running seed script...${NC}"

if ! npx prisma db seed 2>&1 | tail -10; then
  echo -e "${RED}✗ Seed script failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓${NC}"
echo

# ── 3. Verify data ────────────────────────────────────────────────────────
echo -e "${BLUE}[3/3] Verifying seed data...${NC}"

# Count key entities using Node.js
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const ws = await p.workspace.count();
    const users = await p.user.count();
    const campaigns = await p.campaign.count();
    const adsets = await p.adSet.count();
    const ads = await p.ad.count();
    const health = await p.healthScore.count();
    const issues = await p.detectedIssue.count();
    const knowledge = await p.knowledgeRule.count();

    console.log('Entities created:');
    console.log(\`  Workspaces: \${ws}\`);
    console.log(\`  Users: \${users}\`);
    console.log(\`  Campaigns: \${campaigns}\`);
    console.log(\`  Ad Sets: \${adsets}\`);
    console.log(\`  Ads: \${ads}\`);
    console.log(\`  Health Scores: \${health}\`);
    console.log(\`  Detected Issues: \${issues}\`);
    console.log(\`  Knowledge Rules: \${knowledge}\`);

    if (ws > 0 && users > 0 && campaigns > 0) {
      console.log('');
      console.log('✓ Seed successful!');
    } else {
      console.log('');
      console.log('✗ Some entities missing');
      process.exit(1);
    }

    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
" || exit 1

echo -e "${GREEN}✓${NC}"
echo

echo -e "${GREEN}┌─────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│              ✓ DATABASE RESET COMPLETE                  │${NC}"
echo -e "${GREEN}│  Demo data restored. Ready to test.                     │${NC}"
echo -e "${GREEN}│                                                         │${NC}"
echo -e "${GREEN}│  Test Account:  ali@adlytic.app / demo1234              │${NC}"
echo -e "${GREEN}└─────────────────────────────────────────────────────────┘${NC}"
