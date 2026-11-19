#!/usr/bin/env bash
# Ship the portal code from this Mac to the Lightsail server and restart it.
# Usage:  bash deploy/lightsail/deploy.sh <server-ip> <ssh-key.pem>
# Never sends .env, data/, node_modules/ or tests. The server keeps its own settings and data.
set -euo pipefail

IP="${1:?usage: deploy.sh <server-ip> <ssh-key.pem>}"
KEY="${2:?usage: deploy.sh <server-ip> <ssh-key.pem>}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"   # the portal/ folder
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$IP")

echo "== packing the portal =="
PKG="$(mktemp -d)/portal-release.tgz"
COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -C "$HERE" -czf "$PKG" \
  --exclude=./node_modules --exclude=./data --exclude=./.env --exclude='./.env.*' \
  --exclude=./tests --exclude=./scripts/fixtures --exclude='./Client Portal Plan.pdf' --exclude=./deploy \
  .

echo "== uploading =="
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$PKG" "ubuntu@$IP:/tmp/portal-release.tgz"
rm -f "$PKG"

echo "== installing and restarting on the server =="
"${SSH[@]}" 'sudo bash -s' <<'REMOTE'
set -euo pipefail
NEW=/opt/portal/release-$(date +%Y%m%d%H%M%S)
mkdir -p "$NEW"
tar -xzf /tmp/portal-release.tgz -C "$NEW"
rm -f /tmp/portal-release.tgz
cd "$NEW"
/usr/local/bin/npm ci --omit=dev --no-audit --no-fund --loglevel=error
chown -R root:root "$NEW" && chmod -R go-w "$NEW"
# Back up the database before the new code starts (it may migrate the schema).
if [ -f /var/lib/portal/data/portal.db ]; then
  mkdir -p /var/lib/portal/data/backups
  sqlite3 /var/lib/portal/data/portal.db ".backup '/var/lib/portal/data/backups/pre-deploy-$(date +%Y%m%d%H%M%S).db'"
  chown -R portal:portal /var/lib/portal/data/backups
fi
PREV=$(readlink -f /opt/portal/app || true)
# A plain folder (not a link) would block the switch below.
[ -d /opt/portal/app ] && [ ! -L /opt/portal/app ] && rm -rf /opt/portal/app
ln -sfn "$NEW" /opt/portal/app.next && mv -Tf /opt/portal/app.next /opt/portal/app
systemctl restart portal
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4400/healthz >/dev/null; then echo "healthy"; break; fi
  sleep 1
  if [ "$i" = 30 ]; then
    echo "NOT healthy: rolling back"; journalctl -u portal -n 40 --no-pager
    if [ -n "$PREV" ] && [ -d "$PREV" ]; then ln -sfn "$PREV" /opt/portal/app.next && mv -Tf /opt/portal/app.next /opt/portal/app && systemctl restart portal; fi
    exit 1
  fi
done
# Keep the last 3 releases.
ls -1dt /opt/portal/release-* | tail -n +4 | xargs -r rm -rf
REMOTE
echo "== deployed to https://$IP =="
