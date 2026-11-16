// The welcome (Entwurf „Einstieg neu“ E1–E3): one page with three ways on the first visit; "Erst mal umschauen"
// remembers it, "Einführung" in the footer shows it again; the garden way starts the tour in the simple view,
// the group way has its own page, then the tour.
import { test, expect, stubNetwork } from './helpers';

const firstVisit = () => { try { localStorage.removeItem('pdk-welcome-seen'); localStorage.removeItem('pdk-start-seen'); localStorage.removeItem('pdk-einstieg'); } catch { /* ignore */ } };

test('first visit shows the three ways, "Erst mal umschauen" remembers it, the footer reopens it', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(firstVisit);
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  const modal = page.locator('#welcome-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#welcome-title')).toHaveText('Willkommen im Perma Design Kit');
  await expect(modal.locator('.w-way strong')).toHaveText(['Ich plane meinen Garten', 'Wir planen gemeinsam', 'Ich plane professionell']);
  await expect(page.locator('#welcome-support')).toHaveAttribute('href', '/unterstuetzen');
  await page.click('#welcome-skip');
  await expect(modal).toBeHidden();
  await expect(page.locator('#start-modal')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pdk-welcome-seen'))).toBe('1');
  await page.click('#open-welcome');
  await expect(modal).toBeVisible();
  void errors;
});

test('"Ich plane meinen Garten": simple view, the tour, then the simple start page', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.removeItem('pdk-welcome-seen'); localStorage.removeItem('pdk-start-seen'); localStorage.setItem('pdk-mode', 'classic'); } });
  await page.goto('/kalender');
  await page.click('#welcome-way-garten');
  await expect(page.locator('#welcome-modal')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'simple');
  await expect(page.locator('#tour-card')).toBeVisible();
  await page.click('#tour-skip');
  const start = page.locator('#start-modal');
  await expect(start).toBeVisible();
  await expect(start.locator('#start-garten')).toBeVisible();
  await expect(start.locator('#start-pro')).toBeHidden();
  await start.locator('a[href="/polykulturen"]').first().click();
  await expect(page).toHaveURL(/\/polykulturen\/?$/);
  await expect(page.locator('#start-modal')).toBeHidden();
  void errors;
});

test('"Wir planen gemeinsam": its own page, back, and the tour from there', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(firstVisit);
  await page.goto('/');
  await page.click('#welcome-way-gemeinsam');
  const group = page.locator('#w-gemeinsam');
  await expect(group).toBeVisible();
  await expect(group.locator('.w-tile')).toHaveCount(4);
  await group.locator('[data-w-back]').click();
  await expect(page.locator('#w-choose')).toBeVisible();
  await page.click('#welcome-way-gemeinsam');
  await page.click('#welcome-gemeinsam-tour');
  await expect(page.locator('#tour-card')).toBeVisible();
  await page.click('#tour-skip');
  // the group way has no start dialog
  await expect(page.locator('#start-modal')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('pdk-einstieg'))).toBe('gemeinsam');
  void errors;
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the welcome fills the screen, the three ways as rows, no horizontal scroll', async ({ page, errors }) => {
    await stubNetwork(page);
    await page.addInitScript(firstVisit);
    await page.goto('/');
    const modal = page.locator('#welcome-modal');
    await expect(modal).toBeVisible();
    const box = (await modal.boundingBox())!;
    expect(Math.round(box.width)).toBe(390);
    const way = (await page.locator('#welcome-way-garten').boundingBox())!;
    expect(way.height).toBeLessThan(160);
    expect(await modal.evaluate(m => m.scrollWidth <= m.clientWidth + 1)).toBe(true);
    void errors;
  });
});
