import { describe, it, expect } from 'vitest';
import {
  enuToPlan, planToEnu, planToLatLon, latLonToPlan, metersPerPixel, tilesForPlan,
  planCornersToLatLon, bearingFromOrigin, lonLatToMerc, mercToLonLat, planFromLatLngPolygon,
  tilesForRect, maxTilesForScreen, lodTilesForRect, type PlanTile,
} from '../src/lib/gartenplan-geo';
import { formatMeters } from '../src/lib/gartenplan-geometry';
import type { GardenPlanGeo } from '../src/lib/types';

const geo = (rotationDeg = 0): GardenPlanGeo => ({ lat: 50, lon: 8, rotationDeg, basemap: 'osm', opacity: 0.6 });
const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('enuToPlan / planToEnu', () => {
  it('maps east to +x and north to −y when the plan faces north', () => {
    const east = enuToPlan({ e: 1, n: 0 }, 0), north = enuToPlan({ e: 0, n: 1 }, 0);
    close(east.xM, 1); close(east.yM, 0);
    close(north.xM, 0); close(north.yM, -1);
  });

  it('turned 90° clockwise: east is plan-up, south is +x', () => {
    const east = enuToPlan({ e: 1, n: 0 }, 90), south = enuToPlan({ e: 0, n: -1 }, 90);
    close(east.xM, 0); close(east.yM, -1);
    close(south.xM, 1); close(south.yM, 0);
  });

  it('round-trips at arbitrary angles', () => {
    for (const rot of [0, 17, 90, 200, 359]) {
      const back = enuToPlan(planToEnu({ xM: 3.5, yM: -7 }, rot), rot);
      close(back.xM, 3.5); close(back.yM, -7);
    }
  });
});

describe('lat/lon ↔ plan', () => {
  it('Mercator round-trips', () => {
    const ll = mercToLonLat(lonLatToMerc(50.123, 8.456));
    close(ll.lat, 50.123, 1e-9); close(ll.lon, 8.456, 1e-9);
  });

  it('plan 0,0 is the anchor and round-trips through lat/lon', () => {
    const g = geo(33);
    const o = planToLatLon({ xM: 0, yM: 0 }, g);
    close(o.lat, 50); close(o.lon, 8);
    const ll = planToLatLon({ xM: 12.3, yM: 45.6 }, g);
    const p = latLonToPlan(ll.lat, ll.lon, g);
    close(p.xM, 12.3, 1e-4); close(p.yM, 45.6, 1e-4);
  });

  it('keeps ground distances (10 m east ≈ 10 m)', () => {
    const ll = planToLatLon({ xM: 10, yM: 0 }, geo(0));
    close((ll.lon - 8) * 111319.49 * Math.cos(50 * Math.PI / 180), 10, 0.05);
  });

  it('bearing to the plan’s top-right corner is rotation + 90°', () => {
    const g = geo(30);
    const [, tr] = planCornersToLatLon(10, 5, g);
    close(bearingFromOrigin(tr.lat, tr.lon, g), 120, 1e-6);
  });
});

describe('tilesForPlan', () => {
  it('picks the coarsest zoom still as sharp as the screen, capped at maxZoom', () => {
    expect(tilesForPlan(20, 20, geo(0), 0.05, 19)[0].z).toBe(19);
    const z = tilesForPlan(20, 20, geo(0), 1, 19)[0].z;
    expect(metersPerPixel(50, z)).toBeLessThanOrEqual(1);
    expect(metersPerPixel(50, z - 1)).toBeGreaterThan(1);
  });

  it('covers every corner of the rotated rectangle', () => {
    const tiles = tilesForPlan(30, 10, geo(45), 0.1, 19);
    for (const c of [{ xM: 0, yM: 0 }, { xM: 30, yM: 0 }, { xM: 30, yM: 10 }, { xM: 0, yM: 10 }]) {
      const p = planToEnu(c, 45);
      const hit = tiles.some(t => p.e >= t.eM && p.e <= t.eM + t.sizeM && -p.n >= t.sM && -p.n <= t.sM + t.sizeM);
      expect(hit).toBe(true);
    }
  });

  it('never returns more than 64 tiles', () => {
    expect(tilesForPlan(500, 500, geo(10), 0.01, 19).length).toBeLessThanOrEqual(64);
  });

  it('with the cap of the screen it is never coarser than the screen (high-DPI, turned plans)', () => {
    const wantZ = (mpp: number) => { let z = 0; while (z < 19 && metersPerPixel(50, z) > mpp) z++; return z; };
    for (const [cssW, cssH, dpr] of [[1200, 800, 1], [1200, 800, 2], [390, 700, 3], [2400, 1300, 1.5]]) {
      const cap = maxTilesForScreen(cssW * dpr, cssH * dpr);
      for (const rot of [0, 25, 45]) {
        for (let viewW = 50; viewW < 3000; viewW *= 1.07) {
          const mpp = viewW / cssW / dpr;
          const tiles = tilesForRect({ minX: 0, minY: 0, maxX: viewW, maxY: viewW * cssH / cssW }, geo(rot), mpp, 19, cap);
          expect(tiles[0].z).toBe(wantZ(mpp));
        }
      }
    }
  });
});

describe('lodTilesForRect', () => {
  // Camera 30 m above the anchor: the wanted zoom falls with the distance, as in 3D.
  const want = (t: PlanTile) => {
    const d = Math.hypot(Math.max(t.eM, 0, -t.eM - t.sizeM), Math.max(t.sM, 0, -t.sM - t.sizeM), 30);
    return Math.max(0, Math.log2(metersPerPixel(50, 0) / (d * 0.0006)));
  };
  const rect = { minX: -1500, minY: -1500, maxX: 1500, maxY: 1500 };

  it('is sharp in front of the camera, coarse far away, within the budget', () => {
    const tiles = lodTilesForRect(rect, geo(0), 19, 256, want);
    expect(tiles.length).toBeLessThanOrEqual(256);
    const near = tiles.find(t => t.eM <= 0 && t.eM + t.sizeM >= 0 && t.sM <= 0 && t.sM + t.sizeM >= 0)!;
    expect(near.z).toBe(19);
    expect(Math.min(...tiles.map(t => t.z))).toBeLessThan(17);
    // The nearest ~200 m as sharp as the screen needs (nearest first while the budget lasts).
    const gap = (t: PlanTile) => Math.hypot(Math.max(t.eM, 0, -t.eM - t.sizeM), Math.max(t.sM, 0, -t.sM - t.sizeM));
    expect(tiles.filter(t => gap(t) < 200).every(t => t.z >= Math.min(19, Math.ceil(want(t))))).toBe(true);
  });

  it('covers the start tiles exactly once (no gaps, no overlaps)', () => {
    const start = tilesForRect(rect, geo(20), 0, 19, 16);
    const tiles = lodTilesForRect(rect, geo(20), 19, 160, want);
    const area = (ts: PlanTile[]) => ts.reduce((s, t) => s + t.sizeM ** 2, 0);
    close(area(tiles), area(start), 1e-3 * area(start));
    for (const a of tiles) for (const b of tiles) {
      if (a === b) continue;
      const ox = Math.min(a.eM + a.sizeM, b.eM + b.sizeM) - Math.max(a.eM, b.eM);
      const oy = Math.min(a.sM + a.sizeM, b.sM + b.sizeM) - Math.max(a.sM, b.sM);
      expect(ox <= 1e-6 || oy <= 1e-6).toBe(true);
    }
  });
});

describe('planFromLatLngPolygon', () => {
  // A 12 m (east) × 8 m (north) rectangle drawn on the map, NE corner first.
  const anchor = geo(0);
  const corner = (xM: number, yM: number) => planToLatLon({ xM, yM }, anchor);
  const drawn = [corner(12, 0), corner(12, 8), corner(0, 8), corner(0, 0)];

  it('anchors 0,0 at the north-west corner minus the margin, north-up', () => {
    const r = planFromLatLngPolygon(drawn, 1, 1);
    expect(r.geo.rotationDeg).toBe(0);
    expect(r.widthM).toBe(14);
    expect(r.heightM).toBe(10);
    close(r.boundary[3].xM, 1, 1e-3); close(r.boundary[3].yM, 1, 1e-3);
    close(r.boundary[1].xM, 13, 1e-3); close(r.boundary[1].yM, 9, 1e-3);
  });

  it('rounds the size up to whole grid cells', () => {
    const r = planFromLatLngPolygon(drawn, 0.3, 2);
    expect(r.widthM % 2).toBe(0);
    expect(r.heightM % 2).toBe(0);
    expect(r.widthM).toBeGreaterThanOrEqual(12.6);
  });

  it('rejects fewer than 3 points', () => {
    expect(() => planFromLatLngPolygon(drawn.slice(0, 2), 1, 1)).toThrow();
  });
});

describe('formatMeters', () => {
  it('uses a decimal comma in German', () => {
    expect(formatMeters(3.254, 'de')).toBe('3,25 m');
    expect(formatMeters(3.254, 'en')).toBe('3.25 m');
  });
});
