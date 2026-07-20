#!/usr/bin/env bash
# Nightly Postgres backup with rotation. Installed by setup.sh:
#   /usr/local/bin/mergetournament-backup  (this file)
#   /etc/cron.d/mergetournament-backup    (deploy/backup.cron)
# Restore: gunzip -c FILE.sql.gz | sudo -u postgres psql mergetournament

set -euo pipefail

BACKUP_DIR=/var/backups/mergetournament
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"
stamp=$(date +%Y-%m-%d-%H%M)
sudo -u postgres pg_dump --no-owner mergetournament | gzip > "$BACKUP_DIR/mergetournament-$stamp.sql.gz"
find "$BACKUP_DIR" -name 'mergetournament-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
