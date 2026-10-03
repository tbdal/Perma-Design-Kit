import L from 'leaflet';
import { createBaseMap, wireToolbar, handleIcon, DEFAULT_CENTER, type BaseMap } from './gartenplan-leaflet';
import type { Lang } from './i18n/core';

// "Fläche auf der Karte zeichnen": the boundary is clicked directly onto a
// Leaflet map, so the plan is located and north-up from the start —
// gartenplan-geo.ts' planFromLatLngPolygon() turns the clicked corners into
// plan size, anchor and boundary. Vertices stay draggable for fine-tuning;
// clicking the first vertex again closes the shape.

export interface LatLon { lat: number; lon: number; }

export interface MapDrawer {
  points(): LatLon[];
  undo(): void;
  clear(): void;
  /** Re-measure after the container became visible or changed size. */
  refresh(): void;
  destroy(): void;
}

export interface MapDrawerOptions {
  center: LatLon | null;
  lang: Lang;
  t: (key: string) => string;
  onChange(count: number): void;
  onClose(): void;   // first vertex clicked again with ≥ 3 points
}

function $(id: string) { return document.getElementById(id)!; }

export function createMapDrawer(el: HTMLElement, opts: MapDrawerOptions): MapDrawer {
  const base: BaseMap = createBaseMap(el);
  const m = base.map;
  m.setView(opts.center ? [opts.center.lat, opts.center.lon] : DEFAULT_CENTER, opts.center ? 19 : 6);
  const unwire = wireToolbar(base, {
    form: $('mapdraw-search-form') as HTMLFormElement,
    query: $('mapdraw-query') as HTMLInputElement,
    searchBtn: $('mapdraw-search-btn') as HTMLButtonElement,
    myPosBtn: $('mapdraw-mypos'),
    status: $('mapdraw-status'),
    layerRadios: document.querySelectorAll<HTMLInputElement>('input[name="mapdraw-layer"]'),
  }, opts.lang, opts.t);

  let pts: L.LatLng[] = [];
  const shapes = L.layerGroup().addTo(m);

  function redraw() {
    shapes.clearLayers();
    if (pts.length >= 3) L.polygon(pts, { color: '#15803d', weight: 3, fillOpacity: 0.15, interactive: false }).addTo(shapes);
    else if (pts.length === 2) L.polyline(pts, { color: '#15803d', weight: 3, interactive: false }).addTo(shapes);
    pts.forEach((p, i) => {
      const mk = L.marker(p, { draggable: true, icon: handleIcon(i === 0 ? 'locate-handle-rot' : 'locate-handle-origin') }).addTo(shapes);
      mk.on('drag', () => { pts[i] = mk.getLatLng(); });
      mk.on('dragend', redraw);
      if (i === 0) mk.on('click', () => { if (pts.length >= 3) opts.onClose(); });
    });
    opts.onChange(pts.length);
  }

  const onClick = (e: L.LeafletMouseEvent) => { pts.push(e.latlng); redraw(); };
  m.on('click', onClick);

  return {
    points: () => pts.map(p => ({ lat: p.lat, lon: p.lng })),
    undo() { pts.pop(); redraw(); },
    clear() { pts = []; redraw(); },
    refresh() { m.invalidateSize(); },
    destroy() { m.off('click', onClick); unwire(); m.remove(); },
  };
}
