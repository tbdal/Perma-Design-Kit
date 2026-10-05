import { describe, it, expect } from 'vitest';
import { sortPlans, defaultDir, planAreaM2 } from '../src/lib/plan-list-sort';
import { createEmptyGardenPlan } from '../src/lib/types';

const plan = (id: string, name: string, created: string, extra: Record<string, unknown> = {}) =>
  ({ ...createEmptyGardenPlan(), id, name, createdAt: created, updatedAt: created, ...extra });
const sq = (s: number) => [{ xM: 0, yM: 0 }, { xM: s, yM: 0 }, { xM: s, yM: s }, { xM: 0, yM: s }];
const P = [
  plan('a', 'topo nuss', '2026-10-01T10:00:00Z', { boundary: sq(100), updatedAt: '2026-10-05T10:00:00Z' }),
  plan('b', '7L AF', '2026-10-03T10:00:00Z', { boundary: sq(400), placements: [{ id: 'x', plantId: 'p', xM: 1, yM: 1, notes: '' }] }),
  plan('c', 'abc', '2026-10-02T10:00:00Z', { boundary: sq(20) }),
  plan('d', '', '2026-10-04T10:00:00Z', { boundary: [], areaWidthM: 30, areaHeightM: 10 }),
];
const ids = (l: { id: string }[]) => l.map(p => p.id).join('');

describe('project list sorting', () => {
  it('newest plan first, and the other way round', () => {
    expect(ids(sortPlans(P, 'created', 'desc'))).toBe('dbca');
    expect(ids(sortPlans(P, 'created', 'asc'))).toBe('acbd');
  });
  it('last edited first', () => {
    expect(ids(sortPlans(P, 'updated', 'desc'))[0]).toBe('a');
  });
  it('names A–Z with numbers in order, unnamed last both ways', () => {
    expect(ids(sortPlans(P, 'name', 'asc'))).toBe('bcad');
    expect(ids(sortPlans(P, 'name', 'desc'))).toBe('acbd');
  });
  it('size by the drawn area, the rectangle without an outline', () => {
    expect(planAreaM2(P[3])).toBe(300);
    expect(ids(sortPlans(P, 'area', 'desc'))).toBe('bacd');   // 160 000, 10 000, 400, 300 m²
  });
  it('plants and natural default directions', () => {
    expect(ids(sortPlans(P, 'plants', 'desc'))[0]).toBe('b');
    expect(defaultDir('name')).toBe('asc');
    expect(defaultDir('created')).toBe('desc');
  });
});
