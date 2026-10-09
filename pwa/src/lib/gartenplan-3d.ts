import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GardenPlan, GardenPlanArea, GardenPlanPlacement, PlantData } from './types';
import { displayRadiusM, resolveGrowthPace, trunkRadiusM } from './growth-model';
import { deriveLayer, LAYER_STYLE, type PlantLayer } from './plant-layer';
import { buildPlantModel, crownShape } from './plant-mesh-3d';
import { pointInPolygon } from './gartenplan-geometry';
import { polygonCentroid } from './gartenplan-render';
import { enuToPlan, tilesForRect, planToLatLon } from './gartenplan-geo';
import { OSM_TILES, sourceForGeo, tileUrl, fallbackTileUrl } from './gartenplan-background';
import { browserTimeZone, wallClock, zonedDate } from './plan-time';
import { sunPosition, sunDirectionEnu } from './sun-position';
import { sampleGrid, gridRange, terrainTiles, type ElevationGrid } from './terrain';
import { orientedBox, roofHeightAt, roofFaces, ringWithBreaks, type Roof } from './building-roof';
import { ageAt, isPlanted } from './phases';

/** Ground height (m, relative to the plan centre) at plan x/z. */
type GroundFn = (x: number, z: number) => number;
const FLAT: GroundFn = () => 0;

/** Flat polygon → triangles subdivided to ≤ maxLen edges, every vertex
 *  lifted `lift` above the ground. Needed because with the logarithmic depth
 *  buffer polygonOffset no longer applies: a big triangle lying only on its
 *  corners would be cut by the curved terrain between them. */
function drapedPolygon(pts: { xM: number; yM: number }[], ground: GroundFn, lift: number, maxLen: number): THREE.BufferGeometry {
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p.xM, p.yM)), []);
  const out: number[] = [];
  const emit = (a: number[], b: number[], c: number[], depth: number) => {
    const d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (depth < 7 && Math.max(d(a, b), d(b, c), d(c, a)) > maxLen) {
      const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
      emit(a, ab, ca, depth + 1); emit(ab, b, bc, depth + 1); emit(ca, bc, c, depth + 1); emit(ab, bc, ca, depth + 1);
      return;
    }
    for (const p of [a, b, c]) out.push(p[0], ground(p[0], p[1]) + lift, p[1]);
  };
  for (const [i, j, k] of tris) emit([pts[i].xM, pts[i].yM], [pts[j].xM, pts[j].yM], [pts[k].xM, pts[k].yM], 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

/** Closed outline sampled every ≤ step metres and lifted above the ground. */
function drapedOutline(pts: { xM: number; yM: number }[], ground: GroundFn, lift: number, step: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.xM - a.xM, b.yM - a.yM) / step));
    for (let k = 0; k < n; k++) {
      const x = a.xM + (b.xM - a.xM) * k / n, y = a.yM + (b.yM - a.yM) * k / n;
      out.push(new THREE.Vector3(x, ground(x, y) + lift, y));
    }
  }
  return out;
}

/**
 * Full 3D editing view for a garden plan — camera-orbit for viewing,
 * raycasting for placing/dragging plants directly in the scene. Reuses the
 * exact same growth-model sizing and layer colors as the 2D SVG editor so
 * both views stay visually consistent; a tree trunk is the one 3D-only
 * addition (2D is a top-down view and never drew one).
 *
 * Data-flow: this module never mutates `plan` — it only reads it. Every
 * user action (place/drag/select) is reported back via `callbacks`, so
 * `editing.placements` mutation stays centralized on the page, exactly
 * like the 2D code, and the page can still drive its existing sidebar
 * (picker/suggestions/unplaced/selected panels) unchanged.
 */

export interface GardenPlan3DCallbacks {
  onGroundTap(xM: number, yM: number): void;
  onPlacementDragEnd(placementId: string, xM: number, yM: number): void;
  onPlacementSelected(placementId: string): void;
  onAreaSelected(areaId: string): void;
  onAreaVertexDragEnd(areaId: string, index: number, xM: number, yM: number): void;
}

/** Water analysis (water.ts) for the 3D ground, in plan metres. `width` of a
 *  flow segment in metres; a sink's water level lies `depthM` above its floor. */
export interface Water3D {
  flow: { x1: number; y1: number; x2: number; y2: number; width: number }[];
  sinks: { xM: number; yM: number; rM: number; depthM: number }[];
  swales: { x1: number; y1: number; x2: number; y2: number; width: number }[];
}

/** Function-coverage colouring (function-coverage.ts) for the 3D ground:
 *  cell centres with a CSS colour (hex or "hsl(h, s%, l%)"), gap rings. */
export interface CoverageOverlay3D {
  cellM: number;
  cells: { xM: number; yM: number; color: string }[];
  gaps: { xM: number; yM: number; rM: number }[];
}

/** Hover preview of a planting suggestion (function coverage). */
export interface SuggestionPreview3D {
  xM: number;
  yM: number;
  plant: PlantData;
  reachM: number;   // influence radius of the function
  label: string;
}

export interface GardenPlan3DView {
  /** Renders the current view and returns a copy of the image. */
  snapshot(): HTMLCanvasElement;
  /** Ghost of a suggested plant at a gap with its reach (null hides it). */
  setPreview(preview: SuggestionPreview3D | null): void;
  /** Shows (or with null hides) the function-coverage colouring. */
  setCoverage(overlay: CoverageOverlay3D | null): void;
  /** Flow paths, sinks and swale suggestions draped on the ground (null hides them). */
  setWater(water: Water3D | null): void;
  updateYears(years: number): void;
  refreshPlacements(): void;
  setArmedPlant(plantId: string | null): void;
  setSelectedPlacement(placementId: string | null): void;
  /** Rebuilds the area shapes (after add/rename/recolor/delete/vertex edit)
   *  and shows vertex handles on `selectedAreaId`. */
  refreshAreas(selectedAreaId: string | null): void;
  /** Moves the sun (light, shadows, sky, sun path) to the given moment; `timeZone` = the garden's, for the hour marks on the sun path (default: the browser's). */
  setSunTime(date: Date, timeZone?: string): { bearingDeg: number; altitudeDeg: number };
  getCameraState(): Camera3DState;
  /** Jump to a straight top view or an oblique view from the south. */
  setViewPreset(preset: 'top' | 'oblique'): void;
  /** Ground rectangle (plan meters) roughly visible around the camera target
   *  — used to keep the same section when switching back to 2D. */
  getViewRect(): { minX: number; minY: number; maxX: number; maxY: number };
  dispose(): void;
}

export interface Camera3DState { position: [number, number, number]; target: [number, number, number]; }

export interface View3DOptions {
  /** Restore an earlier 3D camera (back from 2D without changes there). */
  camera?: Camera3DState | null;
  /** Otherwise start looking straight down on this plan-meter rectangle —
   *  the section the 2D view showed — so the perspective carries over. */
  fit?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  latLon: { lat: number; lon: number };
  rotationDeg: number;
  /** Elevation grid (terrain.ts); null = flat ground. */
  terrain?: ElevationGrid | null;
  /** Called once when an aerial-photo tile failed and a fallback was used. */
  onTileFallback?: () => void;
  /** Building footprints (plan meters) with heights, e.g. from OSM. */
  buildings?: { pts: { xM: number; yM: number }[]; heightM: number; holes?: { xM: number; yM: number }[][]; roof?: Roof }[];
  /** Extra scene content from plugins (expert-api.ts add3dLayer). */
  layers?: Scene3DLayer[];
  /** Placements and areas (by id) left out of the scene, e.g. hidden by a plugin. */
  hidden?: (id: string) => boolean;
}

/** What a plugin layer gets: the scene in plan metres (x = xM, z = yM, y up). */
export interface Scene3DContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  plan: GardenPlan;
  /** Ground height at plan x/y, relative to the plan centre (as the scene uses it). */
  ground(xM: number, yM: number): number;
  requestRender(): void;
  /** Widen the sun's shadow area so objects up to this distance from the plan centre cast shadows. */
  coverShadow(radiusM: number): void;
}
/** Adds content; may return a cleanup, called when the view is disposed. */
export type Scene3DLayer = (ctx: Scene3DContext) => void | (() => void);

const DRAG_THRESHOLD_PX = 4;


/** Crown radius, height and layer of a plant after `years`. */
function plantDims(plant: PlantData | undefined, years: number) {
  const radiusM = plant ? displayRadiusM(plant, years) : 0.2;
  const layer: PlantLayer = plant ? deriveLayer(plant) : 'shrub';
  // Height grows in step with the crown: the growth model gives the current
  // crown radius, so the same fraction of the final height applies.
  const finalRadius = plant?.widthM && plant.widthM > 0 ? plant.widthM / 2 : 0.25;
  const frac = Math.min(1, radiusM / finalRadius);
  const fallbackH = layer === 'tree' ? radiusM * 2.6 : layer === 'shrub' ? radiusM * 1.6 : layer === 'rhizo' ? 0.15 : radiusM * 1.2;
  const heightM = plant?.heightM && plant.heightM > 0 ? Math.max(0.1, plant.heightM * frac) : fallbackH;
  // Trunk follows height and keeps thickening after the crown is full size.
  const trunkM = trunkRadiusM(heightM, years, plant ? resolveGrowthPace(plant) : 'mid');
  return { radiusM, heightM, layer, trunkM };
}

function buildPlantMesh(placement: GardenPlanPlacement, plant: PlantData | undefined, years: number): THREE.Group {
  const { radiusM, heightM, layer, trunkM } = plantDims(plant, years);
  const style = LAYER_STYLE[layer];
  const group = buildPlantModel(placement.id, crownShape(plant, layer), radiusM, heightM, style.fill, trunkM);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radiusM * 1.05, radiusM * 1.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'selection-ring';
  ring.visible = false;
  group.add(ring);

  group.position.set(placement.xM, 0, placement.yM);
  group.userData.placementId = placement.id;
  return group;
}


function buildBoundaryMesh(plan: GardenPlan, ground: GroundFn = FLAT, cellM = 1e9): THREE.Mesh {
  const geom = drapedPolygon(plan.boundary, ground, 0.04, cellM);
  // Winding depends on the user's click order while drawing (arbitrary) —
  // verified against the real triangulation output, not assumed — so a
  // one-sided material would randomly render the fill invisible from above
  // for some plans. DoubleSide is the robust fix, not winding-detection.
  const mat = new THREE.MeshStandardMaterial({ color: 0x15803d, transparent: true, opacity: 0.15, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Name tag for an area: a camera-facing sprite drawn on a canvas, always on
 *  top (depthTest off) so plants can't hide it. `heightM` = world height. */
function buildLabelSprite(text: string, heightM: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fontPx = 64;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = fontPx + 24;
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = '#1c1917';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, opacity: 0.75 }));
  sprite.scale.set(heightM * canvas.width / canvas.height, heightM, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** One area as a translucent colored sheet just above the ground (each one a
 *  hair higher than the previous to avoid z-fighting where areas overlap),
 *  with an outline and a name tag. `userData.areaId` marks it for picking. */
function buildAreaObject(area: GardenPlanArea, index: number, selected: boolean, labelH: number, ground: GroundFn = FLAT, cellM = 1e9): THREE.Group {
  const group = new THREE.Group();
  group.userData.areaId = area.id;
  const y = 0.07 + index * 0.02;
  const geom = drapedPolygon(area.points, ground, y, cellM);
  const fill = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    color: area.color, transparent: true, opacity: selected ? 0.65 : 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 * (index + 2),
  }));
  fill.receiveShadow = true;
  fill.userData.areaId = area.id;
  group.add(fill);
  const outlinePts = drapedOutline(area.points, ground, y + 0.01, cellM);
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePts), new THREE.LineBasicMaterial({ color: area.color })));
  if (area.name) {
    const c = polygonCentroid(area.points);
    const label = buildLabelSprite(area.name, labelH);
    label.position.set(c.xM, labelH * 0.8 + ground(c.xM, c.yM), c.yM);
    group.add(label);
  }
  return group;
}

function buildGroundMesh(widthM: number, heightM: number, ground: GroundFn = FLAT, cellM = 1e9): THREE.Mesh {
  const sx = Math.max(1, Math.min(96, Math.round(widthM / cellM))), sy = Math.max(1, Math.min(96, Math.round(heightM / cellM)));
  const geom = new THREE.PlaneGeometry(widthM, heightM, sx, sy);
  geom.rotateX(-Math.PI / 2);
  geom.translate(widthM / 2, 0, heightM / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, ground(pos.getX(i), pos.getZ(i)));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({ color: 0xc9dba4, roughness: 1, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  return mesh;
}

function boundaryCentroid(plan: GardenPlan): { x: number; z: number } {
  if (plan.boundary.length === 0) return { x: plan.areaWidthM / 2, z: plan.areaHeightM / 2 };
  const sum = plan.boundary.reduce((acc, p) => ({ x: acc.x + p.xM, z: acc.z + p.yM }), { x: 0, z: 0 });
  return { x: sum.x / plan.boundary.length, z: sum.z / plan.boundary.length };
}

export function createGardenPlan3DView(
  container: HTMLElement,
  plan: GardenPlan,
  plantsById: Map<string, PlantData>,
  callbacks: GardenPlan3DCallbacks,
  opts: View3DOptions,
): GardenPlan3DView {
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xbfdbfe);
  scene.background = sky;

  const VFOV = 50;
  const maxDim = Math.max(plan.areaWidthM, plan.areaHeightM, 2);
  const camera = new THREE.PerspectiveCamera(VFOV, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.1, 400000); // far: unlimited zoom-out (log depth keeps precision)
  const { x: cx, z: cz } = boundaryCentroid(plan);
  camera.position.set(cx + maxDim * 0.6, maxDim * 0.8, cz + maxDim * 0.6);
  // Terrain: heights relative to the plan centre, so the camera, sun path
  // and everything else keep working around y = 0.
  const terrain = opts.terrain ?? null;
  const baseH = terrain ? sampleGrid(terrain, cx, cz) : 0;
  const ground: GroundFn = terrain ? (x, z) => sampleGrid(terrain, x, z) - baseH : FLAT;
  const groundMin = terrain ? gridRange(terrain).min - baseH : 0;

  // Logarithmic depth: ground, map, outline and areas lie millimetres apart
  // while the view reaches hundreds of metres — a linear depth buffer can't
  // separate them there and they z-fight into stripes.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // ── Light: sky/ground fill + a shadow-casting sun placed by setSunTime() ──
  const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x6b7f4a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = true;
  // Shadow frustum covers the plan and every building around it (OSM, up to
  // ~150 m away) — otherwise buildings outside it cast no shadow while their
  // neighbours do. A larger area gets a larger shadow map to stay sharp;
  // biases scale with the texel size against acne / striped artifacts.
  let shadowR = maxDim * 0.75;
  for (const b of opts.buildings ?? []) for (const p of b.pts) shadowR = Math.max(shadowR, Math.hypot(p.xM - cx, p.yM - cz) + 5);
  let sunDist = 0;
  function fitShadow(r: number) {
    shadowR = Math.min(Math.max(shadowR, r), 450);
    const mapSize = shadowR > 60 ? Math.min(4096, renderer.capabilities.maxTextureSize) : 2048;
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as any; // re-created at the new size on the next render
    }
    const texel = (2 * shadowR) / mapSize;
    const d = sunDist;
    sunDist = Math.max(maxDim * 3, shadowR * 2);
    if (d > 0 && d !== sunDist) sun.position.sub(sun.target.position).multiplyScalar(sunDist / d).add(sun.target.position);
    Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 0.5, far: sunDist + shadowR * 2 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = texel * 1.5;
  }
  fitShadow(shadowR);
  sun.shadow.radius = 2; // soft edges (PCF)
  sun.target.position.set(cx, 0, cz);
  scene.add(sun, sun.target);

  // Surrounding meadow so shadows and the sun path have context.
  const meadow = new THREE.Mesh(
    new THREE.CircleGeometry(100000, 64), // reaches the horizon at any zoom
    new THREE.MeshStandardMaterial({ color: 0xa8bd84, roughness: 1 }),
  );
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(cx, groundMin - 0.3, cz); // below the lowest terrain point
  meadow.receiveShadow = true;
  scene.add(meadow);

  const lawn = buildGroundMesh(plan.areaWidthM, plan.areaHeightM, ground, terrain?.cellM);
  scene.add(lawn);

  // ── Map background on the ground (OSM / coarse satellite). Reloaded for
  // the visible area after every camera move, so zooming out shows the
  // surroundings at a coarser tile zoom — down to region scale. Tiles are
  // laid out in the local east/south frame and turned with the plan (same
  // mapping as the rotate(−θ) in 2D, here around the vertical axis). The old
  // tile set stays (slightly lowered) until the new one has loaded. ──
  const geo = plan.geo;
  const tileSrc = sourceForGeo(geo);
  // With terrain the surroundings get relief too, even without a map: the
  // tiles are then plain meadow-coloured.
  const layoutSrc = tileSrc ?? (terrain ? OSM_TILES : null);
  const tileLoader = new THREE.TextureLoader();
  tileLoader.setCrossOrigin('anonymous');
  let tileGroup: THREE.Group | null = null;
  let oldTileGroup: THREE.Group | null = null;
  let tileKey = '';
  if (layoutSrc) lawn.visible = false; // the map/terrain tiles are the ground inside the plan too

  // Ground outside the fine grid: coarser terrain tiles at the map's zoom,
  // blended into the fine grid over its outer margin so the plan area keeps
  // exactly the heights the plants stand on.
  const fine = terrain ? { minX: terrain.minX, minY: terrain.minY, maxX: terrain.minX + (terrain.nx - 1) * terrain.cellM, maxY: terrain.minY + (terrain.ny - 1) * terrain.cellM } : null;
  const blendM = fine ? Math.max(10, Math.min(40, (fine.maxX - fine.minX) * 0.15)) : 1;
  // The coarse tiles and the fine grid (often an official 1 m model with its
  // own height datum) differ by an offset of up to several metres; without
  // removing it the blend band showed as a step in a square around the plan.
  // Median difference along the inner edge of the band, per tile zoom.
  const coarseOffset = new Map<number, number>();
  function offsetFor(tz: number): number {
    const hit = coarseOffset.get(tz);
    if (hit !== undefined || !geo || !fine) return hit ?? 0;
    const d: number[] = [];
    const x0 = fine.minX + blendM, x1 = fine.maxX - blendM, z0 = fine.minY + blendM, z1 = fine.maxY - blendM;
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      for (const [x, z] of [[x0 + (x1 - x0) * f, z0], [x0 + (x1 - x0) * f, z1], [x0, z0 + (z1 - z0) * f], [x1, z0 + (z1 - z0) * f]]) {
        const ll = planToLatLon({ xM: x, yM: z }, geo);
        const e = terrainTiles.elevation(ll.lat, ll.lon, tz);
        if (e !== null) d.push(ground(x, z) - (e - baseH));
      }
    }
    d.sort((a, b) => a - b);
    const off = d.length ? d[d.length >> 1] : 0;
    coarseOffset.set(tz, off);
    return off;
  }
  function groundWide(x: number, z: number, tz: number): number {
    if (!geo || !fine) return ground(x, z);
    const inside = Math.min(x - fine.minX, fine.maxX - x, z - fine.minY, fine.maxY - z);
    if (inside >= blendM) return ground(x, z);
    const ll = planToLatLon({ xM: x, yM: z }, geo);
    const e = terrainTiles.elevation(ll.lat, ll.lon, tz);
    if (e === null) return ground(x, z);
    const coarse = e - baseH + offsetFor(tz);
    if (inside <= 0) return coarse;
    const w = inside / blendM;
    return ground(x, z) * w + coarse * (1 - w);
  }
  let lowestY = groundMin;

  function disposeTiles(g: THREE.Group | null) {
    if (!g) return;
    g.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = (m as any).material as THREE.MeshStandardMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    });
    scene.remove(g);
  }

  function refreshTiles() {
    if (!geo || !layoutSrc) return;
    const t = controls.target;
    const R = Math.max(maxDim * 1.5, camera.position.distanceTo(t) * 1.8);
    const rect = { minX: t.x - R, minY: t.z - R, maxX: t.x + R, maxY: t.z + R };
    const tiles = tilesForRect(rect, geo, (2 * R) / 2048, layoutSrc.maxZoom);
    const key = tiles.map(q => `${q.z}/${q.x}/${q.y}`).join(',');
    if (!tiles.length || key === tileKey) return;
    tileKey = key;
    if (!terrain) { buildTiles(tiles, -1); return; }
    // Terrain ~2 zoom levels coarser than the map: 64 px per map tile is
    // plenty for ≤ 48 segments, and it keeps the downloads few.
    terrainTiles.ensureRect(geo, rect, tiles[0].z - 2)
      .then(tz => { if (tileKey === key) buildTiles(tiles, tz); })
      .catch(() => { if (tileKey === key) buildTiles(tiles, -1); });
  }

  function buildTiles(tiles: ReturnType<typeof tilesForRect>, tz: number) {
    if (!geo || !layoutSrc) return;
    disposeTiles(oldTileGroup);
    oldTileGroup = tileGroup;
    if (oldTileGroup) oldTileGroup.position.y = -0.02;
    const next = new THREE.Group();
    next.rotation.y = geo.rotationDeg * Math.PI / 180;
    tileGroup = next;
    let pending = tiles.length;
    const settled = () => {
      if (--pending > 0 || tileGroup !== next) return;
      disposeTiles(oldTileGroup);
      oldTileGroup = null;
      requestRender();
    };
    for (const q of tiles) {
      const seg = terrain ? Math.max(1, Math.min(48, Math.round(q.sizeM / terrain.cellM))) : 1;
      const g = new THREE.PlaneGeometry(q.sizeM * 1.002, q.sizeM * 1.002, seg, seg);
      g.rotateX(-Math.PI / 2);
      const mx = q.eM + q.sizeM / 2, mz = q.sM + q.sizeM / 2;
      if (terrain) {
        // Vertex → plan coords through the group's rotation about y.
        const th = geo.rotationDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
        const pos = g.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i) + mx, lz = pos.getZ(i) + mz;
          const px = lx * ct + lz * st, pz = -lx * st + lz * ct;
          const y = tz >= 0 ? groundWide(px, pz, tz) : ground(px, pz);
          pos.setY(i, y);
          if (y < lowestY) lowestY = y;
        }
        g.computeVertexNormals();
      }
      const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: tileSrc ? 0xffffff : 0xb5c98f });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(mx, 0, mz);
      mesh.receiveShadow = true;
      if (!tileSrc) { next.add(mesh); settled(); continue; }
      mesh.visible = false; // until its texture has arrived
      const onTex = (tex: THREE.Texture) => {
        if (tileGroup !== next && oldTileGroup !== next) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.visible = true;
        requestRender();
        settled();
      };
      // Aerial-photo service not answering → coarse satellite / OSM instead.
      const fb = fallbackTileUrl(tileSrc, q.z, q.x, q.y);
      tileLoader.load(tileUrl(tileSrc, q.z, q.x, q.y), onTex, undefined, () => {
        if (!fb) { settled(); return; }
        opts.onTileFallback?.();
        tileLoader.load(fb, onTex, undefined, settled);
      });
      next.add(mesh);
    }
    scene.add(next);
    // Valleys around the plan may lie below the fine grid's lowest point.
    meadow.position.y = Math.min(meadow.position.y, lowestY - 0.5);
    requestRender();
  }
  const drapeCell = terrain ? Math.max(0.5, terrain.cellM / 2) : 1e9;
  scene.add(buildBoundaryMesh(plan, ground, drapeCell));

  // Buildings: walls from the lowest ground point of the footprint (so slopes
  // don't leave them floating) up to the roof edge, roofs from OSM roof:shape
  // or a guessed gable (building-roof.ts). All buildings share one geometry —
  // a big plan brings thousands, one mesh each meant thousands of draw calls.
  if (opts.buildings?.length) {
    const walls: number[] = [], pitched: number[] = [], flat: number[] = [];
    const push = (arr: number[], ...v: [number, number, number][]) => { for (const q of v) arr.push(q[0], q[1], q[2]); };
    type P3 = [number, number, number];
    /** Roof triangle, wound so its normal points up. */
    const pushUp = (arr: number[], a: P3, b: P3, c: P3) => {
      const ny = (c[0] - a[0]) * (b[2] - a[2]) - (c[2] - a[2]) * (b[0] - a[0]);
      if (ny >= 0) push(arr, a, b, c); else push(arr, a, c, b);
    };
    const signedArea = (r: { xM: number; yM: number }[]) => r.reduce((acc, p, i) => { const q = r[(i + 1) % r.length]; return acc + p.xM * q.yM - q.xM * p.yM; }, 0);
    /** Walls face outwards for this winding; holes the other way round. */
    const wound = (r: { xM: number; yM: number }[], hole: boolean) => ((signedArea(r) > 0) !== hole ? [...r].reverse() : r);
    for (const b of opts.buildings) {
      const zs = b.pts.map(p => ground(p.xM, p.yM));
      const base = Math.min(...zs);
      const roof = b.roof && b.roof.shape !== 'flat' && !b.holes?.length ? b.roof : null;
      const wallTop = Math.max(...zs) + Math.max(1, b.heightM - (roof?.heightM ?? 0));
      const box = roof ? orientedBox(b.pts) : null;
      const H = (p: { xM: number; yM: number }) => wallTop + (box ? roofHeightAt(roof!, box, p.xM, p.yM) : 0);
      const V = (p: { xM: number; yM: number }, y: number): [number, number, number] => [p.xM, y, p.yM];
      const ringWalls = (ring: { xM: number; yM: number }[]) => {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i], q = ring[(i + 1) % ring.length];
          push(walls, V(p, base), V(q, base), V(q, H(q)), V(p, base), V(q, H(q)), V(p, H(p)));
        }
      };
      ringWalls(wound(box ? ringWithBreaks(b.pts, roof!, box) : b.pts, false));
      for (const h of b.holes ?? []) ringWalls(wound(h, true));
      if (!box) {
        const holes = (b.holes ?? []).map(h => h.map(p => new THREE.Vector2(p.xM, p.yM)));
        const all = [...b.pts, ...(b.holes ?? []).flat()];
        for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(b.pts.map(p => new THREE.Vector2(p.xM, p.yM)), holes)) {
          pushUp(flat, V(all[i], wallTop), V(all[j], wallTop), V(all[k], wallTop));
        }
      } else {
        for (const face of roofFaces(b.pts, roof!, box)) {
          for (const [i, j, k] of THREE.ShapeUtils.triangulateShape(face.map(p => new THREE.Vector2(p.xM, p.yM)), [])) {
            pushUp(pitched, V(face[i], H(face[i])), V(face[j], H(face[j])), V(face[k], H(face[k])));
          }
        }
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([...walls, ...pitched, ...flat], 3));
    geom.addGroup(0, walls.length / 3, 0);
    geom.addGroup(walls.length / 3, pitched.length / 3, 1);
    geom.addGroup((walls.length + pitched.length) / 3, flat.length / 3, 2);
    geom.computeVertexNormals();
    const mats = [
      new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 }),
    ];
    const mesh = new THREE.Mesh(geom, mats);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const plantsGroup = new THREE.Group();
  scene.add(plantsGroup);
  const areasGroup = new THREE.Group();
  scene.add(areasGroup);
  const handlesGroup = new THREE.Group();
  scene.add(handlesGroup);
  const labelH = Math.max(0.28, maxDim * 0.032);
  const handleR = Math.max(0.12, maxDim * 0.018);
  let selectedAreaId: string | null = null;

  function rebuildAreas() {
    for (const obj of [...areasGroup.children, ...handlesGroup.children]) {
      obj.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = (m as any).material as THREE.Material & { map?: THREE.Texture };
        mat?.map?.dispose();
        mat?.dispose();
      });
    }
    areasGroup.clear();
    handlesGroup.clear();
    (plan.areas ?? []).forEach((area, i) => opts.hidden?.(area.id) || areasGroup.add(buildAreaObject(area, i, area.id === selectedAreaId, labelH, ground, drapeCell)));
    const sel = (plan.areas ?? []).find(a => a.id === selectedAreaId);
    sel?.points.forEach((p, i) => {
      // Invisible, larger pick sphere around a small visible knob.
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(handleR * 1.6, 12, 8),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      h.add(new THREE.Mesh(
        new THREE.SphereGeometry(handleR / 2, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(sel.color), emissiveIntensity: 0.6 }),
      ));
      h.position.set(p.xM, handleR / 2 + ground(p.xM, p.yM), p.yM);
      h.userData = { areaId: sel.id, vertexIndex: i };
      handlesGroup.add(h);
    });
    requestRender();
  }

  let years = plan.yearsSincePlanting;
  let armedPlantId: string | null = null;
  let selectedPlacementId: string | null = null;

  let renderQueued = false; // declared before first use: the camera fit renders early
  function rebuildPlacements() {
    // Free the old per-plant geometry (materials/textures are shared).
    plantsGroup.traverse(o => { (o as THREE.Mesh).geometry?.dispose(); });
    plantsGroup.clear();
    for (const placement of plan.placements) {
      if (!isPlanted(placement, years)) continue;   // later construction phase
      if (opts.hidden?.(placement.id)) continue;
      const mesh = buildPlantMesh(placement, plantsById.get(placement.plantId), ageAt(placement, years));
      mesh.traverse(o => { if (o.name !== 'selection-ring' && (o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      mesh.position.y = ground(placement.xM, placement.yM);
      const ring = mesh.getObjectByName('selection-ring');
      if (ring) ring.visible = placement.id === selectedPlacementId;
      plantsGroup.add(mesh);
    }
    requestRender();
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, cz);
  controls.minDistance = 1;
  controls.maxDistance = 50000; // zoom out without limit (≈ region scale)
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.enableDamping = false;
  if (opts.camera) {
    camera.position.set(...opts.camera.position);
    controls.target.set(...opts.camera.target);
  } else if (opts.fit) {
    // Straight down onto the 2D section; the tiny z offset keeps "plan up"
    // (north) at the top of the screen, like in 2D. Never below twice the
    // tallest plant, or the camera would sit inside the canopies.
    const f = opts.fit;
    const fx = (f.minX + f.maxX) / 2, fz = (f.minY + f.maxY) / 2;
    const vf = (VFOV / 2) * Math.PI / 180;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    rebuildPlacements();
    const tallest = plantsGroup.children.length ? new THREE.Box3().setFromObject(plantsGroup).max.y : 0;
    const dist = Math.max((f.maxX - f.minX) / 2 / Math.tan(hf), (f.maxY - f.minY) / 2 / Math.tan(vf), tallest * 2.5, 3);
    controls.target.set(fx, 0, fz);
    camera.position.set(fx, dist, fz + dist * 0.001);
  }
  let tileTimer: ReturnType<typeof setTimeout> | null = null;
  controls.addEventListener('change', () => {
    if (tileTimer) clearTimeout(tileTimer);
    tileTimer = setTimeout(refreshTiles, 350);
  });
  // Untouched camera → hand the original 2D section back unchanged (the
  // camera may have been raised above the canopies, which would zoom out).
  const startPos = camera.position.clone(), startTarget = controls.target.clone();
  controls.update();

  // ── Sun: position from date/time at the garden's location ──
  const RAD = Math.PI / 180;
  const sunPathGroup = new THREE.Group();
  scene.add(sunPathGroup);
  const skyR = maxDim * 1.2;
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.15, maxDim * 0.03), 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xfde047 }),
  );
  scene.add(sunBall);
  let sunPathDay = '';

  /** Sun direction as a 3D unit vector (x = plan x, y = up, z = plan y). */
  function sunVector(bearingDeg: number, altitudeDeg: number): THREE.Vector3 {
    const d = sunDirectionEnu(bearingDeg, altitudeDeg);
    const h = enuToPlan({ e: d.e, n: d.n }, opts.rotationDeg);
    return new THREE.Vector3(h.xM, d.up, h.yM);
  }

  function rebuildSunPath(date: Date, tz: string) {
    sunPathGroup.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = (m as any).material as THREE.Material & { map?: THREE.Texture };
      mat?.map?.dispose();
      mat?.dispose();
    });
    sunPathGroup.clear();
    const center = new THREE.Vector3(cx, 0, cz);
    // Midnight on the garden's clocks, so the hour marks show its local time.
    const w = wallClock(date, tz);
    const day = zonedDate(w.y, w.m, w.d, 0, 0, tz);
    const pts: THREE.Vector3[] = [];
    for (let min = 0; min <= 24 * 60; min += 10) {
      const t = new Date(day.getTime() + min * 60000);
      const p = sunPosition(t, opts.latLon.lat, opts.latLon.lon);
      if (p.altitudeDeg < -1) continue;
      pts.push(center.clone().add(sunVector(p.bearingDeg, p.altitudeDeg).multiplyScalar(skyR)));
      if (min % 60 === 0 && min > 0 && min < 24 * 60 && p.altitudeDeg > 0) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.05, maxDim * 0.008), 8, 6), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
        dot.position.copy(pts[pts.length - 1]);
        sunPathGroup.add(dot);
        if ((min / 60) % 3 === 0) {
          const lbl = buildLabelSprite(`${min / 60}`, Math.max(0.25, maxDim * 0.03));
          lbl.position.copy(pts[pts.length - 1]).add(new THREE.Vector3(0, Math.max(0.2, maxDim * 0.03), 0));
          sunPathGroup.add(lbl);
        }
      }
    }
    if (pts.length > 1) {
      sunPathGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.85 })));
    }
  }

  const SKY_DAY = new THREE.Color(0xbfdbfe), SKY_GOLD = new THREE.Color(0xfcd9a8), SKY_NIGHT = new THREE.Color(0x1e293b);
  function setSunTime(date: Date, tz = browserTimeZone()) {
    const w = wallClock(date, tz);
    const key = `${w.y}-${w.m}-${w.d}|${tz}`;
    if (key !== sunPathDay) { sunPathDay = key; rebuildSunPath(date, tz); }
    const p = sunPosition(date, opts.latLon.lat, opts.latLon.lon);
    const dir = sunVector(p.bearingDeg, p.altitudeDeg);
    const up = p.altitudeDeg > 0;
    sun.position.set(cx, 0, cz).add(dir.clone().multiplyScalar(sunDist));
    sun.intensity = up ? 2.6 * Math.min(1, Math.max(0.2, Math.sin(p.altitudeDeg * RAD) * 2)) : 0;
    sun.castShadow = up;
    hemi.intensity = up ? 0.7 + 0.5 * Math.min(1, p.altitudeDeg / 35) : 0.3;
    sunBall.visible = up;
    sunBall.position.set(cx, 0, cz).add(dir.multiplyScalar(skyR));
    if (!up) sky.copy(SKY_NIGHT).lerp(SKY_GOLD, Math.max(0, 1 + p.altitudeDeg / 6) * 0.4);
    else if (p.altitudeDeg < 10) sky.copy(SKY_GOLD).lerp(SKY_DAY, p.altitudeDeg / 10);
    else sky.copy(SKY_DAY);
    requestRender();
    return p;
  }

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderer.render(scene, camera);
    });
  }
  controls.addEventListener('change', requestRender);

  // Plugin layers (expert-api.ts): each adds its own objects to the scene.
  const layerCleanups: (() => void)[] = [];
  for (const layer of opts.layers ?? []) {
    try {
      const done = layer({ THREE, scene, plan, ground: (x, y) => ground(x, y), requestRender, coverShadow: r => { fitShadow(r); requestRender(); } });
      if (typeof done === 'function') layerCleanups.push(done);
    } catch (err) { console.warn('3D layer failed', err); }
  }

  // ── Interaction: raycasting for place/drag, letting OrbitControls handle
  // everything else untouched (see CHANGELOG.md "Gartenplan: 3D-Ansicht mit
  // vollem Editing" for why a capture-phase listener on the container, not
  // the canvas, reliably wins the race against OrbitControls' own
  // pointerdown handler). ──
  const raycaster = new THREE.Raycaster();
  /** Ray → ground point: intersect a horizontal plane, then re-intersect at
   *  the terrain height found there (converges fast on gentle slopes). */
  function intersectGround(target: THREE.Vector3): THREE.Vector3 | null {
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let hit: THREE.Vector3 | null = null;
    for (let k = 0; k < 3; k++) {
      hit = raycaster.ray.intersectPlane(pl, target);
      if (!hit) return null;
      pl.constant = -ground(hit.x, hit.z);
    }
    return hit;
  }
  const ndc = new THREE.Vector2();

  function setNdcFromEvent(e: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function findPlacementId(obj: THREE.Object3D | null): string | null {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData?.placementId) return cur.userData.placementId as string;
      cur = cur.parent;
    }
    return null;
  }

  let dragState: { placementId: string; moved: boolean; startClientX: number; startClientY: number } | null = null;

  // ── Area vertex handles: drag over the ground plane; the area's sheet is
  // re-triangulated live from a working copy, committed via callback. ──
  let vertexDrag: { areaId: string; index: number; points: { xM: number; yM: number }[]; moved: boolean } | null = null;

  function groundPointFromEvent(e: PointerEvent): THREE.Vector3 | null {
    setNdcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!intersectGround(hit)) return null;
    hit.x = Math.max(0, Math.min(plan.areaWidthM, hit.x));
    hit.z = Math.max(0, Math.min(plan.areaHeightM, hit.z));
    return hit;
  }

  function onVertexPointerMove(e: PointerEvent) {
    if (!vertexDrag) return;
    const hit = groundPointFromEvent(e);
    if (!hit) return;
    vertexDrag.moved = true;
    vertexDrag.points[vertexDrag.index] = { xM: hit.x, yM: hit.z };
    const idx = (plan.areas ?? []).findIndex(a => a.id === vertexDrag!.areaId);
    const area = plan.areas[idx];
    const old = areasGroup.children.find(c => c.userData.areaId === vertexDrag!.areaId);
    if (area && old) {
      areasGroup.remove(old);
      old.traverse(o => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = (m as any).material as THREE.Material & { map?: THREE.Texture };
        mat?.map?.dispose();
        mat?.dispose();
      });
      areasGroup.add(buildAreaObject({ ...area, points: vertexDrag.points }, idx, true, labelH, ground, drapeCell));
    }
    const handle = handlesGroup.children.find(h => h.userData.vertexIndex === vertexDrag!.index);
    handle?.position.set(hit.x, handleR / 2 + ground(hit.x, hit.z), hit.z);
    requestRender();
  }

  function onVertexPointerUp(e: PointerEvent) {
    if (!vertexDrag) return;
    const { areaId, index, moved } = vertexDrag;
    const hit = moved ? groundPointFromEvent(e) : null;
    vertexDrag = null;
    renderer.domElement.removeEventListener('pointermove', onVertexPointerMove);
    controls.enabled = true;
    if (hit) callbacks.onAreaVertexDragEnd(areaId, index, hit.x, hit.z);
    else rebuildAreas();
  }

  function onPlantPointerMove(e: PointerEvent) {
    if (!dragState) return;
    if (!dragState.moved && Math.hypot(e.clientX - dragState.startClientX, e.clientY - dragState.startClientY) > DRAG_THRESHOLD_PX) {
      dragState.moved = true;
    }
    if (!dragState.moved) return;
    setNdcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!intersectGround(hit)) return;
    const mesh = plantsGroup.children.find(c => c.userData.placementId === dragState!.placementId);
    if (mesh) mesh.position.set(hit.x, ground(hit.x, hit.z), hit.z);
    requestRender();
  }

  function onPlantPointerUp(e: PointerEvent) {
    if (!dragState) return;
    const { placementId, moved } = dragState;
    dragState = null;
    renderer.domElement.removeEventListener('pointermove', onPlantPointerMove);
    controls.enabled = true;
    if (moved) {
      setNdcFromEvent(e);
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (intersectGround(hit)) {
        // No boundary re-check here — matches the 2D drag code, which also
        // only validates the boundary on the initial placement tap, not on
        // drag-commit. Deliberate parity, not an oversight.
        callbacks.onPlacementDragEnd(placementId, hit.x, hit.z);
      }
    } else {
      selectedPlacementId = placementId;
      callbacks.onPlacementSelected(placementId);
    }
  }

  function onContainerPointerDown(e: PointerEvent) {
    setNdcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);

    const handleHit = raycaster.intersectObjects(handlesGroup.children, false)[0];
    if (handleHit) {
      const { areaId, vertexIndex } = handleHit.object.userData as { areaId: string; vertexIndex: number };
      const area = (plan.areas ?? []).find(a => a.id === areaId);
      if (area) {
        controls.enabled = false;
        vertexDrag = { areaId, index: vertexIndex, points: area.points.map(p => ({ ...p })), moved: false };
        renderer.domElement.setPointerCapture(e.pointerId);
        renderer.domElement.addEventListener('pointermove', onVertexPointerMove);
        renderer.domElement.addEventListener('pointerup', onVertexPointerUp, { once: true });
        return;
      }
    }

    const hit = raycaster.intersectObjects(plantsGroup.children, true)[0];
    const hitId = hit ? findPlacementId(hit.object) : null;

    if (hitId) {
      controls.enabled = false;
      dragState = { placementId: hitId, moved: false, startClientX: e.clientX, startClientY: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.addEventListener('pointermove', onPlantPointerMove);
      renderer.domElement.addEventListener('pointerup', onPlantPointerUp, { once: true });
      return;
    }

    if (armedPlantId) {
      const groundHit = new THREE.Vector3();
      if (intersectGround(groundHit)
        && pointInPolygon({ xM: groundHit.x, yM: groundHit.z }, plan.boundary)) {
        controls.enabled = false;
        callbacks.onGroundTap(groundHit.x, groundHit.z);
        renderer.domElement.addEventListener('pointerup', () => { controls.enabled = true; }, { once: true });
      }
    }
    // A plain click (no orbit drag) on an area selects it; anything that
    // moves is left to OrbitControls as before.
    const areaHit = raycaster.intersectObjects(areasGroup.children, true).find(h => h.object.userData.areaId);
    if (areaHit) {
      const areaId = areaHit.object.userData.areaId as string;
      const sx = e.clientX, sy = e.clientY;
      renderer.domElement.addEventListener('pointerup', (up: PointerEvent) => {
        if (Math.hypot(up.clientX - sx, up.clientY - sy) <= DRAG_THRESHOLD_PX) callbacks.onAreaSelected(areaId);
      }, { once: true });
    }
    // No hit, nothing armed: fall through untouched — OrbitControls handles it.
  }

  container.style.touchAction = 'none';
  container.addEventListener('pointerdown', onContainerPointerDown, { capture: true });

  function onResize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    requestRender();
  }
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  rebuildPlacements();
  rebuildAreas();
  refreshTiles();
  requestRender();

  // ── Function coverage: translucent coloured cells draped on the ground
  // (corner heights from the terrain) plus dashed rings at the gaps. ──
  let coverageGroup: THREE.Group | null = null;
  function setCoverage(o: CoverageOverlay3D | null) {
    if (coverageGroup) {
      coverageGroup.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      scene.remove(coverageGroup);
      coverageGroup = null;
    }
    if (o && o.cells.length) {
      const g = new THREE.Group();
      const lift = 0.12 + (plan.areas?.length ?? 0) * 0.02; // above the area sheets
      const pos: number[] = [], col: number[] = [];
      const c = new THREE.Color();
      const h = o.cellM / 2;
      for (const cell of o.cells) {
        c.setStyle(cell.color, THREE.SRGBColorSpace);
        const x0 = cell.xM - h, x1 = cell.xM + h, z0 = cell.yM - h, z1 = cell.yM + h;
        const v = (x: number, z: number) => { pos.push(x, ground(x, z) + lift, z); col.push(c.r, c.g, c.b); };
        v(x0, z0); v(x0, z1); v(x1, z0);
        v(x1, z0); v(x0, z1); v(x1, z1);
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
      mesh.renderOrder = 2;
      g.add(mesh);
      for (const gap of o.gaps) {
        const pts: THREE.Vector3[] = [];
        const n = 64;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = gap.xM + Math.cos(a) * gap.rM, z = gap.yM + Math.sin(a) * gap.rM;
          pts.push(new THREE.Vector3(x, ground(x, z) + lift + 0.02, z));
        }
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineDashedMaterial({ color: 0xb91c1c, dashSize: Math.max(0.3, gap.rM / 8), gapSize: Math.max(0.2, gap.rM / 12), depthWrite: false }));
        line.computeLineDistances();
        line.renderOrder = 3;
        g.add(line);
      }
      scene.add(g);
      coverageGroup = g;
    }
    requestRender();
  }

  // ── Water: ribbons draped on the ground (subdivided so they follow it),
  // flat translucent discs at the water level of the sinks. Flow blue,
  // swales orange like the 2D plan. ──
  let waterGroup: THREE.Group | null = null;
  function setWater(w: Water3D | null) {
    if (waterGroup) {
      waterGroup.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      scene.remove(waterGroup);
      waterGroup = null;
    }
    if (w && (w.flow.length || w.sinks.length || w.swales.length)) {
      const g = new THREE.Group();
      const lift = 0.16 + (plan.areas?.length ?? 0) * 0.02;
      const step = Math.max(0.5, (terrain?.cellM ?? 2) / 2);
      const ribbon = (arr: number[], x1: number, z1: number, x2: number, z2: number, width: number, up: number) => {
        const len = Math.hypot(x2 - x1, z2 - z1);
        if (len < 1e-6) return;
        const nx = -(z2 - z1) / len * width / 2, nz = (x2 - x1) / len * width / 2;
        const n = Math.max(1, Math.ceil(len / step));
        const at = (f: number, s: number): [number, number, number] => {
          const x = x1 + (x2 - x1) * f + nx * s, z = z1 + (z2 - z1) * f + nz * s;
          return [x, ground(x, z) + up, z];
        };
        for (let i = 0; i < n; i++) {
          const a = at(i / n, -1), b = at(i / n, 1), c = at((i + 1) / n, 1), d = at((i + 1) / n, -1);
          arr.push(...a, ...b, ...c, ...a, ...c, ...d);
        }
      };
      const mesh = (pos: number[], color: number, opacity: number, order: number) => {
        if (!pos.length) return;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const m = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
        m.renderOrder = order;
        g.add(m);
      };
      const flow: number[] = [], swales: number[] = [], sinks: number[] = [];
      for (const f of w.flow) ribbon(flow, f.x1, f.y1, f.x2, f.y2, f.width, lift);
      for (const s of w.swales) ribbon(swales, s.x1, s.y1, s.x2, s.y2, s.width, lift + 0.03);
      for (const s of w.sinks) {
        const y = ground(s.xM, s.yM) + s.depthM + 0.05;
        const n = 32;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          sinks.push(s.xM, y, s.yM, s.xM + Math.cos(a0) * s.rM, y, s.yM + Math.sin(a0) * s.rM, s.xM + Math.cos(a1) * s.rM, y, s.yM + Math.sin(a1) * s.rM);
        }
      }
      mesh(sinks, 0x0ea5e9, 0.45, 3);
      mesh(flow, 0x0284c7, 0.8, 4);
      mesh(swales, 0xd97706, 0.95, 5);
      scene.add(g);
      waterGroup = g;
    }
    requestRender();
  }

  // ── Suggestion preview: translucent plant model at its current size, the
  // function's reach as a draped green disc, and the name above it. ──
  let previewGroup: THREE.Group | null = null;
  function setPreview(pv: SuggestionPreview3D | null) {
    if (previewGroup) {
      previewGroup.traverse(obj => {
        const m = obj as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());
      });
      scene.remove(previewGroup);
      previewGroup = null;
    }
    if (pv) {
      const g = new THREE.Group();
      const { radiusM, heightM, layer, trunkM } = plantDims(pv.plant, years);
      const model = buildPlantModel('preview-' + pv.plant.id, crownShape(pv.plant, layer), radiusM, heightM, LAYER_STYLE[layer].fill, trunkM);
      model.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = false;
        const ghost = (x: THREE.Material) => { const c = x.clone(); c.transparent = true; c.opacity = 0.6; c.depthWrite = false; return c; };
        m.material = Array.isArray(m.material) ? m.material.map(ghost) : ghost(m.material);
        m.renderOrder = 4;
      });
      model.position.set(pv.xM, ground(pv.xM, pv.yM), pv.yM);
      g.add(model);
      const circle = Array.from({ length: 48 }, (_, i) => {
        const a = (i / 48) * Math.PI * 2;
        return { xM: pv.xM + Math.cos(a) * pv.reachM, yM: pv.yM + Math.sin(a) * pv.reachM };
      });
      const lift = 0.16 + (plan.areas?.length ?? 0) * 0.02;
      const disc = new THREE.Mesh(drapedPolygon(circle, ground, lift, drapeCell),
        new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
      disc.renderOrder = 3;
      g.add(disc);
      const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(drapedOutline(circle, ground, lift + 0.01, Math.max(0.5, pv.reachM / 16))),
        new THREE.LineDashedMaterial({ color: 0x15803d, dashSize: Math.max(0.3, pv.reachM / 10), gapSize: Math.max(0.2, pv.reachM / 14), depthWrite: false }));
      rim.computeLineDistances();
      rim.renderOrder = 3;
      g.add(rim);
      const label = buildLabelSprite(pv.label, Math.max(0.35, maxDim * 0.035));
      label.position.set(pv.xM, ground(pv.xM, pv.yM) + heightM + Math.max(0.4, maxDim * 0.03), pv.yM);
      g.add(label);
      scene.add(g);
      previewGroup = g;
    }
    requestRender();
  }

  function snapshot(): HTMLCanvasElement {
    // Render and copy in the same task: without preserveDrawingBuffer the
    // WebGL buffer is only valid until the next frame.
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  }

  return {
    snapshot,
    setPreview,
    setCoverage,
    setWater,
    updateYears(newYears: number) {
      years = newYears;
      rebuildPlacements();
    },
    refreshPlacements() {
      rebuildPlacements();
    },
    setArmedPlant(plantId: string | null) {
      armedPlantId = plantId;
    },
    setSunTime,
    setViewPreset(preset: 'top' | 'oblique') {
      const t = controls.target;
      const d = camera.position.distanceTo(t);
      if (preset === 'top') camera.position.set(t.x, d, t.z + d * 0.001);
      else camera.position.set(t.x, d * 0.55, t.z + d * 0.83);
      controls.update();
      requestRender();
    },
    getCameraState(): Camera3DState {
      return { position: camera.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number] };
    },
    getViewRect() {
      if (opts.fit && camera.position.distanceTo(startPos) < 1e-6 && controls.target.distanceTo(startTarget) < 1e-6) return opts.fit;
      const dist = camera.position.distanceTo(controls.target);
      const h = 2 * dist * Math.tan((VFOV / 2) * Math.PI / 180);
      const w = h * camera.aspect;
      const t = controls.target;
      return { minX: t.x - w / 2, minY: t.z - h / 2, maxX: t.x + w / 2, maxY: t.z + h / 2 };
    },
    refreshAreas(id: string | null) {
      selectedAreaId = id;
      rebuildAreas();
    },
    setSelectedPlacement(placementId: string | null) {
      selectedPlacementId = placementId;
      for (const mesh of plantsGroup.children) {
        const ring = mesh.getObjectByName('selection-ring');
        if (ring) ring.visible = mesh.userData.placementId === placementId;
      }
      requestRender();
    },
    dispose() {
      for (const done of layerCleanups) { try { done(); } catch { /* plugin */ } }
      resizeObserver.disconnect();
      if (tileTimer) clearTimeout(tileTimer);
      container.removeEventListener('pointerdown', onContainerPointerDown, { capture: true } as any);
      renderer.domElement.removeEventListener('pointermove', onPlantPointerMove);
      renderer.domElement.removeEventListener('pointermove', onVertexPointerMove);
      controls.dispose();
      scene.traverse(obj => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as any).material;
        if (Array.isArray(mat)) mat.forEach((m: THREE.Material) => m.dispose());
        else if (mat) { mat.map?.dispose(); mat.dispose(); }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };
}
