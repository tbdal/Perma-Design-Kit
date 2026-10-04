import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_TILES, S2_TILES, orthoTiles, tileUrl, fallbackTileUrl, FALLBACK_ATTRIBUTION, type TileSource } from './gartenplan-background';
import { orthoFor } from './ortho-sources';
import type { Lang } from './i18n/core';

// Shared Leaflet plumbing for the garden plan: base map with the OSM / coarse
// satellite layers, Nominatim address search and "my location". Used by the
// draw-on-map step (gartenplan-mapdraw.ts) and the location dialog for plans
// drawn on the plain grid (gartenplan-locate.ts). Only ever reached through
// import(), so Leaflet stays out of the normal page load.

export const DEFAULT_CENTER: L.LatLngTuple = [51.2, 10.4];  // Germany, zoomed out
const NOMINATIM_MIN_INTERVAL_MS = 1100;                     // Nominatim policy: max 1 request/s
let lastSearchAt = 0;

export type BaseLayer = 'osm' | 'sat' | 'ortho';

export interface BaseMap {
  map: L.Map;
  setLayer(v: BaseLayer): void;
}

/** Tile layer for any TileSource — also WMS sources with a {bbox} template. */
function sourceLayer(src: TileSource): L.TileLayer {
  const layer = L.tileLayer('', { maxZoom: 21, maxNativeZoom: src.maxZoom, attribution: src.attributionHtml });
  layer.getTileUrl = (c: L.Coords) => tileUrl(src, c.z, c.x, c.y);
  // Aerial-photo service not answering → coarse satellite / OSM per tile.
  let credited = false;
  layer.on('tileerror', (e: L.TileErrorEvent) => {
    const img = e.tile as HTMLImageElement;
    const fb = fallbackTileUrl(src, e.coords.z, e.coords.x, e.coords.y);
    if (!fb || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    img.src = fb;
    if (!credited) { credited = true; (layer as any)._map?.attributionControl?.addAttribution(FALLBACK_ATTRIBUTION); }
  });
  return layer;
}

export function createBaseMap(el: HTMLElement): BaseMap {
  const map = L.map(el, { zoomControl: true });
  const osm = sourceLayer(OSM_TILES);
  const sat = sourceLayer(S2_TILES);
  osm.addTo(map);
  let current: L.TileLayer = osm;
  let mode: BaseLayer = 'osm';
  // Aerial photo: the service covering the map centre (state survey office,
  // basemap.at, swisstopo, PDOK); coarse satellite elsewhere.
  const orthoLayers = new Map<string, L.TileLayer>();
  const pick = (): L.TileLayer => {
    if (mode === 'osm') return osm;
    if (mode === 'sat') return sat;
    const c = map.getCenter();
    const o = orthoFor(c.lat, c.lng);
    if (!o) return sat;
    let l = orthoLayers.get(o.id);
    if (!l) { l = sourceLayer(orthoTiles(o)); orthoLayers.set(o.id, l); }
    return l;
  };
  const apply = () => {
    const next = pick();
    if (next === current) return;
    map.removeLayer(current);
    next.addTo(map);
    current = next;
  };
  map.on('moveend', () => { if (mode === 'ortho') apply(); });
  return {
    map,
    setLayer(v) { mode = v; apply(); },
  };
}

export function handleIcon(cls: string): L.DivIcon {
  return L.divIcon({ className: `locate-handle ${cls}`, iconSize: [18, 18], iconAnchor: [9, 9] });
}

export interface ToolbarEls {
  form: HTMLFormElement;
  query: HTMLInputElement;
  searchBtn: HTMLButtonElement;
  myPosBtn: HTMLElement;
  status: HTMLElement;
  layerRadios: NodeListOf<HTMLInputElement>;
}

/** Wires search / my location / layer switch to a base map. Returns a cleanup
 *  function that removes every listener again. */
export function wireToolbar(base: BaseMap, els: ToolbarEls, lang: Lang, t: (k: string) => string): () => void {
  const { map } = base;
  const onSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    const q = els.query.value.trim();
    if (!q) return;
    const wait = lastSearchAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastSearchAt = Date.now();
    els.searchBtn.disabled = true;
    els.status.textContent = '…';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${lang}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const hits = await res.json() as { lat: string; lon: string; display_name: string }[];
      if (!hits.length) { els.status.textContent = t('locateNotFound'); return; }
      els.status.textContent = hits[0].display_name;
      map.setView([Number(hits[0].lat), Number(hits[0].lon)], 19);
    } catch {
      els.status.textContent = t('locateSearchError');
    } finally {
      els.searchBtn.disabled = false;
    }
  };
  const onMyPosition = () => {
    if (!navigator.geolocation) { els.status.textContent = t('locateGeoError'); return; }
    els.status.textContent = '…';
    navigator.geolocation.getCurrentPosition(
      pos => { els.status.textContent = ''; map.setView([pos.coords.latitude, pos.coords.longitude], 19); },
      () => { els.status.textContent = t('locateGeoError'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  const onLayer = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    base.setLayer(v === 'sat' || v === 'ortho' ? v : 'osm');
  };

  els.form.addEventListener('submit', onSearch);
  els.myPosBtn.addEventListener('click', onMyPosition);
  els.layerRadios.forEach(r => r.addEventListener('change', onLayer));
  return () => {
    els.form.removeEventListener('submit', onSearch);
    els.myPosBtn.removeEventListener('click', onMyPosition);
    els.layerRadios.forEach(r => r.removeEventListener('change', onLayer));
  };
}
