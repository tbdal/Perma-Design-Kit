import type { GardenPlan, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';
import { sunHoursAt, crownOccluder, type Occluder, type SunScene, type SunSample, type SunClass } from './sun-hours';

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
    return [{ pl, layer, r: displayRadiusM(p, years) }];
  });
  const out: CrowdedWarning[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.layer !== b.layer) continue;
      const d = Math.hypot(a.pl.xM - b.pl.xM, a.pl.yM - b.pl.yM);
      const min = (a.r + b.r) * 0.75;
      if (d < min) out.push({ kind: 'crowded', a: a.pl.id, b: b.pl.id, distM: d, minM: min });
    }
  }
  return out.sort((x, y) => x.distM / x.minM - y.distM / y.minM);
}

/** Crowns of all plants at `years` (for the shade check). */
export function grownOccluders(plan: GardenPlan, plantsById: Map<string, PlantData>, groundZ: (x: number, y: number) => number, years = WARN_YEARS): Occluder[] {
  return plan.placements.flatMap(pl => {
    const p = plantsById.get(pl.plantId);
    const o = p ? crownOccluder(pl.id, pl, p, years, groundZ) : null;
    return o ? [o] : [];
  });
}

/** Plants whose stated light need won't be met (own crown excluded). Plants
 *  that also tolerate less light (sunFull + sunMid …) count by their most
 *  modest need. */
export function shadeWarnings(plan: GardenPlan, plantsById: Map<string, PlantData>, scene: SunScene, samples: SunSample[]): ShadeWarning[] {
  const out: ShadeWarning[] = [];
  for (const pl of plan.placements) {
    const p = plantsById.get(pl.plantId);
    if (!p || p.sunShadow) continue;            // copes with shade
    const need: SunClass | null = p.sunMid ? 'mid' : p.sunFull ? 'full' : null;
    if (!need) continue;                        // no light data
    const hours = sunHoursAt(pl.xM, pl.yM, scene, samples, pl.id);
    if (hours < (need === 'full' ? 6 : 3)) out.push({ kind: 'shade', id: pl.id, hours, need });
  }
  return out.sort((a, b) => a.hours - b.hours);
}
