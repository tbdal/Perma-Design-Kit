import { describe, expect, it } from 'vitest';
import { distance, matchPlants, tidyName as normName } from '../src/lib/plant-match';
import { createEmptyPlant } from '../src/lib/types';

const plant = (commonName: string, latinName = '', varietyName = '') => ({ ...createEmptyPlant(), id: commonName + varietyName, commonName, latinName, varietyName });

describe('normName', () => {
  it('ignores case, accents, quotes, hyphens and double spaces', () => {
    expect(normName('  Apfel  ’Topaz’ ')).toBe('apfel topaz');
    expect(normName('Weißdorn')).toBe(normName('weissdorn'));
    expect(normName('Ess-Kastanie')).toBe('ess kastanie');
      });
});

describe('distance', () => {
  it('counts edits and gives up beyond the limit', () => {
    expect(distance('topas', 'topaz', 2)).toBe(1);
    expect(distance('esskastanine', 'esskastanie', 2)).toBe(1);
    expect(distance('abcdef', 'uvwxyz', 2)).toBe(3);
  });
});

describe('matchPlants', () => {
  const list = [plant('Apfel', 'Malus domestica', 'Topaz'), plant('Esskastanie', 'Castanea sativa'), plant('Mais', 'Zea mays'), plant('Weißdorn', 'Crataegus monogyna')];
  it('finds exact names (also with variety, botanical name, other spelling) and offers typos as similar', () => {
    expect(matchPlants('apfel topaz', list)[0]).toMatchObject({ kind: 'exact' });
    expect(matchPlants('Malus domestica', list)[0]).toMatchObject({ kind: 'exact' });
    expect(matchPlants('Weissdorn', list)[0]).toMatchObject({ kind: 'exact' });
    const topas = matchPlants('Apfel Topas', list);
    expect(topas).toHaveLength(1);
    expect(topas[0]).toMatchObject({ kind: 'similar', dist: 1 });
    expect(matchPlants('Esskastanine', list)[0]).toMatchObject({ kind: 'similar', dist: 1 });
  });
  it('is strict with short names and with unrelated ones', () => {
    expect(matchPlants('Mohn', list)).toEqual([]);            // "Mohn" is 2 letters from "Mais": no suggestion
    expect(matchPlants('Mai', list)[0]?.kind).toBe('similar'); // one letter off is fine
    expect(matchPlants('Birne', list)).toEqual([]);
    expect(matchPlants('', list)).toEqual([]);
  });
});
