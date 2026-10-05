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
//
// Pure module (no DOM): imported by Layout.astro at build time, by ui-mode.ts
// in the browser and by the tests. Keep the mode logic in sync with
// public/boot.js, which applies it before first paint.

export type UiMode = 'simple' | 'classic' | 'expert';
export const UI_MODES: readonly UiMode[] = ['simple', 'classic', 'expert'];

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
  /** Code lives only in the private repo (src/expert/): can only ever be on in expert mode. */
  private?: boolean;
  /** Group on the admin page (FEATURE_GROUPS); without one: 'other'. */
  group?: string;
}

/** Groups on the admin page, in this order (unknown groups follow, then 'other'). */
export const FEATURE_GROUPS: Record<string, { de: string; en: string }> = {
  gartenplan: { de: 'Waldgartenplan', en: 'Forest garden plan' },
  other: { de: 'Sonstiges', en: 'Other' },
};

/** Admin overrides: feature id → modes in which it is on ([] = off everywhere). */
export type FeatureConfig = Record<string, UiMode[]>;

const FULL: readonly UiMode[] = ['classic', 'expert'];

export const FEATURES: readonly FeatureDef[] = [
  { id: 'simple-guide', de: 'Einstieg: Schritte, Schichten sammeln, ein Tipp', en: 'Getting started: steps, layer collection, one tip', modes: ['simple'], group: 'gartenplan' },
  { id: 'areas', de: 'Flächen (Beete, Teich, Wege)', en: 'Areas (beds, pond, paths)', modes: FULL, group: 'gartenplan' },
  { id: 'row', de: 'Reihe pflanzen', en: 'Plant a row', modes: FULL, group: 'gartenplan' },
  { id: 'boundary-edit', de: 'Umriss bearbeiten', en: 'Edit outline', modes: FULL, group: 'gartenplan' },
  { id: 'lasso', de: 'Mehrfachauswahl (Lasso)', en: 'Multi-select (lasso)', modes: FULL, group: 'gartenplan' },
  { id: 'measure', de: 'Messen', en: 'Measure', modes: FULL, group: 'gartenplan' },
  { id: 'gps', de: 'Feldmodus (GPS)', en: 'Field mode (GPS)', modes: FULL, group: 'gartenplan' },
  { id: 'polyculture', de: 'Polykultur verknüpfen und als Paket setzen', en: 'Link a polyculture, place it as a package', modes: FULL, group: 'gartenplan' },
  { id: 'location', de: 'Standort festlegen und drehen', en: 'Set location and rotation', modes: FULL, group: 'gartenplan' },
  { id: 'basemap-extra', de: 'Luftbild, Satellit, Deckkraft der Karte', en: 'Aerial photo, satellite, map opacity', modes: FULL, group: 'gartenplan' },
  { id: 'terrain', de: 'Gelände und Höhenlinien', en: 'Terrain and contour lines', modes: FULL, group: 'gartenplan' },
  { id: 'buildings', de: 'Gebäude aus OpenStreetMap', en: 'Buildings from OpenStreetMap', modes: FULL, group: 'gartenplan' },
  { id: 'sun-advanced', de: 'Sonne: Datum, Zeitraffer, Kamera, 3D-Bild', en: 'Sun: date, time-lapse, camera, 3D image', modes: FULL, group: 'gartenplan' },
  { id: 'coverage', de: 'Funktions-Abdeckung, Besonnung, Vorschläge', en: 'Function coverage, sun hours, suggestions', modes: FULL, group: 'gartenplan' },
  { id: 'warnings', de: 'Hinweise (Abstand, Licht, Nachbarn)', en: 'Hints (spacing, light, neighbours)', modes: FULL, group: 'gartenplan' },
  { id: 'phases', de: 'Bauabschnitte', en: 'Planting phases', modes: FULL, group: 'gartenplan' },
  { id: 'water', de: 'Wasser im Gelände, Swales', en: 'Water on the land, swales', modes: FULL, group: 'gartenplan' },
  { id: 'zones', de: 'Zonen & Sektoren', en: 'Zones & sectors', modes: FULL, group: 'gartenplan' },
  { id: 'climate', de: 'Standortklima', en: 'Site climate', modes: FULL, group: 'gartenplan' },
  { id: 'yield', de: 'Ertrag & Pflege, Pflegekalender', en: 'Yield & care, care calendar', modes: FULL, group: 'gartenplan' },
  { id: 'export', de: 'Export: PDF, GeoJSON, Pflanzliste, Kalender', en: 'Export: PDF, GeoJSON, plant list, calendar', modes: FULL, group: 'gartenplan' },
];

export const isUiMode = (v: unknown): v is UiMode => typeof v === 'string' && (UI_MODES as readonly string[]).includes(v);

/** Feature ids allowed in a config: lowercase words with dashes (the server applies the same rule). */
export const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** Logged-in role 'team': in expert mode every feature is on, whatever the admin
 *  set — except these, which only make sense in simple mode. */
export const TEAM_HIDDEN: readonly string[] = ['simple-guide'];

/** Modes in which a feature is on, after admin overrides. Private features are never on outside expert mode. */
export function modesFor(id: string, config: FeatureConfig = {}, defs: readonly FeatureDef[] = FEATURES): UiMode[] {
  const def = defs.find(d => d.id === id);
  const modes = config[id] ?? def?.modes ?? [];
  return modes.filter(m => !def?.private || m === 'expert');
}

/** Ids of all features that are off in the given mode (defaults plus any ids only the config knows). */
export function offFeatures(mode: UiMode, config: FeatureConfig = {}, defs: readonly FeatureDef[] = FEATURES, team = false): string[] {
  const ids = new Set([...defs.map(d => d.id), ...Object.keys(config)]);
  if (team && mode === 'expert') return [...ids].filter(id => TEAM_HIDDEN.includes(id));
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

/** The mode actually in effect: expert needs a login, otherwise the full public app. */
export function effectiveMode(mode: UiMode, loggedIn: boolean): UiMode {
  return mode === 'expert' && !loggedIn ? 'classic' : mode;
}

/** CSS that hides every element carrying an off feature. */
export function featureCss(off: readonly string[]): string {
  return off.map(id => `[data-feature~="${id}"]{display:none!important}`).join('\n');
}
