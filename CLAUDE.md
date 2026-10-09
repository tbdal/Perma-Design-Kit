# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git

This is a fork (`tbdal/Perma-Design-Kit`, formerly `tbdal/Perma-Guild-Forge`) of the upstream `js32/Perma-Guild-Forge`. `origin` points to the fork; push there with plain `git`.

## Build & Dev

All commands run from `pwa/` with Node ≥ 22 (managed via nvm; run `nvm use` to pick up `.nvmrc`):

```bash
# Local dev server
npm run dev

# Type check (astro check; the build itself does NOT type-check)
npm run check

# Unit tests (vitest, test/*.test.ts)
npm test

# Browser tests (Playwright, e2e/*.e2e.ts) against dist/ — build first; external services are stubbed
# (first time: npx playwright install chromium)
npm run build && npm run e2e

# Production build
npm run build

# Deploy (VPS only): refuses unless on a clean main == origin/main, runs check + tests + build
npm run deploy
```

Run `npm run check` and `npm test` before committing (check the summary for `1 error` too, not only `errors`). `npm run deploy` also runs the browser tests. `test/fixtures/pfaf/*.html` are saved PFAF pages for the parser tests — refresh them when PFAF changes its markup.

## Architecture

**Astro static PWA** — pages `index.astro` (Pflanzen), `kalender.astro`, `polykulturen.astro`, `gartenplan.astro`, `settings.astro` plus static info pages; `cards.astro` is only a redirect to `/?view=cards`. No framework components, all interactivity is vanilla TypeScript in `<script>` blocks within each page. There is no component folder; shared logic lives in `src/lib/`.

**Central field table** (`src/lib/plant-fields.ts`): every boolean `PlantData` field is listed once in `BOOL_FIELDS` with its DE/EN label, CSV column, legacy CSV column, and badge/dot/PDF-chip styling. Form bindings, CSV import/export, table dots and legend, table-PDF chips and the `fld_<key>` i18n labels are all derived from it. A new boolean field = one entry there + its checkbox markup (`data-field` + `id="f-<key>"`); `test/plant-fields.test.ts` fails if a boolean field is missing from the table.

**Plant list logic** lives outside `index.astro`: filtering/sorting in `src/lib/plant-list.ts`, badges/completeness/group pills in `src/lib/plant-detail.ts`, enrichment (Wikidata + PFAF merge) in `src/lib/enrich.ts`, CSV in `src/lib/csv.ts`.

**Data flow:**
1. Plant data lives in IndexedDB (`permaculture-guilds` DB, `plants` store) — `src/lib/db.ts`
2. Search hits the local `public/plants-db.json` first, then Wikidata API directly, then the server proxy for PFAF enrichment (NaturaDB is currently disabled, see ROADMAP.md)
3. `_sources: Partial<Record<keyof PlantData, DataSource>>` tracks per-field provenance — every import path must call `trackSources()` after writing fields. Re-enriching resets a `true` that PFAF itself set but now reports `false`; manual values are never touched.
4. Everything arriving from outside (JSON import, backup restore, Gist/WebDAV pull, CSV, `plants-db.json`) goes through `normalizePlant()` / `parseBackup()` (`src/lib/plant-normalize.ts`, `src/lib/sync.ts`) before it reaches IndexedDB — never `importPlants(JSON.parse(...))` directly.

**Plant proxy** (`pwa/server/plant-proxy-server.mjs`) is a standalone Node process (not Netlify — migrated off it) that scrapes PFAF HTML server-side, since the browser can't due to CORS. The parsing itself is in `server/pfaf-parse.mjs` (pure, unit-tested). The proxy caches results in memory (24 h hits, 10 min misses), times out upstream after 15 s, and rate-limits per `X-Real-IP` (set by nginx — never trust the first `X-Forwarded-For` entry). After changing it, restart the `plant-proxy` systemd unit. NaturaDB scraping exists in the same file but is hard-disabled (`NATURADB_ENABLED = false`, unresolved license/robots.txt concerns — see ROADMAP.md). Reachable at `/api/plant-proxy?name=LatinName`: in dev, `astro.config.mjs`'s `vite.server.proxy` forwards that path to the standalone process (default port 8787, override via `PLANT_PROXY_PORT`); any other deployment needs an equivalent reverse-proxy rule. Run it with `npm run proxy` (or as the `plant-proxy.service` systemd unit on the VPS this was developed on).

**Edible Forest Gardens (EFG)** (`pwa/server/efg.mjs`): the Jacke & Toensmeier "Species Toolkit" sheet is stored as `pwa/server/data/efg-species.csv` (refresh with `npm run efg:update`) and decoded into `PlantData` fields by the proxy. The proxy returns per-source data in `result.sources.{pfaf,efg}`. Client-side merging lives in `src/lib/enrich.ts` (`gatherSources` → `applySources`): per field the highest-ranked source in `settings.sourcePriority` (default PFAF > EFG > Wikidata) wins, values from lower-ranked enrich sources get replaced, and manual/csv/sample values are never touched. Credits for cards come from `dataCredits()` in `types.ts`.

**PDF export** (`src/lib/pdf-export.ts`) uses raw `flateStream` with RGB bytes instead of `embedPng()` for Poly/Stripe cards — this avoids an SMask that breaks rendering in LibreWolf/pdf.js. Don't revert to `embedPng()`. The Baumscheibe export takes a different route: Chrome/Safari rasterize SVG → JPEG → `embedJpg` (DCTDecode, no SMask) and auto-download; **Firefox** opens a native print window with the SVG inline (vector, fast) because canvas-rasterization of the 5 MB SVG is slow in Firefox and pdf.js mis-decodes the resulting raster XObject as diagonal stripes. Branch by `/Firefox\//.test(navigator.userAgent)`.

**Baumscheibe rendering** (`src/lib/baumscheibe-render.ts` + `baumscheibe-mapping.ts`): the template `pwa/public/baumscheibe-template.svg` is fetched once per session, parsed via `DOMParser`, then deep-cloned per plant. The mapping table lists `inkscape:label` values per `PlantData` field (both original code names and the renamed `Data-field_new` variants from `baumscheibe3-data-fields.ods`). Renderer walks elements via `getAttributeNS('http://www.inkscape.org/namespaces/inkscape', 'label')`, sets `<tspan>.textContent` for text fields and `display="none"` for false booleans. Fields without overlay elements in the SVG (e.g. `fruitMonths`, `pioneer`, `layer`, score-stars) are silently skipped — extend the artwork in Inkscape with the same label scheme and the renderer picks them up.

**Gartenplan map background** (`src/lib/gartenplan-geo.ts`, `gartenplan-background.ts`, `gartenplan-locate.ts`): the plan stays in local meters (`xM/yM`, origin top-left); optional `GardenPlan.geo` anchors point 0,0 at lat/lon and rotates the plan (`rotationDeg`, clockwise from north to plan "up"). Only the background turns: OSM tiles are laid out in a local east/south frame inside `<g transform="rotate(−θ)">` in each SVG's `.basemap-layer` group — grid, boundary, placements, 3D and `pointInPolygon` never see geo. The location dialog (Leaflet + Nominatim, EOX Sentinel-2 as coarse context layer) is loaded via `import()` only when opened. Tile sources/attributions live in `OSM_TILES`/`S2_TILES`; old plans in IndexedDB may lack `geo` (treated as `null`).

**Gartenplan drawing & areas**: by default the boundary is clicked onto a Leaflet map (`gartenplan-mapdraw.ts`, shared Leaflet plumbing in `gartenplan-leaflet.ts`); `planFromLatLngPolygon()` derives size, north-up anchor and boundary, so map-drawn plans always have `rotationDeg = 0`. The rotate-capable location dialog (`gartenplan-locate.ts`) is only offered for plans drawn on the plain grid. `GardenPlan.areas` holds named, colored polygons (beds, pond…), rendered by `areasSvg()` in `gartenplan-render.ts` for both editor and PDF. Labels/strokes scale with `uiScale(widthM)`. The 2D canvas zooms/pans via its viewBox (`planView`); taps act on pointer-up so drags can pan. Map tiles are fetched for the visible rect (`tilesForRect`), OSM or coarse satellite (`basemap: 'osm' | 'sat'`). Dragging geometry past the edge grows the plan via `growPlanToFit()` (`gartenplan-extent.ts`), which shifts all coordinates and the geo anchor.

**Share link** (`src/lib/share.ts`, page `teilen.astro`): the project travels deflate-compressed and base64url-encoded in the URL `#d=` fragment — no server storage. Default-valued plant fields are pruned before encoding; the receiver decodes through `parseBackup()` and `mergeShared()` skips plants the recipient already has (same id, or latin name + variety) and re-points polyculture/garden plan references. With "Ansicht mitschicken" the link also carries each plan's view (`src/lib/plan-view.ts`: 2D section, 3D camera, 2D/3D, sun date/time, colouring — otherwise kept per device in localStorage) and a start plan. `/example` and `/beispiel` forward the share data stored in `public/example-project.txt` (set with `npm run example:set -- "<link>"`, then deploy) to `/teilen/?beispiel=1#d=…`.

**Backup & sync** (`src/lib/sync.ts`): `buildBackup()` is the one place that decides what a backup contains (plants, polycultures, garden plans, the user's own variety lists — not the Wikidata one —, per-plan views, settings); `applyBackup()` is the one place that writes one back and always merges by id. The settings page funnels file, file access, WebDAV and Gist restores through `restoreFromText()`. A new store or per-plan state that should survive a device change = add it to both functions + `test/sync.test.ts`. Auto-sync (tab hidden) uploads only when the data fingerprint changed and the remote `exportedAt` is the one this device last pushed or pulled (`sync-marker-<provider>`); otherwise it records a conflict. Failures and conflicts are kept in `localStorage['auto-sync-problem']` (`getSyncProblem()`) and shown in the header banner and under Einstellungen → Sync.

**Offline / service worker** (`public/sw.js`, stamped by `scripts/version-sw.mjs` after the build): the worker stores the whole build on install (`PRECACHE`, every file of `dist/` except `sw.js` and `/x/`) and serves it cache-first; files over 1 MB (`LARGE`, the Baumscheibe template) and anything else same-origin go to the persistent `pgd-runtime` cache (network first). `/api/` and `/geo/` are never intercepted. A new build installs and **waits** — Layout.astro shows `#update-banner`, "Neu laden" sends `SKIP_WAITING`; so after a deploy users see the old version until they click or close all tabs. That old version still needs its `/x/` chunks (never cached): `deploy.sh` therefore keeps old files in `/x/` for 30 days, and if the expert module fails to load while logged in, Layout.astro switches to the waiting build once per session (`switchToNewBuild`). Not registered in `astro dev` (test offline behaviour against the build: `npm run build && node scripts/serve-dist.mjs`). A new public file needs nothing; a file that must not be stored on devices has to be excluded in `version-sw.mjs`. PNG app icons are generated from `public/favicon.svg` with `npm run icons` and committed.

**Several tabs** (`src/lib/data-channel.ts`): every write in `db.ts` calls `announceChange()` (BroadcastChannel `pdk-data`). Layout.astro reloads a hidden tab when the user returns to it, or shows `#stale-banner` if the tab is in view or has a `<dialog>` open — pages keep their data in memory and write whole records back, so a stale tab must not save. A new write function in `db.ts` has to announce too.

**View modes** on `index.astro`: `'grid' | 'list' | 'cards'` — state variable `viewMode` controls which branch of `renderList()` runs; `?view=` in the URL overrides the saved default. The cards view uses `renderPolyCardHtml`/`renderStripeCardHtml` from `src/lib/card-html.ts` and `renderBaumscheibeCardHtml` from `src/lib/baumscheibe-render.ts`. `cardViewMode: 'poly' | 'stripe' | 'baumscheibe'` selects which renderer to use; the render branch is async because Baumscheibe rendering awaits the SVG fetch.

**CSV** (`src/lib/csv.ts`): one column list drives export, template and import. Import matches columns by header name, detects the app format by `Lateinisch`/`Deutsch` headers vs. the legacy PowerShell `b_*`/`t_*` columns, and handles quoted multi-line fields.

**Content-Security-Policy** (set in nginx, versioned in `pwa/server/nginx/permadesignkit.org.conf`) forbids inline scripts: no `<script is:inline>` with a body, no `onclick=`/`onerror=` attributes in rendered HTML (use listeners; broken images are handled globally via `data-img-wrapper`, see `installBrokenImageCleanup()` in `html.ts`). Pre-paint code lives in `public/boot.js`.

**UI modes** (`src/lib/features.ts`, `ui-mode.ts`): `'simple' | 'classic' | 'expert' | 'team'`, chosen in the header menu (Layout.astro) and stored in `localStorage['pdk-mode']`; new visitors start simple, returning ones classic. Expert needs a login, team role team/admin (`modeAllowed()`/`effectiveMode()`, mirrored in `boot.js`); private code runs in both login modes (`LOGIN_MODES`). `FEATURES` lists every switchable feature once with its default modes; markup carries `data-feature="<id>"` (hidden via a constructed stylesheet that `public/boot.js` builds before first paint from `<html data-feature-defaults>` + the cached admin overrides), logic asks `featureOn('<id>')` and redraws on `onFeaturesChange()`. A new switchable feature = one entry in `FEATURES` + the attribute (`test/features.test.ts` fails on unknown ids). Admin overrides (several modes per feature, `[]` = off) come from `GET /api/features`. Each feature has a `group` (`FEATURE_GROUPS`, collapsible boxes on `/admin/`). Simple mode in the planner: `#guide-steps` + `#simple-guide` (`renderSimpleGuide()`).

**Expert login & admin** (`server/auth.mjs`, inside the plant-proxy process): `/api/auth/{login,logout,me,check}`, `/api/admin/{features,users}`, `/api/features`. Roles `expert | team | admin`. Accounts (scrypt), session secret and `features.json` live in `server/data/private/` (gitignored, or `$PDK_PRIVATE_DIR`); manage accounts with `npm run user -- add <name> [--admin]`. Session = HMAC-signed HttpOnly cookie `pdk_s` (90 days), invalidated by a password change. Pages `/anmelden/` and `/admin/`.

**Private expert repo** (`pwa/src/expert/`, gitignored): its own git repo whose origin is the bare repo `/root/git/pdk-expert.git` on the VPS — never push it to GitHub. `src/expert/index.ts` default-exports an `ExpertModule` (`src/lib/expert-api.ts`: `marker`, private `features`, `mount(ctx)`); Layout.astro loads it via `expert-loader.ts` (`import.meta.glob`, empty in the public build) only in expert mode. Pages expose APIs with `providePageApi()` (gartenplan: `getPlan`, `onPlanChange`, `addPanel`). `astro.config.mjs` names chunks with expert code `x/…`; nginx serves `/x/` only after `auth_request` to `/api/auth/check`; `scripts/check-private.mjs` (in deploy) fails if the marker appears outside `dist/x/`. `deploy.sh` also requires `src/expert` clean on `main` and pushed. Public code must never import from `src/expert/`.

**Settings** (`src/lib/settings.ts`) persist enabled data sources to localStorage. `isSourceEnabled('pfaf')` etc. gate all proxy/Wikidata calls — check these before assuming enrichment will run.

## Key types

```typescript
// src/lib/types.ts
type DataSource = 'wikidata' | 'pfaf' | 'naturadb' | 'manual' | 'csv' | 'sample';

interface PlantData {
  id: string;
  latinName: string;
  commonName: string;
  // ~50 boolean/number fields for plant attributes
  fruitMonths: boolean[];   // length 12
  flowerMonths: boolean[];  // length 12
  _sources?: Partial<Record<keyof PlantData, DataSource>>;
}
```

`createEmptyPlant()` initialises all arrays and defaults — always use it instead of constructing `PlantData` manually.
