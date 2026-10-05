import { describe, it, expect } from 'vitest';
import { sunSamples, sunHoursAt, sunClass, sunIndexConfig, SEASON_DATES, type SunScene, type Occluder } from '../src/lib/sun-hours';

const LAT = 50, LON = 10;
const flat: SunScene = { occluders: [], groundZ: () => 0 };

describe('sun hours', () => {
  it('open ground gets all hours with the sun above 10°', () => {
    const june = sunSamples([new Date(2026, 5, 21)], LAT, LON, 0, 20);
    const dec = sunSamples([new Date(2026, 11, 21)], LAT, LON, 0, 20);
    const hJune = sunHoursAt(0, 0, flat, june), hDec = sunHoursAt(0, 0, flat, dec);
    expect(hJune).toBeGreaterThan(13);
    expect(hJune).toBeLessThan(14.5);
    expect(hDec).toBeGreaterThan(3);
    expect(hDec).toBeLessThan(6.5);
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

describe('sun hours: spatial index', () => {
  it('gives the same hours as testing every occluder', () => {
    // a dense random scene: crowns and buildings all around the probe points
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const occluders: Occluder[] = [];
    for (let i = 0; i < 150; i++) {
      const x = rnd() * 200 - 50, y = rnd() * 200 - 50;
      if (i % 3) occluders.push({ kind: 'crown', id: 'c' + i, x, y, r: 1 + rnd() * 6, zc: 2 + rnd() * 10, rz: 1 + rnd() * 4, transmit: 0.15 });
      else {
        const s = 4 + rnd() * 12;
        occluders.push({ kind: 'prism', pts: [{ xM: x, yM: y }, { xM: x + s, yM: y }, { xM: x + s, yM: y + s * 0.7 }, { xM: x, yM: y + s * 0.7 }], z1: 3 + rnd() * 15, minX: x, minY: y, maxX: x + s, maxY: y + s * 0.7 });
      }
    }
    const scene: SunScene = { occluders, groundZ: () => 0 };
    const samples = sunSamples(SEASON_DATES(2026), 50.9, 7, 25, 30);
    const probes = Array.from({ length: 40 }, () => ({ x: rnd() * 100, y: rnd() * 100 }));
    const indexed = probes.map(p => sunHoursAt(p.x, p.y, scene, samples, 'c1'));
    const saved = sunIndexConfig.minOccluders;
    sunIndexConfig.minOccluders = Infinity;
    try {
      const plain = probes.map(p => sunHoursAt(p.x, p.y, scene, samples, 'c1'));
      // only the early stop under 2 % light may sum up in another order
      indexed.forEach((h, i) => expect(Math.abs(h - plain[i])).toBeLessThan(0.05));
      expect(plain.some(h => h < 4)).toBe(true);   // the scene really casts shade
      expect(plain.some(h => h > 8)).toBe(true);
    } finally { sunIndexConfig.minOccluders = saved; }
  });
});
