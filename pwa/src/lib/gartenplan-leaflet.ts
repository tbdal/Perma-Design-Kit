import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OSM_TILES, S2_TILES, orthoTiles, tileUrl, fallbackTileUrl, FALLBACK_ATTRIBUTION, type TileSource } from './gartenplan-background';
import { orthoFor } from './ortho-sources';
import type { Lang } from './i18n/core';
import { boxesFor, endpoint, isUsable, parseRings, MIN_ZOOM, type SurrKind } from './map-surroundings';
import { cachedFetch, DAY_MS, geoRefreshing } from './geo-cache';

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
  myPosBtn: HTMLButtonElement;
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
    els.status.textContent = t('locateGeoWait');
    els.myPosBtn.disabled = true;
    const done = () => { els.myPosBtn.disabled = false; };
    const fail = (err: GeolocationPositionError) => {
      done();
      // Permission refused / blocked is a different story from "no fix": say which.
      els.status.textContent = err.code === err.PERMISSION_DENIED ? t('locateGeoDenied') : err.code === err.TIMEOUT ? t('locateGeoTimeout') : t('locateGeoError');
    };
    const ok = (pos: GeolocationPosition) => { done(); els.status.textContent = ''; map.setView([pos.coords.latitude, pos.coords.longitude], 19); };
    // First the quick network/Wi-Fi position (works on computers without GPS, a 10 s
    // high-accuracy request mostly timed out there), then GPS as the second try.
    navigator.geolocation.getCurrentPosition(
      ok,
      err => {
        if (err.code === err.PERMISSION_DENIED) { fail(err); return; }
        navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60_000 },
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


export interface SurroundingsEls { buildings: HTMLInputElement; forest: HTMLInputElement; hint: HTMLElement }
const SURR_PREF = 'pdk-map-surr';
const SURR_STYLE: Record<SurrKind, L.PolylineOptions> = {
  forest: { color: '#166534', weight: 1, fillColor: '#15803d', fillOpacity: 0.32, interactive: false },
  buildings: { color: '#44403c', weight: 1, fillColor: '#78716c', fillOpacity: 0.6, interactive: false },
};

/**
 * Buildings and forests of the visible map part (OpenStreetMap through our cache), drawn
 * under/over the base map — independent of any plan, so the surroundings can be judged before
 * one exists. Loaded in fixed boxes when zoomed in far enough; both switchable, on by default.
 */
export function attachSurroundings(map: L.Map, els: SurroundingsEls, t: (k: string) => string): () => void {
  const pref = (() => { try { return { buildings: true, forest: true, ...JSON.parse(localStorage.getItem(SURR_PREF) || '{}') } as Record<SurrKind, boolean>; } catch { return { buildings: true, forest: true } as Record<SurrKind, boolean>; } })();
  els.buildings.checked = !!pref.buildings;
  els.forest.checked = !!pref.forest;
  // forest below buildings, both above the base map
  for (const [name, z] of [['surrForest', 410], ['surrBuildings', 415]] as const) { if (!map.getPane(name)) map.createPane(name); map.getPane(name)!.style.zIndex = String(z); map.getPane(name)!.style.pointerEvents = 'none'; }
  const renderers: Record<SurrKind, L.Canvas> = { forest: L.canvas({ pane: 'surrForest', padding: 0.3 }), buildings: L.canvas({ pane: 'surrBuildings', padding: 0.3 }) };
  const groups = new Map<string, L.LayerGroup>();   // "kind|box" → drawn polygons (kept while in the cache)
  const pending = new Set<string>();
  let failed = 0;
  let credited = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let gone = false;

  const wanted = (): Record<SurrKind, boolean> => ({ buildings: els.buildings.checked, forest: els.forest.checked });
  function setHint() {
    if (!wanted().buildings && !wanted().forest) { els.hint.textContent = ''; return; }
    if (map.getZoom() < MIN_ZOOM) els.hint.textContent = t('surrZoomIn');
    else if (!boxesFor(toBounds())) els.hint.textContent = t('surrZoomIn');
    else if (pending.size) els.hint.textContent = t('surrLoading');
    else if (failed) els.hint.textContent = t('surrFailed');
    else els.hint.textContent = '';
  }
  const toBounds = () => { const b = map.getBounds(); return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }; };

  async function load(kind: SurrKind, box: string) {
    const key = `${kind}|${box}`;
    if (groups.has(key) || pending.has(key)) return;
    pending.add(key);
    setHint();
    try {
      // In the browser for 30 days (the server keeps it as long); a cached Overpass "remark" (overload) is refreshed once.
      const res = await cachedFetch(`surr:${key}`, 30 * DAY_MS, async () => {
        for (const refresh of geoRefreshing() ? [true] : [false, true]) {
          const r = await fetch(`${endpoint(kind)}?bbox=${box}${refresh ? '&refresh=1' : ''}`);
          if (!r.ok) throw new Error(String(r.status));
          const text = await r.text();
          if (isUsable(JSON.parse(text))) return new Response(text, { headers: { 'Content-Type': 'application/json' } });
        }
        throw new Error('overpass');
      });
      const json: unknown = await res.json();
      const g = L.layerGroup();
      for (const rings of parseRings(json)) L.polygon(rings.map(r => r.map(p => [p.lat, p.lon] as L.LatLngTuple)), { ...SURR_STYLE[kind], renderer: renderers[kind] }).addTo(g);
      groups.set(key, g);
      failed = 0;
      if (groups.size > 80) { const old = groups.keys().next().value!; map.removeLayer(groups.get(old)!); groups.delete(old); }
    } catch { failed++; pending.delete(key); setHint(); return; } // no refresh(): it would retry the failed box at once, in a loop
    pending.delete(key);
    if (!gone) refresh();
  }

  function refresh() {
    if (gone) return;
    const want = wanted();
    const boxes = map.getZoom() >= MIN_ZOOM ? boxesFor(toBounds()) : null;
    const visible = new Set<string>();
    if (boxes) for (const kind of ['forest', 'buildings'] as const) if (want[kind]) for (const b of boxes) visible.add(`${kind}|${b}`);
    for (const [key, g] of [...groups]) { // a copy: re-inserting a key while iterating the Map itself never ends
      if (visible.has(key)) { if (!map.hasLayer(g)) g.addTo(map); groups.delete(key); groups.set(key, g); } // in view = newest, evicted last else if (map.hasLayer(g)) map.removeLayer(g);
    }
    for (const key of visible) { const [kind, box] = key.split('|'); void load(kind as SurrKind, box); }
    if (boxes && visible.size && !credited) { credited = true; map.attributionControl?.addAttribution('Gebäude, Wald: © OpenStreetMap-Mitwirkende'); }
    setHint();
  }
  const refreshSoon = () => { clearTimeout(timer); timer = setTimeout(refresh, 350); };
  const onToggle = () => {
    try { localStorage.setItem(SURR_PREF, JSON.stringify(wanted())); } catch { /* private window */ }
    refresh();
  };
  map.on('moveend zoomend', refreshSoon);
  els.buildings.addEventListener('change', onToggle);
  els.forest.addEventListener('change', onToggle);
  refreshSoon();
  return () => {
    gone = true;
    clearTimeout(timer);
    map.off('moveend zoomend', refreshSoon);
    els.buildings.removeEventListener('change', onToggle);
    els.forest.removeEventListener('change', onToggle);
    for (const g of groups.values()) map.removeLayer(g);
    for (const r of Object.values(renderers)) map.removeLayer(r); // the map is reused: each open would add two more canvases
    els.hint.textContent = '';
  };
}
