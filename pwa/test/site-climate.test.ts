import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { usdaZone, zoneLabel, summarizeClimate, plantZoneRange, notHardy, blossomFrostRisk, climateRequestUrl, fetchSiteClimate, allowDirect, revokeDirect, directAllowed, directUrl, ClimateLimitError, summarizeFuture, futureOutlook, modelDelta, scaleFactor, koeppen, normalizeScenario, LAST_DATA_YEAR, climateCheck, type SiteClimate, type ClimateScenario } from '../src/lib/site-climate';
import { explorerOutHtml } from '../src/lib/climate-explorer';

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

describe('direct from the browser after consent (#610)', () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  afterEach(() => { revokeDirect(); vi.unstubAllGlobals(); });
  it('maps our proxy URLs to Open-Meteo with the same query', () => {
    expect(directUrl('/geo/climate?latitude=50.9&longitude=7.0')).toBe('https://archive-api.open-meteo.com/v1/archive?latitude=50.9&longitude=7.0');
    expect(directUrl('/geo/climate-future?a=1')).toBe('https://climate-api.open-meteo.com/v1/climate?a=1');
    expect(() => directUrl('/geo/overpass?x')).toThrow();
  });
  it('asks Open-Meteo itself only when our server hits the limit and the visitor agreed', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return url.startsWith('/geo/') ? new Response('{"error":true}', { status: 429 })
        : new Response(JSON.stringify({ elevation: 50, daily: synthDaily(2, -14, '04-20', '10-25') }), { status: 200 });
    });
    expect(directAllowed()).toBe(false);
    await expect(fetchSiteClimate(10.1, 20.1)).rejects.toBeInstanceOf(ClimateLimitError);
    expect(asked).toHaveLength(1);
    allowDirect(false); // this time only: nothing kept on the device
    expect(localStorage.getItem('pdk-climate-direct')).toBeNull();
    const c = await fetchSiteClimate(10.1, 20.1);
    expect(zoneLabel(c.zone)).toBe('7b');
    expect(asked.slice(1)).toEqual([expect.stringMatching(/^\/geo\/climate\?/), expect.stringMatching(/^https:\/\/archive-api\.open-meteo\.com\/v1\/archive\?latitude=10\.1&longitude=20\.1/)]);
    allowDirect(true);
    expect(localStorage.getItem('pdk-climate-direct')).toBe('1');
    revokeDirect();
    expect(directAllowed()).toBe(false);
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

describe('future climate (#530)', () => {
  // Two models, every day the same; model A +3 K and 30 % less rain from 2040 on, model B +5 K.
  const time: string[] = [];
  for (let y = 1994; y <= 2050; y++) for (let d = 0; d < 365; d++) time.push(new Date(Date.UTC(y, 0, 1 + d)).toISOString().slice(0, 10));
  const fut = (iso: string) => Number(iso.slice(0, 4)) >= 2040;
  const daily = {
    time,
    temperature_2m_min_CMCC_CM2_VHR4: time.map(s => (fut(s) ? -12 : -15)),
    temperature_2m_max_CMCC_CM2_VHR4: time.map(s => (fut(s) ? 31 : 20)),
    precipitation_sum_CMCC_CM2_VHR4: time.map(s => (fut(s) ? 0.7 : 1)),
    temperature_2m_min_FGOALS_f3_H: time.map(s => (fut(s) ? -10 : -15)),
    temperature_2m_max_FGOALS_f3_H: time.map(() => 20),
    precipitation_sum_FGOALS_f3_H: time.map(() => 1),
  };
  const f = summarizeFuture(daily);
  const site = { meanAnnualMinC: -16, zone: usdaZone(-16) } as SiteClimate;   // 7a today
  const s2045: ClimateScenario = { year: 2045, ssp: 'SSP2-4.5', model: 'all' };
  const o = futureOutlook(site, f, s2045);
  const plant = (climateZone: string, water: 'dry' | 'wet' = 'dry') => ({ climateZone, waterDry: water === 'dry', waterMid: false, waterWet: water === 'wet' });

  it('keeps yearly rows per model and takes each model’s change against its own 1994–2023', () => {
    expect(f.from).toBe(1994);
    expect(f.models.CMCC_CM2_VHR4[0]!.slice(0, 3)).toEqual([-15, 0, 365]);         // lowest, hot days, frost days
    expect(modelDelta(f, 'CMCC_CM2_VHR4', 'minT', 2045, 'SSP2-4.5')).toBeCloseTo(3, 5);
    expect(modelDelta(f, 'CMCC_CM2_VHR4', 'hot', 2045, 'SSP2-4.5')).toBeCloseTo(365, 5);
    expect(modelDelta(f, 'CMCC_CM2_VHR4', 'summerRain', 2045, 'SSP2-4.5')).toBeCloseTo(-30, 5);
    expect(o.zones.map(zoneLabel)).toEqual(['7b', '8a']);  // −13 °C, −11 °C
    expect(o.summerRainChange).toBeCloseTo(-0.15, 2);       // median of −30 % and 0 %
    expect(futureOutlook(site, f, { ...s2045, model: 'FGOALS_f3_H' }).zones.map(zoneLabel)).toEqual(['8a']);
  });
  it('projects past the model data with the scenario’s global warming', () => {
    expect(scaleFactor('SSP5-8.5', LAST_DATA_YEAR)).toBeCloseTo(1, 5);
    expect(scaleFactor('SSP1-2.6', 2090)).toBeLessThan(scaleFactor('SSP2-4.5', 2090));
    expect(scaleFactor('SSP2-4.5', 2090)).toBeLessThan(scaleFactor('SSP5-8.5', 2090));
    const d = modelDelta(f, 'CMCC_CM2_VHR4', 'minT', 2090, 'SSP5-8.5')!;
    expect(d).toBeCloseTo(3 * scaleFactor('SSP5-8.5', 2090), 5);
    expect(futureOutlook(site, f, { year: 2090, ssp: 'SSP5-8.5', model: 'all' }).projected).toBe(true);
  });
  it('rates plants: fit, under pressure (too warm in some models, or wet-soil plant and drier), becomes possible, not hardy', () => {
    expect(climateCheck(plant('5-9'), site, o)?.status).toBe('fit');
    expect(climateCheck(plant('4-7'), site, o)).toMatchObject({ status: 'underPressure', tooWarm: 1, models: 2 });
    expect(climateCheck(plant('6'), site, o)?.status).toBe('fit');              // single number: coldest zone only
    expect(climateCheck(plant('8-10'), site, o)).toMatchObject({ status: 'becomesPossible', fits: 1 });  // 8a in one of two models
    expect(climateCheck(plant('9-10'), site, o)?.status).toBe('notHardy');
    expect(climateCheck(plant('5-9', 'wet'), site, { ...o, summerRainChange: -0.2 })).toMatchObject({ status: 'underPressure', drier: true });
    expect(climateCheck(plant(''), site, o)).toBeNull();
  });
  it('classifies Köppen-Geiger and cleans a stored scenario', () => {
    expect(koeppen([0, 1, 4, 8, 13, 16, 18, 18, 14, 9, 4, 1], Array(12).fill(60))).toBe('Cfb');
    expect(koeppen([10, 11, 13, 15, 19, 23, 26, 26, 22, 18, 14, 11], [80, 70, 60, 50, 30, 10, 5, 10, 30, 70, 90, 90])).toBe('Csa');
    expect(normalizeScenario({ year: 2060, ssp: 'SSP3-7.0', model: 'all' })).toEqual({ year: 2060, ssp: 'SSP3-7.0', model: 'all' });
    expect(normalizeScenario({ year: 2200, ssp: 'SSP3-7.0', model: 'all' })).toBeNull();
    expect(normalizeScenario({ year: 2060, ssp: 'RCP8.5', model: 'all' })).toBeNull();
    expect(normalizeScenario({ year: 2060, ssp: 'SSP3-7.0', model: 'x' })).toBeNull();
  });
  it('draws the explorer for a choice (course, figures, ruler with the plan’s plants)', () => {
    const r = explorerOutHtml({ ...site, years: [1994, 2023] } as SiteClimate, f, s2045, 'tann', 'de', [{ id: 'g', name: 'Grauerle', ...plant('2-6') }, { id: 'a', name: 'Apfel', ...plant('4-9') }]);
    expect(r.mode).toBe('Modelldaten');
    expect(r.html).toContain('<svg');
    expect(r.html).toContain('Grauerle');
    expect(r.html).toContain('zu warm 2/2');
    expect(r.html).toContain('data-plant-id="g"');                       // a click opens the plant (#603)
    expect(r.html).toContain('popovertarget="clim-i-koeppen"');            // explanations (#603)
    expect(r.html).not.toContain('grid-cols-4');
    expect(explorerOutHtml(site, f, s2045, 'tann', 'de', [], true).html).toContain('grid-cols-4'); // zoomer layout (#602)
    expect(explorerOutHtml(site, f, { year: 2080, ssp: 'SSP1-2.6', model: 'all' }, 'hot', 'de', []).mode).toBe('Hochrechnung SSP1-2.6');
  });
  it('zone ruler: same names grouped, all plants, fixed order with the most critical on top', () => {
    const ps = [
      { id: 'a', name: 'Apfel', ...plant('4-9') }, { id: 'w1', name: 'Echte Walnuss', ...plant('5-8') }, { id: 'w2', name: 'Echte Walnuss', ...plant('5-8') },
      { id: 'g', name: 'Grauerle', ...plant('2-7') }, { id: 'm', name: 'Mango', ...plant('10-11') },
      ...Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, name: `Fit ${i}`, ...plant('3') })),
    ];
    const html = (s: ClimateScenario) => explorerOutHtml(site, f, s, 'tann', 'de', ps).html;
    const order = (s: ClimateScenario) => [...html(s).matchAll(/data-plant-id="([^"]+)"/g)].map(m => m[1]);
    const now = order(s2045);
    expect(now.slice(0, 4)).toEqual(['m', 'g', 'w1', 'a']);                // too cold, then fewest zones left above 7
    expect(now).toHaveLength(18);                                          // walnuts as one row, nothing cut off
    expect(html(s2045)).toContain('Echte Walnuss ×2');
    expect(order({ year: 2025, ssp: 'SSP2-4.5', model: 'all' })).toEqual(now);   // same place in another year
  });
});
