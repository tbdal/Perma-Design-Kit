import type { GardenPlanGeo, GardenPlanPoint } from './types';
import { latLonToPlan, planToLatLon, type PlanRect } from './gartenplan-geo';
import { cachedFetch, hashKey, DAY_MS } from './geo-cache';
import { orientedBox, nearlyRectangular, roofHeightFromPitch, type Roof, type RoofShape } from './building-roof';

// Buildings around the garden from OpenStreetMap (Overpass API): footprints
// in plan meters plus a height from `height`, `building:levels` or a guess
// by building type. Used for 3D blocks and as sun occluders (sun-hours.ts).
// © OpenStreetMap contributors, ODbL.

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
export const BUILDINGS_ATTRIBUTION = 'Gebäude: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** `heightM` is the total height including the roof; walls = heightM − roof.heightM. */
export interface Building { pts: GardenPlanPoint[]; heightM: number; holes?: GardenPlanPoint[][]; roof?: Roof; }

type LL = { lat: number; lon: number };
const same = (a: LL, b: LL) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9;

/** Joins multipolygon member ways (often split into several pieces) into
 *  closed rings by matching their end points; open leftovers are dropped. */
export function assembleRings(parts: LL[][]): LL[][] {
  const pool = parts.filter(p => p.length >= 2).map(p => p.slice());
  const rings: LL[][] = [];
  while (pool.length) {
    let ring = pool.shift()!;
    let grown = true;
    while (!same(ring[0], ring[ring.length - 1]) && grown) {
      grown = false;
      const end = ring[ring.length - 1];
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (same(p[0], end)) ring = ring.concat(p.slice(1));
        else if (same(p[p.length - 1], end)) ring = ring.concat(p.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

function inside(pt: GardenPlanPoint, poly: GardenPlanPoint[]): boolean {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.yM > pt.yM) !== (b.yM > pt.yM) && pt.xM < ((b.xM - a.xM) * (pt.yM - a.yM)) / (b.yM - a.yM) + a.xM) r = !r;
  }
  return r;
}

const LEVEL_M = 3;
const TYPE_HEIGHT: Record<string, number> = {
  garage: 3, garages: 3, shed: 2.5, carport: 2.5, hut: 2.5, roof: 4, greenhouse: 3, kiosk: 3,
  house: 8, detached: 8, semidetached_house: 8, terrace: 9, bungalow: 5, farm: 8,
  residential: 9, apartments: 14, dormitory: 14, hotel: 15,
  church: 18, cathedral: 30, chapel: 8, school: 11, commercial: 10, retail: 7, office: 14,
  industrial: 10, warehouse: 9, barn: 8, farm_auxiliary: 6, stable: 6, service: 4,
};

const num = (v?: string) => {
  const m = v?.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : NaN;
};

/** Height in metres from OSM tags (total, without knowing the footprint). */
export function buildingHeight(tags: Record<string, string>): number {
  const h = num(tags.height);
  if (h > 0) return h;
  const lv = num(tags['building:levels']);
  if (lv > 0) return lv * LEVEL_M + (num(tags['roof:levels']) > 0 ? num(tags['roof:levels']) * LEVEL_M * 0.6 : 2);
  return TYPE_HEIGHT[tags.building] ?? 7;
}

const SHAPE_TAG: Record<string, RoofShape> = {
  flat: 'flat', gabled: 'gabled', gambrel: 'gabled', mansard: 'gabled', saltbox: 'gabled', 'double_saltbox': 'gabled', 'quadruple_saltbox': 'gabled',
  hipped: 'hipped', 'half-hipped': 'hipped', 'side_hipped': 'hipped',
  pyramidal: 'pyramidal', cone: 'pyramidal', dome: 'pyramidal', onion: 'pyramidal', round: 'gabled',
  skillion: 'skillion', lean_to: 'skillion',
};
/** Types that in Central Europe nearly always have a pitched roof. */
const PITCHED_TYPES = new Set(['house', 'detached', 'semidetached_house', 'terrace', 'farm', 'bungalow', 'barn', 'farm_auxiliary', 'stable', 'chapel', 'church', 'cabin', 'hut']);
const COMPASS: Record<string, number> = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

function areaM2(pts: GardenPlanPoint[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].xM + pts[i].xM) * (pts[j].yM - pts[i].yM);
  return Math.abs(a / 2);
}

/** Total height and roof from OSM tags and the footprint. A missing
 *  roof:shape on a house (or a small untyped building) becomes an estimated
 *  40° gable along the long side; anything else stays flat. `rotationDeg`
 *  turns roof:direction (compass) into the plan frame. */
export function buildingShape(tags: Record<string, string>, pts: GardenPlanPoint[], rotationDeg = 0): { heightM: number; roof: Roof } {
  const box = orientedBox(pts);
  const tagged = SHAPE_TAG[(tags['roof:shape'] ?? '').trim()];
  const lv = num(tags['building:levels']);
  const smallUntyped = tags.building === 'yes' && !(lv > 3) && (() => { const a = areaM2(pts); return a >= 40 && a <= 250; })();
  let shape: RoofShape = tagged ?? (PITCHED_TYPES.has(tags.building) || smallUntyped ? 'gabled' : 'flat');
  const estimated = !tagged && shape !== 'flat';
  if ((shape === 'hipped' || shape === 'pyramidal') && !nearlyRectangular(pts, box)) shape = 'gabled';
  const across = tags['roof:orientation'] === 'across';
  const dirRaw = tags['roof:direction'] ?? tags['roof:slope:direction'];
  const dir = dirRaw == null ? NaN : (COMPASS[dirRaw.trim().toUpperCase()] ?? num(dirRaw));
  const roof: Roof = { shape, heightM: 0 };
  if (estimated) roof.estimated = true;
  if (across) roof.across = true;
  if (shape === 'skillion' && Number.isFinite(dir)) roof.directionDeg = ((dir - rotationDeg) % 360 + 360) % 360;

  if (shape !== 'flat') {
    const rh = num(tags['roof:height']), angle = num(tags['roof:angle']);
    roof.heightM = rh > 0 ? rh
      : angle > 0 && angle < 80 ? roofHeightFromPitch(shape, box, angle, across)
      : Math.min(estimated ? 6 : 12, roofHeightFromPitch(shape, box, undefined, across));
  }
  const h = num(tags.height);
  let total: number;
  if (h > 0) total = h;
  else if (lv > 0) total = lv * LEVEL_M + (shape === 'flat' ? (num(tags['roof:levels']) > 0 ? num(tags['roof:levels']) * LEVEL_M * 0.6 : 1) : roof.heightM);
  else total = TYPE_HEIGHT[tags.building] ?? 7;
  // the roof never takes more than 60 % of the building (walls stay visible)
  roof.heightM = Math.min(roof.heightM, total * 0.6);
  if (roof.heightM < 0.3) { roof.shape = 'flat'; roof.heightM = 0; delete roof.estimated; delete roof.directionDeg; }
  return { heightM: total, roof };
}

interface OverpassElement {
  type: 'way' | 'relation';
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { role: string; geometry?: { lat: number; lon: number }[] }[];
}

/** Overpass JSON (`out geom tags`) → footprints in plan meters. */
export function parseBuildings(json: { elements?: OverpassElement[] }, geo: GardenPlanGeo): Building[] {
  const out: Building[] = [];
  const ring = (g: { lat: number; lon: number }[]) => {
    const pts = g.map(p => latLonToPlan(p.lat, p.lon, geo));
    if (pts.length > 1 && pts[0].xM === pts[pts.length - 1].xM && pts[0].yM === pts[pts.length - 1].yM) pts.pop();
    return pts;
  };
  for (const el of json.elements ?? []) {
    const tags = el.tags ?? {};
    if (!tags.building || tags.building === 'no') continue;
    if (tags['building:part'] || tags.location === 'underground' || Number(tags.layer) < 0) continue;
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) {
      const pts = ring(el.geometry);
      if (pts.length >= 3) out.push({ pts, ...buildingShape(tags, pts, geo.rotationDeg) });
    }
    if (el.type === 'relation') {
      // Outer and inner (courtyard) rings, each possibly split across ways.
      const outers = assembleRings((el.members ?? []).filter(m => m.role === 'outer' && m.geometry).map(m => m.geometry!)).map(ring);
      const inners = assembleRings((el.members ?? []).filter(m => m.role === 'inner' && m.geometry).map(m => m.geometry!)).map(ring);
      for (const o of outers) {
        if (o.length < 3) continue;
        const holes = inners.filter(h => h.length >= 3 && inside(h[0], o));
        // courtyard buildings keep a flat roof
        const heightM = buildingHeight(tags);
        out.push(holes.length ? { pts: o, heightM, holes } : { pts: o, ...buildingShape(tags, o, geo.rotationDeg) });
      }
    }
  }
  return out.filter(b => b.pts.length >= 3);
}

/** Bounding box "s,w,n,e" around a plan rectangle, widened to 4 decimals
 *  (≈ 10 m) so the same plan always asks the same — cache-friendly — question. */
export function buildingsBbox(geo: GardenPlanGeo, rect: PlanRect): string {
  const c = [
    planToLatLon({ xM: rect.minX, yM: rect.minY }, geo), planToLatLon({ xM: rect.maxX, yM: rect.minY }, geo),
    planToLatLon({ xM: rect.maxX, yM: rect.maxY }, geo), planToLatLon({ xM: rect.minX, yM: rect.maxY }, geo),
  ];
  const lo = (v: number) => (Math.floor(v * 1e4) / 1e4).toFixed(4), hi = (v: number) => (Math.ceil(v * 1e4) / 1e4).toFixed(4);
  const lats = c.map(p => p.lat), lons = c.map(p => p.lon);
  return [lo(Math.min(...lats)), lo(Math.min(...lons)), hi(Math.max(...lats)), hi(Math.max(...lons))].join(',');
}

/** Overpass query for all buildings in a bbox ("s,w,n,e"). The server cache
 *  (/geo/overpass, nginx) builds the very same query from the bbox. */
export function buildingsQueryForBbox(bb: string): string {
  return `[out:json][timeout:25];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb}););out geom tags;`;
}

/** Overpass query for all buildings in a plan rectangle. */
export function buildingsQuery(geo: GardenPlanGeo, rect: PlanRect): string {
  return buildingsQueryForBbox(buildingsBbox(geo, rect));
}

/** Our own server asks Overpass and keeps the answer (30 days, served even
 *  when Overpass is down): the visitor's address never reaches Overpass, and
 *  each area is fetched once for everyone. Only the bbox goes there — the
 *  server builds the fixed buildings query itself (no open Overpass proxy).
 *  Missing (dev server, other hosting) → the public instances directly. */
export const OVERPASS_PROXY = '/geo/overpass';

const cache = new Map<string, Building[]>();

/** Buildings in `rect` (cached per session); tries the endpoints in turn. */
export async function fetchBuildings(geo: GardenPlanGeo, rect: PlanRect): Promise<Building[]> {
  const bb = buildingsBbox(geo, rect);
  const q = buildingsQueryForBbox(bb);
  const hit = cache.get(q);
  if (hit) return hit;
  // Persisted in the browser (30 days) — an unchanged plan never asks
  // Overpass again, and an expired copy still serves if every mirror is down.
  const res = await cachedFetch(`overpass:${hashKey(q)}`, 30 * DAY_MS, () => overpass(bb, q));
  const list = parseBuildings(await res.json(), geo);
  cache.set(q, list);
  return list;
}

/** Overpass answers an overloaded or timed-out query with HTTP 200 and a
 *  "remark" — that must neither count as success nor end up in a cache. */
class OverpassRemark extends Error {}

async function checkedJson(res: Response): Promise<Response> {
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const text = await res.text();
  const json = JSON.parse(text) as { remark?: unknown; elements?: unknown };
  if (!Array.isArray(json.elements) || (typeof json.remark === 'string' && /error|timed out|out of memory|too many/i.test(json.remark))) {
    throw new OverpassRemark(String(json.remark ?? 'no elements'));
  }
  return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function timedFetch(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); }
  finally { clearTimeout(timer); }
}

/** Own server first (a cached error answer is refreshed once), then each
 *  public instance in turn, a second round after a short pause — they are
 *  often just briefly overloaded. First valid answer wins. */
async function overpass(bb: string, q: string): Promise<Response> {
  let lastErr: unknown = null;
  for (const refresh of [false, true]) {
    try {
      return await checkedJson(await timedFetch(`${OVERPASS_PROXY}?bbox=${bb}${refresh ? '&refresh=1' : ''}`, {}, 45000));
    } catch (e) {
      lastErr = e;
      if (!(e instanceof OverpassRemark)) break;
    }
  }
  for (let round = 0; round < 2; round++) {
    for (const url of OVERPASS_ENDPOINTS) {
      try {
        return await checkedJson(await timedFetch(url, { method: 'POST', body: new URLSearchParams({ data: q }) }, 20000));
      } catch (e) { lastErr = e; }
    }
    if (round === 0) await new Promise(r => setTimeout(r, 1500));
  }
  throw lastErr ?? new Error('overpass unavailable');
}
