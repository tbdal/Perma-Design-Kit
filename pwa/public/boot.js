// Runs synchronously in <head>, before first paint: sets <html lang> (so
// screen readers and browser UI see the right language immediately) and the
// dark-mode class (no flash of light UI), plus the chosen site design
// (data-design="horizont" is the default set in Layout.astro; removed only when
// Standard was chosen explicitly), contrast (data-contrast="more")
// and text size (data-font="115"|"130"). Kept as a plain external file rather
// than an inline <script> so the Content-Security-Policy can forbid inline scripts.
// Keep in sync with applyContrast()/applyFontSize() in src/lib/settings.ts.
(function () {
  try {
    var root = document.documentElement;
    root.lang = localStorage.getItem('pgd-lang') === 'en' ? 'en' : 'de';
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', stored === 'dark' || (!stored && prefersDark));
    if (localStorage.getItem('pdk-design') === 'standard') delete root.dataset.design;
    // Contrast: 'more' / 'normal' chosen in the app, otherwise follow the OS.
    var contrast = localStorage.getItem('pdk-contrast');
    if (contrast === 'more' || (contrast !== 'normal' && window.matchMedia('(prefers-contrast: more)').matches)) {
      root.dataset.contrast = 'more';
    }
    var font = localStorage.getItem('pdk-font');
    if (font === '115' || font === '130') root.dataset.font = font;
  } catch (_) {}
})();

// UI mode (Einfach / Klassisch / Experte) and the features it hides, before
// first paint so hidden panels never flash. Same rules as src/lib/features.ts
// (initialMode, effectiveMode, offFeatures, featureCss) and ui-mode.ts, which
// takes over after load and reuses the stylesheet created here.
(function () {
  try {
    var root = document.documentElement;
    var get = function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
    var parse = function (s) { try { return s ? JSON.parse(s) : null; } catch (_) { return null; } };
    var mode = get('pdk-mode');
    if (mode !== 'simple' && mode !== 'classic' && mode !== 'expert' && mode !== 'team') {
      mode = get('pdk-welcome-seen') ? 'classic' : 'simple';
      try { localStorage.setItem('pdk-mode', mode); } catch (_) {}
    }
    var auth = parse(get('pdk-auth'));
    // effectiveMode() in features.ts: team needs role team/admin, expert any login.
    var role = auth && auth.name ? auth.role : null;
    if (mode === 'team' && role !== 'team' && role !== 'admin') mode = role ? 'expert' : 'classic';
    if (mode === 'expert' && !role) mode = 'classic';
    root.dataset.mode = mode;
    var defaults = parse(root.getAttribute('data-feature-defaults')) || {};
    var config = parse(get('pdk-feature-config')) || {};
    var css = '';
    var seen = {};
    var ids = Object.keys(defaults).concat(Object.keys(config));
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (seen[id] || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) continue;
      seen[id] = 1;
      var modes = Array.isArray(config[id]) ? config[id] : (defaults[id] || []);
      if (modes.indexOf(mode) < 0) css += '[data-feature~="' + id + '"]{display:none!important}\n';
    }
    var sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
    window.__pdkFeatureSheet = sheet;
  } catch (_) {}
})();

// Aerial tiles are counted per country from Resource Timing (settings → storage): the default buffer of 250 entries is too small.
try { performance.setResourceTimingBufferSize(3000); } catch (_) {}

// Last 20 script errors of this tab, for the debug file on /fehler-melden/
// (src/lib/bug-report.ts). sessionStorage: stays in the tab, nothing is sent.
(function () {
  function remember(msg, src) {
    try {
      var list = JSON.parse(sessionStorage.getItem('pdk-errors') || '[]');
      list.push({ t: new Date().toISOString(), msg: String(msg).slice(0, 500), src: (src || location.pathname).slice(0, 200) });
      sessionStorage.setItem('pdk-errors', JSON.stringify(list.slice(-20)));
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    var where = e.filename ? e.filename.replace(location.origin, '') + ':' + e.lineno : '';
    remember(e.message || (e.target && e.target.src ? 'resource failed: ' + e.target.src : 'error'), where);
    // script errors only: not broken images, not the harmless browser notices
    if (e.message && !/ResizeObserver loop|^Script error\.?$/.test(e.message)) notify(e.message, where);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = 'unhandled rejection: ' + (r && r.message ? r.message : r);
    remember(msg, '');
    notify(msg, r && r.stack ? String(r.stack).split('\n').slice(0, 4).join('\n') : '');
  });
  // Visible hint (once per page load) so a silent failure is not mistaken for "nothing happened".
  var shown = false;
  function notify(msg, where) {
    if (shown || !document.body) return;
    shown = true;
    try {
      var de = (document.documentElement.lang || 'de').slice(0, 2) === 'de';
      var sheet = new CSSStyleSheet();
      sheet.replaceSync('#pdk-error-hint{position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:9999;max-width:90vw;background:#44403c;color:#fff;padding:.6rem 1rem;border-radius:.5rem;font:14px system-ui,sans-serif;box-shadow:0 4px 12px #0006}#pdk-error-hint a{color:#fcd34d;margin-left:.5rem}#pdk-error-hint button{background:none;border:0;color:#fff;margin-left:.75rem;cursor:pointer;font-size:16px}');
      document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
      var el = document.createElement('div');
      el.id = 'pdk-error-hint';
      el.setAttribute('role', 'alert');
      // The message itself (click: where it happened), so it is clear what went wrong.
      var what = document.createElement('button');
      what.type = 'button';
      what.style.cssText = 'all:unset;cursor:pointer;text-decoration:underline dotted';
      what.textContent = (de ? 'Etwas ist schiefgelaufen: ' : 'Something went wrong: ') + String(msg || '').slice(0, 140);
      var more = document.createElement('pre');
      more.hidden = true;
      more.style.cssText = 'margin:.4rem 0 0;white-space:pre-wrap;word-break:break-all;font-size:11px;max-width:80vw';
      more.textContent = String(msg || '') + (where ? '\n' + String(where).slice(0, 400) : '') + '\n' + location.pathname;
      what.addEventListener('click', function () { more.hidden = !more.hidden; });
      el.append(what, more);
      var a = document.createElement('a');
      a.href = '/fehler-melden/';
      a.textContent = de ? 'Fehler melden' : 'Report a bug';
      var x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', de ? 'Schließen' : 'Close');
      x.addEventListener('click', function () { el.remove(); });
      el.append(a, x);
      document.body.appendChild(el);
    } catch (_) {}
  }
})();

// /gartenplan/#neu (team mode): the new layout is built by a module that loads
// after the page, so the regular layout used to show first and then jump. Keep
// the planner hidden until the module has set up its layout (it removes
// `pdk-layout-pending`); a timeout lifts it if the module never comes.
(function () {
  try {
    if (!/^\/gartenplan\/?$/.test(location.pathname) || location.hash !== '#neu') return;
    if (localStorage.getItem('pdk-mode') !== 'team') return;
    var root = document.documentElement;
    root.classList.add('pdk-layout-pending');
    var sheet = new CSSStyleSheet();
    sheet.replaceSync('html.pdk-layout-pending #plan-list-view, html.pdk-layout-pending #plan-editor-view { visibility: hidden; }');
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat([sheet]);
    setTimeout(function () { root.classList.remove('pdk-layout-pending'); }, 4000);
  } catch (_) {}
})();
