// "Rollen automatisch füllen" (GitHub issue 3): for every role the polyculture
// still lacks, the plant of the own list that the suggestions panel would rank
// first (role requirement met, best sun/water/pH overlap with the anchor).
import { ROLE_REQUIREMENT, type PlantData, type PolycultureRole } from './types';
import { compatScore } from './compat';

export function autoFillRoles(anchor: PlantData, plants: PlantData[], taken: Set<string>, roles: PolycultureRole[]): { plantId: string; role: PolycultureRole }[] {
  const used = new Set(taken);
  const out: { plantId: string; role: PolycultureRole }[] = [];
  // Roles with a requirement first, so a free role (companion) doesn't take the only fitting plant of another.
  for (const role of [...roles].sort((a, b) => ROLE_REQUIREMENT[b].length - ROLE_REQUIREMENT[a].length)) {
    const req = ROLE_REQUIREMENT[role];
    let best: { p: PlantData; score: number } | null = null;
    for (const p of plants) {
      if (used.has(p.id) || p.id === anchor.id) continue;
      if (req.length && !req.every(k => Boolean(p[k]))) continue;
      const score = compatScore(p, anchor);
      if (!best || score > best.score) best = { p, score };
    }
    if (best) { used.add(best.p.id); out.push({ plantId: best.p.id, role }); }
  }
  return out;
}
