import type { PlantData } from './types';
import { escapeHtml, imageCreditOverlayHtml } from './html';
import { displayName } from './plant-name';
import { badgedFieldsOf, fieldsOf, fieldLabelKey, type FieldGroup } from './plant-fields';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** [PlantData key, pill classes, dot hex, translated label, short code] — the
 *  shape the tile/table renderers consume, derived from the central field
 *  table. The code is the table PDF's chip code (Es, Me, N, Mi …). */
export type BadgeDef = [keyof PlantData, string, string, string, string];

export function badgeDefs(group: FieldGroup, t: Translate): BadgeDef[] {
  return badgedFieldsOf(group).map(f => [f.key, f.badge.pill, f.badge.hex, t(fieldLabelKey(f.key)), f.badge.pdfCode]);
}

/** Black or white, whichever reads better on the given #rrggbb background. */
function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000' : '#fff';
}

/**
 * One color key (dot) for the plant table and its legend. Always named for
 * screen readers; with `showCode` (setting "Kürzel statt Farbpunkte") it
 * carries its short code, so it doesn't rely on color alone.
 */
export function dotHtml(hex: string, label: string, code: string, showCode: boolean): string {
  const name = escapeHtml(label);
  if (!showCode) {
    return `<span role="img" aria-label="${name}" title="${name}" class="inline-block h-2 w-2 rounded-full" style="background-color:${hex}"></span>`;
  }
  return `<span role="img" aria-label="${name}" title="${name}" class="inline-flex h-4 min-w-4 items-center justify-center rounded px-0.5 text-[9px] font-bold leading-none" style="background-color:${hex};color:${inkOn(hex)}">${escapeHtml(code)}</span>`;
}

/** Data-completeness score 0–100 — the single definition behind the tiles'
 *  progress bar, the "Vollst." filter and the completeness sort. */
export function completenessPercent(p: PlantData): number {
  const any = (group: FieldGroup) => fieldsOf(group).some(f => p[f.key]);
  const checks = [
    !!p.latinName,
    !!(p.commonName || p.commonNameEn),
    p.heightM != null,
    p.widthM != null,
    !!p.imageUrl,
    any('sun'),
    any('water'),
    any('usage') || any('function'),
    (p.fruitMonths ?? []).some(Boolean),
    (p.flowerMonths ?? []).some(Boolean),
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

/** Full-pill badges for every set Nutzung/Funktionen flag. */
export function plantBadgesHtml(p: PlantData, t: Translate): string {
  return [...badgeDefs('usage', t), ...badgeDefs('function', t)]
    .filter(([k]) => p[k])
    .map(([, cls, , label]) => `<span class="inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}">${escapeHtml(label)}</span>`)
    .join(' ');
}

/** Small grey pills for the user's own group names. */
export function groupPillsHtml(p: PlantData, extraClass = ''): string {
  const groups = p.groups ?? [];
  if (groups.length === 0) return '';
  return `<div class="flex flex-wrap gap-1 ${extraClass}">${groups.map(g =>
    `<span class="inline-block rounded-full bg-stone-100 dark:bg-stone-700 px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:text-stone-300">${escapeHtml(g)}</span>`,
  ).join('')}</div>`;
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
    ${p.imageUrl ? `<div data-img-wrapper class="relative mb-2 h-24 overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-800">
      <img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(displayName(p))}" class="h-full w-full object-cover" loading="lazy" />
      ${imageCreditOverlayHtml(p.imageCredit)}
    </div>` : ''}
    <p class="text-sm font-bold text-stone-800 dark:text-stone-100">${escapeHtml(displayName(p))}</p>
    <p class="mb-1.5 text-xs italic text-stone-500 dark:text-stone-400">${escapeHtml(p.latinName)}</p>
    ${dims ? `<div class="mb-1.5 flex gap-3 text-xs text-stone-500 dark:text-stone-400">${dims}</div>` : ''}
    ${badges ? `<div class="mb-2 flex flex-wrap gap-1">${badges}</div>` : ''}
    ${groupPillsHtml(p, 'mb-2')}
    ${phenology ? `<div class="mb-2"><span class="mb-0.5 block text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400">${escapeHtml(t('thPhenology'))}</span>${phenology}</div>` : ''}
    <div class="mb-2 flex items-center gap-2">
      <div class="h-1.5 w-20 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        <div class="h-full rounded-full ${barColor}" style="width:${pct}%"></div>
      </div>
      <span class="text-[10px] tabular-nums text-stone-500 dark:text-stone-400">${pct}%</span>
    </div>`;
}
