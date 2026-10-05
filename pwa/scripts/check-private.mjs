// After a build: private expert code (src/expert/, own repo on the VPS) must
// only end up under dist/x/, which nginx serves to logged-in users only.
// The expert entry (src/expert/index.ts) carries the marker string
// MARKER below in its default export; this script fails the build if the
// marker shows up anywhere outside dist/x/, or — when src/expert/ exists —
// nowhere under dist/x/ (then the chunk naming in astro.config.mjs broke).
// The marker is assembled at runtime so this file never matches itself.
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const MARKER = ['pdk', 'expert', 'private'].join('-');
const dist = process.argv[2] || 'dist';
const hasExpert = existsSync('src/expert/index.ts');

async function* files(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    if ((await stat(full)).isDirectory()) yield* files(full);
    else if (/\.(js|mjs|html|css|json|map)$/.test(entry)) yield full;
  }
}

const leaks = [];
let inX = 0;
for await (const file of files(dist)) {
  if (!(await readFile(file, 'utf8')).includes(MARKER)) continue;
  const rel = relative(dist, file);
  if (rel.startsWith(`x${sep}`)) inX++;
  else leaks.push(rel);
}

if (leaks.length) {
  console.error(`[check-private] private expert code outside /x/ (would be public):\n  ${leaks.join('\n  ')}`);
  process.exit(1);
}
if (hasExpert && !inX) {
  console.error('[check-private] src/expert/ exists, but no chunk under dist/x/ carries its marker — check chunkFileNames in astro.config.mjs and the marker in src/expert/index.ts.');
  process.exit(1);
}
console.log(`[check-private] ok (${hasExpert ? `expert module in ${inX} file(s) under /x/` : 'public build, no expert module'})`);
