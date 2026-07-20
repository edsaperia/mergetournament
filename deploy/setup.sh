#!/usr/bin/env bash
# First-time server setup for a fresh Ubuntu 24.04 droplet. Run as root:
#   bash setup.sh
# Idempotent-ish: safe to re-run. Local Postgres by default; skip that
# section and set DATABASE_URL in /etc/mergetournament.env for managed PG.

set -euo pipefail

REPO="https://github.com/edsaperia/mergetournament.git"
APP_DIR=/opt/mergetournament
ENV_FILE=/etc/mergetournament.env

# --- packages -------------------------------------------------------------
apt-get update
apt-get install -y git curl ufw

# Node 24 (NodeSource)
if ! command -v node >/dev/null || [[ "$(node -v)" != v24* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

# Caddy
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# Local Postgres (comment out if using managed Postgres)
if ! command -v psql >/dev/null; then
  apt-get install -y postgresql
  sudo -u postgres psql -c "CREATE USER mt WITH PASSWORD 'CHANGE-ME';" || true
  sudo -u postgres psql -c "CREATE DATABASE mergetournament OWNER mt;" || true
fi

# --- app user + checkout --------------------------------------------------
id -u mt &>/dev/null || useradd --system --create-home --shell /bin/bash mt
if [[ ! -d "$APP_DIR" ]]; then
  git clone "$REPO" "$APP_DIR"
  chown -R mt:mt "$APP_DIR"
fi

# --- environment ----------------------------------------------------------
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
DATABASE_URL=postgres://mt:CHANGE-ME@localhost:5432/mergetournament
AUTH_SECRET=$(openssl rand -base64 48)
BASE_URL=https://mergetournament.org
COLLAB_WS_URL=wss://mergetournament.org/collab
COLLAB_PORT=3001
RESEND_API_KEY=
EMAIL_FROM="Merge Tournament <noreply@mergetournament.org>"
EOF
  chmod 600 "$ENV_FILE"
  echo ">>> Edit $ENV_FILE: set the Postgres password and RESEND_API_KEY."
fi

# --- build + migrate ------------------------------------------------------
cd "$APP_DIR"
sudo -u mt git pull
sudo -u mt npm ci
sudo -u mt npm run build
set -a; source "$ENV_FILE"; set +a
sudo -u mt --preserve-env=DATABASE_URL npx drizzle-kit migrate

# --- services -------------------------------------------------------------
cp deploy/mergetournament.service /etc/systemd/system/
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now mergetournament
systemctl reload caddy || systemctl restart caddy

# --- firewall -------------------------------------------------------------
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "Done. Check: systemctl status mergetournament; curl -I https://mergetournament.org"
