// Soil texture triangle (#600, stage 2): the twelve USDA texture classes (as SoilGrids uses them; sand/silt boundary
// at 50 µm), each in one of the three steps the plant data has (PFAF light/medium/heavy). Drawn in the area's soil
// editor: tap a class to set it, the step follows. Corners: sand bottom left, silt bottom right, clay top.
import type { SoilTexture } from './soil';

export interface TextureClass {
  k: string;
  /** German short code (KA-style) printed in the field. */
  ab: string;
  name: { de: string; en: string };
  z: SoilTexture;
  /** Corners as [sand %, clay %]; silt = the rest. */
  p: [number, number][];
}

export const TEXTURE_CLASSES: TextureClass[] = [
  { k: 's', ab: 'S', name: { de: 'Sand', en: 'sand' }, z: 'L', p: [[100, 0], [85, 0], [90, 10]] },
  { k: 'ls', ab: 'lS', name: { de: 'lehmiger Sand', en: 'loamy sand' }, z: 'L', p: [[85, 0], [70, 0], [85, 15], [90, 10]] },
  { k: 'sl', ab: 'sL', name: { de: 'sandiger Lehm', en: 'sandy loam' }, z: 'L', p: [[70, 0], [50, 0], [43, 7], [52, 7], [52, 20], [80, 20], [85, 15]] },
  { k: 'l', ab: 'L', name: { de: 'Lehm', en: 'loam' }, z: 'M', p: [[43, 7], [52, 7], [52, 20], [45, 27], [23, 27]] },
  { k: 'sil', ab: 'uL', name: { de: 'schluffiger Lehm', en: 'silt loam' }, z: 'M', p: [[50, 0], [20, 0], [8, 12], [0, 12], [0, 27], [23, 27], [43, 7]] },
  { k: 'si', ab: 'U', name: { de: 'Schluff', en: 'silt' }, z: 'M', p: [[20, 0], [0, 0], [0, 12], [8, 12]] },
  { k: 'scl', ab: 'stL', name: { de: 'sandig-toniger Lehm', en: 'sandy clay loam' }, z: 'M', p: [[80, 20], [52, 20], [45, 27], [45, 35], [65, 35]] },
  { k: 'cl', ab: 'tL', name: { de: 'toniger Lehm', en: 'clay loam' }, z: 'M', p: [[45, 27], [20, 27], [20, 40], [45, 40]] },
  { k: 'sicl', ab: 'utL', name: { de: 'schluffig-toniger Lehm', en: 'silty clay loam' }, z: 'M', p: [[20, 27], [0, 27], [0, 40], [20, 40]] },
  { k: 'sc', ab: 'sT', name: { de: 'sandiger Ton', en: 'sandy clay' }, z: 'H', p: [[65, 35], [45, 35], [45, 55]] },
  { k: 'sic', ab: 'uT', name: { de: 'schluffiger Ton', en: 'silty clay' }, z: 'H', p: [[20, 40], [0, 40], [0, 60]] },
  { k: 'c', ab: 'T', name: { de: 'Ton', en: 'clay' }, z: 'H', p: [[45, 40], [20, 40], [0, 60], [0, 100], [45, 55]] },
];
export const TEXTURE_CLASS_KEYS = TEXTURE_CLASSES.map(c => c.k);
export const textureClass = (k: string | undefined) => TEXTURE_CLASSES.find(c => c.k === k);

const X0 = 35, Y0 = 268, SIDE = 260, H = SIDE * Math.sqrt(3) / 2;
/** Point of a composition in the drawing (viewBox 0 0 330 290). */
export function triXY(sand: number, clay: number): [number, number] {
  const silt = 100 - sand - clay;
  return [X0 + SIDE * (silt + clay / 2) / 100, Y0 - H * clay / 100];
}
function inPoly(sand: number, clay: number, poly: [number, number][]) {
  const [px, py] = triXY(sand, clay);
  const q = poly.map(([a, c]) => triXY(a, c));
  let inside = false;
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** Class of a composition (sand and clay in %); points on an edge or corner are nudged towards the middle. */
export function classOf(sand: number, clay: number): TextureClass | undefined {
  for (const f of [0, 0.002, 0.01]) {
    const s = sand + (100 / 3 - sand) * f, c = clay + (100 / 3 - clay) * f;
    const hit = TEXTURE_CLASSES.find(x => inPoly(s, c, x.p));
    if (hit) return hit;
  }
  return undefined;
}

export const ZONE_FILL: Record<SoilTexture, string> = { L: '#e6cf98', M: '#c9a27a', H: '#c98a74' };

/** The triangle as SVG: classes (button-like, `data-soil-cls`), 20 % lines, corner labels. `cls` = chosen class,
 *  `tex` = chosen step (its classes stay full, the others pale when no class is chosen). */
export function triangleSvg(opt: { cls?: string; tex?: SoilTexture; lang: 'de' | 'en'; labels: { clay: string; sand: string; silt: string; step: Record<SoilTexture, string>; aria: string } }): string {
  const pts = (list: [number, number][]) => list.map(([a, c]) => triXY(a, c).map(v => v.toFixed(1)).join(',')).join(' ');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const cls = TEXTURE_CLASSES.map(c => {
    const on = opt.cls === c.k, pale = !opt.cls && opt.tex && opt.tex !== c.z;
    const cx = c.p.reduce((s, q) => s + triXY(...q)[0], 0) / c.p.length, cy = c.p.reduce((s, q) => s + triXY(...q)[1], 0) / c.p.length;
    const label = `${c.name[opt.lang]} (${c.ab}) · ${opt.labels.step[c.z]}`;
    return `<polygon data-soil-cls="${c.k}" points="${pts(c.p)}" fill="${ZONE_FILL[c.z]}" fill-opacity="${pale ? 0.35 : 1}" stroke="${on ? 'currentColor' : '#fff'}" stroke-width="${on ? 3 : 1}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${esc(label)}" style="cursor:pointer"><title>${esc(label)}</title></polygon>`
      + `<text x="${cx.toFixed(1)}" y="${(cy + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="${on ? 700 : 500}" fill="#292524" pointer-events="none">${c.ab}</text>`;
  });
  // the chosen class on top, so its outline is not covered by its neighbours
  const order = TEXTURE_CLASSES.map((c, i) => [c.k === opt.cls ? 1 : 0, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => cls[i]);
  const grid = [20, 40, 60, 80].map(v => `<polyline points="${pts([[100 - v, v], [0, v]])}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".7" pointer-events="none"/>`).join('');
  const txt = (x: number, y: number, s: string, anc: string) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anc}" font-size="10" fill="currentColor" opacity=".75">${esc(s)}</text>`;
  const ticks = [20, 40, 60, 80].map(v => { const [x, y] = triXY(100 - v, v); return txt(x - 5, y + 3, String(v), 'end'); }).join('');
  return `<svg viewBox="0 0 330 290" role="group" aria-label="${esc(opt.labels.aria)}" class="w-full max-w-[18rem] h-auto">${order.join('')}${grid}${ticks}`
    + txt(X0 + SIDE / 2, Y0 - H - 8, opt.labels.clay, 'middle') + txt(X0 - 4, Y0 + 15, opt.labels.sand, 'start') + txt(X0 + SIDE + 4, Y0 + 15, opt.labels.silt, 'end') + '</svg>';
}
