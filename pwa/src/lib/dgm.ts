import type { GardenPlanGeo } from './types';
import type { Lang } from './i18n/core';
import { planToLatLon } from './gartenplan-geo';
import { latLonToUtm } from './utm';
import { ORTHO_SOURCES } from './ortho-sources';
import type { ElevationGrid } from './terrain';

// Official 1 m terrain models ("DGM1") of the German states — open data,
// queried as WCS 2.0 GetCoverage (float32 GeoTIFF) straight from the
// browser (CORS checked 2026-10-04). Where one covers the garden, its heights
// replace the coarse Terrain Tiles in the elevation grid; outside its area
// (nodata) the coarse value stays. Other states only offer downloads or
// closed services so far (Bayern: paid WCS; Sachsen, Sachsen-Anhalt: 403).

export interface DgmSource {
  id: string;
  region: Record<Lang, string>;
  url: string;
  coverageId: string;
  crs: 25832 | 25833 | 4326;
  axes: [string, string];        // subset axis names (x/E/Long, y/N/Lat)
  scaling: boolean;              // supports SCALESIZE
  resolutionM: number;
  attributionHtml: string;       // {YEAR} = year of retrieval
  coverage: string;              // id in ORTHO_SOURCES whose outline is used
}

const A = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const DLBY = A('https://www.govdata.de/dl-de/by-2-0', 'dl-de/by-2-0');
const DLZERO = A('https://www.govdata.de/dl-de/zero-2-0', 'dl-de/zero-2-0');
const CCBY = A('https://creativecommons.org/licenses/by/4.0/', 'CC BY 4.0');

export const DGM_SOURCES: DgmSource[] = [
  { id: 'nw', region: { de: 'NRW', en: 'NRW' }, url: 'https://www.wcs.nrw.de/geobasis/wcs_nw_dgm', coverageId: 'nw_dgm', crs: 25832, axes: ['x', 'y'], scaling: true, resolutionM: 1,
    attributionHtml: `Gelände: © ${A('https://www.bezreg-koeln.nrw.de/geobasis-nrw', 'Geobasis NRW')}, ${DLZERO}`, coverage: 'nw' },
  { id: 'bb', region: { de: 'Brandenburg/Berlin', en: 'Brandenburg/Berlin' }, url: 'https://isk.geobasis-bb.de/ows/dgm_wcs', coverageId: 'bb_dgm', crs: 25833, axes: ['x', 'y'], scaling: true, resolutionM: 1,
    attributionHtml: `Gelände: © GeoBasis-DE/LGB, ${DLBY}`, coverage: 'bb' },
  { id: 'bw', region: { de: 'Baden-Württemberg', en: 'Baden-Württemberg' }, url: 'https://owsproxy.lgl-bw.de/owsproxy/wcs/WCS_INSP_BW_Hoehe_Coverage_DGM1', coverageId: 'EL.ElevationGridCoverage', crs: 25832, axes: ['E', 'N'], scaling: false, resolutionM: 1,
    attributionHtml: `Gelände: © ${A('https://www.lgl-bw.de', 'LGL-BW')} ({YEAR}), ${DLBY}`, coverage: 'bw' },
  { id: 'he', region: { de: 'Hessen', en: 'Hesse' }, url: 'https://inspire-hessen.de/raster/dgm1/ows', coverageId: 'he_dgm1', crs: 25832, axes: ['E', 'N'], scaling: true, resolutionM: 1,
    attributionHtml: `Gelände: © ${A('https://hvbg.hessen.de', 'HVBG')}, ${DLZERO}`, coverage: 'he' },
  { id: 'ni', region: { de: 'Niedersachsen', en: 'Lower Saxony' }, url: 'https://opendata.geoservices.lgln.niedersachsen.de/dgm_wcs', coverageId: 'ni_dgm1', crs: 25832, axes: ['x', 'y'], scaling: true, resolutionM: 1,
    attributionHtml: `Gelände: © ${A('https://www.lgln.niedersachsen.de', 'LGLN')} ({YEAR}), ${CCBY}`, coverage: 'ni' },
  { id: 'nl', region: { de: 'Niederlande (AHN)', en: 'Netherlands (AHN)' }, url: 'https://service.pdok.nl/rws/ahn/wcs/v1_0', coverageId: 'dtm_05m', crs: 4326, axes: ['Long', 'Lat'], scaling: true, resolutionM: 0.5,
    attributionHtml: `Gelände: AHN, ${A('https://www.pdok.nl', 'Rijkswaterstaat/PDOK')}, CC0`, coverage: 'nl' },
];

function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The 1 m terrain model covering a location, or null. */
export function dgmFor(lat: number, lon: number): DgmSource | null {
  // Bremen lies inside the Niedersachsen outline but isn't in its model.
  if (ORTHO_SOURCES.find(s => s.id === 'hb')?.coverage.some(r => inRing(lon, lat, r))) return null;
  for (const d of DGM_SOURCES) {
    const o = ORTHO_SOURCES.find(s => s.id === d.coverage);
    if (o?.coverage.some(r => inRing(lon, lat, r))) return d;
  }
  return null;
}

/** lat/lon → the source's native coordinates. */
export function toNative(d: DgmSource, lat: number, lon: number): { x: number; y: number } {
  if (d.crs === 4326) return { x: lon, y: lat };
  return latLonToUtm(lat, lon, d.crs === 25833 ? 33 : 32);
}

/** GetCoverage URL for a native bounding box and output size. */
export function coverageUrl(d: DgmSource, b: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number): string {
  const f = (v: number) => (d.crs === 4326 ? v.toFixed(7) : v.toFixed(1));
  let u = `${d.url}?SERVICE=WCS&REQUEST=GetCoverage&VERSION=2.0.1&COVERAGEID=${d.coverageId}&FORMAT=image/tiff`
    + `&SUBSET=${d.axes[0]}(${f(b.minX)},${f(b.maxX)})&SUBSET=${d.axes[1]}(${f(b.minY)},${f(b.maxY)})`
    + `&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/${d.crs}`;
  if (d.crs === 4326) u += `&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`;
  if (d.scaling) u += `&SCALESIZE=${d.axes[0]}(${w}),${d.axes[1]}(${h})`;
  return u;
}

const MAX_PX = 640;            // per axis when the service can scale
const MAX_UNSCALED_M = 700;    // without scaling: skip larger areas

/** Replaces the heights of `grid` with the 1 m model where it has data.
 *  Returns null if no model covers the garden or the request failed. */
export async function refineWithDgm(grid: ElevationGrid, geo: GardenPlanGeo): Promise<ElevationGrid | null> {
  const d = dgmFor(geo.lat, geo.lon);
  if (!d) return null;
  const maxX = grid.minX + (grid.nx - 1) * grid.cellM, maxY = grid.minY + (grid.ny - 1) * grid.cellM;
  // Native coordinates of every grid sample (also gives the bounding box).
  const nat = new Float64Array(grid.nx * grid.ny * 2);
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    const ll = planToLatLon({ xM: grid.minX + i * grid.cellM, yM: grid.minY + j * grid.cellM }, geo);
    const p = toNative(d, ll.lat, ll.lon);
    const k = (j * grid.nx + i) * 2;
    nat[k] = p.x; nat[k + 1] = p.y;
    if (p.x < bx0) bx0 = p.x; if (p.x > bx1) bx1 = p.x;
    if (p.y < by0) by0 = p.y; if (p.y > by1) by1 = p.y;
  }
  const pad = d.crs === 4326 ? 0.00003 : 2;
  const box = { minX: bx0 - pad, minY: by0 - pad, maxX: bx1 + pad, maxY: by1 + pad };
  const spanM = d.crs === 4326 ? (box.maxY - box.minY) * 111320 : Math.max(box.maxX - box.minX, box.maxY - box.minY);
  if (!d.scaling && spanM > MAX_UNSCALED_M) return null;
  const w = Math.max(16, Math.min(MAX_PX, Math.round((d.crs === 4326 ? (box.maxX - box.minX) * 111320 * Math.cos(geo.lat * Math.PI / 180) : box.maxX - box.minX) / d.resolutionM)));
  const h = Math.max(16, Math.min(MAX_PX, Math.round((d.crs === 4326 ? (box.maxY - box.minY) * 111320 : box.maxY - box.minY) / d.resolutionM)));
  const res = await fetch(coverageUrl(d, box, w, h));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('tiff')) return null;
  const { fromArrayBuffer } = await import('geotiff');
  const tiff = await fromArrayBuffer(await res.arrayBuffer());
  const img = await tiff.getImage();
  const W = img.getWidth(), H = img.getHeight();
  const raster = (await img.readRasters({ interleave: true })) as unknown as ArrayLike<number>;
  const [gx0, gy0, gx1, gy1] = img.getBoundingBox();
  const nodata = img.getGDALNoData();
  const valid = (v: number) => Number.isFinite(v) && v !== nodata && v > -500 && v < 9000;
  const heights = new Float32Array(grid.heights);
  const hit = new Uint8Array(grid.nx * grid.ny);
  let replaced = 0;
  for (let k = 0; k < grid.nx * grid.ny; k++) {
    const fx = (nat[k * 2] - gx0) / (gx1 - gx0) * W - 0.5;
    const fy = (gy1 - nat[k * 2 + 1]) / (gy1 - gy0) * H - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
    const a = raster[y0 * W + x0], b = raster[y0 * W + x0 + 1], c = raster[(y0 + 1) * W + x0], e = raster[(y0 + 1) * W + x0 + 1];
    if (!valid(a) || !valid(b) || !valid(c) || !valid(e)) continue;
    const tx = fx - x0, ty = fy - y0;
    heights[k] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    hit[k] = 1;
    replaced++;
  }
  if (replaced < grid.nx * grid.ny * 0.1) return null;
  // Gaps (no data, e.g. under buildings in the AHN, or beyond the state
  // border) keep the coarse value, shifted by the median offset between the
  // two models so there are no steps at the seams.
  const diffs: number[] = [];
  for (let k = 0; k < hit.length; k += Math.max(1, Math.floor(hit.length / 4000))) if (hit[k]) diffs.push(heights[k] - grid.heights[k]);
  diffs.sort((x, y) => x - y);
  const shift = diffs.length ? diffs[diffs.length >> 1] : 0;
  for (let k = 0; k < hit.length; k++) if (!hit[k]) heights[k] = grid.heights[k] + shift;
  return {
    ...grid, heights,
    dgm: { region: d.region, resolutionM: d.resolutionM, attributionHtml: d.attributionHtml.replace('{YEAR}', String(new Date().getFullYear())) },
  };
}
