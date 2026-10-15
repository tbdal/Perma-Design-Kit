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
    remember(e.message || (e.target && e.target.src ? 'resource failed: ' + e.target.src : 'error'), e.filename ? e.filename.replace(location.origin, '') + ':' + e.lineno : '');
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    remember('unhandled rejection: ' + (r && r.message ? r.message : r), '');
  });
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
