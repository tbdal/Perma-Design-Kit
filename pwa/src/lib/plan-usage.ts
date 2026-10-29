// Where each plant stands: read from the garden plans, never stored on the
// plant (the plan is the only source for place and count). Shown as plan chips
// on the plants page, in the "Plan" filter and on polycultures.
import type { GardenPlan, PlantData } from './types';
import { deriveLayer } from './plant-layer';

export interface PlanUse { planId: string; name: string; count: number; planted: number }

/** plantId → the plans it is placed in (count, of those really planted), plans in list order. */
export function planUsage(plans: GardenPlan[]): Map<string, PlanUse[]> {
  const out = new Map<string, PlanUse[]>();
  for (const plan of plans) {
    const here = new Map<string, PlanUse>();
    for (const pl of plan.placements) {
      let u = here.get(pl.plantId);
      if (!u) { u = { planId: plan.id, name: plan.name, count: 0, planted: 0 }; here.set(pl.plantId, u); }
      u.count++;
      if (pl.plantedYear) u.planted++;
    }
    for (const [id, u] of here) out.set(id, [...(out.get(id) ?? []), u]);
  }
  return out;
}

/** polycultureId → plans it was placed in as a package, with how many packages. */
export function polycultureUsage(plans: GardenPlan[]): Map<string, { planId: string; name: string; packages: number }[]> {
  const out = new Map<string, { planId: string; name: string; packages: number }[]>();
  for (const plan of plans) {
    const pkgs = new Map<string, Set<string>>();
    for (const pl of plan.placements) {
      if (!pl.polycultureId || !pl.packageId) continue;
      pkgs.set(pl.polycultureId, (pkgs.get(pl.polycultureId) ?? new Set()).add(pl.packageId));
    }
    for (const [pcId, set] of pkgs) out.set(pcId, [...(out.get(pcId) ?? []), { planId: plan.id, name: plan.name, packages: set.size }]);
  }
  return out;
}

export type HabitGroup = 'tree' | 'shrub' | 'herb' | 'other';
export const HABIT_GROUPS: HabitGroup[] = ['tree', 'shrub', 'herb', 'other'];
/** Growth-form group for the "Plan" filter (layer as on the plan, also derived from the height); climbers and roots share the last one. */
export const habitGroup = (p: Pick<PlantData, 'habit' | 'heightM' | 'groundCover'>): HabitGroup => {
  const l = deriveLayer(p);
  return l === 'tree' || l === 'shrub' || l === 'herb' ? l : 'other';
};

/** The plants of one plan split into in / not in it, and the placed plant ids missing from the list. */
export function splitByPlan(plants: PlantData[], plan: GardenPlan): { inPlan: PlantData[]; notInPlan: PlantData[]; missing: { plantId: string; count: number }[] } {
  const counts = new Map<string, number>();
  for (const pl of plan.placements) counts.set(pl.plantId, (counts.get(pl.plantId) ?? 0) + 1);
  const known = new Set(plants.map(p => p.id));
  return {
    inPlan: plants.filter(p => counts.has(p.id)),
    notInPlan: plants.filter(p => !counts.has(p.id)),
    missing: [...counts].filter(([id]) => !known.has(id)).map(([plantId, count]) => ({ plantId, count })),
  };
}
