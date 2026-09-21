import type { PlantData } from './types';
import { escapeHtml, imageCreditOverlayHtml } from './html';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Nutzung (uses) and Funktionen (ecosystem functions) badge definitions —
 *  single source of truth, shared by the plant tiles/table on index.astro
 *  and the Gartenplan's detail panel so the two can't drift apart.
 *  Tuple: [PlantData key, pill classes, dot hex, i18n key].
 *  The dot hex values come from the Baumscheibe template's own color wedges
 *  where one exists for that field (see CHANGELOG.md "tabellenansicht verbessern"). */
export const USAGE_BADGE_DEFS: [keyof PlantData, string, string, string][] = [
  ['eatable',   'bg-amber-100 text-amber-800',   '#dc330c', 'badgeEatable'],
  ['culinaric', 'bg-yellow-100 text-yellow-800', '#f88a70', 'badgeCulinaric'],
  ['meds',      'bg-rose-100 text-rose-700',     '#fa512a', 'badgeMeds'],
  ['material',  'bg-orange-100 text-orange-800', '#fb923c', 'badgeMaterial'],
  ['fodder',    'bg-lime-100 text-lime-700',     '#a3e635', 'badgeFodder'],
  ['fuel',      'bg-red-100 text-red-700',       '#f87171', 'badgeFuel'],
];

export const FUNCTION_BADGE_DEFS: [keyof PlantData, string, string, string][] = [
  ['nitrogenFix',      'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300', '#92d051', 'badgeNitrogenFix'],
  ['mineralFix',       'bg-emerald-100 text-emerald-800', '#3cbbe4', 'badgeMineralFix'],
  ['groundCover',      'bg-teal-100 text-teal-800',       '#d4a525', 'badgeGroundCover'],
  ['insects',          'bg-cyan-100 text-cyan-800',       '#fadb07', 'badgeInsects'],
  ['windBreaking',     'bg-sky-100 text-sky-800',         '#c6c6c6', 'badgeWindBreaking'],
  ['animalProtection', 'bg-violet-100 text-violet-800',   '#ba7010', 'badgeAnimalProtection'],
];

/** Rough data-completeness score 0–100 used by the tiles' progress bar. */
export function completenessPercent(p: PlantData): number {
  const key = [p.latinName, p.commonName, p.heightM != null, p.widthM != null, p.imageUrl,
    p.sunFull || p.sunMid || p.sunShadow, p.waterDry || p.waterMid || p.waterWet || p.waterPlant,
    p.eatable || p.meds || p.nitrogenFix || p.material || p.fodder,
    p.fruitMonths.some(Boolean), p.flowerMonths.some(Boolean)];
  return Math.round(key.filter(Boolean).length / key.length * 100);
}

/** Full-pill badges for every set Nutzung/Funktionen flag. */
export function plantBadgesHtml(p: PlantData, t: Translate): string {
  return [...USAGE_BADGE_DEFS, ...FUNCTION_BADGE_DEFS]
    .filter(([k]) => p[k])
    .map(([, cls, , i18nKey]) => `<span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}">${escapeHtml(t(i18nKey))}</span>`)
    .join(' ');
}

/** Compact 12-tick bloom/fruit bar — same color language as /kalender and
 *  the plant table (amber = bloom, green = fruit, emerald = both). */
export function phenologyBarHtml(p: PlantData): string {
  const flower = p.flowerMonths ?? [];
  const fruit = p.fruitMonths ?? [];
  if (!flower.some(Boolean) && !fruit.some(Boolean)) return '';
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const f = !!flower[i], r = !!fruit[i];
    const cls = f && r ? 'bg-emerald-400' : f ? 'bg-amber-300' : r ? 'bg-green-500' : 'bg-stone-100 dark:bg-stone-700';
    return `<span class="h-2.5 w-1 rounded-sm ${cls}"></span>`;
  }).join('');
  return `<div class="flex gap-px">${ticks}</div>`;
}

/** Detail block for a single plant — the same information a plant tile on
 *  the Pflanzen page shows (image, names, dimensions/zone, use/function
 *  badges, bloom/fruit bar, completeness), minus the tile's plant-management
 *  actions (enrich/edit/delete/print count), which don't belong in contexts
 *  like the Gartenplan where the plant is referenced rather than managed. */
export function plantDetailHtml(p: PlantData, t: Translate): string {
  const pct = completenessPercent(p);
  const barColor = pct >= 80 ? 'bg-green-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-300';
  const badges = plantBadgesHtml(p, t);
  const phenology = phenologyBarHtml(p);
  const dims = [
    p.heightM != null ? `↕ ${p.heightM}m` : '',
    p.widthM != null ? `↔ ${p.widthM}m` : '',
    p.climateZone ? escapeHtml(t('zoneLabel', { zone: p.climateZone })) : '',
  ].filter(Boolean).map(s => `<span>${s}</span>`).join('');

  return `
    ${p.imageUrl ? `<div class="relative mb-2 h-24 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
      <img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.commonName || p.latinName)}" class="h-full w-full object-cover" loading="lazy" onerror="this.parentElement.remove()" />
      ${imageCreditOverlayHtml(p.imageCredit)}
    </div>` : ''}
    <p class="text-sm font-bold text-stone-800 dark:text-stone-100">${escapeHtml(p.commonName || p.latinName)}</p>
    <p class="mb-1.5 text-xs italic text-stone-500 dark:text-stone-400">${escapeHtml(p.latinName)}</p>
    ${dims ? `<div class="mb-1.5 flex gap-3 text-xs text-stone-500 dark:text-stone-400">${dims}</div>` : ''}
    ${badges ? `<div class="mb-2 flex flex-wrap gap-1">${badges}</div>` : ''}
    ${phenology ? `<div class="mb-2"><span class="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-400 dark:text-stone-500">${escapeHtml(t('thPhenology'))}</span>${phenology}</div>` : ''}
    <div class="mb-2 flex items-center gap-2">
      <div class="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div class="h-full rounded-full ${barColor}" style="width:${pct}%"></div>
      </div>
      <span class="text-[10px] tabular-nums text-stone-400 dark:text-stone-500">${pct}%</span>
    </div>`;
}
