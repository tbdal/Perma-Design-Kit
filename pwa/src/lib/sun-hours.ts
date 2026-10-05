import type { GardenPlan, GardenPlanPoint, PlantData } from './types';
import { sunPosition, sunDirectionEnu } from './sun-position';
import { enuToPlan } from './gartenplan-geo';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';
import { pointInPolygon } from './gartenplan-geometry';
import { ageAt, isPlanted } from './phases';

// "Besonnung": average hours of direct sun per day at a point of the garden.
// The sun's path (sun-position.ts) is sampled over one day or a season; for
// each sample a ray from the ground towards the sun is tested against
//   – tree/shrub crowns (ellipsoids letting 10–15 % of the light through),
//   – buildings (footprint prisms, e.g. from OSM),
//   – the terrain (elevation grid, ray marched).
// All heights are absolute (m above the same datum as `groundZ`).

export type Occluder =
  | { kind: 'crown'; id: string; x: number; y: number; r: number; zc: number; rz: number; transmit: number }
  | { kind: 'prism'; pts: GardenPlanPoint[]; z1: number; minX: number; minY: number; maxX: number; maxY: number };

export interface SunScene {
  occluders: Occluder[];
  groundZ: (x: number, y: number) => number;
  /** Terrain occlusion: sampled heights within an extent (optional). */
  terrain?: { z: (x: number, y: number) => number; minX: number; minY: number; maxX: number; maxY: number; maxZ: number; stepM: number } | null;
}

/** One sun position: unit direction in plan coords (x, y, up) + the hours
 *  per day it stands for. */
export interface SunSample { dx: number; dy: number; dz: number; hours: number; }

export const SEASON_DATES = (year: number) => [3, 4, 5, 6, 7, 8].map(m => new Date(year, m, m === 5 ? 21 : 15));

/** Sun lower than this counts as down: low sun is weak and in practice
 *  blocked by fences, hedges and neighbouring houses the plan doesn't know. */
export const MIN_SUN_ALT_DEG = 10;

/** Sun samples every `stepMin` minutes over the given days (local time). The
 *  hours are averaged over the days, so the sum of all samples is the mean
 *  time the sun stands higher than MIN_SUN_ALT_DEG. */
export function sunSamples(dates: Date[], lat: number, lon: number, rotationDeg: number, stepMin = 20): SunSample[] {
  const out: SunSample[] = [];
  const w = stepMin / 60 / dates.length;
  for (const d of dates) {
    for (let m = stepMin / 2; m < 24 * 60; m += stepMin) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m);
      const p = sunPosition(t, lat, lon);
      if (p.altitudeDeg < MIN_SUN_ALT_DEG) continue;
      const e = sunDirectionEnu(p.bearingDeg, p.altitudeDeg);
      const h = enuToPlan({ e: e.e, n: e.n }, rotationDeg);
      out.push({ dx: h.xM, dy: h.yM, dz: e.up, hours: w });
    }
  }
  return out;
}

/** Crown of a placed plant as an ellipsoid at its size after `years`. */
export function crownOccluder(id: string, at: GardenPlanPoint, plant: PlantData, years: number, groundZ: (x: number, y: number) => number): Occluder | null {
  const layer = deriveLayer(plant);
  if (layer === 'rhizo') return null;
  const r = displayRadiusM(plant, years);
  const finalR = plant.widthM && plant.widthM > 0 ? plant.widthM / 2 : 0.25;
  const h = plant.heightM && plant.heightM > 0 ? Math.max(0.1, plant.heightM * Math.min(1, r / finalR)) : r * (layer === 'tree' ? 2.6 : 1.4);
  const rz = layer === 'tree' ? Math.min(r * 1.1, h * 0.45) : h / 2;
  return { kind: 'crown', id, x: at.xM, y: at.yM, r: Math.max(0.1, r), zc: groundZ(at.xM, at.yM) + h - rz, rz: Math.max(0.05, rz), transmit: layer === 'tree' ? 0.15 : 0.1 };
}

export function planOccluders(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number, groundZ: (x: number, y: number) => number): Occluder[] {
  return plan.placements.flatMap(pl => {
    const p = plantsById.get(pl.plantId);
    const o = p && isPlanted(pl, years) ? crownOccluder(pl.id, pl, p, ageAt(pl, years), groundZ) : null;
    return o ? [o] : [];
  });
}

function rayHitsCrown(o: Extract<Occluder, { kind: 'crown' }>, x: number, y: number, z: number, s: SunSample): boolean {
  const ox = (x - o.x) / o.r, oy = (y - o.y) / o.r, oz = (z - o.zc) / o.rz;
  const dx = s.dx / o.r, dy = s.dy / o.r, dz = s.dz / o.rz;
  const c = ox * ox + oy * oy + oz * oz - 1;
  if (c <= 0) return true; // point inside the crown
  const b = ox * dx + oy * dy + oz * dz;
  if (b >= 0) return false; // pointing away
  const a = dx * dx + dy * dy + dz * dz;
  return b * b - a * c >= 0;
}

function rayHitsPrism(o: Extract<Occluder, { kind: 'prism' }>, x: number, y: number, z: number, s: SunSample): boolean {
  const hl = Math.hypot(s.dx, s.dy);
  if (hl < 1e-6) return false;
  const tan = s.dz / hl, hx = s.dx / hl, hy = s.dy / hl;
  if (z >= o.z1) return false;
  const reach = (o.z1 - z) / tan; // horizontal distance at which the ray passes the roof
  // quick reject: bbox farther than the reach
  const bx = Math.max(o.minX - x, 0, x - o.maxX), by = Math.max(o.minY - y, 0, y - o.maxY);
  if (bx * bx + by * by > reach * reach) return false;
  if (pointInPolygon({ xM: x, yM: y }, o.pts)) return true;
  // first entry along the ray (smallest positive edge crossing)
  let first = Infinity;
  for (let i = 0, n = o.pts.length; i < n; i++) {
    const a = o.pts[i], b = o.pts[(i + 1) % n];
    const ex = b.xM - a.xM, ey = b.yM - a.yM;
    const den = hx * ey - hy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a.xM - x) * ey - (a.yM - y) * ex) / den;   // along the ray
    const u = ((a.xM - x) * hy - (a.yM - y) * hx) / den;   // along the edge
    if (t > 0 && u >= 0 && u <= 1 && t < first) first = t;
  }
  return first < reach;
}

function rayHitsTerrain(tr: NonNullable<SunScene['terrain']>, x: number, y: number, z: number, s: SunSample): boolean {
  const hl = Math.hypot(s.dx, s.dy);
  if (hl < 1e-6 || z >= tr.maxZ) return false;
  const tan = s.dz / hl, hx = s.dx / hl, hy = s.dy / hl;
  const maxS = (tr.maxZ - z) / tan;
  for (let d = tr.stepM; d <= maxS; d += tr.stepM) {
    const px = x + hx * d, py = y + hy * d;
    if (px < tr.minX || px > tr.maxX || py < tr.minY || py > tr.maxY) return false;
    if (tr.z(px, py) > z + d * tan) return true;
  }
  return false;
}

// ── Spatial index ──
// Big plans bring hundreds of crowns and (with the 150-m margin) thousands of
// OSM buildings; testing every ray against all of them made a 500-m sun map
// take ~15 s. Occluders go into a uniform grid by their footprint; a ray only
// walks the cells its ground projection crosses, up to the distance at which
// it climbs above the tallest occluder.

interface OccluderIndex {
  minX: number; minY: number; cell: number; nx: number; ny: number;
  buckets: number[][];
  topZ: number;
  seen: Uint32Array; gen: number;
}

/** Below `minOccluders` the plain loop is as fast (tests lower/raise it). */
export const sunIndexConfig = { minOccluders: 24 };
const indexCache = new WeakMap<Occluder[], OccluderIndex>();

function footprint(o: Occluder): [number, number, number, number] {
  return o.kind === 'crown' ? [o.x - o.r, o.y - o.r, o.x + o.r, o.y + o.r] : [o.minX, o.minY, o.maxX, o.maxY];
}

function buildIndex(occ: Occluder[]): OccluderIndex {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, topZ = -Infinity;
  for (const o of occ) {
    const [a, b, c, d] = footprint(o);
    minX = Math.min(minX, a); minY = Math.min(minY, b); maxX = Math.max(maxX, c); maxY = Math.max(maxY, d);
    topZ = Math.max(topZ, o.kind === 'crown' ? o.zc + o.rz : o.z1);
  }
  const cell = Math.max(4, Math.max(maxX - minX, maxY - minY) / 160);
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell)), ny = Math.max(1, Math.ceil((maxY - minY) / cell));
  const buckets: number[][] = Array.from({ length: nx * ny }, () => []);
  const ci = (v: number, lo: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor((v - lo) / cell)));
  occ.forEach((o, k) => {
    const [a, b, c, d] = footprint(o);
    for (let j = ci(b, minY, ny); j <= ci(d, minY, ny); j++)
      for (let i = ci(a, minX, nx); i <= ci(c, minX, nx); i++) buckets[j * nx + i].push(k);
  });
  return { minX, minY, cell, nx, ny, buckets, topZ, seen: new Uint32Array(occ.length), gen: 0 };
}

function indexFor(occ: Occluder[]): OccluderIndex {
  let ix = indexCache.get(occ);
  if (!ix) { ix = buildIndex(occ); indexCache.set(occ, ix); }
  return ix;
}

/** Calls `visit(k)` once for every occluder whose cell the ray's ground
 *  projection crosses within `len` metres of (x, y); stops when it returns true. */
function walkRay(ix: OccluderIndex, x: number, y: number, hx: number, hy: number, len: number, visit: (k: number) => boolean): void {
  const gen = ++ix.gen;
  if (gen === 0xffffffff) { ix.seen.fill(0); ix.gen = 1; }
  const g = ix.gen;
  const W = ix.nx * ix.cell, H = ix.ny * ix.cell;
  // clip the segment [0, len] to the grid (slab method)
  let t0 = 0, t1 = len;
  const px = x - ix.minX, py = y - ix.minY;
  for (const [p, d, size] of [[px, hx, W], [py, hy, H]] as const) {
    if (Math.abs(d) < 1e-12) { if (p < 0 || p > size) return; continue; }
    let a = -p / d, b = (size - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return;
  }
  const sx = px + hx * t0, sy = py + hy * t0;
  let i = Math.min(ix.nx - 1, Math.max(0, Math.floor(sx / ix.cell)));
  let j = Math.min(ix.ny - 1, Math.max(0, Math.floor(sy / ix.cell)));
  const stepI = hx > 0 ? 1 : -1, stepJ = hy > 0 ? 1 : -1;
  const dtx = Math.abs(hx) < 1e-12 ? Infinity : ix.cell / Math.abs(hx);
  const dty = Math.abs(hy) < 1e-12 ? Infinity : ix.cell / Math.abs(hy);
  let tx = Math.abs(hx) < 1e-12 ? Infinity : t0 + ((hx > 0 ? (i + 1) * ix.cell - sx : sx - i * ix.cell) / Math.abs(hx));
  let ty = Math.abs(hy) < 1e-12 ? Infinity : t0 + ((hy > 0 ? (j + 1) * ix.cell - sy : sy - j * ix.cell) / Math.abs(hy));
  for (;;) {
    for (const k of ix.buckets[j * ix.nx + i]) {
      if (ix.seen[k] === g) continue;
      ix.seen[k] = g;
      if (visit(k)) return;
    }
    const tNext = Math.min(tx, ty);
    if (tNext > t1) return;
    if (tx < ty) { i += stepI; tx += dtx; if (i < 0 || i >= ix.nx) return; }
    else { j += stepJ; ty += dty; if (j < 0 || j >= ix.ny) return; }
  }
}

/** Light let through by the occluders along one sun ray (1 = open sky). */
function rayTransmission(occ: Occluder[], x: number, y: number, z: number, s: SunSample, exclude: string | undefined): number {
  let t = 1;
  const test = (o: Occluder) => {
    if (o.kind === 'crown') {
      if (o.id !== exclude && rayHitsCrown(o, x, y, z, s)) t *= o.transmit;
    } else if (rayHitsPrism(o, x, y, z, s)) { t = 0; }
    return t < 0.02;
  };
  if (occ.length < sunIndexConfig.minOccluders) {
    for (const o of occ) if (test(o)) break;
    return t;
  }
  const ix = indexFor(occ);
  if (z >= ix.topZ) return 1;
  const hl = Math.hypot(s.dx, s.dy);
  // (nearly) overhead sun: only what stands right here
  if (hl < 1e-6) { walkRay(ix, x, y, 1, 0, 0, k => test(occ[k])); return t; }
  const reach = (ix.topZ - z) / (s.dz / hl);
  walkRay(ix, x, y, s.dx / hl, s.dy / hl, reach, k => test(occ[k]));
  return t;
}

/** Mean hours of direct sun per day at a ground point. `exclude` skips one
 *  crown (a plant's own, when judging its spot). */
export function sunHoursAt(x: number, y: number, scene: SunScene, samples: SunSample[], exclude?: string): number {
  const z = scene.groundZ(x, y) + 0.3;
  let sum = 0;
  for (const s of samples) {
    if (scene.terrain && rayHitsTerrain(scene.terrain, x, y, z, s)) continue;
    sum += s.hours * rayTransmission(scene.occluders, x, y, z, s, exclude);
  }
  return sum;
}

export type SunClass = 'full' | 'mid' | 'shadow';
/** Usual garden thresholds: ≥ 6 h full sun, 3–6 h part shade, < 3 h shade. */
export function sunClass(hours: number): SunClass {
  return hours >= 6 ? 'full' : hours >= 3 ? 'mid' : 'shadow';
}

/** Cell centres of a grid inside the garden outline. */
export function planCells(plan: GardenPlan, cellM: number): GardenPlanPoint[] {
  const out: GardenPlanPoint[] = [];
  const outline = plan.boundary.length >= 3 ? plan.boundary : null;
  for (let y = cellM / 2; y < plan.areaHeightM; y += cellM) {
    for (let x = cellM / 2; x < plan.areaWidthM; x += cellM) {
      if (!outline || pointInPolygon({ xM: x, yM: y }, outline)) out.push({ xM: x, yM: y });
    }
  }
  return out;
}
