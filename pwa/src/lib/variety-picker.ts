import { getVarietyLists } from './db';
import { escapeHtml } from './html';
import type { PlantData } from './types';
import { fetchWikidataVarieties, filterVarietyOptions, speciesKey, varietyOptions, type VarietyOption } from './varieties';

// "Sorte wählen" in the plant editor: a button inside the variety field opens
// a panel listing the varieties for the plant's species — own names (used on
// other plants of the species), every enabled variety list (Einstellungen →
// Sortenlisten) and, when no list knows the species, a live Wikidata query.
// Typing in the field itself keeps working; the panel is only a picking aid.

export interface VarietyPickerDeps {
  input: HTMLInputElement;
  latinInput: HTMLInputElement;
  plants: () => PlantData[];
  wikidataEnabled: () => boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const MAX_SHOWN = 200;

export function initVarietyPicker(d: VarietyPickerDeps) {
  const { input, latinInput, t } = d;
  const wrap = document.createElement('div');
  wrap.className = 'relative mt-0.5';
  input.parentElement!.insertBefore(wrap, input);
  wrap.appendChild(input);
  input.classList.remove('mt-0.5');
  input.classList.add('pr-9');
  input.setAttribute('autocomplete', 'off');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'absolute inset-y-0 right-0 flex w-8 items-center justify-center rounded-r-md text-stone-500 hover:bg-stone-100 hover:text-green-700 dark:text-stone-400 dark:hover:bg-stone-700';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = t('varietyPickTitle');
  btn.setAttribute('aria-label', t('varietyPickTitle'));
  btn.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4" aria-hidden="true"><path d="M4 6h12M4 10h12M4 14h7"/><path d="M14 13l2 2 2-2"/></svg>';
  wrap.appendChild(btn);

  const panel = document.createElement('div');
  panel.hidden = true;
  panel.className = 'absolute left-0 right-0 top-full z-50 mt-1 min-w-64 rounded-lg bg-white p-2 shadow-lg ring-1 ring-stone-200 dark:bg-stone-800 dark:ring-stone-700';
  panel.innerHTML = `
    <input type="search" class="vp-filter mb-1.5 block w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm focus:border-green-500 focus:outline-none dark:border-stone-600 dark:bg-stone-900" placeholder="${escapeHtml(t('varietyFilter'))}" aria-label="${escapeHtml(t('varietyFilter'))}" />
    <p class="vp-status px-1 pb-1 text-[11px] text-stone-500 dark:text-stone-400"></p>
    <ul class="vp-list max-h-64 overflow-y-auto text-sm" role="listbox"></ul>`;
  wrap.appendChild(panel);
  const filter = panel.querySelector<HTMLInputElement>('.vp-filter')!;
  const status = panel.querySelector<HTMLElement>('.vp-status')!;
  const list = panel.querySelector<HTMLUListElement>('.vp-list')!;

  const liveCache = new Map<string, VarietyOption[]>();
  let options: VarietyOption[] = [];
  let active = -1;
  let loadToken = 0;

  async function load() {
    const token = ++loadToken;
    const latin = latinInput.value.trim();
    if (!latin) { options = []; status.textContent = t('varietyNeedLatin'); render(); return; }
    const key = speciesKey(latin);
    const own = d.plants().filter(p => p.varietyName && speciesKey(p.latinName) === key).map(p => p.varietyName);
    const lists = await getVarietyLists().catch(() => []);
    if (token !== loadToken) return;
    options = varietyOptions(latin, lists, own, t('varietyOwn'));
    const fromLists = options.some(o => o.group !== t('varietyOwn'));
    render();
    if (fromLists || !d.wikidataEnabled()) {
      status.textContent = options.length ? t('varietyCount', { n: options.length }) : t('varietyNone');
      return;
    }
    // No list knows this species: ask Wikidata for it directly.
    let live = liveCache.get(key);
    if (!live) {
      status.textContent = t('varietyLoading');
      try {
        live = (await fetchWikidataVarieties([key])).map(e => ({ name: e.name, group: 'Wikidata', synonyms: e.synonyms, wikidataId: e.wikidataId }));
        liveCache.set(key, live);
      } catch {
        if (token === loadToken) status.textContent = options.length ? t('varietyCount', { n: options.length }) : t('varietyFailed');
        return;
      }
    }
    if (token !== loadToken) return;
    const seen = new Set(options.map(o => o.name.toLowerCase()));
    options = [...options, ...live.filter(o => !seen.has(o.name.toLowerCase()))];
    status.textContent = options.length ? t('varietyCount', { n: options.length }) : t('varietyNone');
    render();
  }

  function render() {
    const shown = filterVarietyOptions(options, filter.value);
    active = Math.min(active, shown.length - 1);
    let group = '';
    const html: string[] = [];
    shown.slice(0, MAX_SHOWN).forEach((o, i) => {
      if (o.group !== group) {
        group = o.group;
        html.push(`<li role="presentation" class="sticky top-0 bg-white px-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400 dark:bg-stone-800">${escapeHtml(group)}</li>`);
      }
      const syn = o.synonyms?.length ? `<span class="ml-1 text-xs text-stone-400">(${escapeHtml(o.synonyms.slice(0, 2).join(', '))})</span>` : '';
      html.push(`<li role="option" data-i="${i}" aria-selected="${i === active}" class="cursor-pointer rounded px-2 py-1 text-stone-700 hover:bg-green-50 aria-selected:bg-green-100 dark:text-stone-200 dark:hover:bg-green-900/40 dark:aria-selected:bg-green-900/60">${escapeHtml(o.name)}${syn}</li>`);
    });
    if (shown.length > MAX_SHOWN) html.push(`<li role="presentation" class="px-2 py-1 text-xs text-stone-500">${escapeHtml(t('varietyMore', { n: shown.length - MAX_SHOWN }))}</li>`);
    list.innerHTML = html.join('');
    list.querySelectorAll<HTMLElement>('[data-i]').forEach(li => li.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus, pick on mousedown so blur doesn't close first
      pick(shown[Number(li.dataset.i)]);
    }));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  function pick(o: VarietyOption | undefined) {
    if (!o) return;
    input.value = o.name;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    input.focus();
  }

  function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    filter.value = '';
    active = -1;
    void load();
    filter.focus();
  }
  function close() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  filter.addEventListener('input', () => { active = 0; render(); });
  filter.addEventListener('keydown', (e: KeyboardEvent) => {
    const n = Math.min(MAX_SHOWN, filterVarietyOptions(options, filter.value).length);
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(n - 1, active + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(filterVarietyOptions(options, filter.value)[Math.max(0, active)]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); btn.focus(); }
  });
  // Esc in the field closes the panel, not the whole dialog.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });
  document.addEventListener('mousedown', e => { if (!panel.hidden && !wrap.contains(e.target as Node)) close(); });

  return {
    /** Call when the dialog opens or the plant changes. */
    reset() { close(); loadToken++; },
  };
}
