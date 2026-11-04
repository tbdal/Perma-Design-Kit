// Public variety list /7l: all varieties listed, a species chip and the search narrow the table.
import { test, expect } from '@playwright/test';
import { stubNetwork } from './helpers';

test('/7l lists the nursery varieties and filters them', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await stubNetwork(page);
  await page.goto('/7l');
  const rows = page.locator('#l7-rows tr');
  const all = await rows.count();
  expect(all).toBeGreaterThan(100);
  await page.click('[data-l7-art="Quitte"]');
  const quitten = await page.locator('#l7-rows tr:visible').count();
  expect(quitten).toBeGreaterThan(0);
  expect(quitten).toBeLessThan(all);
  await expect(page.locator('#l7-count')).toHaveText(`${quitten} Sorten`);
  await page.click('[data-l7-art=""]');
  // column filter and sorting, as on the Steckbriefe page
  await page.fill('[data-l7-col="0"]', 'quitte');
  await expect(page.locator('#l7-count')).toHaveText(`${quitten} Sorten`);
  await page.fill('[data-l7-col="0"]', '');
  await page.click('#l7-head [data-l7-sort="1"]');
  await page.click('#l7-head [data-l7-sort="1"]');
  await expect(page.locator('#l7-head [data-l7-sort="1"]')).toHaveAttribute('aria-sort', 'descending');
  const firstTwo = await page.locator('#l7-rows tr td:nth-child(2)').evaluateAll(t => t.slice(0, 2).map(x => x.textContent!.trim()));
  expect(firstTwo[0].localeCompare(firstTwo[1], 'de', { numeric: true })).toBeGreaterThanOrEqual(0);
  await page.fill('#l7-q', 'xyz-keine-sorte');
  await expect(page.locator('#l7-none')).toBeVisible();
});

test('/7l with the password: ripening times and profile fields', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await stubNetwork(page);
  await page.route('**/api/beta/7l', async r => {
    const ok = JSON.parse(r.request().postData() || '{}').passwort === 'geheim-7l';
    await r.fulfill({ status: ok ? 200 : 403, contentType: 'application/json', body: JSON.stringify(ok
      ? { stand: '2026-10-27', sorten: [{ art: 'Apfel', latin: 'Malus domestica', sorte: 'Boskoop', pick: 'Okt', eat: 'Dez–Mär', keep: 'bis April', fields: [['Geschmack', 'säuerlich-würzig']] }] }
      : { error: 'passwort' }) });
  });
  await page.goto('/7l');
  await page.fill('#l7-pw', 'falsch');
  await page.click('#l7-login button[type="submit"]');
  await expect(page.locator('#l7-msg')).toHaveText('Das Passwort stimmt nicht.');
  await page.fill('#l7-pw', 'geheim-7l');
  await page.click('#l7-login button[type="submit"]');
  await expect(page.locator('#l7-rows tr')).toHaveCount(1);
  await expect(page.locator('#l7-rows tr')).toContainText('Dez–Mär');
  await expect(page.locator('#l7-login')).toBeHidden();
  await page.fill('#l7-q', 'würzig'); // the search sees the profile texts too
  await expect(page.locator('#l7-count')).toHaveText('1 Sorten');
  await page.reload(); // the tab keeps the full list
  await expect(page.locator('#l7-rows tr')).toHaveCount(1);
});
