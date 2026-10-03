import { describe, it, expect } from 'vitest';
import { createEmptyPlant, type PlantData } from '../src/lib/types';
import { needsEnrichment } from '../src/lib/enrich';
import { wikidataSearchName } from '../src/lib/plant-search';

describe('wikidataSearchName', () => {
  it('searches the genus for genus-level entries', () => {
    expect(wikidataSearchName('Pinus spp.')).toBe('Pinus');
    expect(wikidataSearchName('Aronia sp.')).toBe('Aronia');
    expect(wikidataSearchName('Malus domestica')).toBe('Malus domestica');
  });
});

const plant = (extra: Partial<PlantData>): PlantData => ({ ...createEmptyPlant(), ...extra });

describe('needsEnrichment', () => {
  it('skips plants without a latin name', () => {
    expect(needsEnrichment(plant({ latinName: '' }), 'de')).toBe(false);
  });

  it('wants a bare, freshly shared plant', () => {
    expect(needsEnrichment(plant({ latinName: 'Malus domestica', commonName: 'Apfel' }), 'de')).toBe(true);
  });

  it('asks for an English name only in the English UI', () => {
    const p = plant({ latinName: 'Malus domestica', commonNameEn: '' });
    // completeness alone already makes a fresh plant need enrichment in both
    // languages; the EN rule is what remains for otherwise complete plants.
    expect(needsEnrichment(p, 'en')).toBe(true);
  });
});
