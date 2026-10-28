import { describe, expect, it } from 'vitest';
import { layoutPolyculture } from '../src/lib/polyculture-layout';
import { normalizePolyculture } from '../src/lib/plant-normalize';
import { createEmptyPlant, createEmptyPolyculture, type PlantData } from '../src/lib/types';

const plant = (id: string, widthM: number): PlantData => ({ ...createEmptyPlant(), id, latinName: id, widthM });

describe('layoutPolyculture', () => {
  const plants = new Map([plant('apfel', 6), plant('beinwell', 1), plant('klee', 0.5)].map(p => [p.id, p]));
  const pc = { ...createEmptyPolyculture(), id: 'pc1', anchorPlantId: 'apfel', members: [
    { plantId: 'beinwell', role: 'mineralFixer' as const, notes: '', dxM: 2, dyM: -1.5 },
    { plantId: 'klee', role: 'groundCover' as const, notes: '' },
  ] };

  it('keeps an own arrangement relative to the anchor, rings for the rest', () => {
    const out = layoutPolyculture(pc, plants, { xM: 10, yM: 20 }, 0);
    expect(out.find(o => o.plantId === 'apfel')).toEqual({ plantId: 'apfel', xM: 10, yM: 20 });
    expect(out.find(o => o.plantId === 'beinwell')).toEqual({ plantId: 'beinwell', xM: 12, yM: 18.5 });
    expect(out.find(o => o.plantId === 'klee')).toBeDefined();
  });

  it('survives normalizing, drops broken offsets', () => {
    const n = normalizePolyculture({ ...pc, members: [...pc.members, { plantId: 'x', role: 'other', notes: '', dxM: 'a', dyM: 1 }] })!;
    expect(n.members[0]).toMatchObject({ dxM: 2, dyM: -1.5 });
    expect('dxM' in n.members[1]).toBe(false);
    expect('dxM' in n.members[2]).toBe(false);
  });
});
