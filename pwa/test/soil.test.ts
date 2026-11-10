// Soil per area (#600): which soil a plant stands on, and how it fits.
import { describe, it, expect } from 'vitest';
import { normalizeSoil, soilAt, soilCheck } from '../src/lib/soil';
import { normalizeGardenPlan } from '../src/lib/plant-normalize';
import { createEmptyPlant } from '../src/lib/types';

const sq = (x: number, y: number, s: number) => [{ xM: x, yM: y }, { xM: x + s, yM: y }, { xM: x + s, yM: y + s }, { xM: x, yM: y + s }];
const plant = (o: Record<string, boolean>) => ({ ...createEmptyPlant(), ...o });

describe('soil (#600)', () => {
  it('keeps only valid values', () => {
    expect(normalizeSoil({ tex: 'M', ph: 2, wat: 's', nut: 'rich', x: 1 })).toEqual({ tex: 'M', ph: 2, wat: 's', nut: 'rich' });
    expect(normalizeSoil({ tex: 'X', ph: 7, wat: 'q' })).toBeNull();
    const plan = normalizeGardenPlan({ id: 'p', soil: { ph: 1 }, areas: [{ id: 'a', points: sq(0, 0, 2), soil: { wat: 'w' } }] })!;
    expect(plan.soil).toEqual({ ph: 1 });
    expect(plan.areas[0].soil).toEqual({ wat: 'w' });
  });
  it('the smallest area with a soil counts, else the plot', () => {
    const plan = { soil: { ph: 2 }, areas: [
      { id: 'big', name: '', color: '#000000', points: sq(0, 0, 10), soil: { wat: 'd' as const } },
      { id: 'small', name: '', color: '#000000', points: sq(2, 2, 2), soil: { wat: 's' as const } },
      { id: 'none', name: '', color: '#000000', points: sq(3, 3, 0.5) },
    ] };
    expect(soilAt(plan, { xM: 3.2, yM: 3.2 })).toMatchObject({ areaId: 'small' });   // an area without soil does not hide it
    expect(soilAt(plan, { xM: 8, yM: 8 })).toMatchObject({ areaId: 'big' });
    expect(soilAt(plan, { xM: 20, yM: 20 })).toEqual({ soil: { ph: 2 }, areaId: null });
    expect(soilAt({ areas: [] }, { xM: 0, yM: 0 })).toBeNull();
  });
  it('checks pH and moisture with the plant data; waterlogging is unsuitable; no data, no hint', () => {
    const blueberry = plant({ phVeryAcid: true, phAcid: true, waterMid: true, waterWet: true });
    expect(soilCheck(blueberry, { ph: 2 })).toEqual({ level: 'hint', issues: [{ kind: 'ph', need: [0, 1], have: 2 }] });
    expect(soilCheck(blueberry, { ph: 1, wat: 's' })!.level).toBe('ok');            // takes wet ground
    const lavender = plant({ phNeutral: true, phAlkaline: true, waterDry: true });
    expect(soilCheck(lavender, { wat: 's' })).toEqual({ level: 'unsuitable', issues: [{ kind: 'waterlogged' }] });
    expect(soilCheck(lavender, { wat: 'w' })!.level).toBe('hint');
    expect(soilCheck(plant({ waterWet: true }), { wat: 'd' })).toEqual({ level: 'hint', issues: [{ kind: 'dry' }] });
    expect(soilCheck(plant({}), { ph: 2, wat: 's' })).toBeNull();
    expect(soilCheck(lavender, { tex: 'H', nut: 'poor' })).toBeNull();               // texture and nutrients: not checked yet
  });
});
