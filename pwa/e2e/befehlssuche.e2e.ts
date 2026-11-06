// Strg+O: one search over the page — pages, hidden menu items, switches, choices and the page's own plants.
import { test, expect, stubNetwork } from './helpers';

test('Strg+O finds pages, menu items and plants and runs them', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); } catch { /* ignore */ } });
  await page.goto('/');
  const pal = page.locator('dialog.cmdk');
  const input = pal.locator('input');
  // the palette runs a button of the page: load the sample data
  await expect(page.locator('#btn-load-samples')).toBeVisible();
  await page.keyboard.press('Control+o');
  await input.fill('beispieldaten laden');
  await expect(pal.locator('li').first()).toHaveText(/^Beispieldaten laden/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#plant-list h3').first()).toBeVisible();

  await page.keyboard.press('Control+o');
  await expect(pal).toBeVisible();
  // an item of a closed menu (language menu) is offered
  await input.fill('english');
  await expect(pal.locator('li').first()).toContainText('English');
  await input.fill('');
  await page.keyboard.press('Escape');
  await expect(pal).toBeHidden();

  // a plant opens in the editor
  await page.keyboard.press('Control+o');
  const firstPlant = (await page.locator('#plant-list h3').first().textContent())!.trim().split(' (')[0];
  await input.fill(firstPlant);
  await expect(pal.locator('li').first()).toContainText(firstPlant);
  await expect(pal.locator('li').first()).toContainText('Pflanze bearbeiten');
  await page.keyboard.press('Enter');
  await expect(pal).toBeHidden();
  await expect(page.locator('dialog[open]').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // a page of the menu
  await page.keyboard.press('Control+o');
  await input.fill('kalender');
  await expect(pal.locator('li').first()).toContainText('Kalender');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/kalender/);
  expect(errors).toEqual([]);
});

test('Esc in a search field leaves it, so the shortcuts work again', async ({ page }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); } catch { /* ignore */ } });
  await page.goto('/');
  const search = page.locator('#plant-search');
  await search.click();
  await search.fill('apfel');
  await page.keyboard.press('Escape');
  await expect(search).not.toBeFocused();
  await page.keyboard.press('Control+o');
  await expect(page.locator('dialog.cmdk')).toBeVisible();
});
