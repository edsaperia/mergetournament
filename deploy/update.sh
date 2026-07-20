#!/usr/bin/env bash
# Deploy the latest main. Run as root: bash /opt/mergetournament/deploy/update.sh
set -euo pipefail
cd /opt/mergetournament
sudo -u mt git pull
sudo -u mt npm ci
sudo -u mt npm run build
set -a; source /etc/mergetournament.env; set +a
sudo -u mt --preserve-env=DATABASE_URL npx drizzle-kit migrate
systemctl restart mergetournament
echo "Deployed $(git rev-parse --short HEAD)"
