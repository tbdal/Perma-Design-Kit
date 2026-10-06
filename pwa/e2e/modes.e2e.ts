import { test, expect, stubNetwork, loadMasterList, withDb, planRecord, openPlan } from './helpers';
import type { Page } from '@playwright/test';

const months = (...m: number[]) => Array.from({ length: 12 }, (_, i) => m.includes(i));

/** Black walnut next to an apple: one tree layer filled and a "bad neighbours" hint. */
async function seedPlan(page: Page) {
  await loadMasterList(page);
  await withDb(page, `
    const plants = await all('plants');
    const set = async (n, f) => { const p = plants.find(x => x.latinName === n); Object.assign(p, f); await put('plants', p); return p; };
    const w = await set('Juglans nigra', { heightM: 25, widthM: 15, eatable: true, fruitMonths: arg.m9, habit: 'tree' });
    const a = await set('Malus domestica', { heightM: 6, widthM: 6, eatable: true, fruitMonths: arg.m9, habit: 'tree' });
    const P = (id, p, x, y) => ({ id, plantId: p.id, xM: x, yM: y, notes: '' });
    await put('gardenPlans', { ...arg.plan, placements: [P('w', w, 8, 8), P('a', a, 16, 10)] });
  `, { m9: months(9), plan: planRecord('mp', { yearsSincePlanting: 15 }) });
}

const setMode = (page: Page, mode: string) =>
  page.addInitScript(m => { try { localStorage.setItem('pdk-mode', m); } catch { /* ignore */ } }, mode);

test('new visitors start in simple mode; returning ones keep the full app', async ({ browser }) => {
  const fresh = await browser.newPage();
  await stubNetwork(fresh);
  await fresh.goto('/');
  await expect(fresh.locator('html')).toHaveAttribute('data-mode', 'simple');
  expect(await fresh.evaluate(() => localStorage.getItem('pdk-mode'))).toBe('simple');
  await fresh.close();
});

test('simple mode: steps, layers and one tip instead of the tool boxes', async ({ page, errors }) => {
  await stubNetwork(page);
  await setMode(page, 'simple');
  await seedPlan(page);
  await openPlan(page, 'mp');
  await expect(page.locator('#guide-steps')).toBeVisible();
  await expect(page.locator('#guide-steps [data-step="1"]')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#guide-steps [data-step="2"]')).toHaveAttribute('data-state', 'done');
  await expect(page.locator('#guide-steps [data-step="3"]')).toHaveAttribute('data-state', 'now');
  await expect(page.locator('#guide-stats')).toContainText('2 Pflanzen · 1 von 5 Schichten');
  await expect(page.locator('#guide-tip')).toContainText('Juglon');
  await expect(page.locator('#guide-tip-show')).toBeVisible();
  for (const sel of ['#btn-draw-area', '#btn-draw-row', '#tool-lasso', '#tool-measure', '#btn-export-pdf', '#g-coverage', '#warnings-section', '[data-panel="areas"]']) {
    await expect(page.locator(sel), sel).toBeHidden();
  }
  // shortcuts of hidden tools do nothing
  await page.locator('#plan-svg').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('f');
  await expect(page.locator('#area-draw-bar')).toBeHidden();

  // switch to classic from the header menu: everything is back, no reload
  await page.click('#mode-toggle');
  await page.click('[data-mode-opt="classic"]');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'classic');
  await expect(page.locator('#btn-draw-area')).toBeVisible();
  await expect(page.locator('#tool-lasso')).toBeVisible();
  await expect(page.locator('#guide-steps')).toBeHidden();
  await expect(page.locator('#simple-guide')).toBeHidden();
  await expect(page.locator('#warnings-section')).toBeVisible();
  void errors;
});

test('expert mode needs a login', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/gartenplan');
  await page.click('#mode-toggle');
  await expect(page.locator('#mode-expert-lock')).toBeVisible();
  await page.click('[data-mode-opt="expert"]');
  await expect(page).toHaveURL(/\/anmelden\/\?next=%2Fgartenplan(%2F)?&mode=expert/);
  await page.route('**/api/auth/login', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"credentials"}' }));
  await page.fill('#login-name', 'Ann');
  await page.fill('#login-password', 'falsch-falsch');
  await page.click('#login-submit');
  await expect(page.locator('#login-error')).toContainText('stimmt nicht');
  void errors;
});

test('admin overrides from the server apply; admin page edits them', async ({ page, errors }) => {
  await stubNetwork(page);
  await setMode(page, 'simple');
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/auth/me', r => r.fulfill(json({ name: 'Ann', role: 'admin' })));
  await page.route('**/api/features', r => r.fulfill(json({ features: { areas: ['simple', 'classic', 'expert', 'team'] } })));
  await page.route('**/api/admin/users', r => r.fulfill(json({ users: [{ name: 'Ann', role: 'admin', created: '2026-10-05T00:00:00Z' }] })));
  let saved: unknown = null;
  await page.route('**/api/admin/features', async r => {
    saved = r.request().postDataJSON();
    await r.fulfill(json(saved));
  });
  await seedPlan(page);
  await openPlan(page, 'mp');
  // "Flächen" is switched on for simple mode by the admin
  await expect(page.locator('#btn-draw-area')).toBeVisible();
  await expect(page.locator('#tool-lasso')).toBeHidden();

  await page.goto('/admin/');
  await expect(page.locator('#admin-body')).toBeVisible();
  await expect(page.locator('#user-list')).toContainText('Ann');
  // water: also on in simple mode; zones: off everywhere ("Aus")
  await page.check('input[data-id="zones"][data-off]');
  await expect(page.locator('input[data-id="zones"][data-mode="classic"]')).not.toBeChecked();
  // the planner group folds, and "Alle" switches the whole group
  await expect(page.locator('[data-group-box="gartenplan"] summary')).toContainText('Waldgartenplan');
  await page.check('input[data-group="gartenplan"][data-mode="simple"]');
  await expect(page.locator('input[data-id="lasso"][data-mode="simple"]')).toBeChecked();
  await page.uncheck('input[data-group="gartenplan"][data-mode="simple"]');
  await expect(page.locator('input[data-id="lasso"][data-mode="simple"]')).not.toBeChecked();
  await page.check('input[data-id="water"][data-mode="simple"]');
  await page.click('[data-group-box="gartenplan"] summary');
  await expect(page.locator('input[data-id="water"][data-mode="simple"]')).toBeHidden();
  await page.click('[data-group-box="gartenplan"] summary');
  await page.click('#features-save');
  await expect(page.locator('#features-status')).toContainText('Übernommen');
  // "Alle" off in simple also took the guide and the server's "areas" override out of simple mode
  expect(saved).toEqual({ features: { 'simple-guide': [], water: ['simple', 'classic', 'expert', 'team'], zones: [] } });
  void errors;
});
