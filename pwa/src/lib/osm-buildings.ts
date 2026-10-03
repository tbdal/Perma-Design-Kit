import type { GardenPlanGeo, GardenPlanPoint } from './types';
import { latLonToPlan, planToLatLon, type PlanRect } from './gartenplan-geo';

// Buildings around the garden from OpenStreetMap (Overpass API): footprints
// in plan meters plus a height from `height`, `building:levels` or a guess
// by building type. Used for 3D blocks and as sun occluders (sun-hours.ts).
// © OpenStreetMap contributors, ODbL.

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
export const BUILDINGS_ATTRIBUTION = 'Gebäude: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

export interface Building { pts: GardenPlanPoint[]; heightM: number; }

const LEVEL_M = 3;
const TYPE_HEIGHT: Record<string, number> = {
  garage: 3, garages: 3, shed: 2.5, carport: 2.5, hut: 2.5, roof: 4, greenhouse: 3, kiosk: 3,
  house: 8, detached: 8, semidetached_house: 8, terrace: 9, bungalow: 5, farm: 8,
  residential: 9, apartments: 14, dormitory: 14, hotel: 15,
  church: 18, cathedral: 30, chapel: 8, school: 11, commercial: 10, retail: 7, office: 14,
  industrial: 10, warehouse: 9, barn: 8, farm_auxiliary: 6, stable: 6, service: 4,
};

/** Height in metres from OSM tags. */
export function buildingHeight(tags: Record<string, string>): number {
  const num = (v?: string) => {
    const m = v?.replace(',', '.').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  const h = num(tags.height);
  if (h > 0) return h;
  const lv = num(tags['building:levels']);
  if (lv > 0) return lv * LEVEL_M + (num(tags['roof:levels']) > 0 ? num(tags['roof:levels']) * LEVEL_M * 0.6 : 2);
  return TYPE_HEIGHT[tags.building] ?? 7;
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
    const heightM = buildingHeight(tags);
    if (el.type === 'way' && el.geometry && el.geometry.length >= 3) out.push({ pts: ring(el.geometry), heightM });
    if (el.type === 'relation') {
      for (const m of el.members ?? []) {
        if (m.role === 'outer' && m.geometry && m.geometry.length >= 3) out.push({ pts: ring(m.geometry), heightM });
      }
    }
  }
  return out.filter(b => b.pts.length >= 3);
}

/** Overpass query for all buildings in a plan rectangle. */
export function buildingsQuery(geo: GardenPlanGeo, rect: PlanRect): string {
  const c = [
    planToLatLon({ xM: rect.minX, yM: rect.minY }, geo), planToLatLon({ xM: rect.maxX, yM: rect.minY }, geo),
    planToLatLon({ xM: rect.maxX, yM: rect.maxY }, geo), planToLatLon({ xM: rect.minX, yM: rect.maxY }, geo),
  ];
  const s = Math.min(...c.map(p => p.lat)), n = Math.max(...c.map(p => p.lat));
  const w = Math.min(...c.map(p => p.lon)), e = Math.max(...c.map(p => p.lon));
  const bb = [s, w, n, e].map(v => v.toFixed(6)).join(',');
  return `[out:json][timeout:25];(way["building"](${bb});relation["building"]["type"="multipolygon"](${bb}););out geom tags;`;
}

const cache = new Map<string, Building[]>();

/** Buildings in `rect` (cached per session); tries the endpoints in turn. */
export async function fetchBuildings(geo: GardenPlanGeo, rect: PlanRect): Promise<Building[]> {
  const q = buildingsQuery(geo, rect);
  const hit = cache.get(q);
  if (hit) return hit;
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const list = parseBuildings(await res.json(), geo);
      cache.set(q, list);
      return list;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('overpass unavailable');
}
