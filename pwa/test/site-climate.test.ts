import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { usdaZone, zoneLabel, summarizeClimate, plantZoneRange, notHardy, blossomFrostRisk, climateRequestUrl, type SiteClimate } from '../src/lib/site-climate';

describe('usdaZone', () => {
  it('maps the mean yearly minimum to USDA zones', () => {
    expect(zoneLabel(usdaZone(-12.5))).toBe('7b');   // −12.2…−15 °C is 7a/7b border
    expect(zoneLabel(usdaZone(-15))).toBe('7b');   // 5 °F: lower edge of 7b
    expect(zoneLabel(usdaZone(-16))).toBe('7a');
    expect(zoneLabel(usdaZone(-20))).toBe('6b');   // −4 °F
    expect(zoneLabel(usdaZone(-22))).toBe('6a');
    expect(zoneLabel(usdaZone(-6))).toBe('9a');    // 21 °F
    expect(zoneLabel(usdaZone(-9))).toBe('8b');
    expect(zoneLabel(usdaZone(-30))).toBe('4b');
  });
});

function synthDaily(years: number, minByYear: number, lastFrost: string, firstFrost: string) {
  const time: string[] = [], tmin: number[] = [], pr: number[] = [], wd: number[] = [];
  for (let y = 2000; y < 2000 + years; y++) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const md = iso.slice(5);
      time.push(iso);
      tmin.push(md === '01-15' ? minByYear : md <= lastFrost || md >= firstFrost ? -1 : 8);
      pr.push(2);
      wd.push(md < '03-01' ? 90 : 250);
    }
  }
  return { time, temperature_2m_min: tmin, precipitation_sum: pr, wind_direction_10m_dominant: wd };
}

describe('summarizeClimate', () => {
  const c = summarizeClimate(synthDaily(4, -14, '04-20', '10-25'), 50.9, 7, 45);
  it('finds zone, frost dates, rain and the main wind', () => {
    expect(c.meanAnnualMinC).toBe(-14);
    expect(zoneLabel(c.zone)).toBe('7b');
    expect(c.lastFrostDoy).toBeGreaterThanOrEqual(110);   // ~20 Apr
    expect(c.lastFrostDoy).toBeLessThanOrEqual(111);
    expect(c.firstFrostDoy).toBeGreaterThanOrEqual(298);
    expect(c.frostFreeDays).toBeGreaterThan(180);
    expect(Math.round(c.precipMm)).toBeGreaterThanOrEqual(730);
    expect(c.windFromDeg).toBe(247.5);                      // 250° → WSW sector
    expect(c.windRose.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });
});

describe('plants vs. site', () => {
  const site = { zone: 6.5, lastFrostDoy: 115 } as SiteClimate;
  it('reads PFAF zone ranges', () => {
    expect(plantZoneRange('5-10')).toEqual([5, 10]);
    expect(plantZoneRange('7')).toEqual([7, 7]);
    expect(plantZoneRange('')).toBeNull();
  });
  it('flags plants that are not hardy', () => {
    expect(notHardy({ climateZone: '8-11' }, site)).toBe(true);
    expect(notHardy({ climateZone: '6-9' }, site)).toBe(false);
    expect(notHardy({ climateZone: '' }, site)).toBe(false);
  });
  it('flags early blossom before the last frost', () => {
    const months = (m: number) => Array.from({ length: 12 }, (_, i) => i === m);
    expect(blossomFrostRisk({ flowerMonths: months(2) }, site)).toBe(true);   // March
    expect(blossomFrostRisk({ flowerMonths: months(4) }, site)).toBe(false);  // May
    expect(blossomFrostRisk({ flowerMonths: months(7) }, site)).toBe(false);
  });
});

describe('climateRequestUrl', () => {
  it('rounds the location to 0.1°', () => {
    const u = climateRequestUrl(50.93761, 6.96025);
    expect(u).toContain('latitude=50.9&longitude=7.0');
    expect(u.startsWith('/geo/climate?')).toBe(true);
  });
});

const sample = '/root/.claude/jobs/19fde0c6/tmp/om.json';
describe.skipIf(!existsSync(sample))('real Open-Meteo sample (Köln/Bonn)', () => {
  it('gives a plausible Rhineland climate', () => {
    const d = JSON.parse(readFileSync(sample, 'utf8'));
    const c = summarizeClimate(d.daily, 50.9, 7, d.elevation);
    console.log(zoneLabel(c.zone), c.meanAnnualMinC.toFixed(1), c.lastFrostDoy, c.firstFrostDoy, Math.round(c.precipMm), c.windFromDeg);
    expect(c.zone).toBeGreaterThanOrEqual(7);
    expect(c.zone).toBeLessThanOrEqual(8.5);
    expect(c.precipMm).toBeGreaterThan(550);
    expect(c.precipMm).toBeLessThan(1100);
  });
});
