import type { GardenPlan } from './types';
import { tilesForRect, type PlanRect } from './gartenplan-geo';
import { SVG_UNITS_PER_METER } from './gartenplan-render';

// Map tile sources. Kept in one place so swapping a provider (e.g. the EOX
// satellite layer once its license for production use is settled, see
// ROADMAP "Karten") touches only this table.
export interface TileSource {
  url: string;           // {z}/{x}/{y} template
  maxZoom: number;       // highest zoom actually served
  attributionHtml: string;
}

export const OSM_TILES: TileSource = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  maxZoom: 19,
  attributionHtml: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};

/** Sentinel-2 cloudless 2016 (10 m) — coarse context layer, shown only in the
 *  location dialog, never under the plan. Data CC BY 4.0; EOX's hosted WMTS is
 *  free for non-commercial use only. */
export const S2_TILES: TileSource = {
  url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg',
  maxZoom: 14,
  attributionHtml: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017)',
};

export function tileUrl(src: TileSource, z: number, x: number, y: number): string {
  return src.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function hasBasemap(plan: GardenPlan): boolean {
  return !!plan.geo && plan.geo.basemap !== 'none';
}

function sourceFor(plan: GardenPlan): TileSource {
  return plan.geo?.basemap === 'sat' ? S2_TILES : OSM_TILES;
}

/** Attribution HTML for the plan's current background, '' without one. */
export function basemapAttribution(plan: GardenPlan): string {
  return hasBasemap(plan) ? sourceFor(plan).attributionHtml : '';
}

/** Map tiles (OSM or coarse satellite) for the visible rectangle `view` (plan
 *  meters — may reach beyond the plan when zoomed out, so the surroundings
 *  show too). Tiles are laid out in the local east/south frame and the group
 *  is turned by rotate(−θ) — exactly the ENU → plan mapping of
 *  gartenplan-geo.ts with SVG's y-down axis. `screenMPerPx` = ground meters
 *  per device pixel on screen. */
export function basemapSvg(plan: GardenPlan, view: PlanRect, screenMPerPx: number): string {
  const geo = plan.geo;
  if (!geo || geo.basemap === 'none') return '';
  const src = sourceFor(plan);
  const tiles = tilesForRect(view, geo, screenMPerPx, src.maxZoom);
  const u = SVG_UNITS_PER_METER;
  // A hair of overlap hides the anti-aliasing seams between rotated tiles.
  const images = tiles.map(t => {
    const size = t.sizeM * u * 1.003;
    return `<image href="${tileUrl(src, t.z, t.x, t.y)}" x="${t.eM * u}" y="${t.sM * u}" width="${size}" height="${size}" preserveAspectRatio="none"/>`;
  }).join('');
  return `<g opacity="${geo.opacity}" pointer-events="none"><g transform="rotate(${-geo.rotationDeg})">${images}</g></g>`;
}
