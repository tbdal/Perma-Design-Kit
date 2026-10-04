// Browser-side cache for geodata that rarely changes (terrain tiles, building
// footprints): fetched once, then served from the Cache API for `ttlMs`.
// When the network fails, an expired copy is still better than nothing.
// Everything is best effort — without Cache API (private window, old
// browser) it degrades to a plain fetch.

const CACHE_NAME = 'pdk-geo-v1';
const STAMP = 'x-pdk-cached-at';

export const DAY_MS = 24 * 3600 * 1000;

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
  const req = cacheRequest(key);
  let stale: Response | null = null;
  if (cache) {
    try {
      const hit = await cache.match(req);
      if (hit) {
        const age = Date.now() - Number(hit.headers.get(STAMP) ?? 0);
        if (age >= 0 && age < ttlMs) return hit;
        stale = hit;
      }
    } catch { /* fall through to network */ }
  }
  try {
    const res = await fetcher();
    if (!res.ok) throw new Error(`geo fetch ${res.status}`);
    if (cache) {
      try {
        const headers = new Headers(res.headers);
        headers.set(STAMP, String(Date.now()));
        const body = await res.clone().blob();
        await cache.put(req, new Response(body, { status: 200, headers }));
      } catch { /* quota etc. — the live response is still fine */ }
    }
    return res;
  } catch (e) {
    if (stale) return stale;
    throw e;
  }
}

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

/** Drops everything cachedFetch stored. */
export async function clearGeoCache(): Promise<void> {
  try { if (typeof caches !== 'undefined') await caches.delete(CACHE_NAME); } catch { /* ignore */ }
}
