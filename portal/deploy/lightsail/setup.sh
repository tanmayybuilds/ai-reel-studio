#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 Lightsail server for the portal.
# Run as root:  sudo bash setup.sh <admin-email> <public-ip>
# Safe to run again: every step checks what's already there.
#
# Layout on the server:
#   /opt/portal/app            link to the current release (deploy.sh keeps the last 3)
#   /var/lib/portal/data       database, backups, style previews   (kept across deploys)
#   /var/lib/portal/studio     Raw/<Client>/<Video>/brief.md files (kept across deploys)
#   /etc/portal/portal.env     settings and secrets (root:portal, 640)
#   Caddy                      HTTPS in front of the portal on :443, portal itself only on 127.0.0.1:4400
set -euo pipefail

ADMIN_EMAIL="${1:?usage: setup.sh <admin-email> <public-ip>}"
PUBLIC_IP="${2:?usage: setup.sh <admin-email> <public-ip>}"
NODE_VERSION="v24.22.3"
NODE_SHA256="4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb" # node-v24.22.3-linux-x64.tar.xz

export DEBIAN_FRONTEND=noninteractive

echo "== swap (512 MB RAM needs it for npm ci) =="
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== system packages and automatic security updates =="
apt-get update -q
apt-get install -y -q ca-certificates curl xz-utils gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades sqlite3
dpkg-reconfigure -f noninteractive unattended-upgrades
timedatectl set-timezone Asia/Kolkata || true

echo "== Node.js ${NODE_VERSION} (checksum verified) =="
if [ "$(node -v 2>/dev/null || true)" != "${NODE_VERSION}" ]; then
  tmp=$(mktemp -d)
  curl -fsSLo "$tmp/node.tar.xz" "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
  echo "${NODE_SHA256}  $tmp/node.tar.xz" | sha256sum -c -
  rm -rf /usr/local/lib/nodejs && mkdir -p /usr/local/lib/nodejs
  tar -xJf "$tmp/node.tar.xz" -C /usr/local/lib/nodejs --strip-components=1
  ln -sf /usr/local/lib/nodejs/bin/node /usr/local/bin/node
  ln -sf /usr/local/lib/nodejs/bin/npm /usr/local/bin/npm
  rm -rf "$tmp"
fi
node -v

echo "== Caddy (HTTPS) from its signed apt repository =="
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

echo "== portal user and folders =="
id portal >/dev/null 2>&1 || useradd --system --home /opt/portal --shell /usr/sbin/nologin portal
# /opt/portal/app is a link to the current release, created by deploy.sh
mkdir -p /opt/portal /var/lib/portal/data /var/lib/portal/studio /etc/portal
chown -R portal:portal /var/lib/portal
chmod 750 /var/lib/portal

echo "== settings (created once; edit /etc/portal/portal.env later) =="
if [ ! -f /etc/portal/portal.env ]; then
  ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)"
  cat > /etc/portal/portal.env <<EOF
NODE_ENV=production
PORT=4400
HOST=127.0.0.1
SITE_URL=https://${PUBLIC_IP}
TRUST_PROXY=loopback
TZ=Asia/Kolkata
PORTAL_NAME="AI Reel Studio"
ADMIN_NAME="Studio"
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ALERT_EMAIL=${ADMIN_EMAIL}
PORTAL_DATA_DIR=/var/lib/portal/data
STUDIO_ROOT=/var/lib/portal/studio
# Gmail (fill in, then: sudo systemctl restart portal)
# GMAIL_USER=
# GMAIL_APP_PASSWORD=
EOF
  echo "Generated an admin password (stored only in /etc/portal/portal.env)."
fi
chown root:portal /etc/portal/portal.env
chmod 640 /etc/portal/portal.env

echo "== systemd service =="
cat > /etc/systemd/system/portal.service <<'EOF'
[Unit]
Description=AI Reel Studio client portal
After=network-online.target
Wants=network-online.target

[Service]
User=portal
Group=portal
WorkingDirectory=/opt/portal/app
EnvironmentFile=/etc/portal/portal.env
ExecStart=/usr/local/bin/node server.js
Restart=always
RestartSec=3
# Keep the small server healthy
MemoryMax=400M
# Hardening: the portal can only write its own data
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/portal
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable portal >/dev/null

echo "== Caddy: HTTPS on the IP until the domain is ready =="
cat > /etc/caddy/Caddyfile <<EOF
# Until your domain points here, the IP gets a self-signed certificate (browsers warn once).
# Run set-domain.sh to switch to your domain with a real certificate.
{
	default_sni ${PUBLIC_IP}
}
https://${PUBLIC_IP} {
	tls internal
	encode zstd gzip
	reverse_proxy 127.0.0.1:4400
}
http://${PUBLIC_IP} {
	redir https://{host}{uri} permanent
}
EOF
systemctl reload caddy || systemctl restart caddy

echo "== done. Deploy the code with deploy.sh from your Mac. =="
