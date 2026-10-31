// GitHub issue 12: with many plants the Baumscheibe card view built one huge HTML string (a ~5 MB SVG per plant)
// and hung with "Invalid string length". Cards now render one by one when they scroll into view.
import { test, expect, loadMasterList } from './helpers';

test('Baumscheibe cards with 190 plants: the first ones render, no page error', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await loadMasterList(page);
  await page.click('#btn-view-cards');
  await page.selectOption('#card-type-select', 'baumscheibe');
  // the first card is a real SVG soon; cards far below stay placeholders until scrolled to
  await expect(page.locator('#plant-list [data-id] svg').first()).toBeAttached({ timeout: 30_000 });
  const placeholders = await page.locator('#plant-list [data-bs-slot]').count();
  expect(placeholders).toBeGreaterThan(50);
  void errors; // the fixture fails the test on any uncaught page error
});
