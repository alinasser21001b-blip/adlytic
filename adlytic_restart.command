#!/bin/bash
# ── Adlytic — kill old server, type-check, restart ──────────────────────────
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Adlytic API layer — restart"
echo "  Working directory: $SCRIPT_DIR"
echo "══════════════════════════════════════════════════"
echo ""

# 1. Kill anything on port 3001
echo "▶ Stopping any process on port 3001 …"
lsof -ti :3001 | xargs kill -9 2>/dev/null && echo "✓ Killed old server" || echo "  (nothing running on 3001)"
sleep 1
echo ""

# 2. Prisma generate
echo "▶ npx prisma generate …"
npx prisma generate
echo "✓ Prisma client generated"
echo ""

# 3. TypeScript check
echo "▶ npx tsc --noEmit …"
npx tsc --noEmit && echo "✓ TypeScript: 0 errors" || { echo "✗ TypeScript errors above — fix before starting"; exit 1; }
echo ""

# 4. Start the server
echo "▶ Starting server on port 3001 (Ctrl-C to stop) …"
echo ""
npx tsx src/api/serve.ts
