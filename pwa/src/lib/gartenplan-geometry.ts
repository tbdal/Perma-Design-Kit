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

/** A grid angle in degrees folded into (−45, 45] — a square grid looks the
 *  same every 90°. Rounded to 0.1°. */
export function normalizeGridAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let a = ((deg % 90) + 90) % 90;  // 0 … <90
  if (a > 45) a -= 90;
  return Math.round(a * 10) / 10 || 0;
}

/** Grid angle that lines the grid up with the longest edge of an outline
 *  (clockwise degrees, plan y pointing down); 0 without an outline. */
export function gridAngleAlongOutline(pts: GardenPlanPoint[]): number {
  let best = 0, bestLen = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const dx = pts[i].xM - pts[j].xM, dy = pts[i].yM - pts[j].yM;
    const len = Math.hypot(dx, dy);
    if (len > bestLen) { bestLen = len; best = Math.atan2(dy, dx) * 180 / Math.PI; }
  }
  return pts.length >= 2 ? normalizeGridAngle(best) : 0;
}

/** Nearest crossing of a grid with `spacingM` turned by `deg` around the plan origin. */
export function nearestGridPoint(pt: GardenPlanPoint, spacingM: number, deg = 0): GardenPlanPoint {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  // into the grid's own frame (turn back by deg), round, turn forward again
  const u = Math.round((pt.xM * c + pt.yM * s) / spacingM) * spacingM;
  const v = Math.round((-pt.xM * s + pt.yM * c) / spacingM) * spacingM;
  return { xM: u * c - v * s, yM: u * s + v * c };
}

/** Closed polygon perimeter in m. */
export function polygonPerimeterM(pts: GardenPlanPoint[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += Math.hypot(pts[i].xM - pts[j].xM, pts[i].yM - pts[j].yM);
  return s;
}

/** Positions every `spacingM` along a polyline, starting at its first point
 *  ("Reihe pflanzen"). The end point is included when the length is a whole
 *  multiple of the spacing (within 1 cm). */
export function pointsAlongPolyline(pts: GardenPlanPoint[], spacingM: number): GardenPlanPoint[] {
  if (pts.length === 0 || !(spacingM > 0)) return [];
  const out: GardenPlanPoint[] = [{ ...pts[0] }];
  let carry = 0; // distance already walked since the last placed point
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM);
    let d = spacingM - carry;
    while (d <= len + 0.01) {
      const f = Math.min(1, d / len);
      out.push({ xM: a.xM + (b.xM - a.xM) * f, yM: a.yM + (b.yM - a.yM) * f });
      d += spacingM;
    }
    carry = len - (d - spacingM);
  }
  return out;
}
