// Start page for professionals (Prüfbericht Nov., proposals 3, 4, 6, 7, 8): three ways in and the outputs once after
// the welcome, the planner's empty page without the warning box, the tree line,
// and on phones the four areas as a bar at the bottom.
import { test, expect, stubNetwork } from './helpers';

const seen = () => { try { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); } catch { /* ignore */ } };

test('after the welcome: "Womit möchtest du anfangen?" once, gone after a link', async ({ page, errors }) => {
  await stubNetwork(page);
  // a first visit: the welcome opens; the start page must not have been seen yet
  await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.removeItem('pdk-welcome-seen'); localStorage.removeItem('pdk-start-seen'); } });
  await page.goto('/kalender');
  await expect(page.locator('#welcome-modal')).toBeVisible();
  await expect(page.locator('#start-modal')).toBeHidden();
  await page.click('#welcome-skip');
  const start = page.locator('#start-modal');
  await expect(start).toBeVisible();
  await expect(start.locator('figure')).toHaveCount(6);
  await start.locator('a[href="/#suche"]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#plant-search')).toBeFocused();
  await expect(page.locator('#start-modal')).toBeHidden();
  await page.reload();
  await expect(page.locator('#welcome-modal')).toBeHidden();
  await expect(page.locator('#start-modal')).toBeHidden();
  // not on the plant page itself
  await expect(page.locator('#plant-list')).toBeVisible();
  void errors;
});

test('"Fläche planen" opens a new plan', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/gartenplan?neu=1');
  await expect(page.locator('#plan-editor-view')).toBeVisible();
  await expect(page).not.toHaveURL(/neu=/);
  void errors;
});

test('planner without plans: Beta label and what the planner does, no warning box', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(seen);
  await page.goto('/gartenplan');
  await expect(page.locator('#plan-empty')).toBeVisible();
  await expect(page.locator('#plan-empty li')).toHaveCount(5);
  await expect(page.locator('#plan-empty a[href="/beispiel"]')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Experimentell');
  // the tree line is one picture across the whole width, not a strip repeated side by side (#679)
  const sky = await page.locator('.hz-sky').evaluate(el => getComputedStyle(el).backgroundRepeat);
  expect(sky).not.toContain('repeat-x');
  void errors;
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the four areas sit in a bar at the bottom, the account button fits', async ({ page, errors }) => {
    await stubNetwork(page);
    await page.addInitScript(seen);
    await page.goto('/kalender');
    const nav = page.locator('#nav-links');
    expect(await nav.evaluate(n => getComputedStyle(n).position)).toBe('fixed');
    const box = (await nav.boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    await expect(page.locator('#nav-links a[aria-current="page"]')).toHaveAttribute('href', '/kalender');
    // still at the bottom once the page scrolled (the frosted header must not capture the fixed bar)
    await page.evaluate(() => { document.body.style.minHeight = '3000px'; scrollTo(0, 400); document.querySelector('.site-header')!.classList.add('hz-scrolled'); });
    const after = (await nav.boundingBox())!;
    expect(Math.round(after.y + after.height)).toBe(844);
    const user = (await page.locator('#user-toggle').boundingBox())!;
    expect(user.x + user.width).toBeLessThanOrEqual(390);
    // the feedback button stays above the bar
    const fab = (await page.locator('#feedback-fab summary').boundingBox())!;
    expect(fab.y + fab.height).toBeLessThan(box.y);
    void errors;
  });
});

test('signed in: the header is drawn signed in before the page scripts ran (no jump)', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-auth', JSON.stringify({ name: 'Jo', role: 'expert' })); });
  // without the bundled scripts only header-boot.js has run
  await page.route(/\/_astro\/.*\.js$/, r => r.abort());
  await page.goto('/kalender');
  await expect(page.locator('#user-label')).toHaveText('Jo');
  await expect(page.locator('#user-initial')).toHaveText('J');
  await expect(page.locator('#header-beta')).toBeHidden();
  await expect(page.locator('#beta-badge')).toBeVisible();
  void errors;
});

test('module links painted from the last visit go again when no module takes over', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Jo', role: 'team' }) }));
  await page.addInitScript(() => {
    localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-mode', 'team');
    localStorage.setItem('pdk-auth', JSON.stringify({ name: 'Jo', role: 'team' }));
    localStorage.setItem('pdk-nav-extra', JSON.stringify({ links: [{ featureId: 'x', label: 'Gemerkt', href: '/gemerkt' }], hidden: ['/gartenplan'] }));
  });
  await page.goto('/kalender');
  // with the module in the build it is removed after its grace period (5 s)
  await expect(page.locator('#nav-links a[href="/gemerkt"]')).toHaveCount(0, { timeout: 10_000 });
  // hidden only until settled: then shown again, or left to the module (with it in the build the new planner replaces it)
  await expect(page.locator('a[data-nav="/gartenplan"]')).not.toHaveAttribute('data-nav-hid', '');
  void errors;
});
