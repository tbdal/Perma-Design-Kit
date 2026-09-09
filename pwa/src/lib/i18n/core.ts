// Lightweight client-side i18n: no build-time routing, no framework — matches
// this app's vanilla-TS-in-<script>-blocks architecture. Language is chosen
// once via the switcher (Layout.astro), persisted to localStorage, and applied
// by (a) a full page reload so every page re-renders in the new language, and
// (b) each page walking its own DOM for [data-i18n*] attributes on load.
//
// Static markup: give an element data-i18n="key" (textContent), or
// data-i18n-title / data-i18n-placeholder / data-i18n-aria-label (that
// attribute) and call applyStaticI18n(...dicts) once on page load.
//
// Dynamic/JS-rendered markup (template strings built in a render function):
// call t('key') directly — build a bound t via createT(...dicts) once per
// page and use it inside those template strings.
export type Lang = 'de' | 'en';

export type Dict = Record<string, { de: string; en: string }>;

const STORAGE_KEY = 'pgd-lang';

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' ? 'en' : 'de';
  } catch {
    return 'de';
  }
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore — falls back to default 'de' next load */
  }
}

function mergeDicts(dicts: Dict[]): Dict {
  return Object.assign({}, ...dicts);
}

/** Builds a t(key, vars?) bound to the current language and the given
 *  dictionaries (later dicts win on key collision). Unknown keys return the
 *  key itself so a missing translation is visible rather than silently blank. */
export function createT(...dicts: Dict[]): (key: string, vars?: Record<string, string | number>) => string {
  const lang = getLang();
  const merged = mergeDicts(dicts);
  return (key, vars) => {
    const entry = merged[key];
    let str = entry ? entry[lang] : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) str = str.split(`{${k}}`).join(String(v));
    }
    return str;
  };
}

/** Applies data-i18n[-title|-placeholder|-aria-label] attributes found
 *  anywhere currently in the DOM, using the given dictionaries. Call once
 *  after the relevant markup exists (page load, or after re-rendering
 *  dynamic sections that themselves carry data-i18n attributes).
 *
 *  Scans the *whole* document, not just the caller's own markup — Layout.astro
 *  and each page both call this independently. So a key this call doesn't
 *  recognize is left untouched (not overwritten with the raw key) — otherwise
 *  whichever call runs last would clobber the other's already-translated
 *  elements (e.g. a page's own applyStaticI18n(pageDict) call blanking out
 *  Layout's nav/footer text, since those keys live in a different dict). */
export function applyStaticI18n(...dicts: Dict[]): void {
  const merged = mergeDicts(dicts);
  const lang = getLang();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (key && merged[key]) el.textContent = merged[key][lang];
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (key && merged[key]) el.title = merged[key][lang];
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (key && merged[key]) el.placeholder = merged[key][lang];
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(el => {
    const key = el.dataset.i18nAriaLabel;
    if (key && merged[key]) el.setAttribute('aria-label', merged[key][lang]);
  });
}
