import { describe, expect, it } from 'vitest';
import { ageAt, isPlanted, phaseLabel, phaseGroups, clampPhase } from '../src/lib/phases';
import { normalizeGardenPlan } from '../src/lib/plant-normalize';
import { coverageGrid } from '../src/lib/function-coverage';
import { planYield } from '../src/lib/yield-care';
import { createEmptyGardenPlan, createEmptyPlant } from '../src/lib/types';

const pl = (id: string, phaseYear?: number) => ({ id, plantId: 'a', xM: 5, yM: 5, notes: '', ...(phaseYear != null ? { phaseYear } : {}) });

describe('phases', () => {
  it('age and planted state follow the phase', () => {
    expect(ageAt(pl('x'), 5)).toBe(5);
    expect(ageAt(pl('x', 2), 5)).toBe(3);
    expect(isPlanted(pl('x', 2), 1)).toBe(false);
    expect(isPlanted(pl('x', 2), 2)).toBe(true);
  });
  it('labels phases as calendar years when a start year is set', () => {
    expect(phaseLabel({ startYear: 2027 }, 1)).toBe('2028');
    expect(phaseLabel({}, 0)).toBe('Start');
    expect(phaseLabel({}, 3)).toBe('+3');
  });
  it('groups placements by phase', () => {
    expect(phaseGroups({ placements: [pl('a', 1), pl('b'), pl('c', 1)] }).map(([p, l]) => `${p}:${l.length}`)).toEqual(['0:1', '1:2']);
  });
  it('clamps stored values', () => {
    expect(clampPhase(2.4)).toBe(2);
    expect(clampPhase(-1)).toBeUndefined();
    expect(clampPhase(0)).toBeUndefined();
    expect(clampPhase(99)).toBe(30);
  });
  it('survive normalisation (backup, share link)', () => {
    const n = normalizeGardenPlan({ ...createEmptyGardenPlan(), startYear: 2027, placements: [pl('a', 2), pl('b', -3)] })!;
    expect(n.startYear).toBe(2027);
    expect(n.placements.map(p => p.phaseYear)).toEqual([2, undefined]);
  });
});

describe('phases in the calculations', () => {
  const apple = { ...createEmptyPlant(), id: 'a', latinName: 'Malus domestica', eatable: true, nitrogenFix: true, heightM: 6, widthM: 6, fruitMonths: Array.from({ length: 12 }, (_, i) => i === 8) };
  const byId = new Map([[apple.id, apple]]);
  it('a plant not yet planted provides no function coverage', () => {
    const plan = { ...createEmptyGardenPlan(), areaWidthM: 10, areaHeightM: 10, yearsSincePlanting: 1, placements: [pl('x', 3)] };
    expect(coverageGrid(plan, byId, 1).cells.some(c => c.mask !== 0)).toBe(false);
    expect(coverageGrid({ ...plan, yearsSincePlanting: 5 }, byId, 1).cells.some(c => c.mask !== 0)).toBe(true);
  });
  it('yield counts each placement at its own age', () => {
    const plan = { ...createEmptyGardenPlan(), placements: [pl('x'), pl('y', 6)] };
    const r = planYield(plan, byId, 8);
    expect(r.rows[0].count).toBe(2);
    expect(r.totalKg).toBeGreaterThan(0);
    // the late one (age 2) bears nothing yet: total equals one tree at age 8
    const one = planYield({ ...plan, placements: [pl('x')] }, byId, 8).totalKg;
    expect(r.totalKg).toBeCloseTo(one);
  });
});
