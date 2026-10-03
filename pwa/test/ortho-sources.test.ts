import { describe, it, expect } from 'vitest';
import { orthoFor, ORTHO_SOURCES } from '../src/lib/ortho-sources';
import { tileUrl, sourceForGeo, S2_TILES, OSM_TILES } from '../src/lib/gartenplan-background';

describe('orthophoto sources', () => {
  it('picks the service of the state / country a garden lies in', () => {
    const cases: [number, number, string | null][] = [
      [48.1372, 11.5756, 'by'],  // München
      [48.7758, 9.1829, 'bw'],   // Stuttgart
      [52.52, 13.405, 'bb'],     // Berlin (BB/BE service)
      [50.1109, 8.6821, 'he'],   // Frankfurt
      [51.2277, 6.7735, 'nw'],   // Düsseldorf
      [51.0504, 13.7373, 'sn'],  // Dresden
      [54.3233, 10.1228, 'sh'],  // Kiel
      [49.8105, 9.9195, 'by'],   // Würzburg
      [48.2082, 16.3738, 'at'],  // Wien
      [46.948, 7.4474, 'ch'],    // Bern
      [52.3676, 4.9041, 'nl'],   // Amsterdam
      [53.5511, 9.9937, null],   // Hamburg: left out on purpose
      [48.8566, 2.3522, null],   // Paris
    ];
    for (const [lat, lon, id] of cases) expect(orthoFor(lat, lon)?.id ?? null, `${lat},${lon}`).toBe(id);
  });

  it('has an attribution and coverage for every source', () => {
    for (const s of ORTHO_SOURCES) {
      expect(s.attributionHtml.length).toBeGreaterThan(5);
      expect(s.coverage.length).toBeGreaterThan(0);
      expect(s.url.startsWith('https://')).toBe(true);
    }
  });

  it('fills a web-mercator bbox into WMS templates', () => {
    const u = tileUrl({ url: 'https://x/wms?BBOX={bbox}', maxZoom: 19, attributionHtml: '' }, 1, 1, 0);
    expect(u).toBe('https://x/wms?BBOX=0.00,0.00,20037508.34,20037508.34');
    expect(tileUrl(OSM_TILES, 3, 4, 5)).toBe('https://tile.openstreetmap.org/3/4/5.png');
  });

  it('falls back to the coarse satellite layer outside all coverages', () => {
    const geo = { lat: 48.8566, lon: 2.3522, rotationDeg: 0, basemap: 'ortho' as const, opacity: 1 };
    expect(sourceForGeo(geo)).toBe(S2_TILES);
    expect(sourceForGeo({ ...geo, lat: 48.1372, lon: 11.5756 })?.url).toContain('geoservices.bayern.de');
    expect(sourceForGeo({ ...geo, basemap: 'none' })).toBeNull();
  });
});
