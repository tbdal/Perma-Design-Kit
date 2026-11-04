// Lightweight client-side i18n: no build-time routing, no framework — matches
// this app's vanilla-TS-in-<script>-blocks architecture. Language is chosen
// once via the switcher (Layout.astro), persisted to localStorage, and applied
// by (a) a full page reload so every page re-renders in the new language, and
// (b) each page walking its own DOM for [data-i18n*] attributes on load.
//
// Static markup: give an element data-i18n="key" (textContent), or
// data-i18n-title / data-i18n-placeholder / data-i18n-alt / data-i18n-aria-label (that
// attribute) and call applyStaticI18n(...dicts) once on page load.
//
// Dynamic/JS-rendered markup (template strings built in a render function):
// call t('key') directly — build a bound t via createT(...dicts) once per
// page and use it inside those template strings.
//
// Spanish: a third interface language on top of the two base languages. Dict
// entries may carry `es` (added per dict file with addEs()); without it the
// English text is shown. Code that branches by language itself (getLang(),
// Record<Lang, …>, module texts) keeps seeing the base language 'en' when
// Spanish is chosen — getUiLang() tells the chosen one.
export type Lang = 'de' | 'en';
export type UiLang = Lang | 'es';

export type Dict = Record<string, { de: string; en: string; es?: string }>;

const STORAGE_KEY = 'pgd-lang';

/** The interface language as chosen: 'de', 'en' or 'es'. */
export function getUiLang(): UiLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'es' ? v : 'de';
  } catch {
    return 'de';
  }
}

/** The base language for code and texts that exist only in German and English (Spanish → English). */
export function getLang(): Lang {
  return getUiLang() === 'de' ? 'de' : 'en';
}

export function setLang(lang: UiLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore — falls back to default 'de' next load */
  }
}

/** Adds Spanish texts to a dict (keys it does not have are ignored). */
export function addEs(dict: Dict, es: Record<string, string>): void {
  for (const [k, v] of Object.entries(es)) if (dict[k]) dict[k].es = v;
}

function mergeDicts(dicts: Dict[]): Dict {
  return Object.assign({}, ...dicts);
}

/** The text of an entry in the chosen language (Spanish falls back to English). */
function textOf(entry: Dict[string], ui: UiLang): string {
  return ui === 'es' ? entry.es ?? entry.en : entry[ui];
}

/** Builds a t(key, vars?) bound to the current language and the given
 *  dictionaries (later dicts win on key collision). Unknown keys return the
 *  key itself so a missing translation is visible rather than silently blank. */
export function createT(...dicts: Dict[]): (key: string, vars?: Record<string, string | number>) => string {
  const ui = getUiLang();
  const merged = mergeDicts(dicts);
  return (key, vars) => {
    const entry = merged[key];
    let str = entry ? textOf(entry, ui) : key;
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
  const ui = getUiLang();
  const text = (key: string | undefined) => (key && merged[key] ? textOf(merged[key], ui) : null);
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const v = text(el.dataset.i18n);
    if (v != null) el.textContent = v;
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => {
    const v = text(el.dataset.i18nTitle);
    if (v != null) el.title = v;
  });
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach(el => {
    const v = text(el.dataset.i18nPlaceholder);
    if (v != null) el.placeholder = v;
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-alt]').forEach(el => {
    const v = text(el.dataset.i18nAlt);
    if (v != null) el.setAttribute('alt', v);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach(el => {
    const v = text(el.dataset.i18nAriaLabel);
    if (v != null) el.setAttribute('aria-label', v);
  });
}
