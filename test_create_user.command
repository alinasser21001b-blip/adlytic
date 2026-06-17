#!/bin/bash
# ────────────────────────────────────────────────────────────────────────
#  test_create_user.command
#
#  End-to-end test for npm run create-user.
#  Double-click in Finder OR run:  bash test_create_user.command
#
#  Tests: prompts render, inputs accepted, user created in Railway DB,
#         login verified. Cleans up the test user after the run.
# ────────────────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

BOLD=$'\e[1m'
GREEN=$'\e[32m'
RED=$'\e[31m'
CYAN=$'\e[36m'
RESET=$'\e[0m'

echo ""
echo "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo "${BOLD}  Adlytic create-user — End-to-End Test${RESET}"
echo "${BOLD}══════════════════════════════════════════════════════${RESET}"
echo ""

# ── unique test email (timestamp-based so reruns never collide) ─────────
TS=$(date +%s)
TEST_EMAIL="test.e2e.${TS}@adlytic-test.dev"
TEST_NAME="E2E Test User ${TS}"
TEST_PW="TestPass${TS}!"
TEST_WS="E2E Workspace ${TS}"

echo "  ${CYAN}Test email     :${RESET} ${TEST_EMAIL}"
echo "  ${CYAN}Test name      :${RESET} ${TEST_NAME}"
echo "  ${CYAN}Test workspace :${RESET} ${TEST_WS}"
echo ""

# ── run create-user with stdin piped ────────────────────────────────────
echo "  Running: railway run npm run create-user ..."
echo ""

OUTPUT=$(printf '%s\n%s\n%s\n%s\n' \
  "${TEST_NAME}" \
  "${TEST_EMAIL}" \
  "${TEST_PW}" \
  "${TEST_WS}" \
  | railway run npm run create-user 2>&1)

echo "$OUTPUT"
echo ""

# ── verify expected steps appeared in output ────────────────────────────
PASS=true

check() {
  local label="$1"
  local pattern="$2"
  if echo "$OUTPUT" | grep -qF "$pattern"; then
    echo "  ${GREEN}✔${RESET}  ${label}"
  else
    echo "  ${RED}✘${RESET}  ${label} — expected: \"${pattern}\""
    PASS=false
  fi
}

echo "  Checking output …"
check "Step 0 – DATABASE_URL"      "[Step 0]"
check "Step 0 – URL shown"         "DATABASE_URL ="
check "Step 1 – collecting"        "[Step 1]"
check "Step 2 – DB connected"      "[Step 2]"
check "Step 3 – no duplicate"      "[Step 3]"
check "Step 4 – hash produced"     "[Step 4]"
check "Step 5 – user created"      "[Step 5]"
check "Step 6 – workspace created" "[Step 6]"
check "Step 7 – OWNER member"      "[Step 7]"
check "Step 8 – login verified"    "[Step 8]"
check "Success banner"             "User provisioned successfully"
check "Email in summary"           "${TEST_EMAIL}"
check "Workspace in summary"       "${TEST_WS}"

echo ""

# ── clean up: delete the test user ──────────────────────────────────────
echo "  Cleaning up test user from DB …"
railway run node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function cleanup() {
  const user = await prisma.user.findUnique({ where: { email: '${TEST_EMAIL}' } });
  if (!user) { console.log('  User not found (already clean).'); return; }
  await prisma.workspaceMember.deleteMany({ where: { userId: user.id } });
  const ws = await prisma.workspace.findFirst({ where: { members: { some: { userId: user.id } } } });
  if (ws) await prisma.workspace.delete({ where: { id: ws.id } }).catch(() => null);
  await prisma.user.delete({ where: { id: user.id } });
  console.log('  Test user deleted.');
}
cleanup().finally(() => prisma.\$disconnect());
" 2>&1 | tail -3

echo ""

# ── result ───────────────────────────────────────────────────────────────
if [ "$PASS" = true ]; then
  echo "${GREEN}${BOLD}══════════════════════════════════════════════════════${RESET}"
  echo "${GREEN}${BOLD}  STATUS: PASS — create-user works end-to-end${RESET}"
  echo "${GREEN}${BOLD}══════════════════════════════════════════════════════${RESET}"
else
  echo "${RED}${BOLD}══════════════════════════════════════════════════════${RESET}"
  echo "${RED}${BOLD}  STATUS: FAIL — see above for missing steps${RESET}"
  echo "${RED}${BOLD}══════════════════════════════════════════════════════${RESET}"
fi

echo ""
echo "  Press Enter to close."
read -r
