import type { ElevationGrid } from './terrain';

// Water in the terrain of a located garden plan, from the elevation grid
// (terrain.ts; meaningful with an official 1 m model, dgm.ts):
//   – flow paths: D8 steepest descent on a depression-filled surface
//     (priority-flood with a tiny gradient, Barnes et al. 2014), flow
//     accumulation = catchment area of each cell;
//   – sinks: where the filled surface lies above the real one — puddles,
//     hollows, frost pockets — with area, depth and volume;
//   – swale suggestions: short ditches on contour (across the slope) where
//     runoff from a sizeable catchment crosses the garden on a gentle slope;
//   – roof rain: footprint area × yearly precipitation × runoff coefficient.
// All coordinates are plan metres (x east-ish, y down), like the grid.

export interface FlowSeg { x1: number; y1: number; x2: number; y2: number; catchmentM2: number; }
export interface Sink { xM: number; yM: number; areaM2: number; depthM: number; volumeM3: number; }
export interface Swale { x1: number; y1: number; x2: number; y2: number; catchmentM2: number; slopePct: number; }
export interface WaterAnalysis { flow: FlowSeg[]; sinks: Sink[]; swales: Swale[]; cellM: number; }

const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;

/** Min-heap of [priority, index]. */
class Heap {
  private a: number[] = []; private p: number[] = [];
  get size() { return this.a.length; }
  push(prio: number, idx: number) {
    let i = this.a.length; this.a.push(idx); this.p.push(prio);
    while (i > 0) { const j = (i - 1) >> 1; if (this.p[j] <= this.p[i]) break; this.swap(i, j); i = j; }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.p[0], this.a[0]];
    const li = this.a.pop()!, lp = this.p.pop()!;
    if (this.a.length) {
      this.a[0] = li; this.p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < this.a.length && this.p[l] < this.p[m]) m = l;
        if (r < this.a.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break; this.swap(i, m); i = m;
      }
    }
    return top;
  }
  private swap(i: number, j: number) { [this.a[i], this.a[j]] = [this.a[j], this.a[i]]; [this.p[i], this.p[j]] = [this.p[j], this.p[i]]; }
}

/** Depression-filled copy of the heights; flats get a 1e-4 m/cell gradient so water always finds a way out. */
export function fillDepressions(g: ElevationGrid): Float32Array {
  const { nx, ny, heights } = g;
  const filled = new Float32Array(heights);
  const done = new Uint8Array(nx * ny);
  const heap = new Heap();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { const k = j * nx + i; done[k] = 1; heap.push(filled[k], k); }
  }
  while (heap.size) {
    const [h, k] = heap.pop();
    const i = k % nx, j = (k / nx) | 0;
    for (const [di, dj] of NB) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const n = b * nx + a;
      if (done[n]) continue;
      done[n] = 1;
      filled[n] = Math.max(filled[n], h + 1e-4);
      heap.push(filled[n], n);
    }
  }
  return filled;
}

/** Downstream neighbour index per cell (−1 at the border). */
export function flowDirections(g: ElevationGrid, z: Float32Array): Int32Array {
  const { nx, ny } = g;
  const dir = new Int32Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    let best = 0, to = -1;
    for (const [di, dj] of NB) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
      const drop = (z[k] - z[b * nx + a]) / (di && dj ? Math.SQRT2 : 1);
      if (drop > best) { best = drop; to = b * nx + a; }
    }
    dir[k] = to;
  }
  return dir;
}

/** Catchment area (m²) of every cell. */
export function flowAccumulation(g: ElevationGrid, z: Float32Array, dir: Int32Array): Float32Array {
  const n = g.nx * g.ny;
  const acc = new Float32Array(n).fill(g.cellM * g.cellM);
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => z[b] - z[a]);
  for (const k of order) if (dir[k] >= 0) acc[dir[k]] += acc[k];
  return acc;
}

/** Slope (%) and downhill unit vector at a cell (central differences on the real heights). */
function gradientAt(g: ElevationGrid, i: number, j: number): { slopePct: number; dx: number; dy: number } {
  const { nx, ny, heights: h, cellM } = g;
  const at = (a: number, b: number) => h[Math.min(ny - 1, Math.max(0, b)) * nx + Math.min(nx - 1, Math.max(0, a))];
  const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * cellM), gy = (at(i, j + 1) - at(i, j - 1)) / (2 * cellM);
  const len = Math.hypot(gx, gy);
  return { slopePct: len * 100, dx: len ? -gx / len : 0, dy: len ? -gy / len : 0 };
}

export interface WaterOptions {
  /** Plan area of interest (x0,y0,x1,y1 in plan metres); results are limited to it (+ margin for flow). */
  rect: { minX: number; minY: number; maxX: number; maxY: number };
  inside?: (xM: number, yM: number) => boolean;
  /** Minimum catchment for a drawn flow path, m² (default 150). */
  minCatchmentM2?: number;
}

export function analyzeWater(g: ElevationGrid, o: WaterOptions): WaterAnalysis {
  const { nx, ny, cellM, minX, minY, heights } = g;
  const z = fillDepressions(g);
  const dir = flowDirections(g, z);
  const acc = flowAccumulation(g, z, dir);
  const X = (i: number) => minX + i * cellM, Y = (j: number) => minY + j * cellM;
  const m = 15;
  const inRect = (x: number, y: number, pad = 0) => x >= o.rect.minX - pad && x <= o.rect.maxX + pad && y >= o.rect.minY - pad && y <= o.rect.maxY + pad;
  const minC = o.minCatchmentM2 ?? 150;

  const flow: FlowSeg[] = [];
  for (let k = 0; k < nx * ny; k++) {
    if (acc[k] < minC || dir[k] < 0) continue;
    const i = k % nx, j = (k / nx) | 0, d = dir[k], a = d % nx, b = (d / nx) | 0;
    if (!inRect(X(i), Y(j), m)) continue;
    flow.push({ x1: X(i), y1: Y(j), x2: X(a), y2: Y(b), catchmentM2: acc[k] });
  }

  // Sinks: 8-connected regions where the filled surface is ≥ 5 cm above the ground.
  const seen = new Uint8Array(nx * ny);
  const sinks: Sink[] = [];
  for (let k = 0; k < nx * ny; k++) {
    if (seen[k] || z[k] - heights[k] < 0.05) continue;
    const stack = [k]; seen[k] = 1;
    let cells = 0, vol = 0, depth = 0, sx = 0, sy = 0, deepest = k;
    while (stack.length) {
      const c = stack.pop()!;
      const d = z[c] - heights[c];
      cells++; vol += d; sx += c % nx; sy += (c / nx) | 0;
      if (d > depth) { depth = d; deepest = c; }
      const i = c % nx, j = (c / nx) | 0;
      for (const [di, dj] of NB) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const n = b * nx + a;
        if (!seen[n] && z[n] - heights[n] >= 0.05) { seen[n] = 1; stack.push(n); }
      }
    }
    const x = X(deepest % nx), y = Y((deepest / nx) | 0);
    if (!inRect(x, y) || depth < 0.1) continue;
    sinks.push({ xM: x, yM: y, areaM2: cells * cellM * cellM, depthM: depth, volumeM3: vol * cellM * cellM });
  }
  sinks.sort((a, b) => b.volumeM3 - a.volumeM3);

  // Swales: biggest catchments inside the garden on 1–15 % slopes, ≥ 8 m apart.
  const cand: number[] = [];
  for (let k = 0; k < nx * ny; k++) {
    if (acc[k] < Math.max(minC, 300)) continue;
    const x = X(k % nx), y = Y((k / nx) | 0);
    if (!inRect(x, y) || (o.inside && !o.inside(x, y))) continue;
    cand.push(k);
  }
  cand.sort((a, b) => acc[b] - acc[a]);
  const swales: Swale[] = [];
  for (const k of cand) {
    if (swales.length >= 5) break;
    const i = k % nx, j = (k / nx) | 0;
    const gr = gradientAt(g, i, j);
    if (gr.slopePct < 1 || gr.slopePct > 15) continue;
    const x = X(i), y = Y(j);
    if (swales.some(s => Math.hypot((s.x1 + s.x2) / 2 - x, (s.y1 + s.y2) / 2 - y) < 8)) continue;
    const half = Math.min(6, Math.max(2, Math.sqrt(acc[k]) / 6));
    // along the contour = perpendicular to the downhill direction
    const tx = -gr.dy, ty = gr.dx;
    swales.push({ x1: x - tx * half, y1: y - ty * half, x2: x + tx * half, y2: y + ty * half, catchmentM2: acc[k], slopePct: gr.slopePct });
  }
  return { flow, sinks: sinks.slice(0, 8), swales, cellM };
}

/** Yearly rain off a roof (m³): area × precipitation × runoff coefficient (0.8 for pitched/hard roofs). */
export function roofRainM3(areaM2: number, precipMm: number, runoff = 0.8): number {
  return areaM2 * precipMm / 1000 * runoff;
}
