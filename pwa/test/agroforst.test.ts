// Agroforestry patterns (#563): repeating a pattern along a row, the pattern's repeat length, extra anchor trees.
import { describe, it, expect } from 'vitest';
import { patternAlongPolyline } from '../src/lib/gartenplan-geometry';
import { layoutPolyculture, patternOf } from '../src/lib/polyculture-layout';
import { normalizePolyculture } from '../src/lib/plant-normalize';
import { createEmptyPlant, createEmptyPolyculture } from '../src/lib/types';

describe('agroforestry pattern (#563)', () => {
  const spots = [{ plantId: 'tree', xM: 0, yM: 0 }, { plantId: 'shrub', xM: 2, yM: 1 }];

  it('repeats along a straight row, y across it (south when walking east), nothing past the end', () => {
    const out = patternAlongPolyline([{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }], spots, 4);
    expect(out.map(p => [p.plantId, p.xM, p.yM])).toEqual([
      ['tree', 0, 0], ['shrub', 2, 1], ['tree', 4, 0], ['shrub', 6, 1], ['tree', 8, 0], ['shrub', 10, 1],
    ]);
  });
  it('lays only whole patterns, as many as fit; a short line still gets one', () => {
    const out = patternAlongPolyline([{ xM: 0, yM: 0 }, { xM: 9, yM: 0 }], spots, 4);
    expect(out.filter(p => p.plantId === 'tree').map(p => p.xM)).toEqual([0, 4]);   // a third would end at 10 > 9
    expect(patternAlongPolyline([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }], spots, 4).map(p => p.plantId)).toEqual(['tree']);
  });
  it('follows a bend: after the corner x runs south and "right" is west', () => {
    const out = patternAlongPolyline([{ xM: 0, yM: 0 }, { xM: 4, yM: 0 }, { xM: 4, yM: 10 }], spots, 6);
    const second = out.filter(p => p.plantId === 'tree')[1];       // 6 m along: 2 m past the corner
    expect(second.xM).toBeCloseTo(4); expect(second.yM).toBeCloseTo(2);
    const shrub2 = out.filter(p => p.plantId === 'shrub')[1];       // 8 m along, 1 m to the right (west)
    expect(shrub2.xM).toBeCloseTo(3); expect(shrub2.yM).toBeCloseTo(4);
  });
  it('repeat length = extent along the row + one grid step; more trees of the anchor species keep their spots', () => {
    const t = { ...createEmptyPlant(), id: 't', latinName: 'Juglans regia', widthM: 8 };
    const pc = { ...createEmptyPolyculture(), anchorPlantId: 't', gridM: 2, kind: 'agroforst' as const,
      members: [{ plantId: 't', role: 'other' as const, notes: '', dxM: 12, dyM: 0 }] };
    const plants = new Map([['t', t]]);
    expect(layoutPolyculture(pc, plants, { xM: 0, yM: 0 }, 30)).toEqual([{ plantId: 't', xM: 0, yM: 0 }, { plantId: 't', xM: 12, yM: 0 }]);
    expect(patternOf(pc, plants).periodM).toBe(14);
    expect(normalizePolyculture({ ...pc, gridM: 0.05 })).toMatchObject({ kind: 'agroforst' });
    expect(normalizePolyculture({ ...pc, gridM: 0.05 })!.gridM).toBeUndefined();
    expect(normalizePolyculture({ ...pc, kind: 'x' })!.kind).toBeUndefined();
  });
});
