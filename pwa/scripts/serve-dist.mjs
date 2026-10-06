// Minimal static server for dist/ used by the browser tests (playwright.config.ts).
// Resolves like the nginx site: $uri, $uri/index.html, $uri.html, else 404.
// (Not `astro preview`: in some environments it detaches into the background,
// which Playwright's webServer can't wait for.)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.argv[2] ?? 4399);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.ics': 'text/calendar',
};

async function resolve(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [clean, join(clean, 'index.html'), `${clean}.html`]) {
    const file = join(root, candidate);
    if (!file.startsWith(root)) return null;
    try { if ((await stat(file)).isFile()) return file; } catch { /* next */ }
  }
  return null;
}

// For the update test (e2e/offline.e2e.ts): /__test/next-build?on=1 makes
// /sw.js look like the one of a later deploy (another cache name) until ?on=0.
let nextBuild = false;

createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/__test/next-build') {
    nextBuild = searchParams.get('on') === '1';
    res.writeHead(204); res.end();
    return;
  }
  const file = await resolve(pathname);
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  // nginx redirects /example to /example/ — keep relative links working the same way.
  if (file.endsWith('index.html') && !pathname.endsWith('/') && pathname !== '/') {
    res.writeHead(301, { Location: `${pathname}/${req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}` });
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  const body = await readFile(file);
  res.end(nextBuild && pathname === '/sw.js' ? body.toString().replace(/pgd-[0-9a-f]{12}/, 'pgd-nextbuild000') : body);
}).listen(port, '127.0.0.1', () => console.log(`serving dist/ on http://127.0.0.1:${port}`));
