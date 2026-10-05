import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PlantData } from './types';
import type { PlantLayer } from './plant-layer';
import { seededRandom } from './blob-shape';

// More natural-looking plants for the 3D garden view. Instead of one jagged
// ball per plant: a tapered trunk with a few main branches, and a crown made
// of many small "leaf cards" (quads carrying a procedurally painted leaf
// cluster with alpha) around a darker inner volume. Shape follows the plant:
// conifers as cones, pines with a high umbrella crown, broadleaf trees with a
// rounded crown on a clear stem, multi-stemmed shrubs, grassy herb clumps,
// climbers on a stake, low mats for rhizome plants. Everything is seeded by
// the placement id, so a plant looks the same on every render.

export type CrownShape = 'round' | 'cone' | 'pine' | 'shrub' | 'herb' | 'climber' | 'mat';

/** Conifer genera (needle or scale leaves) — drawn as a cone with needles,
 *  broadleaf woody plants get a rounded leafy crown instead. */
export const CONIFER_GENERA = [
  'abies', 'araucaria', 'calocedrus', 'cedrus', 'cephalotaxus', 'chamaecyparis', 'cryptomeria', 'cunninghamia', 'cupressus',
  'juniperus', 'keteleeria', 'larix', 'metasequoia', 'picea', 'pinus', 'platycladus', 'podocarpus', 'pseudolarix', 'pseudotsuga',
  'sciadopitys', 'sequoia', 'sequoiadendron', 'taxodium', 'taxus', 'thuja', 'thujopsis', 'torreya', 'tsuga', 'xanthocyparis',
];
/** Pines whose old crown is a flat umbrella; other pines stay conical. */
const UMBRELLA_PINES = ['pinus pinea', 'pinus sylvestris', 'pinus nigra', 'pinus halepensis', 'pinus densiflora', 'pinus thunbergii', 'pinus radiata'];

/** Crown type from layer + genus: conifers as cones (umbrella pines flat on
 *  a tall stem), broadleaf trees round, shrubs as stems with leaves. */
export function crownShape(plant: Pick<PlantData, 'latinName'> | undefined, layer: PlantLayer): CrownShape {
  const words = (plant?.latinName ?? '').trim().toLowerCase().replace(/[×✕]/g, 'x').split(/\s+/);
  const genus = words[0] === 'x' ? words[1] ?? '' : words[0];
  const species = words.slice(0, 2).join(' ');
  const conifer = CONIFER_GENERA.includes(genus);
  if (layer === 'tree') {
    if (UMBRELLA_PINES.includes(species)) return 'pine';
    return conifer ? 'cone' : 'round';
  }
  if (layer === 'shrub') return conifer ? 'cone' : 'shrub';
  if (layer === 'climber') return 'climber';
  if (layer === 'rhizo') return 'mat';
  return 'herb';
}

// ── shared textures/materials (built once) ───────────────────────────────
let leafTex: THREE.CanvasTexture | null = null;
let needleTex: THREE.CanvasTexture | null = null;
let grassTex: THREE.CanvasTexture | null = null;

function paint(draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void, seed: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  draw(ctx, seededRandom(seed));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** White-ish leaf cluster; tinted per card through vertex colors. */
function leafTexture(): THREE.CanvasTexture {
  return leafTex ??= paint((ctx, r) => {
    for (let i = 0; i < 70; i++) {
      const x = 30 + r() * 196, y = 30 + r() * 196, s = 10 + r() * 16;
      const l = 55 + r() * 40;
      ctx.fillStyle = `hsl(${90 + r() * 30}, ${25 + r() * 25}%, ${l}%)`;
      ctx.beginPath();
      ctx.ellipse(x, y, s, s * 0.45, r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsla(100, 30%, ${l - 25}%, 0.5)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, 'leaves');
}

function needleTexture(): THREE.CanvasTexture {
  return needleTex ??= paint((ctx, r) => {
    ctx.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const x = 16 + r() * 224, y = 16 + r() * 224, a = r() * Math.PI, len = 12 + r() * 20;
      ctx.strokeStyle = `hsl(${110 + r() * 30}, ${25 + r() * 20}%, ${50 + r() * 35}%)`;
      ctx.lineWidth = 2.5 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }, 'needles');
}

function grassTexture(): THREE.CanvasTexture {
  return grassTex ??= paint((ctx, r) => {
    for (let i = 0; i < 60; i++) {
      const x = 20 + r() * 216, bend = (r() - 0.5) * 60, h = 120 + r() * 120;
      ctx.strokeStyle = `hsl(${80 + r() * 40}, ${35 + r() * 25}%, ${55 + r() * 30}%)`;
      ctx.lineWidth = 3 + r() * 4;
      ctx.beginPath();
      ctx.moveTo(x, 256);
      ctx.quadraticCurveTo(x + bend * 0.3, 256 - h * 0.6, x + bend, 256 - h);
      ctx.stroke();
    }
  }, 'grass');
}

const foliageMats = new Map<string, { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial }>();
function foliageMaterial(kind: 'leaf' | 'needle' | 'grass') {
  let m = foliageMats.get(kind);
  if (!m) {
    const map = kind === 'leaf' ? leafTexture() : kind === 'needle' ? needleTexture() : grassTexture();
    m = {
      mat: new THREE.MeshStandardMaterial({ map, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }),
      // Shadows follow the painted leaves, not the square cards.
      depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 }),
    };
    foliageMats.set(kind, m);
  }
  return m;
}
const barkMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.95 });
const stakeMat = new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 0.9 });

// ── geometry helpers ──────────────────────────────────────────────────────
function tintGeometry(g: THREE.BufferGeometry, color: THREE.Color) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Two crossed quads (reads as a volume from every side). */
function leafCard(size: number, pos: THREE.Vector3, rand: () => number, color: THREE.Color, upright = false): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(size, size);
  const b = new THREE.PlaneGeometry(size, size).rotateY(Math.PI / 2);
  const g = mergeGeometries([a, b])!;
  if (!upright) g.rotateX((rand() - 0.5) * Math.PI);
  g.rotateY(rand() * Math.PI * 2);
  if (!upright) g.rotateZ((rand() - 0.5) * 0.8);
  g.translate(pos.x, pos.y, pos.z);
  return tintGeometry(g, color);
}

function vary(base: THREE.Color, rand: () => number, amount = 0.12): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h + (rand() - 0.5) * 0.05, Math.min(1, hsl.s * (0.85 + rand() * 0.3)), Math.min(1, Math.max(0, hsl.l + (rand() - 0.5) * amount)));
}

/** Point inside an ellipsoid (rx, ry, rz) biased to the outer shell. */
function shellPoint(rand: () => number, rx: number, ry: number, rz: number): THREE.Vector3 {
  const u = rand() * 2 - 1, phi = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  const d = 0.65 + 0.35 * Math.cbrt(rand());
  return new THREE.Vector3(Math.cos(phi) * s * rx * d, u * ry * d, Math.sin(phi) * s * rz * d);
}

function branch(from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number): THREE.BufferGeometry {
  const len = from.distanceTo(to);
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
  g.translate(0, len / 2, 0);
  const dir = to.clone().sub(from).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(from.x, from.y, from.z);
  return g;
}

function addMesh(group: THREE.Group, geos: THREE.BufferGeometry[], kind: 'leaf' | 'needle' | 'grass') {
  if (!geos.length) return;
  const m = foliageMaterial(kind);
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, m.mat);
  mesh.customDepthMaterial = m.depth;
  group.add(mesh);
}

function addWood(group: THREE.Group, geos: THREE.BufferGeometry[], mat = barkMat) {
  if (!geos.length) return;
  group.add(new THREE.Mesh(mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g))!, mat));
}

/** Builds the plant model; `radiusM` is the current crown radius, `heightM`
 *  the current height (both already scaled by the growth model), `trunkM`
 *  the trunk radius (growth-model trunkRadiusM; default from the crown). */
export function buildPlantModel(seed: string, shape: CrownShape, radiusM: number, heightM: number, baseColor: string, trunkM?: number): THREE.Group {
  const rand = seededRandom(seed);
  const group = new THREE.Group();
  // Mats are leafy ground cover, not the earthy rhizome-layer colour.
  const base = new THREE.Color(shape === 'mat' ? '#4d7c0f' : baseColor);
  const r = Math.max(0.05, radiusM), h = Math.max(0.08, heightM);
  const wood: THREE.BufferGeometry[] = [];
  const cards: THREE.BufferGeometry[] = [];

  if (shape === 'round' || shape === 'pine') {
    const crownBottom = shape === 'pine' ? h * 0.6 : h * 0.35;
    const crownH = h - crownBottom;
    const rx = r, ry = crownH / 2, rz = r * (0.85 + rand() * 0.3);
    const cy = crownBottom + ry;
    const trunkR = trunkM ?? Math.max(0.03, r * 0.07);
    wood.push(branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3((rand() - 0.5) * r * 0.1, cy, (rand() - 0.5) * r * 0.1), trunkR, trunkR * 0.6));
    const nb = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + rand() * 0.6;
      const from = new THREE.Vector3(0, crownBottom + crownH * (0.1 + rand() * 0.3), 0);
      const to = new THREE.Vector3(Math.cos(a) * rx * 0.7, cy + ry * (rand() * 0.6 - 0.1), Math.sin(a) * rz * 0.7);
      wood.push(branch(from, to, trunkR * 0.55, trunkR * 0.2));
    }
    const kind = shape === 'pine' ? 'needle' : 'leaf';
    const n = Math.round(Math.min(220, (shape === 'pine' ? 70 : 40) + r * (shape === 'pine' ? 28 : 18)));
    const card = Math.max(0.35, r * (shape === 'pine' ? 0.7 : 0.55));
    for (let i = 0; i < n; i++) {
      const p = shellPoint(rand, rx, ry * (shape === 'pine' ? 0.8 : 1), rz);
      if (shape === 'pine') p.y = Math.min(p.y, ry * 0.45); // flat-ish umbrella top
      p.y += cy;
      const shade = 0.8 + 0.4 * ((p.y - crownBottom) / crownH); // lighter at the top
      cards.push(leafCard(card * (0.7 + rand() * 0.6), p, rand, vary(base, rand).multiplyScalar(shade)));
    }
    addMesh(group, cards, kind);
  } else if (shape === 'cone') {
    const trunkR = trunkM ?? Math.max(0.03, r * 0.08);
    wood.push(branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.78, 0), trunkR, trunkR * 0.3));
    const tiers = Math.max(5, Math.round(h * 2.2));
    for (let t = 0; t < tiers; t++) {
      const f = t / tiers;                     // 0 = bottom tier
      const y = h * (0.1 + 0.88 * f);
      const tr = r * (1 - f) * (0.9 + rand() * 0.2);
      const per = Math.max(4, Math.round(6 + tr * 6));
      for (let i = 0; i < per; i++) {
        const a = (i / per) * Math.PI * 2 + rand();
        const d = tr * (0.4 + rand() * 0.6);
        const p = new THREE.Vector3(Math.cos(a) * d, y - d * 0.25, Math.sin(a) * d);
        cards.push(leafCard(Math.max(0.3, tr * 0.8 + 0.25), p, rand, vary(base, rand, 0.08).multiplyScalar(0.8 + 0.35 * f)));
      }
    }
    addMesh(group, cards, 'needle');
  } else if (shape === 'shrub') {
    const stems = 3 + Math.floor(rand() * 4);
    for (let i = 0; i < stems; i++) {
      const a = rand() * Math.PI * 2;
      wood.push(branch(new THREE.Vector3(Math.cos(a) * r * 0.1, 0, Math.sin(a) * r * 0.1),
        new THREE.Vector3(Math.cos(a) * r * 0.55, h * (0.55 + rand() * 0.3), Math.sin(a) * r * 0.55), Math.max(0.012, r * 0.05), 0.008));
    }
    const ry = h / 2;
    const n = Math.round(Math.min(120, 25 + r * 30));
    for (let i = 0; i < n; i++) {
      const p = shellPoint(rand, r, ry, r);
      p.y = Math.max(p.y + ry, h * 0.08);
      cards.push(leafCard(Math.max(0.2, r * 0.6) * (0.7 + rand() * 0.6), p, rand, vary(base, rand).multiplyScalar(0.8 + 0.35 * (p.y / h))));
    }
    addMesh(group, cards, 'leaf');
  } else if (shape === 'climber') {
    wood.push(branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 1.05, 0), 0.03, 0.025));
    const n = Math.round(20 + h * 12);
    for (let i = 0; i < n; i++) {
      const y = rand() * h, a = rand() * Math.PI * 2, d = r * (0.3 + rand() * 0.5);
      cards.push(leafCard(Math.max(0.2, r * 0.6), new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d), rand, vary(base, rand)));
    }
    addMesh(group, cards, 'leaf');
    addWood(group, wood, stakeMat);
    return group;
  } else if (shape === 'mat') {
    const n = Math.round(Math.min(90, 14 + r * r * 40));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r;
      const g = new THREE.PlaneGeometry(Math.max(0.22, r * 0.7), Math.max(0.22, r * 0.7)).rotateX(-Math.PI / 2 + (rand() - 0.5) * 0.5).rotateY(rand() * Math.PI);
      g.translate(Math.cos(a) * d, 0.03 + rand() * Math.min(0.15, h * 0.5), Math.sin(a) * d);
      cards.push(tintGeometry(g, vary(base, rand)));
    }
    addMesh(group, cards, 'leaf');
  } else {
    // herb: upright grassy/leafy clump
    const n = Math.round(Math.min(40, 6 + r * 20));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * 0.7;
      const size = Math.max(0.15, h * (0.7 + rand() * 0.5));
      cards.push(leafCard(size, new THREE.Vector3(Math.cos(a) * d, size / 2, Math.sin(a) * d), rand, vary(base, rand), true));
    }
    addMesh(group, cards, 'grass');
  }
  addWood(group, wood);
  return group;
}
