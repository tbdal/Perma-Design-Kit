import { describe, it, expect } from 'vitest';
import { createEmptyPlant, createEmptyPolyculture, createEmptyGardenPlan, type PlantData } from '../src/lib/types';
import { encodeShare, decodeShare, sharePayload, mergeShared, shareDataFromHash, shareUrl } from '../src/lib/share';

function plant(id: string, latinName: string, extra: Partial<PlantData> = {}): PlantData {
  return { ...createEmptyPlant(), id, latinName, ...extra };
}

const apple = plant('p1', 'Malus domestica', { commonName: 'Apfel', heightM: 5, eatable: true, notes: 'privat' });
const clover = plant('p2', 'Trifolium repens', { nitrogenFix: true });
const pc = { ...createEmptyPolyculture(), id: 'g1', name: 'Gilde', anchorPlantId: 'p1', members: [{ plantId: 'p2', role: 'nFixer' as const, notes: 'n' }], notes: 'pc-notiz' };
const plan = {
  ...createEmptyGardenPlan(), id: 'gp1', name: 'Garten', notes: 'plan-notiz',
  boundary: [{ xM: 0, yM: 0 }, { xM: 4, yM: 0 }, { xM: 4, yM: 4 }],
  placements: [{ id: 'pl1', plantId: 'p1', xM: 1, yM: 1, notes: 'x' }],
  geo: { lat: 50, lon: 8, rotationDeg: 0, basemap: 'osm' as const, opacity: 0.7 },
};
const content = { plants: [apple, clover], polycultures: [pc], gardenPlans: [plan] };

describe('share encode/decode', () => {
  it('round-trips the whole project through the link', async () => {
    const data = await encodeShare(content, { includeNotes: true, includeLocation: true });
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeShare(data);
    expect(back.plants).toHaveLength(2);
    expect(back.plants[0].commonName).toBe('Apfel');
    expect(back.plants[0].eatable).toBe(true);
    expect(back.plants[1].fruitMonths).toHaveLength(12); // defaults refilled
    expect(back.polycultures[0].members[0].plantId).toBe('p2');
    expect(back.gardenPlans[0].geo?.lat).toBe(50);
    expect(back.gardenPlans[0].notes).toBe('plan-notiz');
  });

  it('can leave out notes and the garden location', async () => {
    const back = await decodeShare(await encodeShare(content, { includeNotes: false, includeLocation: false }));
    expect(back.plants[0].notes).toBe('');
    expect(back.polycultures[0].notes).toBe('');
    expect(back.polycultures[0].members[0].notes).toBe('');
    expect(back.gardenPlans[0].notes).toBe('');
    expect(back.gardenPlans[0].placements[0].notes).toBe('');
    expect(back.gardenPlans[0].geo).toBeNull();
  });

  it('prunes default fields to keep links short', () => {
    const json = JSON.parse(sharePayload({ plants: [clover], polycultures: [], gardenPlans: [] }, { includeNotes: true, includeLocation: true }));
    expect(json.plants[0]).toEqual(expect.objectContaining({ id: 'p2', latinName: 'Trifolium repens', nitrogenFix: true }));
    expect(json.plants[0]).not.toHaveProperty('eatable');
    expect(json.plants[0]).not.toHaveProperty('fruitMonths');
  });

  it('rejects a damaged link', async () => {
    await expect(decodeShare('kaputt')).rejects.toThrow();
  });

  it('builds and parses the link fragment', () => {
    expect(shareUrl('https://example.org', 'abc_-1')).toBe('https://example.org/teilen/#d=abc_-1');
    expect(shareDataFromHash('#d=abc_-1')).toBe('abc_-1');
    expect(shareDataFromHash('#x=1')).toBeNull();
    expect(shareDataFromHash('')).toBeNull();
  });
});

describe('mergeShared', () => {
  it('reuses plants the recipient already has and re-points references', () => {
    const own = plant('mine', 'malus domestica ', { commonName: 'Mein Apfel' });
    const m = mergeShared(content, [own]);
    expect(m.reusedPlants).toBe(1);
    expect(m.plants.map(p => p.id)).toEqual(['p2']);
    expect(m.polycultures[0].anchorPlantId).toBe('mine');
    expect(m.gardenPlans[0].placements[0].plantId).toBe('mine');
  });

  it('treats a different variety as a different plant', () => {
    const own = plant('mine', 'Malus domestica', { varietyName: 'Boskoop' });
    expect(mergeShared(content, [own]).reusedPlants).toBe(0);
  });

  it('does not overwrite plants with the same id on re-import', () => {
    const m = mergeShared(content, [{ ...apple, commonName: 'geändert' }]);
    expect(m.plants.map(p => p.id)).toEqual(['p2']);
    expect(m.reusedPlants).toBe(1);
  });

  it('stores a plan / polyculture with an id the recipient already uses as a copy, never overwriting', () => {
    const m = mergeShared(content, [], { polycultureIds: ['g1'], gardenPlanIds: ['gp1'] }, ' (importiert)');
    expect(m.copiedPolycultures).toBe(1);
    expect(m.copiedGardenPlans).toBe(1);
    expect(m.polycultures[0].id).not.toBe('g1');
    expect(m.polycultures[0].name).toBe('Gilde (importiert)');
    expect(m.gardenPlans[0].id).not.toBe('gp1');
    expect(m.gardenPlans[0].name).toBe('Garten (importiert)');
  });

  it('keeps ids when there is no clash and points a copied polyculture reference at the copy', () => {
    const plain = mergeShared(content, [], { polycultureIds: [], gardenPlanIds: [] });
    expect(plain.polycultures[0].id).toBe('g1');
    expect(plain.gardenPlans[0].id).toBe('gp1');
    expect(plain.copiedGardenPlans + plain.copiedPolycultures).toBe(0);
    const linked = { ...content, gardenPlans: [{ ...plan, polycultureId: 'g1' }] };
    const m = mergeShared(linked, [], { polycultureIds: ['g1'] });
    expect(m.gardenPlans[0].polycultureId).toBe(m.polycultures[0].id);
  });
});
