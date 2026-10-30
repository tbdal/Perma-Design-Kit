// Browser-side cache for geodata that rarely changes (terrain tiles, building
// footprints): fetched once, then served from the Cache API for `ttlMs`.
// When the network fails, an expired copy is still better than nothing.
// Everything is best effort — without Cache API (private window, old
// browser) it degrades to a plain fetch.

const CACHE_NAME = 'pdk-geo-v1';
const STAMP = 'x-pdk-cached-at';

export const DAY_MS = 24 * 3600 * 1000;

/** Which kind of data a cache key belongs to (info popups, storage overview in the settings). */
export type GeoGroup = 'terrain' | 'dgm' | 'climate' | 'osm' | 'forest';
export function geoGroup(key: string): GeoGroup {
  if (key.startsWith('surr:') || key.startsWith('overpass:')) return 'osm';
  if (key.startsWith('waldrand')) return 'forest';
  if (key.includes('/geo/terrain/')) return 'terrain';
  if (key.includes('/geo/climate')) return 'climate';
  return 'dgm';
}

/** Where the last answer of each group came from — the info popups show it. */
export type GeoOrigin = { from: 'cache' | 'online' | 'stale'; at: number };
const origins = new Map<GeoGroup, GeoOrigin>();
export const lastGeoOrigin = (g: GeoGroup): GeoOrigin | null => origins.get(g) ?? null;
const note = (key: string, from: GeoOrigin['from']) => origins.set(geoGroup(key), { from, at: Date.now() });

async function open(): Promise<Cache | null> {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null; } catch { return null; }
}

/** `key` is any stable string (URL, or a hash of a POST body); it is turned
 *  into a synthetic same-origin URL, so POST requests can be cached too. */
function cacheRequest(key: string): Request {
  return new Request(`${location.origin}/__geo-cache__/${encodeURIComponent(key)}`);
}

/** Request through the cache. `fetcher` performs the real request and must
 *  throw (or return !ok) on failure. */
export async function cachedFetch(key: string, ttlMs: number, fetcher: () => Promise<Response>): Promise<Response> {
  const cache = await open();
  const req = cache ? cacheRequest(key) : null;   // no Cache API (tests, old browsers): plain fetch
  let stale: Response | null = null;
  if (cache) {
    try {
      const hit = await cache.match(req!);
      if (hit) {
        const age = Date.now() - Number(hit.headers.get(STAMP) ?? 0);
        if (age >= 0 && age < ttlMs) { note(key, 'cache'); return hit; }
        stale = hit;
      }
    } catch { /* fall through to network */ }
  }
  try {
    const res = await fetcher();
    if (!res.ok) throw new Error(`geo fetch ${res.status}`);
    note(key, 'online');
    if (cache) {
      try {
        const headers = new Headers(res.headers);
        headers.set(STAMP, String(Date.now()));
        const body = await res.clone().blob();
        await cache.put(req!, new Response(body, { status: 200, headers }));
      } catch { /* quota etc. — the live response is still fine */ }
    }
    return res;
  } catch (e) {
    if (stale) { note(key, 'stale'); return stale; }
    throw e;
  }
}

/** Cache key of the raw /geo/overpass answer for a bbox "s,w,n,e": one entry serves the map surroundings and the plan's 3D buildings. */
export const buildingsCacheKey = (bbox: string) => `overpass:${bbox}`;

/** Short stable hash for long keys (Overpass queries). */
export function hashKey(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** Bytes and number of entries per data group in the geo cache (what the settings list). */
export async function geoCacheUsage(): Promise<Record<GeoGroup, { bytes: number; count: number }>> {
  const out = Object.fromEntries((['terrain', 'dgm', 'climate', 'osm', 'forest'] as GeoGroup[]).map(g => [g, { bytes: 0, count: 0 }])) as Record<GeoGroup, { bytes: number; count: number }>;
  const cache = await open();
  if (!cache) return out;
  try {
    for (const req of await cache.keys()) {
      const res = await cache.match(req);
      if (!res) continue;
      const g = out[geoGroup(decodeURIComponent(new URL(req.url).pathname.replace('/__geo-cache__/', '')))];
      g.count++;
      g.bytes += (await res.blob()).size;
    }
  } catch { /* partial numbers are fine */ }
  return out;
}

/** Drops everything cachedFetch stored. */
export async function clearGeoCache(): Promise<void> {
  try { if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME); } catch { /* ignore */ }
}

const REFRESH_KEY = 'pdk-geo-refresh';
const REFRESH_MS = 3 * 60 * 1000;

/** "Load the outside data again": empties this cache and, for a few minutes (also across a page reload),
 *  asks our server caches for a fresh answer where they offer one (`geoRefreshing()`). */
export async function refreshGeoData(): Promise<void> {
  await clearGeoCache();
  try { sessionStorage.setItem(REFRESH_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function geoRefreshing(): boolean {
  try { const t = Number(sessionStorage.getItem(REFRESH_KEY)); return t > 0 && Date.now() - t < REFRESH_MS; } catch { return false; }
}
