// Names compared for "is this plant already in the list?" when plants come in
// with a shared project or plan, or a GeoJSON file: spelling details don't make
// a second entry. Exact matches (after tidying) may be preselected, typo
// matches are only offered.
import type { PlantData } from './types';
import { displayName } from './plant-name';

/** Lower case, umlauts and ß folded, accents, quotes, hyphens and extra spaces gone. */
export function tidyName(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`´"„“”«»‹›]/g, '').replace(/[-‐–—_.,]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

/** Edit distance, stopping early once it is above `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const namesOf = (p: PlantData) => [...new Set([displayName(p), p.commonName, p.latinName]
  .flatMap(n => (n ? [n, p.varietyName ? `${n} ${p.varietyName}` : ''] : []))
  .map(tidyName).filter(Boolean))];

export interface PlantMatch { plant: PlantData; exact: boolean; distance: number }

/** Plants of `list` that look like `p` (never `p` itself), closest first: up to two letters off, one for names under five letters. */
export function findMatches(p: PlantData, list: PlantData[]): PlantMatch[] {
  const mine = namesOf(p);
  const out: PlantMatch[] = [];
  for (const q of list) {
    if (q.id === p.id) continue;
    // Different varieties of one species are different plants.
    if (p.varietyName && q.varietyName && tidyName(p.varietyName) !== tidyName(q.varietyName)) continue;
    let best = Infinity;
    for (const a of mine) for (const b of namesOf(q)) {
      const max = Math.min(a.length, b.length) < 5 ? 1 : 2;
      const d = distance(a, b, max);
      if (d <= max && d < best) best = d;
    }
    if (best < Infinity) out.push({ plant: q, exact: best === 0, distance: best });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
