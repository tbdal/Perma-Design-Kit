import { test, expect, stubNetwork, loadMasterList, withDb, planRecord, openPlan } from './helpers';

const months = (...m: number[]) => Array.from({ length: 12 }, (_, i) => m.includes(i));

/** Plan with a black walnut next to an apple, a pear and a nitrogen fixer. */
async function seedNeighbourPlan(page: import('@playwright/test').Page, extra: Record<string, unknown> = {}) {
  await loadMasterList(page);
  await withDb(page, `
    const plants = await all('plants');
    const set = async (n, f) => { const p = plants.find(x => x.latinName === n); Object.assign(p, f); await put('plants', p); return p; };
    const w = await set('Juglans nigra', { heightM: 25, widthM: 15, eatable: true, fruitMonths: arg.m9 });
    const a = await set('Malus domestica', { heightM: 6, widthM: 6, eatable: true, fruitMonths: arg.m89, climateZone: '5-9' });
    const e = await set('Elaeagnus umbellata', { heightM: 3, widthM: 3, nitrogenFix: true, eatable: true, fruitMonths: arg.m9 });
    const P = (id, p, x, y) => ({ id, plantId: p.id, xM: x, yM: y, notes: '' });
    await put('gardenPlans', { ...arg.plan, placements: [P('w', w, 8, 8), P('a', a, 16, 10), P('e', e, 18, 12)] });
  `, { m9: months(9), m89: months(8, 9), plan: planRecord('np', { yearsSincePlanting: 15, ...extra }) });
}

test('placement view: search only there, neighbours, yield, zones', async ({ page, errors }) => {
  await stubNetwork(page);
  await seedNeighbourPlan(page);
  await page.goto('/gartenplan');
  await expect(page.locator('#plan-search-hero')).toBeHidden();
  await openPlan(page, 'np');
  await expect(page.locator('#plan-search-hero')).toBeVisible();
  await expect(page.locator('#warnings-list')).toContainText('schlechte Nachbarn (Juglon');
  await expect(page.locator('#good-neighbors-list')).toContainText('unterstützt von');
  await expect(page.locator('#yield-total')).toContainText('kg pro Jahr');
  await page.check('#g-zones');
  await expect(page.locator('#zones-layer circle')).toHaveCount(5);
  await expect(page.locator('#zones-legend')).toContainText('Sommersonne');
  // zones are stored with the plan
  await expect.poll(() => withDb(page, `return (await all('gardenPlans'))[0].zones?.show;`)).toBe(true);
  // back to the list: no search
  await page.click('#btn-back-to-list');
  await expect(page.locator('#plan-search-hero')).toBeHidden();
  void errors;
});

test('care calendar downloads as iCal', async ({ page, errors }) => {
  await stubNetwork(page);
  await seedNeighbourPlan(page);
  await openPlan(page, 'np');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-care-ics')]);
  const path = await dl.path();
  const ics = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(ics).toContain('BEGIN:VCALENDAR');
  expect(ics).toContain('SUMMARY:Ernte: Kulturapfel');
  expect(ics).toContain('RRULE:FREQ=YEARLY');
  void errors;
});

test('site climate panel and hints from (stubbed) Open-Meteo data', async ({ page, errors }) => {
  // 3 years of synthetic weather: yearly low −20 °C (zone 6b), frost until mid-April
  const time: string[] = [], tmin: number[] = [], pr: number[] = [], wd: number[] = [];
  for (let y = 2000; y < 2003; y++) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10), md = iso.slice(5);
      time.push(iso); tmin.push(md === '01-20' ? -20 : md <= '04-15' || md >= '10-20' ? -2 : 8); pr.push(2); wd.push(250);
    }
  }
  await stubNetwork(page, { climate: route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ elevation: 50, daily: { time, temperature_2m_min: tmin, precipitation_sum: pr, wind_direction_10m_dominant: wd } }) }) });
  await seedNeighbourPlan(page, { geo: { lat: 50.9, lon: 7, rotationDeg: 0, basemap: 'none', opacity: 0.6 } });
  await withDb(page, `const p = (await all('plants')).find(x => x.latinName === 'Malus domestica'); p.climateZone = '7-9'; await put('plants', p);`);
  await openPlan(page, 'np');
  await expect(page.locator('#climate-body')).toContainText('6b');
  await expect(page.locator('#climate-body')).toContainText('aus WSW');
  await expect(page.locator('#warnings-list')).toContainText('nicht winterhart');
  void errors;
});

test('buildings of the previous plan never show in the next one', async ({ page, errors }) => {
  let delayB = false;
  const fake = (lat: number, lon: number) => ({ elements: [{ type: 'way', tags: { building: 'house' }, geometry: [
    { lat, lon }, { lat: lat + 0.0001, lon }, { lat: lat + 0.0001, lon: lon + 0.0001 }, { lat, lon: lon + 0.0001 }, { lat, lon }] }] });
  await stubNetwork(page, {
    overpass: async route => {
      const isB = (route.request().postData() ?? '').includes('48.1');
      if (isB && delayB) await new Promise(r => setTimeout(r, 4000));
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(isB ? fake(48.1001, 11.5001) : fake(50.9376, 6.9601)) });
    },
  });
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.a); await put('gardenPlans', arg.b);`, {
    a: planRecord('A', { geo: { lat: 50.9375, lon: 6.96, rotationDeg: 0, basemap: 'none', opacity: 0.8 } }),
    b: planRecord('B', { geo: { lat: 48.1, lon: 11.5, rotationDeg: 0, basemap: 'none', opacity: 0.8 } }),
  });
  await page.evaluate(() => caches.delete('pdk-geo-v1'));
  const attrib = page.locator('#plan-wrap .basemap-attrib');
  await openPlan(page, 'A');
  await expect(attrib).toContainText('Gebäude');
  delayB = true;
  await page.click('#btn-back-to-list');
  await page.click('[data-plan-id="B"]');
  await page.waitForTimeout(1200);
  await expect(attrib).not.toContainText('Gebäude');
  await expect(attrib).toContainText('Gebäude', { timeout: 8000 });
  void errors;
});
