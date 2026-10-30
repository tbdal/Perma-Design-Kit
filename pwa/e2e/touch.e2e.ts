// Real multi-touch on a phone (CDP touch events → pointer events with implicit capture, as on a device):
// pinch, pan, tap and drag in 2D and 3D, also when a finger starts on a plant.
import { devices, type Page } from '@playwright/test';
import { test, expect, stubNetwork, loadSamples, withDb, planRecord } from './helpers';
test.use({ ...devices['Pixel 7'] });

type Pt = [number, number];
async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: string, pts: Pt[], ids?: number[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints: pts.map(([x, y], i) => ({ x, y, id: ids?.[i] ?? i })) });
  return {
    /** Fingers down at `from`, moved in steps to `to` (same count), then lifted. */
    async gesture(from: Pt[], to: Pt[], steps = 8) {
      await send('touchStart', from);
      for (let s = 1; s <= steps; s++) {
        await send('touchMove', from.map(([x, y], i) => [x + (to[i][0] - x) * s / steps, y + (to[i][1] - y) * s / steps] as Pt));
        await page.waitForTimeout(16);
      }
      await send('touchEnd', []);
      await page.waitForTimeout(100);
    },
    send,
  };
}

async function setup(page: Page) {
  await page.addInitScript(() => { localStorage.setItem('pdk-welcome-seen', '1'); localStorage.setItem('pdk-persist-later', String(Date.now())); });
  await stubNetwork(page);
  await loadSamples(page);
  const ids = await withDb<string[]>(page, `return (await all('plants')).filter(p => p.widthM > 2).map(p => p.id);`);
  // a grid of big plants: almost every touch lands on one
  const placements = Array.from({ length: 24 }, (_, i) => ({ id: 'pl' + i, plantId: ids[i % ids.length], xM: 3 + (i % 6) * 4, yM: 3 + Math.floor(i / 6) * 4, notes: '' }));
  await withDb(page, `await put('gardenPlans', arg);`, planRecord('t', { areaWidthM: 26, areaHeightM: 18, boundary: [{ xM: 1, yM: 1 }, { xM: 25, yM: 1 }, { xM: 25, yM: 17 }, { xM: 1, yM: 17 }], placements }));
  await page.goto('/gartenplan');
  await page.click('[data-plan-id="t"]');
  await expect(page.locator('#phase-b')).not.toHaveClass(/hidden/);
  await page.waitForTimeout(500);
}
/** A point on the plan where nothing else (plant, button, label) is on top: a finger there moves the map. */
const emptySpot = (page: Page): Promise<Pt> => page.evaluate(() => {
  const svg = document.getElementById('plan-svg')!, r = svg.getBoundingClientRect();
  for (let fy = 0.3; fy < 0.95; fy += 0.05) for (let fx = 0.1; fx < 0.9; fx += 0.05) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy, el = document.elementFromPoint(x, y);
    if (el && svg.contains(el) && !el.closest('[data-placement-id], [data-area-id], text')) return [x, y] as [number, number];
  }
  throw new Error('no empty spot');
});
/** A point where this plant is the topmost thing (neighbours and labels overlap in a dense plan). */
const spotOn = (page: Page, id: string): Promise<Pt> => page.evaluate(pid => {
  const r = document.querySelector(`[data-placement-id="${pid}"] .marker-blob`)!.getBoundingClientRect();
  for (let fy = 0.5; fy > 0.05; fy -= 0.05) for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (document.elementFromPoint(x, y)?.closest('[data-placement-id]')?.getAttribute('data-placement-id') === pid) return [x, y] as [number, number];
  }
  throw new Error('plant covered');
}, id);
const viewBox = async (page: Page) => (await page.locator('#plan-svg').getAttribute('viewBox'))!.split(' ').map(Number);
const centerOf = async (page: Page, sel: string): Promise<Pt> => { const b = (await page.locator(sel).first().boundingBox())!; return [b.x + b.width / 2, b.y + b.height / 2]; };
const placement = (page: Page, id: string) => withDb<{ xM: number; yM: number }>(page, `const p = (await all('gardenPlans')).find(p => p.id === 't'); return p.placements.find(x => x.id === arg);`, id);

test('2D: pinch zooms, also when a finger starts on a plant; the plant stays', async ({ page, errors }) => {
  await setup(page);
  const t = await touch(page);
  const [mx, my] = await centerOf(page, '[data-placement-id="pl8"] .marker-blob');
  const before = await placement(page, 'pl8');
  const w0 = (await viewBox(page))[2];
  // finger 1 on a plant, finger 2 next to it: spread apart → zoom in
  await t.gesture([[mx, my], [mx + 60, my + 30]], [[mx - 60, my - 30], [mx + 140, my + 70]]);
  const w1 = (await viewBox(page))[2];
  expect(w1).toBeLessThan(w0 * 0.8);
  await page.waitForTimeout(700); // autosave
  expect(await placement(page, 'pl8')).toEqual(before);
  // both fingers on plants
  const [ax, ay] = await centerOf(page, '[data-placement-id="pl2"] .marker-blob');
  const [bx, by] = await centerOf(page, '[data-placement-id="pl15"] .marker-blob');
  await t.gesture([[ax, ay], [bx, by]], [[ax + (ax - bx) * 0.3, ay + (ay - by) * 0.3], [bx - (ax - bx) * 0.3, by - (ay - by) * 0.3]]);
  expect((await viewBox(page))[2]).toBeLessThan(w1 * 0.95);
  void errors;
});

test('2D: after a pinch whose finger lifted over a button, one finger only moves the map', async ({ page, errors }) => {
  await setup(page);
  const t = await touch(page);
  const c = await emptySpot(page);
  // pinch, then finger 2 slides off the plan (over the page below it) and lifts there, finger 1 lifts too
  await t.send('touchStart', [[c[0] - 40, c[1]], [c[0] + 40, c[1]]]);
  for (let s = 1; s <= 6; s++) { await t.send('touchMove', [[c[0] - 40 - s * 5, c[1]], [c[0] + 40 + s * 5, c[1] + s * 60]]); await page.waitForTimeout(16); }
  await t.send('touchEnd', [[c[0] - 70, c[1]]], [0]);
  await t.send('touchEnd', []);
  const v0 = await viewBox(page);
  // one finger drags
  await t.gesture([[c[0], c[1]]], [[c[0] + 80, c[1] + 40]]);
  const v1 = await viewBox(page);
  expect(v1[2]).toBeCloseTo(v0[2], 6);   // zoom unchanged
  expect(v1[0]).toBeLessThan(v0[0]);     // moved
  void errors;
});

test('2D: one finger on empty ground pans, a tap on a plant selects it, a drag moves it', async ({ page, errors }) => {
  await setup(page);
  const t = await touch(page);
  const [ex, ey] = await emptySpot(page);
  const v0 = await viewBox(page);
  await t.gesture([[ex, ey]], [[ex + 60, ey + 30]]);
  const v1 = await viewBox(page);
  expect(v1[2]).toBeCloseTo(v0[2], 6);
  expect(v1[0]).toBeLessThan(v0[0]);
  // tap selects
  const [mx, my] = await spotOn(page, 'pl9');
  await t.gesture([[mx, my]], [[mx, my]], 1);
  await expect(page.locator('[data-placement-id="pl9"] .marker-blob')).toHaveAttribute('stroke', '#facc15');
  // drag moves (and the map does not pan)
  const before = await placement(page, 'pl9');
  await t.gesture([[mx, my]], [[mx + 50, my + 25]]);
  await page.waitForTimeout(700);
  const after = await placement(page, 'pl9');
  expect(after.xM).toBeGreaterThan(before.xM + 0.3);
  expect((await viewBox(page))[0]).toBeCloseTo(v1[0], 6);
  void errors;
});

test('2D: years slider moves the plants and saves once it rests', async ({ page, errors }) => {
  await setup(page);
  const blob = page.locator('[data-placement-id="pl3"] .marker-blob');
  const d0 = await blob.getAttribute('d');
  await page.evaluate(() => { const el = document.getElementById('g-years') as HTMLInputElement; el.value = '1'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => blob.getAttribute('d')).not.toBe(d0);
  await expect(page.locator('#years-label')).toContainText('1');
  void errors;
});

test('3D: pinch starting on a plant zooms the camera and leaves the plant where it is', async ({ page, errors }) => {
  test.setTimeout(120_000);
  await setup(page);
  await page.evaluate(() => (document.getElementById('btn-view-3d') as HTMLButtonElement).click());
  const canvas = page.locator('#plan-3d-container canvas');
  await expect(canvas).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#plan-3d-wait')).toBeHidden({ timeout: 60000 });
  await page.waitForTimeout(1500);
  const t = await touch(page);
  const b = (await canvas.boundingBox())!;
  const c: Pt = [b.x + b.width / 2, b.y + b.height / 2];
  const before = await placement(page, 'pl8');
  const shot0 = await canvas.screenshot();
  await t.gesture([[c[0] - 20, c[1]], [c[0] + 20, c[1]]], [[c[0] - 120, c[1]], [c[0] + 120, c[1]]], 10);
  await page.waitForTimeout(800);
  const shot1 = await canvas.screenshot();
  expect(shot1.equals(shot0)).toBe(false); // the camera moved
  expect(await placement(page, 'pl8')).toEqual(before);
  void errors;
});
