#!/usr/bin/env bash
# Builds the production PWA and syncs it to the nginx web root for
# permadesignkit.org (served from /var/www because /root isn't traversable
# by the www-data user nginx runs as).
set -euo pipefail

cd "$(dirname "$0")/.."

npm run build

rsync -a --delete dist/ /var/www/permadesignkit.org/
chown -R www-data:www-data /var/www/permadesignkit.org

echo "Deployed to https://permadesignkit.org"
