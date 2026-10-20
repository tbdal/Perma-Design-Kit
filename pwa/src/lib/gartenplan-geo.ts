import type { GardenPlanGeo } from './types';

// Geo math for the garden plan's map background. The plan itself stays in
// local meters (xM right, yM down, origin top-left); a GardenPlanGeo anchors
// plan point 0,0 at lat/lon and turns the plan by `rotationDeg` (clockwise
// from north to plan "up"). In between sits a local east/north frame (ENU)
// in ground meters — Web Mercator scaled by cos(lat) of the origin, which is
// accurate to well under a percent for gardens of a few hundred meters.

const R = 6378137;                    // Web Mercator sphere radius (m)
const HALF_WORLD = Math.PI * R;
const DEG = Math.PI / 180;

export interface Merc { x: number; y: number; }   // y grows north
export interface Enu { e: number; n: number; }
export interface PlanXY { xM: number; yM: number; }

export function lonLatToMerc(lat: number, lon: number): Merc {
  return { x: R * lon * DEG, y: R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) };
}

export function mercToLonLat(m: Merc): { lat: number; lon: number } {
  return { lat: (2 * Math.atan(Math.exp(m.y / R)) - Math.PI / 2) / DEG, lon: m.x / R / DEG };
}

/** Size of one tile edge in Mercator meters at zoom z. */
export function tileSizeMerc(z: number): number {
  return (2 * HALF_WORLD) / 2 ** z;
}

/** Mercator position of a tile's top-left (north-west) corner. */
export function tileToMerc(x: number, y: number, z: number): Merc {
  const t = tileSizeMerc(z);
  return { x: x * t - HALF_WORLD, y: HALF_WORLD - y * t };
}

/** Ground meters per pixel of a 256 px tile at the given latitude/zoom. */
export function metersPerPixel(lat: number, z: number): number {
  return (tileSizeMerc(z) / 256) * Math.cos(lat * DEG);
}

/** ENU (ground meters east/north of the origin) → plan meters. */
export function enuToPlan(p: Enu, rotationDeg: number): PlanXY {
  const c = Math.cos(rotationDeg * DEG), s = Math.sin(rotationDeg * DEG);
  return { xM: p.e * c - p.n * s, yM: -(p.e * s + p.n * c) };
}

/** Plan meters → ENU. The matrix is its own inverse. */
export function planToEnu(p: PlanXY, rotationDeg: number): Enu {
  const c = Math.cos(rotationDeg * DEG), s = Math.sin(rotationDeg * DEG);
  return { e: p.xM * c - p.yM * s, n: -(p.xM * s + p.yM * c) };
}

function scale(geo: Pick<GardenPlanGeo, 'lat'>): number {
  return Math.cos(geo.lat * DEG);
}

export function latLonToEnu(lat: number, lon: number, geo: Pick<GardenPlanGeo, 'lat' | 'lon'>): Enu {
  const o = lonLatToMerc(geo.lat, geo.lon), m = lonLatToMerc(lat, lon), k = scale(geo);
  return { e: (m.x - o.x) * k, n: (m.y - o.y) * k };
}

export function enuToLatLon(p: Enu, geo: Pick<GardenPlanGeo, 'lat' | 'lon'>): { lat: number; lon: number } {
  const o = lonLatToMerc(geo.lat, geo.lon), k = scale(geo);
  return mercToLonLat({ x: o.x + p.e / k, y: o.y + p.n / k });
}

export function planToLatLon(p: PlanXY, geo: GardenPlanGeo): { lat: number; lon: number } {
  return enuToLatLon(planToEnu(p, geo.rotationDeg), geo);
}

export function latLonToPlan(lat: number, lon: number, geo: GardenPlanGeo): PlanXY {
  return enuToPlan(latLonToEnu(lat, lon, geo), geo.rotationDeg);
}

/** Corners of the plan rectangle, clockwise from 0,0 — for map previews. */
export function planCornersToLatLon(widthM: number, heightM: number, geo: GardenPlanGeo): { lat: number; lon: number }[] {
  return [
    { xM: 0, yM: 0 }, { xM: widthM, yM: 0 }, { xM: widthM, yM: heightM }, { xM: 0, yM: heightM },
  ].map(p => planToLatLon(p, geo));
}

/** Compass bearing (deg, clockwise from north) from the origin to a point. */
export function bearingFromOrigin(lat: number, lon: number, geo: Pick<GardenPlanGeo, 'lat' | 'lon'>): number {
  const p = latLonToEnu(lat, lon, geo);
  return ((Math.atan2(p.e, p.n) / DEG) + 360) % 360;
}

export interface PlanTile {
  z: number; x: number; y: number;
  eM: number;      // ENU east of the tile's west edge
  sM: number;      // ENU south (= −north) of the tile's north edge
  sizeM: number;   // ground edge length
}

const MAX_TILES = 64;

/** Tile cap for a screen of `wPx` × `hPx` device pixels: at the chosen zoom a
 *  tile shows at 128–256 px, plus the tiles cut by the edges of a turned view —
 *  a fixed 64 dropped high-DPI screens one zoom level (half as sharp) at about
 *  every second zoom step. */
export function maxTilesForScreen(wPx: number, hPx: number): number {
  const a = wPx / 128, b = hPx / 128;
  return Math.max(MAX_TILES, Math.min(1200, Math.ceil((a + 2) * (b + 2) + 1.5 * (a + b))));
}

/** Tiles covering the (rotated) plan rectangle, at the coarsest zoom that is
 *  still at least as sharp as the screen (`screenMPerPx` ground meters per
 *  device pixel), capped at `maxZoom` and at `maxTiles` tiles. */
export function tilesForPlan(widthM: number, heightM: number, geo: GardenPlanGeo, screenMPerPx: number, maxZoom: number, maxTiles = MAX_TILES): PlanTile[] {
  return tilesForRect({ minX: 0, minY: 0, maxX: widthM, maxY: heightM }, geo, screenMPerPx, maxZoom, maxTiles);
}

export interface PlanRect { minX: number; minY: number; maxX: number; maxY: number; }

/** Same as tilesForPlan() for any rectangle in plan meters — the visible part
 *  of a zoomed/panned canvas, which may also reach beyond the plan itself. */
export function tilesForRect(r: PlanRect, geo: GardenPlanGeo, screenMPerPx: number, maxZoom: number, maxTiles = MAX_TILES): PlanTile[] {
  const corners = [
    { xM: r.minX, yM: r.minY }, { xM: r.maxX, yM: r.minY }, { xM: r.maxX, yM: r.maxY }, { xM: r.minX, yM: r.maxY },
  ].map(p => planToEnu(p, geo.rotationDeg));
  const k = scale(geo);
  const o = lonLatToMerc(geo.lat, geo.lon);
  const mx = corners.map(c => o.x + c.e / k), my = corners.map(c => o.y + c.n / k);
  const [minX, maxX, minY, maxY] = [Math.min(...mx), Math.max(...mx), Math.min(...my), Math.max(...my)];
  // A turned rectangle: tiles of its bounding box that miss it are left out (separating-axis test along its edges).
  const axes = [[mx[1] - mx[0], my[1] - my[0]], [mx[3] - mx[0], my[3] - my[0]]];
  const span = (xs: number[], ys: number[], [ax, ay]: number[]) => {
    const d = xs.map((x, i) => x * ax + ys[i] * ay);
    return [Math.min(...d), Math.max(...d)];
  };
  const rectSpans = axes.map(a => span(mx, my, a));
  const touches = (x: number, y: number, t: number) => geo.rotationDeg % 90 === 0 || axes.every((a, i) => {
    const [lo, hi] = span([x, x + t, x + t, x], [y, y, y - t, y - t], a);
    return hi >= rectSpans[i][0] && lo <= rectSpans[i][1];
  });

  let z = 0;
  while (z < maxZoom && metersPerPixel(geo.lat, z) > screenMPerPx) z++;

  for (; z >= 0; z--) {
    const t = tileSizeMerc(z);
    const n = 2 ** z;
    const x0 = Math.max(0, Math.floor((minX + HALF_WORLD) / t)), x1 = Math.min(n - 1, Math.floor((maxX + HALF_WORLD) / t));
    const y0 = Math.max(0, Math.floor((HALF_WORLD - maxY) / t)), y1 = Math.min(n - 1, Math.floor((HALF_WORLD - minY) / t));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4 * maxTiles) continue;
    const tiles: PlanTile[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const nw = tileToMerc(x, y, z);
        if (touches(nw.x, nw.y, t)) tiles.push({ z, x, y, eM: (nw.x - o.x) * k, sM: -(nw.y - o.y) * k, sizeM: t * k });
      }
    }
    if (tiles.length > maxTiles) continue;
    return tiles;
  }
  return [];
}

/** Tiles for a perspective view (3D): the rectangle starts as at most
 *  `startTiles` coarse tiles, and of the tiles below their wanted zoom
 *  (`wantZoom`, fractional, e.g. from their distance to the camera) the one wanting the
 *  finest zoom — the nearest — is split into its four children, until every
 *  tile is sharp enough or `budget` tiles are reached: the foreground first. So the ground in front of the camera gets the
 *  service's finest zoom and the horizon stays coarse — one zoom for the whole
 *  area made a big plan blurry everywhere. Tiles never overlap. */
export function lodTilesForRect(
  r: PlanRect, geo: GardenPlanGeo, maxZoom: number, budget: number,
  wantZoom: (t: PlanTile) => number, startTiles = 16,
): PlanTile[] {
  const tiles = tilesForRect(r, geo, 0, maxZoom, startTiles);
  if (!tiles.length) return tiles;
  const k = scale(geo);
  const o = lonLatToMerc(geo.lat, geo.lon);
  const want = new Map<PlanTile, number>();
  const lack = (t: PlanTile) => Math.min(maxZoom, Math.ceil(want.get(t)! - 1e-9)) - t.z;
  for (const t of tiles) want.set(t, wantZoom(t));
  while (tiles.length + 3 <= budget) {
    let best = -1;
    for (let i = 0; i < tiles.length; i++) {
      if (lack(tiles[i]) <= 0) continue;
      const d = best < 0 ? 1 : want.get(tiles[i])! - want.get(tiles[best])! || lack(tiles[i]) - lack(tiles[best]);
      if (d > 0) best = i;
    }
    if (best < 0) break;
    const p = tiles[best];
    const z = p.z + 1, t = tileSizeMerc(z);
    const kids: PlanTile[] = [];
    for (const dx of [0, 1]) for (const dy of [0, 1]) {
      const x = p.x * 2 + dx, y = p.y * 2 + dy;
      const nw = tileToMerc(x, y, z);
      const c: PlanTile = { z, x, y, eM: (nw.x - o.x) * k, sM: -(nw.y - o.y) * k, sizeM: t * k };
      want.set(c, wantZoom(c));
      kids.push(c);
    }
    tiles.splice(best, 1, ...kids);
  }
  return tiles;
}

export interface PlanFromMap {
  geo: Pick<GardenPlanGeo, 'lat' | 'lon' | 'rotationDeg'>;
  widthM: number;
  heightM: number;
  boundary: PlanXY[];
}

/** Turns a polygon clicked on the map into a north-up plan: the plan's 0,0 is
 *  the north-west corner of the polygon's bounding box minus `marginM`, the
 *  size is rounded up to whole grid cells, and every vertex is expressed in
 *  plan meters of that anchor — so nothing ever needs rotating. */
export function planFromLatLngPolygon(pts: { lat: number; lon: number }[], marginM: number, spacingM: number): PlanFromMap {
  if (pts.length < 3) throw new Error('need at least 3 points');
  const ref = { lat: pts[0].lat, lon: pts[0].lon };
  const enu = pts.map(p => latLonToEnu(p.lat, p.lon, ref));
  const minE = Math.min(...enu.map(p => p.e)), maxE = Math.max(...enu.map(p => p.e));
  const minN = Math.min(...enu.map(p => p.n)), maxN = Math.max(...enu.map(p => p.n));
  const o = enuToLatLon({ e: minE - marginM, n: maxN + marginM }, ref);
  // The epsilon keeps float noise (14.0000001 m) from adding a whole extra cell.
  const cells = (len: number) => Math.max(2, Math.ceil((len + 2 * marginM) / spacingM - 1e-6) * spacingM);
  const widthM = cells(maxE - minE), heightM = cells(maxN - minN);
  const geo = { lat: o.lat, lon: o.lon, rotationDeg: 0 };
  const full: GardenPlanGeo = { ...geo, basemap: 'osm', opacity: 1 };
  const clampTo = (v: number, hi: number) => Math.min(hi, Math.max(0, v));
  const boundary = pts.map(p => {
    const q = latLonToPlan(p.lat, p.lon, full);
    return { xM: clampTo(q.xM, widthM), yM: clampTo(q.yM, heightM) };
  });
  return { geo, widthM, heightM, boundary };
}
