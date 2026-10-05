import { describe, expect, it } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, type PlantData } from '../src/lib/types';
import { plantYieldKg, planYield, yieldSpecOf, monthRuns, careTasks, buildIcs } from '../src/lib/yield-care';

const months = (...m: number[]) => Array.from({ length: 12 }, (_, i) => m.includes(i));
const plant = (id: string, latinName: string, extra: Partial<PlantData> = {}): PlantData => ({ ...createEmptyPlant(), id, latinName, ...extra });
const apple = plant('a', 'Malus domestica', { eatable: true, heightM: 6, widthM: 6, fruitMonths: months(8, 9) });
const comfrey = plant('s', 'Symphytum officinale', { heightM: 1, widthM: 0.6 });
const unknownFruit = plant('u', 'Ugni molinae', { eatable: true, heightM: 1.5, widthM: 1.5, fruitMonths: months(9) });

describe('yield', () => {
  it('is zero before the plant bears and grows with age', () => {
    expect(plantYieldKg(apple, 2)).toBe(0);
    const y6 = plantYieldKg(apple, 6), y20 = plantYieldKg(apple, 20);
    expect(y6).toBeGreaterThan(0);
    expect(y20).toBeGreaterThan(y6);
    expect(y20).toBeGreaterThan(30);   // mature 6 m apple: tens of kg
    expect(y20).toBeLessThan(80);
  });
  it('uses a generic value for other fruiting shrubs and none for non-fruit', () => {
    expect(yieldSpecOf(unknownFruit, 'shrub')?.generic).toBe(true);
    expect(yieldSpecOf(comfrey, 'herb')).toBeNull();
  });
  it('sums a plan per species', () => {
    const plan = { ...createEmptyGardenPlan(), placements: [
      { id: '1', plantId: 'a', xM: 0, yM: 0, notes: '' }, { id: '2', plantId: 'a', xM: 9, yM: 0, notes: '' }, { id: '3', plantId: 's', xM: 2, yM: 2, notes: '' }] };
    const r = planYield(plan, new Map([apple, comfrey].map(p => [p.id, p])), 20);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].count).toBe(2);
    expect(r.totalKg).toBeCloseTo(r.rows[0].kgEach * 2);
  });
});

describe('care calendar', () => {
  const t = (k: string, v?: Record<string, string | number>) => `${k}${v?.name ? ':' + v.name : ''}`;
  it('finds month runs', () => {
    expect(monthRuns(months(6, 7, 8, 10))).toEqual([[6, 8], [10, 10]]);
  });
  it('plans harvest and pruning per species', () => {
    const tasks = careTasks(apple, 'Apfel', t);
    expect(tasks.map(x => `${x.title}@${x.month}${x.endMonth != null ? '-' + x.endMonth : ''}`)).toEqual(['careHarvest:Apfel@8-9', 'careWinterPrune:Apfel@1']);
    const cherry = careTasks(plant('c', 'Prunus avium', { eatable: true, fruitMonths: months(5, 6) }), 'Kirsche', t);
    expect(cherry.find(x => x.title.startsWith('careSummerPrune'))!.month).toBe(7);
  });
  it('writes a valid yearly iCal file', () => {
    const ics = buildIcs('Pflege, Test', careTasks(apple, 'Apfel', t), 2027, 'plan1');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Pflege\\, Test');
    expect(ics).toContain('DTSTART;VALUE=DATE:20270901');
    expect(ics).toContain('DTEND;VALUE=DATE:20271101');   // harvest Sep–Oct
    expect(ics).toContain('DTSTART;VALUE=DATE:20270201');  // winter pruning Feb
    expect(ics.match(/RRULE:FREQ=YEARLY/g)).toHaveLength(2);
    expect(ics.split('\r\n').every(l => l.length <= 75)).toBe(true);
  });
});
