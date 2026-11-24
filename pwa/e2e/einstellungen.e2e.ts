// Einstellungen (#727): grouped sections with a search, and every field saves on change (no save button).
import { test, expect, stubNetwork } from './helpers';

test('settings: search hides other cards and groups, fields save right away', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.addInitScript(() => { try { localStorage.setItem('pdk-mode', 'classic'); } catch { /* ignore */ } });
  await page.goto('/settings/');
  await expect(page.locator('#g-oberflaeche h2')).toHaveText('Oberfläche');
  await expect(page.locator('#btn-save')).toHaveCount(0);
  await expect(page.locator('#stats-plants')).not.toHaveText('…');   // page script has run

  await page.fill('#settings-search', 'nextcloud');
  await expect(page.locator('#daten-section')).toBeVisible();
  await expect(page.locator('#einstieg')).toBeHidden();
  await expect(page.locator('#g-konto')).toBeHidden();
  await page.fill('#settings-search', 'xyzzy');
  await expect(page.locator('#settings-no-hit')).toContainText('xyzzy');
  await page.fill('#settings-search', '');
  await expect(page.locator('#einstieg')).toBeVisible();

  await page.check('input.theme-radio[value="dark"]');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.selectOption('#default-view', 'list');
  await expect(page.locator('#toast')).toHaveText('Gespeichert');
  await page.reload();
  await expect(page.locator('#default-view')).toHaveValue('list');
  await expect(page.locator('input.theme-radio[value="dark"]')).toBeChecked();
  void errors;
});
