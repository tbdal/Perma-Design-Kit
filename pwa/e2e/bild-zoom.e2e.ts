// Werkstatt #516: a picture opens enlarged in the same tab (≤ 90 % of the window); Esc, the × and a click outside close it.
import { test, expect, stubNetwork } from './helpers';

test('pictures in the Anleitung zoom in place and close three ways', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-welcome-seen', '1'); } catch { /* ignore */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/hilfe/');
  const pic = page.locator('img[src="/hilfe/planspiel.jpg"]').first();
  const zoom = page.locator('dialog.img-zoom');
  const tabs = page.context().pages().length;

  await pic.click();
  await expect(zoom).toBeVisible();
  expect(page.context().pages().length).toBe(tabs); // same tab
  const box = (await zoom.locator('img').boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1200 * 0.9 + 1);
  expect(box.height).toBeLessThanOrEqual(800 * 0.9 + 1);
  await page.keyboard.press('Escape');
  await expect(zoom).toBeHidden();

  await pic.click();
  await zoom.locator('.img-zoom-x').click();
  await expect(zoom).toBeHidden();

  await pic.click();
  await page.mouse.click(10, 400); // outside the picture
  await expect(zoom).toBeHidden();
  expect(errors).toEqual([]);
});
