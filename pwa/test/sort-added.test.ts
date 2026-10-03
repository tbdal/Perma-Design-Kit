import { describe, expect, it } from 'vitest';
import { sortPlants } from '../src/lib/plant-list';
import { normalizePlant } from '../src/lib/plant-normalize';
import { createEmptyPlant, type PlantData } from '../src/lib/types';

const plant = (commonName: string, createdAt: string): PlantData => ({ ...createEmptyPlant(), commonName, createdAt });

describe('"Zuletzt hinzugefügt"', () => {
  const old = plant('Alt', '2026-01-01T10:00:00.000Z');
  const mid = plant('Mittel', '2026-05-01T10:00:00.000Z');
  const recent = plant('Neu', '2026-10-01T10:00:00.000Z');
  const legacy = plant('Ohne Datum', '');

  it('lists the newest plant first, plants without a date last', () => {
    expect(sortPlants([old, legacy, recent, mid], 'createdAt', 'asc').map(p => p.commonName))
      .toEqual(['Neu', 'Mittel', 'Alt', 'Ohne Datum']);
  });

  it('reverses to oldest first', () => {
    expect(sortPlants([old, recent, mid], 'createdAt', 'desc').map(p => p.commonName))
      .toEqual(['Alt', 'Mittel', 'Neu']);
  });

  it('new plants get a date; imports keep a valid one', () => {
    expect(Date.parse(createEmptyPlant().createdAt)).not.toBeNaN();
    expect(normalizePlant({ latinName: 'x', createdAt: '2026-01-01T10:00:00.000Z' })?.createdAt).toBe('2026-01-01T10:00:00.000Z');
    expect(Date.parse(normalizePlant({ latinName: 'x', createdAt: 'kaputt' })!.createdAt)).not.toBeNaN();
  });
});
