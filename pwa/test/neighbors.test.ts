import { describe, expect, it } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, type PlantData } from '../src/lib/types';
import { neighborHints, allelopathOf, jugloneSensitive } from '../src/lib/neighbors';

const plant = (id: string, latinName: string, extra: Partial<PlantData> = {}): PlantData => ({ ...createEmptyPlant(), id, latinName, ...extra });
const walnut = plant('w', 'Juglans nigra', { heightM: 25, widthM: 15 });
const apple = plant('a', 'Malus domestica', { eatable: true, heightM: 6, widthM: 5 });
const pear = plant('p', 'Pyrus communis', { eatable: true, heightM: 8, widthM: 5 });
const clover = plant('c', 'Trifolium repens', { nitrogenFix: true, heightM: 0.2, widthM: 0.3 });
const comfrey = plant('s', 'Symphytum officinale', { mineralFix: true, heightM: 1, widthM: 0.6 });
const byId = new Map([walnut, apple, pear, clover, comfrey].map(p => [p.id, p]));
const plan = (placements: [string, string, number, number][]) => ({
  ...createEmptyGardenPlan(), placements: placements.map(([id, plantId, xM, yM]) => ({ id, plantId, xM, yM, notes: '' })),
});

describe('allelopaths', () => {
  it('knows walnuts, hickories and fennel', () => {
    expect(allelopathOf(walnut)?.radiusM).toBe(16);
    expect(allelopathOf(plant('x', 'Carya ovata'))?.affects).toBe('juglone');
    expect(allelopathOf(plant('x', 'Foeniculum vulgare'))?.affects).toBe('general');
    expect(allelopathOf(apple)).toBeNull();
  });
  it('knows juglone-sensitive plants; pear is resistant', () => {
    expect(jugloneSensitive(apple)).toBe(true);
    expect(jugloneSensitive(plant('x', 'Vaccinium corymbosum'))).toBe(true);
    expect(jugloneSensitive(pear)).toBe(false);
  });
});

describe('neighborHints', () => {
  it('flags an apple in the walnut root zone, not one far away, not a pear', () => {
    const h = neighborHints(plan([['W', 'w', 0, 0], ['A1', 'a', 8, 0], ['A2', 'a', 30, 0], ['P', 'p', 6, 0]]), byId);
    expect(h.bad.map(b => b.target)).toEqual(['A1']);
    expect(h.bad[0].source).toBe('W');
  });
  it('names helpers next to a fruit tree', () => {
    const h = neighborHints(plan([['A', 'a', 0, 0], ['C', 'c', 1.5, 0], ['S', 's', 0, 2], ['X', 'c', 40, 0]]), byId);
    expect(h.good).toHaveLength(1);
    expect(h.good[0].target).toBe('A');
    expect(h.good[0].helpers.map(x => `${x.id}:${x.role}`).sort()).toEqual(['C:nitrogen', 'S:nutrients']);
  });
});
