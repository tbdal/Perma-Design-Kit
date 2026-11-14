// Spanish as a third language: chosen in the language menu, the page reloads in Spanish; <html lang> is "es".
import { test, expect } from '@playwright/test';
import { stubNetwork } from './helpers';

test('language menu: Español switches the pages to Spanish', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await stubNetwork(page);
  await page.goto('/');
  await page.click('#user-toggle');
  await page.click('.lang-option[data-lang="es"]');
  await page.waitForLoadState('load');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('.lang-option[data-lang="es"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-search')).toHaveText('Buscar');
  await page.goto('/gartenplan');
  await expect(page.locator('body')).toContainText('Planificador');
  await page.goto('/hilfe');
  await expect(page.locator('.hilfe .lang-es')).toBeVisible();
  await expect(page.locator('.hilfe .lang-en')).toBeHidden();
  await expect(page.locator('.hilfe .lang-es h1')).toContainText('Diseñar bosques comestibles');
  await page.goto('/hilfe#gartenplan'); // plain ids lead to the Spanish chapter
  await expect(page.locator('#es-gartenplan')).toHaveAttribute('open', '');
});
