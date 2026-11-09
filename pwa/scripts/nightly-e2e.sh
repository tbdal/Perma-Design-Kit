#!/usr/bin/env bash
# Every browser test, also the slow ones (@slow) a deploy leaves out (Werkstatt #591), against the current main of
# both repos — in its own checkout (/root/pdk-nightly), so the working checkout and its dist/ stay untouched.
# Run by pdk-nightly-e2e.timer (server/systemd/); log: ~/pdk-nightly.log. A failure becomes a Werkstatt entry (#bugs).
set -uo pipefail
export PATH="/root/.nvm/versions/node/v24.20.0/bin:$PATH"
SRC=/root/pdk            # the working checkout: main as merged on this VPS
DIR=/root/pdk-nightly
exec > >(tee "$HOME/pdk-nightly.log") 2>&1
echo "Nightly browser tests started $(date -Is)"

set -e
[[ -d $DIR/.git ]] || git clone -q "$SRC" "$DIR"
git -C "$DIR" fetch -q origin main && git -C "$DIR" reset -q --hard origin/main
cd "$DIR/pwa"
[[ -e node_modules ]] || ln -s "$SRC/pwa/node_modules" node_modules
[[ -d src/expert/.git ]] || git clone -q /root/git/pdk-expert.git src/expert
git -C src/expert fetch -q origin main && git -C src/expert reset -q --hard origin/main
npm run build
set +e

# One browser test run at a time: a deploy waits for this (same port, both cores).
exec 9>"$HOME/.pdk-e2e.lock"; flock -w 3600 9
npx playwright test --reporter=line; pub=$?
npx playwright test -c src/expert/test/e2e/playwright.config.ts --reporter=line; exp=$?
flock -u 9

rev="$(git rev-parse --short HEAD) / expert $(git -C src/expert rev-parse --short HEAD)"
if [[ $pub -ne 0 || $exp -ne 0 ]]; then
  # the line reporter lists each failure as "  1) e2e/x.e2e.ts:12:1 › title ───"
  failed="$(grep -E '^\s+[0-9]+\) ' "$HOME/pdk-nightly.log" | sed -E 's/^\s+[0-9]+\) //; s/ ─+$//' | sort -u | head -10 | tr '\n' ';')"
  (cd "$SRC/pwa" && node src/expert/scripts/aufgabe.mjs neu "Nächtliche Browser-Tests rot ($(date +%F), $rev): $failed Log: ~/pdk-nightly.log #bugs #intern")
  echo "Nightly browser tests FAILED ($rev)"; exit 1
fi
echo "Nightly browser tests passed ($rev) $(date -Is)"
