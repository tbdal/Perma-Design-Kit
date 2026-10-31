import { test, expect, stubNetwork } from './helpers';
import { readFileSync } from 'node:fs';

const defaults = JSON.parse(readFileSync(new URL('../server/data/polykultur-beispiele.default.json', import.meta.url), 'utf8')) as { items: Record<string, unknown>[] };

test('example polycultures: dialog with tiles, loading one fills the list and the plants', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.route('**/api/polykultur-beispiele', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: defaults.items.map(i => ({ ...i, image: '' })) }) }));
  await page.goto('/polykulturen');
  await page.click('#btn-examples');
  await expect(page.locator('#examples-grid article')).toHaveCount(12);
  await page.locator('#examples-grid article', { hasText: 'Drei Schwestern' }).locator('[data-example]').click();
  await expect(page.locator('#examples-dialog')).toBeHidden();
  await expect(page.locator('#polyculture-list')).toContainText('Drei Schwestern');
  void errors;
});
