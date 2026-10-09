#!/usr/bin/env bash
# Builds the production PWA and syncs it to the nginx web root for
# permadesignkit.org (served from /var/www because /root isn't traversable
# by the www-data user nginx runs as).
#
# Only deploys a clean `main` that matches origin/main, so what's live is
# always a commit anyone can check out — not a feature branch, a worktree,
# or uncommitted edits. DEPLOY_FORCE=1 skips these checks (emergencies only).
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${DEPLOY_FORCE:-}" != "1" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" != "main" ]]; then
    echo "Refusing to deploy: on branch '$branch', not 'main'." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain -- .)" ]]; then
    echo "Refusing to deploy: uncommitted changes in pwa/:" >&2
    git status --short -- . >&2
    exit 1
  fi
  git fetch --quiet origin main
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
    echo "Refusing to deploy: local main ($(git rev-parse --short HEAD)) differs from origin/main ($(git rev-parse --short origin/main)). Pull or push first." >&2
    exit 1
  fi
fi

# Private expert module (src/expert/, its own git repo with the bare repo on
# this VPS as origin — never on GitHub): same rule, what's live must be a
# pushed commit of its main branch.
if [[ -d src/expert/.git && "${DEPLOY_FORCE:-}" != "1" ]]; then
  if [[ "$(git -C src/expert rev-parse --abbrev-ref HEAD)" != "main" ]]; then
    echo "Refusing to deploy: src/expert is not on its main branch." >&2
    exit 1
  fi
  if [[ -n "$(git -C src/expert status --porcelain)" ]]; then
    echo "Refusing to deploy: uncommitted changes in src/expert:" >&2
    git -C src/expert status --short >&2
    exit 1
  fi
  git -C src/expert fetch --quiet origin main
  if [[ "$(git -C src/expert rev-parse HEAD)" != "$(git -C src/expert rev-parse origin/main)" ]]; then
    echo "Refusing to deploy: src/expert main differs from its origin (the bare repo on the VPS). Push or pull there first." >&2
    exit 1
  fi
fi

# Incremental install (not `npm ci`): keeps a dev server running from this
# checkout alive while still picking up dependency changes from the lockfile.
npm install --no-audit --no-fund --silent
# The build itself doesn't type-check, so a type error would otherwise ship.
npm run check
npm test
npm run build
node scripts/check-csp.mjs dist
# Private expert code only under dist/x/ (served after login only).
node scripts/check-private.mjs dist
# Browser tests against the fresh build (offline, external services stubbed).
# Needs Playwright's Chromium once: npx playwright install chromium
npx playwright test --reporter=line

# /x/ (private chunks) keeps the files of earlier builds: a tab still running
# the previous build (the service worker holds it until "Neu laden") would
# otherwise get a 404 for its chunks and lose the whole expert module. Its
# public chunks are in the worker's cache; /x/ never is. Old ones go after 30 days.
rsync -a --delete --exclude '/x/' dist/ /var/www/permadesignkit.org/
if [[ -d dist/x ]]; then
  rsync -a dist/x/ /var/www/permadesignkit.org/x/
  find /var/www/permadesignkit.org/x -type f -mtime +30 -delete
fi
chown -R www-data:www-data /var/www/permadesignkit.org

# The plant proxy also serves the expert login and the private /api/x/ routes
# (server code may have changed with this deploy): restart it if it runs here.
if systemctl cat plant-proxy.service >/dev/null 2>&1; then
  systemctl restart plant-proxy && echo "Restarted plant-proxy"
fi

echo "Deployed $(git rev-parse --short HEAD) to https://permadesignkit.org"
