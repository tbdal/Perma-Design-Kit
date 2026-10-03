import { describe, it, expect } from 'vitest';
import { polygonAreaM2, polygonPerimeterM } from '../src/lib/gartenplan-geometry';

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
