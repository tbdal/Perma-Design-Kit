// Feedback button (bottom right): report a problem or hand in an idea.
import { test, expect, stubNetwork } from './helpers';

test('feedback button opens "Fehler melden" and "Idee einreichen" for the current page', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/kalender');
  const fab = page.locator('#feedback-fab');
  await fab.locator('summary').click();
  await expect(page.locator('#feedback-idea')).toBeVisible();
  await page.screenshot({ path: 'test-results/feedback-open.png' });
  await page.click('#feedback-idea');
  await expect(page).toHaveURL(/\/fehler-melden\/\?art=idee&from=%2Fkalender/);
  await expect(page.locator('h1')).toHaveText('Idee einreichen');
  await expect(page.locator('#rp-filebox')).toBeHidden();
  await expect(page.locator('#rp-page')).toHaveValue(/^\/kalender\/?$/);
  await expect(page.locator('#feedback-fab')).toBeHidden();
  await page.screenshot({ path: 'test-results/feedback-idea.png', fullPage: true });
  void errors;
});
