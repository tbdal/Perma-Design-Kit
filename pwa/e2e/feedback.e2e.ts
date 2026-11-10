// Feedback button (bottom right): report a problem or hand in an idea.
import { test, expect, stubNetwork } from './helpers';

test('feedback button opens "Fehler melden" and "Idee einreichen" for the current page', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/kalender');
  const fab = page.locator('#feedback-fab');
  await fab.locator('summary').click();
  await expect(page.locator('#feedback-idea')).toBeVisible();
  await expect(page.locator('#feedback-mail')).toHaveAttribute('href', 'mailto:info@permadesignkit.org');
  await expect(page.locator('footer a[href^="/fehler-melden"]')).toHaveCount(0);
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

test('feedback "Stelle markieren": click a spot, say what, the report page arrives filled in', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.goto('/kalender');
  await page.locator('#feedback-fab summary').click();
  await page.click('#feedback-pick');
  await page.locator('h1').first().click(); // the spot
  await page.locator('dialog textarea').fill('Überschrift passt nicht');
  await page.getByRole('button', { name: 'Weiter zu den Details' }).click();
  await expect(page).toHaveURL(/\/fehler-melden\/\?from=%2Fkalender%2F&what=/);
  await expect(page.locator('#rp-what')).toHaveValue(/^Überschrift passt nicht\n\nStelle: h1\./);
  void errors;
});

test('planner on a phone: the feedback button is there, small and above the bottom corner (#592)', async ({ page, errors }) => {
  await stubNetwork(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/gartenplan');
  const fab = page.locator('#feedback-fab');
  await expect(fab).toBeVisible();
  await expect(fab).toHaveClass(/fab-compact/);
  await expect(fab.locator('summary span')).toBeHidden();
  const box = (await fab.boundingBox())!;
  expect(800 - (box.y + box.height)).toBeGreaterThan(70);
  await fab.locator('summary').click();
  await expect(page.locator('#feedback-bug')).toBeVisible();
  void errors;
});
