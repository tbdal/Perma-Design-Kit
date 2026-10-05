import { describe, expect, it } from 'vitest';
import type { ElevationGrid } from '../src/lib/terrain';
import { fillDepressions, flowDirections, flowAccumulation, analyzeWater, roofRainM3 } from '../src/lib/water';
import { polygonAreaM2 } from '../src/lib/gartenplan-geometry';

function grid(nx: number, ny: number, f: (x: number, y: number) => number, cellM = 1): ElevationGrid {
  const heights = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = f(i * cellM, j * cellM);
  return { minX: 0, minY: 0, cellM, nx, ny, heights, sources: [] };
}

describe('flow on a slope', () => {
  // falls towards +y (south) by 5 %
  const g = grid(40, 40, (_x, y) => 10 - y * 0.05);
  it('routes every inner cell downhill and accumulates towards the bottom', () => {
    const z = fillDepressions(g);
    const dir = flowDirections(g, z);
    const k = 10 * 40 + 20;
    expect(dir[k]).toBe(11 * 40 + 20);           // straight down
    const acc = flowAccumulation(g, z, dir);
    expect(acc[38 * 40 + 20]).toBeGreaterThan(acc[5 * 40 + 20]);
  });
  it('suggests swales along the contour (horizontal on a south-facing slope)', () => {
    // a valley so the runoff concentrates: V-shape around x = 20
    const v = grid(60, 60, (x, y) => 10 - y * 0.05 + Math.abs(x - 30) * 0.03);
    const w = analyzeWater(v, { rect: { minX: 0, minY: 0, maxX: 59, maxY: 59 }, minCatchmentM2: 50 });
    expect(w.flow.length).toBeGreaterThan(0);
    expect(w.swales.length).toBeGreaterThan(0);
    const s = w.swales[0];
    expect(Math.abs(s.y2 - s.y1)).toBeLessThan(0.5);   // level
    expect(Math.abs(s.x2 - s.x1)).toBeGreaterThan(3);
    expect(Math.abs((s.x1 + s.x2) / 2 - 30)).toBeLessThan(2); // in the valley line
  });
});

describe('sinks', () => {
  it('finds a hollow with its depth and volume', () => {
    // plane sloping south with a 0.5 m deep bowl of radius 5 m at (20, 20)
    const g = grid(40, 40, (x, y) => 10 - y * 0.01 - Math.max(0, 0.5 * (1 - Math.hypot(x - 20, y - 20) ** 2 / 25)));
    const w = analyzeWater(g, { rect: { minX: 0, minY: 0, maxX: 39, maxY: 39 } });
    expect(w.sinks.length).toBe(1);
    expect(Math.hypot(w.sinks[0].xM - 20, w.sinks[0].yM - 20)).toBeLessThan(2);
    expect(w.sinks[0].depthM).toBeGreaterThan(0.3);
    expect(w.sinks[0].volumeM3).toBeGreaterThan(5);
  });
  it('finds none on a plain slope', () => {
    expect(analyzeWater(grid(30, 30, (_x, y) => 5 - y * 0.02), { rect: { minX: 0, minY: 0, maxX: 29, maxY: 29 } }).sinks).toEqual([]);
  });
});

describe('roof rain', () => {
  it('area × rain × runoff', () => {
    const a = polygonAreaM2([{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 12 }, { xM: 0, yM: 12 }]);
    expect(a).toBe(120);
    expect(roofRainM3(a, 800)).toBeCloseTo(76.8);
  });
});
