import { cachedFetch, DAY_MS } from './geo-cache';
import type { PlantData } from './types';

// Site climate for a located garden plan, from 30 years of daily weather
// (Open-Meteo historical archive, ERA5 reanalysis, ≈ 10–25 km grid, CC BY 4.0).
// Fetched through our own server (/geo/climate/, nginx cache) with the
// location rounded to 0.1° (≈ 10 km), so neither the visitor's IP nor the
// exact garden reaches Open-Meteo. Regional values: a frost hollow or a warm
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

/** Site climate for a location (cached in the browser for a year). */
export async function fetchSiteClimate(lat: number, lon: number): Promise<SiteClimate> {
  const url = climateRequestUrl(lat, lon);
  const res = await cachedFetch(url, 365 * DAY_MS, () => fetch(url));
  const data = await res.json();
  if (!data?.daily?.time?.length) throw new Error('no climate data');
  return summarizeClimate(data.daily, Number(lat.toFixed(1)), Number(lon.toFixed(1)), typeof data.elevation === 'number' ? data.elevation : null);
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
