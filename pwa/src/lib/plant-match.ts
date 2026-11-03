// Names compared for "is this plant already in the list?" when plants come in
// with a shared project or a GeoJSON file: spelling details don't make a
// second entry.
import type { PlantData } from './types';

/** Lower case, umlauts and ß folded, accents, quotes, hyphens and extra spaces gone. */
export function tidyName(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`´"„“”«»‹›]/g, '').replace(/[-‐–—_.,]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Suggestions for "übernehmen" (Filter "Plan"): exact after tidying, or a small typo.
/** Levenshtein distance, or max + 1 as soon as it is clear it exceeds `max`. */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < low) low = cur[j];
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

export interface PlantMatch { plant: PlantData; kind: 'exact' | 'similar'; dist: number }

/** Names a list plant answers to: common name (with and without variety), English and botanical name. */
const namesOf = (p: PlantData): string[] => [
  p.commonName, p.varietyName ? `${p.commonName} ${p.varietyName}` : '', p.commonNameEn ?? '', p.latinName, p.varietyName ? `${p.latinName} ${p.varietyName}` : '',
].map(tidyName).filter(Boolean);

/**
 * The plants a name may mean, best first. exact = same name after normalising; similar = one or two letters off
 * (only one for names under five letters, so "Mohn" does not become "Mais"). Only an exact one may be preselected.
 */
export function matchPlants(name: string, plants: PlantData[]): PlantMatch[] {
  const n = tidyName(name);
  if (!n) return [];
  const max = n.length < 5 ? 1 : 2;
  const out: PlantMatch[] = [];
  for (const plant of plants) {
    let best = Infinity;
    for (const c of namesOf(plant)) {
      const limit = c.length < 5 ? 1 : max; // short names of the list: one letter at most, too
      const d = c === n ? 0 : distance(n, c, limit);
      if (d <= limit && d < best) best = d;
    }
    if (best === 0) out.push({ plant, kind: 'exact', dist: 0 });
    else if (best <= max) out.push({ plant, kind: 'similar', dist: best });
  }
  return out.sort((a, b) => a.dist - b.dist || (a.plant.commonName || '').localeCompare(b.plant.commonName || ''));
}
