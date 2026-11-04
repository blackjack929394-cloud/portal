#!/usr/bin/env bash
# Ежедневный дамп PostgreSQL. Запускать по cron на сервере.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/vpn-portal/backups/db}"
ENV_FILE="${ENV_FILE:-/opt/vpn-portal/backend/.env}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
set -a
. "$ENV_FILE"
set +a

STAMP=$(date +%Y%m%d_%H%M%S)
TARGET="$BACKUP_DIR/dogma_$STAMP.dump"
pg_dump "$DATABASE_URL" --format=custom --file="$TARGET"
echo "backup created: $TARGET"
find "$BACKUP_DIR" -name 'dogma_*.dump' -mtime +"$RETENTION_DAYS" -delete
