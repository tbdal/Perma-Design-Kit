// Polycultures list: sort by name or creation date, both ways; the choice stays.
import { test, expect, stubNetwork, withDb, loadSamples } from './helpers';

test('polycultures: sort by name and by creation date, kept after a reload', async ({ page, errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  const pc = (id: string, name: string, createdAt: string) => ({ id, name, description: '', anchorPlantId: null, members: [], notes: '', createdAt, updatedAt: createdAt });
  await withDb(page, `for (const p of arg) await put('polycultures', p);`, [
    pc('b', 'Birnen-Gilde', '2026-03-01T00:00:00Z'), pc('a', 'apfel-Gilde', '2026-01-01T00:00:00Z'), pc('c', 'Cassis', '2026-02-01T00:00:00Z')]);
  await page.goto('/polykulturen/');
  const names = () => page.locator('#polyculture-list h3').allTextContents();
  await expect.poll(names).toEqual(['apfel-Gilde', 'Birnen-Gilde', 'Cassis']);   // default: name A–Z, case ignored
  await page.selectOption('#poly-sort', 'name-desc');
  await expect.poll(names).toEqual(['Cassis', 'Birnen-Gilde', 'apfel-Gilde']);
  await page.selectOption('#poly-sort', 'created-desc');
  await expect.poll(names).toEqual(['Birnen-Gilde', 'Cassis', 'apfel-Gilde']);
  await page.selectOption('#poly-sort', 'created-asc');
  await expect.poll(names).toEqual(['apfel-Gilde', 'Cassis', 'Birnen-Gilde']);
  await page.reload();
  await expect(page.locator('#poly-sort')).toHaveValue('created-asc');
  await expect.poll(names).toEqual(['apfel-Gilde', 'Cassis', 'Birnen-Gilde']);
  void errors;
});
