import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GardenPlanGeo, GardenPlanPoint } from './types';
import { bearingFromOrigin, planToLatLon } from './gartenplan-geo';
import { OSM_TILES, S2_TILES } from './gartenplan-background';
import type { Lang } from './i18n/core';

// "Standort & Ausrichtung" dialog: a Leaflet map where the user drops plan
// point 0,0 onto their garden and turns the plan rectangle by dragging its
// top-right corner (or with the slider). Loaded via import() only when the
// dialog is first opened, so Leaflet never weighs on the normal page load.
// Markup lives in gartenplan.astro (#locate-dialog); this module only wires it.

export type LocateResult = { action: 'apply'; geo: GardenPlanGeo } | { action: 'remove' } | null;

export interface LocateOptions {
  widthM: number;
  heightM: number;
  boundary: GardenPlanPoint[];
  geo: GardenPlanGeo | null;
  lang: Lang;
  t: (key: string) => string;
}

const DEFAULT_CENTER: L.LatLngTuple = [51.2, 10.4];  // Germany, zoomed out
const NOMINATIM_MIN_INTERVAL_MS = 1100;              // Nominatim policy: max 1 request/s

let map: L.Map | null = null;
let layers: { osm: L.TileLayer; sat: L.TileLayer } | null = null;
let shapes: L.LayerGroup | null = null;
let lastSearchAt = 0;

function $(id: string) { return document.getElementById(id)!; }

export function openLocateDialog(opts: LocateOptions): Promise<LocateResult> {
  const dialog = $('locate-dialog') as HTMLDialogElement;
  const mapEl = $('locate-map');
  const rotRange = $('locate-rot') as HTMLInputElement;
  const rotNum = $('locate-rot-num') as HTMLInputElement;
  const status = $('locate-status');
  const form = $('locate-search-form') as HTMLFormElement;
  const query = $('locate-query') as HTMLInputElement;
  const searchBtn = $('locate-search-btn') as HTMLButtonElement;
  const btnApply = $('locate-apply') as HTMLButtonElement;
  const btnRemove = $('locate-remove') as HTMLButtonElement;

  // Working copy — only written back on "Übernehmen".
  let origin: { lat: number; lon: number } | null = opts.geo ? { lat: opts.geo.lat, lon: opts.geo.lon } : null;
  let rotation = opts.geo?.rotationDeg ?? 0;

  dialog.showModal();

  if (!map) {
    map = L.map(mapEl, { zoomControl: true });
    layers = {
      osm: L.tileLayer(OSM_TILES.url, { maxZoom: 20, maxNativeZoom: OSM_TILES.maxZoom, attribution: OSM_TILES.attributionHtml }),
      sat: L.tileLayer(S2_TILES.url, { maxZoom: 20, maxNativeZoom: S2_TILES.maxZoom, attribution: S2_TILES.attributionHtml }),
    };
    layers.osm.addTo(map);
    shapes = L.layerGroup().addTo(map);
  }
  const m = map, ly = layers!, sh = shapes!;
  // Set a view right away (Leaflet refuses to add layers without one), then
  // again after the next layout pass, when the dialog has its final size.
  const initialCenter: L.LatLngTuple = origin ? [origin.lat, origin.lon] : DEFAULT_CENTER;
  const initialZoom = origin ? 19 : 6;
  m.setView(initialCenter, initialZoom);
  requestAnimationFrame(() => { m.invalidateSize(); m.setView(initialCenter, initialZoom); });

  const layerRadios = dialog.querySelectorAll<HTMLInputElement>('input[name="locate-layer"]');
  layerRadios.forEach(r => { r.checked = r.value === (m.hasLayer(ly.sat) ? 'sat' : 'osm'); });

  function currentGeo(): GardenPlanGeo | null {
    if (!origin) return null;
    return {
      lat: origin.lat, lon: origin.lon, rotationDeg: rotation,
      basemap: opts.geo?.basemap ?? 'osm', opacity: opts.geo?.opacity ?? 0.6,
    };
  }

  function divIcon(cls: string) {
    return L.divIcon({ className: cls, iconSize: [18, 18], iconAnchor: [9, 9] });
  }

  function redraw() {
    sh.clearLayers();
    const geo = currentGeo();
    btnApply.disabled = !geo;
    btnRemove.hidden = !opts.geo;
    rotRange.value = String(Math.round(rotation));
    rotNum.value = String(Math.round(rotation));
    if (!geo) return;
    const ll = (p: GardenPlanPoint) => { const q = planToLatLon(p, geo); return L.latLng(q.lat, q.lon); };
    const w = opts.widthM, h = opts.heightM;
    L.polygon([ll({ xM: 0, yM: 0 }), ll({ xM: w, yM: 0 }), ll({ xM: w, yM: h }), ll({ xM: 0, yM: h })],
      { color: '#15803d', weight: 2, fillOpacity: 0.1, interactive: false }).addTo(sh);
    // Thick top edge so "plan up" is recognisable at any rotation.
    L.polyline([ll({ xM: 0, yM: 0 }), ll({ xM: w, yM: 0 })], { color: '#15803d', weight: 5, interactive: false }).addTo(sh);
    if (opts.boundary.length >= 3) {
      L.polygon(opts.boundary.map(ll), { color: '#facc15', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(sh);
    }
    const originMarker = L.marker(ll({ xM: 0, yM: 0 }), { draggable: true, icon: divIcon('locate-handle locate-handle-origin'), title: '0,0' }).addTo(sh);
    originMarker.on('dragend', () => {
      const p = originMarker.getLatLng();
      origin = { lat: p.lat, lon: p.lng };
      redraw();
    });
    const rotHandle = L.marker(ll({ xM: w, yM: 0 }), { draggable: true, icon: divIcon('locate-handle locate-handle-rot'), title: opts.t('locateRotation') }).addTo(sh);
    // The top-right corner lies on the plan's +x axis, whose bearing is θ + 90°.
    rotHandle.on('drag', () => {
      const p = rotHandle.getLatLng();
      rotation = (bearingFromOrigin(p.lat, p.lng, geo) - 90 + 360) % 360;
      rotRange.value = rotNum.value = String(Math.round(rotation));
    });
    rotHandle.on('dragend', redraw);
  }

  function setRotation(v: number) {
    if (!Number.isFinite(v)) return;
    rotation = ((v % 360) + 360) % 360;
    redraw();
  }

  const onMapClick = (e: L.LeafletMouseEvent) => {
    origin = { lat: e.latlng.lat, lon: e.latlng.lng };
    if (m.getZoom() < 17) m.setView(e.latlng, 19);
    redraw();
  };
  const onRotRange = () => setRotation(Number(rotRange.value));
  const onRotNum = () => setRotation(Number(rotNum.value));
  const onRotStep = (e: Event) => {
    const step = Number((e.currentTarget as HTMLElement).dataset.rotStep);
    setRotation(rotation + step);
  };
  const onLayer = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v === 'sat') { m.removeLayer(ly.osm); ly.sat.addTo(m); }
    else { m.removeLayer(ly.sat); ly.osm.addTo(m); }
  };
  const onSearch = async (e: SubmitEvent) => {
    e.preventDefault();
    const q = query.value.trim();
    if (!q) return;
    const wait = lastSearchAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastSearchAt = Date.now();
    searchBtn.disabled = true;
    status.textContent = '…';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=${opts.lang}&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const hits = await res.json() as { lat: string; lon: string; display_name: string }[];
      if (!hits.length) { status.textContent = opts.t('locateNotFound'); return; }
      status.textContent = hits[0].display_name;
      m.setView([Number(hits[0].lat), Number(hits[0].lon)], 18);
    } catch {
      status.textContent = opts.t('locateSearchError');
    } finally {
      searchBtn.disabled = false;
    }
  };
  const onMyPosition = () => {
    if (!navigator.geolocation) { status.textContent = opts.t('locateGeoError'); return; }
    status.textContent = '…';
    navigator.geolocation.getCurrentPosition(
      pos => { status.textContent = ''; m.setView([pos.coords.latitude, pos.coords.longitude], 19); },
      () => { status.textContent = opts.t('locateGeoError'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  m.on('click', onMapClick);
  rotRange.addEventListener('input', onRotRange);
  rotNum.addEventListener('change', onRotNum);
  const stepBtns = dialog.querySelectorAll<HTMLElement>('[data-rot-step]');
  stepBtns.forEach(b => b.addEventListener('click', onRotStep));
  layerRadios.forEach(r => r.addEventListener('change', onLayer));
  form.addEventListener('submit', onSearch);
  const btnMyPos = $('locate-mypos');
  btnMyPos.addEventListener('click', onMyPosition);

  status.textContent = '';
  query.value = '';
  redraw();

  return new Promise<LocateResult>(resolve => {
    let result: LocateResult = null;
    const onApply = () => { const g = currentGeo(); if (g) { result = { action: 'apply', geo: g }; dialog.close(); } };
    const onRemove = () => { result = { action: 'remove' }; dialog.close(); };
    const onCancel = () => dialog.close();
    const cancelBtn = $('locate-cancel');
    btnApply.addEventListener('click', onApply);
    btnRemove.addEventListener('click', onRemove);
    cancelBtn.addEventListener('click', onCancel);
    dialog.addEventListener('close', () => {
      m.off('click', onMapClick);
      rotRange.removeEventListener('input', onRotRange);
      rotNum.removeEventListener('change', onRotNum);
      stepBtns.forEach(b => b.removeEventListener('click', onRotStep));
      layerRadios.forEach(r => r.removeEventListener('change', onLayer));
      form.removeEventListener('submit', onSearch);
      btnMyPos.removeEventListener('click', onMyPosition);
      btnApply.removeEventListener('click', onApply);
      btnRemove.removeEventListener('click', onRemove);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }, { once: true });
  });
}
