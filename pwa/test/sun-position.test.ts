import { describe, it, expect } from 'vitest';
import { sunPositionRaw, sunPosition, sunDirectionEnu, compassLabel } from '../src/lib/sun-position';

describe('sun position', () => {
  it('matches the SunCalc reference value', () => {
    // From SunCalc's own test suite.
    const p = sunPositionRaw(new Date('2013-03-05UTC'), 50.5, 30.5);
    expect(p.azimuth).toBeCloseTo(-2.5003175907168385, 9);
    expect(p.altitude).toBeCloseTo(-0.7000406838781611, 9);
  });

  it('puts the noon sun roughly south and high in a German summer', () => {
    // Munich, 21 June, 11:15 UTC ≈ local solar noon
    const p = sunPosition(new Date('2026-06-21T11:15:00Z'), 48.14, 11.58);
    expect(p.bearingDeg).toBeGreaterThan(170);
    expect(p.bearingDeg).toBeLessThan(190);
    expect(p.altitudeDeg).toBeGreaterThan(63);
    expect(p.altitudeDeg).toBeLessThan(66);
  });

  it('is below the horizon at midnight', () => {
    expect(sunPosition(new Date('2026-06-21T23:00:00Z'), 48.14, 11.58).altitudeDeg).toBeLessThan(0);
  });

  it('converts to an east/north/up vector', () => {
    const v = sunDirectionEnu(90, 0);
    expect(v.e).toBeCloseTo(1, 9); expect(v.n).toBeCloseTo(0, 9); expect(v.up).toBeCloseTo(0, 9);
    expect(sunDirectionEnu(180, 90).up).toBeCloseTo(1, 9);
  });

  it('labels compass directions', () => {
    expect(compassLabel(135, 'de')).toBe('SO');
    expect(compassLabel(135, 'en')).toBe('SE');
    expect(compassLabel(359, 'de')).toBe('N');
  });
});
