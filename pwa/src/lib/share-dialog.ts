// "Projekt als Link teilen": the dialog lives where sharing happens (plan, polyculture — #4),
// not among the backup settings. Data goes into the link's #fragment (share.ts), never to a server.
// Very long links may be cut off by messengers, hence the size hint.
import { createT, applyStaticI18n, getLang } from './i18n/core';
import { shareDict } from './i18n/dict-share';
import { escapeHtml, withButtonSpinner } from './html';
import { getAllPlants, getAllPolycultures, getAllGardenPlans } from './db';
import { LAST_PLAN_KEY, readPlanView } from './plan-view';

const SHARE_LONG_LINK = 8000;
const BTN = 'rounded-lg bg-stone-100 dark:bg-stone-700 px-3 py-1.5 text-sm font-medium text-stone-700 dark:text-stone-200 ring-1 ring-stone-300 dark:ring-stone-600 hover:bg-stone-200 dark:hover:bg-stone-600';

const MARKUP = `
  <div class="space-y-3 p-5">
    <h2 id="share-title" class="text-base font-semibold" data-i18n="shareTitle"></h2>
    <p class="text-xs text-stone-600 dark:text-stone-300" data-i18n="shareIntro"></p>
    <fieldset class="space-y-1.5 text-sm">
      <label class="flex items-center gap-2"><input id="share-polycultures" type="checkbox" checked class="accent-green-600" /> <span data-i18n="shareIncludePolycultures"></span></label>
      <label class="flex items-center gap-2"><input id="share-gardenplans" type="checkbox" checked class="accent-green-600" /> <span data-i18n="shareIncludeGardenPlans"></span></label>
      <label class="flex items-center gap-2"><input id="share-notes" type="checkbox" checked class="accent-green-600" /> <span data-i18n="shareIncludeNotes"></span></label>
      <label class="flex items-start gap-2"><input id="share-views" type="checkbox" checked class="mt-1 accent-green-600" /> <span><span data-i18n="shareIncludeViews"></span><br /><span class="text-xs text-stone-500 dark:text-stone-400" data-i18n="shareViewsHint"></span></span></label>
      <label class="flex flex-wrap items-center gap-2 pl-6 text-xs"><span data-i18n="shareStartPlan"></span>
        <select id="share-start" class="rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-1 text-xs"></select>
      </label>
      <label class="flex items-start gap-2"><input id="share-location" type="checkbox" class="mt-1 accent-green-600" /> <span><span data-i18n="shareIncludeLocation"></span><br /><span class="text-xs text-stone-500 dark:text-stone-400" data-i18n="shareLocationHint"></span></span></label>
    </fieldset>
    <div id="share-result" hidden class="space-y-2">
      <textarea id="share-url" readonly rows="3" data-i18n-aria-label="shareTitle" class="block w-full resize-none break-all rounded-md border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-900 px-2.5 py-1.5 font-mono text-[11px]"></textarea>
      <p id="share-size" class="text-xs text-stone-500 dark:text-stone-400"></p>
      <div class="flex flex-wrap gap-2">
        <button id="share-copy" type="button" data-i18n="shareCopy" class="${BTN}"></button>
        <button id="share-native" type="button" hidden data-i18n="shareNative" class="${BTN}"></button>
      </div>
    </div>
    <div class="flex justify-end gap-2 pt-1">
      <button id="share-close" type="button" data-i18n="shareClose" class="${BTN}"></button>
      <button id="share-create" type="button" data-i18n="shareCreate" class="rounded-lg bg-green-700 px-4 py-1.5 text-sm font-medium text-white shadow hover:bg-green-800"></button>
    </div>
  </div>`;

let dialog: HTMLDialogElement | null = null;

function build(): HTMLDialogElement {
  const t = createT(shareDict);
  const dlg = document.createElement('dialog');
  dlg.id = 'share-dialog';
  dlg.setAttribute('aria-labelledby', 'share-title');
  dlg.className = 'm-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl bg-white dark:bg-stone-800 p-0 text-stone-800 dark:text-stone-100 shadow-2xl backdrop:bg-black/50';
  dlg.innerHTML = MARKUP;
  document.body.append(dlg);
  applyStaticI18n(shareDict);

  const $ = <T extends HTMLElement>(id: string) => dlg.querySelector<T>(`#${id}`)!;
  const urlEl = $<HTMLTextAreaElement>('share-url');
  const result = $('share-result');
  const native = $<HTMLButtonElement>('share-native');
  const opts = ['share-polycultures', 'share-gardenplans', 'share-notes', 'share-location', 'share-views'].map(id => $<HTMLInputElement>(id));
  const start = $<HTMLSelectElement>('share-start');
  const copy = $<HTMLButtonElement>('share-copy');
  const hideResult = () => { result.hidden = true; };
  start.addEventListener('change', hideResult);
  opts.forEach(o => o.addEventListener('change', hideResult));
  $('share-close').addEventListener('click', () => dlg.close());
  $('share-create').addEventListener('click', async (e) => {
    await withButtonSpinner(e.currentTarget as HTMLButtonElement, async () => {
      const [incPoly, incPlans, incNotes, incLoc, incViews] = opts.map(o => o.checked);
      const { encodeShare, shareUrl } = await import('./share');
      const [plants, polycultures, gardenPlans] = await Promise.all([
        getAllPlants(), incPoly ? getAllPolycultures() : Promise.resolve([]), incPlans ? getAllGardenPlans() : Promise.resolve([]),
      ]);
      const views = Object.fromEntries(gardenPlans.map(g => [g.id, readPlanView(g.id)]).filter(([, v]) => v));
      const startPlan = start.value ? { planId: start.value } : null;
      const data = await encodeShare({ plants, polycultures, gardenPlans, views, start: startPlan }, { includeNotes: incNotes, includeLocation: incLoc, includeViews: incViews });
      const url = shareUrl(location.origin, data);
      urlEl.value = url;
      const kb = new Intl.NumberFormat(getLang(), { maximumFractionDigits: 1 }).format(url.length / 1024);
      $('share-size').textContent = t(url.length > SHARE_LONG_LINK ? 'shareSizeLong' : 'shareSize', { kb, plants: plants.length });
      native.hidden = !('share' in navigator);
      copy.textContent = t('shareCopy');
      result.hidden = false;
      urlEl.select();
    });
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(urlEl.value); copy.textContent = t('shareCopied'); }
    catch { urlEl.focus(); urlEl.select(); } // clipboard blocked: leave it selected for Ctrl+C
  });
  native.addEventListener('click', async () => {
    try { await navigator.share({ title: 'Perma Design Kit', url: urlEl.value }); }
    catch (err) { if ((err as Error).name !== 'AbortError') alert(String(err)); }
  });
  return dlg;
}

/** Opens the dialog; `startPlanId` preselects the plan that opens after importing (default: the last opened one). */
export async function openShareDialog(startPlanId?: string): Promise<void> {
  dialog ??= build();
  const t = createT(shareDict);
  const start = dialog.querySelector<HTMLSelectElement>('#share-start')!;
  dialog.querySelector<HTMLElement>('#share-result')!.hidden = true;
  const plans = await getAllGardenPlans();
  let last: string | null = startPlanId ?? null;
  if (!last) { try { last = localStorage.getItem(LAST_PLAN_KEY); } catch { /* ignore */ } }
  start.innerHTML = `<option value="">${escapeHtml(t('shareStartNone'))}</option>`
    + plans.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || '—')}</option>`).join('');
  start.value = plans.some(p => p.id === last) ? last! : (plans[0]?.id ?? '');
  dialog.showModal();
}
