import { describe, it, expect } from 'vitest';
import { aerialUsage } from '../src/lib/aerial-usage';
import { geoGroup } from '../src/lib/geo-cache';

const e = (name: string, transferSize: number, decodedBodySize: number) => ({ name, transferSize, decodedBodySize, encodedBodySize: decodedBodySize }) as PerformanceResourceTiming;

describe('aerial usage', () => {
  it('counts tiles per country, browser cache (transferSize 0) apart from online', () => {
    const u = aerialUsage([e('https://x/geo/ortho/st/a?b', 0, 100), e('https://x/geo/ortho/st/c', 300, 200), e('https://x/geo/ortho/nw/d', 50, 70), e('https://x/other', 1, 1)]);
    expect(u.find(x => x.id === 'st')).toMatchObject({ tiles: 2, cached: 1, online: 1, bytes: 300 });
    expect(u).toHaveLength(2);
  });
});

describe('geoGroup', () => {
  it('sorts cache keys into data kinds', () => {
    expect(geoGroup('surr:forest|1')).toBe('osm');
    expect(geoGroup('overpass:ab')).toBe('osm');
    expect(geoGroup('waldrand-arten:1,2')).toBe('forest');
    expect(geoGroup('/geo/terrain/12/1/2.png')).toBe('terrain');
    expect(geoGroup('/geo/climate?latitude=1')).toBe('climate');
    expect(geoGroup('https://dgm.example/wcs?x')).toBe('dgm');
  });
});
