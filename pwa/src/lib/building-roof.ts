import type { GardenPlanPoint } from './types';

// Roofs of OSM buildings: shape from `roof:shape`, or a guessed gable for
// houses without one. Geometry is built in plan metres (x right, y down) with
// heights above the top of the walls, so the 3D view and the sun model see
// the same roof. Pure functions — the caller adds ground and wall heights.

export type RoofShape = 'flat' | 'gabled' | 'hipped' | 'pyramidal' | 'skillion';

export interface Roof {
  shape: RoofShape;
  /** Height of the roof above the walls (m). */
  heightM: number;
  /** No roof:shape in OSM — guessed from the building type. */
  estimated?: boolean;
  /** roof:orientation=across: ridge across the long side. */
  across?: boolean;
  /** Skillion: compass direction the roof slopes down to (roof:direction). */
  directionDeg?: number;
}

/** Oriented bounding box of minimal area; `ux/uy` points along the long side. */
export interface OrientedBox { cx: number; cy: number; ux: number; uy: number; halfL: number; halfW: number; }

export function orientedBox(pts: GardenPlanPoint[]): OrientedBox {
  let best: OrientedBox | null = null, bestArea = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.xM - a.xM, b.yM - a.yM);
    if (len < 1e-6) continue;
    const ux = (b.xM - a.xM) / len, uy = (b.yM - a.yM) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of pts) {
      const u = p.xM * ux + p.yM * uy, v = -p.xM * uy + p.yM * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const cx = cu * ux - cv * uy, cy = cu * uy + cv * ux;
      const hu = (maxU - minU) / 2, hv = (maxV - minV) / 2;
      best = hu >= hv
        ? { cx, cy, ux, uy, halfL: hu, halfW: hv }
        : { cx, cy, ux: -uy, uy: ux, halfL: hv, halfW: hu };
    }
  }
  return best ?? { cx: pts[0]?.xM ?? 0, cy: pts[0]?.yM ?? 0, ux: 1, uy: 0, halfL: 0, halfW: 0 };
}

const DEG = Math.PI / 180;
const DEFAULT_PITCH: Record<RoofShape, number> = { flat: 0, gabled: 40, hipped: 35, pyramidal: 35, skillion: 15 };

/** Roof height from the pitch and the box: the slope runs over half the
 *  short side (gabled/hipped/pyramidal) or the whole of it (skillion). */
export function roofHeightFromPitch(shape: RoofShape, box: OrientedBox, pitchDeg = DEFAULT_PITCH[shape], across = false): number {
  if (shape === 'flat') return 0;
  const run = shape === 'skillion' ? 2 * box.halfW : across ? box.halfL : box.halfW;
  return Math.max(0, run * Math.tan(pitchDeg * DEG));
}

/** Ridge frame: `ax/ay` along the ridge, half-widths across (w) and along (l) it. */
function ridgeFrame(box: OrientedBox, across?: boolean) {
  return across
    ? { ax: -box.uy, ay: box.ux, halfAlong: box.halfW, halfAcross: box.halfL }
    : { ax: box.ux, ay: box.uy, halfAlong: box.halfL, halfAcross: box.halfW };
}

/** Height of the roof surface above the walls at a plan point. */
export function roofHeightAt(roof: Roof, box: OrientedBox, x: number, y: number): number {
  if (roof.shape === 'flat' || roof.heightM <= 0) return 0;
  const dx = x - box.cx, dy = y - box.cy;
  if (roof.shape === 'skillion') {
    // high side opposite the direction the roof faces; plan y points south
    const d = roof.directionDeg ?? null;
    const sx = d == null ? -box.uy : Math.sin(d * DEG), sy = d == null ? box.ux : -Math.cos(d * DEG);
    let lo = Infinity, hi = -Infinity;
    for (const [px, py] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const cxp = px * box.halfL * box.ux - py * box.halfW * box.uy, cyp = px * box.halfL * box.uy + py * box.halfW * box.ux;
      const s = cxp * sx + cyp * sy;
      lo = Math.min(lo, s); hi = Math.max(hi, s);
    }
    const s = dx * sx + dy * sy;
    return hi > lo ? roof.heightM * Math.min(1, Math.max(0, (hi - s) / (hi - lo))) : 0;
  }
  const f = ridgeFrame(box, roof.across);
  const along = Math.abs(dx * f.ax + dy * f.ay), acrossD = Math.abs(-dx * f.ay + dy * f.ax);
  if (f.halfAcross <= 0) return 0;
  const slope = roof.heightM / f.halfAcross;
  let h = roof.heightM - acrossD * slope;                            // gable
  if (roof.shape === 'hipped') h = Math.min(h, (f.halfAlong - along) * slope);
  if (roof.shape === 'pyramidal') h = Math.min(h, roof.heightM - along * roof.heightM / Math.max(1e-6, f.halfAlong));
  return Math.max(0, Math.min(roof.heightM, h));
}

/** Clips a polygon to one side of the line through (px,py) with normal (nx,ny). */
function clipHalf(poly: GardenPlanPoint[], px: number, py: number, nx: number, ny: number): GardenPlanPoint[] {
  const out: GardenPlanPoint[] = [];
  const side = (p: GardenPlanPoint) => (p.xM - px) * nx + (p.yM - py) * ny;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ xM: a.xM + (b.xM - a.xM) * t, yM: a.yM + (b.yM - a.yM) * t });
    }
  }
  return out;
}

/** Footprint ring with the points inserted where edges cross a roof break
 *  line (ridge), so walls can follow the roof edge up to the gable. */
export function ringWithBreaks(pts: GardenPlanPoint[], roof: Roof, box: OrientedBox): GardenPlanPoint[] {
  if (roof.shape !== 'gabled' && roof.shape !== 'hipped') return pts;
  const f = ridgeFrame(box, roof.across);
  const nx = -f.ay, ny = f.ax;
  const out: GardenPlanPoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    out.push(a);
    const sa = (a.xM - box.cx) * nx + (a.yM - box.cy) * ny, sb = (b.xM - box.cx) * nx + (b.yM - box.cy) * ny;
    if (sa * sb < 0) {
      const t = sa / (sa - sb);
      out.push({ xM: a.xM + (b.xM - a.xM) * t, yM: a.yM + (b.yM - a.yM) * t });
    }
  }
  return out;
}

/** Planar roof faces as polygons in plan metres (heights via roofHeightAt).
 *  Gabled: the footprint split along the ridge. Hipped and pyramidal: built
 *  on the oriented box — exact for the usual rectangular house; a gabled or
 *  flat roof stands in for footprints that are far from a rectangle. */
export function roofFaces(pts: GardenPlanPoint[], roof: Roof, box: OrientedBox): GardenPlanPoint[][] {
  if (roof.shape === 'flat' || roof.heightM <= 0 || roof.shape === 'skillion') return [pts];
  const f = ridgeFrame(box, roof.across);
  const nx = -f.ay, ny = f.ax;
  if (roof.shape === 'gabled') {
    return [clipHalf(pts, box.cx, box.cy, nx, ny), clipHalf(pts, box.cx, box.cy, -nx, -ny)].filter(p => p.length >= 3);
  }
  const P = (al: number, ac: number): GardenPlanPoint => ({ xM: box.cx + al * f.ax + ac * nx, yM: box.cy + al * f.ay + ac * ny });
  const L = f.halfAlong, W = f.halfAcross;
  if (roof.shape === 'pyramidal') {
    const apex = P(0, 0), c = [P(-L, -W), P(L, -W), P(L, W), P(-L, W)];
    return c.map((p, i) => [p, c[(i + 1) % 4], apex]);
  }
  // hipped: ridge of length 2(L − W) (a pyramid when the box is square)
  const r = Math.max(0, L - W);
  const r1 = P(-r, 0), r2 = P(r, 0);
  return [
    [P(-L, -W), P(L, -W), r2, r1],
    [P(L, W), P(-L, W), r1, r2],
    [P(L, -W), P(L, W), r2],
    [P(-L, W), P(-L, -W), r1],
  ];
}

/** Is the footprint close enough to its box for a box-based roof? */
export function nearlyRectangular(pts: GardenPlanPoint[], box: OrientedBox): boolean {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].xM + pts[i].xM) * (pts[j].yM - pts[i].yM);
  return Math.abs(a / 2) >= 0.85 * 4 * box.halfL * box.halfW;
}
