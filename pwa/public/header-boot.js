// Runs synchronously right after the header, before first paint: marks the
// link of this page and draws the header as the last page view left it, so it does not jump once the page's
// scripts ran — signed in (Beta badge, initial and name instead of
// "Anmelden") and the links the expert module added (cached by Layout.astro in
// pdk-nav-extra). Layout.astro's sync() and addNavLink() take over from here;
// cached links the module does not claim are removed after it mounted.
// External file: the Content-Security-Policy forbids inline scripts.
(function () {
  try {
    // the link of this page (bold on phones, so before first paint too)
    var path = location.pathname.replace(/\/$/, '') || '/';
    document.querySelectorAll('a[data-nav]').forEach(function (a) {
      if (a.dataset.nav === path) { a.classList.add('bg-green-800', 'dark:bg-green-900', 'text-white'); a.setAttribute('aria-current', 'page'); }
    });

    var auth = JSON.parse(localStorage.getItem('pdk-auth') || 'null');
    if (!auth || typeof auth.name !== 'string' || !auth.name) return;
    var $ = function (id) { return document.getElementById(id); };
    $('header-beta').hidden = true;
    $('beta-badge').hidden = auth.role === 'admin';
    $('user-initial').textContent = auth.name.slice(0, 1).toUpperCase();
    $('user-initial').hidden = false;
    $('user-icon').setAttribute('hidden', '');
    $('user-label').textContent = auth.name;

    var mode = document.documentElement.dataset.mode; // set by boot.js, already checked against the role
    if (mode !== 'expert' && mode !== 'team') return;
    var cache = JSON.parse(localStorage.getItem('pdk-nav-extra') || '{}') || {};
    var links = Array.isArray(cache.links) ? cache.links : [];
    var navs = document.querySelectorAll('a[data-nav]');
    if (!links.length || !navs.length) return;
    // regular links the module hides; it shows them again itself if that changed
    navs.forEach(function (a) { if (Array.isArray(cache.hidden) && cache.hidden.indexOf(a.dataset.nav) >= 0) { a.hidden = true; a.dataset.navHid = ''; } });
    var cls = navs[0].className.split(/\s+/).filter(function (c) { return c !== 'bg-green-800' && c !== 'dark:bg-green-900' && c !== 'text-white'; }).join(' ');
    links.forEach(function (l) {
      if (!l || typeof l.href !== 'string' || typeof l.label !== 'string') return;
      var ref = (l.after && document.querySelector('a[data-nav="' + CSS.escape(l.after) + '"]')) || navs[navs.length - 1];
      var a = document.createElement('a');
      a.href = l.href;
      a.className = cls;
      a.dataset.navCached = '';
      if (typeof l.featureId === 'string') a.dataset.feature = l.featureId;
      // the current page, like mark() in Layout.astro
      var url = new URL(l.href, location.href);
      if (url.pathname.replace(/\/$/, '') === location.pathname.replace(/\/$/, '') && (!url.hash || url.hash === location.hash)) {
        a.className += ' bg-green-800 dark:bg-green-900 text-white';
        a.setAttribute('aria-current', 'page');
      }
      if (typeof l.icon === 'string') a.innerHTML = '<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' + l.icon + '</svg>';
      var span = document.createElement('span');
      span.textContent = l.label;
      a.appendChild(span);
      ref.after(a);
    });
  } catch (_) {}
})();
