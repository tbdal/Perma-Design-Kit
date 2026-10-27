// Aerial photo tiles live in the browser's own HTTP cache, which cannot be listed or measured.
// What we can see is this session's traffic (Resource Timing): per country how many tiles came
// from the browser cache (transferSize 0) and how many were loaded online through our server.
import { ORTHO_SOURCES } from './ortho-sources';

export interface AerialUsage { id: string; tiles: number; cached: number; online: number; bytes: number }

export function aerialUsage(entries: PerformanceResourceTiming[] = performance.getEntriesByType('resource') as PerformanceResourceTiming[]): AerialUsage[] {
  const by = new Map<string, AerialUsage>();
  for (const e of entries) {
    const m = /\/geo\/ortho\/([a-z]{2})\//.exec(e.name);
    if (!m) continue;
    const u = by.get(m[1]) ?? { id: m[1], tiles: 0, cached: 0, online: 0, bytes: 0 };
    u.tiles++;
    if (e.transferSize === 0) u.cached++; else u.online++;
    u.bytes += e.decodedBodySize || e.encodedBodySize || 0;
    by.set(m[1], u);
  }
  return [...by.values()].sort((a, b) => b.bytes - a.bytes);
}

export const orthoRegion = (id: string, lang: 'de' | 'en'): string => ORTHO_SOURCES.find(o => o.id === id)?.region[lang] ?? id;

// What the browser cache holds cannot be measured, so every tile loaded online (= newly stored) is added up per
// country when the page is left; the settings show that sum as an estimate.
const TOTALS_KEY = 'pdk-aerial-totals';
let recordedUntil = 0;
export type AerialTotals = Record<string, { tiles: number; bytes: number }>;

export function aerialTotals(): AerialTotals {
  try { return JSON.parse(localStorage.getItem(TOTALS_KEY) || '{}'); } catch { return {}; }
}

export function recordAerialUsage(): void {
  const fresh = (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter(e => e.startTime > recordedUntil);
  if (!fresh.length) return;
  recordedUntil = Math.max(...fresh.map(e => e.startTime));
  const totals = aerialTotals();
  for (const u of aerialUsage(fresh)) {
    if (!u.online) continue;
    const t = totals[u.id] ?? { tiles: 0, bytes: 0 };
    totals[u.id] = { tiles: t.tiles + u.online, bytes: t.bytes + Math.round(u.bytes * u.online / u.tiles) };
  }
  try { localStorage.setItem(TOTALS_KEY, JSON.stringify(totals)); } catch { /* full or private window */ }
}

export function clearAerialTotals(): void { try { localStorage.removeItem(TOTALS_KEY); } catch { /* ignore */ } }
