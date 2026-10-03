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
});
