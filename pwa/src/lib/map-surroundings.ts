// Buildings and forests around a spot, independent of any garden plan: drawn on
// the Leaflet maps (creating a plan, locating a grid plan) so the surroundings
// can be judged before a plan exists. Data: OpenStreetMap through our own cache
// (/geo/overpass for buildings, /geo/wald for forests), loaded in a fixed grid
// of small boxes so each box is fetched once for everybody (and panning reuses
// what is there). Pure part: box grid and turning Overpass JSON into rings.

export type SurrKind = 'buildings' | 'forest';
export interface LatLng { lat: number; lon: number }
/** Outer ring first, then holes. */
export type Rings = LatLng[][];

/** Box size of the grid (degrees): ≈ 1.1 km high, 0.7–0.8 km wide in Central Europe. */
export const STEP_DEG = 0.01;
/** Below this zoom the view is too wide to load boxes (a hint is shown instead). */
export const MIN_ZOOM = 15;
/** At most this many boxes per kind at once. */
export const MAX_BOXES = 16;

const f4 = (v: number) => v.toFixed(4);

/** The grid boxes ("s,w,n,e", 4 decimals) covering the bounds; null if more than MAX_BOXES. */
export function boxesFor(b: { south: number; west: number; north: number; east: number }): string[] | null {
  const i0 = Math.floor(b.south / STEP_DEG), i1 = Math.floor(b.north / STEP_DEG);
  const j0 = Math.floor(b.west / STEP_DEG), j1 = Math.floor(b.east / STEP_DEG);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > MAX_BOXES) return null;
  const out: string[] = [];
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(`${f4(i * STEP_DEG)},${f4(j * STEP_DEG)},${f4((i + 1) * STEP_DEG)},${f4((j + 1) * STEP_DEG)}`);
  return out;
}

export const endpoint = (kind: SurrKind) => (kind === 'buildings' ? '/geo/overpass' : '/geo/wald');

interface OsmEl { type: string; geometry?: { lat: number; lon: number }[]; members?: { role?: string; geometry?: { lat: number; lon: number }[] }[]; tags?: Record<string, string> }

const ring = (g: { lat: number; lon: number }[] | undefined): LatLng[] => (g ?? []).filter(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lon)).map(p => ({ lat: p.lat, lon: p.lon }));

/** Polygons of an Overpass answer (ways, multipolygon relations with holes); empty rings dropped. */
export function parseRings(json: unknown): Rings[] {
  const els = (json as { elements?: OsmEl[] })?.elements;
  if (!Array.isArray(els)) return [];
  const out: Rings[] = [];
  for (const e of els) {
    if (e.type === 'way') {
      const r = ring(e.geometry);
      if (r.length >= 3) out.push([r]);
    } else if (e.type === 'relation' && Array.isArray(e.members)) {
      const outer = e.members.filter(m => m.role === 'outer').map(m => ring(m.geometry)).filter(r => r.length >= 3);
      const inner = e.members.filter(m => m.role === 'inner').map(m => ring(m.geometry)).filter(r => r.length >= 3);
      // Several outer parts are separate polygons; the holes belong to the first (good enough for a backdrop).
      outer.forEach((o, i) => out.push(i === 0 ? [o, ...inner] : [o]));
    }
  }
  return out;
}

/** Overpass sends HTTP 200 with a "remark" when it is overloaded: that is no answer. */
export function isUsable(json: unknown): boolean {
  const j = json as { elements?: unknown; remark?: unknown };
  return Array.isArray(j?.elements) && !(typeof j.remark === 'string' && /error|timed out|out of memory|too many/i.test(j.remark));
}
