// Aufgabe 435: plants show their plans, "Plan" filter on the plants page,
// and the one-step way plant → polyculture → plan (GitHub issue 3).
import { test, expect, stubNetwork, loadSamples, withDb, planRecord } from './helpers';

async function seed(page: import('@playwright/test').Page) {
  await loadSamples(page); // the two sample plants keep this light (the VPS runs the tests in 4 GB)
  return withDb<{ apple: string; walnut: string }>(page, `
    const plants = await all('plants');
    const a = plants.find(x => x.latinName === 'Acer saccharum');
    const w = plants.find(x => x.latinName === 'Symphytum officinale');
    a.heightM = 6; a.widthM = 6; a.habit = 'tree'; w.heightM = 1; w.widthM = 0.6; w.habit = 'herb';
    await put('plants', a); await put('plants', w);
    const P = (id, p, x, extra = {}) => ({ id, plantId: p, xM: x, yM: 3, notes: '', ...extra });
    await put('gardenPlans', { ...arg.plan, placements: [P('a1', a.id, 6, { plantedYear: 2025 }), P('a2', a.id, 12), P('w1', w.id, 20), P('gone', 'imp-weg', 25)] });
    return { apple: a.id, walnut: w.id };
  `, { plan: planRecord('gs', { name: 'Garten Süd' }) });
}

test('plants show their plans; the Plan filter arranges the list; a chip opens the plan with the plant selected', async ({ page, errors }) => {
  await stubNetwork(page);
  const ids = await seed(page);
  await page.goto('/');
  const apple = page.locator(`#plant-list [data-id="${ids.apple}"]`).first();
  await expect(apple.getByText('Garten Süd · 2 (1 gepflanzt)')).toBeVisible();

  await page.selectOption('#filter-plan', 'gs');
  await expect(page.locator('#plant-list')).toContainText('Im Plan 2 · nicht im Plan');
  await expect(page.locator('#plant-list')).toContainText('4 gesetzt · 1 gepflanzt');
  const inPlan = page.locator('[data-plan-group="in"]');
  await expect(inPlan).not.toHaveAttribute('open', '');
  await inPlan.locator(':scope > summary').click();
  await page.locator('[data-plan-group="in-tree"] > summary').click();
  await expect(inPlan).toContainText('1× gesetzt, aber nicht in deiner Liste');
  // the open groups are remembered
  await page.reload();
  await expect(page.locator('[data-plan-group="in"]')).toHaveAttribute('open', '');

  await page.locator(`[data-plan-group="in-tree"] [data-id="${ids.apple}"] a`).click();
  await expect(page).toHaveURL(/\/gartenplan\/\?plan=gs$/);
  await expect(page.locator('#selected-panel')).toContainText('2');
  void errors;
});

test('plant → polyculture with it as anchor → fill roles → place in the plan as a package', async ({ page, errors }) => {
  await stubNetwork(page);
  const ids = await seed(page);
  await page.goto('/');
  await page.locator(`#plant-list [data-id="${ids.apple}"] .btn-edit`).first().click();
  await page.click('#btn-anchor-polyculture');
  await expect(page).toHaveURL(/\/polykulturen\/$/);
  await expect(page.locator('#polyculture-editor-view')).toBeVisible();
  await expect(page.locator('#g-anchor')).toHaveValue(ids.apple);
  await page.click('#btn-autofill');
  await expect(page.locator('#member-list .member-role').first()).toBeVisible();
  await page.selectOption('#place-plan', 'gs');
  await page.click('#btn-place-in-plan');

  await expect(page).toHaveURL(/\/gartenplan\/\?plan=gs$/);
  await expect(page.locator('#pkg-hint')).toBeVisible();
  const before = await page.locator('[data-placement-id]').count();
  // the plan is fitted into the canvas: its middle (15 m, 10 m) is the canvas middle, away from the plants at the top
  await page.locator('#plan-svg').evaluate(el => el.scrollIntoView({ block: 'center' }));
  const box = (await page.locator('#plan-svg').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.locator('[data-placement-id]').count()).toBeGreaterThan(before + 1);
  await expect.poll(() => withDb<number>(page, `return (await all('gardenPlans'))[0].placements.filter(p => p.packageId).length;`)).toBeGreaterThan(1);

  // one plant of the package → "Ganzes Paket markieren"
  const pkgPlacement = await withDb<string>(page, `return (await all('gardenPlans'))[0].placements.find(p => p.packageId).id;`);
  await page.locator('body').press('Escape');
  await page.locator(`[data-placement-id="${pkgPlacement}"] .marker-blob`).click({ force: true });
  await page.click('#btn-select-package');
  await expect(page.locator('#selected-panel')).not.toContainText('Ganzes Paket');

  // the polyculture knows where it stands
  await page.goto('/polykulturen');
  await expect(page.locator('#polyculture-list')).toContainText('In Plänen: Garten Süd 1×');
  void errors;
});
