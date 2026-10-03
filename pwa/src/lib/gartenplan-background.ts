import type { GardenPlan } from './types';
import { tilesForPlan } from './gartenplan-geo';
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

/** OSM tiles under the plan, as SVG markup in plan units. Tiles are laid out
 *  in the local east/south frame and the whole group is turned by
 *  rotate(−θ) — exactly the ENU → plan mapping of gartenplan-geo.ts with SVG's
 *  y-down axis. `screenMPerPx` = ground meters per device pixel on screen. */
export function basemapSvg(plan: GardenPlan, screenMPerPx: number, clipId: string): string {
  const geo = plan.geo;
  if (!geo || geo.basemap === 'none') return '';
  const tiles = tilesForPlan(plan.areaWidthM, plan.areaHeightM, geo, screenMPerPx, OSM_TILES.maxZoom);
  const u = SVG_UNITS_PER_METER;
  // A hair of overlap hides the anti-aliasing seams between rotated tiles.
  const images = tiles.map(t => {
    const size = t.sizeM * u * 1.003;
    return `<image href="${tileUrl(OSM_TILES, t.z, t.x, t.y)}" x="${t.eM * u}" y="${t.sM * u}" width="${size}" height="${size}" preserveAspectRatio="none"/>`;
  }).join('');
  return `
    <clipPath id="${clipId}"><rect width="${plan.areaWidthM * u}" height="${plan.areaHeightM * u}"/></clipPath>
    <g clip-path="url(#${clipId})" opacity="${geo.opacity}" pointer-events="none">
      <g transform="rotate(${-geo.rotationDeg})">${images}</g>
    </g>`;
}

/** North arrow in the top-right corner, pointing to geographic north. */
export function northArrowSvg(plan: GardenPlan): string {
  if (!plan.geo) return '';
  const u = SVG_UNITS_PER_METER;
  const r = Math.max(14, Math.min(plan.areaWidthM, plan.areaHeightM) * u * 0.07);
  const cx = plan.areaWidthM * u - r * 2.2, cy = r * 2.2;
  return `
    <g transform="translate(${cx},${cy})" pointer-events="none">
      <circle r="${r * 1.8}" fill="#ffffff" fill-opacity="0.85" stroke="#a8a29e" stroke-width="1"/>
      <g transform="rotate(${-plan.geo.rotationDeg})">
        <path d="M 0 ${-r} L ${r * 0.45} ${r * 0.6} L 0 ${r * 0.3} L ${-r * 0.45} ${r * 0.6} Z" fill="#1c1917"/>
        <text y="${-r * 1.08}" text-anchor="middle" font-size="${r * 0.8}" font-weight="bold" fill="#1c1917">N</text>
      </g>
    </g>`;
}
