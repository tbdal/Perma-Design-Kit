import { savePlant } from './db';
import { createPlantFromSearch } from './enrich';
import { announce, escapeHtml } from './html';
import { createT, getLang } from './i18n/core';
import { searchDict } from './i18n/dict-search';
import { searchPlants } from './plant-search';
import type { PlantData } from './types';

// The plant search box (local list, Wikidata, PFAF/EFG proxy) with its result
// dropdown, keyboard navigation and "add" buttons. Used in the hero of the
// plant page and of the garden plan page; the page decides what happens
// after a plant was added (re-render the list, arm it for placing …).

export interface PlantSearchUiOptions {
  input: HTMLInputElement;
  button: HTMLButtonElement;
  results: HTMLElement;
  /** Current collection, for the "already in your list" hint. */
  plants: () => PlantData[];
  /** Called after a found plant was saved. */
  onAdded: (plant: PlantData) => void | Promise<void>;
}

export function initPlantSearchUi(o: PlantSearchUiOptions) {
  const t = createT(searchDict);
  const searchInput = o.input;
  const searchResults = o.results;
  let searchTimeout: ReturnType<typeof setTimeout>;
  // Keyboard navigation in the result list: ↑/↓ highlight a hit, Enter adds it.
  let activeResult = -1;

  function resultRows(): HTMLElement[] {
    return [...searchResults.querySelectorAll<HTMLElement>('[data-idx]')];
  }
  function setActiveResult(i: number) {
    const rows = resultRows();
    activeResult = rows.length ? (i + rows.length) % rows.length : -1;
    rows.forEach((r, k) => {
      const on = k === activeResult;
      r.classList.toggle('bg-green-50', on);
      r.classList.toggle('dark:bg-green-900/30', on);
      r.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) r.scrollIntoView({ block: 'nearest' });
    });
    if (activeResult >= 0) searchInput.setAttribute('aria-activedescendant', rows[activeResult].id);
    else searchInput.removeAttribute('aria-activedescendant');
  }

  async function doSearch() {
    activeResult = -1;
    searchInput.removeAttribute('aria-activedescendant');
    const q = searchInput.value.trim();
    if (q.length < 2) { searchResults.innerHTML = ''; searchResults.classList.add('hidden'); return; }
    searchResults.classList.remove('hidden');
    searchResults.innerHTML = `<p class="px-4 py-3 text-sm text-stone-500 dark:text-stone-400 animate-pulse">${escapeHtml(t('searchLoading'))}</p>`;
    try {
      const results = await searchPlants(q);
      if (results.length === 0) { searchResults.innerHTML = `<p class="px-4 py-3 text-sm text-stone-500 dark:text-stone-400">${escapeHtml(t('searchNoResults'))}</p>`; announce(t('searchNoResults')); return; }
      announce(t('searchResultsCount', { count: results.length }));
      // Same Latin name already in the collection (case-insensitive) — shown
      // as a hint, not a hard block, since a second entry can be legitimate
      // (e.g. a different cultivar tracked separately via varietyName).
      const existingLatin = new Set(o.plants().map(p => p.latinName.trim().toLowerCase()));
      const existingVariety = new Set(o.plants().map(p => `${p.latinName.trim().toLowerCase()}|${(p.varietyName ?? '').trim().toLowerCase()}`));
      searchResults.innerHTML = results.map((r, i) => {
        if (r.variety) {
          // Cultivar hit: added as its species with the variety filled in.
          const dupe = existingVariety.has(`${r.latinName.trim().toLowerCase()}|${r.variety.trim().toLowerCase()}`);
          return `
        <div id="search-result-${i}" role="option" aria-selected="false" class="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition" data-idx="${i}">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-stone-800 dark:text-stone-100">${escapeHtml(r.variety)}</p>
            <p class="truncate text-xs text-stone-500 dark:text-stone-400">${escapeHtml(t('searchVarietyOf'))} <span class="italic">${escapeHtml(r.latinName)}</span></p>
            ${dupe ? `<p class="text-xs font-medium text-amber-600 dark:text-amber-400">${escapeHtml(t('searchAlreadyAdded'))}</p>` : ''}
            <p class="import-status text-xs text-green-600"></p>
          </div>
          <button data-dupe="${dupe ? '1' : ''}" class="btn-add-result shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium shadow transition active:scale-95 ${dupe ? 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600' : 'bg-green-700 text-white hover:bg-green-800'}">${escapeHtml(dupe ? t('searchAddAnyway') : t('searchAddVariety'))}</button>
        </div>`;
        }
        const dupe = !!r.latinName && existingLatin.has(r.latinName.trim().toLowerCase());
        return `
        <div id="search-result-${i}" role="option" aria-selected="false" class="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800 transition" data-idx="${i}">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-stone-800 dark:text-stone-100">${escapeHtml((getLang() === 'en' ? r.commonNameEn : r.commonName) || r.latinName)}</p>
            ${r.latinName ? `<p class="truncate text-xs italic text-stone-500 dark:text-stone-400">${escapeHtml(r.latinName)}</p>` : ''}
            ${r.description ? `<p class="truncate text-xs text-stone-500 dark:text-stone-400">${escapeHtml(r.description)}</p>` : ''}
            ${dupe ? `<p class="text-xs font-medium text-amber-600 dark:text-amber-400">${escapeHtml(t('searchAlreadyAdded'))}</p>` : ''}
            <p class="import-status text-xs text-green-600"></p>
          </div>
          <button data-dupe="${dupe ? '1' : ''}" class="btn-add-result shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium shadow transition active:scale-95 ${dupe ? 'bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-600' : 'bg-green-700 text-white hover:bg-green-800'}">${escapeHtml(dupe ? t('searchAddAnyway') : t('searchAddResult'))}</button>
        </div>
      `;
      }).join('');

      searchResults.querySelectorAll('.btn-add-result').forEach((btn, idx) => {
        btn.addEventListener('click', async () => {
          const b = btn as HTMLButtonElement;
          const statusEl = b.closest('[data-idx]')?.querySelector('.import-status') as HTMLElement | null;
          if (b.dataset.dupe && !confirm(t('searchAddAnywayConfirm', { name: results[idx].variety || results[idx].commonName || results[idx].latinName }))) return;
          b.disabled = true;
          try {
            b.textContent = t('searchLoadingSources');
            const { plant, sourceLabels } = await createPlantFromSearch(results[idx]);
            if (results[idx].variety) {
              plant.varietyName = results[idx].variety!;
              plant._sources = { ...plant._sources, varietyName: 'manual' };
            }
            await savePlant(plant);
            await o.onAdded(plant);
            b.textContent = t('searchAdded');
            b.classList.replace('bg-green-700', 'bg-green-500');
            b.disabled = true;
            if (statusEl) statusEl.textContent = sourceLabels.length ? `${sourceLabels.join(' + ')}` : '';
          } catch {
            b.textContent = t('searchAddFailed');
            b.classList.replace('bg-green-700', 'bg-red-500');
          }
        });
      });
    } catch (err) {
      // Typing on cancels the previous search (AbortController in
      // searchPlants); the newer search renders its own results.
      if ((err as Error)?.name === 'AbortError') return;
      searchResults.innerHTML = `<p class="px-4 py-3 text-sm text-red-500">${escapeHtml(t('searchError', { error: String(err) }))}</p>`;
    }
  }

  o.button.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!resultRows().length) return;
      e.preventDefault();
      searchResults.classList.remove('hidden');
      setActiveResult(activeResult < 0 ? (e.key === 'ArrowDown' ? 0 : -1) : activeResult + (e.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = !searchResults.classList.contains('hidden') ? resultRows()[activeResult] : undefined;
      const btn = row?.querySelector<HTMLButtonElement>('.btn-add-result');
      if (btn) { if (!btn.disabled) btn.click(); return; }
      clearTimeout(searchTimeout);
      doSearch();
    }
    if (e.key === 'Escape') { searchResults.classList.add('hidden'); }
  });
  searchInput.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(doSearch, 300); });
  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target as Node) && e.target !== searchInput) {
      searchResults.classList.add('hidden');
    }
  });
}
