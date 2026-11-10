// Suggestions from soil maps (#616, stage 3 of #600): what the maps say about the soil at a point, as values for the
// soil of an area. Own observation beats every map (gardens are filled, compacted, mulched), so these are only offered,
// never set by themselves; the area keeps where its values came from (`src`).
//  - BÜK 200 (BGR, Germany, 1 : 200 000): soil type and substrate of the map unit → texture step, water, pH hint.
//  - SoilGrids (ISRIC, world, 250 m, CC BY 4.0): sand/clay share and pH of the top 5 cm → a point in the triangle.
// Both through our server (nginx /geo/buek, /geo/soilgrids/<prop>, cached a year), like the climate.
// shortcut: Landesämter (BK 50 etc.) are not asked yet — one service and data model per state; add state by state.
import type { Soil, SoilTexture } from './soil';
import { classOf } from './soil-triangle';
import { cachedFetch } from './geo-cache';

export type SoilMapSource = 'buek' | 'soilgrids';
export interface SoilSuggestion {
  src: SoilMapSource;
  /** What the map says, in its own words ("Braunerde aus Sand …", "lehmiger Sand · pH 5,7"). */
  text: string;
  /** The fields this source knows; the others stay as they are when taken over. */
  set: Soil;
  /** SoilGrids: the point in the texture triangle. */
  point?: { sand: number; clay: number };
}

/** pH value → the five steps of the plant data. */
export const phStep = (v: number) => (v < 5 ? 0 : v < 6 ? 1 : v < 7.1 ? 2 : v < 8.5 ? 3 : 4);

/** SoilGrids answers GetFeatureInfo as a small HTML page; the first value is the pixel's (g/kg, pH × 10). */
export function parseSoilGridsValue(html: string): number | null {
  const m = /<span id="value">\s*(-?\d+(?:\.\d+)?)\s*</.exec(html);
  return m ? Number(m[1]) : null;
}

export function soilGridsSuggestion(sandGkg: number, clayGkg: number, ph10: number | null, lang: 'de' | 'en'): SoilSuggestion | null {
  if (!(sandGkg > 0 || clayGkg > 0)) return null; // water, rock, outside the data: 0 / no data
  const sand = Math.round(sandGkg / 10), clay = Math.round(clayGkg / 10);
  const c = classOf(sand, clay);
  const ph = ph10 && ph10 > 0 ? ph10 / 10 : null;
  const set: Soil = {};
  if (c) { set.cls = c.k; set.tex = c.z; }
  if (ph != null) set.ph = phStep(ph);
  const fmt = (v: number) => (lang === 'en' ? String(v) : String(v).replace('.', ','));
  const parts = [c ? c.name[lang] : null, lang === 'en' ? `sand ${sand} %, clay ${clay} %` : `Sand ${sand} %, Ton ${clay} %`, ph != null ? `pH ${fmt(ph)}` : null];
  return { src: 'soilgrids', text: parts.filter(Boolean).join(' · '), set, point: { sand, clay } };
}

// Soil types of the German classification (KA5) with what they say about the water and pH at a site.
const TYPES: { re: RegExp; typ: string; set: Soil }[] = [
  { re: /stagnogley/i, typ: 'Stagnogley', set: { wat: 's' } },
  { re: /pseudogley/i, typ: 'Pseudogley', set: { wat: 's' } },
  { re: /niedermoor|anmoorgley|moorgley/i, typ: 'Niedermoor', set: { wat: 'w' } },
  { re: /hochmoor/i, typ: 'Hochmoor', set: { wat: 'w', ph: 0 } },
  { re: /podsol/i, typ: 'Podsol', set: { ph: 1 } },
  { re: /pararendzina/i, typ: 'Pararendzina', set: { ph: 3 } },
  { re: /rendzina/i, typ: 'Rendzina', set: { ph: 3 } },
  { re: /\bgley/i, typ: 'Gley', set: { wat: 'w' } },
  { re: /parabraunerde/i, typ: 'Parabraunerde', set: {} },
  { re: /braunerde/i, typ: 'Braunerde', set: {} },
  { re: /\bveg(a|en)\b|auenb/i, typ: 'Vega', set: {} },
  { re: /pelosol/i, typ: 'Pelosol', set: { tex: 'H' } },
  { re: /kolluvisol/i, typ: 'Kolluvisol', set: {} },
  { re: /tschernosem|schwarzerde/i, typ: 'Tschernosem', set: {} },
  { re: /regosol|ranker|syrosem/i, typ: 'Regosol', set: {} },
  { re: /fahlerde/i, typ: 'Fahlerde', set: {} },
];
/** The soil types offered by hand (with what they preset). */
export const SOIL_TYPES = ['Braunerde', 'Parabraunerde', 'Pseudogley', 'Gley', 'Podsol', 'Rendzina', 'Pelosol', 'Vega', 'Kolluvisol', 'Niedermoor'];
/** What a soil type says about the empty fields of a soil. */
export function typePreset(typ: string): Soil {
  return TYPES.find(t => t.typ === typ)?.set ?? {};
}

/** The substrate after "aus …": its first grain word decides the step (sand → light; silt, loam, loess → medium; clay → heavy). */
function substrateStep(text: string): SoilTexture | undefined {
  const from = text.slice(Math.max(0, text.search(/\baus\b/i)));
  const m = /(sand|schluff|lehm|löss|loess|ton)/i.exec(from);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  return w === 'sand' ? 'L' : w === 'ton' ? 'H' : 'M';
}

/** BGR identify (ArcGIS JSON): the map unit at the point, without the sheet layers. */
export function parseBuek(json: unknown): { code: string; text: string } | null {
  const results = (json as { results?: { attributes?: Record<string, string> }[] })?.results ?? [];
  const unit = results.find(r => r.attributes?.Legendentext);
  if (!unit) return null;
  return { code: unit.attributes!.Legende ?? '', text: unit.attributes!.Legendentext.replace(/\*/g, '') };
}

export function buekSuggestion(text: string): SoilSuggestion {
  // the first type named is the prevailing one ("Überwiegend Braunerden …, gering verbreitet Pseudogley …")
  const first = TYPES.map(t => ({ t, i: text.search(t.re) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i)[0]?.t;
  const set: Soil = { ...(first?.set ?? {}) };
  const step = substrateStep(text);
  if (step && !set.tex) set.tex = step;
  if (first) set.typ = first.typ;
  return { src: 'buek', text, set };
}

const YEAR = 365 * 24 * 3600 * 1000;
const f4 = (v: number) => v.toFixed(4);
async function text(url: string): Promise<string> {
  const res = await cachedFetch(url, YEAR, () => fetch(url));
  return res.text();
}

/** All map suggestions at a point; a source that fails or knows nothing is left out. */
export async function soilMapsAt(lat: number, lon: number, lang: 'de' | 'en'): Promise<SoilSuggestion[]> {
  // a small box around the point (about 200 m), its middle pixel is asked; SoilGrids answers nothing for a box smaller
  // than its 250 m pixels
  const d = 0.001, bbox = [lon - d, lat - d, lon + d, lat + d].map(f4).join(',');
  const grids = (async () => {
    const [sand, clay, ph] = await Promise.all(['sand', 'clay', 'phh2o'].map(p => text(`/geo/soilgrids/${p}?bbox=${bbox}`).then(parseSoilGridsValue)));
    return sand != null && clay != null ? soilGridsSuggestion(sand, clay, ph, lang) : null;
  })();
  const buek = (async () => {
    const unit = parseBuek(JSON.parse(await text(`/geo/buek?pt=${f4(lon)},${f4(lat)}`)));
    return unit ? buekSuggestion(unit.text) : null;
  })();
  const out = await Promise.allSettled([buek, grids]);
  return out.flatMap(r => (r.status === 'fulfilled' && r.value ? [r.value] : []));
}
