import { describe, it, expect } from 'vitest';
import { createEmptyGardenPlan, type GardenPlan } from '../src/lib/types';
import { growPlanToFit } from '../src/lib/gartenplan-extent';
import { planToLatLon } from '../src/lib/gartenplan-geo';

function plan(): GardenPlan {
  return {
    ...createEmptyGardenPlan(),
    areaWidthM: 10, areaHeightM: 10, gridSpacingM: 1,
    boundary: [{ xM: 1, yM: 1 }, { xM: 9, yM: 1 }, { xM: 9, yM: 9 }],
    areas: [{ id: 'a', name: 'Beet', color: '#22c55e', points: [{ xM: 2, yM: 2 }, { xM: 4, yM: 2 }, { xM: 4, yM: 4 }] }],
    placements: [{ id: 'p', plantId: 'x', xM: 5, yM: 5, notes: '' }],
    geo: { lat: 50, lon: 8, rotationDeg: 0, basemap: 'osm', opacity: 0.7 },
  };
}

describe('growPlanToFit', () => {
  it('does nothing when everything fits', () => {
    const p = plan();
    expect(growPlanToFit(p)).toBeNull();
    expect(p.areaWidthM).toBe(10);
  });

  it('grows to the right/bottom without shifting', () => {
    const p = plan();
    p.boundary[1].xM = 12.4;
    expect(growPlanToFit(p)).toEqual({ dx: 0, dy: 0 });
    expect(p.areaWidthM).toBe(14);       // ceil(12.4 + 1)
    expect(p.areaHeightM).toBe(10);
  });

  it('grows to the left/top, shifts everything and moves the map anchor along', () => {
    const p = plan();
    const before = planToLatLon({ xM: 5, yM: 5 }, p.geo!);
    p.boundary[0] = { xM: -2.5, yM: -0.5 };
    const r = growPlanToFit(p)!;
    expect(r).toEqual({ dx: 4, dy: 2 });  // floor(-2.5 - 1) = -4, floor(-0.5 - 1) = -2
    expect(p.boundary[0]).toEqual({ xM: 1.5, yM: 1.5 });
    expect(p.areas[0].points[0]).toEqual({ xM: 6, yM: 4 });
    expect(p.placements[0]).toMatchObject({ xM: 9, yM: 7 });
    expect(p.areaWidthM).toBe(14);
    expect(p.areaHeightM).toBe(12);
    // the plant stays on the same spot on Earth
    const after = planToLatLon({ xM: 9, yM: 7 }, p.geo!);
    expect(after.lat).toBeCloseTo(before.lat, 9);
    expect(after.lon).toBeCloseTo(before.lon, 9);
  });

  it('never grows past 5 km a side; what was dragged further is held at the edge', () => {
    const p = createEmptyGardenPlan();
    Object.assign(p, { areaWidthM: 4990, areaHeightM: 100, gridSpacingM: 1, boundary: [{ xM: 0, yM: 0 }, { xM: 4990, yM: 0 }, { xM: 4990, yM: 100 }], placements: [] });
    p.placements.push({ id: 'x', plantId: 'p', xM: 5300, yM: 50, notes: '' } as any);
    expect(growPlanToFit(p)).toEqual({ dx: 0, dy: 0 });
    expect(p.areaWidthM).toBe(5000);
    expect(p.placements[0].xM).toBe(5000);
    // already at the limit: held, not grown (no "plan grown" message)
    p.placements[0].xM = 5200;
    expect(growPlanToFit(p)).toBeNull();
    expect(p.placements[0].xM).toBe(5000);
    // to the left as well
    p.placements[0].xM = -50;
    expect(growPlanToFit(p)).toBeNull();
    expect(p.placements[0].xM).toBe(0);
  });
});
