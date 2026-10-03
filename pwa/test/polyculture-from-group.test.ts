import { describe, it, expect } from 'vitest';
import { createEmptyPlant, type PlantData } from '../src/lib/types';
import { polycultureFromGroup, allGroups, roleFor } from '../src/lib/polyculture-from-group';

function plant(id: string, extra: Partial<PlantData>): PlantData {
  return { ...createEmptyPlant(), id, latinName: id, ...extra };
}

const plants = [
  plant('apfel', { heightM: 6, groups: ['Apfelgilde'], eatable: true }),
  plant('beinwell', { heightM: 1, groups: ['Apfelgilde'], mineralFix: true, insects: true }),
  plant('klee', { heightM: 0.2, groups: ['Apfelgilde', 'Rasen'], nitrogenFix: true, groundCover: true }),
  plant('schnittlauch', { heightM: 0.3, groups: ['Apfelgilde'] }),
  plant('fremd', { heightM: 10, groups: ['Anderes'] }),
];

describe('polycultureFromGroup', () => {
  it('uses the tallest member as anchor and the group name as title', () => {
    const pc = polycultureFromGroup('Apfelgilde', plants);
    expect(pc.name).toBe('Apfelgilde');
    expect(pc.anchorPlantId).toBe('apfel');
    expect(pc.members.map(m => m.plantId)).toEqual(['beinwell', 'klee', 'schnittlauch']);
  });

  it('assigns roles by priority, falling back to companion', () => {
    const roles = Object.fromEntries(polycultureFromGroup('Apfelgilde', plants).members.map(m => [m.plantId, m.role]));
    expect(roles).toEqual({ beinwell: 'mineralFixer', klee: 'nFixer', schnittlauch: 'companion' });
    expect(roleFor(plant('x', { eatable: true }))).toBe('fruitProducer');
  });

  it('handles an unknown group', () => {
    const pc = polycultureFromGroup('gibt es nicht', plants);
    expect(pc.anchorPlantId).toBeNull();
    expect(pc.members).toEqual([]);
  });
});

describe('allGroups', () => {
  it('lists each group once, sorted', () => {
    expect(allGroups(plants)).toEqual(['Anderes', 'Apfelgilde', 'Rasen']);
  });
});
