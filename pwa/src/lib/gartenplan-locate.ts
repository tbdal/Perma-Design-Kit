import L from 'leaflet';
import type { GardenPlanGeo, GardenPlanPoint } from './types';
import { bearingFromOrigin, planToLatLon } from './gartenplan-geo';
import { createBaseMap, wireToolbar, handleIcon, DEFAULT_CENTER, type BaseMap } from './gartenplan-leaflet';
import type { Lang } from './i18n/core';

// "Standort festlegen" dialog — only for plans drawn on the plain grid (no
// map): the user drops plan point 0,0 onto their garden and turns the plan
// rectangle by dragging its top-right corner (or with the slider). Plans
// drawn directly on the map (gartenplan-mapdraw.ts) never need this.
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

let base: BaseMap | null = null;
let shapes: L.LayerGroup | null = null;

function $(id: string) { return document.getElementById(id)!; }

export function openLocateDialog(opts: LocateOptions): Promise<LocateResult> {
  const dialog = $('locate-dialog') as HTMLDialogElement;
  const rotRange = $('locate-rot') as HTMLInputElement;
  const rotNum = $('locate-rot-num') as HTMLInputElement;
  const btnApply = $('locate-apply') as HTMLButtonElement;
  const btnRemove = $('locate-remove') as HTMLButtonElement;
  const status = $('locate-status');
  const query = $('locate-query') as HTMLInputElement;

  // Working copy — only written back on "Übernehmen".
  let origin: { lat: number; lon: number } | null = opts.geo ? { lat: opts.geo.lat, lon: opts.geo.lon } : null;
  let rotation = opts.geo?.rotationDeg ?? 0;

  dialog.showModal();
  if (!base) {
    base = createBaseMap($('locate-map'));
    shapes = L.layerGroup().addTo(base.map);
  }
  const m = base.map, sh = shapes!;
  // Set a view right away (Leaflet refuses to add layers without one), then
  // again after the next layout pass, when the dialog has its final size.
  const initialCenter: L.LatLngTuple = origin ? [origin.lat, origin.lon] : DEFAULT_CENTER;
  const initialZoom = origin ? 19 : 6;
  m.setView(initialCenter, initialZoom);
  requestAnimationFrame(() => { m.invalidateSize(); m.setView(initialCenter, initialZoom); });

  const layerRadios = dialog.querySelectorAll<HTMLInputElement>('input[name="locate-layer"]');
  const unwireToolbar = wireToolbar(base, {
    form: $('locate-search-form') as HTMLFormElement,
    query,
    searchBtn: $('locate-search-btn') as HTMLButtonElement,
    myPosBtn: $('locate-mypos'),
    status,
    layerRadios,
  }, opts.lang, opts.t);

  function currentGeo(): GardenPlanGeo | null {
    if (!origin) return null;
    return {
      lat: origin.lat, lon: origin.lon, rotationDeg: rotation,
      basemap: opts.geo?.basemap ?? 'osm', opacity: opts.geo?.opacity ?? 0.6,
    };
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
    const originMarker = L.marker(ll({ xM: 0, yM: 0 }), { draggable: true, icon: handleIcon('locate-handle-origin'), title: '0,0' }).addTo(sh);
    originMarker.on('dragend', () => {
      const p = originMarker.getLatLng();
      origin = { lat: p.lat, lon: p.lng };
      redraw();
    });
    const rotHandle = L.marker(ll({ xM: w, yM: 0 }), { draggable: true, icon: handleIcon('locate-handle-rot'), title: opts.t('locateRotation') }).addTo(sh);
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
  const onRotStep = (e: Event) => setRotation(rotation + Number((e.currentTarget as HTMLElement).dataset.rotStep));

  m.on('click', onMapClick);
  rotRange.addEventListener('input', onRotRange);
  rotNum.addEventListener('change', onRotNum);
  const stepBtns = dialog.querySelectorAll<HTMLElement>('[data-rot-step]');
  stepBtns.forEach(b => b.addEventListener('click', onRotStep));

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
      unwireToolbar();
      btnApply.removeEventListener('click', onApply);
      btnRemove.removeEventListener('click', onRemove);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }, { once: true });
  });
}
