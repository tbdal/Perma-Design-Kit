// The map background opacity slider ("Deckkraft") must change the map under the plan: in 2D at once, in 3D after the rebuild.
import { test, expect, stubNetwork, withDb, planRecord, openPlan } from './helpers';

const RED_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGP4z8AARwzEcQCukw/x0F8jngAAAABJRU5ErkJggg==', 'base64');

for (const basemap of ['osm', 'sat', 'ortho'] as const) test(`map opacity slider changes the background (2D, ${basemap}) and is kept`, async ({ page }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-mode', 'classic'); });
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('op', { geo: { lat: 48.1372, lon: 11.5756, rotationDeg: 0, basemap, opacity: 0.6 } }) });
  await openPlan(page, 'op');
  const layerGroup = page.locator('.basemap-layer > g:not(.basemap-back)').first();
  await expect(layerGroup).toHaveAttribute('opacity', '0.6');
  const slider = page.locator('#g-basemap-opacity');
  await expect(slider).toBeEnabled();
  await slider.fill('0.3');
  await expect(layerGroup).toHaveAttribute('opacity', '0.3');
  // a redraw (zoom) keeps the chosen value
  await page.click('#zoom-in');
  await expect(page.locator('.basemap-layer > g:not(.basemap-back)').first()).toHaveAttribute('opacity', '0.3');
  // and it was saved with the plan
  await page.waitForTimeout(1500);
  const saved = await withDb(page, `return (await all('gardenPlans')).find(p => p.id === 'op').geo.opacity;`, {});
  expect(saved).toBe(0.3);
});

test('map opacity in 3D: the ground map turns see-through, the lawn shows under it @slow', async ({ page }) => {
  await stubNetwork(page);
  await page.route(url => /tile\.openstreetmap\.org|eox\.at/.test(url.hostname), route => route.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: RED_TILE }));
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-mode', 'classic'); });
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('op3', { geo: { lat: 48.1372, lon: 11.5756, rotationDeg: 0, basemap: 'osm', opacity: 1 } }) });
  await openPlan(page, 'op3');
  await page.click('#btn-view-3d');
  const canvas = page.locator('#plan-3d-container canvas').first();
  await expect(canvas).toBeVisible();
  const redShare = async () => {
    await page.waitForTimeout(1800);
    const buf = await canvas.screenshot();
    return page.evaluate(async (b64: string) => {
      const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let red = 0, n = 0;
      // red dominance, not brightness: the sun (time of day) darkens the ground
      for (let i = 0; i < d.length; i += 4 * 17) { n++; if (d[i] > 60 && d[i + 1] < d[i] * 0.3 && d[i + 2] < d[i] * 0.3) red++; }
      return red / n;
    }, buf.toString('base64'));
  };
  const solid = await redShare();
  console.log('red share solid', solid);
  expect(solid).toBeGreaterThan(0.05); // the red test map is the ground
  await page.locator('#g-basemap-opacity').fill('0.2');
  await page.locator('#g-basemap-opacity').dispatchEvent('change'); // the 3D view is rebuilt on "change"
  await page.waitForTimeout(500);
  const faint = await redShare();
  console.log('red share faint', faint);
  expect(faint).toBeLessThan(solid / 2); // mostly lawn now: far less pure red
});
