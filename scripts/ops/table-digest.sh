#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
#  scripts/ops/table-digest.sh — prove that a procedure wrote NOTHING to a database.
#
#    scripts/ops/table-digest.sh postgresql://<user>@127.0.0.1:<port>/<db>      # prints ONE 16-hex digest
#
#  For every table in schema public it hashes the row count, the content of every row AND the row's xmin (the id of the
#  transaction that wrote it: it moves on ANY write, even an UPDATE that changes no value), then hashes those lines.
#  Run it before and after the procedure; equal digests = no row was inserted, changed or deleted.
#
#  Read-only by construction: the session is opened with default_transaction_read_only=on, and table names read from the
#  database are passed to psql as variables (:"t" quotes an identifier), never pasted into SQL text.
#  Prints no row content, only the digest. Needs psql. Put the password in PGPASSWORD, not in the URL.
# ════════════════════════════════════════════════════════════════════════
set -euo pipefail
url="${1:?usage: table-digest.sh <postgresql-url>}"
export PGOPTIONS='-c default_transaction_read_only=on'

tables="$(psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "select tablename from pg_tables where schemaname = 'public' order by 1")"
{
  while IFS= read -r t; do
    [ -n "$t" ] || continue
    printf '%s ' "$t"
    printf '%s\n' "select count(*)::text || ' ' || md5(coalesce(string_agg(md5(x::text) || x.xmin::text, ',' order by x.ctid), '')) from public.:\"t\" x" \
      | psql "$url" -X -A -t -v ON_ERROR_STOP=1 -v t="$t"
  done <<< "$tables"
} | md5sum | cut -c1-16
