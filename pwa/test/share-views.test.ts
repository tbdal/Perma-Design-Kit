import { describe, it, expect } from 'vitest';
import { createEmptyPlant, createEmptyGardenPlan, createEmptyPolyculture } from '../src/lib/types';
import { encodeShare, decodeShare, mergeShared } from '../src/lib/share';
import { sanitizePlanView, type PlanView } from '../src/lib/plan-view';
import { exampleData } from '../src/lib/example-project';

const plant = { ...createEmptyPlant(), id: 'p1', latinName: 'Malus domestica' };
const plan = { ...createEmptyGardenPlan(), id: 'gp1', name: 'Waldgarten', placements: [{ id: 'x', plantId: 'p1', xM: 1, yM: 1, notes: '' }] };
const other = { ...createEmptyGardenPlan(), id: 'gp2', name: 'Zweiter' };
const pc = { ...createEmptyPolyculture(), id: 'pc1', name: 'Apfelgilde', anchorPlantId: 'p1' };
const view: PlanView = {
  view2d: { x: -100, y: -50, w: 2000, h: 1200 },
  cam3d: { position: [10, 20, 30], target: [5, 0, 5] },
  mode: '3d', sun: { date: '2026-06-21', minutes: 1080 }, coverage: 'sun-day',
};
const content = { plants: [plant], polycultures: [pc], gardenPlans: [plan, other], views: { gp1: view, gp2: { ...view, mode: '2d' as const } }, start: { planId: 'gp1' } };

describe('sanitizePlanView', () => {
  it('keeps a valid view and drops broken parts', () => {
    expect(sanitizePlanView(view)).toEqual(view);
    const bad = sanitizePlanView({ view2d: { x: 1, y: 1, w: -5, h: 1 }, cam3d: { position: [1, 2], target: [0, 0, 0] }, mode: 'x', sun: { date: '21.6.', minutes: 5 }, coverage: '<script>' });
    expect(bad).toEqual({ view2d: null, cam3d: null, mode: '2d', sun: null });
    expect(sanitizePlanView(null)).toBeNull();
  });
});

describe('views and start plan in a share link', () => {
  it('travel only when asked for', async () => {
    const without = await decodeShare(await encodeShare(content, { includeNotes: true, includeLocation: false }));
    expect(without.views).toBeUndefined();
    expect(without.start).toBeNull();
    const withViews = await decodeShare(await encodeShare(content, { includeNotes: true, includeLocation: false, includeViews: true }));
    expect(withViews.views?.gp1).toEqual(view);
    expect(withViews.views?.gp2.mode).toBe('2d');
    expect(withViews.start).toEqual({ planId: 'gp1' });
  });

  it('drop views of plans that are not shared', async () => {
    const d = await decodeShare(await encodeShare({ ...content, gardenPlans: [other], start: { planId: 'gp1' } }, { includeNotes: true, includeLocation: false, includeViews: true }));
    expect(Object.keys(d.views ?? {})).toEqual(['gp2']);
    expect(d.start).toBeNull();
  });

  it('follow their plan to the new id when it comes in as a copy', () => {
    const m = mergeShared(content, [], { gardenPlanIds: ['gp1'] });
    const copyId = m.gardenPlans[0].id;
    expect(copyId).not.toBe('gp1');
    expect(m.views?.[copyId]).toEqual(view);
    expect(m.views?.gp2).toBeDefined();
    expect(m.start).toEqual({ planId: copyId });
    expect(m.alreadyPresent).toBe(false);
  });

  it('notice when the whole project is already there', () => {
    const m = mergeShared(content, [plant], { gardenPlanIds: ['gp1', 'gp2'], polycultureIds: ['pc1'] });
    expect(m.alreadyPresent).toBe(true);
    expect(mergeShared(content, [], { gardenPlanIds: ['gp1', 'gp2'], polycultureIds: ['pc1'] }).alreadyPresent).toBe(false);
  });
});

describe('exampleData', () => {
  it('takes a full link or the bare data', () => {
    expect(exampleData('https://permadesignkit.org/teilen/#d=abc_DEF-123\n')).toBe('abc_DEF-123');
    expect(exampleData('  abcdefghijklmnopqrstuvwxyz0123  ')).toBe('abcdefghijklmnopqrstuvwxyz0123');
    expect(exampleData('')).toBeNull();
    expect(exampleData('nur ein Satz')).toBeNull();
  });
});
