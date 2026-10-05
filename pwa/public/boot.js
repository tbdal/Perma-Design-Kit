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
