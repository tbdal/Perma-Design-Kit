import { test, expect, stubNetwork } from './helpers';
import type { Page } from '@playwright/test';

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function asAccount(page: Page, role: string) {
  await stubNetwork(page);
  await page.route('**/api/auth/me', r => r.fulfill(json({ name: 'Jo', role })));
  await page.addInitScript(r => {
    try { localStorage.setItem('pdk-mode', 'team'); localStorage.setItem('pdk-auth', JSON.stringify({ name: 'Jo', role: r })); } catch { /* ignore */ }
  }, role);
  await page.goto('/gartenplan');
}

test('team mode for team accounts', async ({ page, errors }) => {
  await asAccount(page, 'team');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'team');
  await expect(page.locator('#mode-current')).toHaveText('Team');
  await page.click('#mode-toggle');
  await expect(page.locator('[data-mode-opt="team"]')).toBeVisible();
  void errors;
});

test('expert accounts asking for team mode get expert mode', async ({ page, errors }) => {
  await asAccount(page, 'expert');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'expert');
  await page.click('#mode-toggle');
  await expect(page.locator('[data-mode-opt="team"]')).toBeHidden();
  void errors;
});
