import { describe, it, expect } from 'vitest';
import { createEmptyPlant, createEmptyGardenPlan, createEmptyPolyculture } from '../src/lib/types';
import {
  safeId, normalizePlant, normalizePolyculture, normalizeGardenPlan, normalizeVarietyList, MIN_GRID_M, MAX_GRID_M,
} from '../src/lib/plant-normalize';
import { parseBackup } from '../src/lib/sync';
import { encodeShare, decodeShare } from '../src/lib/share';

// IDs from a file or share link end up in HTML attributes (data-id="…"), so a
// crafted id must not survive the import. See issue: HTML injection via ids.
const EVIL = 'x"><b id="pwned">PWNED</b><i x="';
const SAFE = /^[A-Za-z0-9_-]{1,100}$/;

describe('safeId', () => {
  it('keeps the ids the app itself creates', () => {
    for (const id of ['0f8c2a5e-1b2c-4d3e-8f90-123456789abc', 'sample-1', 'crawford-12', 'wikidata-fruit']) {
      expect(safeId(id)).toBe(id);
    }
  });

  it('replaces unsafe ids by a stable, safe one', () => {
    const a = safeId(EVIL);
    expect(a).toMatch(SAFE);
    expect(a).not.toContain('"');
    expect(safeId(EVIL)).toBe(a);                 // same input, same id → references still match
    expect(safeId(EVIL + ' ')).not.toBe(a);       // different input, different id
    expect(safeId('a b')).toMatch(SAFE);
    expect(safeId('x'.repeat(101))).toMatch(SAFE);
  });

  it('falls back for missing or non-string ids', () => {
    expect(safeId(undefined, () => 'fb')).toBe('fb');
    expect(safeId('  ', () => 'fb')).toBe('fb');
    expect(safeId(42, () => 'fb')).toBe('fb');
  });
});

describe('normalizers keep references consistent after making ids safe', () => {
  it('plants, polycultures and plans', () => {
    const plant = normalizePlant({ id: EVIL, latinName: 'Malus domestica' })!;
    const pc = normalizePolyculture({ id: EVIL, name: 'G', anchorPlantId: EVIL, members: [{ plantId: EVIL, role: 'nFixer' }] })!;
    const plan = normalizeGardenPlan({
      id: EVIL, name: 'P', polycultureId: EVIL, areaWidthM: 10, areaHeightM: 10,
      placements: [{ id: EVIL, plantId: EVIL, xM: 1, yM: 1 }],
      areas: [{ id: EVIL, name: 'Beet', color: '#22c55e', points: [{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }, { xM: 1, yM: 1 }] }],
      plantPrices: { [EVIL]: 4.5 },
    })!;
    for (const id of [plant.id, pc.id, plan.id, plan.placements[0].id, plan.areas![0].id]) expect(id).toMatch(SAFE);
    expect(pc.anchorPlantId).toBe(plant.id);
    expect(pc.members[0].plantId).toBe(plant.id);
    expect(plan.placements[0].plantId).toBe(plant.id);
    expect(plan.polycultureId).toBe(pc.id);
    expect(plan.plantPrices).toEqual({ [plant.id]: 4.5 });
    expect(normalizeVarietyList({ id: EVIL, entries: [{ name: 'Topaz', species: 'Malus domestica' }] })!.id).toMatch(SAFE);
  });

  it('a whole backup: plan views follow their plan', () => {
    const b = parseBackup(JSON.stringify({
      plants: [{ id: EVIL, latinName: 'Malus domestica' }],
      gardenPlans: [{ id: EVIL, name: 'P', placements: [{ id: 'pl1', plantId: EVIL, xM: 1, yM: 1 }] }],
      views: { [EVIL]: { mode: '3d' } },
    }));
    const planId = b.gardenPlans[0].id;
    expect(planId).toMatch(SAFE);
    expect(b.gardenPlans[0].placements[0].plantId).toBe(b.plants[0].id);
    expect(Object.keys(b.views ?? {})).toEqual([planId]);
  });

  it('a share link: start plan and views follow their plan', async () => {
    const plan = { ...createEmptyGardenPlan(), id: EVIL, name: 'P' };
    const data = await encodeShare(
      { plants: [{ ...createEmptyPlant(), id: 'p1', latinName: 'Malus domestica' }], polycultures: [{ ...createEmptyPolyculture(), id: 'pc1' }], gardenPlans: [plan],
        views: { [EVIL]: { view2d: null, cam3d: null, mode: '3d', sun: null } }, start: { planId: EVIL } },
      { includeNotes: true, includeLocation: false, includeViews: true },
    );
    const d = await decodeShare(data);
    const planId = d.gardenPlans[0].id;
    expect(planId).toMatch(SAFE);
    expect(d.start?.planId).toBe(planId);
    expect(Object.keys(d.views ?? {})).toEqual([planId]);
  });
});

describe('grid spacing from a file', () => {
  // 0 or a tiny spacing made the editor's tick-label loop endless (froze the page).
  it('is pulled into a sane range', () => {
    const g = (v: unknown) => normalizeGardenPlan({ id: 'g', gridSpacingM: v })!.gridSpacingM;
    expect(g(0)).toBe(MIN_GRID_M);
    expect(g(-1)).toBe(MIN_GRID_M);
    expect(g(1e-9)).toBe(MIN_GRID_M);
    expect(g(1e9)).toBe(MAX_GRID_M);
    expect(g(0.5)).toBe(0.5);
    expect(g('x')).toBe(createEmptyGardenPlan().gridSpacingM);
  });
});
