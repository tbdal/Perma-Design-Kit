#!/usr/bin/env bash
# Copy of the live data for the dev instance (Werkstatt #656): accounts, Werkstatt, beta list, shared plans …
# from server/data/private and the Werkstatt file store, into /var/lib/pdk-dev. What was typed on dev is
# overwritten. Mail credentials are left out, so dev never sends mail. Then the dev server restarts.
set -euo pipefail
LIVE=/root/pdk/pwa/server/data/private
DEV=/var/lib/pdk-dev
mkdir -p "$DEV/private" "$DEV/assets"
rsync -a --delete --exclude smtp.json --exclude smtp-pass "$LIVE/" "$DEV/private/"
rsync -a --delete /root/pdk/assets/ "$DEV/assets/"
if systemctl cat plant-proxy-dev.service >/dev/null 2>&1; then systemctl restart plant-proxy-dev; fi
echo "Dev data copied $(date -Is)"
