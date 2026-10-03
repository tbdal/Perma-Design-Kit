import type { GardenPlan, GardenPlanGeo } from './types';
import { tilesForRect, type PlanRect } from './gartenplan-geo';
import { SVG_UNITS_PER_METER } from './gartenplan-render';
import { orthoFor, type OrthoSource } from './ortho-sources';

// Map tile sources. Kept in one place so swapping a provider (e.g. the EOX
// satellite layer once its license for production use is settled, see
// ROADMAP "Karten") touches only this table.
export interface TileSource {
  url: string;           // {z}/{x}/{y} template, or a WMS GetMap URL with {bbox} (EPSG:3857)
  maxZoom: number;       // highest zoom actually served
  attributionHtml: string;
  /** Below minZoom tiles come from `fallback` (WMS orthophotos render
   *  nothing at overview scales). */
  minZoom?: number;
  fallback?: TileSource;
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

const HALF_WORLD = 20037508.342789244;

export function tileUrl(src: TileSource, z: number, x: number, y: number): string {
  if (src.fallback && src.minZoom !== undefined && z < src.minZoom) return tileUrl(src.fallback, z, x, y);
  if (src.url.includes('{bbox}')) {
    const s = (2 * HALF_WORLD) / 2 ** z;
    const bbox = [-HALF_WORLD + x * s, HALF_WORLD - (y + 1) * s, -HALF_WORLD + (x + 1) * s, HALF_WORLD - y * s];
    return src.url.replace('{bbox}', bbox.map(v => v.toFixed(2)).join(','));
  }
  return src.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

export function orthoTiles(o: OrthoSource): TileSource {
  return {
    url: o.url, maxZoom: o.maxZoom, minZoom: o.minZoom, fallback: S2_TILES,
    // Short credit for the overview fallback; the full one shows with 'sat'.
    attributionHtml: o.attributionHtml.replace('{YEAR}', String(new Date().getFullYear()))
      + ' · Übersicht: <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> (EOX, Copernicus)',
  };
}

/** Tile source for a geo-referenced plan's background; null for 'none'.
 *  'ortho' falls back to the coarse satellite layer outside all coverages. */
export function sourceForGeo(geo: GardenPlanGeo | null | undefined): TileSource | null {
  if (!geo || geo.basemap === 'none') return null;
  if (geo.basemap === 'ortho') {
    const o = orthoFor(geo.lat, geo.lon);
    return o ? orthoTiles(o) : S2_TILES;
  }
  return geo.basemap === 'sat' ? S2_TILES : OSM_TILES;
}

export function hasBasemap(plan: GardenPlan): boolean {
  return !!plan.geo && plan.geo.basemap !== 'none';
}

function sourceFor(plan: GardenPlan): TileSource {
  return sourceForGeo(plan.geo) ?? OSM_TILES;
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
