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
#      stream is intact (gzip -t) and the SQL ENDS with pg_dump's completion
#      marker — the marker line, then only the `--`, blank and `\unrestrict <key>`
#      lines pg_dump itself writes after it, with no COPY block left open.
#      The marker text elsewhere (in a data row, mid-stream) does not count.
#      A failure leaves NO file behind (only a *.partial that is removed) and
#      a non-zero exit — never "Backup complete" for an empty or cut-off dump.
#      Exception: SIGKILL (or a power cut) cannot run the cleanup, so it can
#      leave a *.sql.gz.partial — never named *.sql.gz, never verified: delete it.
#    · It never prints the connection string or the password, nor the user name
#      (the one exception: a user name that equals the database name, which is
#      shown as the database name). The connection settings and the password
#      reach pg_dump ALONE, as the environment of that one process, set in a
#      subshell that `exec`s it — never as an argument of any process, so they
#      are not in `ps`/`/proc/*/cmdline`. Every ambient libpq variable (PG*) is
#      cleared first, so PGSERVICE/PGHOSTADDR/PGOPTIONS cannot redirect the dump.
#      pg_dump's own error text is relayed on failure with the password (and
#      its %-encoded form) replaced by *** and the user name by <user>.
#      The URL is parsed at its LAST `@`, so a raw `@` inside a password is
#      part of the password; the host may only be letters, digits, `.`, `_`, `-`.
#      A database or user name with a control character (a newline, ESC, …) and
#      a malformed %-escape are refused without being shown.
#    · The restore command it prints verifies the file first (this script's
#      own `--verify`) and sends psql BEGIN … COMMIT, with the COMMIT only after
#      the whole file was read: a truncated or corrupt backup restores nothing.
#
#  Usage:
#    chmod +x backup_database.command
#    ./backup_database.command                 # back up
#    ./backup_database.command --verify FILE   # exit 0 only for an intact, complete backup
#
#  DATABASE_URL is read from the environment, else from the line
#  `DATABASE_URL=...` of ./.env (or $ENV_FILE). Supported form:
#    postgresql://user[:password]@host[:port]/dbname[?sslmode=...]
#  (percent-encoded user/password/dbname are decoded; IPv6 literals are not
#  supported; a URL longer than 8192 characters is refused).
#  A relative BACKUP_DIR or ENV_FILE is relative to the directory you run the
#  command from; when they are not set, both are next to this script.
#
#  Known limits:
#    · pg_dump newer than the server is refused by pg_dump itself (non-zero).
#    · The completion check treats a line `COPY … FROM stdin;` as the start of
#      a data block anywhere outside one; a function body or comment holding
#      exactly such a line would make a good dump look unfinished (fails closed:
#      no backup is written).
#    · Only PostgreSQL 16 tools and bash 5 on Linux were exercised (the script
#      keeps to bash 3.2 syntax for the macOS /bin/bash, which was not run).
#    · Recent pg_dump releases write `\restrict`/`\unrestrict` lines; restore
#      with a psql of the same or a newer release.
# ════════════════════════════════════════════════════════════════════════

set -euo pipefail
umask 077

CALLER_PWD="$PWD"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$BASE_DIR/$(basename "${BASH_SOURCE[0]}")"
cd "$BASE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

die() { echo -e "${RED}✗ $*${NC}" >&2; exit 1; }

# A path given relative is relative to where the command was run from (the script changes into its own directory).
abs_path() { case "$1" in /*) printf '%s' "$1";; *) printf '%s/%s' "$CALLER_PWD" "$1";; esac; }

# ── Verification (used for the dump it just wrote and by --verify) ──────
MARKER='-- PostgreSQL database dump complete'

# 0 only for an intact gzip stream.
gzip_intact() { gzip -t "$1" 2>/dev/null; }

# 0 only if the decompressed SQL ENDS with pg_dump's completion marker: after the marker line only
# `--`, blank and `\unrestrict <key>` lines may follow. A marker-looking line inside a COPY block is data,
# and a COPY block that starts after the marker (or never ends) means the marker was not the end.
# pipefail makes a gzip that fails part-way fail the check as well.
dump_ends_complete() {
  gzip -dc "$1" 2>/dev/null | LC_ALL=C awk -v marker="$MARKER" '
    in_copy { if ($0 == "\\.") in_copy = 0; next }
    /^COPY .* FROM stdin;$/ { in_copy = 1; ok = 0; next }
    $0 == marker { ok = 1; next }
    $0 == "" || $0 == "--" || /^\\unrestrict [^ ]+$/ { next }
    { ok = 0 }
    END { exit ok ? 0 : 1 }'
}

if [ "$#" -gt 0 ]; then
  if [ "$1" = "--verify" ] && [ "$#" -eq 2 ] && [ -n "$2" ]; then
    command -v gzip >/dev/null 2>&1 || die "gzip not found"
    command -v awk >/dev/null 2>&1 || die "awk not found"
    vf="$(abs_path "$2")"
    [ -f "$vf" ] || die "$2: no such file"
    gzip_intact "$vf" || die "$2 is not a valid gzip stream"
    dump_ends_complete "$vf" || die "$2 is incomplete: it does not end with pg_dump's completion marker"
    echo "OK: $2 is an intact gzip stream and ends with pg_dump's completion marker"
    exit 0
  fi
  echo "usage: $0 [--verify FILE]" >&2
  exit 2
fi

# A relative ENV_FILE / BACKUP_DIR is the caller's; unset, they are next to the script.
case "${ENV_FILE:-}" in "") ENV_FILE="$BASE_DIR/.env";; *) ENV_FILE="$(abs_path "$ENV_FILE")";; esac
case "${BACKUP_DIR:-}" in "") BACKUP_DIR="$BASE_DIR/backups";; *) BACKUP_DIR="$(abs_path "$BACKUP_DIR")";; esac

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

bad_url="DATABASE_URL is not of the form postgresql://user[:password]@host[:port]/dbname (the value is not shown)"
[ "${#url}" -le 8192 ] || die "DATABASE_URL is too long (over 8192 characters; the value is not shown)"
case "$url" in
  postgresql://*) rest="${url#postgresql://}";;
  postgres://*)   rest="${url#postgres://}";;
  *) die "$bad_url";;
esac
unset url
# authority = everything up to the first / ? or #; the host starts after its LAST @, so a raw @ in the password stays in the password
authority="${rest%%[/?#]*}"
after="${rest#"$authority"}"
unset rest
case "$after" in /*) after="${after#/}";; *) die "$bad_url";; esac
case "$after" in *"#"*) die "$bad_url";; esac
case "$authority" in *@*) ;; *) die "$bad_url";; esac
hostport="${authority##*@}"
userinfo="${authority%@*}"
unset authority
hostre='^([A-Za-z0-9._-]+)(:([0-9]+))?$'
[[ "$hostport" =~ $hostre ]] || die "$bad_url"
db_host="${BASH_REMATCH[1]}"
db_port="${BASH_REMATCH[3]:-5432}"
user_enc="${userinfo%%:*}"
case "$userinfo" in *:*) pass_enc="${userinfo#*:}";; *) pass_enc="";; esac
unset userinfo hostport
db_enc="${after%%\?*}"
case "$after" in *\?*) db_query="${after#*\?}";; *) db_query="";; esac
unset after
[ -n "$user_enc" ] && [ -n "$db_enc" ] || die "$bad_url"

# Percent-decoding without printf %b or command substitution (which would strip a trailing newline, drop %00
# and turn a malformed escape into garbage). Sets REPLY; fails on a malformed escape or %00.
pct_decode() {
  local s="$1" out="" chunk hex ch
  while [ -n "$s" ]; do
    case "$s" in
      %[0-9A-Fa-f][0-9A-Fa-f]*)
        hex="${s:1:2}"
        [ "$hex" = "00" ] && return 1
        printf -v ch "\\x$hex"
        out="$out$ch"; s="${s:3}";;
      %*) return 1;;
      *) chunk="${s%%\%*}"; out="$out$chunk"; s="${s#"$chunk"}";;
    esac
  done
  REPLY="$out"
}
# 0 if $1 holds a control character: C0, DEL, or a UTF-8 encoded C1 (U+0080–U+009F, which includes CSI).
has_ctrl() { ( LC_ALL=C; case "$1" in *[[:cntrl:]]*|*$'\302'[$'\200'-$'\237']*) exit 0;; esac; exit 1 ); }

bad_pct="DATABASE_URL contains a malformed %-escape (the value is not shown)"
pct_decode "$user_enc" || die "$bad_pct";  db_user="$REPLY"
pct_decode "$pass_enc" || die "$bad_pct";  db_pass="$REPLY"
pct_decode "$db_enc"   || die "$bad_pct";  db_name="$REPLY"
[ -n "$db_user" ] && [ -n "$db_name" ] || die "$bad_url"
if has_ctrl "$db_user" || has_ctrl "$db_name"; then
  die "the user name or the database name in DATABASE_URL contains a control character (the value is not shown)"
fi
db_sslmode=""
case "&$db_query&" in *"&sslmode="*) db_sslmode="${db_query#*sslmode=}"; db_sslmode="${db_sslmode%%&*}";; esac

command -v pg_dump >/dev/null 2>&1 || die "pg_dump not found. Install the PostgreSQL client tools (apt-get install postgresql-client | brew install libpq). This script does not fall back to anything that writes to the database."
command -v gzip >/dev/null 2>&1 || die "gzip not found"
command -v awk >/dev/null 2>&1 || die "awk not found"

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

# pg_dump's error text, indented, with every form of the password replaced by *** and the user name by <user>
# (longest first, so a user name that contains part of the password cannot leave the rest behind). The secrets
# reach awk through its environment, not its command line. A password with a newline is also redacted line by line.
relay_redacted() {
  BK_P1="$db_pass" BK_P2="$pass_enc" BK_U1="$db_user" BK_U2="$user_enc" LC_ALL=C awk '
    function lit(s, pat, rep,   out, i) {
      if (pat == "") return s
      out = ""
      while ((i = index(s, pat)) > 0) { out = out substr(s, 1, i - 1) rep; s = substr(s, i + length(pat)) }
      return out s
    }
    function add(v, rep,   k, m, parts) {
      if (v == "") return
      pat[++n] = v; rp[n] = rep
      m = split(v, parts, "\n")
      if (m > 1) for (k = 1; k <= m; k++) if (parts[k] != "") { pat[++n] = parts[k]; rp[n] = rep }
    }
    BEGIN {
      n = 0
      add(ENVIRON["BK_P1"], "***"); add(ENVIRON["BK_P2"], "***"); add(ENVIRON["BK_U1"], "<user>"); add(ENVIRON["BK_U2"], "<user>")
      for (i = 2; i <= n; i++) { p = pat[i]; t = rp[i]; j = i - 1; while (j >= 1 && length(pat[j]) < length(p)) { pat[j + 1] = pat[j]; rp[j + 1] = rp[j]; j-- } pat[j + 1] = p; rp[j + 1] = t }
    }
    { line = $0; for (k = 1; k <= n; k++) line = lit(line, pat[k], rp[k]); print "  " line }' < "$ERR_FILE" >&2
}

# ── 2. Dump (read-only). pipefail makes a failing pg_dump fail the pipeline. ──
# The connection settings (and the password) reach pg_dump ALONE, as the environment of that one process, set inside a
# subshell that then `exec`s pg_dump: they are never an argument of any process (an `env NAME=value pg_dump …` would put
# them on `env`'s command line for the moment before it execs — readable in `ps`/`/proc` by every local user), not in
# gzip's environment, not in this shell's. Every ambient libpq variable (PGSERVICE, PGSERVICEFILE, PGHOSTADDR, PGOPTIONS,
# PGPASSFILE, PGPASSWORD, PGSSL*, …) is cleared first, so nothing in the caller's environment can redirect the dump to another
# host or database while the output still names the URL's database. (A ~/.pgpass at its default path is still read by
# libpq itself when the URL has no password; `--no-password` only forbids a prompt.)
dump_failed=0
(
  for v in $(compgen -e | grep -E '^PG'); do unset "$v"; done
  export PGHOST="$db_host" PGPORT="$db_port" PGUSER="$db_user" PGDATABASE="$db_name"
  if [ -n "$db_sslmode" ]; then export PGSSLMODE="$db_sslmode"; fi
  if [ -n "$db_pass" ]; then export PGPASSWORD="$db_pass"; fi
  exec pg_dump --no-password --no-owner --no-privileges
) 2>"$ERR_FILE" | gzip > "$PARTIAL" || dump_failed=1
if [ "$dump_failed" -ne 0 ]; then
  echo -e "${RED}✗ pg_dump failed — no backup was written.${NC}" >&2
  [ -s "$ERR_FILE" ] && relay_redacted
  exit 1
fi

# ── 3. Verify before calling it a backup ────────────────────────────────
gzip_intact "$PARTIAL" || die "the dump is not a valid gzip stream — no backup was written"
dump_ends_complete "$PARTIAL" || die "the dump is incomplete (it does not end with pg_dump's completion marker) — no backup was written"

mv -- "$PARTIAL" "$BACKUP_FILE"
SIZE="$(ls -lh "$BACKUP_FILE" | awk '{print $5}')"
echo -e "${GREEN}✓ Backup complete${NC}"
echo "  File: $BACKUP_FILE"
echo "  Size: $SIZE"
echo
echo "Backup retention: keep for at least 7 days; the file contains customer data — store it encrypted."
echo "Restore (into an EMPTY, separate database — never over the live one). One line for bash or zsh: it checks the file first, and COMMITs only after the whole file was read:"
q_file="$(printf '%q' "$BACKUP_FILE")"
q_self="$(printf '%q' "$SELF")"
restore_cmd="$q_self --verify $q_file && ( set -o pipefail; { echo 'BEGIN;'; gzip -dc $q_file && echo 'COMMIT;'; } | psql -X -q --set ON_ERROR_STOP=1 <target-connection-string> )"
printf '  %s\n' "$restore_cmd"
echo "Put the target's password in ~/.pgpass or PGPASSWORD, not in the URL (a URL on the command line is visible in \`ps\`); -X ignores any ~/.psqlrc that could switch ON_ERROR_STOP off. A dump with large objects is not covered (its own BEGIN/COMMIT would end the wrapper's transaction early)."
