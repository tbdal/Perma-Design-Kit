import type { GardenPlan, GardenPlanPoint, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { pointInPolygon } from './gartenplan-geometry';
import { compatScore } from './compat';
import type { SunClass } from './sun-hours';
import { ageAt, isPlanted } from './phases';

// "Funktions-Abdeckung": where in the garden are the ecological functions
// (nitrogen, minerals, insects, pest control, ground cover, wildlife, wind)
// already provided by a nearby plant, and where are they missing? Each
// placed plant covers its functions within an influence radius that depends
// on the function and the plant's current size. Rules of thumb, not science:
// N-fixers and accumulators feed the soil around their roots (≈ drip line),
// insectary plants draw beneficials over several metres, ground cover only
// covers itself, a windbreak shelters a few times its height.

export const COVER_FUNCS = ['nitrogenFix', 'mineralFix', 'insects', 'pest', 'groundCover', 'animalProtection', 'windBreaking'] as const;
export type CoverFunc = typeof COVER_FUNCS[number];

export function influenceRadius(fn: CoverFunc, canopyR: number, heightM: number): number {
  switch (fn) {
    case 'nitrogenFix': return Math.max(2, canopyR * 1.5);
    case 'mineralFix': return Math.max(1.5, canopyR * 1.5);
    case 'insects': return Math.max(6, canopyR * 3);
    case 'pest': return Math.max(3, canopyR * 2);
    case 'groundCover': return Math.max(0.3, canopyR);
    case 'animalProtection': return Math.max(4, canopyR * 2);
    case 'windBreaking': return Math.max(4, heightM * 3);
  }
}

export interface CoverageCell { xM: number; yM: number; mask: number; }
export interface CoverageGrid { cellM: number; cells: CoverageCell[]; }

const bit = (fn: CoverFunc) => 1 << COVER_FUNCS.indexOf(fn);
export const hasFunc = (mask: number, fn: CoverFunc) => (mask & bit(fn)) !== 0;
export const funcCount = (mask: number) => COVER_FUNCS.reduce((n, f) => n + (hasFunc(mask, f) ? 1 : 0), 0);

/** Coverage on a grid of cell centres inside the garden outline. */
export function coverageGrid(plan: GardenPlan, plantsById: Map<string, PlantData>, cellM: number): CoverageGrid {
  const sources = plan.placements.flatMap(pl => {
    const p = plantsById.get(pl.plantId);
    if (!p || !isPlanted(pl, plan.yearsSincePlanting)) return [];
    const r = displayRadiusM(p, ageAt(pl, plan.yearsSincePlanting));
    const h = p.heightM && p.widthM ? p.heightM * Math.min(1, r / (p.widthM / 2)) : r * 2;
    return COVER_FUNCS.filter(f => Boolean(p[f])).map(f => ({ x: pl.xM, y: pl.yM, r: influenceRadius(f, r, h), b: bit(f) }));
  });
  const cells: CoverageCell[] = [];
  const outline = plan.boundary.length >= 3 ? plan.boundary : null;
  for (let y = cellM / 2; y < plan.areaHeightM; y += cellM) {
    for (let x = cellM / 2; x < plan.areaWidthM; x += cellM) {
      if (outline && !pointInPolygon({ xM: x, yM: y }, outline)) continue;
      let mask = 0;
      for (const s of sources) if (!(mask & s.b) && (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r) mask |= s.b;
      cells.push({ xM: x, yM: y, mask });
    }
  }
  return { cellM, cells };
}

/** Share (0..1) of the garden area covered, per function. */
export function coverageSummary(g: CoverageGrid): Record<CoverFunc, number> {
  const out = {} as Record<CoverFunc, number>;
  for (const f of COVER_FUNCS) out[f] = g.cells.length ? g.cells.filter(c => hasFunc(c.mask, f)).length / g.cells.length : 0;
  return out;
}

export interface Gap { xM: number; yM: number; areaM2: number; }

/** Up to `max` spots where `fn` is missing, each the uncovered cell farthest
 *  from any coverage (and from earlier picks); areaM2 = uncovered cells
 *  closest to that spot. Gaps under 1 m² are ignored. */
export function findGaps(g: CoverageGrid, fn: CoverFunc, max = 3): Gap[] {
  const uncovered = g.cells.filter(c => !hasFunc(c.mask, fn));
  const covered = g.cells.filter(c => hasFunc(c.mask, fn));
  if (!uncovered.length) return [];
  const dist = uncovered.map(u => covered.length
    ? Math.min(...covered.map(c => (c.xM - u.xM) ** 2 + (c.yM - u.yM) ** 2))
    : Infinity);
  const picks: CoverageCell[] = [];
  for (let k = 0; k < max; k++) {
    let best = -1, bestD = -1;
    uncovered.forEach((u, i) => {
      const dPick = picks.length ? Math.min(...picks.map(p => (p.xM - u.xM) ** 2 + (p.yM - u.yM) ** 2)) : Infinity;
      const d = Math.min(dist[i], dPick);
      if (d > bestD) { bestD = d; best = i; }
    });
    if (best < 0 || (picks.length && bestD < (g.cellM * 3) ** 2)) break;
    picks.push(uncovered[best]);
  }
  const counts = picks.map(() => 0);
  for (const u of uncovered) {
    let bi = 0, bd = Infinity;
    picks.forEach((p, i) => { const d = (p.xM - u.xM) ** 2 + (p.yM - u.yM) ** 2; if (d < bd) { bd = d; bi = i; } });
    counts[bi]++;
  }
  return picks.map((p, i) => ({ xM: p.xM, yM: p.yM, areaM2: counts[i] * g.cellM * g.cellM }))
    .filter(gp => gp.areaM2 >= 1)
    .sort((a, b) => b.areaM2 - a.areaM2);
}

/** Plants from the collection that provide `fn`, best first: compatible
 *  (sun/water/pH) with the plants already growing near the spot, small
 *  enough for the gap, and not yet over-represented in the plan. */
export function suggestPlants(fn: CoverFunc, collection: PlantData[], plan: GardenPlan, plantsById: Map<string, PlantData>, at: GardenPlanPoint, gapAreaM2: number, max = 3, sun?: SunClass): PlantData[] {
  const sunKey = sun === 'full' ? 'sunFull' : sun === 'mid' ? 'sunMid' : sun === 'shadow' ? 'sunShadow' : null;
  const near = plan.placements
    .filter(pl => (pl.xM - at.xM) ** 2 + (pl.yM - at.yM) ** 2 <= 64)
    .map(pl => plantsById.get(pl.plantId))
    .filter((p): p is PlantData => !!p);
  const used = new Map<string, number>();
  for (const pl of plan.placements) used.set(pl.plantId, (used.get(pl.plantId) ?? 0) + 1);
  const gapR = Math.sqrt(gapAreaM2 / Math.PI);
  return collection
    .filter(p => Boolean(p[fn]))
    .map(p => {
      const compat = near.length ? near.reduce((s, n) => s + compatScore(p, n), 0) / near.length : 3;
      const fits = !p.widthM || p.widthM / 2 <= gapR * 1.5 ? 1 : 0;
      // Light at the spot (sun-hours.ts): plants that want it score up,
      // plants that state other needs down; no sun data → neutral.
      const hasSun = p.sunFull || p.sunMid || p.sunShadow;
      const light = sunKey && hasSun ? (p[sunKey] ? 1.5 : -1.5) : 0;
      const score = compat + fits + light - Math.min(2, (used.get(p.id) ?? 0) * 0.3);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || a.p.latinName.localeCompare(b.p.latinName))
    .slice(0, max)
    .map(x => x.p);
}
