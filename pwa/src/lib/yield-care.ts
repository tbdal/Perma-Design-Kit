import type { GardenPlan, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';

// Rough yield estimate and care calendar for a garden plan.
//
// Yield = crown area at the given age (growth-model.ts) × a typical yield
// per m² of crown for the genus, from the year the plant starts bearing,
// ramping up over its first three bearing years. Illustrative guide values
// (order of magnitude from common orchard/garden figures), not measured
// data: rootstock, variety, pruning, pollination and weather easily change
// them by a factor of two or more.

export interface YieldSpec { kgPerM2: number; startYear: number; product: 'fruit' | 'nut'; }

const Y = (kgPerM2: number, startYear: number, product: YieldSpec['product'] = 'fruit'): YieldSpec => ({ kgPerM2, startYear, product });

/** By "genus species" or genus (lower case). */
export const YIELD_TABLE: Record<string, YieldSpec> = {
  malus: Y(2, 4), pyrus: Y(2, 5), cydonia: Y(1.5, 4), mespilus: Y(1, 4), sorbus: Y(0.8, 5),
  'prunus avium': Y(1, 5), 'prunus cerasus': Y(1.5, 3), 'prunus domestica': Y(1.5, 4), 'prunus insititia': Y(1.5, 4),
  'prunus persica': Y(1.5, 3), 'prunus armeniaca': Y(1.2, 4), 'prunus spinosa': Y(0.5, 3), 'prunus tomentosa': Y(1, 3),
  'juglans regia': Y(0.3, 8, 'nut'), juglans: Y(0.2, 10, 'nut'), corylus: Y(0.4, 4, 'nut'), castanea: Y(0.4, 6, 'nut'), carya: Y(0.2, 10, 'nut'),
  ribes: Y(1.5, 2), rubus: Y(1, 2), vaccinium: Y(1, 3), sambucus: Y(1, 3), aronia: Y(1.5, 3), amelanchier: Y(0.8, 3),
  hippophae: Y(1, 4), 'cornus mas': Y(1, 5), ficus: Y(1, 3), actinidia: Y(2, 4), vitis: Y(1.5, 3), 'lonicera caerulea': Y(1, 3),
  elaeagnus: Y(0.8, 3), morus: Y(1, 5), diospyros: Y(1, 5), asimina: Y(0.8, 6), crataegus: Y(0.5, 5), 'rosa canina': Y(0.5, 3),
  'rosa rugosa': Y(0.5, 3), lycium: Y(0.8, 3), schisandra: Y(0.5, 4), akebia: Y(0.5, 4), punica: Y(1, 4), eriobotrya: Y(1, 5),
  ziziphus: Y(0.8, 4), shepherdia: Y(0.6, 4), 'berberis vulgaris': Y(0.3, 3), fragaria: Y(0.6, 1),
};
/** Fallback for other fruiting woody plants. */
const GENERIC: YieldSpec = Y(0.6, 4);

const words = (latin: string) => latin.trim().toLowerCase().split(/\s+/);
export function yieldSpecOf(p: Pick<PlantData, 'latinName' | 'eatable' | 'fruitMonths'>, layer = 'tree'): { spec: YieldSpec; generic: boolean } | null {
  const w = words(p.latinName);
  const hit = YIELD_TABLE[w.slice(0, 2).join(' ')] ?? YIELD_TABLE[w[0]];
  if (hit) return { spec: hit, generic: false };
  const fruits = p.eatable && (p.fruitMonths ?? []).some(Boolean) && (layer === 'tree' || layer === 'shrub' || layer === 'climber');
  return fruits ? { spec: GENERIC, generic: true } : null;
}

/** kg per plant and year at `years` after planting. */
export function plantYieldKg(p: PlantData, years: number): number {
  const s = yieldSpecOf(p, deriveLayer(p));
  if (!s || years < s.spec.startYear) return 0;
  const ramp = Math.min(1, (years - s.spec.startYear + 1) / 3);
  const r = displayRadiusM(p, years);
  return s.spec.kgPerM2 * Math.PI * r * r * ramp;
}

export interface YieldRow { plantId: string; count: number; kgEach: number; kgTotal: number; generic: boolean; startYear: number; product: YieldSpec['product']; }

export function planYield(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number): { rows: YieldRow[]; totalKg: number } {
  const counts = new Map<string, number>();
  for (const pl of plan.placements) counts.set(pl.plantId, (counts.get(pl.plantId) ?? 0) + 1);
  const rows: YieldRow[] = [];
  for (const [plantId, count] of counts) {
    const p = plantsById.get(plantId);
    if (!p) continue;
    const s = yieldSpecOf(p, deriveLayer(p));
    if (!s) continue;
    const kgEach = plantYieldKg(p, years);
    rows.push({ plantId, count, kgEach, kgTotal: kgEach * count, generic: s.generic, startYear: s.spec.startYear, product: s.spec.product });
  }
  rows.sort((a, b) => b.kgTotal - a.kgTotal);
  return { rows, totalKg: rows.reduce((s, r) => s + r.kgTotal, 0) };
}

// ── Care calendar (iCal) ────────────────────────────────────────────────

export interface CareTask { title: string; month: number; endMonth?: number; detail: string; }

const POME = ['malus', 'pyrus', 'cydonia', 'mespilus'];
/** Month runs (0-based, inclusive) of a 12-month boolean array; Dec→Jan wraps not merged. */
export function monthRuns(m: boolean[]): [number, number][] {
  const runs: [number, number][] = [];
  for (let i = 0; i < 12; i++) {
    if (!m[i]) continue;
    if (runs.length && runs[runs.length - 1][1] === i - 1) runs[runs.length - 1][1] = i;
    else runs.push([i, i]);
  }
  return runs;
}

/** Care tasks for one species; `t` gives the texts (de/en). */
export function careTasks(p: PlantData, name: string, t: (key: string, vars?: Record<string, string | number>) => string): CareTask[] {
  const out: CareTask[] = [];
  const w = words(p.latinName);
  const layer = deriveLayer(p);
  for (const [a, b] of monthRuns(p.fruitMonths ?? [])) {
    if (p.eatable) out.push({ title: t('careHarvest', { name }), month: a, endMonth: b, detail: t('careHarvestDetail') });
  }
  const lastFruit = (p.fruitMonths ?? []).lastIndexOf(true);
  if (POME.includes(w[0])) out.push({ title: t('careWinterPrune', { name }), month: 1, detail: t('careWinterPruneDetail') });
  else if (w[0] === 'prunus') out.push({ title: t('careSummerPrune', { name }), month: lastFruit >= 0 ? Math.min(8, lastFruit + 1) : 7, detail: t('careSummerPruneDetail') });
  else if (w[0] === 'ribes' || w[0] === 'rubus') out.push({ title: t('careBerryPrune', { name }), month: lastFruit >= 0 ? Math.min(10, lastFruit + 1) : 8, detail: t('careBerryPruneDetail') });
  else if (layer === 'tree' || layer === 'shrub') out.push({ title: t('careFormPrune', { name }), month: 2, detail: t('careFormPruneDetail') });
  return out;
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
/** Folds lines at 75 octets as RFC 5545 asks (simple char-based fold). */
const fold = (line: string) => line.length <= 74 ? line : line.match(/.{1,73}/g)!.join('\r\n ');
const ymd = (y: number, m: number, d: number) => `${y}${String(m + 1).padStart(2, '0')}${String(d).padStart(2, '0')}`;

/** Yearly all-day events; a multi-month task spans first day of `month` to the end of `endMonth`. */
export function buildIcs(calName: string, tasks: CareTask[], year: number, uidBase: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Perma Design Kit//Pflegekalender//DE', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEscape(calName)}`];
  tasks.forEach((task, i) => {
    const end = task.endMonth ?? task.month;
    const endDate = end === 11 ? ymd(year + 1, 0, 1) : ymd(year, end + 1, 1);
    lines.push('BEGIN:VEVENT', `UID:${uidBase}-${i}@permadesignkit.org`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(year, task.month, 1)}`,
      // A one-month task is a one-day reminder on the 1st; a run spans the months.
      `DTEND;VALUE=DATE:${task.endMonth != null ? endDate : ymd(year, task.month, 2)}`,
      'RRULE:FREQ=YEARLY', `SUMMARY:${icsEscape(task.title)}`, `DESCRIPTION:${icsEscape(task.detail)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
