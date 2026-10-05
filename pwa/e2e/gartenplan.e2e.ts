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
      const isB = (route.request().postData() ?? route.request().url()).includes('48.1');
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

test('hint click: first jumps to the area and marks it, second selects the plants', async ({ page, errors }) => {
  await stubNetwork(page);
  await seedNeighbourPlan(page);
  await openPlan(page, 'np');
  const hint = page.locator('#warnings-list button', { hasText: 'schlechte Nachbarn' });
  const viewBefore = await page.getAttribute('#plan-svg', 'viewBox');
  await hint.click();
  await expect(hint).toHaveAttribute('aria-pressed', 'true');
  // the juglone reach (16 m) is drawn as a dashed zone around the walnut
  await expect(page.locator('#warn-layer circle[stroke-dasharray]')).toHaveCount(1);
  expect(await page.getAttribute('#plan-svg', 'viewBox')).not.toBe(viewBefore);
  const panelBefore = await page.textContent('#selected-panel');
  // second click selects both plants
  await hint.click();
  await expect(page.locator('#selected-panel')).not.toHaveText(panelBefore ?? '');
  // Esc clears the pinned mark (the hover preview stays while the hint has focus)
  await page.keyboard.press('Escape');
  await expect(hint).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#plan-search-hero').hover();
  await hint.blur();
  await expect(page.locator('#warn-layer circle')).toHaveCount(0);
  void errors;
});

test('plan PDF: paper/scale check and a scaled download', async ({ page, errors }) => {
  await stubNetwork(page);
  await seedNeighbourPlan(page);           // 30 × 20 m
  await openPlan(page, 'np');
  await page.click('#btn-export-pdf');
  await page.selectOption('#pdf-paper', 'A4');
  await page.selectOption('#pdf-scale', '50');
  await expect(page.locator('#pdf-create')).toBeDisabled();
  await expect(page.locator('#pdf-info')).toContainText('A2');
  await page.selectOption('#pdf-scale', '200');
  await expect(page.locator('#pdf-create')).toBeEnabled();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pdf-create')]);
  const bytes = (await import('node:fs')).readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  void errors;
});

test('construction phases: later plants as outline, phase panel, shopping list per year', async ({ page, errors }) => {
  await stubNetwork(page);
  await seedNeighbourPlan(page, { yearsSincePlanting: 1 });
  // the nitrogen fixer only comes three years later
  await withDb(page, `const p = (await all('gardenPlans'))[0]; p.placements.find(x => x.id === 'e').phaseYear = 3; await put('gardenPlans', p);`);
  await openPlan(page, 'np');
  await expect(page.locator('[data-placement-id="e"]')).toHaveCSS('opacity', '0.35');
  await expect(page.locator('#phases-list')).toContainText('+3');
  await expect(page.locator('#phases-list')).toContainText('noch nicht gepflanzt');
  await page.fill('#phases-start', '2027');
  await page.locator('#phases-start').dispatchEvent('change');
  await expect(page.locator('#phases-list')).toContainText('2030');
  // move the apple and walnut (phase 2027) to 2028 through the selection panel
  await page.locator('#phases-list button', { hasText: '2027' }).click();
  await page.selectOption('#multi-phase', '1');
  await expect(page.locator('#phases-list')).toContainText('2028');
  // slider to year 3: everything planted
  await page.fill('#g-years', '3');
  await page.dispatchEvent('#g-years', 'input');
  await expect(page.locator('[data-placement-id="e"]')).not.toHaveCSS('opacity', '0.35');
  await page.click('#btn-shopping');
  await expect(page.locator('#shopping-body')).toContainText('(2030)');
  void errors;
});

test('field mode: own GPS position, way to a plant, place a plant here', async ({ page, context, errors }) => {
  const lat0 = 50.9, lon0 = 7.0;
  // stand at plan point (12, 10): 12 m east, 10 m south of the plan's top-left corner
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: lat0 - 10 / 111320, longitude: lon0 + 12 / (111320 * Math.cos(lat0 * Math.PI / 180)), accuracy: 4 });
  await stubNetwork(page);
  await seedNeighbourPlan(page, { geo: { lat: lat0, lon: lon0, rotationDeg: 0, basemap: 'none', opacity: 0.6 } });
  await openPlan(page, 'np');
  await page.click('#tool-gps');
  await expect(page.locator('#gps-status')).toContainText('im Garten');
  await expect(page.locator('#gps-layer circle')).toHaveCount(2);
  // select the apple at (16, 10): 4 m to the east
  await page.locator('[data-placement-id="a"] .marker-blob').click({ force: true });
  await expect(page.locator('#gps-way')).toContainText('Noch 4 m nach O');
  // pick a plant in the list and place it where I stand
  const before = await withDb<number>(page, `return (await all('gardenPlans'))[0].placements.length;`);
  await page.locator('#plant-picker [data-picker-plant]').first().click();
  await page.click('#gps-place');
  await expect.poll(() => withDb<number>(page, `return (await all('gardenPlans'))[0].placements.length;`)).toBe(before + 1);
  void errors;
});

test('project tiles: rename, duplicate, delete; Alt+4 and the nav link lead back to the list', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('tile', { name: 'Hang' }) });
  await page.goto('/gartenplan');
  const tile = page.locator('[data-plan-id="tile"]');
  await page.evaluate(() => { window.prompt = () => 'Hang Nord'; });
  await tile.locator('[data-plan-action="rename"]').click();
  await expect(page.locator('[data-plan-id="tile"] h3')).toHaveText('Hang Nord');
  await page.locator('[data-plan-id="tile"] [data-plan-action="duplicate"]').click();
  await expect(page.locator('[data-plan-id]')).toHaveCount(2);
  await expect(page.locator('#plan-list')).toContainText('Hang Nord (Kopie)');
  const copy = page.locator('[data-plan-id]:not([data-plan-id="tile"])');
  await copy.locator('[data-plan-action="delete"]').click();   // confirm() is accepted by the fixture
  await expect(page.locator('[data-plan-id]')).toHaveCount(1);
  expect(await withDb<number>(page, `return (await all('gardenPlans')).length;`)).toBe(1);
  // into the plan and back with Alt+4, then with the nav link
  await page.locator('[data-plan-id="tile"] h3').click();
  await expect(page.locator('#phase-b')).not.toHaveClass(/hidden/);
  await page.keyboard.press('Alt+4');
  await expect(page.locator('[data-plan-id="tile"]')).toBeVisible();
  await page.locator('[data-plan-id="tile"] h3').click();
  await page.locator('a[data-nav="/gartenplan"]').first().click();
  await expect(page.locator('[data-plan-id="tile"]')).toBeVisible();
  void errors;
});

test('without a location the map switches stay visible, greyed out, and offer to set one', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('nogeo') });
  await openPlan(page, 'nogeo');
  const water = page.locator('#water-toggle');
  await expect(water).toBeVisible();
  await expect(page.locator('#g-water')).toBeDisabled();
  await expect(water).toHaveAttribute('title', /Standort/);
  await expect(page.locator('#buildings-toggle')).toBeVisible();
  await expect(page.locator('#contours-toggle')).toBeVisible();
  await water.click({ force: true });   // the label is clickable, its checkbox disabled
  await expect(page.locator('#locate-dialog')).toBeVisible();
  void errors;
});
