import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_TILES, S2_TILES } from './gartenplan-background';
import type { Lang } from './i18n/core';

// Shared Leaflet plumbing for the garden plan: base map with the OSM / coarse
// satellite layers, Nominatim address search and "my location". Used by the
// draw-on-map step (gartenplan-mapdraw.ts) and the location dialog for plans
// drawn on the plain grid (gartenplan-locate.ts). Only ever reached through
// import(), so Leaflet stays out of the normal page load.

export const DEFAULT_CENTER: L.LatLngTuple = [51.2, 10.4];  // Germany, zoomed out
const NOMINATIM_MIN_INTERVAL_MS = 1100;                     // Nominatim policy: max 1 request/s
let lastSearchAt = 0;

export interface BaseMap {
  map: L.Map;
  setLayer(v: 'osm' | 'sat'): void;
}

export function createBaseMap(el: HTMLElement): BaseMap {
  const map = L.map(el, { zoomControl: true });
  const osm = L.tileLayer(OSM_TILES.url, { maxZoom: 21, maxNativeZoom: OSM_TILES.maxZoom, attribution: OSM_TILES.attributionHtml });
  const sat = L.tileLayer(S2_TILES.url, { maxZoom: 21, maxNativeZoom: S2_TILES.maxZoom, attribution: S2_TILES.attributionHtml });
  osm.addTo(map);
  return {
    map,
    setLayer(v) {
      if (v === 'sat') { map.removeLayer(osm); sat.addTo(map); }
      else { map.removeLayer(sat); osm.addTo(map); }
    },
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
  const onLayer = (e: Event) => base.setLayer((e.currentTarget as HTMLInputElement).value === 'sat' ? 'sat' : 'osm');

  els.form.addEventListener('submit', onSearch);
  els.myPosBtn.addEventListener('click', onMyPosition);
  els.layerRadios.forEach(r => r.addEventListener('change', onLayer));
  return () => {
    els.form.removeEventListener('submit', onSearch);
    els.myPosBtn.removeEventListener('click', onMyPosition);
    els.layerRadios.forEach(r => r.removeEventListener('change', onLayer));
  };
}
