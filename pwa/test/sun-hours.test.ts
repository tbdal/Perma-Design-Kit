import { describe, it, expect } from 'vitest';
import { sunSamples, sunHoursAt, sunClass, SEASON_DATES, type SunScene } from '../src/lib/sun-hours';

const LAT = 50, LON = 10;
const flat: SunScene = { occluders: [], groundZ: () => 0 };

describe('sun hours', () => {
  it('open ground gets the whole (mean) day length', () => {
    const june = sunSamples([new Date(2026, 5, 21)], LAT, LON, 0, 20);
    const dec = sunSamples([new Date(2026, 11, 21)], LAT, LON, 0, 20);
    const hJune = sunHoursAt(0, 0, flat, june), hDec = sunHoursAt(0, 0, flat, dec);
    expect(hJune).toBeGreaterThan(14.5);
    expect(hJune).toBeLessThan(16.5);
    expect(hDec).toBeGreaterThan(6.5);
    expect(hDec).toBeLessThan(8.5);
  });

  it('a tree shades the ground north of it far more than south of it', () => {
    const samples = sunSamples(SEASON_DATES(2026), LAT, LON, 0, 30);
    // north-up plan: y grows to the south. Tree at (0,0), crown r 3 m, centre 6 m high.
    const scene: SunScene = { groundZ: () => 0, occluders: [{ kind: 'crown', id: 't', x: 0, y: 0, r: 3, zc: 6, rz: 3, transmit: 0.25 }] };
    const north = sunHoursAt(0, -3, scene, samples), south = sunHoursAt(0, 5, scene, samples), open = sunHoursAt(0, 0, flat, samples);
    expect(north).toBeLessThan(open - 2);
    expect(south).toBeGreaterThan(open - 1);
    expect(sunHoursAt(0, 0, scene, samples, 't')).toBeCloseTo(open, 5); // own crown excluded
  });

  it('respects the plan rotation', () => {
    const samples = sunSamples(SEASON_DATES(2026), LAT, LON, 180, 30); // plan "up" points south
    const scene: SunScene = { groundZ: () => 0, occluders: [{ kind: 'crown', id: 't', x: 0, y: 0, r: 3, zc: 6, rz: 3, transmit: 0.25 }] };
    // now geographic north is plan +y
    expect(sunHoursAt(0, 3, scene, samples)).toBeLessThan(sunHoursAt(0, -3, scene, samples) - 2);
  });

  it('a building blocks the sun, a north-facing slope gets less than a south-facing one', () => {
    const samples = sunSamples(SEASON_DATES(2026), LAT, LON, 0, 30);
    const house: SunScene = { groundZ: () => 0, occluders: [{ kind: 'prism', pts: [{ xM: -5, yM: -2 }, { xM: 5, yM: -2 }, { xM: 5, yM: 2 }, { xM: -5, yM: 2 }], z1: 8, minX: -5, minY: -2, maxX: 5, maxY: 2 }] };
    expect(sunHoursAt(0, -3, house, samples)).toBeLessThan(sunHoursAt(0, 6, house, samples) - 3); // north of the house
    expect(sunHoursAt(0, 0, house, samples)).toBe(0); // inside
    // steep ridge running east-west at y = 0 (60 m high, slopes 3:1)
    const z = (_x: number, y: number) => Math.max(0, 60 - 3 * Math.abs(y));
    const ridge: SunScene = { groundZ: z, occluders: [], terrain: { z, minX: -200, minY: -200, maxX: 200, maxY: 200, maxZ: 60, stepM: 1 } };
    // foot of the north slope (plan y negative = north) vs foot of the south slope
    expect(sunHoursAt(0, -21, ridge, samples)).toBeLessThan(sunHoursAt(0, 21, ridge, samples) - 4);
  });

  it('classifies hours', () => {
    expect(sunClass(7)).toBe('full');
    expect(sunClass(4)).toBe('mid');
    expect(sunClass(1)).toBe('shadow');
  });
});
