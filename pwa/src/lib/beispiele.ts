// Example polycultures: what /api/polykultur-beispiele hands out (server/beispiele.mjs) becomes plants and a polyculture of the user.
import type { PlantData, Polyculture, PolycultureRole } from './types';
import { createEmptyPolyculture } from './types';
import { normalizePlant } from './plant-normalize';
import { newId } from './id';

export interface ExampleMember { latinName: string; varietyName?: string; role: PolycultureRole; notes: string }
export interface Example {
  id: string; title: string; description: string; image: string; hidden: boolean; anchor: string;
  plants: Record<string, unknown>[]; members: ExampleMember[];
}

const key = (latin: string, variety = '') => `${latin.trim().toLowerCase()}|${variety.trim().toLowerCase()}`;

/** The plants to add (those the user does not have yet, by Latin name + variety) and the polyculture, ready to save. */
export function installExample(ex: Example, have: PlantData[], now = new Date()): { newPlants: PlantData[]; polyculture: Polyculture } {
  const byKey = new Map(have.map(p => [key(p.latinName, p.varietyName ?? ''), p]));
  const newPlants: PlantData[] = [];
  for (const raw of ex.plants) {
    const k = key(String(raw.latinName ?? ''), String(raw.varietyName ?? ''));
    if (byKey.has(k)) continue;
    const p = normalizePlant({ ...raw, id: newId(), _sources: { latinName: 'sample', commonName: 'sample' }, createdAt: now.toISOString() });
    if (!p) continue;
    byKey.set(k, p);
    newPlants.push(p);
  }
  const pc = createEmptyPolyculture();
  pc.name = ex.title;
  pc.description = ex.description;
  pc.anchorPlantId = byKey.get(key(ex.anchor))?.id ?? null;
  pc.members = ex.members
    .map(m => ({ plantId: byKey.get(key(m.latinName, m.varietyName ?? ''))?.id ?? '', role: m.role, notes: m.notes }))
    .filter(m => m.plantId && m.plantId !== pc.anchorPlantId);
  return { newPlants, polyculture: pc };
}

/** An example from one of the user's polycultures (for admins publishing it). */
export function exampleFromPolyculture(pc: Polyculture, plants: Map<string, PlantData>, image: string): Example | null {
  const anchor = pc.anchorPlantId ? plants.get(pc.anchorPlantId) : undefined;
  const used = [...(anchor ? [anchor] : []), ...pc.members.map(m => plants.get(m.plantId)).filter((p): p is PlantData => !!p)];
  if (!used.length) return null;
  const slim = (p: PlantData) => {
    // only what is set: the server keeps it small and the browser fills the rest on loading
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) {
      if (['id', 'createdAt', 'updatedAt', '_sources', 'printCount', 'notes'].includes(k)) continue;
      if (v === false || v === null || v === '' || v === 0 || (Array.isArray(v) && !v.some(Boolean))) continue;
      o[k] = v;
    }
    return o;
  };
  return {
    id: `b-${newId().slice(0, 8)}`, title: pc.name || 'Polykultur', description: pc.description, image, hidden: true, anchor: anchor?.latinName ?? '',
    plants: used.map(slim),
    members: pc.members.filter(m => plants.get(m.plantId)).map(m => ({ latinName: plants.get(m.plantId)!.latinName, ...(plants.get(m.plantId)!.varietyName ? { varietyName: plants.get(m.plantId)!.varietyName } : {}), role: m.role, notes: m.notes })),
  };
}
