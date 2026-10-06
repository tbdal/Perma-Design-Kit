import { describe, expect, it } from 'vitest';
import { timeZoneAt, wallClock, zonedDate, zoneLabel, zoneOffsetMin } from '../src/lib/plan-time';
import { sunSamples } from '../src/lib/sun-hours';
import { sunPosition } from '../src/lib/sun-position';
import { sourceLabel } from '../src/lib/types';

describe('clock time at the garden', () => {
  it('finds the time zone from the coordinates', async () => {
    expect(await timeZoneAt(52.52, 13.4)).toBe('Europe/Berlin');
    expect(await timeZoneAt(38.72, -9.14)).toBe('Europe/Lisbon');
    expect(await timeZoneAt(37.98, 23.73)).toBe('Europe/Athens');
  });

  it('turns clock time at a place into the instant, summer time included', () => {
    expect(zonedDate(2026, 6, 21, 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-06-21T10:00:00.000Z');
    expect(zonedDate(2026, 1, 15, 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(zonedDate(2026, 6, 21, 12, 0, 'Europe/Lisbon').toISOString()).toBe('2026-06-21T11:00:00.000Z');
    expect(zonedDate(2026, 6, 21, 12, 0, 'Europe/Athens').toISOString()).toBe('2026-06-21T09:00:00.000Z');
    // Spring change in Berlin (29 March 2026, 02:00 → 03:00) and autumn (25 October, 03:00 → 02:00).
    expect(zonedDate(2026, 3, 29, 1, 30, 'Europe/Berlin').toISOString()).toBe('2026-03-29T00:30:00.000Z');
    expect(zonedDate(2026, 3, 29, 3, 30, 'Europe/Berlin').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(zonedDate(2026, 10, 25, 12, 0, 'Europe/Berlin').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('reads the clocks of a zone back', () => {
    const t = new Date('2026-06-21T10:00:00Z');
    expect(wallClock(t, 'Europe/Berlin')).toEqual({ y: 2026, m: 6, d: 21, h: 12, min: 0 });
    expect(wallClock(t, 'Europe/Lisbon')).toEqual({ y: 2026, m: 6, d: 21, h: 11, min: 0 });
    expect(zoneOffsetMin(t, 'Europe/Berlin')).toBe(120);
    expect(zoneLabel(t, 'Europe/Berlin', 'de')).toBe('MESZ');
  });

  it('noon at a garden in Portugal is noon there, not in the browser’s zone', () => {
    const lisbon = sunPosition(zonedDate(2026, 6, 21, 14, 0, 'Europe/Lisbon'), 38.72, -9.14);
    const asBerlin = sunPosition(zonedDate(2026, 6, 21, 14, 0, 'Europe/Berlin'), 38.72, -9.14);
    // 14:00 local in Lisbon (solar noon ~13:35) is just past noon; 14:00 Berlin time is an hour earlier there.
    expect(lisbon.bearingDeg).toBeGreaterThan(180);
    expect(asBerlin.bearingDeg).toBeLessThan(lisbon.bearingDeg);
  });

  it('samples the day from midnight in the garden’s zone', () => {
    const d = new Date(2026, 5, 21);
    const a = sunSamples([d], 38.72, -9.14, 0, 30, 'Europe/Lisbon');
    const total = a.reduce((s, x) => s + x.hours, 0);
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThan(16);
  });
});

describe('source names', () => {
  it('are English in the English interface', () => {
    expect(sourceLabel('manual', 'en')).toBe('Manual');
    expect(sourceLabel('manual', 'de')).toBe('Manuell');
    expect(sourceLabel('sample', 'en')).toBe('Sample');
    expect(sourceLabel('pfaf', 'en')).toBe('PFAF');
  });
});
