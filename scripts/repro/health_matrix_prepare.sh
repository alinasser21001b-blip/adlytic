#!/usr/bin/env bash
# Prepares the throw-away LOCAL databases used by health_matrix.ts.
# Refuses anything but a loopback Postgres. Synthetic schema only; no data.
#
#   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=adlytic scripts/repro/health_matrix_prepare.sh
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "REFUSED: PGHOST must be loopback" >&2; exit 2;; esac
SRC=adlytic_repro_heal
P="psql -v ON_ERROR_STOP=1 -q -h $PGHOST -p $PGPORT -U $PGUSER"
$P -d postgres -c "drop database if exists adlytic_repro_empty" -c "create database adlytic_repro_empty"
$P -d postgres -c "drop database if exists adlytic_repro_failedmig" -c "create database adlytic_repro_failedmig template $SRC"
$P -d postgres -c "drop database if exists adlytic_repro_behind" -c "create database adlytic_repro_behind template $SRC"

# failed-migration row (what Prisma leaves behind after P3018)
$P -d adlytic_repro_failedmig -c "insert into _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) values (gen_random_uuid()::text, 'x', '29990101000000_synthetic_failed', now(), 0)"

# 'behind': drop the last two migrations' tables and history rows (period_insights, meta_usage_*)
$P -d adlytic_repro_behind \
  -c "delete from _prisma_migrations where migration_name in ('20260822120000_add_period_insights','20260823010000_add_meta_usage_telemetry')" \
  -c "drop table if exists period_insights, meta_usage_daily, meta_usage_outcomes, meta_usage_state"
echo "prepared: adlytic_repro_empty adlytic_repro_failedmig adlytic_repro_behind (from $SRC)"
