/** Where to go after signing in: only paths on this site, resolved like the
 *  browser does, so "/\\evil.com" or "/<tab>/evil.com" cannot leave it. '/' otherwise. */
export function safeNext(raw: string, origin: string): string {
  try {
    const u = new URL(raw, origin);
    return raw.startsWith('/') && u.origin === origin ? u.pathname + u.search + u.hash : '/';
  } catch { return '/'; }
}
