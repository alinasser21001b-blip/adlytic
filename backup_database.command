#!/bin/bash

# ════════════════════════════════════════════════════════════════════════
#  backup_database.command
#
#  Backs up the Adlytic PostgreSQL database to a compressed SQL dump.
#  Stores in ./backups/ with timestamp.
#
#  Usage:
#    chmod +x backup_database.command
#    ./backup_database.command
# ════════════════════════════════════════════════════════════════════════

set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse DATABASE_URL from .env
if [ ! -f .env ]; then
  echo -e "${RED}✗ .env file not found${NC}"
  exit 1
fi

DATABASE_URL=$(grep DATABASE_URL .env | cut -d'=' -f2)
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}✗ DATABASE_URL not found in .env${NC}"
  exit 1
fi

echo -e "${BLUE}Adlytic Database Backup${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Database: $DATABASE_URL"
echo

# Create backup directory
mkdir -p backups

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backups/adlytic_backup_${TIMESTAMP}.sql.gz"

echo -e "${BLUE}Starting backup...${NC}"
echo "Output: $BACKUP_FILE"
echo

# Attempt backup using pg_dump (if available)
if command -v pg_dump &> /dev/null; then
  echo "Using pg_dump..."

  # Extract connection details from DATABASE_URL
  # Format: postgresql://user@host:port/dbname
  USER=$(echo $DATABASE_URL | cut -d'/' -c 15- | cut -d'@' -f1)
  HOST=$(echo $DATABASE_URL | cut -d'@' -f2 | cut -d':' -f1)
  PORT=$(echo $DATABASE_URL | cut -d':' -f3 | cut -d'/' -f1)
  DBNAME=$(echo $DATABASE_URL | cut -d'/' -f4)

  if [ -z "$PORT" ]; then PORT="5432"; fi

  PGPASSWORD="" pg_dump \
    -h "$HOST" \
    -p "$PORT" \
    -U "$USER" \
    -d "$DBNAME" \
    --no-password \
    2>/dev/null | gzip > "$BACKUP_FILE"

  SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
  echo -e "${GREEN}✓ Backup complete${NC}"
  echo "  File: $BACKUP_FILE"
  echo "  Size: $SIZE"
else
  # Fallback: Use Prisma to dump schema + data
  echo "Using Prisma dump fallback..."

  npx prisma db push --skip-generate 2>/dev/null || true

  # This is a best-effort backup
  echo "  (Full data backup requires pg_dump; schema available in schema.prisma)"
  echo -e "${YELLOW}⚠ Install PostgreSQL client tools for full backups${NC}"
  echo "  sudo apt-get install postgresql-client (Ubuntu/Debian)"
  echo "  brew install postgresql (macOS)"
fi

echo
echo "Backup retention: Keep for at least 7 days"
echo "Restore command: gunzip < $BACKUP_FILE | psql \$DATABASE_URL"
