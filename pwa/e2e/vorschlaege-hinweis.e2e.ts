// "Vorschläge" and "Funktions-Abdeckung" are always shown with a plan open; when off they say why.
import { test, expect, stubNetwork, loadSamples, withDb, planRecord } from './helpers';

test('planner: suggestions and function coverage stay visible and explain why they are off', async ({ page, errors: _errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  await withDb(page, `await put('gardenPlans', arg.plan);`, { plan: planRecord('leer', { name: 'Leer' }) });
  await page.goto('/gartenplan/?plan=leer');
  await expect(page.locator('#suggestions-section')).toBeVisible();
  await expect(page.locator('#suggestions-list')).toContainText('keine Pflanze im Plan');
  await expect(page.locator('#coverage-section')).toBeVisible();
  await expect(page.locator('#coverage-body')).toContainText('keine Einfärbung');
  // a colouring chosen: the hint gives way to the coverage itself
  await page.selectOption('#g-coverage', 'all');
  await expect(page.locator('#coverage-body')).not.toContainText('Nicht aktiv');
});
