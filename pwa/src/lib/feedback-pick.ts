import { getLang } from './i18n/core';

// Feedback → "Stelle markieren": click the spot that is wrong, say what in a small popup,
// and the report page opens with the text and the spot already filled in (?what=&spot=).

/** Short, readable description of an element: tag#id.class "text". */
export function describeSpot(el: Element): string {
  const cls = [...el.classList].filter(c => /^[\w-]{1,30}$/.test(c)).slice(0, 2).map(c => `.${c}`).join('');
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
  return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}${text ? ` „${text}“` : ''}`;
}

export function reportUrl(what: string, spot: string): string {
  const from = encodeURIComponent(location.pathname + location.search);
  return `/fehler-melden/?from=${from}&what=${encodeURIComponent(what.slice(0, 500))}&spot=${encodeURIComponent(spot.slice(0, 200))}`;
}

export function startPick(): void {
  const de = getLang() === 'de';
  const hint = document.createElement('div');
  hint.textContent = de ? 'Klick auf die Stelle, die nicht stimmt. Esc bricht ab.' : 'Click the spot that is wrong. Esc cancels.';
  hint.className = 'fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-sm text-white shadow-xl';
  document.body.append(hint);
  let last: HTMLElement | null = null;
  const mark = (el: HTMLElement | null) => { if (last) last.style.outline = ''; last = el; if (el) el.style.outline = '3px solid #d97706'; };
  const over = (e: MouseEvent) => { const t = e.target as HTMLElement; mark(t === hint ? null : t); };
  const stop = () => { mark(null); hint.remove(); document.removeEventListener('mouseover', over, true); document.removeEventListener('click', pick, true); document.removeEventListener('keydown', key, true); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
  const pick = (e: MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const spot = describeSpot(e.target as Element);
    stop();
    ask(spot, de);
  };
  document.addEventListener('mouseover', over, true);
  document.addEventListener('click', pick, true);
  document.addEventListener('keydown', key, true);
}

function ask(spot: string, de: boolean) {
  const dlg = document.createElement('dialog');
  dlg.className = 'w-[min(26rem,calc(100vw-2rem))] rounded-xl bg-white p-4 text-sm text-stone-800 shadow-2xl backdrop:bg-black/40 dark:bg-stone-900 dark:text-stone-100';
  const field = 'mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-800';
  dlg.innerHTML = `<form method="dialog" class="space-y-3">
    <p class="text-xs text-stone-500 dark:text-stone-400"></p>
    <label class="block font-medium">${de ? 'Was stimmt hier nicht?' : 'What is wrong here?'}<textarea rows="3" class="${field}"></textarea></label>
    <div class="flex flex-wrap justify-end gap-2">
      <button value="cancel" class="rounded-lg px-3 py-1.5 ring-1 ring-stone-300 dark:ring-stone-600">${de ? 'Abbrechen' : 'Cancel'}</button>
      <button value="go" class="rounded-lg bg-green-700 px-3 py-1.5 font-medium text-white hover:bg-green-800">${de ? 'Weiter zu den Details' : 'Continue to details'}</button>
    </div></form>`;
  dlg.querySelector('p')!.textContent = `${de ? 'Stelle' : 'Spot'}: ${spot}`; // textContent: page text must not become markup
  const ta = dlg.querySelector('textarea')!;
  dlg.addEventListener('close', () => { if (dlg.returnValue === 'go') location.href = reportUrl(ta.value.trim(), spot); dlg.remove(); });
  document.body.append(dlg);
  dlg.showModal();
  ta.focus();
}
