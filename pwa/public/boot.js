// Runs synchronously in <head>, before first paint: sets <html lang> (so
// screen readers and browser UI see the right language immediately) and the
// dark-mode class (no flash of light UI), plus the chosen site design
// (data-design="horizont"; absent = Standard), contrast (data-contrast="more")
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
    if (localStorage.getItem('pdk-design') === 'horizont') root.dataset.design = 'horizont';
    // Contrast: 'more' / 'normal' chosen in the app, otherwise follow the OS.
    var contrast = localStorage.getItem('pdk-contrast');
    if (contrast === 'more' || (contrast !== 'normal' && window.matchMedia('(prefers-contrast: more)').matches)) {
      root.dataset.contrast = 'more';
    }
    var font = localStorage.getItem('pdk-font');
    if (font === '115' || font === '130') root.dataset.font = font;
  } catch (_) {}
})();
