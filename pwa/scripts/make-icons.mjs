// Renders the PNG app icons from public/favicon.svg (run `npm run icons` after
// changing the favicon; the PNGs are committed). Browsers install the app with
// PNGs: Android wants 192 + 512 px, iOS takes apple-touch-icon.png and nothing
// from the manifest. The maskable and the Apple icon fill the whole square —
// the platform cuts its own shape, and iOS paints transparent corners black.

import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('public/favicon.svg', 'utf8');
const square = svg.replace(/\srx="[^"]*"/, '');
if (square === svg) throw new Error('[make-icons] rounded background rect not found in favicon.svg');

const render = (source, size, file) => sharp(Buffer.from(source), { density: 72 * size / 32 })
  .resize(size, size)
  .png()
  .toFile(`public/${file}`)
  .then(() => console.log(`[make-icons] public/${file}`));

await render(svg, 192, 'icon-192.png');
await render(svg, 512, 'icon-512.png');
await render(square, 512, 'icon-maskable-512.png');
await render(square, 180, 'apple-touch-icon.png');
