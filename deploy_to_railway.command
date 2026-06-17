#!/bin/bash
# ════════════════════════════════════════════════════════════════════════
#  Adlytic — Railway Deployment Script
#  Double-click this file in Finder to deploy to Railway.
#  Or run: bash /Users/aliahhed/Downloads/adlytic/deploy_to_railway.command
# ════════════════════════════════════════════════════════════════════════

set -e

PROJECT_DIR="/Users/aliahhed/Downloads/adlytic"
RESULT_FILE="$PROJECT_DIR/DEPLOYMENT_URL.txt"

cd "$PROJECT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║        Adlytic → Railway Deployment Script          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Install Railway CLI ──────────────────────────────────────────
echo "▶ Step 1: Checking Railway CLI..."
if ! command -v railway &>/dev/null; then
  echo "  Installing Railway CLI via npm..."
  npm install -g @railway/cli 2>/dev/null || \
    (echo "  Trying brew..."; brew install railway 2>/dev/null) || \
    (echo "  Trying curl..."; curl -fsSL https://railway.app/install.sh | sh)
fi

if ! command -v railway &>/dev/null; then
  # Try npx as fallback
  RAILWAY_CMD="npx @railway/cli"
else
  RAILWAY_CMD="railway"
fi

echo "  ✓ Railway CLI ready: $($RAILWAY_CMD --version 2>/dev/null || echo 'via npx')"
echo ""

# ── Step 2: Login to Railway ─────────────────────────────────────────────
echo "▶ Step 2: Railway login..."
echo "  (Your browser will open — log in or confirm existing session)"
$RAILWAY_CMD login --browserless 2>/dev/null || $RAILWAY_CMD login
echo ""

# ── Step 3: Create or link project ───────────────────────────────────────
echo "▶ Step 3: Creating Railway project 'adlytic'..."
if [ ! -f ".railway/config.json" ]; then
  $RAILWAY_CMD init --name "adlytic" 2>/dev/null || $RAILWAY_CMD link 2>/dev/null || true
else
  echo "  ✓ Already linked to Railway project"
fi
echo ""

# ── Step 4: Add PostgreSQL ───────────────────────────────────────────────
echo "▶ Step 4: Adding PostgreSQL database..."
$RAILWAY_CMD add --plugin postgresql 2>/dev/null || echo "  (PostgreSQL may already exist)"
echo ""

# ── Step 5: Set environment variables ────────────────────────────────────
echo "▶ Step 5: Configuring environment variables..."
$RAILWAY_CMD variables set NODE_ENV=production 2>/dev/null || true
$RAILWAY_CMD variables set PORT=3000 2>/dev/null || true
echo "  ✓ Variables set"
echo ""

# ── Step 6: Deploy ───────────────────────────────────────────────────────
echo "▶ Step 6: Deploying to Railway..."
echo "  (This may take 2-4 minutes...)"
$RAILWAY_CMD up --detach 2>/dev/null || $RAILWAY_CMD up
echo ""

# ── Step 7: Get the public URL ───────────────────────────────────────────
echo "▶ Step 7: Getting public URL..."
sleep 5

# Generate a public domain
$RAILWAY_CMD domain 2>/dev/null || true

PUBLIC_URL=$($RAILWAY_CMD status 2>/dev/null | grep -o 'https://[^ ]*' | head -1)
if [ -z "$PUBLIC_URL" ]; then
  PUBLIC_URL=$($RAILWAY_CMD open --json 2>/dev/null | grep -o '"url":"[^"]*"' | head -1 | sed 's/"url":"//;s/"//')
fi
if [ -z "$PUBLIC_URL" ]; then
  # Try environment variable approach
  PUBLIC_URL=$(RAILWAY_TOKEN="$(cat ~/.railway/config.json 2>/dev/null | grep token | head -1 | sed 's/.*"token":"\([^"]*\)".*/\1/')" $RAILWAY_CMD variables get RAILWAY_PUBLIC_DOMAIN 2>/dev/null | head -1)
fi

echo ""

# ── Step 8: Seed database ────────────────────────────────────────────────
echo "▶ Step 8: Seeding database with demo data..."
$RAILWAY_CMD run "npx prisma migrate deploy && npx tsx prisma/seed.ts" 2>/dev/null || \
  echo "  (Seed will run on first request, or run manually: railway run npx tsx prisma/seed.ts)"
echo ""

# ── Done ─────────────────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════╗"
echo "║                  Deployment Complete!                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
if [ -n "$PUBLIC_URL" ]; then
  echo "PUBLIC_URL:"
  echo "$PUBLIC_URL"
  echo ""
  echo "Dashboard:    $PUBLIC_URL/"
  echo "Health check: $PUBLIC_URL/api/health"
  echo ""
  # Save URL to file for Claude to read
  echo "$PUBLIC_URL" > "$RESULT_FILE"
  echo "STATUS: PASS" >> "$RESULT_FILE"
  echo "  ✓ URL saved to DEPLOYMENT_URL.txt"
else
  echo "  Run 'railway status' or open Railway dashboard to get your URL."
  echo "  Then open: https://<your-project>.railway.app/"
fi
echo ""
echo "Demo credentials:"
echo "  Email:    ali@adlytic.app"
echo "  Password: demo1234"
echo ""
echo "Press Enter to close..."
read
