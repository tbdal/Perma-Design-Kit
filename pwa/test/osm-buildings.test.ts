import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildingHeight, parseBuildings, buildingsQuery, buildingsBbox, fetchBuildings, OVERPASS_PROXY } from '../src/lib/osm-buildings';

const geo = { lat: 50, lon: 10, rotationDeg: 0, basemap: 'osm' as const, opacity: 1 };
const sq = (lat: number, lon: number, d = 0.0001) => [
  { lat, lon }, { lat, lon: lon + d }, { lat: lat - d, lon: lon + d }, { lat: lat - d, lon }, { lat, lon },
];

describe('OSM buildings', () => {
  it('derives heights from height, levels or the building type', () => {
    expect(buildingHeight({ building: 'yes', height: '12.5 m' })).toBe(12.5);
    expect(buildingHeight({ building: 'yes', 'building:levels': '3' })).toBe(11);
    expect(buildingHeight({ building: 'garage' })).toBe(3);
    expect(buildingHeight({ building: 'yes' })).toBe(7);
  });

  it('parses ways and multipolygon outers into plan footprints', () => {
    const b = parseBuildings({ elements: [
      { type: 'way', tags: { building: 'house' }, geometry: sq(50, 10) },
      { type: 'way', tags: { building: 'yes', location: 'underground' }, geometry: sq(50, 10.001) },
      { type: 'way', tags: { highway: 'path' }, geometry: sq(50, 10.002) },
      { type: 'relation', tags: { building: 'yes', type: 'multipolygon' }, members: [{ role: 'outer', geometry: sq(49.999, 10) }, { role: 'inner', geometry: sq(49.99905, 10.00002, 0.00003) }] },
    ] }, geo);
    expect(b).toHaveLength(2);
    expect(b[0].pts).toHaveLength(4);                 // closing point dropped
    expect(b[0].pts[0].xM).toBeCloseTo(0, 3);        // NW corner at the origin
    expect(b[0].pts[2].yM).toBeGreaterThan(10);      // ~11 m south
    expect(b[0].heightM).toBe(8);
  });

  it('joins split multipolygon ways into rings and keeps courtyards as holes', () => {
    const a = { lat: 50, lon: 10 }, b = { lat: 50, lon: 10.0004 }, c = { lat: 49.9997, lon: 10.0004 }, d = { lat: 49.9997, lon: 10 };
    const ia = { lat: 49.9999, lon: 10.0001 }, ib = { lat: 49.9999, lon: 10.0003 }, ic = { lat: 49.99985, lon: 10.0003 }, id = { lat: 49.99985, lon: 10.0001 };
    const res = parseBuildings({ elements: [{ type: 'relation', tags: { building: 'yes', type: 'multipolygon' }, members: [
      { role: 'outer', geometry: [a, b] },          // the outer ring in three pieces,
      { role: 'outer', geometry: [d, c] },          // one of them reversed
      { role: 'outer', geometry: [b, c] },
      { role: 'outer', geometry: [d, a] },
      { role: 'inner', geometry: [ia, ib, ic, id, ia] },
    ] }] }, geo);
    expect(res).toHaveLength(1);
    expect(res[0].pts).toHaveLength(4);
    expect(res[0].holes).toHaveLength(1);
    expect(res[0].holes![0]).toHaveLength(4);
  });

  it('builds a bbox query around a plan rectangle', () => {
    const q = buildingsQuery(geo, { minX: -100, minY: -100, maxX: 100, maxY: 100 });
    expect(q).toContain('way["building"](49.99');
    expect(q).toContain('out geom tags');
  });

  it('widens the bbox to 4 decimals, the same for the same plan', () => {
    const r = { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    const bb = buildingsBbox(geo, r);
    expect(bb).toMatch(/^\d+\.\d{4},\d+\.\d{4},\d+\.\d{4},\d+\.\d{4}$/);
    const [s, w, n, e] = bb.split(',').map(Number);
    expect(s).toBeLessThan(50 - 100 / 111320 + 1e-9);
    expect(n).toBeGreaterThan(50 + 100 / 111320 - 1e-9);
    expect(w).toBeLessThan(10); expect(e).toBeGreaterThan(10);
    expect(buildingsBbox(geo, { ...r })).toBe(bb);
  });
});

describe('fetching buildings', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const ok = (elements: unknown[] = []) => new Response(JSON.stringify({ elements }), { status: 200 });
  const house = { type: 'way', tags: { building: 'house' }, geometry: sq(50.0001, 10.0001) };

  it('asks our own server with just the bbox', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => { calls.push(url); return ok([house]); });
    const b = await fetchBuildings(geo, { minX: -40, minY: -40, maxX: 41, maxY: 41 });
    expect(b).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(new RegExp(`^${OVERPASS_PROXY}\\?bbox=[\\d.,]+$`));
  });

  it('refreshes a cached error answer once, then falls back to the public instances', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      if (url.startsWith(OVERPASS_PROXY)) return new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out in "query" at line 1' }), { status: 200 });
      return ok([house]);
    });
    const b = await fetchBuildings(geo, { minX: -42, minY: -42, maxX: 43, maxY: 43 });
    expect(b).toHaveLength(1);
    expect(calls[0]).not.toContain('refresh');
    expect(calls[1]).toContain('&refresh=1');
    expect(calls[2]).toContain('overpass-api.de');
  });

  it('skips a server that is not there (dev, other hosting)', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url);
      return url.startsWith(OVERPASS_PROXY) ? new Response('<!doctype html>', { status: 404 }) : ok([house]);
    });
    await fetchBuildings(geo, { minX: -44, minY: -44, maxX: 45, maxY: 45 });
    expect(calls.map(u => u.startsWith(OVERPASS_PROXY))).toEqual([true, false]);
  });
});
