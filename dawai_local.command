#!/bin/bash
# ── Dawai — run it on this machine, before deploying anything ────────────────
# Double-click this file in Finder (or: bash dawai_local.command)
#
# There are TWO Dawai apps in this repository and confusing them has already
# cost this project real time, so this asks which one instead of guessing.
# It installs, migrates, starts, and opens the browser. Ctrl-C stops it.
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  دواي — تشغيل محلي"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  1) المنصة الكاملة   — مريض + صيدلية + أدمن، بسيرفر وقاعدة بيانات"
echo "     (dawai-platform — هذا هو المنتج)"
echo ""
echo "  2) تطبيق المريض     — الحلقة الكاملة مع mock API، بدون سيرفر"
echo "     (platform — هذا اللي فيه شاشة «اليوم»)"
echo ""
read -r -p "  اختر 1 أو 2 [1]: " CHOICE
CHOICE="${CHOICE:-1}"
echo ""

# Node 22+ is required by both. Saying so here beats an error from deep inside
# a build about syntax that is valid on a newer runtime.
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node مو منصّب. نزّله من https://nodejs.org (نسخة 22 أو أحدث) وأعد المحاولة."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "✗ Node $NODE_MAJOR منصّب، والمطلوب 22 أو أحدث."
  exit 1
fi
echo "✓ Node $(node -v)"
echo ""

open_when_ready() {
  # The browser is opened by a background subshell rather than after the server
  # starts, because the server never "finishes" — it runs until Ctrl-C.
  local url="$1"
  (
    for _ in $(seq 1 60); do
      if curl -sf -o /dev/null "$url"; then
        command -v open >/dev/null 2>&1 && open "$url"
        break
      fi
      sleep 1
    done
  ) &
}

if [ "$CHOICE" = "2" ]; then
  cd "$SCRIPT_DIR/platform"
  echo "▶ npm ci — تنصيب الاعتماديات (ممكن ياخذ دقيقة أول مرة)…"
  npm ci
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  تطبيق المريض راح يفتح على http://localhost:5173"
  echo ""
  echo "  رمز التحقق يُطبع بهذي النافذة، مو بالمتصفح:"
  echo "    [dev] SMS to +9647…: your code is 123456"
  echo ""
  echo "  للإيقاف: Ctrl-C"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  open_when_ready "http://localhost:5173/"
  npm run dev
  exit 0
fi

cd "$SCRIPT_DIR/dawai-platform"
echo "▶ npm ci — تنصيب الاعتماديات (ممكن ياخذ دقيقتين أول مرة)…"
npm ci
echo ""

# Not optional, and easy to forget. Without it the app boots against empty
# tables and every request fails with `relation "..." does not exist`. It is
# safe to run repeatedly — the ledger that makes that true was broken until
# rowCountOf in server/db/client.ts was fixed, and this script is the reason
# it was found.
echo "▶ npm run db:migrate — تجهيز قاعدة البيانات…"
npm run db:migrate
echo ""

echo "════════════════════════════════════════════════════════════"
echo "  المنصة الكاملة:"
echo "    الواجهة  http://localhost:5173"
echo "    الـ API   http://localhost:8787"
echo ""
echo "  ما تحتاج Postgres — يشتغل على PGlite محلياً، والبيانات"
echo "  تنحفظ بـ dawai-platform/.data"
echo ""
echo "  للإيقاف: Ctrl-C"
echo "════════════════════════════════════════════════════════════"
echo ""
open_when_ready "http://localhost:5173/"
npm run dev
