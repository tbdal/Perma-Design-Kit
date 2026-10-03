import type { GardenPlanPoint } from './types';
import type { Lang } from './i18n/core';

/** "3,25 m" (de) / "3.25 m" (en) — cursor read-out on the plan canvas. */
export function formatMeters(v: number, lang: Lang): string {
  const s = (Math.round(v * 100) / 100).toFixed(2);
  return `${lang === 'de' ? s.replace('.', ',') : s} m`;
}

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

/** Polygon area in m² (shoelace formula; vertex order doesn't matter). */
export function polygonAreaM2(pts: GardenPlanPoint[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].xM * pts[i].yM - pts[i].xM * pts[j].yM;
  return Math.abs(a) / 2;
}

/** Closed polygon perimeter in m. */
export function polygonPerimeterM(pts: GardenPlanPoint[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += Math.hypot(pts[i].xM - pts[j].xM, pts[i].yM - pts[j].yM);
  return s;
}
