#!/bin/bash
# ── Adlytic API layer setup ──────────────────────────────────────────────────
# Double-click this file in Finder to run it (or: bash adlytic_setup.command)
# It installs Hono, generates the Prisma client, and type-checks the project.
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Adlytic API layer — setup"
echo "  Working directory: $SCRIPT_DIR"
echo "══════════════════════════════════════════════════"
echo ""

# 1. Install Hono dependencies
echo "▶ npm install hono @hono/node-server …"
npm install hono @hono/node-server
echo "✓ Hono installed"
echo ""

# 2. Generate Prisma client
echo "▶ npx prisma generate …"
npx prisma generate
echo "✓ Prisma client generated"
echo ""

# 3. TypeScript check
echo "▶ npx tsc --noEmit …"
npx tsc --noEmit && echo "✓ TypeScript: 0 errors" || echo "✗ TypeScript errors above"
echo ""

# 4. Start the server
echo "▶ Starting server on port 3001 (Ctrl-C to stop) …"
echo ""
npx tsx src/api/serve.ts
