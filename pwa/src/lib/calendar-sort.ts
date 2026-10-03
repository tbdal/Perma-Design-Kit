import type { PlantData } from './types';
import { displayName } from './plant-name';

export type CalendarSort = 'name' | 'flowerEarliest' | 'flowerLatest' | 'fruitEarliest' | 'fruitLatest';

const first = (m: boolean[] | undefined) => m?.findIndex(Boolean) ?? -1;
const last = (m: boolean[] | undefined) => m ? m.lastIndexOf(true) : -1;

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
