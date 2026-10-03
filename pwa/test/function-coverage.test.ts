import { describe, it, expect } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, createEmptyPolyculture, type PlantData } from '../src/lib/types';
import { coverageGrid, coverageSummary, findGaps, suggestPlants, hasFunc, influenceRadius } from '../src/lib/function-coverage';
import { layoutPolyculture } from '../src/lib/polyculture-layout';

const P = (id: string, extra: Partial<PlantData>): PlantData => ({ ...createEmptyPlant(), id, latinName: id, ...extra });
const clover = P('clover', { nitrogenFix: true, groundCover: true, widthM: 0.5, heightM: 0.2, sunFull: true });
const comfrey = P('comfrey', { mineralFix: true, insects: true, widthM: 1, heightM: 1 });
const apple = P('apple', { eatable: true, widthM: 6, heightM: 6, sunFull: true });
const alder = P('alder', { nitrogenFix: true, widthM: 4, heightM: 8, sunFull: true });
const plantsById = new Map([clover, comfrey, apple, alder].map(p => [p.id, p]));

function plan() {
  return {
    ...createEmptyGardenPlan(), areaWidthM: 20, areaHeightM: 10, gridSpacingM: 1, yearsSincePlanting: 30,
    boundary: [{ xM: 0, yM: 0 }, { xM: 20, yM: 0 }, { xM: 20, yM: 10 }, { xM: 0, yM: 10 }],
    placements: [{ id: 'c', plantId: 'clover', xM: 3, yM: 5, notes: '' }, { id: 'a', plantId: 'apple', xM: 10, yM: 5, notes: '' }],
  };
}

describe('function coverage', () => {
  it('covers functions only around plants that have them', () => {
    const g = coverageGrid(plan(), plantsById, 1);
    expect(g.cells).toHaveLength(200);
    const near = g.cells.find(c => c.xM === 3.5 && c.yM === 5.5)!;
    const far = g.cells.find(c => c.xM === 18.5 && c.yM === 5.5)!;
    expect(hasFunc(near.mask, 'nitrogenFix')).toBe(true);
    expect(hasFunc(far.mask, 'nitrogenFix')).toBe(false);
    expect(hasFunc(near.mask, 'insects')).toBe(false); // clover isn't an insectary here
  });

  it('summarises the covered share per function', () => {
    const s = coverageSummary(coverageGrid(plan(), plantsById, 1));
    expect(s.nitrogenFix).toBeGreaterThan(0.05);
    expect(s.nitrogenFix).toBeLessThan(0.3);
    expect(s.insects).toBe(0);
  });

  it('finds the largest gap far from existing coverage', () => {
    const gaps = findGaps(coverageGrid(plan(), plantsById, 1), 'nitrogenFix', 2);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps[0].xM).toBeGreaterThan(14);  // the east end, away from the clover
    expect(gaps[0].areaM2).toBeGreaterThan(20);
  });

  it('suggests fitting plants with the missing function', () => {
    const p = plan();
    const s = suggestPlants('nitrogenFix', [clover, comfrey, apple, alder], p, plantsById, { xM: 17, yM: 5 }, 40);
    expect(s.map(x => x.id)).toEqual(expect.arrayContaining(['alder', 'clover']));
    expect(s.map(x => x.id)).not.toContain('comfrey');
  });

  it('gives insectaries a wider reach than ground cover', () => {
    expect(influenceRadius('insects', 1, 1)).toBeGreaterThan(influenceRadius('groundCover', 1, 1));
  });
});

describe('polyculture package layout', () => {
  it('puts the anchor in the centre and members in role rings', () => {
    const pc = { ...createEmptyPolyculture(), id: 'pc1', anchorPlantId: 'apple', members: [
      { plantId: 'clover', role: 'groundCover' as const, notes: '' },
      { plantId: 'comfrey', role: 'mineralFixer' as const, notes: '' },
      { plantId: 'alder', role: 'companion' as const, notes: '' },
    ] };
    const out = layoutPolyculture(pc, plantsById, { xM: 10, yM: 10 }, 20);
    expect(out[0]).toEqual({ plantId: 'apple', xM: 10, yM: 10 });
    const d = (id: string) => { const q = out.find(o => o.plantId === id)!; return Math.hypot(q.xM - 10, q.yM - 10); };
    expect(d('clover')).toBeLessThan(d('comfrey'));
    expect(d('comfrey')).toBeLessThan(d('alder'));
    expect(out).toHaveLength(4);
    // deterministic
    expect(layoutPolyculture(pc, plantsById, { xM: 10, yM: 10 }, 20)).toEqual(out);
  });
});
