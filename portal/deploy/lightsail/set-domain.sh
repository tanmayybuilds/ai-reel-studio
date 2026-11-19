#!/usr/bin/env bash
# Switch the server from its IP to your domain(s), with real (free, auto-renewing) HTTPS certificates.
# First add DNS "A" records pointing at this server's static IP, and wait until they resolve.
#
#   sudo bash set-domain.sh <client-domain> [admin-domain]
#   e.g. sudo bash set-domain.sh editor.example.com admineditor.example.com
#
# With two domains, clients use the first and the studio's admin side the second; each only answers on
# its own address. The server's IP keeps working too (self-signed), for emergencies.
set -euo pipefail
CLIENT="${1:?usage: set-domain.sh <client-domain> [admin-domain]}"
ADMIN="${2:-$CLIENT}"

IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
for D in $(printf '%s\n' "$CLIENT" "$ADMIN" | sort -u); do
  RESOLVED=$(getent ahostsv4 "$D" | awk 'NR==1{print $1}' || true)
  if [ "$RESOLVED" != "$IP" ]; then
    echo "$D points to '${RESOLVED:-nothing}', not this server ($IP). Fix its DNS A record and try again."
    exit 1
  fi
done

SITES="${CLIENT}"
[ "$ADMIN" != "$CLIENT" ] && SITES="${CLIENT}, ${ADMIN}"
cat > /etc/caddy/Caddyfile <<EOF
${SITES} {
	encode zstd gzip
	reverse_proxy 127.0.0.1:4400
}

# Direct access by IP stays available (self-signed certificate).
https://${IP} {
	tls internal
	reverse_proxy 127.0.0.1:4400
}
EOF
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

ENV=/etc/portal/portal.env
sed -i "s|^SITE_URL=.*|SITE_URL=https://${CLIENT}|" "$ENV"
if grep -q '^ADMIN_SITE_URL=' "$ENV"; then
  sed -i "s|^ADMIN_SITE_URL=.*|ADMIN_SITE_URL=https://${ADMIN}|" "$ENV"
else
  echo "ADMIN_SITE_URL=https://${ADMIN}" >> "$ENV"
fi
systemctl reload caddy
systemctl restart portal
echo "Done. Clients: https://${CLIENT}  Studio: https://${ADMIN}/admin"
echo "(Certificates are issued on the first visit to each address; give it a few seconds.)"
