import { test, expect, stubNetwork } from './helpers';
test('invite page + admin', async ({ page }) => {
  await stubNetwork(page);
  let me: unknown = null;
  await page.route('**/api/auth/me', r => me ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) }) : r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"login"}' }));
  await page.route('**/api/auth/invite?**', r => r.request().url().includes('token=gut') ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'team', label: 'Jörn' }) }) : r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"invalid"}' }));
  await page.route('**/api/auth/invite', async r => { me = { name: 'Jörn', role: 'team' }; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(me) }); });
  await page.goto('/anmelden/?einladung=gut');
  await expect(page.locator('#invite-form')).toBeVisible();
  await expect(page.locator('#login-form')).toBeHidden();
  await expect(page.locator('#invite-intro')).toContainText('ins Team eingeladen');
  await page.fill('#invite-name', 'Jörn'); await page.fill('#invite-password', 'langes-passwort');
  await page.click('#invite-form button[type=submit]');
  await page.waitForURL(u => u.pathname === '/');
  expect(await page.evaluate(() => localStorage.getItem('pdk-mode'))).toBe('team');
  expect(page.url()).not.toContain('einladung');
  await page.goto('/anmelden/?einladung=schlecht');
  await expect(page.locator('#invite-invalid')).toBeVisible();
  // admin
  me = { name: 'Admin', role: 'admin' };
  const list: unknown[] = [];
  await page.route('**/api/admin/users', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"users":[]}' }));
  await page.route('**/api/admin/invites', async r => {
    if (r.request().method() === 'POST') { list.push({ id: 'a1', role: 'team', label: 'Jörn', created: '2026-10-15', expires: '2026-10-29', used: null, usedBy: null, status: 'open' }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'a1', token: 'tok-0123456789012345678901234567', expires: '2026-10-29' }) }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invites: list }) });
  });
  await page.goto('/admin/');
  await page.fill('#invite-label', 'Jörn');
  await page.selectOption('#invite-role', 'team');
  await page.click('#invite-form button[type=submit]');
  await expect(page.locator('#invite-result')).toBeVisible();
  await expect(page.locator('#invite-url')).toHaveValue(/\/anmelden\/\?einladung=tok-/);
  await expect(page.locator('#invite-list li')).toHaveCount(1);
  await page.locator('#invite-result').scrollIntoViewIfNeeded();
});
