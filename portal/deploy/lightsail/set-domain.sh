#!/usr/bin/env bash
# Switch the server from its IP to your domain, with a real (free, auto-renewing) HTTPS certificate.
# First add a DNS "A" record:  portal.yourdomain.com -> <server static IP>, and wait until it resolves.
# Then on the server:  sudo bash set-domain.sh portal.yourdomain.com
set -euo pipefail
DOMAIN="${1:?usage: set-domain.sh <domain>}"

IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ "$RESOLVED" != "$IP" ]; then
  echo "$DOMAIN points to '${RESOLVED:-nothing}', not this server ($IP). Fix the DNS A record and try again."
  exit 1
fi

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4400
}
EOF
sed -i "s|^SITE_URL=.*|SITE_URL=https://${DOMAIN}|" /etc/portal/portal.env
systemctl reload caddy
systemctl restart portal
echo "Done. Open https://${DOMAIN} (the certificate is issued on the first visit, give it a few seconds)."
