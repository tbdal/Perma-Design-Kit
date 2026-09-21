import type { GardenPlan, PlantData } from './types';
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

function gridDefsAndBackground(widthM: number, heightM: number, spacingM: number, patternId: string): string {
  const spacingU = spacingM * SVG_UNITS_PER_METER;
  return `
    <defs>
      <pattern id="${patternId}" width="${spacingU}" height="${spacingU}" patternUnits="userSpaceOnUse">
        <path d="M ${spacingU} 0 L 0 0 0 ${spacingU}" fill="none" stroke="#d6d3d1" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${widthM * SVG_UNITS_PER_METER}" height="${heightM * SVG_UNITS_PER_METER}" fill="url(#${patternId})" stroke="#a8a29e" stroke-width="2"/>`;
}

/** Static (non-interactive) render of a garden plan at a given year — used
 *  for PDF/print export. Visually matches the live editor's canvas (same
 *  grid/blob/label logic) but with no selection state and no drag wiring,
 *  since neither applies to a static export. Returns just the SVG's inner
 *  markup (grid + boundary + markers) — the caller wraps it in a root
 *  <svg> with whatever viewBox/dimensions the export needs. */
export function renderGardenPlanInnerSvg(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number): string {
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
        <path d="${d}" fill="${style.fill}" fill-opacity="0.6" stroke="${style.stroke}" stroke-width="2"/>
        <circle r="3" fill="#1c1917"/>
        <text class="marker-label" y="${radiusU + 14}" text-anchor="middle" font-size="13" fill="#1c1917" stroke="#ffffff" stroke-width="3" paint-order="stroke">${name}</text>
      </g>`;
  }).join('');
  return `
    ${gridDefsAndBackground(plan.areaWidthM, plan.areaHeightM, plan.gridSpacingM, 'export-grid')}
    <polygon points="${pointsAttr}" fill="#15803d" fill-opacity="0.08" stroke="#15803d" stroke-width="2"/>
    <g>${markers}</g>`;
}

/** Full standalone SVG document string for a garden plan — inner markup
 *  plus a root <svg> with explicit viewBox/width/height, suitable for
 *  rasterizing via `new Image()` (see pdf-export.ts). */
export function renderGardenPlanFullSvg(plan: GardenPlan, plantsById: Map<string, PlantData>, years: number): string {
  const w = plan.areaWidthM * SVG_UNITS_PER_METER;
  const h = plan.areaHeightM * SVG_UNITS_PER_METER;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${renderGardenPlanInnerSvg(plan, plantsById, years)}</svg>`;
}
