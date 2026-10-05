import { test as base, expect, type Page, type Route } from '@playwright/test';

// Shared setup for the browser tests: no welcome tour, no persistence banner,
// and every request leaving the preview server is stubbed — Wikidata, the
// plant proxy, Overpass, map/terrain tiles, the climate proxy. Tests that need
// specific answers register their own routes (page.route) before navigating;
// those take precedence over the defaults here.

export type Overrides = Partial<Record<'wikidataSearch' | 'wikidataEntities' | 'sparql' | 'overpass' | 'climate', (route: Route) => Promise<void> | void>>;

const json = (route: Route, body: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/58BAwAI/AL+hc2rNAAAAABJRU5ErkJggg==', 'base64');

export async function stubNetwork(page: Page, o: Overrides = {}) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('wikidata.org') && url.pathname === '/sparql') return o.sparql ? o.sparql(route) : json(route, { results: { bindings: [] } });
    if (url.hostname === 'www.wikidata.org') {
      const action = url.searchParams.get('action');
      if (action === 'query') return o.wikidataSearch ? o.wikidataSearch(route) : json(route, { query: { search: [] } });
      if (action === 'wbgetentities') return o.wikidataEntities ? o.wikidataEntities(route) : json(route, { entities: {} });
      if (action === 'wbsearchentities') return json(route, { search: [] });
      return json(route, {});
    }
    if (/overpass/.test(url.hostname)) return o.overpass ? o.overpass(route) : json(route, { elements: [] });
    if (/tile|maps\.eox|basemap|wms|wmts/.test(url.hostname + url.pathname)) return route.fulfill({ contentType: 'image/png', body: PNG_1PX });
    return route.fulfill({ status: 404, body: '' });
  });
  // Same-origin services that only exist behind nginx / the proxy process.
  await page.route('**/api/plant-proxy**', route => json(route, { latinName: '', source: '', sources: {} }));
  await page.route('**/geo/terrain/**', route => route.fulfill({ status: 404, body: '' }));
  await page.route(/\/geo\/climate(\?|$)/, route => (o.climate ? o.climate(route) : route.fulfill({ status: 404, body: '' })));
}

export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      try { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); } catch { /* ignore */ }
    });
    await use(errors);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});
export { expect };

/** Loads the two built-in sample plants through the UI. */
export async function loadSamples(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { (document.getElementById('data-menu') as HTMLDetailsElement).open = true; });
  await page.click('#btn-load-samples');
  await expect(page.locator('#plant-list [data-id]').first()).toBeAttached();
}

/** Loads the default species list (190 names) through the UI. */
export async function loadMasterList(page: Page) {
  await page.goto('/');
  await page.evaluate(() => { (document.getElementById('data-menu') as HTMLDetailsElement).open = true; });
  await page.click('#btn-load-master');
  await expect(page.locator('#plant-list [data-id]').first()).toBeAttached();
}

/** Runs `fn` with the app's IndexedDB inside the page. */
export function withDb<T>(page: Page, fn: string, arg?: unknown): Promise<T> {
  return page.evaluate(async ([src, a]) => {
    const req = indexedDB.open('permaculture-guilds');
    const db: IDBDatabase = await new Promise(r => { req.onsuccess = () => r(req.result); });
    const all = (store: string) => new Promise<any[]>(r => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); });
    const put = (store: string, v: unknown) => new Promise<void>(r => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(v); tx.oncomplete = () => r(); });
    // eslint-disable-next-line no-new-func
    return new Function('all', 'put', 'arg', `return (async () => { ${src} })()`)(all, put, a);
  }, [fn, arg] as const) as Promise<T>;
}

/** A plan object in the stored shape. */
export function planRecord(id: string, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id, name: id, description: '', polycultureId: null, areaWidthM: 30, areaHeightM: 20, gridSpacingM: 1,
    boundary: [{ xM: 1, yM: 1 }, { xM: 29, yM: 1 }, { xM: 29, yM: 19 }, { xM: 1, yM: 19 }],
    placements: [], yearsSincePlanting: 10, notes: '', geo: null, areas: [], createdAt: now, updatedAt: now, ...extra,
  };
}

export async function openPlan(page: Page, id: string) {
  await page.goto('/gartenplan');
  await page.click(`[data-plan-id="${id}"]`);
  await expect(page.locator('#phase-b')).not.toHaveClass(/hidden/);
}
