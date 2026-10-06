// Stamps dist/sw.js after `astro build` (see the build script):
// - CACHE_NAME gets a build-derived name, so each deploy is its own shell;
// - PRECACHE gets the list of the build's files, so the service worker stores
//   the whole app on install and it opens offline (see public/sw.js);
// - LARGE gets the files over 1 MB (the Baumscheibe template): stored once
//   and kept across deploys instead of being downloaded with every new build.
// In neither list: sw.js itself and the private expert chunks (/x/, served
// only after login).

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const SW_PATH = join(DIST, 'sw.js');
const MAX_PRECACHE_BYTES = 1024 * 1024;

/** dist/gartenplan/index.html → /gartenplan/ (the URL nginx serves it under). */
function urlOf(file) {
  const path = '/' + relative(DIST, file).split(sep).join('/');
  return path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
}

const hash = createHash('sha256');
const precache = [];
const large = [];

async function walk(dir) {
  for (const entry of (await readdir(dir)).sort()) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) { await walk(full); continue; }
    if (!st.isFile() || full === SW_PATH) continue;
    hash.update(entry);
    hash.update(await readFile(full));
    const url = urlOf(full);
    if (entry.startsWith('.') || url.startsWith('/x/')) continue;
    (st.size > MAX_PRECACHE_BYTES ? large : precache).push(url);
  }
}
await walk(DIST);
const buildHash = hash.digest('hex').slice(0, 12);

const swSrc = await readFile(SW_PATH, 'utf8');
const versioned = swSrc
  .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'pgd-${buildHash}';`)
  .replace(/const PRECACHE = \[[^\]]*\];/, `const PRECACHE = ${JSON.stringify(precache)};`)
  .replace(/const LARGE = \[[^\]]*\];/, `const LARGE = ${JSON.stringify(large)};`);
if (versioned === swSrc || !versioned.includes(`'pgd-${buildHash}'`) || !versioned.includes('"/_astro/')) {
  throw new Error('[version-sw] could not stamp dist/sw.js — CACHE_NAME or PRECACHE line not found');
}
await writeFile(SW_PATH, versioned, 'utf8');
console.log(`[version-sw] CACHE_NAME = pgd-${buildHash}, ${precache.length} files precached, ${large.length} large`);
