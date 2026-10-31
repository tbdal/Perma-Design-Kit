import { test, expect, stubNetwork, withDb, planRecord, openPlan } from './helpers';

// #7: a save still pending from the last edit (500 ms) must not bring a deleted plan back.
const change = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const i = document.getElementById('g-years') as HTMLInputElement;
  i.value = String(Number(i.value) + 3);
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new Event('change', { bubbles: true }));
});
const planIds = (page: import('@playwright/test').Page) => withDb<string[]>(page, `return (await all('gardenPlans')).map(p => p.id);`);

test('a plan deleted in the editor right after a change stays deleted', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('gone', { name: 'Weg' }) });
  await openPlan(page, 'gone');
  await change(page);
  await page.click('#btn-delete-plan');   // confirm() is accepted by the fixture
  await page.waitForTimeout(1000);
  expect(await planIds(page)).not.toContain('gone');
  await expect(page.locator('[data-plan-id="gone"]')).toBeHidden();   // the last tile stays in the hidden list when none are left
  expect(await page.evaluate(() => localStorage.getItem('pgd-gartenplan-view-gone'))).toBeNull();
  await page.reload();
  await expect(page.locator('[data-plan-id="gone"]')).toBeHidden();
  void errors;
});

test('a plan deleted from the list right after "back" stays deleted', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.p);`, { p: planRecord('gone2', { name: 'Weg 2' }) });
  await openPlan(page, 'gone2');
  await change(page);
  await page.click('#btn-back-to-list');
  await page.locator('[data-plan-id="gone2"] [data-plan-action="delete"]').click();
  await page.waitForTimeout(1000);
  expect(await planIds(page)).not.toContain('gone2');
  await expect(page.locator('[data-plan-id="gone2"]')).toBeHidden();
  void errors;
});

test('a plan deleted in another tab disappears from the open list', async ({ page, context, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await withDb(page, `await put('gardenPlans', arg.a); await put('gardenPlans', arg.b);`, { a: planRecord('keep'), b: planRecord('other') });
  await page.goto('/gartenplan');
  await expect(page.locator('[data-plan-id]')).toHaveCount(2);
  const tab = await context.newPage();
  await stubNetwork(tab);
  await tab.goto('/gartenplan');
  tab.on('dialog', d => d.accept());
  await tab.locator('[data-plan-id="other"] [data-plan-action="delete"]').click();
  await expect(page.locator('[data-plan-id]')).toHaveCount(1);
  void errors;
});
