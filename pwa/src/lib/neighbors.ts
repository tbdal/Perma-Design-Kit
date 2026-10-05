import type { GardenPlan, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';

// Good and bad neighbours in a garden plan.
//
// Bad: allelopathy — plants whose roots/leaves release substances that harm
// sensitive neighbours. Walnuts and hickories (juglone): strong in black
// walnut and butternut, moderate in English walnut and hickories; in a
// mature black walnut the toxic zone reaches 15–18 m (50–60 ft) from the
// trunk. Sensitive / resistant plants after US extension fact sheets
// (PNW Plant Disease Management Handbook "Walnut – Black Walnut Toxicity";
// Washtenaw County CD / R. Funt & J. Martin, Ohio State, "Black Walnut
// Toxicity"; Penn State Extension). Pear is listed as resistant.
// Fennel and wormwood are widely named as poor neighbours in garden
// literature (weaker evidence; short range).
//
// Good: from the plants' own functions — a nitrogen fixer, a nutrient
// accumulator or an insect/pollinator plant close to a fruiting tree or
// shrub supports it (the guild idea).

export interface Allelopath { radiusM: number; label: Record<'de' | 'en', string>; affects: 'juglone' | 'general'; }

/** Producers by Latin name (genus + species, lower case) or genus. */
export const ALLELOPATHS: Record<string, Allelopath> = {
  'juglans nigra': { radiusM: 16, affects: 'juglone', label: { de: 'Juglon (stark)', en: 'juglone (strong)' } },
  'juglans cinerea': { radiusM: 14, affects: 'juglone', label: { de: 'Juglon (stark)', en: 'juglone (strong)' } },
  'juglans regia': { radiusM: 8, affects: 'juglone', label: { de: 'Juglon (mäßig)', en: 'juglone (moderate)' } },
  'juglans ailanthifolia': { radiusM: 8, affects: 'juglone', label: { de: 'Juglon (mäßig)', en: 'juglone (moderate)' } },
  carya: { radiusM: 6, affects: 'juglone', label: { de: 'Juglon (mäßig)', en: 'juglone (moderate)' } },
  'foeniculum vulgare': { radiusM: 1.5, affects: 'general', label: { de: 'hemmt Nachbarn', en: 'inhibits neighbours' } },
  'artemisia absinthium': { radiusM: 1.5, affects: 'general', label: { de: 'hemmt Nachbarn', en: 'inhibits neighbours' } },
};

/** Juglone-sensitive genera / species (lower case). */
export const JUGLONE_SENSITIVE = [
  'malus', 'vaccinium', 'rubus fruticosus', 'rubus allegheniensis', 'betula', 'alnus', 'pinus', 'picea', 'syringa', 'magnolia',
  'rhododendron', 'kalmia', 'ligustrum', 'paeonia', 'rheum', 'asparagus', 'solanum', 'capsicum', 'brassica', 'medicago', 'acer saccharinum',
];

const words = (latin: string) => latin.trim().toLowerCase().replace(/[×✕]/g, 'x').split(/\s+/);
const keyMatch = (latin: string, keys: string[]) => {
  const w = words(latin);
  const sp = w.slice(0, 2).join(' ');
  return keys.find(k => k === sp || k === w[0]);
};

export function allelopathOf(p: Pick<PlantData, 'latinName'>): Allelopath | null {
  const k = keyMatch(p.latinName, Object.keys(ALLELOPATHS));
  return k ? ALLELOPATHS[k] : null;
}

export function jugloneSensitive(p: Pick<PlantData, 'latinName'>): boolean {
  return !!keyMatch(p.latinName, JUGLONE_SENSITIVE);
}

export interface BadNeighbor { kind: 'badNeighbor'; source: string; target: string; distM: number; radiusM: number; reason: Allelopath; }
export interface GoodNeighbor { kind: 'goodNeighbor'; target: string; helpers: { id: string; role: 'nitrogen' | 'nutrients' | 'insects' }[]; }

const fruiting = (p: PlantData) => p.eatable && ['tree', 'shrub'].includes(deriveLayer(p));

export function neighborHints(plan: GardenPlan, plantsById: Map<string, PlantData>, years = 30): { bad: BadNeighbor[]; good: GoodNeighbor[] } {
  const items = plan.placements.flatMap(pl => { const p = plantsById.get(pl.plantId); return p ? [{ pl, p }] : []; });
  const bad: BadNeighbor[] = [];
  const good: GoodNeighbor[] = [];
  for (const a of items) {
    const al = allelopathOf(a.p);
    if (!al) continue;
    for (const b of items) {
      if (a === b || b.p.id === a.p.id) continue;
      const hit = al.affects === 'juglone' ? jugloneSensitive(b.p) : !allelopathOf(b.p);
      if (!hit) continue;
      const d = Math.hypot(a.pl.xM - b.pl.xM, a.pl.yM - b.pl.yM);
      if (d < al.radiusM) bad.push({ kind: 'badNeighbor', source: a.pl.id, target: b.pl.id, distM: d, radiusM: al.radiusM, reason: al });
    }
  }
  for (const a of items) {
    if (!fruiting(a.p)) continue;
    const reach = Math.max(2, displayRadiusM(a.p, years) * 1.5);
    const helpers: GoodNeighbor['helpers'] = [];
    for (const b of items) {
      if (a === b) continue;
      if (Math.hypot(a.pl.xM - b.pl.xM, a.pl.yM - b.pl.yM) > reach) continue;
      const role = b.p.nitrogenFix ? 'nitrogen' : b.p.mineralFix ? 'nutrients' : b.p.insects && b.p.id !== a.p.id ? 'insects' : null;
      if (role && !helpers.some(h => h.id === b.pl.id)) helpers.push({ id: b.pl.id, role });
    }
    if (helpers.length) good.push({ kind: 'goodNeighbor', target: a.pl.id, helpers });
  }
  return { bad: bad.sort((x, y) => x.distM / x.radiusM - y.distM / y.radiusM), good };
}
