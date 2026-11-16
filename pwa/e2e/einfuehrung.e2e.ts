// The welcome (first visit): one page with three ways in. Own garden → simple view, tour, then the simple start page once;
// together → the group page with the tour; professional → the beta step. "Erst mal umschauen" closes it for good,
// "?" → "Willkommen wieder zeigen" and the footer show it again.
import { test, expect, stubNetwork } from './helpers';

const firstVisit = () => { try { if (sessionStorage.getItem('first')) return; sessionStorage.setItem('first', '1'); localStorage.removeItem('pdk-welcome-seen'); localStorage.removeItem('pdk-start-seen'); localStorage.removeItem('pdk-path'); } catch { /* ignore */ } };

test('three ways in; looking around remembers it, the help menu shows it again', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(firstVisit);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/kalender');
  const modal = page.locator('#welcome-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#welcome-title')).toHaveText('Willkommen im Perma Design Kit');
  await expect(modal.locator('[data-path]')).toHaveCount(3);
  await expect(page.locator('#welcome-support')).toHaveAttribute('href', '/unterstuetzen');
  await page.click('#welcome-skip');
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pdk-welcome-seen'))).toBe('1');
  await expect(page.locator('#start-modal')).toBeHidden();

  await page.click('#help-toggle');
  await page.click('#help-intro');
  await expect(modal).toBeVisible();
  // together: the group page, then its tour (the tour lives on the plant page)
  await page.click('[data-path="gemeinsam"]');
  await expect(modal.locator('.w-link')).toHaveCount(4);
  await page.click('#welcome-next');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#tour-card')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('pdk-path'))).toBe('gemeinsam');
  void errors;
});

test('own garden: simple view, tour, then the simple start page once', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(firstVisit);
  await page.goto('/');
  await page.click('[data-path="garten"]');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'simple');
  await expect(page.locator('#tour-card')).toBeVisible();
  await page.click('#tour-skip');
  const start = page.locator('#start-modal');
  await expect(start).toBeVisible();
  await expect(start.locator('[data-variant="garten"]')).toBeVisible();
  await expect(start.locator('[data-variant="profi"]')).toBeHidden();
  await start.locator('[data-variant="garten"] a[href="/#suche"]').click();
  await expect(start).toBeHidden();
  await expect(page.locator('#plant-search')).toBeFocused();
  await page.goto('/?rundgang=1');   // the tour again, no start page
  await expect(page.locator('#tour-card')).toBeVisible();
  await page.click('#tour-skip');
  await expect(start).toBeHidden();
  void errors;
});

test('professional: the beta step with what comes out at the end', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(firstVisit);
  await page.goto('/');
  await page.click('[data-path="profi"]');
  await expect(page.locator('#welcome-beta')).toBeVisible();
  await expect(page.locator('#welcome-beta figure')).toHaveCount(6);
  await expect(page.locator('#welcome-beta-join')).toHaveAttribute('href', '/beta/#signup-form');
  await page.click('[data-for="profi"] [data-welcome-back]');
  await expect(page.locator('[data-path="garten"]')).toBeVisible();
  void errors;
});
