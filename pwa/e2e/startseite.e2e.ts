// Start page for professionals (Prüfbericht Nov., proposals 3, 4, 6, 7, 8): three ways in and the outputs once after
// the welcome, the planner's empty page without the warning box, the narrow tree line elsewhere,
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
  // narrow tree line here, the big one only on the start page
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-home'))).toBe(false);
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-home'))).toBe(true);
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
    const user = (await page.locator('#user-toggle').boundingBox())!;
    expect(user.x + user.width).toBeLessThanOrEqual(390);
    // the feedback button stays above the bar
    const fab = (await page.locator('#feedback-fab summary').boundingBox())!;
    expect(fab.y + fab.height).toBeLessThan(box.y);
    void errors;
  });
});
