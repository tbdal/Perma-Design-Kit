import { describe, it, expect } from 'vitest';
import { polygonAreaM2, polygonPerimeterM, normalizeGridAngle, gridAngleAlongOutline, nearestGridPoint } from '../src/lib/gartenplan-geometry';

const square = [{ xM: 0, yM: 0 }, { xM: 4, yM: 0 }, { xM: 4, yM: 3 }, { xM: 0, yM: 3 }];

describe('polygon measures', () => {
  it('computes area independent of winding', () => {
    expect(polygonAreaM2(square)).toBe(12);
    expect(polygonAreaM2([...square].reverse())).toBe(12);
  });

  it('computes the closed perimeter', () => {
    expect(polygonPerimeterM(square)).toBe(14);
    expect(polygonPerimeterM([{ xM: 0, yM: 0 }, { xM: 3, yM: 0 }, { xM: 0, yM: 4 }])).toBe(12);
  });
});

describe('turned grid', () => {
  it('folds angles into (−45, 45]', () => {
    expect(normalizeGridAngle(0)).toBe(0);
    expect(normalizeGridAngle(100)).toBe(10);
    expect(normalizeGridAngle(-30)).toBe(-30);
    expect(normalizeGridAngle(60)).toBe(-30);
    expect(normalizeGridAngle(180)).toBe(0);
  });
  it('lines up with the longest outline edge', () => {
    // long edge from (0,0) to (100,10): about 5.7° clockwise
    const pts = [{ xM: 0, yM: 0 }, { xM: 100, yM: 10 }, { xM: 98, yM: 20 }, { xM: 0, yM: 8 }];
    expect(gridAngleAlongOutline(pts)).toBeCloseTo(5.7, 1);
    expect(gridAngleAlongOutline([])).toBe(0);
  });
  it('snaps to crossings of the turned grid', () => {
    expect(nearestGridPoint({ xM: 1.1, yM: 1.9 }, 1)).toEqual({ xM: 1, yM: 2 });
    const p = nearestGridPoint({ xM: 0.7, yM: 0.75 }, 1, 45); // one step along the turned x axis
    expect(p.xM).toBeCloseTo(Math.SQRT1_2, 5);
    expect(p.yM).toBeCloseTo(Math.SQRT1_2, 5);
  });
});
