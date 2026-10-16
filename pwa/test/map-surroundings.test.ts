import { describe, expect, it } from 'vitest';
import { boxesFor, endpoint, isUsable, parseRings, MAX_BOXES } from '../src/lib/map-surroundings';

describe('map surroundings', () => {
  it('covers the view with grid boxes of 0.01°, 4 decimals; too wide → null', () => {
    expect(boxesFor({ south: 52.7521, west: 11.1734, north: 52.7549, east: 11.1790 })).toEqual(['52.7500,11.1700,52.7600,11.1800']);
    const two = boxesFor({ south: 52.7521, west: 11.1734, north: 52.7549, east: 11.1810 })!;
    expect(two).toEqual(['52.7500,11.1700,52.7600,11.1800', '52.7500,11.1800,52.7600,11.1900']);
    expect(boxesFor({ south: 52.0, west: 11.0, north: 53.0, east: 12.0 })).toBeNull();
    expect(MAX_BOXES).toBe(16);
    expect(endpoint('buildings')).toBe('/geo/overpass');
    expect(endpoint('forest')).toBe('/geo/wald');
  });
  it('turns ways and multipolygon relations into rings with holes', () => {
    const sq = (x: number) => [{ lat: 1, lon: x }, { lat: 1, lon: x + 1 }, { lat: 2, lon: x + 1 }, { lat: 2, lon: x }];
    const rings = parseRings({ elements: [
      { type: 'way', geometry: sq(0) },
      { type: 'way', geometry: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }] },                       // too short
      { type: 'relation', members: [{ role: 'outer', geometry: sq(10) }, { role: 'inner', geometry: sq(10.2) }, { role: 'outer', geometry: sq(20) }] },
    ] });
    expect(rings).toHaveLength(3);
    expect(rings[0]).toHaveLength(1);
    expect(rings[1]).toHaveLength(2);   // outer + hole
    expect(rings[2]).toHaveLength(1);
    expect(parseRings(null)).toEqual([]);
  });
  it('an Overpass remark is no answer', () => {
    expect(isUsable({ elements: [] })).toBe(true);
    expect(isUsable({ elements: [], remark: 'runtime error: Query timed out' })).toBe(false);
    expect(isUsable({ remark: 'x' })).toBe(false);
  });
});
