import { describe, it, expect } from 'vitest';
import { installExample, exampleFromPolyculture, type Example } from '../src/lib/beispiele';
import { createEmptyPlant, createEmptyPolyculture, type PlantData } from '../src/lib/types';
import defaults from '../server/data/polykultur-beispiele.default.json';

const apple = { ...createEmptyPlant(), id: 'mine', latinName: 'Malus domestica', commonName: 'Mein Apfel' } as PlantData;

describe('example polycultures (client)', () => {
  const ex = (defaults as { items: Example[] }).items[0];
  it('adds only the plants the user lacks and points the polyculture at the existing ones', () => {
    const r = installExample(ex, [apple]);
    expect(r.newPlants.some(p => p.latinName === 'Malus domestica')).toBe(false);
    expect(r.newPlants.length).toBe(ex.plants.length - 1);
    expect(r.polyculture.anchorPlantId).toBe('mine');
    expect(r.polyculture.members).toHaveLength(ex.members.length);
    expect(r.polyculture.name).toBe('Apfelbaum-Polykultur');
    expect(new Set(r.newPlants.map(p => p.id)).size).toBe(r.newPlants.length);
  });
  it('all six defaults load into a complete polyculture', () => {
    for (const e of (defaults as { items: Example[] }).items) {
      const r = installExample(e, []);
      expect(r.polyculture.anchorPlantId, e.id).toBeTruthy();
      expect(r.polyculture.members.length, e.id).toBe(e.members.length);
    }
  });
  it('turns a polyculture into an example without ids and empty fields', () => {
    const pc = createEmptyPolyculture();
    pc.name = 'Test'; pc.anchorPlantId = 'mine';
    const e = exampleFromPolyculture(pc, new Map([['mine', apple]]), 'https://x/y.jpg')!;
    expect(e.anchor).toBe('Malus domestica');
    expect(e.plants[0]).toEqual({ latinName: 'Malus domestica', commonName: 'Mein Apfel' });
    expect(e.hidden).toBe(true);
  });
});
