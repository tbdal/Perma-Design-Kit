// Polyculture editor: a filled role stays in the suggestions (collapsed, ✓), so a second species of it can still be added.
import { test, expect, stubNetwork, withDb, loadSamples } from './helpers';

test('polycultures: a filled role keeps its suggestions, collapsed', async ({ page, errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  // a third plant, so the companion role has a candidate left
  const ids = await withDb<string[]>(page, `const ps = await all('plants'); await put('plants', { ...ps[1], id: 'dritte', latinName: 'Tertia planta' }); return [...ps.map(p => p.id), 'dritte'];`);
  const now = '2026-01-01T00:00:00Z';
  await withDb(page, `await put('polycultures', arg);`, {
    id: 'pc', name: 'Test', description: '', anchorPlantId: ids[0], members: [{ plantId: ids[1], role: 'companion', notes: '' }], notes: '', createdAt: now, updatedAt: now });
  await page.goto('/polykulturen/');
  await page.click('[data-polyculture-id="pc"]');
  const filled = page.locator('#suggestions details', { hasText: '✓ Begleiter' });
  await expect(filled).toHaveCount(1);
  await filled.locator('> summary').click();
  await filled.locator('[data-add-plant]').first().click();
  await expect(page.locator('#member-list [data-remove-idx]')).toHaveCount(2);
  void errors;
});
