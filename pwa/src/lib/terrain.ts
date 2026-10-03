import type { GardenPlanGeo } from './types';
import { planToLatLon, type PlanRect } from './gartenplan-geo';

// Terrain for the garden plan: elevation from the open "Terrain Tiles" on AWS
// (Mapzen/Tilezen, terrarium PNG encoding; sources per tile — SRTM, EU-DEM,
// national models …). A regular grid of heights in plan meters is sampled
// once per plan and drives the 3D ground, contour lines and the slope /
// aspect read-out. Data is coarse (≈ 3–30 m), so it shows the lie of the
// land — slope and exposure — not individual bumps.

export const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
export const TERRAIN_ATTRIBUTION = 'Höhen: Terrain Tiles (Mapzen/AWS)';
const TERRAIN_MAX_ZOOM = 15;

/** Terrarium encoding → meters above sea level. */
export function terrariumElevation(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

export interface ElevationGrid {
  minX: number; minY: number;  // plan meters of sample [0,0]
  cellM: number;
  nx: number; ny: number;      // samples per row / column
  heights: Float32Array;       // row-major, ny rows of nx values
  sources: string[];
}

/** Bilinear height at a plan point; clamped at the grid edge. */
export function sampleGrid(g: ElevationGrid, xM: number, yM: number): number {
  const fx = Math.min(g.nx - 1, Math.max(0, (xM - g.minX) / g.cellM));
  const fy = Math.min(g.ny - 1, Math.max(0, (yM - g.minY) / g.cellM));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(g.nx - 1, x0 + 1), y1 = Math.min(g.ny - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const h = (x: number, y: number) => g.heights[y * g.nx + x];
  return (h(x0, y0) * (1 - tx) + h(x1, y0) * tx) * (1 - ty) + (h(x0, y1) * (1 - tx) + h(x1, y1) * tx) * ty;
}

export interface SlopeInfo {
  meanM: number; minM: number; maxM: number;
  slopeDeg: number;           // inclination of the best-fit plane
  aspectDeg: number | null;   // compass bearing the slope faces (downhill), null if ~flat
}

/** Best-fit plane (least squares) through all grid samples accepted by
 *  `inside` (e.g. the garden outline): mean/min/max height, slope, aspect.
 *  `rotationDeg` converts plan directions to compass bearings. */
export function slopeInfo(g: ElevationGrid, inside: (xM: number, yM: number) => boolean, rotationDeg = 0): SlopeInfo | null {
  let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, min = Infinity, max = -Infinity;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const x = g.minX + i * g.cellM, y = g.minY + j * g.cellM;
    if (!inside(x, y)) continue;
    const z = g.heights[j * g.nx + i];
    n++; sx += x; sy += y; sz += z; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z;
    min = Math.min(min, z); max = Math.max(max, z);
  }
  if (n < 3) return null;
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] · [a b c] = [sxz syz sz] (z = a·x + b·y + c)
  const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], v = [sxz, syz, sz];
  const det = (q: number[][]) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const D = det(m);
  let a = 0, b = 0;
  if (Math.abs(D) > 1e-9) {
    a = det([[v[0], m[0][1], m[0][2]], [v[1], m[1][1], m[1][2]], [v[2], m[2][1], m[2][2]]]) / D;
    b = det([[m[0][0], v[0], m[0][2]], [m[1][0], v[1], m[1][2]], [m[2][0], v[2], m[2][2]]]) / D;
  }
  const grad = Math.hypot(a, b);
  const slopeDeg = Math.atan(grad) * 180 / Math.PI;
  // Downhill direction in plan coords is (−a, −b); plan −y is "up" = north at
  // rotation 0. Bearing = atan2(east, north).
  let aspectDeg: number | null = null;
  if (slopeDeg >= 0.5) {
    const dx = -a, dy = -b;                               // plan axes
    const t = rotationDeg * Math.PI / 180;
    const e = dx * Math.cos(t) - dy * Math.sin(t);        // plan → ENU (see gartenplan-geo planToEnu)
    const nn = -(dx * Math.sin(t) + dy * Math.cos(t));
    aspectDeg = ((Math.atan2(e, nn) * 180 / Math.PI) + 360) % 360;
  }
  return { meanM: sz / n, minM: min, maxM: max, slopeDeg, aspectDeg };
}

/** Contour lines (marching squares) at multiples of `intervalM`, as line
 *  segments in plan meters. */
export function contourSegments(g: ElevationGrid, intervalM: number): { level: number; seg: [number, number, number, number] }[] {
  const out: { level: number; seg: [number, number, number, number] }[] = [];
  let lo = Infinity, hi = -Infinity;
  for (const h of g.heights) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const h = (i: number, j: number) => g.heights[j * g.nx + i];
  for (let level = Math.ceil(lo / intervalM) * intervalM; level <= hi; level += intervalM) {
    for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
      const c = [h(i, j), h(i + 1, j), h(i + 1, j + 1), h(i, j + 1)];
      const pts: [number, number][] = [];
      const corners: [number, number][] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
      for (let k = 0; k < 4; k++) {
        const a = c[k], b = c[(k + 1) % 4];
        if ((a < level) !== (b < level)) {
          const f = (level - a) / (b - a);
          const [x0, y0] = corners[k], [x1, y1] = corners[(k + 1) % 4];
          pts.push([g.minX + (x0 + (x1 - x0) * f) * g.cellM, g.minY + (y0 + (y1 - y0) * f) * g.cellM]);
        }
      }
      if (pts.length >= 2) out.push({ level, seg: [pts[0][0], pts[0][1], pts[1][0], pts[1][1]] });
      if (pts.length === 4) out.push({ level, seg: [pts[2][0], pts[2][1], pts[3][0], pts[3][1]] });
    }
  }
  return out;
}

/** "Nice" contour interval for a height range (≈ 4–12 lines). */
export function contourInterval(rangeM: number): number {
  for (const s of [0.25, 0.5, 1, 2, 5, 10, 20, 50]) if (rangeM / s <= 12) return s;
  return 100;
}

// ── fetching (browser) ───────────────────────────────────────────────────
function lonLatToTileFloat(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z, rad = lat * Math.PI / 180;
  return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n };
}

/** Loads terrain tiles covering `rect` (plan meters around the garden) and
 *  samples them on a grid with roughly `cellM` spacing. */
export async function fetchElevationGrid(geo: GardenPlanGeo, rect: PlanRect, cellM: number): Promise<ElevationGrid> {
  const z = TERRAIN_MAX_ZOOM;
  const corners = [
    planToLatLon({ xM: rect.minX, yM: rect.minY }, geo), planToLatLon({ xM: rect.maxX, yM: rect.minY }, geo),
    planToLatLon({ xM: rect.maxX, yM: rect.maxY }, geo), planToLatLon({ xM: rect.minX, yM: rect.maxY }, geo),
  ].map(c => lonLatToTileFloat(c.lat, c.lon, z));
  const tx0 = Math.floor(Math.min(...corners.map(c => c.x))), tx1 = Math.floor(Math.max(...corners.map(c => c.x)));
  const ty0 = Math.floor(Math.min(...corners.map(c => c.y))), ty1 = Math.floor(Math.max(...corners.map(c => c.y)));
  if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) > 16) throw new Error('terrain area too large');

  const tiles = new Map<string, ImageData>();
  const sources = new Set<string>();
  await Promise.all([...Array(tx1 - tx0 + 1)].flatMap((_, i) => [...Array(ty1 - ty0 + 1)].map(async (_, j) => {
    const x = tx0 + i, y = ty0 + j;
    const res = await fetch(TERRAIN_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)));
    if (!res.ok) throw new Error(`terrain tile ${res.status}`);
    const src = res.headers.get('x-amz-meta-x-imagery-sources');
    src?.split(',').forEach(s => sources.add(s.split('/')[0].trim()));
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    tiles.set(`${x}/${y}`, ctx.getImageData(0, 0, c.width, c.height));
  })));

  const elevAt = (lat: number, lon: number): number => {
    const t = lonLatToTileFloat(lat, lon, z);
    const px = (t.x - Math.floor(t.x)) * 256, py = (t.y - Math.floor(t.y)) * 256;
    const img = tiles.get(`${Math.floor(t.x)}/${Math.floor(t.y)}`);
    if (!img) return 0;
    const i = (Math.min(255, Math.floor(py)) * img.width + Math.min(255, Math.floor(px))) * 4;
    return terrariumElevation(img.data[i], img.data[i + 1], img.data[i + 2]);
  };

  const nx = Math.max(2, Math.ceil((rect.maxX - rect.minX) / cellM) + 1);
  const ny = Math.max(2, Math.ceil((rect.maxY - rect.minY) / cellM) + 1);
  const stepX = (rect.maxX - rect.minX) / (nx - 1), stepY = (rect.maxY - rect.minY) / (ny - 1);
  const heights = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ll = planToLatLon({ xM: rect.minX + i * stepX, yM: rect.minY + j * stepY }, geo);
    heights[j * nx + i] = elevAt(ll.lat, ll.lon);
  }
  // Light smoothing: the 8-bit terrarium steps and nearest-pixel sampling
  // would otherwise show as terraces.
  const sm = new Float32Array(heights);
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += heights[(j + dj) * nx + i + di];
    sm[j * nx + i] = s / 9;
  }
  return { minX: rect.minX, minY: rect.minY, cellM: stepX, nx, ny, heights: sm, sources: [...sources] };
}
