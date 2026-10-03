import type { GardenPlan, GardenPlanArea, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer, LAYER_STYLE } from './plant-layer';
import { blobPathD } from './blob-shape';
import { escapeHtml } from './html';
import { displayName } from './plant-name';

// Kept in sync with gartenplan.astro's own constant (not imported from there —
// the page owns the interactive/draggable rendering with its own pointer-event
// wiring; this is the static, non-interactive variant used for PDF export,
// where no drag/selection state applies).
export const SVG_UNITS_PER_METER = 100;

/** Line/label scale for a plan of the given width. The canvas always fills
 *  the same screen width, so without this a 40 m plan drawn on the map would
 *  get ~2 px labels and invisible grid lines; with it, text stays ~13 px. */
export function uiScale(widthM: number): number {
  return Math.max(1, widthM / 7);
}

function gridDefsAndBackground(widthM: number, heightM: number, spacingM: number, patternId: string, k = 1): string {
  const spacingU = spacingM * SVG_UNITS_PER_METER;
  return `
    <defs>
      <pattern id="${patternId}" width="${spacingU}" height="${spacingU}" patternUnits="userSpaceOnUse">
        <path d="M ${spacingU} 0 L 0 0 0 ${spacingU}" fill="none" stroke="#d6d3d1" stroke-width="${k}"/>
      </pattern>
    </defs>
    <rect width="${widthM * SVG_UNITS_PER_METER}" height="${heightM * SVG_UNITS_PER_METER}" fill="url(#${patternId})" stroke="#a8a29e" stroke-width="${2 * k}"/>`;
}

/** Static (non-interactive) render of a garden plan at a given year — used
 *  for PDF/print export. Visually matches the live editor's canvas (same
 *  grid/blob/label logic) but with no selection state and no drag wiring,
 *  since neither applies to a static export. Returns just the SVG's inner
 *  markup (grid + boundary + markers) — the caller wraps it in a root
 *  <svg> with whatever viewBox/dimensions the export needs. */
export function renderGardenPlanInnerSvg(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number): string {
  const k = uiScale(plan.areaWidthM);
  const pointsAttr = plan.boundary.map(p => `${p.xM * SVG_UNITS_PER_METER},${p.yM * SVG_UNITS_PER_METER}`).join(' ');
  const markers = plan.placements.map(placement => {
    const p = plantsById.get(placement.plantId);
    const radiusM = p ? displayRadiusM(p, years) : 0.2;
    const radiusU = radiusM * SVG_UNITS_PER_METER;
    const layer = p ? deriveLayer(p) : 'shrub';
    const style = LAYER_STYLE[layer];
    const d = blobPathD(radiusU, placement.id, style.lobes, style.wobble);
    const name = escapeHtml(p ? (displayName(p)) : '?');
    const cx = placement.xM * SVG_UNITS_PER_METER;
    const cy = placement.yM * SVG_UNITS_PER_METER;
    return `
      <g transform="translate(${cx},${cy})">
        <path d="${d}" fill="${style.fill}" fill-opacity="0.6" stroke="${style.stroke}" stroke-width="${2 * k}"/>
        <circle r="${3 * k}" fill="#1c1917"/>
        <text class="marker-label" y="${radiusU + 14 * k}" text-anchor="middle" font-size="${13 * k}" fill="#1c1917" stroke="#ffffff" stroke-width="${3 * k}" paint-order="stroke">${name}</text>
      </g>`;
  }).join('');
  return `
    ${gridDefsAndBackground(plan.areaWidthM, plan.areaHeightM, plan.gridSpacingM, 'export-grid', k)}
    <polygon points="${pointsAttr}" fill="#15803d" fill-opacity="0.08" stroke="#15803d" stroke-width="${2 * k}"/>
    ${areasSvg(plan.areas ?? [], null, k)}
    <g>${markers}</g>`;
}

/** Colors offered for new areas, cycled in order. */
export const AREA_PALETTE = ['#22c55e', '#3b82f6', '#eab308', '#f97316', '#a855f7', '#ef4444', '#14b8a6', '#78716c'];

export function polygonCentroid(pts: { xM: number; yM: number }[]): { xM: number; yM: number } {
  // Area-weighted polygon centroid; falls back to the vertex mean for
  // degenerate (zero-area) shapes.
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j].xM * pts[i].yM - pts[i].xM * pts[j].yM;
    a += f; cx += (pts[j].xM + pts[i].xM) * f; cy += (pts[j].yM + pts[i].yM) * f;
  }
  if (Math.abs(a) < 1e-9) {
    return { xM: pts.reduce((s, p) => s + p.xM, 0) / pts.length, yM: pts.reduce((s, p) => s + p.yM, 0) / pts.length };
  }
  return { xM: cx / (3 * a), yM: cy / (3 * a) };
}

/** Named, colored areas (beds, pond, path…) as SVG markup in plan units.
 *  `selectedId` gets a thicker dashed outline. With `interactive` (editor)
 *  the fills carry `data-area-id` and take clicks for selecting; clicks still
 *  bubble to the canvas, so plants can be placed on top of an area. The PDF
 *  export renders them inert. */
export function areasSvg(areas: GardenPlanArea[], selectedId: string | null, k = 1, interactive = false): string {
  const u = SVG_UNITS_PER_METER;
  return `<g class="plan-areas"${interactive ? '' : ' pointer-events="none"'}>${areas.map(a => {
    const pts = a.points.map(p => `${p.xM * u},${p.yM * u}`).join(' ');
    const c = polygonCentroid(a.points);
    const sel = a.id === selectedId;
    return `
      <polygon${interactive ? ` data-area-id="${a.id}" style="cursor:pointer"` : ''} points="${pts}" fill="${a.color}" fill-opacity="0.3" stroke="${a.color}" stroke-width="${(sel ? 5 : 2.5) * k}"${sel ? ` stroke-dasharray="${10 * k} ${6 * k}"` : ''}/>
      ${a.name ? `<text pointer-events="none" x="${c.xM * u}" y="${c.yM * u}" text-anchor="middle" dominant-baseline="middle" font-size="${14 * k}" font-weight="600" fill="#1c1917" stroke="#ffffff" stroke-width="${3 * k}" paint-order="stroke">${escapeHtml(a.name)}</text>` : ''}`;
  }).join('')}</g>`;
}

/** Full standalone SVG document string for a garden plan — inner markup
 *  plus a root <svg> with explicit viewBox/width/height, suitable for
 *  rasterizing via `new Image()` (see pdf-export.ts). */
export function renderGardenPlanFullSvg(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number): string {
  const w = plan.areaWidthM * SVG_UNITS_PER_METER;
  const h = plan.areaHeightM * SVG_UNITS_PER_METER;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${renderGardenPlanInnerSvg(plan, plantsById, years)}</svg>`;
}
