// The Einführung popup: shown on the first visit over the dimmed page, two thirds of the width, with the
// start / skip choices always in view; "Einführung" in the footer shows it again.
import { test, expect, stubNetwork } from './helpers';

test('first visit shows the Einführung popup, skipping remembers it, the footer reopens it', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.removeItem('pdk-welcome-seen'); } catch { /* ignore */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  const modal = page.locator('#welcome-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('h2')).toHaveText('Willkommen im Perma Design Kit');
  await expect(modal.locator('.w-step h3')).toHaveText(['Pflanzen', 'Polykulturen', 'Waldgartenplan', 'Kalender']);
  const width = (await modal.boundingBox())!.width;
  expect(width).toBeGreaterThan(1200 * 0.64);
  expect(width).toBeLessThan(1200 * 0.7);
  await expect(page.locator('#welcome-next')).toBeInViewport();
  await expect(page.locator('#welcome-support')).toHaveAttribute('href', '/unterstuetzen');

  await page.click('#welcome-skip');
  await expect(modal).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pdk-welcome-seen'))).toBe('1');

  await page.click('#open-welcome');
  await expect(modal).toBeVisible();
  await page.click('#welcome-next');
  await expect(modal).toBeHidden();
  await expect(page.locator('#tour-card')).toBeVisible();
  void errors;
});
