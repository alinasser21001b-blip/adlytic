# PostgreSQL backup & restore (operator runbook)

These steps are for managed PostgreSQL (recommended) or a compose Postgres volume.
Backup is **not** complete until a restore has been tested in staging.

## Backup frequency (pilot)

- Continuous WAL / PITR on the managed provider when available.
- Daily logical dump retained 14 days for Baghdad pilot.
- Weekly dump retained 90 days.

## Logical dump

```bash
pg_dump "$DATABASE_URL" --format=custom --file="dawai-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store dumps in a private bucket separate from prescription object storage.
Encrypt at rest with the provider KMS.

## Restore test (staging)

```bash
pg_restore --clean --if-exists --no-owner --dbname="$STAGING_DATABASE_URL" dawai-YYYYMMDD.dump
cd dawai-platform && npm run db:migrate
curl -fsS "$STAGING_WEB_ORIGIN/health/ready"
```

Record the restore duration and any failed constraints.

## Object storage

- Versioning ON for the private bucket.
- Lifecycle: expire noncurrent prescription objects after legal retention review.
- Never mark prescription prefixes public.

## Key recovery

- `STORAGE_ENCRYPTION_KEY` and `SESSION_PEPPER` live in the secrets manager / KMS.
- Rotating `STORAGE_ENCRYPTION_KEY` requires a re-encrypt job (not automatic).
- Document dual-key period before discarding the previous key.
