#!/usr/bin/env bash
# Reproduces, on SYNTHETIC local Postgres copies only, what the recovery runbook (sections 5.2, 5.6, 7 R3/R4)
# says about the first start of a service on a restored database:
#   A  SERVICE_ROLE=api                                   -> raw_insights and orphaned stats untouched
#   B  default role (combined), default retention (90 d)   -> raw_insights older than 90 days are DELETED (the control)
#   C  default role, RAW_INSIGHTS_RETAIN_DAYS=36500        -> raw_insights untouched
# In A, B and C the orphaned campaign daily_stats are never deleted by the scheduler (report only).
#
#   TEMPLATE=adlytic_repro_rc1 bash scripts/repro/raw_insights_hold.sh
# Needs: a loopback Postgres (PGHOST/PGPORT/PGUSER, default 127.0.0.1:54329 / adlytic) holding a migrated database
# named $TEMPLATE (adlytic_repro_*) with at least one campaign. Creates and drops adlytic_repro_hold_{a,b,c}.
set -u
HOST="${PGHOST:-127.0.0.1}"; PORT_PG="${PGPORT:-54329}"; USER_PG="${PGUSER:-adlytic}"; TEMPLATE="${TEMPLATE:?set TEMPLATE=adlytic_repro_<migrated db>}"
case "$HOST" in 127.0.0.1|localhost) ;; *) echo "REFUSED: loopback only"; exit 2;; esac
case "$TEMPLATE" in adlytic_repro_*) ;; *) echo "REFUSED: TEMPLATE must be named adlytic_repro_*"; exit 2;; esac
SECS="${SECS:-50}"
psqlq() { psql -h "$HOST" -p "$PORT_PG" -U "$USER_PG" -d "$1" -Atc "$2"; }
run() { # name  port  extra-env...
  local n="$1" port="$2"; shift 2
  local db="adlytic_repro_hold_$n"
  psqlq postgres "drop database if exists $db" >/dev/null; createdb -h "$HOST" -p "$PORT_PG" -U "$USER_PG" -T "$TEMPLATE" "$db" || return 1
  psqlq "$db" "insert into raw_insights (id, entity_type, entity_id, date, raw_json, fetched_at) select 'old_raw_'||c.id, 'ACCOUNT', c.ad_account_id, (now() - interval '100 days')::date, '{\"spend\":\"1000\"}'::jsonb, now() - interval '100 days' from campaigns c limit 1 on conflict do nothing" >/dev/null
  psqlq "$db" "insert into raw_insights (id, entity_type, entity_id, date, raw_json, fetched_at) select 'new_raw_'||c.id, 'ACCOUNT', c.ad_account_id, (now() - interval '5 days')::date, '{\"spend\":\"1000\"}'::jsonb, now() - interval '5 days' from campaigns c limit 1 on conflict do nothing" >/dev/null
  psqlq "$db" "insert into daily_stats (id, entity_type, entity_id, date, spend) values ('hold_orph_1_$n','CAMPAIGN','hold_missing_campaign','$(date -u +%F)',1),('hold_orph_2_$n','CAMPAIGN','hold_missing_campaign','$(date -u -d '1 day ago' +%F)',1) on conflict do nothing" >/dev/null
  local b_raw b_orph; b_raw=$(psqlq "$db" "select count(*) from raw_insights"); b_orph=$(psqlq "$db" "select count(*) from daily_stats d where entity_type='CAMPAIGN' and not exists (select 1 from campaigns c where c.id=d.entity_id)")
  ( cd "$(dirname "$0")/../.." && env -u SERVICE_ROLE -u REDIS_URL NODE_ENV=production PORT="$port" DATABASE_URL="postgresql://$USER_PG@$HOST:$PORT_PG/$db" ALLOWED_ORIGINS="http://127.0.0.1:$port" \
      JWT_SECRET=synthetic-hold-jwt-secret-0123456789abcdef0123 TOKEN_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
      BULLMQ_ENABLED=false "$@" timeout "$SECS" npx tsx src/api/serve.ts > "/tmp/hold_$n.log" 2>&1 )
  local a_raw a_orph; a_raw=$(psqlq "$db" "select count(*) from raw_insights"); a_orph=$(psqlq "$db" "select count(*) from daily_stats d where entity_type='CAMPAIGN' and not exists (select 1 from campaigns c where c.id=d.entity_id)")
  local old_left; old_left=$(psqlq "$db" "select count(*) from raw_insights where fetched_at < now() - interval '90 days'")
  echo "$n: raw_insights $b_raw -> $a_raw (older than 90 d left: $old_left) | orphaned campaign stats $b_orph -> $a_orph | log: $(grep -c 'Deleted .* raw_insight rows' /tmp/hold_$n.log) prune line(s), $(grep -c 'REPORT ONLY' /tmp/hold_$n.log) report-only line(s), $(grep -c 'auto-cleaned' /tmp/hold_$n.log) auto-clean line(s)"
  psqlq postgres "drop database if exists $db" >/dev/null
}
run a 3231 SERVICE_ROLE=api &
run b 3232 &
run c 3233 RAW_INSIGHTS_RETAIN_DAYS=36500 &
wait
