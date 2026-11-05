// Strg+O (⌘O): one search over everything the current page offers — pages, menus, buttons, switches, choices,
// fields, sections — plus what a page registers itself (its plants, plans, polycultures). Built from the live DOM
// each time it opens, so it follows feature switches, modes and the page state without a list to maintain.
// The planner's own Strg+K (expert, planer-neu) stays as it is; this is the site-wide successor, tried out on Strg+O.

export interface PaletteCommand { label: string; group: string; run: () => void; keywords?: string }
type T = (key: string, vars?: Record<string, string | number>) => string;

const providers: (() => PaletteCommand[])[] = [];
/** A page adds its own entries (e.g. one per plant); called on every opening. */
export function registerCommands(fn: () => PaletteCommand[]): void { providers.push(fn); }

/** Lower case without accents, so "kalender" finds "Kalender" and "plantas" "Plantas". */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Every query word has to occur; a label starting with the query ranks first, then word starts, then the rest. */
export function rank(cmds: PaletteCommand[], query: string): PaletteCommand[] {
  const q = norm(query.trim());
  if (!q) return cmds;
  const words = q.split(/\s+/);
  return cmds
    .map((c, i) => {
      const label = norm(c.label), hay = `${label} ${norm(c.group)} ${norm(c.keywords ?? '')}`;
      if (!words.every(w => hay.includes(w))) return null;
      const score = label.startsWith(q) ? 0 : new RegExp(`(^|[\\s(«“„/-])${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(label) ? 1 : label.includes(words[0]) ? 2 : 3;
      return { c, score, i };
    })
    .filter((x): x is { c: PaletteCommand; score: number; i: number } => !!x)
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .map(x => x.c);
}

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Text with a space between the parts (a title and its description in two spans stay readable). */
const textOf = (el: Element) => {
  const parts: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!n.parentElement?.closest('svg, [aria-hidden="true"], .sr-only')) parts.push(n.textContent ?? '');
  return clean(parts.join(' '));
};
const named = (el: Element) => clean(el.getAttribute('aria-label'))
  || clean((el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => (id && document.getElementById(id)?.textContent) || '').join(' '));

function labelOf(el: HTMLElement): string {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const lab = el.closest('label') ?? (el.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`) : null);
    return textOf(lab ?? el) || named(el) || clean(el.title);
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const lab = el.closest('label') ?? (el.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(el.id)}"]`) : null);
    const own = el instanceof HTMLSelectElement ? '' : el.placeholder;
    const labText = lab ? clean([...lab.childNodes].filter(n => !(n instanceof HTMLSelectElement || n instanceof HTMLInputElement)).map(n => n.textContent).join(' ')) : '';
    return named(el) || labText || clean(own) || clean(el.title);
  }
  const text = textOf(el);
  // icon-only buttons (✕, ⋮, ↻ …) and the logo say what they do in aria-label/title
  const name = named(el) || (text.length <= 3 ? clean(el.title) : '');
  if (name) return name;
  return text.length > 70 ? `${text.slice(0, 67)}…` : text;
}

/** A hidden menu that opens from a toggle: offered with its items (clicking a hidden item works as well). */
function menuToggle(el: HTMLElement): HTMLElement | null {
  const id = el.id;
  if (!id) return null;
  return document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(id)}"]`)
    ?? (id.endsWith('-menu') ? document.getElementById(id.replace(/-menu$/, '-toggle')) : null);
}

/**
 * Whether the page really offers `el` right now; closed <details> and pop-up menus count as offered (their
 * content is one click away), closed dialogs, switched-off features and state-hidden parts do not.
 * Returns the context names on the way (menu, box) for the group line, or null.
 */
function offered(el: HTMLElement, palette: HTMLElement): string[] | null {
  if (palette.contains(el) || (el as HTMLButtonElement).disabled || el.closest('[aria-hidden="true"], [inert], template')) return null;
  const ctxNames: string[] = [];
  for (let a: HTMLElement | null = el; a && a !== document.body; a = a.parentElement) {
    if (a instanceof HTMLDialogElement && !a.open) return null;
    const parent = a.parentElement;
    if (parent instanceof HTMLDetailsElement && a.tagName !== 'SUMMARY') {
      const sum = parent.querySelector(':scope > summary');
      const name = clean(sum?.querySelector('.title, h2, h3')?.textContent ?? sum?.textContent);
      if (name && name.length < 60) ctxNames.push(name);
      if (!parent.open) continue; // the closed box's content: one click away
    }
    const st = getComputedStyle(a);
    if (st.display === 'none' || a.hidden) {
      const toggle = menuToggle(a);
      if (toggle && toggle.checkVisibility?.() !== false) { ctxNames.push(labelOf(toggle)); continue; }
      return null;
    }
    if (st.visibility === 'hidden' && a === el) return null;
  }
  return ctxNames;
}

export function installCommandPalette(t: T): void {
  const dlg = document.createElement('dialog');
  dlg.className = 'cmdk';
  dlg.setAttribute('aria-label', t('cmdkTitle'));
  dlg.innerHTML = `<label class="cmdk-in"><span aria-hidden="true">⌕</span><input type="search" autocomplete="off" spellcheck="false" /></label><ul role="listbox"></ul><p class="cmdk-foot"></p>`;
  const style = document.createElement('style');
  style.textContent = `
    dialog.cmdk { width: min(40rem, calc(100vw - 2rem)); max-height: min(34rem, calc(100vh - 6rem)); margin: 12vh auto auto; padding: 0; border: 0; border-radius: .9rem;
      background: #fff; color: #1c1917; box-shadow: 0 20px 60px rgb(0 0 0 / .35); overflow: hidden; }
    dialog.cmdk[open] { display: flex; flex-direction: column; }
    dialog.cmdk::backdrop { background: rgb(0 0 0 / .35); }
    html.dark dialog.cmdk { background: #1c1917; color: #f5f5f4; }
    .cmdk-in { display: flex; align-items: center; gap: .6rem; padding: .8rem 1rem; border-bottom: 1px solid rgb(120 113 108 / .25); font-size: 1.15rem; }
    .cmdk-in input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font-size: 1rem; }
    dialog.cmdk ul { margin: 0; padding: .35rem; list-style: none; overflow-y: auto; flex: 1; }
    dialog.cmdk li { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .45rem .7rem; border-radius: .5rem; cursor: pointer; font-size: .9rem; }
    dialog.cmdk li small { flex-shrink: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #78716c; font-size: .75rem; }
    dialog.cmdk li[aria-selected="true"] { background: #dcfce7; }
    html.dark dialog.cmdk li[aria-selected="true"] { background: #14532d; }
    html.dark dialog.cmdk li small { color: #a8a29e; }
    dialog.cmdk li.cmdk-none { cursor: default; color: #78716c; }
    .cmdk-foot { margin: 0; padding: .45rem 1rem; border-top: 1px solid rgb(120 113 108 / .25); font-size: .72rem; color: #78716c; }`;
  document.head.appendChild(style);
  document.body.appendChild(dlg);
  const input = dlg.querySelector('input')!, list = dlg.querySelector('ul')!;
  input.placeholder = t('cmdkPlaceholder');
  input.setAttribute('aria-label', t('cmdkTitle'));
  dlg.querySelector('.cmdk-foot')!.textContent = t('cmdkFoot');
  let all: PaletteCommand[] = [], hits: PaletteCommand[] = [], pick = 0;

  /** Opens closed boxes around `el` and brings it into view. */
  const reveal = (el: HTMLElement) => {
    for (let d = el.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  function collect(): PaletteCommand[] {
    const out: PaletteCommand[] = [];
    const seen = new Set<string>();
    const add = (c: PaletteCommand) => {
      if (!c.label || c.label.length < 2) return;
      const key = `${norm(c.label)}|${norm(c.group)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c);
    };
    for (const fn of providers) { try { fn().forEach(add); } catch (err) { console.warn('palette provider failed', err); } }
    const groupFor = (names: string[], kind: string) => [kind, ...names.slice(0, 2).reverse()].filter(Boolean).join(' · ');

    // Pages: header menu and footer links (feature-hidden ones are not offered).
    for (const a of document.querySelectorAll<HTMLAnchorElement>('header a[href], footer a[href]')) {
      if (a.closest('[id$="-menu"]') || !offered(a, dlg)) continue;
      const label = labelOf(a);
      if (label) add({ label, group: t('cmdkGPage'), run: () => a.click() });
    }
    // Everything you can press, switch or choose.
    for (const el of document.querySelectorAll<HTMLElement>('button, a[href], summary, [role="button"], [role="menuitem"], input, select, textarea')) {
      if (el.closest('header a[href], footer a[href]') === el) continue;
      const names = offered(el, dlg);
      if (!names) continue;
      if (el instanceof HTMLSelectElement) {
        const name = labelOf(el);
        for (const o of el.options) {
          if (o.disabled || o.hidden || !clean(o.textContent)) continue;
          add({ label: `${name ? `${name}: ` : ''}${clean(o.textContent)}${el.value === o.value ? ` (${t('cmdkCurrent')})` : ''}`, group: groupFor(names, t('cmdkGChoice')),
            run: () => { reveal(el); el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } });
        }
        continue;
      }
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const label = labelOf(el);
        if (label) add({ label: `${label} (${el.checked ? t('cmdkOn') : t('cmdkOff')})`, group: groupFor(names, t('cmdkGSwitch')), run: () => { reveal(el); el.click(); } });
        continue;
      }
      if (el instanceof HTMLInputElement && ['hidden', 'file', 'reset', 'image', 'color'].includes(el.type)) continue;
      if ((el instanceof HTMLInputElement && !['submit', 'button'].includes(el.type)) || el instanceof HTMLTextAreaElement) {
        const label = labelOf(el);
        if (label) add({ label, group: groupFor(names, t('cmdkGField')), run: () => { reveal(el); setTimeout(() => el.focus(), 0); } });
        continue;
      }
      const label = el instanceof HTMLInputElement ? clean(el.value) || labelOf(el) : labelOf(el);
      if (!label) continue;
      const kind = el.tagName === 'SUMMARY' ? t('cmdkGSection') : el.tagName === 'A' ? t('cmdkGLink') : t('cmdkGAction');
      add({ label, group: groupFor(names, kind), run: () => {
        if (el.tagName === 'SUMMARY') { const d = el.parentElement as HTMLDetailsElement; reveal(el); d.open = true; return; }
        el.click();
      } });
    }
    // Headings with an anchor (help chapters, settings sections): jump there.
    for (const h of document.querySelectorAll<HTMLElement>('main :is(h2, h3, h4)[id], main section[id] > :is(h2, h3)')) {
      const names = offered(h, dlg);
      if (!names) continue;
      add({ label: clean(h.textContent), group: groupFor(names, t('cmdkGSection')), run: () => reveal(h) });
    }
    return out;
  }

  /** No hit in the own entries: the plant database search of the page (Pflanzen, Waldgartenplan). */
  function dbSearch(q: string): PaletteCommand | null {
    const inp = document.getElementById('plant-search') as HTMLInputElement | null;
    const btn = document.getElementById('btn-search');
    if (!inp || !btn || !offered(inp, dlg)) return null;
    return { label: t('cmdkDbSearch', { q }), group: t('cmdkGField'), run: () => { inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true })); btn.click(); inp.focus(); } };
  }

  function render() {
    hits = rank(all, input.value).slice(0, 80);
    const db = input.value.trim().length >= 3 ? dbSearch(input.value.trim()) : null;
    if (db) hits.push(db);
    pick = Math.min(pick, Math.max(0, hits.length - 1));
    list.replaceChildren(...(hits.length ? hits.map((c, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === pick));
      li.dataset.i = String(i);
      const a = document.createElement('span'), b = document.createElement('small');
      a.textContent = c.label;
      b.textContent = c.group;
      li.append(a, b);
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'cmdk-none', textContent: t('cmdkNone') })]));
  }
  const open = () => { all = collect(); input.value = ''; pick = 0; render(); dlg.showModal(); input.focus(); };
  const run = (i: number) => { const c = hits[i]; dlg.close(); if (c) setTimeout(() => c.run(), 0); };
  input.addEventListener('input', () => { pick = 0; render(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pick = (pick + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
      for (const li of list.children) li.setAttribute('aria-selected', String((li as HTMLElement).dataset.i === String(pick)));
      list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') { e.preventDefault(); run(pick); }
  });
  list.addEventListener('click', e => { const li = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (li) run(Number(li.dataset.i)); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'o') {
      e.preventDefault(); // instead of the browser's "open file"
      if (dlg.open) dlg.close(); else open();
    }
  }, true);
}
