import { describe, expect, it } from 'vitest';
import { planUsage, polycultureUsage, splitByPlan, habitGroup } from '../src/lib/plan-usage';
import { tidyName } from '../src/lib/plant-match';
import { autoFillRoles } from '../src/lib/polyculture-autofill';
import { normalizeGardenPlan } from '../src/lib/plant-normalize';
import { createEmptyGardenPlan, createEmptyPlant, type GardenPlanPlacement, type PlantData } from '../src/lib/types';

const plant = (id: string, extra: Partial<PlantData> = {}): PlantData => ({ ...createEmptyPlant(), id, latinName: id, ...extra });
const pl = (id: string, plantId: string, extra: Partial<GardenPlanPlacement> = {}): GardenPlanPlacement => ({ id, plantId, xM: 1, yM: 1, notes: '', ...extra });
const plan = (id: string, name: string, placements: GardenPlanPlacement[]) => ({ ...createEmptyGardenPlan(), id, name, placements });

describe('planUsage', () => {
  const plans = [
    plan('g1', 'Garten Süd', [pl('a', 'apfel', { plantedYear: 2026 }), pl('b', 'apfel'), pl('c', 'apfel', { plantedYear: 2025 }), pl('d', 'hasel', { polycultureId: 'pc1', packageId: 'k1' }), pl('e', 'apfel', { polycultureId: 'pc1', packageId: 'k1' })]),
    plan('g2', 'Schulgarten', [pl('f', 'apfel'), pl('g', 'x', { polycultureId: 'pc1', packageId: 'k2' }), pl('h', 'x', { polycultureId: 'pc1', packageId: 'k3' })]),
  ];

  it('counts placed and planted per plan', () => {
    expect(planUsage(plans).get('apfel')).toEqual([
      { planId: 'g1', name: 'Garten Süd', count: 4, planted: 2 },
      { planId: 'g2', name: 'Schulgarten', count: 1, planted: 0 },
    ]);
    expect(planUsage(plans).get('birne')).toBeUndefined();
  });

  it('counts packages of a polyculture per plan', () => {
    expect(polycultureUsage(plans).get('pc1')).toEqual([
      { planId: 'g1', name: 'Garten Süd', packages: 1 },
      { planId: 'g2', name: 'Schulgarten', packages: 2 },
    ]);
  });

  it('splits the list by plan and finds placed plants missing from it', () => {
    const r = splitByPlan([plant('apfel'), plant('birne'), plant('hasel')], plans[0]);
    expect(r.inPlan.map(p => p.id)).toEqual(['apfel', 'hasel']);
    expect(r.notInPlan.map(p => p.id)).toEqual(['birne']);
    expect(splitByPlan([plant('apfel')], plans[1]).missing).toEqual([{ plantId: 'x', count: 2 }]);
    expect(habitGroup(plant('a', { habit: 'climber' }))).toBe('other');
  });

  it('keeps the new placement fields through normalizing, drops broken ones', () => {
    const n = normalizeGardenPlan(plans[0])!;
    expect(n.placements[0].plantedYear).toBe(2026);
    expect(n.placements[3]).toMatchObject({ polycultureId: 'pc1', packageId: 'k1' });
    const bad = normalizeGardenPlan({ ...plans[0], placements: [pl('z', 'a', { plantedYear: 12.5 as number, polycultureId: 'pc1' })] })!;
    expect('plantedYear' in bad.placements[0]).toBe(false);
    expect('polycultureId' in bad.placements[0]).toBe(false);
  });
});

describe('autoFillRoles', () => {
  it('fills each open role once, specific roles before free ones', () => {
    const anchor = plant('apfel', { sunFull: true });
    const klee = plant('klee', { nitrogenFix: true, sunFull: true });
    const beinwell = plant('beinwell', { mineralFix: true });
    const r = autoFillRoles(anchor, [anchor, klee, beinwell], new Set(['apfel']), ['companion', 'nFixer', 'mineralFixer', 'pestConfuser']);
    expect(r).toEqual(expect.arrayContaining([{ plantId: 'klee', role: 'nFixer' }, { plantId: 'beinwell', role: 'mineralFixer' }]));
    expect(r.find(x => x.role === 'companion')).toBeUndefined(); // nothing left for it
    expect(r.find(x => x.role === 'pestConfuser')).toBeUndefined();
  });
});

describe('tidyName', () => {
  it('ignores case, quotes, hyphens, umlauts and extra spaces', () => {
    expect(tidyName(' Apfel ’Topaz’ ')).toBe('apfel topaz');
    expect(tidyName('Süß-Kirsche')).toBe(tidyName('suess kirsche'));
  });
});
