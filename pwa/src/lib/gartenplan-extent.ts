import type { GardenPlan } from './types';
import { planToLatLon } from './gartenplan-geo';

// Lets the plan grow when something is dragged past its edge (boundary or
// area corner, plant): the rectangle is extended in whole grid cells plus a
// margin, every coordinate is shifted so 0,0 stays the top-left corner, and
// the map anchor moves along — the map background therefore stays put.

/** Grows `plan` in place so every boundary/area vertex and placement lies
 *  inside it. Returns the shift applied to all coordinates (in meters), or
 *  null if everything already fit. */
export function growPlanToFit(plan: GardenPlan, marginM = 1): { dx: number; dy: number } | null {
  const pts = [
    ...plan.boundary,
    ...(plan.areas ?? []).flatMap(a => a.points),
    ...plan.placements.map(p => ({ xM: p.xM, yM: p.yM })),
  ];
  if (pts.length === 0) return null;
  const minX = Math.min(...pts.map(p => p.xM)), maxX = Math.max(...pts.map(p => p.xM));
  const minY = Math.min(...pts.map(p => p.yM)), maxY = Math.max(...pts.map(p => p.yM));
  const w = plan.areaWidthM, h = plan.areaHeightM;
  if (minX >= 0 && minY >= 0 && maxX <= w && maxY <= h) return null;

  const s = plan.gridSpacingM || 1;
  const newMinX = minX < 0 ? Math.floor((minX - marginM) / s) * s : 0;
  const newMinY = minY < 0 ? Math.floor((minY - marginM) / s) * s : 0;
  const newMaxX = maxX > w ? Math.ceil((maxX + marginM) / s) * s : w;
  const newMaxY = maxY > h ? Math.ceil((maxY + marginM) / s) * s : h;
  const dx = newMinX ? -newMinX : 0, dy = newMinY ? -newMinY : 0; // no -0

  if (plan.geo && (dx || dy)) {
    const o = planToLatLon({ xM: newMinX, yM: newMinY }, plan.geo);
    plan.geo = { ...plan.geo, lat: o.lat, lon: o.lon };
  }
  const shift = (p: { xM: number; yM: number }) => { p.xM += dx; p.yM += dy; };
  plan.boundary.forEach(shift);
  (plan.areas ?? []).forEach(a => a.points.forEach(shift));
  plan.placements.forEach(shift);
  plan.areaWidthM = newMaxX - newMinX;
  plan.areaHeightM = newMaxY - newMinY;
  return { dx, dy };
}
