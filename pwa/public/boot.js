// Runs synchronously in <head>, before first paint: sets <html lang> (so
// screen readers and browser UI see the right language immediately) and the
// dark-mode class (no flash of light UI), plus the chosen site design
// (data-design="horizont"; absent = Standard). Kept as a plain external file rather
// than an inline <script> so the Content-Security-Policy can forbid inline scripts.
(function () {
  try {
    document.documentElement.lang = localStorage.getItem('pgd-lang') === 'en' ? 'en' : 'de';
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', stored === 'dark' || (!stored && prefersDark));
    if (localStorage.getItem('pdk-design') === 'horizont') document.documentElement.dataset.design = 'horizont';
  } catch (_) {}
})();
