import type { GardenPlan } from './types';
import { polygonAreaM2 } from './gartenplan-geometry';

// Sorting of the project list on the Waldgartenplan page.

export type PlanSortField = 'created' | 'updated' | 'name' | 'area' | 'plants';
export type SortDir = 'asc' | 'desc';
export const PLAN_SORT_FIELDS: PlanSortField[] = ['created', 'updated', 'name', 'area', 'plants'];

/** Natural direction when a field is picked: newest/largest first, names A–Z. */
export function defaultDir(field: PlanSortField): SortDir {
  return field === 'name' ? 'asc' : 'desc';
}

/** Garden area in m²: the drawn outline, else the plan rectangle. */
export function planAreaM2(p: Pick<GardenPlan, 'boundary' | 'areaWidthM' | 'areaHeightM'>): number {
  return p.boundary.length >= 3 ? polygonAreaM2(p.boundary) : p.areaWidthM * p.areaHeightM;
}

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0);

export function sortPlans(plans: GardenPlan[], field: PlanSortField, dir: SortDir, lang = 'de'): GardenPlan[] {
  const key = (p: GardenPlan): number | string => {
    switch (field) {
      case 'created': return time(p.createdAt);
      case 'updated': return time(p.updatedAt || p.createdAt);
      case 'area': return planAreaM2(p);
      case 'plants': return p.placements.length;
      case 'name': return (p.name || '').trim();
    }
  };
  const sign = dir === 'asc' ? 1 : -1;
  return [...plans].sort((a, b) => {
    const ka = key(a), kb = key(b);
    // unnamed plans last in either direction
    if (field === 'name' && (!ka || !kb) && ka !== kb) return ka ? -1 : 1;
    const c = typeof ka === 'string' ? ka.localeCompare(kb as string, lang, { numeric: true, sensitivity: 'base' }) : ka - (kb as number);
    // ties: newest first, stable
    return c !== 0 ? c * sign : time(b.createdAt) - time(a.createdAt);
  });
}
