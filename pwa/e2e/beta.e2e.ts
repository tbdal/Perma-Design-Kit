import { test, expect, stubNetwork } from './helpers';

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('beta page: signup needs the terms, then asks to check the inbox', async ({ page }) => {
  await stubNetwork(page);
  let posted: Record<string, unknown> | null = null;
  await page.route('**/api/beta/status', r => r.fulfill(json({ frei: false, mail: true })));
  await page.route('**/api/beta/anmeldung', async r => { posted = r.request().postDataJSON(); await r.fulfill(json({ ok: true })); });
  await page.goto('/beta/');
  await expect(page.locator('#signup-full')).toBeVisible();
  await page.fill('#signup-email', 'anna@example.org');
  await page.click('#signup-submit');
  await expect(page.locator('#signup-status')).toContainText('Bedingungen');
  expect(posted).toBeNull();
  await page.selectOption('#signup-interest', 'privat');
  await page.check('#signup-accept');
  await page.click('#signup-submit');
  await expect(page.locator('#message-text')).toContainText('Postfach');
  expect(posted).toMatchObject({ email: 'anna@example.org', interest: 'privat', accepted: true, website: '' });
});

test('beta page: confirmation link, unsubscribe and survey; tokens leave the address bar', async ({ page }) => {
  await stubNetwork(page);
  await page.route('**/api/beta/bestaetigen', r => r.fulfill(r.request().postDataJSON().token === 'gut-gut-gut-gut-gut-gut-gut' ? json({ status: 'warteliste' }) : json({ error: 'invalid' }, 404)));
  await page.goto('/beta/?bestaetigen=gut-gut-gut-gut-gut-gut-gut');
  await expect(page.locator('#message-text')).toContainText('Warteliste');
  expect(page.url()).not.toContain('bestaetigen');
  await page.goto('/beta/?bestaetigen=schlecht');
  await expect(page.locator('#message-text')).toContainText('ungültig');

  let unsub: Record<string, unknown> | null = null;
  await page.route('**/api/beta/abmelden', async r => { unsub = r.request().postDataJSON(); await r.fulfill(json({ ok: true })); });
  await page.goto('/beta/?abmelden=abc.def');
  await page.check('#unsub-account');
  await page.click('#unsub-submit');
  await expect(page.locator('#message-text')).toContainText('gelöscht');
  expect(unsub).toEqual({ token: 'abc.def', konto: true });

  let survey: Record<string, unknown> | null = null;
  await page.route('**/api/beta/umfrage', async r => { survey = r.request().postDataJSON(); await r.fulfill(json({ ok: true })); });
  await page.goto('/beta/?umfrage=14&t=abc.def');
  await expect(page.locator('#view-survey')).toBeVisible();
  await page.fill('[data-q="Ausprobiert"]', 'Schichten');
  await page.selectOption('[data-q="Wert pro Jahr"]', 'bis 20 €');
  await page.click('#view-survey button[type=submit]');
  await expect(page.locator('#message-text')).toContainText('Danke');
  expect(survey).toMatchObject({ token: 'abc.def', kind: '14', answers: { Ausprobiert: 'Schichten', 'Wert pro Jahr': 'bis 20 €' } });
});

test('login page: password reset link sets a new password', async ({ page }) => {
  await stubNetwork(page);
  await page.route('**/api/auth/me', r => r.fulfill(json({ error: 'login' }, 401)));
  let sent: Record<string, unknown> | null = null;
  await page.route('**/api/beta/passwort-setzen', async r => { sent = r.request().postDataJSON(); await r.fulfill(json({ ok: true })); });
  await page.goto('/anmelden/?zuruecksetzen=ein-langer-token-ein-langer-token');
  await expect(page.locator('#reset-form')).toBeVisible();
  await expect(page.locator('#login-form')).toBeHidden();
  await page.fill('#reset-password', 'ein sehr langes passwort');
  await page.click('#reset-form button[type=submit]');
  await expect(page.locator('#login-error')).toContainText('neue Passwort gilt');
  expect(sent).toEqual({ token: 'ein-langer-token-ein-langer-token', password: 'ein sehr langes passwort' });
});

test('welcome page: "Neu im Beta-Test" with the tiles from the server, not part of the tour', async ({ page }) => {
  await stubNetwork(page);
  await page.route('**/api/beta/vorschau**', r => r.fulfill(json({ items: [
    { id: 'qgis', title: 'QGIS', text: 'Exportiere deinen Plan als GeoPackage.' },
    { id: 'schichten', title: 'Schichten', text: 'Sieh pro Polykultur, welche Schichten besetzt sind.' },
  ] })));
  await page.addInitScript(() => { try { localStorage.removeItem('pdk-welcome-seen'); } catch { /* ignore */ } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const box = page.locator('#welcome-modal #welcome-beta');
  await expect(box).toBeVisible();
  await expect(box.locator('.w-beta-item')).toHaveCount(2);
  await expect(box.locator('.w-beta-item').first()).toContainText('QGIS');
  await expect(box.locator('#welcome-beta-join')).toHaveAttribute('href', '/beta/');
  // the button top right scrolls to it
  await expect(page.locator('#welcome-beta-jump')).toContainText('Interesse an erweiterten Funktionen und Teilnahme am Beta-Test?');
  await page.click('#welcome-beta-jump');
  await expect(box).toBeInViewport();
  // the tour itself has no beta step
  await page.click('#welcome-next');
  const total = Number((await page.locator('#tour-progress').textContent())!.split('/')[1]);
  expect(total).toBe(7);
});

test('welcome page: without news the text and the button stay, only the tiles are missing', async ({ page }) => {
  await stubNetwork(page);
  await page.route('**/api/beta/vorschau**', r => r.fulfill(json({ items: [] })));
  await page.addInitScript(() => { try { localStorage.removeItem('pdk-welcome-seen'); } catch { /* ignore */ } });
  await page.goto('/');
  await expect(page.locator('#welcome-modal')).toBeVisible();
  await expect(page.locator('#welcome-beta')).toBeVisible();
  await expect(page.locator('#welcome-beta-jump')).toBeVisible();
  await expect(page.locator('#welcome-beta .w-beta-item')).toHaveCount(0);
  await expect(page.locator('#welcome-beta-examples')).toBeHidden();
});
