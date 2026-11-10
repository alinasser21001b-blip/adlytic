#!/usr/bin/env bash
# Prepares the throw-away LOCAL databases used by health_matrix.ts.
# Refuses anything but a loopback Postgres. Synthetic schema only; no data.
#
#   PGHOST=127.0.0.1 PGPORT=54329 PGUSER=adlytic scripts/repro/health_matrix_prepare.sh
set -euo pipefail
: "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}"
case "$PGHOST" in 127.0.0.1|localhost) ;; *) echo "REFUSED: PGHOST must be loopback" >&2; exit 2;; esac
# Names are <prefix>_empty, _failedmig, _behind, _wronghist, _ahead. The prefix must start with adlytic_repro
# so this script can only ever drop/create throw-away databases; use your own prefix (e.g. adlytic_repro_gate)
# when another track may be using the default ones. The migrated source is only READ (used as a template).
PFX="${REPRO_DB_PREFIX:-adlytic_repro}"
SRC="${REPRO_SRC_DB:-adlytic_repro_heal}"
case "$PFX" in adlytic_repro*) ;; *) echo "REFUSED: REPRO_DB_PREFIX must start with adlytic_repro" >&2; exit 2;; esac
case "$SRC" in adlytic_repro*) ;; *) echo "REFUSED: REPRO_SRC_DB must start with adlytic_repro" >&2; exit 2;; esac
P="psql -v ON_ERROR_STOP=1 -q -h $PGHOST -p $PGPORT -U $PGUSER"
$P -d postgres -c "drop database if exists ${PFX}_empty" -c "create database ${PFX}_empty"
$P -d postgres -c "drop database if exists ${PFX}_failedmig" -c "create database ${PFX}_failedmig template $SRC"
$P -d postgres -c "drop database if exists ${PFX}_behind" -c "create database ${PFX}_behind template $SRC"
$P -d postgres -c "drop database if exists ${PFX}_wronghist" -c "create database ${PFX}_wronghist template $SRC"
$P -d postgres -c "drop database if exists ${PFX}_ahead" -c "create database ${PFX}_ahead template $SRC"

# failed-migration row (what Prisma leaves behind after P3018)
$P -d ${PFX}_failedmig -c "insert into _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) values (gen_random_uuid()::text, 'x', '29990101000000_synthetic_failed', now(), 0)"

# 'behind': drop the last two migrations' tables and history rows (period_insights, meta_usage_*)
$P -d ${PFX}_behind \
  -c "delete from _prisma_migrations where migration_name in ('20260822120000_add_period_insights','20260823010000_add_meta_usage_telemetry')" \
  -c "drop table if exists period_insights, meta_usage_daily, meta_usage_outcomes, meta_usage_state"
# H8 'equal-count wrong history': SAME number of finished rows as migrations shipped (41/41), no failed row,
# every table present - but ONE applied identity is not one this build ships. A count comparison says "ok".
$P -d ${PFX}_wronghist \
  -c "update _prisma_migrations set migration_name = '29990101000000_bogus_identity' where migration_name = '20260823010000_add_meta_usage_telemetry'"

# H9 'ahead': every shipped identity applied PLUS one the running build does not know (a rolled-back release
# running against a database a newer release already migrated). Tolerated by the gate.
$P -d ${PFX}_ahead \
  -c "insert into _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count) values (gen_random_uuid()::text, 'x', '29990102000000_future_release', now(), now(), 1)"
echo "prepared: ${PFX}_empty ${PFX}_failedmig ${PFX}_behind ${PFX}_wronghist ${PFX}_ahead (from $SRC)"
