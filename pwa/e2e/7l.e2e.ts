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
  await page.fill('#l7-q', 'xyz-keine-sorte');
  await expect(page.locator('#l7-none')).toBeVisible();
});
