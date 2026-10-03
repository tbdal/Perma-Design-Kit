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

/** Tiles covering the (rotated) plan rectangle, at the coarsest zoom that is
 *  still at least as sharp as the screen (`screenMPerPx` ground meters per
 *  device pixel), capped at `maxZoom` and at MAX_TILES tiles. */
export function tilesForPlan(widthM: number, heightM: number, geo: GardenPlanGeo, screenMPerPx: number, maxZoom: number): PlanTile[] {
  const corners = [
    { xM: 0, yM: 0 }, { xM: widthM, yM: 0 }, { xM: widthM, yM: heightM }, { xM: 0, yM: heightM },
  ].map(p => planToEnu(p, geo.rotationDeg));
  const k = scale(geo);
  const o = lonLatToMerc(geo.lat, geo.lon);
  const mx = corners.map(c => o.x + c.e / k), my = corners.map(c => o.y + c.n / k);
  const [minX, maxX, minY, maxY] = [Math.min(...mx), Math.max(...mx), Math.min(...my), Math.max(...my)];

  let z = 0;
  while (z < maxZoom && metersPerPixel(geo.lat, z) > screenMPerPx) z++;

  for (; z >= 0; z--) {
    const t = tileSizeMerc(z);
    const n = 2 ** z;
    const x0 = Math.max(0, Math.floor((minX + HALF_WORLD) / t)), x1 = Math.min(n - 1, Math.floor((maxX + HALF_WORLD) / t));
    const y0 = Math.max(0, Math.floor((HALF_WORLD - maxY) / t)), y1 = Math.min(n - 1, Math.floor((HALF_WORLD - minY) / t));
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > MAX_TILES) continue;
    const tiles: PlanTile[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const nw = tileToMerc(x, y, z);
        tiles.push({ z, x, y, eM: (nw.x - o.x) * k, sM: -(nw.y - o.y) * k, sizeM: t * k });
      }
    }
    return tiles;
  }
  return [];
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
