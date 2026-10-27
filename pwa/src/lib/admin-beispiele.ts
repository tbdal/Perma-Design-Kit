// Admin box on /admin/: manage the example polycultures ("Beispiele laden" on /polykulturen):
// show or hide, rename, reorder, remove, and add one from a polyculture of this browser. Server: server/beispiele.mjs.
import { escapeHtml } from './html';
import { getAllPlants, getAllPolycultures } from './db';
import { exampleFromPolyculture, type Example } from './beispiele';

const URL_ADMIN = '/api/admin/big/beispiele';
const T = {
  de: {
    title: 'Beispiel-Polykulturen', intro: 'Die Kacheln unter Polykulturen → „Beispiele laden“. Ausgeblendete sehen Nutzende nicht.',
    visible: 'sichtbar', name: 'Titel', desc: 'Beschreibung', image: 'Bild-Adresse (https)', up: 'Nach oben', down: 'Nach unten', del: 'Entfernen', delAsk: '„{t}“ aus den Beispielen entfernen?',
    save: 'Speichern', saved: 'Gespeichert.', failed: 'Speichern fehlgeschlagen ({e}).', loading: 'Lade …', none: 'Noch keine Beispiele.',
    addTitle: 'Aus einer Polykultur dieses Browsers hinzufügen', pick: 'Polykultur wählen …', add: 'Als Beispiel hinzufügen (zunächst ausgeblendet)', plants: '{n} Pflanzen',
    noLocal: 'In diesem Browser gibt es keine Polykultur mit Pflanzen.',
  },
  en: {
    title: 'Example polycultures', intro: 'The tiles under Polycultures → “Load examples”. Hidden ones are not shown to users.',
    visible: 'visible', name: 'Title', desc: 'Description', image: 'Image address (https)', up: 'Move up', down: 'Move down', del: 'Remove', delAsk: 'Remove “{t}” from the examples?',
    save: 'Save', saved: 'Saved.', failed: 'Saving failed ({e}).', loading: 'Loading …', none: 'No examples yet.',
    addTitle: 'Add from a polyculture of this browser', pick: 'Choose a polyculture …', add: 'Add as an example (hidden at first)', plants: '{n} plants',
    noLocal: 'This browser has no polyculture with plants.',
  },
};

export async function mountBeispieleAdmin(box: HTMLElement, lang: 'de' | 'en'): Promise<void> {
  const L = T[lang];
  const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
  const field = 'block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 px-2 py-1 text-sm';
  const btn = 'rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm ring-1 ring-stone-300 dark:ring-stone-600 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700';
  box.innerHTML = `<h2 class="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">${escapeHtml(L.title)}</h2>
    <p class="text-xs text-stone-500 dark:text-stone-400">${escapeHtml(L.intro)}</p>
    <ul data-bsp-list class="space-y-2"></ul>
    <div class="flex flex-wrap items-center gap-2"><button type="button" data-bsp-save class="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800">${escapeHtml(L.save)}</button><span data-bsp-status role="status" class="text-sm text-stone-600 dark:text-stone-300"></span></div>
    <div class="space-y-2 rounded-xl bg-white dark:bg-stone-800 p-3 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700">
      <p class="text-sm font-medium">${escapeHtml(L.addTitle)}</p>
      <select data-bsp-pick class="${field}"></select>
      <input data-bsp-img placeholder="${escapeHtml(L.image)}" class="${field}" />
      <button type="button" data-bsp-add class="${btn}">${escapeHtml(L.add)}</button>
    </div>`;
  const q = <E extends HTMLElement>(s: string) => box.querySelector<E>(s)!;
  const list = q('[data-bsp-list]'), status = q('[data-bsp-status]');
  let items: Example[] = [];
  const say = (t: string) => { status.textContent = t; };

  function render() {
    list.innerHTML = items.length ? '' : `<li class="text-sm text-stone-500">${escapeHtml(L.none)}</li>`;
    items.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'space-y-1.5 rounded-xl bg-white dark:bg-stone-800 p-3 shadow-sm ring-1 ring-stone-200 dark:ring-stone-700';
      li.innerHTML = `<div class="flex items-center gap-2">
          <label class="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" data-f="hidden" ${it.hidden ? '' : 'checked'} class="accent-green-700" />${escapeHtml(L.visible)}</label>
          <input data-f="title" value="${escapeHtml(it.title)}" maxlength="80" aria-label="${escapeHtml(L.name)}" class="${field} font-semibold" />
          <span class="shrink-0 text-xs text-stone-500">${escapeHtml(fmt(L.plants, { n: it.plants.length }))}</span>
          <button type="button" data-a="up" ${i ? '' : 'disabled'} title="${escapeHtml(L.up)}" class="px-1 disabled:opacity-30">↑</button>
          <button type="button" data-a="down" ${i < items.length - 1 ? '' : 'disabled'} title="${escapeHtml(L.down)}" class="px-1 disabled:opacity-30">↓</button>
          <button type="button" data-a="del" title="${escapeHtml(L.del)}" class="px-1 text-red-700 dark:text-red-300">✕</button></div>
        <textarea data-f="description" rows="2" maxlength="500" aria-label="${escapeHtml(L.desc)}" class="${field}">${escapeHtml(it.description)}</textarea>
        <input data-f="image" value="${escapeHtml(it.image)}" aria-label="${escapeHtml(L.image)}" placeholder="${escapeHtml(L.image)}" class="${field}" />`;
      li.addEventListener('input', e => {
        const el = e.target as HTMLInputElement;
        const f = el.dataset.f;
        if (f === 'hidden') it.hidden = !el.checked;
        else if (f === 'title' || f === 'description' || f === 'image') (it as unknown as Record<string, string>)[f] = el.value;
      });
      li.addEventListener('click', e => {
        const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
        if (!a) return;
        if (a === 'del') { if (!confirm(fmt(L.delAsk, { t: it.title }))) return; items.splice(i, 1); }
        else { const j = a === 'up' ? i - 1 : i + 1; [items[i], items[j]] = [items[j], items[i]]; }
        render();
      });
      list.appendChild(li);
    });
  }

  async function save() {
    say(L.loading);
    try {
      const res = await fetch(URL_ADMIN, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error(String(res.status));
      items = ((await res.json()) as { items: Example[] }).items;
      render(); say(L.saved);
    } catch (e) { say(fmt(L.failed, { e: e instanceof Error ? e.message : String(e) })); }
  }
  q('[data-bsp-save]').addEventListener('click', () => void save());

  // add from a local polyculture
  const pick = q<HTMLSelectElement>('[data-bsp-pick]');
  const [plants, polys] = await Promise.all([getAllPlants().catch(() => []), getAllPolycultures().catch(() => [])]);
  const byId = new Map(plants.map(p => [p.id, p]));
  const usable = polys.filter(pc => pc.anchorPlantId || pc.members.length);
  pick.innerHTML = `<option value="">${escapeHtml(usable.length ? L.pick : L.noLocal)}</option>` + usable.map(pc => `<option value="${escapeHtml(pc.id)}">${escapeHtml(pc.name || '–')}</option>`).join('');
  q('[data-bsp-add]').addEventListener('click', () => {
    const pc = usable.find(x => x.id === pick.value);
    const ex = pc && exampleFromPolyculture(pc, byId, q<HTMLInputElement>('[data-bsp-img]').value.trim());
    if (!ex) return;
    items.push(ex); render(); say('');
  });

  try {
    const res = await fetch(URL_ADMIN, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    items = ((await res.json()) as { items: Example[] }).items;
  } catch (e) { say(fmt(L.failed, { e: e instanceof Error ? e.message : String(e) })); }
  render();
}
