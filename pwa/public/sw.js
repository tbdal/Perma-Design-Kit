// App shell: the whole build (pages, scripts, styles, fonts, data files) is
// stored when the service worker installs and served from there afterwards,
// so the app opens offline and on a bad connection exactly as it was built.
// scripts/version-sw.mjs fills in both constants after `astro build`: a cache
// name derived from the build, the list of its files (without /x/) and the
// files over 1 MB. In `astro dev` the worker is not registered at all.
const CACHE_NAME = 'pgd-v1';
const PRECACHE = ['/'];
const LARGE = [];

// Same-origin files outside the shell — the LARGE ones (the 5 MB Baumscheibe
// template) and anything fetched later: kept across deploys, so a deploy does
// not make every device download them again, and refreshed from the network
// whenever it is reachable.
const RUNTIME_CACHE = 'pgd-runtime';

/** Stores this build. Hashed files (/_astro/) never change under the same
 *  name, so they are taken over from the previous shell instead of downloaded
 *  again. Fails as a whole if one file is missing — a half shell is worse than the old one. */
async function storeShell() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(PRECACHE.map(async (url) => {
    const kept = url.startsWith('/_astro/') ? await caches.match(url) : undefined;
    if (kept) return cache.put(url, kept);
    // cache: 'reload' — the file of this build, not what the HTTP cache still holds.
    const response = await fetch(new Request(url, { cache: 'reload' }));
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return cache.put(url, response);
  }));
}

/** Best effort: large files once, so they are there offline even if never used online. */
async function storeLarge() {
  const cache = await caches.open(RUNTIME_CACHE);
  await Promise.all(LARGE.map(async (url) => {
    try {
      if (await cache.match(url)) return;
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch { /* fetched when first used */ }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.all([storeShell(), storeLarge()]));
  // No skipWaiting(): open tabs keep the shell they were loaded with (their
  // lazy-loaded chunks no longer exist on the server after a deploy). The
  // page offers "reload" and then sends SKIP_WAITING; without that the new
  // version takes over once every tab is closed.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('pgd-') && k !== CACHE_NAME && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** The shell's copy of a request: exact URL, else without the query string
 *  (/?view=cards), else with a trailing slash (/gartenplan → /gartenplan/). */
async function fromShell(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);
  return (await cache.match(request))
    || (await cache.match(url.pathname))
    || (url.pathname.endsWith('/') ? undefined : await cache.match(url.pathname + '/'));
}

async function respond(request) {
  const cached = await fromShell(request);
  if (cached) return cached;
  // Not part of the shell: network first, last good copy as offline fallback.
  // Only successful same-origin responses are kept — an error page must never
  // replace a good copy.
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const clone = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone)).catch(() => {});
    }
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Live data, and geodata that lib/geo-cache.ts keeps in its own cache.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/geo/')) return;

  event.respondWith(respond(event.request));
});
