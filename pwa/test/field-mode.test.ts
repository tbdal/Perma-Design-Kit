import { describe, expect, it } from 'vitest';
import { wayTo, arrived } from '../src/lib/field-mode';

describe('wayTo', () => {
  it('gives distance and compass bearing on a north-up plan', () => {
    const w = wayTo({ xM: 0, yM: 0 }, { xM: 3, yM: -4 }, 0);   // right and up → NE-ish
    expect(w.distM).toBeCloseTo(5);
    expect(w.bearingDeg).toBeCloseTo(36.87, 1);
    expect(wayTo({ xM: 0, yM: 0 }, { xM: 0, yM: 10 }, 0).bearingDeg).toBeCloseTo(180);
  });
  it('turns with the plan', () => {
    // plan "up" faces east: going up on the plan means going east
    expect(wayTo({ xM: 0, yM: 0 }, { xM: 0, yM: -5 }, 90).bearingDeg).toBeCloseTo(90);
  });
});

describe('arrived', () => {
  it('uses the GPS accuracy, between 1 and 5 m', () => {
    expect(arrived(0.8, 0.5)).toBe(true);
    expect(arrived(3, 4)).toBe(true);
    expect(arrived(6, 20)).toBe(false);
  });
});
