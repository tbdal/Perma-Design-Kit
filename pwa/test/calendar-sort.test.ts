import { describe, expect, it } from 'vitest';
import { sortCalendar } from '../src/lib/calendar-sort';
import { createEmptyPlant, type PlantData } from '../src/lib/types';

const months = (...on: number[]) => Array.from({ length: 12 }, (_, i) => on.includes(i));
const plant = (commonName: string, flower: number[], fruit: number[]): PlantData =>
  ({ ...createEmptyPlant(), commonName, flowerMonths: months(...flower), fruitMonths: months(...fruit) });

const holunder = plant('Holunder', [5, 6], [7, 8]);
const hasel = plant('Hasel', [1, 2], [8, 9]);
const efeu = plant('Efeu', [8, 9], [0, 1, 2]);
const ohne = plant('Ohne Daten', [], []);
const all = [holunder, ohne, efeu, hasel];
const names = (ps: PlantData[]) => ps.map(p => p.commonName);

describe('sortCalendar', () => {
  it('earliest bloom first, plants without data last', () => {
    expect(names(sortCalendar(all, 'flowerEarliest', 'de'))).toEqual(['Hasel', 'Holunder', 'Efeu', 'Ohne Daten']);
  });
  it('latest bloom first', () => {
    expect(names(sortCalendar(all, 'flowerLatest', 'de'))).toEqual(['Efeu', 'Holunder', 'Hasel', 'Ohne Daten']);
  });
  it('earliest and latest fruit', () => {
    expect(names(sortCalendar(all, 'fruitEarliest', 'de'))).toEqual(['Efeu', 'Holunder', 'Hasel', 'Ohne Daten']);
    expect(names(sortCalendar(all, 'fruitLatest', 'de'))).toEqual(['Hasel', 'Holunder', 'Efeu', 'Ohne Daten']);
  });
  it('name A-Z', () => {
    expect(names(sortCalendar(all, 'name', 'de'))).toEqual(['Efeu', 'Hasel', 'Holunder', 'Ohne Daten']);
  });
});
