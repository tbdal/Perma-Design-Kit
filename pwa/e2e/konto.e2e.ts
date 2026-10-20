// The account button at the far right (settings, phone sign-in, sign in / out), the QR code in
// Einstellungen → Anmeldung and the phone's side: /anmelden/?geraet=… signs in with the one-time code.
import { test, expect, stubNetwork } from './helpers';

test('account menu: settings for everyone, sign-in when logged out', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-mode', 'classic'); } catch { /* ignore */ } });
  await page.goto('/');
  await page.click('#user-toggle');
  await expect(page.locator('#user-menu')).toBeVisible();
  await expect(page.locator('#user-who')).toHaveText('Nicht angemeldet');
  await expect(page.locator('#user-login')).toBeVisible();
  await expect(page.locator('#user-phone')).toBeHidden();
  await page.click('#user-menu a[href="/settings"]');
  await expect(page).toHaveURL(/\/settings\/?$/);
  await expect(page.locator('#login-who')).toContainText('Nicht angemeldet');
  await expect(page.locator('#login-go')).toBeVisible();
  void errors;
});

test('logged in: initial on the button, QR code for the phone', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-mode', 'classic'); localStorage.setItem('pdk-auth', JSON.stringify({ name: 'Andi', role: 'team' })); } catch { /* ignore */ } });
  await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Andi', role: 'team' }) }));
  let asked = 0;
  await page.route('**/api/auth/device', r => { asked++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: `code-${asked}-abcdefghijklmnopqrstuvwxyz`, expires: new Date(Date.now() + 300_000).toISOString() }) }); });
  await page.goto('/');
  await expect(page.locator('#user-initial')).toHaveText('A');
  await page.click('#user-toggle');
  await expect(page.locator('#user-who')).toContainText('Andi');
  await page.click('#user-phone');
  await expect(page).toHaveURL(/\/settings\/?#login-section$/);
  await expect(page.locator('#login-who')).toContainText('Andi (Team)');
  await page.click('#login-phone');
  await expect(page.locator('#login-qr-box')).toBeVisible();
  await expect(page.locator('#login-qr-left')).toContainText(/noch \d+ s gültig/);
  await page.click('#login-qr-new');
  await expect.poll(() => asked).toBe(2);
  void errors;
});

test('the phone signs in with the code from the QR link', async ({ page, errors }) => {
  await stubNetwork(page);
  let body = '';
  let me = false;
  await page.route('**/api/auth/me', r => me ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Andi', role: 'team' }) }) : r.fulfill({ status: 401, body: '{}' }));
  await page.route('**/api/auth/device/redeem', r => { body = r.request().postData() ?? ''; me = true; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Andi', role: 'team' }) }); });
  await page.goto('/anmelden/?geraet=einmalcode-abcdefghijklmnopqrstuvw&next=/kalender');
  await expect(page).toHaveURL(/\/kalender\/?$/);
  expect(JSON.parse(body)).toEqual({ token: 'einmalcode-abcdefghijklmnopqrstuvw' });
  expect(await page.evaluate(() => localStorage.getItem('pdk-mode'))).toBe('team');
  void errors;
});

test('an old code says so', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.route('**/api/auth/device/redeem', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"invalid"}' }));
  await page.goto('/anmelden/?geraet=altcode-abcdefghijklmnopqrstuvwxyz');
  await expect(page.locator('#device-status')).toContainText('gilt nicht mehr');
  await expect(page).not.toHaveURL(/geraet=/);
  void errors;
});
