import { describe, expect, it } from 'vitest';
import { bearingVector, wedgePath, sunriseSunsetBearing, solsticeSectors, sanitizeZones, zoneAt, DEFAULT_ZONE_RADII } from '../src/lib/zones-sectors';

describe('bearingVector', () => {
  it('points north up and east right on a north-up plan', () => {
    const n = bearingVector(0, 0), e = bearingVector(90, 0);
    expect(n.x).toBeCloseTo(0); expect(n.y).toBeCloseTo(-1);
    expect(e.x).toBeCloseTo(1); expect(e.y).toBeCloseTo(0);
  });
  it('follows the plan rotation', () => {
    const n = bearingVector(0, 90);   // plan "up" faces east → north is to the left
    expect(n.x).toBeCloseTo(-1); expect(n.y).toBeCloseTo(0);
  });
});

describe('wedgePath', () => {
  it('draws a small arc for spans under 180° and a large one above', () => {
    expect(wedgePath(0, 0, 10, 90, 180, 0)).toMatch(/A10,10 0 0 1/);
    expect(wedgePath(0, 0, 10, 45, 315, 0)).toMatch(/A10,10 0 1 1/);
  });
});

describe('solstice sun bearings (50° N)', () => {
  const s = solsticeSectors(50, 10);
  it('summer sun rises in the north-east and sets in the north-west', () => {
    expect(s.summer!.rise).toBeGreaterThan(40);
    expect(s.summer!.rise).toBeLessThan(60);
    expect(s.summer!.set).toBeGreaterThan(300);
    expect(s.summer!.set).toBeLessThan(320);
  });
  it('winter sun rises in the south-east and sets in the south-west', () => {
    expect(s.winter!.rise).toBeGreaterThan(120);
    expect(s.winter!.rise).toBeLessThan(135);
    expect(s.winter!.set).toBeGreaterThan(225);
    expect(s.winter!.set).toBeLessThan(240);
  });
  it('has no sunrise in polar night', () => {
    expect(sunriseSunsetBearing({ y: 2026, m: 12, d: 21 }, 80, 15)).toBeNull();
  });
});

describe('zones', () => {
  it('sanitizes stored zones', () => {
    expect(sanitizeZones({ show: true, centerXM: 3, centerYM: 4, radiiM: [5, 1, 2, 3, 4] })!.radiiM).toEqual([1, 2, 3, 4, 5]);
    expect(sanitizeZones({ centerXM: 3, centerYM: 4 })!.radiiM).toEqual(DEFAULT_ZONE_RADII);
    expect(sanitizeZones({ centerXM: 'x' })).toBeUndefined();
  });
  it('finds the zone of a point', () => {
    const z = { show: true, centerXM: 0, centerYM: 0, radiiM: DEFAULT_ZONE_RADII };
    expect(zoneAt(z, 3, 0)).toBe(0);
    expect(zoneAt(z, 10, 0)).toBe(1);
    expect(zoneAt(z, 0, 200)).toBe(5);
  });
});
