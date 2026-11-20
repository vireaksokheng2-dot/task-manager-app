#!/usr/bin/env bash
# Dump the database to /var/backups/taskly (gzip) and keep the last 14 days.
# Schedule daily:  (crontab -e)   17 3 * * *  /opt/taskly/deploy/backup.sh
# Restore:         gunzip -c FILE.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db psql -U taskly taskly
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${BACKUP_DIR:-/var/backups/taskly}"
mkdir -p "$DEST"
umask 077
FILE="$DEST/taskly-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
    sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$FILE"
[[ -s "$FILE" ]] || { rm -f "$FILE"; echo "backup failed (empty dump)" >&2; exit 1; }
find "$DEST" -name 'taskly-*.sql.gz' -mtime +14 -delete
echo "Wrote $FILE"
