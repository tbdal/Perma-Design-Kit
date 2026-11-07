import type { GardenPlan, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';
import { sunHoursAt, crownOccluder, type Occluder, type SunScene, type SunSample, type SunClass } from './sun-hours';
import { ageAt, isAlive, isPlanted } from './phases';
import { xIndex } from './neighbors';

// Hints for the garden plan, looking ahead to (nearly) full-grown plants:
//   – "crowded": two plants of the same layer (tree/tree, shrub/shrub …)
//     whose crowns will overlap a lot. Different layers stacking is what a
//     guild is meant to do, so that is never flagged.
//   – "shade": a plant that wants full sun (or part shade) whose spot will get
//     less than 6 h (3 h) of direct sun once the others have grown.

export const WARN_YEARS = 30;

export interface CrowdedWarning { kind: 'crowded'; a: string; b: string; distM: number; minM: number; }
export interface ShadeWarning { kind: 'shade'; id: string; hours: number; need: SunClass; }
export type PlanWarning = CrowdedWarning | ShadeWarning;

/** Same-layer pairs closer than 75 % of the sum of their full-grown radii. */
export function crowdingWarnings(plan: GardenPlan, plantsById: Map<string, PlantData>, years = WARN_YEARS): CrowdedWarning[] {
  const items = plan.placements.flatMap(pl => {
    const p = plantsById.get(pl.plantId);
    if (!p) return [];
    const layer = deriveLayer(p);
    if (layer === 'rhizo' || layer === 'climber') return [];
    return [{ pl, layer, r: displayRadiusM(p, Math.max(0, ageAt(pl, years))) }];
  });
  const out: CrowdedWarning[] = [];
  const near = xIndex(items);
  const maxR = Math.max(0, ...items.map(x => x.r));
  for (let i = 0; i < items.length; i++) {
    for (const j of near(items[i].pl.xM, (items[i].r + maxR) * 0.75)) {
      if (j <= i) continue;
      const a = items[i], b = items[j];
      if (a.layer !== b.layer) continue;
      const d = Math.hypot(a.pl.xM - b.pl.xM, a.pl.yM - b.pl.yM);
      const min = (a.r + b.r) * 0.75;
      if (d < min) out.push({ kind: 'crowded', a: a.pl.id, b: b.pl.id, distM: d, minM: min });
    }
  }
  return out.sort((x, y) => x.distM / x.minM - y.distM / y.minM);
}

/** Sun hours kept between runs of the hints: after an edit only the plants near what changed are counted
 *  again (a shadow reaches about four times the height of what casts it). `env` = everything else the sun
 *  depends on (terrain, buildings, plugins' shade, sun dates, plant data); when it changes, all count again. */
export interface ShadeCache { env: string; keys: Map<string, string>; hours: Map<string, number>; pos: Map<string, [number, number]> }
export const newShadeCache = (): ShadeCache => ({ env: '', keys: new Map(), hours: new Map(), pos: new Map() });
const placementKey = (pl: GardenPlan['placements'][number]) => `${pl.plantId}|${pl.xM}|${pl.yM}|${pl.phaseYear ?? 0}|${pl.diedYear ?? ''}`;

/** Which placements may keep their counted hours: a function id → hours or undefined (count again). Updates the cache's keys. */
function shadeReuse(plan: GardenPlan, plantsById: Map<string, PlantData>, cache: ShadeCache, env: string): (id: string) => number | undefined {
  const full = cache.env !== env;
  const dirty: [number, number][] = [];
  const seen = new Set<string>();
  for (const pl of plan.placements) {
    seen.add(pl.id);
    const k = placementKey(pl);
    if (cache.keys.get(pl.id) !== k) {
      const old = cache.pos.get(pl.id);
      if (old) dirty.push(old);
      dirty.push([pl.xM, pl.yM]);
      cache.keys.set(pl.id, k);
      cache.pos.set(pl.id, [pl.xM, pl.yM]);
      cache.hours.delete(pl.id);
    }
  }
  for (const id of [...cache.keys.keys()]) if (!seen.has(id)) { dirty.push(cache.pos.get(id)!); cache.keys.delete(id); cache.pos.delete(id); cache.hours.delete(id); }
  cache.env = env;
  if (full) { cache.hours.clear(); return () => undefined; }
  const tallest = Math.max(0, ...plan.placements.map(pl => plantsById.get(pl.plantId)?.heightM ?? 0));
  const reach = Math.min(250, Math.max(30, tallest * 4));
  return (id: string) => {
    const h = cache.hours.get(id);
    if (h === undefined) return undefined;
    const [x, y] = cache.pos.get(id)!;
    return dirty.some(([dx, dy]) => Math.abs(dx - x) <= reach && Math.abs(dy - y) <= reach && Math.hypot(dx - x, dy - y) <= reach) ? undefined : h;
  };
}

/** Crowns of all plants at `years` (for the shade check). */
export function grownOccluders(plan: GardenPlan, plantsById: Map<string, PlantData>, groundZ: (x: number, y: number) => number, years = WARN_YEARS): Occluder[] {
  return plan.placements.flatMap(pl => {
    const p = plantsById.get(pl.plantId);
    // a dead plant (#190) casts no shade from its year on
    const o = p && isPlanted(pl, years) && isAlive(pl, years, plan.startYear) ? crownOccluder(pl.id, pl, p, ageAt(pl, years), groundZ) : null;
    return o ? [o] : [];
  });
}

/** Plants whose stated light need won't be met (own crown excluded). Plants
 *  that also tolerate less light (sunFull + sunMid …) count by their most
 *  modest need. */
export function shadeWarnings(plan: GardenPlan, plantsById: Map<string, PlantData>, scene: SunScene, samples: SunSample[], cache?: ShadeCache, env = ''): ShadeWarning[] {
  const out: ShadeWarning[] = [];
  const reuse = cache ? shadeReuse(plan, plantsById, cache, env) : null;
  for (const pl of plan.placements) {
    const p = plantsById.get(pl.plantId);
    if (!p || p.sunShadow) continue;            // copes with shade
    const need: SunClass | null = p.sunMid ? 'mid' : p.sunFull ? 'full' : null;
    if (!need) continue;                        // no light data
    const kept = reuse?.(pl.id);
    const hours = kept ?? sunHoursAt(pl.xM, pl.yM, scene, samples, pl.id);
    cache?.hours.set(pl.id, hours);
    if (hours < (need === 'full' ? 6 : 3)) out.push({ kind: 'shade', id: pl.id, hours, need });
  }
  return out.sort((a, b) => a.hours - b.hours);
}
