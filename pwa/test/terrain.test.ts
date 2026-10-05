import { describe, it, expect } from 'vitest';
import { terrariumElevation, sampleGrid, slopeInfo, contourSegments, contourInterval, type ElevationGrid, gridRange } from '../src/lib/terrain';

/** 21 × 21 grid, 1 m cells, a plane rising 0.1 m per metre towards +x (east). */
function plane(ax: number, by: number, base = 500): ElevationGrid {
  const nx = 21, ny = 21, heights = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) heights[j * nx + i] = base + ax * i + by * j;
  return { minX: 0, minY: 0, cellM: 1, nx, ny, heights, sources: ['test'] };
}

describe('terrain', () => {
  it('decodes terrarium pixels', () => {
    expect(terrariumElevation(128, 0, 0)).toBe(0);
    expect(terrariumElevation(129, 244, 128)).toBeCloseTo(500.5, 6);
  });

  it('samples bilinearly and clamps at the edge', () => {
    const g = plane(0.1, 0);
    expect(sampleGrid(g, 5.5, 3)).toBeCloseTo(500.55, 5);
    expect(sampleGrid(g, -10, 3)).toBeCloseTo(500, 5);
  });

  it('fits slope and aspect (rising east → faces west)', () => {
    const s = slopeInfo(plane(0.1, 0), () => true)!;
    expect(s.slopeDeg).toBeCloseTo(Math.atan(0.1) * 180 / Math.PI, 3);
    expect(s.aspectDeg).toBeCloseTo(270, 3);
    expect(s.minM).toBe(500);
    expect(s.maxM).toBeCloseTo(502, 5);
  });

  it('a plan rising towards +y (south) faces north; rotation turns the bearing', () => {
    expect(slopeInfo(plane(0, 0.2), () => true)!.aspectDeg).toBeCloseTo(0, 3);
    expect(slopeInfo(plane(0, 0.2), () => true, 90)!.aspectDeg).toBeCloseTo(90, 3);
  });

  it('reports flat ground without aspect', () => {
    expect(slopeInfo(plane(0, 0), () => true)!.aspectDeg).toBeNull();
  });

  it('draws contour segments at the requested interval', () => {
    const segs = contourSegments(plane(0.1, 0), 0.5);
    const levels = [...new Set(segs.map(s => s.level))];
    expect(levels).toEqual(expect.arrayContaining([500.5, 501, 501.5]));
    expect(levels).not.toContain(500); // exactly the minimum: no crossing
    // the 501 m line runs north–south at x = 10
    for (const s of segs.filter(s => s.level === 501)) { expect(s.seg[0]).toBeCloseTo(10, 5); expect(s.seg[2]).toBeCloseTo(10, 5); }
  });

  it('picks a readable contour interval', () => {
    expect(contourInterval(2)).toBe(0.25);
    expect(contourInterval(30)).toBe(5);
  });
});

describe('gridRange', () => {
  it('handles grids far bigger than the argument limit', () => {
    const heights = new Float32Array(2_000_000).fill(50);
    heights[123_456] = -3; heights[1_999_999] = 812;
    expect(gridRange({ heights })).toEqual({ min: -3, max: 812 });
  });
});
