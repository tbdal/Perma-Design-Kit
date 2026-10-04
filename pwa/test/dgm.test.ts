import { describe, it, expect } from 'vitest';
import { latLonToUtm, utmToLatLon } from '../src/lib/utm';
import { dgmFor, coverageUrl, toNative, DGM_SOURCES } from '../src/lib/dgm';

describe('UTM', () => {
  it('matches PROJ reference values (pyproj, EPSG:25832/25833) to the centimetre', () => {
    const refs: [number, number, number, number, number][] = [
      [52.520803, 13.40945, 33, 392083.1396, 5820154.8080],
      [51.2277, 6.7735, 32, 344541.7298, 5677501.9478],
      [47.6, 10.5, 32, 612754.3072, 5272933.4849],
    ];
    for (const [lat, lon, z, x, y] of refs) {
      const p = latLonToUtm(lat, lon, z);
      expect(p.x).toBeCloseTo(x, 2);
      expect(p.y).toBeCloseTo(y, 2);
    }
  });

  it('round-trips in zones 32 and 33', () => {
    for (const [lat, lon, z] of [[51.2277, 6.7735, 32], [50.11, 8.68, 32], [52.52, 13.4, 33], [47.6, 10.5, 32]] as const) {
      const p = latLonToUtm(lat, lon, z);
      const back = utmToLatLon(p.x, p.y, z);
      expect(back.lat).toBeCloseTo(lat, 7);
      expect(back.lon).toBeCloseTo(lon, 7);
    }
  });
});

describe('DGM sources', () => {
  it('picks the state model by location', () => {
    expect(dgmFor(51.2277, 6.7735)?.id).toBe('nw');   // Düsseldorf
    expect(dgmFor(52.52, 13.405)?.id).toBe('bb');     // Berlin
    expect(dgmFor(48.7758, 9.1829)?.id).toBe('bw');   // Stuttgart
    expect(dgmFor(50.1109, 8.6821)?.id).toBe('he');   // Frankfurt
    expect(dgmFor(52.3759, 9.732)?.id).toBe('ni');    // Hannover
    expect(dgmFor(52.3676, 4.9041)?.id).toBe('nl');   // Amsterdam
    expect(dgmFor(49.8105, 9.9195)).toBeNull();       // Würzburg (Bayern: no open WCS)
  });

  it('builds GetCoverage URLs with the service axis names', () => {
    const he = DGM_SOURCES.find(d => d.id === 'he')!;
    const u = coverageUrl(he, { minX: 477000, minY: 5552000, maxX: 477100, maxY: 5552100 }, 100, 100);
    expect(u).toContain('SUBSET=E(477000.0,477100.0)&SUBSET=N(5552000.0,5552100.0)');
    expect(u).toContain('EPSG/0/25832');
    expect(u).toContain('SCALESIZE=E(100),N(100)');
    const bw = DGM_SOURCES.find(d => d.id === 'bw')!;
    expect(coverageUrl(bw, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 1, 1)).not.toContain('SCALESIZE');
    const nl = DGM_SOURCES.find(d => d.id === 'nl')!;
    expect(toNative(nl, 52.36, 4.9)).toEqual({ x: 4.9, y: 52.36 });
    expect(coverageUrl(nl, { minX: 4.9, minY: 52.36, maxX: 4.91, maxY: 52.37 }, 10, 10)).toContain('OUTPUTCRS=');
  });
});
