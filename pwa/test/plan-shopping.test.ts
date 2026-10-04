import { describe, it, expect } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, type PlantData } from '../src/lib/types';
import { shoppingRows, shoppingTotal, shoppingCsv } from '../src/lib/plan-shopping';
import { normalizeGardenPlan } from '../src/lib/plant-normalize';

const P = (id: string, extra: Partial<PlantData>): PlantData => ({ ...createEmptyPlant(), id, latinName: id, ...extra });
const plants = new Map([
  P('Malus domestica', { commonName: 'Apfel', habit: 'tree', widthM: 6, heightM: 6 }),
  P('Fragaria vesca', { commonName: 'Walderdbeere', habit: 'herb', widthM: 0.3, heightM: 0.2 }),
].map(p => [p.id, p]));
const plan = {
  ...createEmptyGardenPlan(),
  placements: [
    { id: '1', plantId: 'Fragaria vesca', xM: 1, yM: 1, notes: '' },
    { id: '2', plantId: 'Malus domestica', xM: 5, yM: 5, notes: '' },
    { id: '3', plantId: 'Fragaria vesca', xM: 2, yM: 1, notes: '' },
    { id: '4', plantId: 'gone', xM: 2, yM: 1, notes: '' },
  ],
};
const L = { plant: 'Pflanze', latin: 'Lateinisch', layer: 'Schicht', count: 'Anzahl', spacing: 'Abstand (m)', height: 'Höhe (m)', price: 'Preis/Stk (€)', sum: 'Summe (€)', total: 'Gesamt', layerName: (l: string) => l };

describe('plant shopping list', () => {
  it('counts plants per species, trees first', () => {
    const rows = shoppingRows(plan, plants, p => p.commonName || p.latinName);
    expect(rows.map(r => [r.name, r.count])).toEqual([['Apfel', 1], ['Walderdbeere', 2]]);
    expect(rows[0].widthM).toBe(6);
  });

  it('totals pieces and priced cost', () => {
    const rows = shoppingRows(plan, plants, p => p.commonName);
    expect(shoppingTotal(rows, { 'Fragaria vesca': 2.5 })).toEqual({ count: 3, cost: 5, priced: 1 });
  });

  it('writes an Excel-friendly CSV with German decimals', () => {
    const rows = shoppingRows(plan, plants, p => p.commonName);
    const csv = shoppingCsv(rows, { 'Malus domestica': 24.9 }, L, 'de');
    expect(csv.startsWith('﻿Pflanze;Lateinisch;')).toBe(true);
    expect(csv).toContain('Apfel;Malus domestica;tree;1;6;6;24,90;24,90');
    expect(csv).toContain('Walderdbeere;Fragaria vesca;herb;2;0,3;0,2;;');
    expect(csv.trim().split('\r\n').pop()).toBe('Gesamt;;;3;;;;24,90');
  });

  it('keeps valid prices through normalisation', () => {
    const n = normalizeGardenPlan({ ...plan, plantPrices: { a: 3.5, b: -1, c: 'x', d: 0 } })!;
    expect(n.plantPrices).toEqual({ a: 3.5, d: 0 });
  });
});
