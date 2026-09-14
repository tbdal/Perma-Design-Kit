import type { PlantData } from './types';

/** For a candidate plant, compute Sun/Water/pH overlap with a reference
 *  plant. Returns 0..3 (one point per dimension where at least one shared
 *  flag exists — or where either plant has no data for that dimension at
 *  all, since unknown shouldn't count against a match). */
export function compatScore(candidate: PlantData, reference: PlantData): number {
  const dims: (keyof PlantData)[][] = [
    ['sunFull', 'sunMid', 'sunShadow'],
    ['waterDry', 'waterMid', 'waterWet'],
    ['phVeryAcid', 'phAcid', 'phNeutral', 'phAlkaline', 'phVeryAlkaline'],
  ];
  let score = 0;
  for (const dim of dims) {
    const refAny = dim.some(k => Boolean((reference as any)[k]));
    const candAny = dim.some(k => Boolean((candidate as any)[k]));
    if (!refAny || !candAny) { score++; continue; } // unknown ⇒ neutral, don't penalize
    const overlap = dim.some(k => Boolean((reference as any)[k]) && Boolean((candidate as any)[k]));
    if (overlap) score++;
  }
  return score;
}
