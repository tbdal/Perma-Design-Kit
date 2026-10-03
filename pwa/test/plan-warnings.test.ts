import { describe, it, expect } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, type PlantData } from '../src/lib/types';
import { crowdingWarnings, shadeWarnings, grownOccluders } from '../src/lib/plan-warnings';
import { sunSamples, SEASON_DATES } from '../src/lib/sun-hours';

const P = (id: string, extra: Partial<PlantData>): PlantData => ({ ...createEmptyPlant(), id, latinName: id, ...extra });
const apple = P('apple', { habit: 'tree', widthM: 6, heightM: 6 });
const walnut = P('walnut', { habit: 'tree', widthM: 14, heightM: 18 });
const herb = P('herb', { habit: 'herb', widthM: 0.6, heightM: 0.5, sunFull: true });
const shadeHerb = P('shadeHerb', { habit: 'herb', widthM: 0.6, heightM: 0.5, sunShadow: true });
const plantsById = new Map([apple, walnut, herb, shadeHerb].map(p => [p.id, p]));
const plan = (placements: { id: string; plantId: string; xM: number; yM: number }[]) => ({
  ...createEmptyGardenPlan(), areaWidthM: 40, areaHeightM: 40, yearsSincePlanting: 1,
  placements: placements.map(p => ({ ...p, notes: '' })),
});

describe('plan warnings', () => {
  it('flags same-layer plants that will crowd each other, not guild layers', () => {
    const w = crowdingWarnings(plan([
      { id: 'a1', plantId: 'apple', xM: 10, yM: 10 }, { id: 'a2', plantId: 'apple', xM: 13, yM: 10 }, // 3 m apart, need ≥ 4.5
      { id: 'a3', plantId: 'apple', xM: 30, yM: 10 },
      { id: 'h1', plantId: 'herb', xM: 10.5, yM: 10 },                                                // under the apple: fine
    ]), plantsById);
    expect(w).toHaveLength(1);
    expect([w[0].a, w[0].b].sort()).toEqual(['a1', 'a2']);
    expect(w[0].minM).toBeCloseTo(4.5, 1);
  });

  it('flags a sun plant that ends up north of a big tree, not a shade plant', () => {
    const p = plan([
      { id: 'w', plantId: 'walnut', xM: 20, yM: 20 },
      { id: 'h', plantId: 'herb', xM: 20, yM: 19 },      // right by the walnut trunk, under its crown
      { id: 's', plantId: 'shadeHerb', xM: 20.5, yM: 19 },
      { id: 'h2', plantId: 'herb', xM: 20, yM: 34 },     // south, open
    ]);
    const groundZ = () => 0;
    const scene = { groundZ, occluders: grownOccluders(p, plantsById, groundZ) };
    const w = shadeWarnings(p, plantsById, scene, sunSamples(SEASON_DATES(2026), 50, 10, 0, 30));
    expect(w.map(x => x.id)).toEqual(['h']);
    expect(w[0].need).toBe('full');
    expect(w[0].hours).toBeLessThan(6);
  });
});
