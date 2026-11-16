#!/usr/bin/env bash
# Builds the production PWA and syncs it to the nginx web root for
# permadesignkit.org (served from /var/www because /root isn't traversable
# by the www-data user nginx runs as).
#
# Only deploys a clean `main` that matches origin/main, so what's live is
# always a commit anyone can check out — not a feature branch, a worktree,
# or uncommitted edits. DEPLOY_FORCE=1 skips these checks (emergencies only).
#
# Dev instance (Werkstatt #656): DEPLOY_TARGET=dev (npm run deploy:dev) deploys branch `dev` from the
# dev checkout /root/pdk-dev to https://dev.permadesignkit.org (own web root, own server on a data copy).
# A live deploy then only takes commits that were on dev before (DEPLOY_QUICK=1 for text/layout and
# DEPLOY_OHNE_DEV=1 for urgent fixes go straight live). Each deploy notes what it put where in
# /var/lib/pdk-deploy/<live|dev>.json (the "Dev ↔ Live" box on /admin/).
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="${DEPLOY_TARGET:-live}"
case "$TARGET" in
  # live: main as released on GitHub (origin); dev: branch dev on the internal remote (intern, /root/git/pdk-intern.git) —
  # development stays off GitHub until it is released (pre-push hook, pwa/scripts/git-hooks/pre-push)
  live) BRANCH=main REMOTE=origin WEBROOT=/var/www/permadesignkit.org SITE=https://permadesignkit.org ;;
  dev)  BRANCH=dev  REMOTE=intern WEBROOT=/var/www/dev.permadesignkit.org SITE=https://dev.permadesignkit.org ;;
  *) echo "DEPLOY_TARGET must be live or dev" >&2; exit 1 ;;
esac
STAMPS=/var/lib/pdk-deploy
SUF=""; if [[ $TARGET == dev ]]; then SUF=-dev; fi   # log and stamp file names of the dev deploy

# Everything (stdout + stderr) also goes to a log of the last deploy, so its
# progress and result can be checked later: tail -f ~/pdk-deploy.log
exec > >(tee "$HOME/pdk-deploy$SUF.log") 2>&1
echo "Deploy ($TARGET) started $(date -Is)"

if [[ "${DEPLOY_FORCE:-}" != "1" ]]; then
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [[ "$branch" != "$BRANCH" ]]; then
    echo "Refusing to deploy ($TARGET): on branch '$branch', not '$BRANCH'." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain -- .)" ]]; then
    echo "Refusing to deploy: uncommitted changes in pwa/:" >&2
    git status --short -- . >&2
    exit 1
  fi
  git fetch --quiet "$REMOTE" "$BRANCH"
  if [[ "$(git rev-parse HEAD)" != "$(git rev-parse "$REMOTE/$BRANCH")" ]]; then
    echo "Refusing to deploy: local $BRANCH ($(git rev-parse --short HEAD)) differs from $REMOTE/$BRANCH ($(git rev-parse --short "$REMOTE/$BRANCH")). Pull or push first." >&2
    exit 1
  fi
fi

# Private expert module (src/expert/, its own git repo with the bare repo on
# this VPS as origin — never on GitHub): same rule, what's live must be a
# pushed commit of its main branch.
if [[ -e src/expert/.git && "${DEPLOY_FORCE:-}" != "1" ]]; then
  if [[ "$(git -C src/expert rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]]; then
    echo "Refusing to deploy: src/expert is not on its $BRANCH branch." >&2
    exit 1
  fi
  if [[ -n "$(git -C src/expert status --porcelain)" ]]; then
    echo "Refusing to deploy: uncommitted changes in src/expert:" >&2
    git -C src/expert status --short >&2
    exit 1
  fi
  git -C src/expert fetch --quiet origin "$BRANCH"
  if [[ "$(git -C src/expert rev-parse HEAD)" != "$(git -C src/expert rev-parse "origin/$BRANCH")" ]]; then
    echo "Refusing to deploy: src/expert $BRANCH differs from its origin (the bare repo on the VPS). Push or pull there first." >&2
    exit 1
  fi
fi

# Live only takes what was on dev: every commit since the last live deploy must have an equal one
# (same patch, so rebased commits count) in the commit deployed to dev.
stamp_field() { node -e 'try { process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]] || "") } catch {}' "$STAMPS/$1.json" "$2"; }
not_on_dev() {  # repo dir, field → commits since live that dev never had
  local dev live; dev="$(stamp_field dev "$2")"; live="$(stamp_field live "$2")"
  if [[ -z "$dev" ]] || ! git -C "$1" cat-file -e "$dev^{commit}" 2>/dev/null; then echo "(no dev deploy known)"; return; fi
  if [[ -n "$live" ]] && git -C "$1" cat-file -e "$live^{commit}" 2>/dev/null; then git -C "$1" cherry -v "$dev" HEAD "$live" | grep '^+' || true
  else git -C "$1" cherry -v "$dev" HEAD | grep '^+' | tail -20 || true; fi
}
if [[ $TARGET == live && "${DEPLOY_QUICK:-}" != "1" && "${DEPLOY_OHNE_DEV:-}" != "1" && "${DEPLOY_FORCE:-}" != "1" ]]; then
  missing="$(not_on_dev . pdk)"
  [[ -e src/expert/.git ]] && missing+="$(not_on_dev src/expert expert | sed 's/^/expert: /')"
  if [[ -n "$missing" ]]; then
    echo "Refusing to deploy live: not on dev yet (npm run deploy:dev in /root/pdk-dev first; urgent fix: DEPLOY_OHNE_DEV=1):" >&2
    echo "$missing" >&2
    exit 1
  fi
fi

# Faster deploys (Werkstatt #591): browser tests tagged @slow (3D, phone overflow) run every night
# (scripts/nightly-e2e.sh) and in a deploy only when something in their scope changed since the last deploy.
# DEPLOY_QUICK=1 is for text/layout changes and the static page public/sonnenfehler/ only (refused otherwise): just the browser tests of the touched pages.
STAMP="$HOME/.pdk-deployed$SUF"   # line 1: public commit of the last deploy, line 2: expert commit
SLOW_SCOPE='^(\*|src/lib/[^/]*3d[^/]*|src/layouts/|src/styles/|e2e/|package-lock\.json|playwright\.config\.ts|scripts/serve-dist\.mjs)'
# Files changed since the last deploy (paths relative to pwa/, expert ones with src/expert/); "*" = unknown, i.e. everything.
changed() {
  local last last_x
  last="$(sed -n 1p "$STAMP" 2>/dev/null || true)"; last_x="$(sed -n 2p "$STAMP" 2>/dev/null || true)"
  if [[ -n "$last" ]] && git cat-file -e "$last^{commit}" 2>/dev/null; then git diff --name-only --relative "$last" HEAD; else echo '*'; fi
  if [[ -e src/expert/.git ]]; then
    if [[ -n "$last_x" ]] && git -C src/expert cat-file -e "$last_x^{commit}" 2>/dev/null; then git -C src/expert diff --name-only "$last_x" HEAD | sed 's#^#src/expert/#'; else echo '*'; fi
  fi
}
CHANGED="$(changed)"
if [[ "${DEPLOY_QUICK:-}" == "1" ]]; then
  bad="$(grep -Ev '\.(astro|md|css|svg|png|jpe?g|webp)$|^src/lib/i18n/|^public/sonnenfehler/' <<<"$CHANGED" || true)"
  if [[ -n "$bad" ]]; then echo "Refusing DEPLOY_QUICK: more than text/layout changed since the last deploy:" >&2; echo "$bad" >&2; exit 1; fi
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
# Tests tagged @slow (3D, phone overflow) run nightly and only when their scope changed; DEPLOY_QUICK: see above.
EXPERT_E2E=src/expert/test/e2e/playwright.config.ts
# One browser test run at a time (the nightly run uses the same port and both cores).
exec 9>"$HOME/.pdk-e2e.lock"; flock -w 3600 9
if [[ "${DEPLOY_QUICK:-}" == "1" ]]; then
  # gartenplan.astro, dict-gartenplan.ts → e2e/*gartenplan*; index.astro → plants; src/expert/<module>/… → its specs.
  pub=(e2e/offline.e2e.ts) exp=()   # offline: every page opens, styled and with its scripts
  for f in $CHANGED; do
    if [[ "$f" == src/expert/* ]]; then
      m="$(cut -d/ -f3 <<<"$f")" found=0
      for s in src/expert/test/e2e/"$m"*.e2e.ts; do [[ -f "$s" ]] && exp+=("$(basename "$s")") && found=1; done
      # no spec named after the module (entwicklung → interne-doku, werkstatt …): all private specs
      if [[ $found -eq 0 ]]; then exp=(.); fi
    else
      stem="$(basename "$f")"; stem="${stem%.*}"; stem="${stem#dict-}"; [[ "$stem" == index ]] && stem=plants
      for s in e2e/*"$stem"*.e2e.ts; do [[ -f "$s" ]] && pub+=("$s"); done
    fi
  done
  echo "DEPLOY_QUICK: browser tests ${pub[*]} ${exp[*]}"
  npx playwright test --reporter=line "${pub[@]}"
  if [[ ${#exp[@]} -gt 0 && -f $EXPERT_E2E ]]; then npx playwright test -c $EXPERT_E2E --reporter=line "${exp[@]}"; fi
else
  slow=(--grep-invert @slow)
  if grep -Eq "$SLOW_SCOPE" <<<"$CHANGED"; then slow=(); echo "Slow browser tests (@slow) run too: something in their scope changed."
  else echo "Slow browser tests (@slow) left out: nothing in their scope changed (they run nightly)."; fi
  npx playwright test --reporter=line "${slow[@]}"
  # The private modules' browser tests too: an outdated one (baumbio, 30.10.) went unnoticed otherwise.
  if [[ -f $EXPERT_E2E ]]; then npx playwright test -c $EXPERT_E2E --reporter=line "${slow[@]}"; fi
fi
flock -u 9

# /x/ (private chunks) keeps the files of earlier builds: a tab still running
# the previous build (the service worker holds it until "Neu laden") would
# otherwise get a 404 for its chunks and lose the whole expert module. Its
# public chunks are in the worker's cache; /x/ never is. Old ones go after 30 days.
mkdir -p "$WEBROOT"
rsync -a --delete --exclude '/x/' dist/ "$WEBROOT/"
if [[ -d dist/x ]]; then
  rsync -a dist/x/ "$WEBROOT/x/"
  find "$WEBROOT/x" -type f -mtime +30 -delete
fi
chown -R www-data:www-data "$WEBROOT"

# The plant proxy also serves the expert login and the private /api/x/ routes
# (server code may have changed with this deploy): restart it if it runs here.
# Dev: a fresh copy of the live data, then its own server restarts.
if [[ $TARGET == dev ]]; then
  bash scripts/dev-daten.sh
  if ! diff -q <(node scripts/nginx-dev-conf.mjs) /etc/nginx/sites-available/dev.permadesignkit.org >/dev/null 2>&1; then
    echo "NOTE: nginx conf of the dev instance is outdated: node scripts/nginx-dev-conf.mjs > /etc/nginx/sites-available/dev.permadesignkit.org && nginx -t && systemctl reload nginx"
  fi
elif systemctl cat plant-proxy.service >/dev/null 2>&1; then
  systemctl restart plant-proxy && echo "Restarted plant-proxy"
fi

printf '%s\n%s\n' "$(git rev-parse HEAD)" "$(git -C src/expert rev-parse HEAD 2>/dev/null || true)" > "$STAMP"
mkdir -p "$STAMPS"
printf '{"pdk":"%s","expert":"%s","at":"%s"}\n' "$(git rev-parse HEAD)" "$(git -C src/expert rev-parse HEAD 2>/dev/null || true)" "$(date -Is)" > "$STAMPS/$TARGET.json"
echo "Deployed $(git rev-parse --short HEAD) to $SITE"
