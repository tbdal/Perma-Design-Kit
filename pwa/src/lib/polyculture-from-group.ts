import { createEmptyPolyculture, ROLE_REQUIREMENT, type PlantData, type Polyculture, type PolycultureRole } from './types';

// "Gruppe als Polykultur anlegen": turns a plant group (PlantData.groups) into
// a polyculture draft. The tallest plant becomes the anchor; every other
// member gets the first role whose requirement it meets (nitrogen fixer
// before ground cover etc.), otherwise "Begleiter". Only a starting point —
// the user refines roles in the normal editor afterwards.

const ROLE_PRIORITY: PolycultureRole[] = ['nFixer', 'mineralFixer', 'groundCover', 'insectary', 'pestConfuser', 'fruitProducer'];

export function roleFor(p: PlantData): PolycultureRole {
  return ROLE_PRIORITY.find(r => ROLE_REQUIREMENT[r].every(k => Boolean(p[k]))) ?? 'companion';
}

/** All group names used by any plant, sorted, without duplicates. */
export function allGroups(plants: PlantData[]): string[] {
  return [...new Set(plants.flatMap(p => p.groups ?? []))].sort((a, b) => a.localeCompare(b));
}

export function polycultureFromGroup(group: string, plants: PlantData[]): Polyculture {
  const members = plants.filter(p => (p.groups ?? []).includes(group));
  const anchor = members.reduce<PlantData | null>((best, p) => (!best || (p.heightM ?? 0) > (best.heightM ?? 0) ? p : best), null);
  const pc = createEmptyPolyculture();
  pc.name = group;
  pc.anchorPlantId = anchor?.id ?? null;
  pc.members = members
    .filter(p => p.id !== anchor?.id)
    .map(p => ({ plantId: p.id, role: roleFor(p), notes: '' }));
  return pc;
}
