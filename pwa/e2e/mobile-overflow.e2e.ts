// Issue #6: no horizontal page scroll on phones (360/375 px, touch). Each page gets one guard:
// document.documentElement.scrollWidth <= viewport width. Pages that still overflow are listed in KNOWN
// and marked test.fail(), so the suite stays green; once a fix lands that test "unexpectedly passes"
// and turns red — then delete its KNOWN entry. Every run also prints a table (scrollWidth, widest
// offending elements, nav clipping, banner height, plan tool rail share) for the issue's other points.
import { existsSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect, stubNetwork, loadSamples, withDb, planRecord } from './helpers';

const WIDTHS = [360, 375];
const PLAN_ID = 'mobil';
// Built with the private module? Team mode (field view) only exists then.
const HAS_EXPERT = existsSync(new URL('../dist/x', import.meta.url));

/** "<mode> <page>@<width>" → reason. Filled from the first run against main (2026-10-30). */
const KNOWN: Record<string, string> = Object.fromEntries((['simple', 'classic', 'team'] as const).flatMap(m => [
  [`${m} plan-editor@360`, 'phase B toolbar + years slider do not wrap (issue #6.1)'],
  [`${m} plan-editor@375`, 'phase B toolbar + years slider do not wrap (issue #6.1)'],
  [`${m} plants-cards@360`, 'cards toolbar output-format row does not wrap (issue #6.2)'],
  [`${m} plants-baumscheibe@360`, 'cards toolbar output-format row does not wrap (issue #6.2)'],
]));

type Row = { key: string; innerW: number; scrollW: number; offenders: string; extra: string };
const rows: Row[] = [];

type PageDef = { name: string; open: (page: Page) => Promise<void> };
const go = (url: string, wait?: string) => async (page: Page) => {
  await page.goto(url);
  if (wait) await expect(page.locator(wait).first()).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(600); // late layout: fonts, async renders
};
const PAGES: PageDef[] = [
  { name: 'plants-grid', open: go('/?view=grid', '#plant-list [data-id]') },
  { name: 'plants-list', open: go('/?view=list', '#plant-list [data-id]') },
  { name: 'plants-cards', open: go('/?view=cards', '#cards-toolbar') },
  { name: 'plants-baumscheibe', open: async page => {
    await go('/?view=cards', '#cards-toolbar')(page);
    await page.selectOption('#card-type-select', 'baumscheibe');
    await expect(page.locator('#plant-list svg').first()).toBeAttached({ timeout: 20000 });
    await page.waitForTimeout(800);
  } },
  { name: 'kalender', open: go('/kalender') },
  { name: 'polykulturen', open: go('/polykulturen') },
  { name: 'settings', open: go('/settings') },
  { name: 'teilen', open: go('/teilen') },
  { name: 'hilfe', open: go('/hilfe') },
  { name: 'gartenplan-liste', open: go('/gartenplan', `[data-plan-id="${PLAN_ID}"]`) },
  { name: 'plan-editor', open: async page => {
    await go('/gartenplan', `[data-plan-id="${PLAN_ID}"]`)(page);
    await page.click(`[data-plan-id="${PLAN_ID}"]`);
    await expect(page.locator('#phase-b')).not.toHaveClass(/hidden/);
    await page.waitForTimeout(1200);
  } },
  { name: 'first-visit-banners', open: async page => {
    // both banners need data; drop the "later" stamp that helpers.ts sets for every other test
    await page.addInitScript(() => { try { localStorage.removeItem('pdk-persist-later'); localStorage.removeItem('last-backup-at'); localStorage.removeItem('backup-reminder-dismissed-on'); } catch { /* ignore */ } });
    await go('/')(page);
    await page.waitForTimeout(800);
  } },
];

/** Page width, the outermost elements sticking out past the right edge, and the issue's specific measurements. */
function measure(page: Page, W: number) {
  // W = the screen width: with isMobile the layout viewport (innerWidth) grows to fit wide content
  return page.evaluate(W => {
    window.scrollTo(0, 0);
    const out = (el: Element) => el.getBoundingClientRect().right > W + 1;
    // an element inside a scroller/clipper that itself fits doesn't widen the page
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX !== 'visible' && !out(p)) return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll('body *')]
      .filter(el => { const r = el.getBoundingClientRect(); return (r.width || r.height) && out(el) && !(el.parentElement && out(el.parentElement)) && !clipped(el); })
      .map(el => { const r = el.getBoundingClientRect(); const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? '';
        const vis = el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) ? '' : ' (invisible)';
        return { right: Math.round(r.right), d: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 4).join('.') : ''} w=${Math.round(r.width)} r=${Math.round(r.right)}${vis}` }; })
      .sort((a, b) => b.right - a.right).slice(0, 4).map(o => o.d);
    const nav = document.getElementById('nav-links');
    const h = (id: string) => { const e = document.getElementById(id); return e && !e.hidden ? Math.round(e.getBoundingClientRect().height) : 0; };
    const rail = document.getElementById('zoom-controls');
    const railBox = rail?.offsetParent ? rail.getBoundingClientRect() : null;
    const canvas = rail?.parentElement?.getBoundingClientRect();
    const feld = document.querySelector('[data-f-dim]');
    return {
      innerW: window.innerWidth, scrollW: document.documentElement.scrollWidth, offenders,
      nav: nav ? `${nav.scrollWidth}/${nav.clientWidth}` : '-',
      banners: `${h('persist-banner')}+${h('backup-reminder')}px of ${window.innerHeight}`,
      rail: railBox && canvas ? `${Math.round(railBox.right - canvas.left)}/${Math.round(canvas.width)}px` : '-',
      feld: !!feld && (feld as HTMLElement).offsetParent !== null,
    };
  }, W);
}

for (const mode of ['simple', 'classic', 'team'] as const) {
  for (const width of WIDTHS) {
    test.describe(`${mode} @${width}`, () => {
      test.use({ viewport: { width, height: width === 360 ? 780 : 667 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

      for (const p of PAGES) {
        const key = `${mode} ${p.name}@${width}`;
        test(key, async ({ page, errors }) => {
          test.skip(mode === 'team' && !HAS_EXPERT, 'team mode needs the private module in dist/x');
          test.fail(key in KNOWN, KNOWN[key]);
          await stubNetwork(page);
          if (mode === 'team') await page.route('**/api/auth/me', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ name: 'Andi', role: 'team' }) }));
          await page.addInitScript(m => {
            try { localStorage.setItem('pdk-mode', m); if (m === 'team') localStorage.setItem('pdk-auth', JSON.stringify({ name: 'Andi', role: 'team' })); } catch { /* ignore */ }
          }, mode);
          await loadSamples(page);
          const ids = await withDb<string[]>(page, `return (await all('plants')).map(p => p.id);`);
          const placements = ids.flatMap((plantId, i) => [0, 1].map(j => ({ id: `pl${i}${j}`, plantId, xM: 6 + i * 8 + j * 3, yM: 6 + j * 5, notes: '' })));
          await withDb(page, `await put('gardenPlans', arg);`, planRecord(PLAN_ID, { placements }));
          await page.goto('about:blank');

          await p.open(page);
          const m = await measure(page, width);
          const extra = `nav ${m.nav}` + (p.name === 'first-visit-banners' ? `, banners ${m.banners}` : '')
            + (p.name === 'plan-editor' ? `, rail ${m.rail}${m.feld ? ', field view' : ''}` : '');
          rows.push({ key, innerW: m.innerW, scrollW: m.scrollW, offenders: m.offenders.join(' | '), extra });
          console.log(`${key}: scrollWidth ${m.scrollW} / innerWidth ${m.innerW}; ${extra}${m.offenders.length ? '\n    ' + m.offenders.join('\n    ') : ''}`);

          expect(m.scrollW, `page wider than the ${width}px screen`).toBeLessThanOrEqual(width);
          void errors;
        });
      }
    });
  }
}

test.afterAll(() => {
  if (!rows.length) return;
  console.log('\nmobile overflow (issue #6)\n' + rows.map(r =>
    `${r.key.padEnd(34)} ${String(r.scrollW).padStart(4)}/${r.innerW}  ${r.extra}${r.offenders ? '\n' + ' '.repeat(36) + r.offenders : ''}`).join('\n'));
});
