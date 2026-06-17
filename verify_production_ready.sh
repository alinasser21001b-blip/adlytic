#!/bin/bash
# Verification script to ensure all production changes are in place

set -e

echo "=========================================="
echo "Adlytic Production Readiness Verification"
echo "=========================================="
echo ""

ERRORS=0

# Check 1: Verify seed is removed from railway.json
echo "[1/6] Checking railway.json..."
if grep -q 'npx tsx prisma/seed.ts' railway.json; then
  echo "  ✗ FAIL: Seed step still in railway.json"
  ERRORS=$((ERRORS + 1))
elif grep -q 'npx prisma migrate deploy; node dist/src/api/serve.js' railway.json; then
  echo "  ✓ PASS: Seed step removed from railway.json"
else
  echo "  ✗ FAIL: Unexpected startCommand in railway.json"
  ERRORS=$((ERRORS + 1))
fi

# Check 2: Verify seed is removed from nixpacks.toml
echo "[2/6] Checking nixpacks.toml..."
if grep -q 'npx tsx prisma/seed.ts' nixpacks.toml; then
  echo "  ✗ FAIL: Seed step still in nixpacks.toml"
  ERRORS=$((ERRORS + 1))
elif grep -q 'npx prisma migrate deploy; node dist/src/api/serve.js' nixpacks.toml; then
  echo "  ✓ PASS: Seed step removed from nixpacks.toml"
else
  echo "  ✗ FAIL: Unexpected start cmd in nixpacks.toml"
  ERRORS=$((ERRORS + 1))
fi

# Check 3: Verify register endpoint returns 403
echo "[3/6] Checking src/api/server.ts..."
if grep -q "return c.json({ error: 'Account creation is disabled" src/api/server.ts; then
  echo "  ✓ PASS: Register endpoint returns 403 error"
else
  echo "  ✗ FAIL: Register endpoint not properly disabled"
  ERRORS=$((ERRORS + 1))
fi

# Check 4: Verify no hardcoded credentials in dashboard
echo "[4/6] Checking dashboard_wired.html..."
FOUND_CREDS=0
if grep -q 'value="ali@adlytic.app"' dashboard_wired.html; then
  echo "  ✗ FAIL: Found hardcoded email in dashboard"
  FOUND_CREDS=$((FOUND_CREDS + 1))
fi
if grep -q 'placeholder="demo1234"' dashboard_wired.html; then
  echo "  ✗ FAIL: Found hardcoded password in dashboard"
  FOUND_CREDS=$((FOUND_CREDS + 1))
fi
if grep -q 'autocomplete="off"' dashboard_wired.html | grep -q loginEmail || grep -q 'autocomplete="off"' dashboard_wired.html | grep -q loginPassword; then
  echo "  ✓ PASS: Autocomplete disabled on login fields"
else
  echo "  ⚠ WARNING: Could not verify autocomplete=off (may still be correct)"
fi
ERRORS=$((ERRORS + FOUND_CREDS))

# Check 5: Verify no hardcoded creds in source code (excluding seed and delete script)
echo "[5/6] Checking for hardcoded credentials in source code..."
FOUND_IN_SRC=$(grep -r "ali@adlytic.app\|demo1234" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.html" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude="seed.ts" --exclude="seed.js" --exclude="delete_demo_user.js" \
  . 2>/dev/null | wc -l || echo 0)

if [ "$FOUND_IN_SRC" -eq 0 ]; then
  echo "  ✓ PASS: No hardcoded credentials in production code"
else
  echo "  ✗ FAIL: Found $FOUND_IN_SRC references to credentials"
  ERRORS=$((ERRORS + 1))
fi

# Check 6: Verify deployment scripts exist
echo "[6/6] Checking deployment scripts..."
if [ -f "delete_demo_user.js" ] && [ -f "deploy_production.command" ]; then
  echo "  ✓ PASS: Deployment scripts created"
  if [ -x "deploy_production.command" ]; then
    echo "  ✓ PASS: deploy_production.command is executable"
  else
    echo "  ⚠ WARNING: deploy_production.command should be executable"
  fi
else
  echo "  ✗ FAIL: Deployment scripts missing"
  ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✓ ALL CHECKS PASSED - Ready for Production"
  echo "=========================================="
  exit 0
else
  echo "✗ $ERRORS CHECK(S) FAILED - Review required"
  echo "=========================================="
  exit 1
fi
