import { cachedFetch, DAY_MS } from './geo-cache';
import type { PlantData } from './types';

// Site climate for a located garden plan, from 30 years of daily weather
// (Open-Meteo historical archive, ERA5 reanalysis, ≈ 10–25 km grid, CC BY 4.0).
// Fetched through our own server (/geo/climate/, nginx cache) with the
// location rounded to 0.1° (≈ 10 km), so neither the visitor's IP nor the
// exact garden reaches Open-Meteo. Only when our server hits Open-Meteo's daily limit (HTTP 429) and the visitor
// agreed (allowDirect(), #610) does the browser ask Open-Meteo itself. Regional values: a frost hollow or a warm
// wall in the garden can differ by a zone.

export const CLIMATE_URL = '/geo/climate';
export const CLIMATE_YEARS: [number, number] = [1994, 2023];
export const CLIMATE_ATTRIBUTION = 'Klima: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> (ERA5, CC BY 4.0)';

export interface SiteClimate {
  lat: number; lon: number;          // rounded query point
  elevationM: number | null;
  years: [number, number];
  /** Mean of the yearly lowest temperature (°C) — basis of the USDA zone. */
  meanAnnualMinC: number;
  /** USDA hardiness zone as a number in half steps: 7 = 7a, 7.5 = 7b. */
  zone: number;
  /** Median day of year of the last spring frost (< 0 °C), null if none. */
  lastFrostDoy: number | null;
  /** Median day of year of the first autumn frost, null if none. */
  firstFrostDoy: number | null;
  frostFreeDays: number | null;
  precipMm: number;                   // mean per year
  /** Share of days per 16 wind directions (0 = from N, 1 = NNE …), sums to 1. */
  windRose: number[];
  /** Direction (degrees, where the wind comes FROM) with the most days. */
  windFromDeg: number;
}

interface Daily { time: string[]; temperature_2m_min: (number | null)[]; precipitation_sum: (number | null)[]; wind_direction_10m_dominant: (number | null)[]; }

const doyOf = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS) + 1;
};
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** °C → USDA zone in half steps (zone 1a starts at −51.1 °C, 5.56 K per zone). */
export function usdaZone(minC: number): number {
  const f = minC * 9 / 5 + 32;
  const z = (f + 60) / 10 + 1;
  return Math.max(1, Math.min(13.5, Math.floor(z * 2) / 2));
}

export function zoneLabel(zone: number): string {
  return `${Math.floor(zone)}${zone % 1 ? 'b' : 'a'}`;
}

/** Pure part: daily series → climate summary. */
export function summarizeClimate(d: Daily, lat: number, lon: number, elevationM: number | null): SiteClimate {
  const byYear = new Map<number, { min: number; lastSpring: number | null; firstAutumn: number | null; precip: number; n: number }>();
  const rose = new Array(16).fill(0);
  let windDays = 0;
  for (let i = 0; i < d.time.length; i++) {
    const year = Number(d.time[i].slice(0, 4));
    const y = byYear.get(year) ?? { min: Infinity, lastSpring: null, firstAutumn: null, precip: 0, n: 0 };
    byYear.set(year, y);
    const tmin = d.temperature_2m_min[i];
    const doy = doyOf(d.time[i]);
    if (tmin != null) {
      y.n++;
      if (tmin < y.min) y.min = tmin;
      if (tmin < 0) {
        if (doy < 183) y.lastSpring = doy;
        else if (y.firstAutumn == null) y.firstAutumn = doy;
      }
    }
    y.precip += d.precipitation_sum[i] ?? 0;
    const w = d.wind_direction_10m_dominant[i];
    if (w != null) { rose[Math.round(((w % 360) + 360) % 360 / 22.5) % 16]++; windDays++; }
  }
  const full = [...byYear.values()].filter(y => y.n > 300);
  const meanAnnualMinC = full.reduce((s, y) => s + y.min, 0) / Math.max(1, full.length);
  const last = median(full.map(y => y.lastSpring).filter((v): v is number => v != null));
  const first = median(full.map(y => y.firstAutumn).filter((v): v is number => v != null));
  const maxSector = rose.indexOf(Math.max(...rose));
  return {
    lat, lon, elevationM, years: CLIMATE_YEARS,
    meanAnnualMinC, zone: usdaZone(meanAnnualMinC),
    lastFrostDoy: last != null ? Math.round(last) : null,
    firstFrostDoy: first != null ? Math.round(first) : null,
    frostFreeDays: last != null && first != null ? Math.round(first - last - 1) : null,
    precipMm: full.reduce((s, y) => s + y.precip, 0) / Math.max(1, full.length),
    windRose: rose.map(n => (windDays ? n / windDays : 0)),
    windFromDeg: maxSector * 22.5,
  };
}

export function climateRequestUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: lat.toFixed(1), longitude: lon.toFixed(1),
    start_date: `${CLIMATE_YEARS[0]}-01-01`, end_date: `${CLIMATE_YEARS[1]}-12-31`,
    daily: 'temperature_2m_min,precipitation_sum,wind_direction_10m_dominant', timezone: 'UTC',
  });
  return `${CLIMATE_URL}?${q}`;
}

/** The summary is kept too (small, in localStorage, 30 days): opening a plan then needs neither the 30 years of
 *  daily values (≈ 300 KB) nor their parsing — the climate is there at once, without a "loading" step. */
const SUMMARY_KEY = (lat: number, lon: number) => `pdk-climate:${lat.toFixed(1)},${lon.toFixed(1)},${CLIMATE_YEARS.join('-')}`;
const SUMMARY_MS = 30 * DAY_MS;
const pending = new Map<string, Promise<SiteClimate>>();

/** The kept summary for a location, or null (none, too old, unreadable). */
export function cachedSiteClimate(lat: number, lon: number): SiteClimate | null {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY(lat, lon));
    const v = raw ? JSON.parse(raw) as { at: number; c: SiteClimate } : null;
    return v && Date.now() - v.at < SUMMARY_MS && v.c && typeof v.c.zone === 'number' ? v.c : null;
  } catch { return null; }
}

/** Site climate for a location: the kept summary, else the daily values (browser cache for a year), summarized. */
export function fetchSiteClimate(lat: number, lon: number): Promise<SiteClimate> {
  const hit = cachedSiteClimate(lat, lon);
  if (hit) return Promise.resolve(hit);
  const key = SUMMARY_KEY(lat, lon);
  let p = pending.get(key); // planner and wind protection ask at the same time: one request
  if (!p) {
    p = (async () => {
      const res = await climateFetch(climateRequestUrl(lat, lon));
      const data = await res.json();
      if (!data?.daily?.time?.length) throw new Error('no climate data');
      const c = summarizeClimate(data.daily, Number(lat.toFixed(1)), Number(lon.toFixed(1)), typeof data.elevation === 'number' ? data.elevation : null);
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), c })); } catch { /* full or blocked: the browser cache still has the raw data */ }
      return c;
    })().finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

// ── Plants vs. site ─────────────────────────────────────────────────────

/** "5-10" / "6" / "5 - 9" (PFAF/EFG USDA range) → [min, max]; null if unknown. */
export function plantZoneRange(climateZone: string | undefined): [number, number] | null {
  const m = /(\d{1,2})\s*(?:[-–]\s*(\d{1,2}))?/.exec(climateZone ?? '');
  if (!m) return null;
  const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
  return a >= 1 && a <= 13 && b >= a ? [a, b] : null;
}

/** Not hardy: the site's zone is colder than the plant's coldest zone. */
export function notHardy(p: Pick<PlantData, 'climateZone'>, c: SiteClimate): boolean {
  const r = plantZoneRange(p.climateZone);
  return !!r && Math.floor(c.zone) < r[0];
}

/** Blossom at risk: flowering usually starts (mid-month) before the median last frost. */
export function blossomFrostRisk(p: Pick<PlantData, 'flowerMonths'>, c: SiteClimate): boolean {
  if (c.lastFrostDoy == null) return false;
  const first = (p.flowerMonths ?? []).findIndex(Boolean);
  if (first < 0 || first > 5) return false;   // flowers from July on: no spring frost
  return doyOf(`2001-${String(first + 1).padStart(2, '0')}-15`) <= c.lastFrostDoy;
}

/** Day of year → short date ("18. Apr." / "Apr 18"), year-independent. */
export function doyLabel(doy: number, lang: string): string {
  const d = new Date(Date.UTC(2001, 0, doy));
  return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

export const COMPASS16 = { de: ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'], en: ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] };

// ── Future climate (#530): seven CMIP6 HighResMIP models via Open-Meteo's climate API ──
// Each model's change against 1994–2023 (in the same model) is added to the measured ERA5 climate above, so
// model bias cancels out. The models follow a high emission path and end in 2050: a target year up to
// LAST_DATA_YEAR looks at the 11 model years around it; later years scale the change around LAST_DATA_YEAR with
// the global warming of the chosen scenario (IPCC AR6 WG1, table SPM.1) — a rough projection, labelled as such.
export const FUTURE_URL = '/geo/climate-future';
export const FUTURE_MODELS = ['CMCC_CM2_VHR4', 'FGOALS_f3_H', 'HiRAM_SIT_HR', 'MRI_AGCM3_2_S', 'EC_Earth3P_HR', 'MPI_ESM1_2_XR', 'NICAM16_8S'];
// ── Direct from the browser, only with consent (#610) ──
// Our server's IP shares one free Open-Meteo quota (10 000 weighted calls a day; one location's model data alone
// weighs ≈ 4 000). When the server answers 429, the browser may ask Open-Meteo itself — then Open-Meteo sees the
// visitor's IP and the rounded location, so only after the visitor agreed (this time, or always on this device).
const DIRECT: Record<string, string> = { [CLIMATE_URL]: 'https://archive-api.open-meteo.com/v1/archive', [FUTURE_URL]: 'https://climate-api.open-meteo.com/v1/climate' };
const DIRECT_KEY = 'pdk-climate-direct';
let directOnce = false;
/** Our server hit Open-Meteo's daily limit and the visitor has not agreed to a direct request yet. */
export class ClimateLimitError extends Error {}
/** Agreed for good on this device (shown with a way to take it back). */
export function directAlways(): boolean {
  try { return localStorage.getItem(DIRECT_KEY) === '1'; } catch { return false; }
}
export const directAllowed = (): boolean => directOnce || directAlways();
/** Consent: for this page view, or (always) on this device until revokeDirect(). */
export function allowDirect(always: boolean): void {
  directOnce = true;
  if (always) try { localStorage.setItem(DIRECT_KEY, '1'); } catch { /* private window: this page view only */ }
}
export function revokeDirect(): void {
  directOnce = false;
  try { localStorage.removeItem(DIRECT_KEY); } catch { /* ignore */ }
}
/** Our proxy URL → the same request at Open-Meteo (same query, so the browser cache key stays the proxy URL). */
export function directUrl(url: string): string {
  const i = url.indexOf('?');
  const base = DIRECT[i < 0 ? url : url.slice(0, i)];
  if (!base) throw new Error(`no direct source for ${url}`);
  return base + (i < 0 ? '' : url.slice(i));
}
/** Through our server (cached for everyone); on its 429 directly, if allowed, else ClimateLimitError. */
function climateFetch(url: string): Promise<Response> {
  return cachedFetch(url, 365 * DAY_MS, async () => {
    const res = await fetch(url);
    if (res.status !== 429) return res;
    if (!directAllowed()) throw new ClimateLimitError('Open-Meteo daily limit (server)');
    return fetch(directUrl(url));
  });
}

export const modelLabel = (m: string) => m.replace(/_/g, '-');
const FUTURE_END = 2050, HALF = 5;
/** Last target year still read from model data (its 11-year window ends in 2050). */
export const LAST_DATA_YEAR = FUTURE_END - HALF;
export const TARGET_YEARS: [number, number] = [2030, 2100];

// Global warming against 1850–1900, [median, 5 %, 95 %] for 2021–40, 2041–60, 2081–2100 (IPCC AR6 WG1 SPM.1).
export const AR6 = {
  'SSP1-2.6': [[1.5, 1.2, 1.8], [1.7, 1.3, 2.2], [1.8, 1.3, 2.4]],
  'SSP2-4.5': [[1.5, 1.2, 1.8], [2.0, 1.6, 2.5], [2.7, 2.1, 3.5]],
  'SSP3-7.0': [[1.5, 1.2, 1.8], [2.1, 1.7, 2.6], [3.6, 2.8, 4.6]],
  'SSP5-8.5': [[1.6, 1.3, 1.9], [2.4, 1.9, 3.0], [4.4, 3.3, 5.7]],
} as const;
export type Ssp = keyof typeof AR6;
export const SSPS = Object.keys(AR6) as Ssp[];
const AR6_YEARS = [2030, 2050, 2090];
const G_REF = 0.95; // global warming 1994–2023 against 1850–1900 (AR6: 0.85 for 1995–2014, 1.09 for 2011–2020)

/** The plan's climate outlook: target year, emission scenario (counts after LAST_DATA_YEAR), one model or 'all'. */
export interface ClimateScenario { year: number; ssp: Ssp; model: string }
export const DEFAULT_SCENARIO: ClimateScenario = { year: 2050, ssp: 'SSP2-4.5', model: 'all' };

/** Plan value → a valid scenario (also for imported plans); null if unusable. */
export function normalizeScenario(raw: unknown): ClimateScenario | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isInteger(r.year) || (r.year as number) < TARGET_YEARS[0] || (r.year as number) > TARGET_YEARS[1]) return null;
  if (!SSPS.includes(r.ssp as Ssp)) return null;
  if (r.model !== 'all' && !FUTURE_MODELS.includes(r.model as string)) return null;
  return { year: r.year as number, ssp: r.ssp as Ssp, model: r.model as string };
}

/** Global warming of a scenario in a year (k: 0 median, 1 low, 2 high), linear between the AR6 periods. */
export function ar6At(ssp: Ssp, year: number, k: 0 | 1 | 2): number {
  const v = AR6[ssp].map(r => r[k]);
  const i = year <= AR6_YEARS[1] ? 0 : 1;
  return v[i] + (v[i + 1] - v[i]) * (year - AR6_YEARS[i]) / (AR6_YEARS[i + 1] - AR6_YEARS[i]);
}
/** Factor for the model change around LAST_DATA_YEAR (≈ SSP5-8.5) to reach a scenario and year. */
export const scaleFactor = (ssp: Ssp, year: number, k: 0 | 1 | 2 = 0) =>
  (ar6At(ssp, year, k) - G_REF) / (ar6At('SSP5-8.5', LAST_DATA_YEAR, 0) - G_REF);

/** Per model one row per year from `from` (null = too few days): [lowest temperature, days ≥ 30 °C, frost days,
 *  12 monthly means °C, 12 monthly rain sums mm]. Small enough to keep in localStorage (≈ 45 KB). */
export interface FutureClimate { v: 2; from: number; models: Record<string, (number[] | null)[]> }

/** Pure part: the climate API's daily series (all models) → yearly rows per model. */
export function summarizeFuture(d: Record<string, (number | null)[] | string[]>): FutureClimate {
  const time = d.time as string[];
  const from = Number(time[0]?.slice(0, 4)), models: FutureClimate['models'] = {};
  const r1 = (v: number) => Math.round(v * 10) / 10;
  for (const m of FUTURE_MODELS) {
    const col = (k: string) => d[`${k}_${m}`] as (number | null)[] | undefined;
    const tmin = col('temperature_2m_min'), tmax = col('temperature_2m_max'), tmean = col('temperature_2m_mean'), prec = col('precipitation_sum');
    if (!tmin || !tmax || !prec) continue;
    const years: { min: number; hot: number; frost: number; n: number; t: number[]; tn: number[]; p: number[] }[] = [];
    for (let i = 0; i < time.length; i++) {
      const yi = Number(time[i].slice(0, 4)) - from, mo = Number(time[i].slice(5, 7)) - 1;
      const y = years[yi] ??= { min: Infinity, hot: 0, frost: 0, n: 0, t: Array(12).fill(0), tn: Array(12).fill(0), p: Array(12).fill(0) };
      const lo = tmin[i], hi = tmax[i];
      if (lo == null || hi == null) continue;
      y.n++; y.min = Math.min(y.min, lo);
      if (hi >= 30) y.hot++;
      if (lo < 0) y.frost++;
      y.t[mo] += tmean?.[i] ?? (lo + hi) / 2; y.tn[mo]++;
      y.p[mo] += prec[i] ?? 0;
    }
    models[m] = Array.from(years, y => (y && y.n > 300 && y.tn.every(n => n > 0)
      ? [r1(y.min), y.hot, y.frost, ...y.t.map((s, k) => r1(s / y.tn[k])), ...y.p.map(r1)] : null));
  }
  return { v: 2, from, models };
}

export interface WindowStats { minT: number; hot: number; frost: number; tann: number; summerRain: number; T: number[]; P: number[] }
export type FutureMetric = 'tann' | 'minT' | 'hot' | 'frost' | 'summerRain';
export const FUTURE_METRICS: FutureMetric[] = ['tann', 'minT', 'hot', 'frost', 'summerRain'];
const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** Means over the model years y0…y1; null with fewer than 8 years of data. */
export function windowStats(rows: (number[] | null)[], from: number, y0: number, y1: number): WindowStats | null {
  const ys: number[][] = [];
  for (let y = y0; y <= y1; y++) { const r = rows[y - from]; if (r) ys.push(r); }
  if (ys.length < 8) return null;
  const T = Array.from({ length: 12 }, (_, m) => avg(ys.map(r => r[3 + m])));
  const P = Array.from({ length: 12 }, (_, m) => avg(ys.map(r => r[15 + m])));
  return { minT: avg(ys.map(r => r[0])), hot: avg(ys.map(r => r[1])), frost: avg(ys.map(r => r[2])), tann: avg(T), summerRain: P[5] + P[6] + P[7], T, P };
}

/** Change of a metric (K, days, or % for summer rain) in one model for a year; k picks the scenario's
 *  median/low/high after LAST_DATA_YEAR. null without enough data. */
export function modelDelta(f: FutureClimate, model: string, metric: FutureMetric, year: number, ssp: Ssp, k: 0 | 1 | 2 = 0): number | null {
  const rows = f.models[model];
  const ref = rows && windowStats(rows, f.from, ...CLIMATE_YEARS);
  if (!ref) return null;
  const d = (w: WindowStats) => (metric === 'summerRain' ? (ref.summerRain > 0 ? (w.summerRain / ref.summerRain - 1) * 100 : 0) : w[metric] - ref[metric]);
  if (year <= LAST_DATA_YEAR) { const w = windowStats(rows, f.from, year - HALF, year + HALF); return w ? d(w) : null; }
  const last = windowStats(rows, f.from, LAST_DATA_YEAR - HALF, LAST_DATA_YEAR + HALF);
  return last ? d(last) * scaleFactor(ssp, year, k) : null;
}

/** Models with data. */
export const availableModels = (f: FutureClimate) => FUTURE_MODELS.filter(m => windowStats(f.models[m] ?? [], f.from, ...CLIMATE_YEARS));
/** Models a scenario looks at: the chosen one, or all with data. */
export function scenarioModels(f: FutureClimate, s: ClimateScenario): string[] {
  const ok = availableModels(f);
  return s.model !== 'all' && ok.includes(s.model) ? [s.model] : ok;
}

/** Köppen-Geiger class from monthly means and sums (Kottek et al. 2006, northern hemisphere). */
export function koeppen(T: number[], P: number[]): string {
  const sum = (v: number[]) => v.reduce((s, x) => s + x, 0);
  const tann = avg(T), pann = sum(P), tmin = Math.min(...T), tmax = Math.max(...T);
  const Ps = [3, 4, 5, 6, 7, 8].map(i => P[i]), Pw = [9, 10, 11, 0, 1, 2].map(i => P[i]);
  const pth = sum(Pw) >= pann * 2 / 3 ? 2 * tann : sum(Ps) >= pann * 2 / 3 ? 2 * tann + 28 : 2 * tann + 14;
  if (tmax < 10) return 'E';
  if (pann < 10 * pth) return (pann < 5 * pth ? 'BW' : 'BS') + (tann >= 18 ? 'h' : 'k');
  if (tmin >= 18) return 'A';
  const main = tmin > -3 ? 'C' : 'D';
  const psmin = Math.min(...Ps), pwmin = Math.min(...Pw), psmax = Math.max(...Ps), pwmax = Math.max(...Pw);
  const prec = psmin < pwmin && pwmax > 3 * psmin && psmin < 40 ? 's' : pwmin < psmin && psmax > 10 * pwmin ? 'w' : 'f';
  const temp = tmax >= 22 ? 'a' : T.filter(t => t >= 10).length >= 4 ? 'b' : tmin < -38 ? 'd' : 'c';
  return main + prec + temp;
}

/** Köppen class of one model today and in the target year (projected years scale the temperature only:
 *  the rain change up to 2050 is barely above noise and scaled would invent classes). */
export function modelKoeppen(f: FutureClimate, model: string, s: ClimateScenario): [string, string] | null {
  const rows = f.models[model];
  const ref = rows && windowStats(rows, f.from, ...CLIMATE_YEARS);
  if (!ref) return null;
  if (s.year <= LAST_DATA_YEAR) {
    const w = windowStats(rows, f.from, s.year - HALF, s.year + HALF);
    return w ? [koeppen(ref.T, ref.P), koeppen(w.T, w.P)] : null;
  }
  const last = windowStats(rows, f.from, LAST_DATA_YEAR - HALF, LAST_DATA_YEAR + HALF);
  if (!last) return null;
  const k = scaleFactor(s.ssp, s.year);
  return [koeppen(ref.T, ref.P), koeppen(ref.T.map((t, i) => t + (last.T[i] - t) * k), last.P)];
}

/** What the plan's hints and suggestions use: USDA zone per model in the target year, median summer rain change. */
export interface FutureOutlook { scenario: ClimateScenario; projected: boolean; zones: number[]; summerRainChange: number }

export function futureOutlook(c: Pick<SiteClimate, 'meanAnnualMinC'>, f: FutureClimate, s: ClimateScenario): FutureOutlook {
  const ms = scenarioModels(f, s);
  const zones = ms.map(m => modelDelta(f, m, 'minT', s.year, s.ssp)).filter((v): v is number => v != null)
    .map(dk => usdaZone(c.meanAnnualMinC + dk)).sort((a, b) => a - b);
  const rain = ms.map(m => modelDelta(f, m, 'summerRain', s.year, s.ssp)).filter((v): v is number => v != null);
  return { scenario: s, projected: s.year > LAST_DATA_YEAR, zones, summerRainChange: (median(rain) ?? 0) / 100 };
}

const FUTURE_KEY = (lat: number, lon: number) => `pdk-climate-future:v2:${lat.toFixed(1)},${lon.toFixed(1)}`;
const pendingFuture = new Map<string, Promise<FutureClimate>>();

/** Future climate for a location: kept yearly rows (localStorage), else the models' daily series
 *  (≈ 3.5 MB, browser cache for a year), summarized. */
export function fetchFutureClimate(lat: number, lon: number): Promise<FutureClimate> {
  const key = FUTURE_KEY(lat, lon);
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; f: FutureClimate } | null;
    if (v && Date.now() - v.at < SUMMARY_MS && v.f?.v === 2) return Promise.resolve(v.f);
  } catch { /* fetch below */ }
  let p = pendingFuture.get(key);
  if (!p) {
    p = (async () => {
      const q = new URLSearchParams({
        latitude: lat.toFixed(1), longitude: lon.toFixed(1), start_date: `${CLIMATE_YEARS[0]}-01-01`, end_date: `${FUTURE_END}-12-31`,
        models: FUTURE_MODELS.join(','), daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum', timezone: 'UTC',
      });
      const data = await (await climateFetch(`${FUTURE_URL}?${q}`)).json();
      if (!data?.daily?.time?.length) throw new Error('no future climate data');
      const f = summarizeFuture(data.daily);
      if (!availableModels(f).length) throw new Error('no future climate data');
      try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), f })); } catch { /* full or blocked */ }
      return f;
    })().finally(() => pendingFuture.delete(key));
    pendingFuture.set(key, p);
  }
  return p;
}

export type ClimateStatus = 'fit' | 'becomesPossible' | 'underPressure' | 'notHardy';
export interface ClimateCheck { status: ClimateStatus; tooWarm: number; fits: number; models: number; drier: boolean; maxZone: number | null }

/** How a plant fares at the site today and in the outlook's target year; null without a known zone range or model data.
 *  The upper zone only counts when the plant data gives a range ("5-9"); a single number is the coldest zone only.
 *  "fit" (klimafest) only if it fits in every model looked at. */
export function climateCheck(p: Pick<PlantData, 'climateZone' | 'waterDry' | 'waterMid' | 'waterWet'>, c: Pick<SiteClimate, 'zone'>, o: FutureOutlook): ClimateCheck | null {
  const r = plantZoneRange(p.climateZone);
  const zones = o.zones;
  if (!r || !zones.length) return null;
  const maxZone = /\d\s*[-–]\s*\d/.test(p.climateZone ?? '') ? r[1] : null;
  const warm = (z: number) => maxZone != null && Math.floor(z) > maxZone, hardy = (z: number) => Math.floor(z) >= r[0];
  const tooWarm = zones.filter(warm).length, fits = zones.filter(z => hardy(z) && !warm(z)).length;
  // Wet-soil plants only (not also mid/dry): summer rain down more than 15 % in the median.
  const drier = !!p.waterWet && !p.waterMid && !p.waterDry && o.summerRainChange < -0.15;
  const base = { tooWarm, fits, models: zones.length, drier, maxZone };
  if (!hardy(c.zone)) return { ...base, status: fits ? 'becomesPossible' : 'notHardy' };
  return { ...base, status: tooWarm || drier ? 'underPressure' : 'fit' };
}
