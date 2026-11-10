#!/usr/bin/env bash

# ════════════════════════════════════════════════════════════════════════
#  backup_database.command
#
#  Backs up the Adlytic PostgreSQL database to a compressed SQL dump in
#  ./backups/ (or $BACKUP_DIR), named with a timestamp.
#
#  What it guarantees (test_backup_database.ts, test_backup_database_pg.ts):
#    · It only READS the database (pg_dump). There is no fallback that writes
#      to it: no `prisma db push`, no migration, nothing. Without pg_dump it
#      stops with an error — it never "backs up" by touching the schema.
#    · It exits 0 only for a dump that is complete: pg_dump exited 0, the gzip
#      stream is intact and the dump ends with pg_dump's own completion marker.
#      Any failure leaves NO file behind (only a *.partial that is removed) and
#      a non-zero exit — never "Backup complete" for an empty or cut-off dump.
#    · It never prints the connection string, the user name or the password.
#      The password reaches pg_dump through the environment of that one process
#      (PGPASSWORD), not through the command line, so it is not in `ps`.
#
#  Usage:
#    chmod +x backup_database.command
#    ./backup_database.command
#
#  DATABASE_URL is read from the environment, else from the line
#  `DATABASE_URL=...` of ./.env (or $ENV_FILE). Supported form:
#    postgresql://user[:password]@host[:port]/dbname[?sslmode=...]
#  (percent-encoded user/password are decoded; IPv6 literals are not supported).
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail
umask 077

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

die() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-backups}"

# ── 1. Where is the database? (never printed) ───────────────────────────
url="${DATABASE_URL:-}"
if [ -z "$url" ]; then
  [ -f "$ENV_FILE" ] || die "DATABASE_URL is not set and $ENV_FILE was not found"
  # The last exact `DATABASE_URL=` line (optionally `export`ed); not SHADOW_DATABASE_URL, not a comment.
  url="$(sed -n 's/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}DATABASE_URL=//p' "$ENV_FILE" | tail -n 1)"
  url="${url%$'\r'}"
  url="${url#\"}"; url="${url%\"}"; url="${url#\'}"; url="${url%\'}"
fi
[ -n "$url" ] || die "DATABASE_URL is empty"

re='^postgres(ql)?://([^:@/?#]+)(:([^@/?#]*))?@([^:/?#]+)(:([0-9]+))?/([^?#]+)(\?([^#]*))?$'
[[ "$url" =~ $re ]] || die "DATABASE_URL is not of the form postgresql://user[:password]@host[:port]/dbname (the value is not shown)"
pct_decode() { local s="${1//\\/\\\\}"; printf '%b' "${s//%/\\x}"; }
db_user="$(pct_decode "${BASH_REMATCH[2]}")"
db_pass="$(pct_decode "${BASH_REMATCH[4]}")"
db_host="${BASH_REMATCH[5]}"
db_port="${BASH_REMATCH[7]:-5432}"
db_name="$(pct_decode "${BASH_REMATCH[8]}")"
db_query="${BASH_REMATCH[10]}"
unset url
db_sslmode=""
case "&$db_query&" in *"&sslmode="*) db_sslmode="${db_query#*sslmode=}"; db_sslmode="${db_sslmode%%&*}";; esac

command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found. Install the PostgreSQL client tools (apt-get install postgresql-client | brew install libpq). This script does not fall back to anything that writes to the database."
command -v gzip >/dev/null 2>&1 || die "gzip not found"

echo -e "${BLUE}Adlytic Database Backup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database: ${db_name} on ${db_host}:${db_port}"
echo

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
BACKUP_FILE="$BACKUP_DIR/adlytic_backup_${TIMESTAMP}.sql.gz"
# Never overwrite an earlier backup (two runs in the same second): pick a free name.
n=1; while [ -e "$BACKUP_FILE" ] || [ -e "$BACKUP_FILE.partial" ]; do BACKUP_FILE="$BACKUP_DIR/adlytic_backup_${TIMESTAMP}_${n}.sql.gz"; n=$((n + 1)); done
PARTIAL="$BACKUP_FILE.partial"
ERR_FILE="$(mktemp "${TMPDIR:-/tmp}/adlytic_backup_err.XXXXXX")"
cleanup() { rm -f -- "$PARTIAL" "$ERR_FILE"; }
trap cleanup EXIT

echo -e "${BLUE}Starting backup...${NC}"
echo "Output: $BACKUP_FILE"
echo

# ── 2. Dump (read-only). pipefail makes a failing pg_dump fail the pipeline. ──
export PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGDATABASE="$db_name"
[ -n "$db_sslmode" ] && export PGSSLMODE="$db_sslmode"
if [ -n "$db_pass" ]; then export PGPASSWORD="$db_pass"; else unset PGPASSWORD; fi

if ! pg_dump --no-password --no-owner --no-privileges 2>"$ERR_FILE" | gzip > "$PARTIAL"; then
  echo -e "${RED}✗ pg_dump failed — no backup was written.${NC}" >&2
  # pg_dump's own message helps diagnosis; it never contains the password, and if some build echoed it we redact it.
  if [ -s "$ERR_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
      [ -n "$db_pass" ] && line="${line//"$db_pass"/***}"
      printf '  pg_dump: %s\n' "$line" >&2
    done < "$ERR_FILE"
  fi
  exit 1
fi
unset PGPASSWORD db_pass

# ── 3. Verify before calling it a backup ────────────────────────────────
gzip -t "$PARTIAL" 2>/dev/null || die "the dump is not a valid gzip stream — no backup was written"
# pg_dump ends a complete plain-SQL dump with this line; a cut-off or empty dump lacks it.
if ! gzip -dc "$PARTIAL" | tail -n 5 | grep -q -- '-- PostgreSQL database dump complete'; then
  die "the dump is incomplete (no pg_dump completion marker) — no backup was written"
fi

mv -- "$PARTIAL" "$BACKUP_FILE"
SIZE="$(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo -e "${GREEN}✓ Backup complete${NC}"
echo "  File: $BACKUP_FILE"
echo "  Size: $SIZE"
echo
echo "Backup retention: keep for at least 7 days; the file contains customer data — store it encrypted."
echo "Restore (into an EMPTY, separate database — never over the live one):"
echo "  gunzip < $BACKUP_FILE | psql --set ON_ERROR_STOP=1 --single-transaction <target-connection-string>"
