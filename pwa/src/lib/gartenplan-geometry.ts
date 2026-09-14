import type { GardenPlanPoint } from './types';

/** Ray-casting point-in-polygon test, coordinates in meters. Shared by the
 *  2D SVG editor and the 3D scene — geometry-agnostic (xM/yM only), works
 *  unchanged whether the caller maps yM to a screen y or a 3D z. */
export function pointInPolygon(pt: GardenPlanPoint, poly: GardenPlanPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].xM, yi = poly[i].yM;
    const xj = poly[j].xM, yj = poly[j].yM;
    const intersect = (yi > pt.yM) !== (yj > pt.yM)
      && pt.xM < (xj - xi) * (pt.yM - yi) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
