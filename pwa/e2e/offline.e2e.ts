import { test, expect, loadSamples, stubNetwork } from './helpers';

// The other specs block the service worker (it would fetch past their stubs).
// Here it is the subject: after one visit the whole app has to work offline.
test.use({ serviceWorkers: 'allow' });
// One after the other: the update test changes what the server sends as sw.js.
test.describe.configure({ mode: 'serial' });

/** Resolves once the service worker controls the page, i.e. the shell is stored. */
async function shellReady(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
}

test('after one visit every page opens offline, styled and with its scripts', async ({ page, context, errors }) => {
  await stubNetwork(page);
  await loadSamples(page);
  await shellReady(page);

  await context.setOffline(true);
  // Proof that the network is really gone, also for the service worker.
  expect(await page.evaluate(() => fetch('/api/features').then(r => r.status, () => 'offline'))).toBe('offline');

  // a page never visited before
  await page.goto('/gartenplan/');
  await expect(page.locator('html')).toHaveAttribute('data-mode', /.+/);                         // boot.js ran
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toContain('Archivo'); // stylesheet applied
  await expect(page.locator('a[data-nav="/gartenplan"]')).toHaveClass(/text-white/);              // Layout script ran

  // the plant page with a query string, the data stored before going offline,
  // and the 5 MB card template that was never used online
  await page.goto('/?view=cards');
  await expect(page.locator('#plant-list svg').first()).toBeAttached();

  for (const path of ['/kalender/', '/polykulturen/', '/settings/', '/hilfe/', '/teilen/']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('data-mode', /.+/);
  }

});

test('the manifest offers PNG icons and the page an Apple touch icon', async ({ page, request, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  const manifest = await (await request.get('/manifest.json')).json();
  const pngs = manifest.icons.filter((i: { type: string }) => i.type === 'image/png');
  expect(pngs.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of pngs) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect((await request.get(apple!)).status()).toBe(200);
  expect(errors).toEqual([]);
});

test('a new build waits, announces itself and takes over on "reload"', async ({ page, request, errors }) => {
  await stubNetwork(page);
  await page.goto('/');
  await shellReady(page);
  const before = await page.evaluate(() => caches.keys());
  await expect(page.locator('#update-banner')).toBeHidden();

  // The next deploy: same files, another build name in sw.js (scripts/serve-dist.mjs).
  await request.get('/__test/next-build?on=1');
  try {
    await page.reload();
    await expect(page.locator('#update-banner')).toBeVisible();
    // Until the user agrees, the tab keeps the shell it was loaded with.
    expect(await page.evaluate(() => caches.keys())).toEqual(expect.arrayContaining(before));

    await Promise.all([page.waitForEvent('load'), page.click('#update-reload')]);
    await expect(page.locator('#update-banner')).toBeHidden();
    const after = await page.evaluate(() => caches.keys());
    expect(after).toContain('pgd-nextbuild000');
    expect(after.filter(k => /^pgd-[0-9a-f]{12}$/.test(k))).toEqual([]);
  } finally {
    await request.get('/__test/next-build?on=0');
  }
  expect(errors).toEqual([]);
});
