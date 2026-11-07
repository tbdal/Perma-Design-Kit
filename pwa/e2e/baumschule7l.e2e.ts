// Public variety list /baumschule7l: intro, only the logo in the header, species chips, search, column filter and sorting.
import { test, expect } from '@playwright/test';
import { stubNetwork } from './helpers';

const sorten = [
  { art: 'Apfel', latin: 'Malus domestica', sorte: 'Boskoop', stock: 'M9', pick: 'Okt', eat: 'Dez–Feb', keep: 'bis März' },
  { art: 'Apfel', latin: 'Malus domestica', sorte: 'Boskoop', stock: 'A2', pick: 'Okt', eat: 'Dez–Feb', keep: 'bis März' },
  { art: 'Apfel', latin: 'Malus domestica', sorte: 'Alkmene', stock: 'Sämling', pick: 'Sep', eat: '', keep: '' },
  { art: 'Birne', latin: 'Pyrus communis', sorte: 'Gute Luise', stock: 'Quitte A', pick: 'Anfang September', eat: 'Ende September', keep: '1-2 Monate' },
];

test('/baumschule7l lists the varieties, read only', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pdk-persist-later', String(Date.now())); }); // a new visitor: no tour
  await stubNetwork(page);
  await page.route('**/api/beta/baumschule7l', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stand: '2026-11-07', sorten }) }));
  await page.goto('/baumschule7l');
  await expect(page.locator('h1')).toHaveText('Obstbäume aus Ugas Obstbaumschule');
  await expect(page.locator('a[href*="uga-detlef-wolf-ist-gestorben"]')).toHaveText('Nachruf');
  // header: only the logo, no menus, no tour, no feedback button
  await expect(page.locator('.site-header nav > a[href="/"]')).toBeVisible();
  await expect(page.locator('#nav-links')).toBeHidden();
  await expect(page.locator('#feedback-fab')).toBeHidden();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const rows = page.locator('#b7-rows tr');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('#b7-count')).toContainText('3 Sorten, 4 Pflanzen'); // Boskoop twice (two rootstocks)
  await expect(page.locator('[data-b7-art="Apfel"]')).toHaveText('Apfel (2)');
  await expect(page.locator('#b7-head th')).toHaveText([/Pflanze/, /Sorte/, /Unterlage/, /Pflückreife/, /Genussreife/, /Lagerfähigkeit/, '', '', '', '', '', '']);
  await expect(page.locator('#b7-rows')).not.toContainText(/Notiz|Gruppe|PDF/);
  await page.click('[data-b7-art="Birne"]');
  await expect(rows).toHaveCount(1);
  await page.click('[data-b7-art=""]');
  await page.fill('[data-b7-col="stock"]', 'm9');
  await expect(rows).toHaveCount(1);
  await expect(page.locator('#b7-count')).toHaveText('1 Sorte, 1 Pflanze');
  await page.fill('[data-b7-col="stock"]', '');
  await page.click('#b7-head [data-b7-sort="pick"]');
  await expect(rows.first()).toContainText('Alkmene'); // Sep before Okt
  await page.click('#b7-head [data-b7-sort="pick"]');
  await expect(rows.first()).toContainText('Boskoop');
  await page.fill('#b7-q', 'luise');
  await expect(rows).toHaveCount(1);
  // clicking a row opens nothing
  await rows.first().click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
