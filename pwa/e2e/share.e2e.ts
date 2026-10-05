import { test, expect, stubNetwork, loadSamples, withDb, planRecord } from './helpers';

test('share link with view: recipient imports, start plan opens in 3D with the sun set', async ({ browser }) => {
  // author
  const a = await browser.newPage();
  await a.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await stubNetwork(a);
  await loadSamples(a);
  await withDb(a, `const ps = await all('plants'); await put('gardenPlans', { ...arg, placements: ps.map((p, i) => ({ id: 'p' + i, plantId: p.id, xM: 5 + i * 8, yM: 8, notes: '' })) });`, planRecord('shared-plan', { name: 'Geteilter Garten' }));
  await a.evaluate(() => {
    localStorage.setItem('pgd-gartenplan-view-shared-plan', JSON.stringify({ view2d: null, cam3d: { position: [30, 18, 35], target: [10, 0, 7] }, mode: '3d', sun: { date: '2026-06-21', minutes: 1140 }, coverage: '' }));
    localStorage.setItem('pgd-gartenplan-last-id', 'shared-plan');
  });
  await a.goto('/settings/');
  await a.click('#btn-share-link');
  await expect(a.locator('#share-start')).toHaveValue('shared-plan');
  await a.click('#share-create');
  await expect(a.locator('#share-url')).not.toHaveValue('');
  const link = await a.inputValue('#share-url');
  await a.close();

  // recipient (fresh context)
  const ctx = await browser.newContext();
  const b = await ctx.newPage();
  await b.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  b.on('dialog', d => d.accept());
  await stubNetwork(b);
  await b.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await b.click('#sh-import');
  await expect(b.locator('#sh-done')).toBeVisible();
  await b.keyboard.press('Escape');
  await expect(b.locator('#sh-to-plans')).toHaveText('Plan „Geteilter Garten“ öffnen');
  await b.click('#sh-to-plans');
  await expect(b.locator('#plan-3d-container')).toBeVisible();
  await expect(b.locator('#sun-date')).toHaveValue('2026-06-21');
  // second import of the same link: offers "open" instead of a copy
  await b.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(b.locator('#sh-present')).toBeVisible();
  await ctx.close();
});

test('/example forwards to the stored example project', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/example');
  await expect(page).toHaveURL(/\/teilen\/\?beispiel=1#d=/);
  await expect(page.locator('#sh-title')).toHaveText('Beispielprojekt');
  await expect(page.locator('#sh-summary')).toContainText('Waldgartenpläne');
  void errors;
});

test('report page: carries the page, debug file has no credentials', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/gartenplan');
  await page.evaluate(() => { localStorage.setItem('webdav-pass', 'geheim123'); localStorage.setItem('gist-token', 'ghp_secret'); });
  await expect(page.locator('#report-link')).toHaveAttribute('href', /^\/fehler-melden\/\?from=%2Fgartenplan(%2F)?$/);
  await page.click('#report-link');
  await expect(page.locator('#rp-page')).toHaveValue(/^\/gartenplan\/?$/);
  await page.fill('#rp-what', 'Test');
  await page.check('#rp-project');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#rp-download')]);
  const text = (await import('node:fs')).readFileSync((await dl.path())!, 'utf8');
  expect(text).toContain('"report"');
  expect(text).not.toContain('geheim123');
  expect(text).not.toContain('ghp_secret');
  void errors;
});

test('persistence banner appears once there is data', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.removeItem('pdk-persist-later'); });
  page.on('dialog', d => d.accept());
  await stubNetwork(page);
  await page.goto('/');
  await expect(page.locator('#persist-banner')).toBeHidden();
  await page.evaluate(() => { (document.getElementById('data-menu') as HTMLDetailsElement).open = true; });
  await page.click('#btn-load-samples');
  await expect(page.locator('#plant-list [data-id]').first()).toBeAttached();
  await page.goto('/');
  await expect(page.locator('#persist-banner')).toBeVisible();
  await page.click('#persist-banner-later');
  await expect(page.locator('#persist-banner')).toBeHidden();
});
