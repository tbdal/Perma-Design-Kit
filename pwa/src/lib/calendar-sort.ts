import type { PlantData } from './types';
import { displayName } from './plant-name';

export type CalendarSort = 'name' | 'flowerEarliest' | 'flowerLatest' | 'fruitEarliest' | 'fruitLatest';

/** First month of the season (0=Jan); a season across the turn of the year
 *  (Nov–Feb) starts in Nov, not Jan. -1 = no month set. */
export function seasonStart(m: boolean[] | undefined): number {
  if (!m?.some(Boolean)) return -1;
  if (m.every(Boolean)) return 0;
  // a month that is on while the one before it is off; the earliest such one in the year
  // unless the season wraps: then the start is the one after the last gap
  const starts = [...Array(12).keys()].filter(i => m[i] && !m[(i + 11) % 12]);
  return m[0] && m[11] ? starts[starts.length - 1] : starts[0];
}
/** Last month of the season; Nov–Feb ends in Feb. -1 = no month set. */
export function seasonEnd(m: boolean[] | undefined): number {
  if (!m?.some(Boolean)) return -1;
  if (m.every(Boolean)) return 11;
  const ends = [...Array(12).keys()].filter(i => m[i] && !m[(i + 1) % 12]);
  return m[0] && m[11] ? ends[0] : ends[ends.length - 1];
}
const first = seasonStart;
const last = seasonEnd;

/** Sort key, smaller first; plants without the relevant months go last.
 *  "Earliest" = first active month ascending, "latest" = last active month
 *  descending (what blooms / bears latest in the year comes first). */
function key(p: PlantData, sort: CalendarSort): number {
  switch (sort) {
    case 'flowerEarliest': { const i = first(p.flowerMonths); return i === -1 ? Infinity : i; }
    case 'flowerLatest': { const i = last(p.flowerMonths); return i === -1 ? Infinity : -i; }
    case 'fruitEarliest': { const i = first(p.fruitMonths); return i === -1 ? Infinity : i; }
    case 'fruitLatest': { const i = last(p.fruitMonths); return i === -1 ? Infinity : -i; }
    case 'name': return 0;
  }
}

export function sortCalendar(plants: PlantData[], sort: CalendarSort, lang: string): PlantData[] {
  return plants
    .map(p => ({ p, k: key(p, sort), name: displayName(p) }))
    .sort((a, b) => (a.k === b.k ? 0 : a.k < b.k ? -1 : 1) || a.name.localeCompare(b.name, lang))
    .map(x => x.p);
}

/** Active months as ranges: "Jun–Jul, Sep" (names given per language). */
export function monthRanges(months: boolean[] | undefined, names: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    if (!months?.[i]) continue;
    let j = i;
    while (j + 1 < 12 && months[j + 1]) j++;
    out.push(i === j ? names[i] : `${names[i]}–${names[j]}`);
    i = j;
  }
  return out.join(', ');
}
