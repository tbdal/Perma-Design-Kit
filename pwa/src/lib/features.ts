// UI modes and the feature table: which parts of the app each mode shows.
//
// Every switchable part of the UI is listed once in FEATURES with its default
// modes. Markup opts in with data-feature="<id>" (several ids separated by
// spaces hide the element when any of them is off); script logic asks
// featureOn('<id>') (ui-mode.ts). The admin page (/admin/) can override the
// modes per feature; the server stores those overrides in features.json.
//
// Modes:
//   simple  — new visitors: a few big steps, nothing to configure
//   classic — the full public app as it was before modes existed
//   expert  — classic + private features (code only on the VPS, src/expert/),
//             only after login
//   team    — for the team: by default every feature (also the private ones),
//             only for accounts with role team or admin
//
// Pure module (no DOM): imported by Layout.astro at build time, by ui-mode.ts
// in the browser and by the tests. Keep the mode logic in sync with
// public/boot.js, which applies it before first paint.

export type UiMode = 'simple' | 'classic' | 'expert' | 'team';
export const UI_MODES: readonly UiMode[] = ['simple', 'classic', 'expert', 'team'];
/** Modes that need a login — the only ones in which private features can be on. */
export const LOGIN_MODES: readonly UiMode[] = ['expert', 'team'];

export type Role = 'expert' | 'team' | 'admin';
/** Roles that may use team mode. */
export const TEAM_ROLES: readonly Role[] = ['team', 'admin'];

export const MODE_KEY = 'pdk-mode';
/** Admin overrides as last fetched from /api/features (offline fallback). */
export const FEATURE_CONFIG_KEY = 'pdk-feature-config';
/** Who is logged in, as last reported by /api/auth/me — UI hint only, the server decides. */
export const AUTH_KEY = 'pdk-auth';

export interface FeatureDef {
  id: string;
  de: string;
  en: string;
  /** Modes in which the feature is on unless the admin overrides it. */
  modes: readonly UiMode[];
  /** Code lives only in the private repo (src/expert/): can only ever be on in expert or team mode. */
  private?: boolean;
  /** Group on the admin page (FEATURE_GROUPS); without one: 'other'. */
  group?: string;
  /** Licence notes for the admin page (an "i" with a popover); problem = currently unresolved (red "i"). */
  licence?: { de: string; en: string; problem?: boolean };
}

/** Groups on the admin page, in this order (unknown groups follow, then 'other'). */
export const FEATURE_GROUPS: Record<string, { de: string; en: string }> = {
  gartenplan: { de: 'Waldgartenplan', en: 'Forest garden plan' },
  pflanzen: { de: 'Pflanzen', en: 'Plants' },
  other: { de: 'Sonstiges', en: 'Other' },
};

/** Admin overrides: feature id → modes in which it is on ([] = off everywhere). */
export type FeatureConfig = Record<string, UiMode[]>;

const FULL: readonly UiMode[] = ['classic', 'expert', 'team'];

export const FEATURES: readonly FeatureDef[] = [
  { id: 'simple-guide', de: 'Einstieg: Schritte, Schichten sammeln, ein Tipp', en: 'Getting started: steps, layer collection, one tip', modes: ['simple'], group: 'gartenplan' },
  { id: 'areas', de: 'Flächen (Beete, Teich, Wege)', en: 'Areas (beds, pond, paths)', modes: FULL, group: 'gartenplan' },
  { id: 'row', de: 'Reihe pflanzen', en: 'Plant a row', modes: FULL, group: 'gartenplan' },
  { id: 'boundary-edit', de: 'Umriss bearbeiten', en: 'Edit outline', modes: FULL, group: 'gartenplan' },
  { id: 'lasso', de: 'Mehrfachauswahl (Lasso)', en: 'Multi-select (lasso)', modes: FULL, group: 'gartenplan' },
  { id: 'measure', de: 'Messen', en: 'Measure', modes: FULL, group: 'gartenplan' },
  { id: 'gps', de: 'Feldmodus (GPS)', en: 'Field mode (GPS)', modes: FULL, group: 'gartenplan' },
  { id: 'polyculture', de: 'Polykultur verknüpfen', en: 'Link a polyculture', modes: FULL, group: 'gartenplan' },
  { id: 'polyculture-package', de: 'Polykultur als Paket setzen', en: 'Place a polyculture as a package', modes: ['simple', ...FULL], group: 'gartenplan' },
  { id: 'location', de: 'Standort festlegen und drehen', en: 'Set location and rotation', modes: FULL, group: 'gartenplan' },
  { id: 'basemap-extra', de: 'Luftbild, Satellit, Deckkraft der Karte', en: 'Aerial photo, satellite, map opacity', modes: FULL, group: 'gartenplan', licence: { de: 'Luftbilder der Länder (dl-de/by-2.0, dl-de/zero-2.0, CC BY 4.0), basemap.at (CC BY 4.0), swisstopo, PDOK: Quellenvermerk muss sichtbar bleiben. Satellit: Sentinel-2 cloudless über EOX — die gehosteten Kacheln sind nur nichtkommerziell frei.', en: 'State aerial photos (dl-de/by-2.0, dl-de/zero-2.0, CC BY 4.0), basemap.at (CC BY 4.0), swisstopo, PDOK: the credit must stay visible. Satellite: Sentinel-2 cloudless via EOX — the hosted tiles are free for non-commercial use only.' } },
  { id: 'basemap-mapbox', de: 'Satellit (fein) von Mapbox weltweit, wo es kein amtliches Luftbild gibt', en: 'Mapbox satellite (fine) worldwide where there is no official aerial photo', modes: ['team'], group: 'gartenplan', licence: { de: 'Mapbox Satellite (Styles API, Product Terms 10/2026): Kacheln lädt der Browser direkt bei Mapbox mit dem öffentlichen, auf unsere Adresse beschränkten Token — kein Proxy, kein Server-Cache (2.8.1). Logo, „© Mapbox © OpenStreetMap © Maxar“ und „Improve this map“ stehen an der Karte (1.4). Nicht im PDF-Export, dort OSM als Ersatz (1.7). Abzeichnen nur nichtkommerziell (1.6). Kosten: freies Monatskontingent im Mapbox-Konto im Blick behalten.', en: 'Mapbox Satellite (Styles API, Product Terms 10/2026): the browser loads tiles straight from Mapbox with the public token restricted to our URL — no proxy, no server cache (2.8.1). Logo, “© Mapbox © OpenStreetMap © Maxar” and “Improve this map” are shown at the map (1.4). Not in the PDF export, OSM replaces it there (1.7). Tracing only for non-commercial use (1.6). Cost: keep an eye on the free monthly allowance in the Mapbox account.' } },
  { id: 'terrain', de: 'Gelände und Höhenlinien', en: 'Terrain and contour lines', modes: FULL, group: 'gartenplan', licence: { de: 'Höhen: Terrain Tiles (Mapzen/AWS) und Geländemodelle der Länder (dl-de) — Namensnennung nötig.', en: 'Heights: Terrain Tiles (Mapzen/AWS) and state terrain models (dl-de) — attribution required.' } },
  { id: 'buildings', de: 'Gebäude aus OpenStreetMap', en: 'Buildings from OpenStreetMap', modes: FULL, group: 'gartenplan', licence: { de: 'OpenStreetMap (ODbL 1.0): Namensnennung „© OpenStreetMap-Mitwirkende“; abgeleitete Datenbanken unter ODbL.', en: 'OpenStreetMap (ODbL 1.0): credit “© OpenStreetMap contributors”; derived databases under ODbL.' } },
  { id: 'sun-advanced', de: 'Sonne: Datum, Zeitraffer, Kamera, 3D-Bild', en: 'Sun: date, time-lapse, camera, 3D image', modes: FULL, group: 'gartenplan' },
  { id: 'coverage', de: 'Funktions-Abdeckung, Besonnung, Vorschläge', en: 'Function coverage, sun hours, suggestions', modes: FULL, group: 'gartenplan' },
  { id: 'warnings', de: 'Hinweise (Abstand, Licht, Nachbarn)', en: 'Hints (spacing, light, neighbours)', modes: FULL, group: 'gartenplan' },
  { id: 'phases', de: 'Bauabschnitte', en: 'Planting phases', modes: FULL, group: 'gartenplan' },
  { id: 'water', de: 'Wasser im Gelände, Swales', en: 'Water on the land, swales', modes: FULL, group: 'gartenplan' },
  { id: 'zones', de: 'Zonen & Sektoren', en: 'Zones & sectors', modes: FULL, group: 'gartenplan' },
  { id: 'climate', de: 'Standortklima', en: 'Site climate', modes: FULL, group: 'gartenplan', licence: { de: 'Open-Meteo (ERA5, CC BY 4.0): Namensnennung nötig; die kostenlose API ist nur für nichtkommerzielle Nutzung.', en: 'Open-Meteo (ERA5, CC BY 4.0): attribution required; the free API is for non-commercial use only.' } },
  { id: 'zoomer', de: 'Zoomer: Standortklima vergrößert anzeigen', en: 'Zoomer: show the site climate enlarged', modes: FULL, group: 'gartenplan' },
  { id: 'yield', de: 'Ertrag & Pflege, Pflegekalender', en: 'Yield & care, care calendar', modes: FULL, group: 'gartenplan' },
  { id: 'export', de: 'Export: PDF, GeoJSON, Pflanzliste, Kalender', en: 'Export: PDF, GeoJSON, plant list, calendar', modes: FULL, group: 'gartenplan' },
];

export const isUiMode = (v: unknown): v is UiMode => typeof v === 'string' && (UI_MODES as readonly string[]).includes(v);

/** Feature ids allowed in a config: lowercase words with dashes (the server applies the same rule). */
export const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Modes in which a feature is on, after admin overrides. Private features are never on outside the login modes;
 *  a feature with an unresolved licence problem is never on in the beta mode ('expert'), whatever the admin ticks. */
export function modesFor(id: string, config: FeatureConfig = {}, defs: readonly FeatureDef[] = FEATURES): UiMode[] {
  const def = defs.find(d => d.id === id);
  const modes = config[id] ?? def?.modes ?? [];
  return modes.filter(m => (!def?.private || LOGIN_MODES.includes(m)) && !(def?.licence?.problem && m === 'expert'));
}

/** Ids of all features that are off in the given mode (defaults plus any ids only the config knows). */
export function offFeatures(mode: UiMode, config: FeatureConfig = {}, defs: readonly FeatureDef[] = FEATURES): string[] {
  const ids = new Set([...defs.map(d => d.id), ...Object.keys(config)]);
  return [...ids].filter(id => !modesFor(id, config, defs).includes(mode));
}

/** Default modes per feature, as embedded into <html data-feature-defaults> for boot.js. */
export function featureDefaults(defs: readonly FeatureDef[] = FEATURES): FeatureConfig {
  return Object.fromEntries(defs.map(d => [d.id, [...d.modes]]));
}

/** Keeps only well-formed entries (known modes, valid ids) of a config from the network or storage. */
export function sanitizeFeatureConfig(raw: unknown): FeatureConfig {
  const out: FeatureConfig = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, modes] of Object.entries(raw as Record<string, unknown>)) {
    if (!FEATURE_ID_RE.test(id) || !Array.isArray(modes)) continue;
    out[id] = UI_MODES.filter(m => modes.includes(m));
  }
  return out;
}

/** Mode to use when none is stored yet: returning visitors keep the full app, new ones start simple. */
export function initialMode(stored: string | null, returningVisitor: boolean): UiMode {
  if (isUiMode(stored)) return stored;
  return returningVisitor ? 'classic' : 'simple';
}

/** Whether an account with this role (null = logged out) may use the mode. */
export function modeAllowed(mode: UiMode, role: Role | null): boolean {
  if (mode === 'team') return !!role && TEAM_ROLES.includes(role);
  if (mode === 'expert') return !!role;
  return true;
}

/** The mode actually in effect: team falls back to expert (logged in) or classic, expert to classic. */
export function effectiveMode(mode: UiMode, role: Role | null): UiMode {
  if (modeAllowed(mode, role)) return mode;
  return role ? 'expert' : 'classic';
}

/** CSS that hides every element carrying an off feature. */
export function featureCss(off: readonly string[]): string {
  return off.map(id => `[data-feature~="${id}"]{display:none!important}`).join('\n');
}
