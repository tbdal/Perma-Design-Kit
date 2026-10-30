import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GardenPlan, GardenPlanArea, GardenPlanPlacement, PlantData } from './types';
import { displayRadiusM, resolveGrowthPace, trunkRadiusM } from './growth-model';
import { deriveLayer, LAYER_STYLE, type PlantLayer } from './plant-layer';
import { buildPlantModel, buildSimplePlantModel, crownShape } from './plant-mesh-3d';
import { pointInPolygon } from './gartenplan-geometry';
import { polygonCentroid } from './gartenplan-render';
import { enuToPlan, tilesForRect, lodTilesForRect, metersPerPixel, planToLatLon, type PlanTile } from './gartenplan-geo';
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
  /** Own position (GPS) as a pole with an accuracy ring on the ground; null hides it. */
  setPositionMarker(pos: { xM: number; yM: number; accM: number } | null): void;
  updateYears(years: number): void;
  /** Resolves after the first picture is on screen (the page shows a wait animation until then). */
  firstFrame: Promise<void>;
  /** Cheap stand-in while the years slider moves: the built plants are only scaled (and the ones not planted yet
   *  in that year shrunk away); call updateYears once the slider rests for the exact shapes. */
  previewYears(years: number): void;
  /** See-through trees: 1 = solid (default), 0 = invisible. Only plants of the tree layer. */
  setTreeOpacity(opacity: number): void;
  refreshPlacements(): void;
  setArmedPlant(plantId: string | null): void;
  setSelectedPlacement(placementId: string | null): void;
  /** Rebuilds the area shapes (after add/rename/recolor/delete/vertex edit)
   *  and shows vertex handles on `selectedAreaId`. */
  refreshAreas(selectedAreaId: string | null): void;
  /** Moves the sun (light, shadows, sky, sun path) to the given moment; `timeZone` = the garden's, for the hour marks on the sun path (default: the browser's). */
  setSunTime(date: Date, timeZone?: string): { bearingDeg: number; altitudeDeg: number };
  getCameraState(): Camera3DState;
  /** Where a plan point (on the ground) appears on screen, in client
   *  coordinates; null when it is behind the camera. */
  projectToScreen(xM: number, yM: number): { x: number; y: number } | null;
  /** Moves the view over the ground (arrow keys): `right` and `forward` as fractions of the distance to the target, relative to where the camera looks. */
  panView(right: number, forward: number): void;
  /** Flies the view to a plan point (same angle); `maxDistM` = no farther away than this when it arrives, `exactDistM` = exactly this far. */
  flyTo(xM: number, yM: number, maxDistM?: number, exactDistM?: number): void;
  /** Flies to the whole plan (same viewing angle), like "Ganzen Plan zeigen" in 2D. */
  fitPlan(): void;
  /** Jump to a straight top view or an oblique view from the south. */
  setViewPreset(preset: 'top' | 'oblique'): void;
  /** Ground rectangle (plan meters) roughly visible around the camera target
   *  — used to keep the same section when switching back to 2D. */
  getViewRect(): { minX: number; minY: number; maxX: number; maxY: number };
  /** Loading state of the ground tiles on display. */
  tileStatus(): GroundTileStatus;
  /** New elevation grid (null = flat) in place: camera, renderer and sun stay, ground, buildings, plants,
   *  areas and overlays follow. false = not possible (plugin layers drew on the old ground): rebuild the view. */
  setTerrain(terrain: ElevationGrid | null): boolean;
  /** New building footprints in place (empty = none). */
  setBuildings(buildings: NonNullable<View3DOptions['buildings']>): void;
  dispose(): void;
}

export type GroundTileState = 'sharp' | 'coarse' | 'failed';
/** Ground tiles of the current view: `coarse` = replaced by the satellite / map because the aerial-photo service
 *  failed; `belowWanted` = less sharp than the screen could show (tile budget reached). */
export interface GroundTileStatus { total: number; loading: number; sharp: number; coarse: number; failed: number; belowWanted: number; }

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
  /** Called whenever ground tiles start or finish loading. */
  onTileStatus?: (status: GroundTileStatus) => void;
  /** Building footprints (plan meters) with heights, e.g. from OSM. */
  buildings?: { pts: { xM: number; yM: number }[]; heightM: number; holes?: { xM: number; yM: number }[][]; roof?: Roof }[];
  /** Extra scene content from plugins (expert-api.ts add3dLayer). */
  layers?: Scene3DLayer[];
  /** Placements and areas (by id) left out of the scene, e.g. hidden by a plugin. */
  hidden?: (id: string) => boolean;
  /** Simple 3D for weak devices: low-poly plants, no shadows, no antialiasing, pixel ratio 1. */
  simple?: boolean;
  /** Start values of setTreeOpacity / refreshAreas, so opening doesn't build plants and areas twice. */
  treeOpacity?: number;
  selectedAreaId?: string | null;
}

/** What a plugin layer gets: the scene in plan metres (x = xM, z = yM, y up). */
export interface Scene3DContext {
  THREE: typeof THREE;
  scene: THREE.Scene;
  plan: GardenPlan;
  /** Ground height at plan x/y, relative to the plan centre (as the scene uses it). */
  ground(xM: number, yM: number): number;
  requestRender(): void;
  /** Kept for modules; the shadow area now follows the view by itself (see placeShadow), so this only redraws. */
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

// Shared by all selection rings: a rebuild disposes only plant geometry, a material per ring leaked.
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide });

function buildPlantMesh(placement: GardenPlanPlacement, plant: PlantData | undefined, years: number, simple = false): THREE.Group {
  const { radiusM, heightM, layer, trunkM } = plantDims(plant, years);
  const style = LAYER_STYLE[layer];
  const group = simple
    ? buildSimplePlantModel(crownShape(plant, layer), radiusM, heightM, style.fill, trunkM)
    : buildPlantModel(placement.id, crownShape(plant, layer), radiusM, heightM, style.fill, trunkM);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radiusM * 1.05, radiusM * 1.2, 24),
    RING_MAT,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.name = 'selection-ring';
  ring.visible = false;
  group.add(ring);

  group.position.set(placement.xM, 0, placement.yM);
  group.userData.placementId = placement.id;
  group.userData.layer = layer;
  group.userData.dims = { radiusM, heightM }; // what the geometry was built for: previewYears scales from here
  return group;
}


function buildBoundaryMesh(plan: GardenPlan, ground: GroundFn = FLAT, cellM = 1e9, extraLift = 0): THREE.Mesh {
  const geom = drapedPolygon(plan.boundary, ground, 0.04 + extraLift, cellM);
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
  // Sized in the world, so zoomed in the tag would swallow the screen: never
  // taller than ~24 screen px (zoomed out it keeps its world size).
  const aspect = canvas.width / canvas.height;
  const wp = new THREE.Vector3();
  const size = new THREE.Vector2();
  sprite.onBeforeRender = (renderer, _scene, camera) => {
    const cam = camera as THREE.PerspectiveCamera;
    renderer.getSize(size);
    if (!(size.y > 0) || !cam.isPerspectiveCamera) return;
    sprite.getWorldPosition(wp);
    const worldPerPx = 2 * wp.distanceTo(cam.position) * Math.tan((cam.fov * Math.PI) / 360) / size.y;
    const h = Math.min(heightM, 24 * worldPerPx);
    sprite.scale.set(h * aspect, h, 1);
    // Hangs just above the ground spot, not at the unshrunk height.
    const gy = sprite.userData.groundY as number | undefined;
    if (gy !== undefined) sprite.position.y = gy + h * 0.8;
  };
  return sprite;
}

/** One area as a translucent colored sheet just above the ground (each one a
 *  hair higher than the previous to avoid z-fighting where areas overlap),
 *  with an outline and a name tag. `userData.areaId` marks it for picking. */
function buildAreaObject(area: GardenPlanArea, index: number, selected: boolean, labelH: number, ground: GroundFn = FLAT, cellM = 1e9, extraLift = 0): THREE.Group {
  const group = new THREE.Group();
  group.userData.areaId = area.id;
  const y = 0.07 + index * 0.02 + extraLift;
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
    label.userData.groundY = ground(c.xM, c.yM);
    label.position.set(c.xM, labelH * 0.8 + label.userData.groundY, c.yM);
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
  // and everything else keep working around y = 0. setTerrain() swaps it in place.
  let terrain = null as ElevationGrid | null, baseH = 0, ground: GroundFn = FLAT, groundMin = 0;
  // `fine` = extent of the fine grid; blendM = band over which it blends into the coarser tiles around it.
  let fine = null as { minX: number; minY: number; maxX: number; maxY: number } | null, blendM = 1;
  // drapeCell/drapeLift: how finely and how high sheets lie on the ground. On terrain the ground tiles
  // interpolate between their own vertices, which can lie a little above the heights sampled here (in hollows):
  // sheets on the ground float a bit higher there, or the ground shows through in patches.
  let drapeCell = 1e9, drapeLift = 0;
  function useTerrain(t: ElevationGrid | null) {
    terrain = t;
    baseH = t ? sampleGrid(t, cx, cz) : 0;
    ground = t ? (x, z) => sampleGrid(t, x, z) - baseH : FLAT;
    groundMin = t ? gridRange(t).min - baseH : 0;
    fine = t ? { minX: t.minX, minY: t.minY, maxX: t.minX + (t.nx - 1) * t.cellM, maxY: t.minY + (t.ny - 1) * t.cellM } : null;
    blendM = fine ? Math.max(10, Math.min(40, (fine.maxX - fine.minX) * 0.15)) : 1;
    drapeCell = t ? Math.max(0.5, t.cellM / 2) : 1e9;
    drapeLift = t ? Math.max(0.2, t.cellM * 0.12) : 0;
  }
  useTerrain(opts.terrain ?? null);

  // Logarithmic depth: ground, map, outline and areas lie millimetres apart
  // while the view reaches hundreds of metres — a linear depth buffer can't
  // separate them there and they z-fight into stripes. Not reversedDepthBuffer (three r186): it only gains
  // precision with a float depth buffer, but the canvas' own depth buffer is 24-bit integer, where reversed-Z
  // spaces depth like the standard mapping — the stripes would come back (would need a float-depth render target).
  const simple = !!opts.simple;
  const renderer = new THREE.WebGLRenderer({ antialias: !simple, alpha: false, logarithmicDepthBuffer: true, powerPreference: simple ? 'low-power' : 'default' });
  // Phones: 1.5 instead of 2 — half again fewer pixels for the alpha-tested leaf cards, hardly visible at that density.
  renderer.setPixelRatio(simple ? 1 : Math.min(window.devicePixelRatio, window.matchMedia?.('(pointer: coarse)').matches ? 1.5 : 2));
  renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
  renderer.shadowMap.enabled = !simple;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  // ── Light: sky/ground fill + a shadow-casting sun placed by setSunTime() ──
  const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x6b7f4a, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.castShadow = !simple;
  // The shadow area follows the view: a square around the point the camera looks at, as large
  // as what is seen plus a margin for casters just outside it (buildings, forest edges). A fixed
  // square around the plan left a hard edge across big plans (3 km) where the shadows stopped,
  // which looked like a giant object's shadow. Seen from very far, shadows are switched off.
  // Biases scale with the texel size against acne / striped artifacts.
  const SHADOW_MARGIN = 120, SHADOW_MAX = 2200;
  let shadowR = 0, sunDist = 0, sunUp = true;
  const sunDir = new THREE.Vector3(0.3, 1, 0.3).normalize();
  // Phones/tablets: a 4096² shadow map (64 MB, 4× the fill) costs more frame time than its sharpness is worth.
  const shadowCap = window.matchMedia?.('(pointer: coarse)').matches ? 2048 : 4096;
  function placeShadow() {
    const t = controls.target;
    const r = Math.max(40, camera.position.distanceTo(t) * 1.5 + SHADOW_MARGIN);
    sun.castShadow = sunUp && !simple && r <= SHADOW_MAX;
    shadowR = Math.min(r, SHADOW_MAX);
    const mapSize = shadowR > 60 ? Math.min(shadowCap, renderer.capabilities.maxTextureSize) : 2048;
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.map?.dispose();
      sun.shadow.map = null as any; // re-created at the new size on the next render
    }
    const texel = (2 * shadowR) / mapSize;
    sunDist = Math.max(500, shadowR * 2);
    sun.target.position.set(t.x, 0, t.z);
    sun.target.updateMatrixWorld();
    sun.position.copy(sun.target.position).addScaledVector(sunDir, sunDist);
    Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 0.5, far: sunDist + shadowR * 2 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = texel * 1.5;
  }
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

  let lawn = buildGroundMesh(plan.areaWidthM, plan.areaHeightM, ground, terrain?.cellM);
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
  let layoutSrc = tileSrc ?? (terrain ? OSM_TILES : null);
  const tileLoader = new THREE.TextureLoader();
  tileLoader.setCrossOrigin('anonymous');
  let tileGroup: THREE.Group | null = null;
  let posMarker: THREE.Group | null = null;
  let flyId = 0; // a newer flight (or none) wins
  let disposed = false; // late tile loads, timers and flights of a closed view must not render
  let oldTileGroup: THREE.Group | null = null;
  let tileKey = '', tileGen = 0; // tileGen: bumped by setTerrain, so no tile with the old heights is taken over
  if (layoutSrc) lawn.visible = false; // the map/terrain tiles are the ground inside the plan too

  // Ground outside the fine grid: coarser terrain tiles at the map's zoom,
  // blended into the fine grid over its outer margin so the plan area keeps
  // exactly the heights the plants stand on (fine, blendM: see useTerrain).
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
  function groundWide(x: number, z: number, tz: number, latLon?: { lat: number; lon: number }): number {
    if (!geo || !fine) return ground(x, z);
    const inside = Math.min(x - fine.minX, fine.maxX - x, z - fine.minY, fine.maxY - z);
    if (inside >= blendM) return ground(x, z);
    const ll = latLon ?? planToLatLon({ xM: x, yM: z }, geo);
    const e = terrainTiles.elevation(ll.lat, ll.lon, tz);
    if (e === null) return ground(x, z);
    const coarse = e - baseH + offsetFor(tz);
    if (inside <= 0) return coarse;
    const w = inside / blendM;
    return ground(x, z) * w + coarse * (1 - w);
  }
  let lowestY = groundMin;

  // One entry per ground tile, so a refresh keeps the tiles that are still
  // wanted (already loaded, no flicker) and only fetches the new ones.
  interface GroundTile { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; state: 'loading' | GroundTileState; alive: boolean; settle: () => void; }
  const groundTiles = new Map<string, GroundTile>();
  const tileAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let belowWanted = 0;
  // At most a dozen downloads at a time, in the order asked (nearest first): a few hundred uncached tiles at
  // once must not make the service or our cache in front of it fail some of them. Tiles gone meanwhile are skipped.
  const tileQueue: (() => void)[] = [];
  let tileLoads = 0;
  function loadTile(entry: GroundTile, url: string, onLoad: (tex: THREE.Texture) => void, onError: () => void) {
    const done = () => {
      tileLoads--;
      tileQueue.shift()?.();
    };
    const run = () => {
      if (!entry.alive || disposed) { tileLoads++; done(); return; }
      tileLoads++;
      tileLoader.load(url, tex => { done(); onLoad(tex); }, undefined, () => { done(); onError(); });
    };
    if (tileLoads < 12) run(); else tileQueue.push(run);
  }

  function disposeTiles(g: THREE.Group | null) {
    if (!g) return;
    g.traverse(o => {
      const m = o as THREE.Mesh;
      const entry = m.userData?.tileKey ? groundTiles.get(m.userData.tileKey) : undefined;
      if (entry?.mesh === m) { entry.alive = false; groundTiles.delete(m.userData.tileKey); }
      m.geometry?.dispose();
      const mat = (m as any).material as THREE.MeshStandardMaterial | undefined;
      mat?.map?.dispose();
      mat?.dispose();
    });
    scene.remove(g);
  }

  function tileStatus(): GroundTileStatus {
    const st: GroundTileStatus = { total: 0, loading: 0, sharp: 0, coarse: 0, failed: 0, belowWanted };
    tileGroup?.children.forEach(m => {
      const e = groundTiles.get(m.userData.tileKey);
      if (!e) return;
      st.total++;
      st[e.state]++;
    });
    return st;
  }
  const reportTiles = () => opts.onTileStatus?.(tileStatus());

  function refreshTiles() {
    if (!geo || !layoutSrc) return;
    const t = controls.target;
    const R = Math.max(maxDim * 1.5, camera.position.distanceTo(t) * 1.8);
    const rect = { minX: t.x - R, minY: t.z - R, maxX: t.x + R, maxY: t.z + R };
    const even = tilesForRect(rect, geo, (2 * R) / 2048, layoutSrc.maxZoom);
    if (!even.length) return;
    // Aerial photo / map: each tile as sharp as the screen needs it at its distance from the camera (up to the
    // service's finest zoom), within a tile budget. Plain meadow-coloured terrain needs no detail.
    let tiles = even;
    belowWanted = 0;
    if (tileSrc) {
      const th = geo.rotationDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
      const cp = camera.position;
      const lx = cp.x * ct - cp.z * st, lz = cp.x * st + cp.z * ct; // camera in the tiles' (east/south) frame
      const h = Math.abs(cp.y - t.y);
      const mPerPxAt = 2 * Math.tan((VFOV / 2) * Math.PI / 180) / Math.max(1, renderer.domElement.height);
      const mpp0 = metersPerPixel(geo.lat, 0);
      const wantZoom = (q: PlanTile) => {
        const dx = Math.max(q.eM - lx, 0, lx - q.eM - q.sizeM), dz = Math.max(q.sM - lz, 0, lz - q.sM - q.sizeM);
        const need = Math.max(1e-3, Math.hypot(dx, dz, h) * mPerPxAt);
        return Math.max(0, Math.log2(mpp0 / need));
      };
      // 256 px tiles: 256 of them ≈ 90 MB of video memory, a weak device gets a quarter, a phone half
      // (each tile is a download, a decode and a texture upload: the bulk of opening 3D there).
      const budget = simple ? 64 : window.matchMedia?.('(pointer: coarse)').matches ? 128 : 256;
      tiles = lodTilesForRect(rect, geo, layoutSrc.maxZoom, budget, wantZoom);
      belowWanted = tiles.filter(q => q.z < Math.min(layoutSrc!.maxZoom, Math.ceil(wantZoom(q) - 1e-9))).length;
      // Nearest first: they are requested first.
      tiles.sort((a, b) => wantZoom(b) - wantZoom(a) || b.z - a.z);
    }
    const key = tiles.map(q => `${q.z}/${q.x}/${q.y}`).join(',');
    if (key === tileKey) return;
    tileKey = key;
    if (!terrain) { buildTiles(tiles, -1); return; }
    // Terrain ~2 zoom levels coarser than an even map tiling: 64 px per map tile is
    // plenty for ≤ 48 segments, and it keeps the downloads few.
    terrainTiles.ensureRect(geo, rect, even[0].z - 2)
      .then(tz => { if (tileKey === key) buildTiles(tiles, tz); })
      .catch(() => { if (tileKey === key) buildTiles(tiles, -1); });
  }

  function buildTiles(tiles: PlanTile[], tz: number) {
    if (!geo || !layoutSrc) return;
    // The last complete tile set stays (slightly lowered) until the new one is complete; an unfinished one in
    // between is dropped — except for the tiles the new set takes over.
    const backdrop = oldTileGroup ?? tileGroup;
    const dropped = oldTileGroup ? tileGroup : null;
    const next = new THREE.Group();
    next.rotation.y = geo.rotationDeg * Math.PI / 180;
    tileGroup = next;
    const topZ = tiles.reduce((m, q) => Math.max(m, q.z), 0);
    let pending = tiles.length;
    const settled = () => {
      if (--pending > 0 || tileGroup !== next) return;
      disposeTiles(oldTileGroup);
      oldTileGroup = null;
      reportTiles();
      requestRender();
    };
    for (const q of tiles) {
      const tileKeyQ = `${q.z}/${q.x}/${q.y}@${tz}#${tileGen}`;
      const have = groundTiles.get(tileKeyQ);
      if (have?.alive) {
        next.add(have.mesh); // taken over: already loaded (or on its way)
        if (have.state === 'loading') have.settle = settled; else settled();
        continue;
      }
      // Coarser (= farther) tiles of a sharp-as-needed set get fewer segments: halved per zoom level from two below the finest.
      const seg = terrain ? Math.max(1, Math.min(48 >> Math.min(3, Math.max(0, topZ - q.z - 1)), Math.round(q.sizeM / terrain.cellM))) : 1;
      // On terrain a ring of extra vertices hangs from the edge as a skirt: where a fine tile meets a coarser one
      // their edges follow the ground differently, and the gap would show the sky.
      const ring = terrain ? 1 : 0, n = seg + 2 * ring;
      const side = q.sizeM * 1.002;
      const g = new THREE.PlaneGeometry(side, side, n, n);
      g.rotateX(-Math.PI / 2);
      const mx = q.eM + q.sizeM / 2, mz = q.sM + q.sizeM / 2;
      if (terrain) {
        const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
        const step = side / seg, clamp = (i: number) => Math.min(Math.max(i - ring, 0), seg);
        for (let iy = 0; iy <= n; iy++) for (let ix = 0; ix <= n; ix++) {
          const i = iy * (n + 1) + ix, cx = clamp(ix), cy = clamp(iy);
          pos.setX(i, -side / 2 + cx * step); pos.setZ(i, -side / 2 + cy * step);
          uv.setXY(i, cx / seg, 1 - cy / seg);
        }
        // Vertex → plan coords through the group's rotation about y.
        const th = geo.rotationDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
        // Lat/lon at the tile's corners, bilinear in between (Mercator is near-linear across a tile; ~15 m off
        // on a 25 km one) instead of planToLatLon per vertex.
        const ll = [0, 1].flatMap(fz => [0, 1].map(fx => {
          const lx = mx + (fx - 0.5) * side, lz = mz + (fz - 0.5) * side;
          return planToLatLon({ xM: lx * ct + lz * st, yM: -lx * st + lz * ct }, geo);
        }));
        const lerp = (k: 'lat' | 'lon', fx: number, fz: number) => (ll[0][k] * (1 - fx) + ll[1][k] * fx) * (1 - fz) + (ll[2][k] * (1 - fx) + ll[3][k] * fx) * fz;
        for (let i = 0; i < pos.count; i++) {
          const lx = pos.getX(i) + mx, lz = pos.getZ(i) + mz;
          const px = lx * ct + lz * st, pz = -lx * st + lz * ct;
          const fx = pos.getX(i) / side + 0.5, fz = pos.getZ(i) / side + 0.5;
          const y = tz >= 0 ? groundWide(px, pz, tz, { lat: lerp('lat', fx, fz), lon: lerp('lon', fx, fz) }) : ground(px, pz);
          pos.setY(i, y);
          if (y < lowestY) lowestY = y;
        }
        // Normals while the skirt still lies flat at the edge (its faces have no area then), then let it hang.
        g.computeVertexNormals();
        const nrm = g.attributes.normal as THREE.BufferAttribute, skirt = 1 + step / 2;
        for (let iy = 0; iy <= n; iy++) for (let ix = 0; ix <= n; ix++) {
          if (ix > 0 && ix < n && iy > 0 && iy < n) continue;
          const i = iy * (n + 1) + ix, j = (clamp(iy) + ring) * (n + 1) + clamp(ix) + ring;
          pos.setY(i, pos.getY(i) - skirt);
          nrm.setXYZ(i, nrm.getX(j), nrm.getY(j), nrm.getZ(j));
        }
      }
      const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: tileSrc ? 0xffffff : 0xb5c98f });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(mx, 0, mz);
      mesh.receiveShadow = true;
      mesh.userData.tileKey = tileKeyQ;
      const entry: GroundTile = { mesh, mat, state: tileSrc ? 'loading' : 'sharp', alive: true, settle: settled };
      groundTiles.set(tileKeyQ, entry);
      next.add(mesh);
      if (!tileSrc) { settled(); continue; }
      mesh.visible = false; // until its texture has arrived
      const onTex = (tex: THREE.Texture, state: GroundTileState) => {
        if (!entry.alive) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = tileAniso;
        mat.map?.dispose();
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.visible = true;
        const first = entry.state === 'loading';
        entry.state = state;
        requestRender();
        if (first) entry.settle(); else reportTiles();
      };
      const fail = () => {
        if (!entry.alive || entry.state !== 'loading') return;
        entry.state = 'failed';
        entry.settle();
      };
      // Aerial-photo service not answering → coarse satellite / OSM instead.
      const fb = fallbackTileUrl(tileSrc, q.z, q.x, q.y);
      const url = tileUrl(tileSrc, q.z, q.x, q.y);
      // A tile that fails once is tried again (twice, a little later) before the coarse picture takes its place — a busy
      // moment of the service or of our cache must not leave a blurry patch on the ground — and the sharp one is fetched
      // once more later and swapped in if it works by then.
      const attempt = (left: number) => loadTile(entry, url, tex => onTex(tex, 'sharp'), () => {
        if (left > 0 && entry.alive) { setTimeout(() => attempt(left - 1), left === 2 ? 600 : 1800); return; }
        if (!fb) { fail(); return; }
        opts.onTileFallback?.();
        loadTile(entry, fb, tex => onTex(tex, 'coarse'), fail);
        setTimeout(() => {
          if (!entry.alive) return;
          loadTile(entry, url, tex => onTex(tex, 'sharp'), () => { /* stays coarse */ });
        }, 20000);
      });
      attempt(2);
    }
    disposeTiles(dropped);
    oldTileGroup = backdrop;
    if (oldTileGroup) oldTileGroup.position.y = -0.02;
    scene.add(next);
    // Valleys around the plan may lie below the fine grid's lowest point.
    meadow.position.y = Math.min(meadow.position.y, lowestY - 0.5);
    reportTiles();
    requestRender();
  }
  let boundaryMesh = buildBoundaryMesh(plan, ground, drapeCell, drapeLift);
  scene.add(boundaryMesh);

  // Buildings: walls from the lowest ground point of the footprint (so slopes
  // don't leave them floating) up to the roof edge, roofs from OSM roof:shape
  // or a guessed gable (building-roof.ts). All buildings share one geometry —
  // a big plan brings thousands, one mesh each meant thousands of draw calls.
  let buildingList = opts.buildings ?? [];
  let buildingsMesh: THREE.Mesh | null = null;
  function buildBuildings() {
    if (buildingsMesh) {
      scene.remove(buildingsMesh);
      buildingsMesh.geometry.dispose();
      (buildingsMesh.material as THREE.Material[]).forEach(m => m.dispose());
      buildingsMesh = null;
    }
    if (!buildingList.length) return;
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
    for (const b of buildingList) {
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
    buildingsMesh = mesh;
  }
  buildBuildings();

  const plantsGroup = new THREE.Group();
  scene.add(plantsGroup);
  // Plants are drawn batched: one draw call per material instead of 2–3 per plant (hundreds of plants stay
  // fluid). Simple 3D shares its geometry → InstancedMesh per shape and colour; full 3D has its own geometry per
  // plant part → BatchedMesh per material (foliage kinds, bark, stake, see-through copies; vertex colours,
  // alphaTest and the leaf-shaped shadow depth material all work batched).
  // The per-plant groups stay in plantsGroup, hidden, for picking and dragging.
  const instGroup = new THREE.Group();
  scene.add(instGroup);
  const instancesOf = new Map<string, { mesh: THREE.InstancedMesh | THREE.BatchedMesh; index: number; part: THREE.Object3D }[]>();
  const tmpM = new THREE.Matrix4();
  function buildInstances() {
    for (const c of instGroup.children) (c as THREE.InstancedMesh | THREE.BatchedMesh).dispose();
    instGroup.clear();
    instancesOf.clear();
    plantsGroup.updateMatrixWorld(true);
    const parts = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; list: { part: THREE.Mesh; id: string }[] }>();
    for (const g of plantsGroup.children) {
      const id = g.userData.placementId as string;
      g.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'selection-ring' || Array.isArray(m.material)) return;
        const k = simple ? `${m.geometry.uuid}|${(m.material as THREE.Material).uuid}` : `${m.material.uuid}|${m.customDepthMaterial?.uuid}`;
        let e = parts.get(k);
        if (!e) parts.set(k, e = { geo: m.geometry, mat: m.material as THREE.Material, list: [] });
        e.list.push({ part: m, id });
        m.visible = false;
      });
    }
    const track = (mesh: THREE.InstancedMesh | THREE.BatchedMesh, index: number, part: THREE.Object3D, id: string) => {
      const arr = instancesOf.get(id) ?? [];
      arr.push({ mesh, index, part });
      instancesOf.set(id, arr);
    };
    if (!simple) {
      for (const { mat, list } of parts.values()) {
        let verts = 0, idx = 0;
        for (const { part } of list) { verts += part.geometry.attributes.position.count; idx += part.geometry.index?.count ?? 0; }
        try {
          const batch = new THREE.BatchedMesh(list.length, verts, idx, mat);
          batch.customDepthMaterial = list[0].part.customDepthMaterial;
          batch.castShadow = batch.receiveShadow = true;
          const ids = list.map(({ part }) => {
            const i = batch.addInstance(batch.addGeometry(part.geometry));
            batch.setMatrixAt(i, part.matrixWorld);
            return i;
          });
          list.forEach(({ part, id }, k) => track(batch, ids[k], part, id));
          batch.computeBoundingSphere();
          instGroup.add(batch);
        } catch (err) {
          // Parts that don't fit one batch (inconsistent attributes) are simply drawn on their own.
          console.warn('3D batching failed', err);
          for (const { part } of list) part.visible = true;
        }
      }
      return;
    }
    for (const { geo, mat, list } of parts.values()) {
      const inst = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(({ part, id }, i) => {
        inst.setMatrixAt(i, part.matrixWorld);
        track(inst, i, part, id);
      });
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      instGroup.add(inst);
    }
  }
  /** After a plant group moved (drag in 3D): its instances follow. */
  function syncInstances(placementId: string) {
    const list = instancesOf.get(placementId);
    if (!list) return;
    for (const { mesh, index, part } of list) {
      part.updateWorldMatrix(true, false);
      mesh.setMatrixAt(index, tmpM.copy(part.matrixWorld));
      if ('isInstancedMesh' in mesh) mesh.instanceMatrix.needsUpdate = true;
      mesh.boundingSphere = null; // recomputed lazily, else the moved plant is culled with the old sphere
    }
  }
  const areasGroup = new THREE.Group();
  scene.add(areasGroup);
  const handlesGroup = new THREE.Group();
  scene.add(handlesGroup);
  const labelH = Math.max(0.28, maxDim * 0.032);
  const handleR = Math.max(0.12, maxDim * 0.018);
  let selectedAreaId: string | null = opts.selectedAreaId ?? null;

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
    (plan.areas ?? []).forEach((area, i) => opts.hidden?.(area.id) || areasGroup.add(buildAreaObject(area, i, area.id === selectedAreaId, labelH, ground, drapeCell, drapeLift)));
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
  /** Trees see-through: one shared see-through copy per original material (instancing keeps working). */
  let treeOpacity = Math.min(1, Math.max(0, opts.treeOpacity ?? 1));
  const treeMats = new Map<THREE.Material, THREE.Material>();
  function seeThroughTrees(group: THREE.Object3D) {
    group.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.name === 'selection-ring' || Array.isArray(m.material)) return;
      let c = treeMats.get(m.material);
      if (!c) { c = m.material.clone(); c.transparent = true; treeMats.set(m.material, c); }
      c.opacity = treeOpacity;
      c.depthWrite = treeOpacity > 0.75;
      m.material = c;
    });
  }
  let armedPlantId: string | null = null;
  let selectedPlacementId: string | null = null;

  let renderQueued = false; // declared before first use: the camera fit renders early
  // The first picture waits for the shaders, compiled in parallel where the browser can (KHR_parallel_shader_compile):
  // the page stays responsive (its wait animation runs) instead of freezing on the first frame.
  let compiled = false;
  let firstFrameDone = () => {};
  const firstFrame = new Promise<void>(r => { firstFrameDone = r; });
  function rebuildPlacements() {
    // Free the old per-plant geometry (materials/textures are shared).
    plantsGroup.traverse(o => { if (!simple || o.name === 'selection-ring') (o as THREE.Mesh).geometry?.dispose(); });
    plantsGroup.clear();
    for (const placement of plan.placements) {
      if (opts.hidden?.(placement.id)) continue;
      // A later construction phase is built too, shrunk away: the years slider (previewYears) can then show it
      // without a rebuild.
      const planted = isPlanted(placement, years);
      const mesh = buildPlantMesh(placement, plantsById.get(placement.plantId), Math.max(planted ? 0 : 1, ageAt(placement, years)), simple);
      if (!planted) mesh.scale.setScalar(1e-4);
      if (!simple) mesh.traverse(o => { if (o.name !== 'selection-ring' && (o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (treeOpacity < 1 && mesh.userData.layer === 'tree') seeThroughTrees(mesh);
      mesh.position.y = ground(placement.xM, placement.yM);
      const ring = mesh.getObjectByName('selection-ring');
      if (ring) ring.visible = placement.id === selectedPlacementId;
      plantsGroup.add(mesh);
    }
    buildInstances();
    requestRender();
  }

  rebuildPlacements(); // once, before the camera fit (which measures the tallest plant)

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(cx, 0, cz);
  controls.minDistance = 1;
  controls.maxDistance = 50000; // zoom out without limit (≈ region scale)
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.enableDamping = false;
  // Moving the view (right / Cmd / Ctrl / Shift + drag, two fingers) slides over the ground at the same height —
  // in screen space an oblique view climbed or sank with every drag.
  controls.screenSpacePanning = false;
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
  controls.addEventListener('change', placeShadow);
  placeShadow();
  // Untouched camera → hand the original 2D section back unchanged (the
  // camera may have been raised above the canopies, which would zoom out).
  const startPos = camera.position.clone(), startTarget = controls.target.clone();
  controls.update();

  // ── Compass (bottom left): the needle shows where north is; a click turns the view to look north ──
  const northV = (() => { const h = enuToPlan({ e: 0, n: 1 }, opts.rotationDeg); const l = Math.hypot(h.xM, h.yM) || 1; return { x: h.xM / l, z: h.yM / l }; })();
  if (!document.getElementById('pdk-compass-css')) {
    document.head.appendChild(Object.assign(document.createElement('style'), { id: 'pdk-compass-css', textContent: `
.pdk-compass{position:absolute;left:var(--scale-left,12px);bottom:12px;z-index:12;width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 2px 8px rgba(0,0,0,.28);border:1px solid #d6d3d1;padding:0;cursor:pointer;touch-action:manipulation}
.dark .pdk-compass{background:rgba(41,37,36,.92);border-color:#57534e}
.pdk-compass:hover{background:#fff}.dark .pdk-compass:hover{background:#292524}
.pdk-compass svg{display:block;width:100%;height:100%;transition:transform .08s linear}
html.pdk-feld .pdk-compass{bottom:84px;left:12px}` }));
  }
  const compass = document.createElement('button');
  compass.type = 'button';
  compass.className = 'pdk-compass';
  compass.dataset.compass = '';
  const de = (document.documentElement.lang || 'de').startsWith('de');
  compass.title = de ? 'Nach Norden ausrichten' : 'Turn to face north';
  compass.setAttribute('aria-label', compass.title);
  compass.innerHTML = '<svg viewBox="-24 -24 48 48" aria-hidden="true"><g data-needle><path d="M0 -17 L6 3 L0 -1 L-6 3 Z" fill="#dc2626"/><path d="M0 17 L6 -3 L0 1 L-6 -3 Z" fill="#a8a29e"/><text x="0" y="-18.5" text-anchor="middle" font-size="9" font-weight="800" fill="#7f1d1d" stroke="#fff" stroke-width="2.2" paint-order="stroke" font-family="system-ui,sans-serif">N</text></g></svg>';
  container.appendChild(compass);
  const needle = compass.querySelector<SVGGElement>('[data-needle]')!;
  /** Where north lies on the screen, in degrees clockwise from "up" (up = the way the camera looks). */
  function updateCompass() {
    const fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
    const fl = Math.hypot(fx, fz);
    // looking straight down: the camera's up vector decides what is "up" on screen
    const f = fl > 1e-6 ? { x: fx / fl, z: fz / fl } : { x: -camera.up.x || 0, z: -camera.up.z || -1 };
    const right = { x: -f.z, z: f.x };
    const ang = Math.atan2(northV.x * right.x + northV.z * right.z, northV.x * f.x + northV.z * f.z) * 180 / Math.PI;
    needle.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
    compass.dataset.angle = ang.toFixed(1);
  }
  controls.addEventListener('change', updateCompass);
  updateCompass();
  let northAnim = 0;
  let northTimer: ReturnType<typeof setTimeout> | undefined;
  compass.addEventListener('click', () => {
    // The camera moves round the target on its circle (same height, same distance) to the south of it, looking north.
    const t = controls.target, c0 = camera.position.clone();
    // Straight above the target the circle has no size: a hair south of it makes "up" on screen north without touching camera.up
    // (a sideways up vector rolled the whole view by 90° as soon as the person moved it).
    const dist = Math.max(Math.hypot(c0.x - t.x, c0.z - t.z), 0.002 * Math.max(1, Math.abs(c0.y - t.y)));
    camera.up.set(0, 1, 0);
    const to = new THREE.Vector3(t.x - northV.x * dist, c0.y, t.z - northV.z * dist);
    const a0 = Math.atan2(c0.z - t.z, c0.x - t.x);
    let da = Math.atan2(to.z - t.z, to.x - t.x) - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));                    // the short way round
    const t0 = performance.now(), D = 420;
    cancelAnimationFrame(northAnim);
    clearTimeout(northTimer);
    let finished = false;
    const step = (now: number) => {
      if (finished) return;
      const k = Math.min(1, (now - t0) / D), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (k >= 1) finished = true;
      const a = a0 + da * e;
      camera.position.set(t.x + Math.cos(a) * dist, c0.y, t.z + Math.sin(a) * dist);
      controls.update();
      requestRender();
      if (k < 1) northAnim = requestAnimationFrame(step);
    };
    northAnim = requestAnimationFrame(step);
    // frames can stall (hidden tab, busy page): the end position is reached anyway
    northTimer = setTimeout(() => step(t0 + D), D + 120);
  });

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
    sunDir.copy(dir);
    sunUp = up;
    placeShadow();
    sun.intensity = up ? 2.6 * Math.min(1, Math.max(0.2, Math.sin(p.altitudeDeg * RAD) * 2)) : 0;
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
    if (renderQueued || disposed) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      if (!compiled || disposed) return;
      renderer.render(scene, camera);
      firstFrameDone();
    });
  }
  controls.addEventListener('change', requestRender);

  // Plugin layers (expert-api.ts): each adds its own objects to the scene.
  const layerCleanups: (() => void)[] = [];
  for (const layer of opts.layers ?? []) {
    try {
      const done = layer({ THREE, scene, plan, ground: (x, y) => ground(x, y), requestRender, coverShadow: () => requestRender() });
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

  let dragState: { placementId: string; moved: boolean; startClientX: number; startClientY: number; pointerId: number; lastX: number; lastY: number } | null = null;
  let handingOver = false;

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
      areasGroup.add(buildAreaObject({ ...area, points: vertexDrag.points }, idx, true, labelH, ground, drapeCell, drapeLift));
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
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    dragState.lastX = e.clientX; dragState.lastY = e.clientY;
    if (!dragState.moved && Math.hypot(e.clientX - dragState.startClientX, e.clientY - dragState.startClientY) > DRAG_THRESHOLD_PX) {
      dragState.moved = true;
    }
    if (!dragState.moved) return;
    setNdcFromEvent(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!intersectGround(hit)) return;
    const mesh = plantsGroup.children.find(c => c.userData.placementId === dragState!.placementId);
    if (mesh) { mesh.position.set(hit.x, ground(hit.x, hit.z), hit.z); syncInstances(dragState.placementId); }
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
    if (handingOver) return;
    // A second finger while the first one drags a plant: it was a pinch. The plant goes back and the first
    // finger is handed to the camera controls (they never saw it), so both fingers zoom and turn.
    if (e.pointerType === 'touch' && !e.isPrimary && dragState) {
      const d = dragState;
      dragState = null;
      renderer.domElement.removeEventListener('pointermove', onPlantPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPlantPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPlantPointerUp);
      const pl = plan.placements.find(p => p.id === d.placementId);
      const mesh = plantsGroup.children.find(c => c.userData.placementId === d.placementId);
      if (pl && mesh) { mesh.position.set(pl.xM, ground(pl.xM, pl.yM), pl.yM); syncInstances(pl.id); }
      controls.enabled = true;
      handingOver = true;
      renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { pointerId: d.pointerId, clientX: d.lastX, clientY: d.lastY, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, bubbles: true }));
      handingOver = false;
      requestRender();
      return;
    }
    if (e.pointerType === 'touch' && !e.isPrimary) return; // a pinch: the camera's
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
        renderer.domElement.addEventListener('pointercancel', onVertexPointerUp, { once: true });
        return;
      }
    }

    const hit = raycaster.intersectObjects(plantsGroup.children, true)[0];
    const hitId = hit ? findPlacementId(hit.object) : null;

    if (hitId) {
      controls.enabled = false;
      dragState = { placementId: hitId, moved: false, startClientX: e.clientX, startClientY: e.clientY, pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.addEventListener('pointermove', onPlantPointerMove);
      renderer.domElement.addEventListener('pointerup', onPlantPointerUp, { once: true });
      renderer.domElement.addEventListener('pointercancel', onPlantPointerUp, { once: true });
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

  rebuildAreas();
  refreshTiles();
  requestRender();

  // ── Function coverage: translucent coloured cells draped on the ground
  // (corner heights from the terrain) plus dashed rings at the gaps. ──
  let coverageGroup: THREE.Group | null = null;
  // Last overlays as given, so setTerrain can drape them again on the new ground.
  let lastCoverage: CoverageOverlay3D | null = null, lastWater: Water3D | null = null, lastPreview: SuggestionPreview3D | null = null;
  let lastPos: { xM: number; yM: number; accM: number } | null = null;
  function setCoverage(o: CoverageOverlay3D | null) {
    lastCoverage = o;
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
      const lift = 0.12 + (plan.areas?.length ?? 0) * 0.02 + drapeLift; // above the area sheets
      const pos: number[] = [], col: number[] = [];
      const c = new THREE.Color();
      const h = o.cellM / 2;
      // Cells larger than the terrain grid are split, so they follow the ground instead of cutting through it.
      const n = Math.max(1, Math.min(8, Math.ceil(o.cellM / drapeCell)));
      const step = o.cellM / n;
      for (const cell of o.cells) {
        c.setStyle(cell.color, THREE.SRGBColorSpace);
        const v = (x: number, z: number) => { pos.push(x, ground(x, z) + lift, z); col.push(c.r, c.g, c.b); };
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          const x0 = cell.xM - h + i * step, x1 = x0 + step, z0 = cell.yM - h + j * step, z1 = z0 + step;
          v(x0, z0); v(x0, z1); v(x1, z0);
          v(x1, z0); v(x0, z1); v(x1, z1);
        }
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
    lastWater = w;
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
      const lift = 0.16 + (plan.areas?.length ?? 0) * 0.02 + drapeLift * 1.2; // above areas and colouring
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
    lastPreview = pv;
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

  renderer.compileAsync(scene, camera).catch(() => { /* compiles on the first render instead */ }).finally(() => { compiled = true; requestRender(); });

  const view: GardenPlan3DView = {
    firstFrame,
    snapshot,
    setPreview,
    setCoverage,
    setWater,
    setTreeOpacity(v: number) {
      const next = Math.min(1, Math.max(0, v));
      if (next === treeOpacity) return;
      const swap = (treeOpacity < 1) !== (next < 1);
      treeOpacity = next;
      if (swap) { rebuildPlacements(); return; }   // between solid and see-through the materials differ
      for (const c of treeMats.values()) { c.opacity = treeOpacity; c.depthWrite = treeOpacity > 0.75; }
      requestRender();
    },
    updateYears(newYears: number) {
      years = newYears;
      renderer.shadowMap.autoUpdate = true;
      rebuildPlacements();
    },
    previewYears(newYears: number) {
      const byId = new Map(plan.placements.map(p => [p.id, p]));
      for (const g of plantsGroup.children) {
        const pl = byId.get(g.userData.placementId as string);
        const base = g.userData.dims as { radiusM: number; heightM: number } | undefined;
        if (!pl || !base) continue;
        const d = plantDims(plantsById.get(pl.plantId), ageAt(pl, newYears));
        const on = isPlanted(pl, newYears);
        const sxz = on ? d.radiusM / Math.max(1e-3, base.radiusM) : 1e-4;
        g.scale.set(sxz, on ? d.heightM / Math.max(1e-3, base.heightM) : 1e-4, sxz);
        syncInstances(pl.id);
      }
      // Shadows stay as they are while the slider moves (the shadow pass is about half of a frame); updateYears
      // turns them back on.
      renderer.shadowMap.autoUpdate = false;
      requestRender();
    },
    refreshPlacements() {
      rebuildPlacements();
    },
    setArmedPlant(plantId: string | null) {
      armedPlantId = plantId;
    },
    setSunTime,
    panView(right: number, forward: number) {
      const t = controls.target;
      const fx = t.x - camera.position.x, fz = t.z - camera.position.z, fl = Math.hypot(fx, fz) || 1;
      const f = { x: fx / fl, z: fz / fl };                       // where the camera looks, on the ground
      const d = camera.position.distanceTo(t);
      const dx = (f.x * forward + -f.z * right) * d, dz = (f.z * forward + f.x * right) * d;
      camera.position.x += dx; camera.position.z += dz;
      t.x += dx; t.z += dz;
      controls.update();
      requestRender();
    },
    flyTo(xM: number, yM: number, maxDistM?: number, exactDistM?: number) {
      const t = controls.target;
      const from = { tx: t.x, ty: t.y, tz: t.z, off: camera.position.clone().sub(t) };
      const toY = ground(xM, yM);
      const d0 = from.off.length();
      const d1 = exactDistM ?? (maxDistM ? Math.min(d0, maxDistM) : d0);
      const id = ++flyId;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const D = reduce ? 0 : 900, t0 = performance.now();
      const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
      const step = () => {
        if (id !== flyId) return;
        const k = D ? Math.min(1, (performance.now() - t0) / D) : 1, e = ease(k);
        t.set(from.tx + (xM - from.tx) * e, from.ty + (toY - from.ty) * e, from.tz + (yM - from.tz) * e);
        camera.position.copy(t).add(from.off.clone().setLength(d0 + (d1 - d0) * e));
        controls.update();
        requestRender();
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    },
    fitPlan() {
      // Distance at which the plan (with a margin) fills the view vertically and horizontally.
      const tanH = Math.tan((VFOV / 2) * Math.PI / 180);
      const d = Math.max(plan.areaHeightM / 2 / tanH, plan.areaWidthM / 2 / (tanH * camera.aspect)) * 1.15;
      this.flyTo(plan.areaWidthM / 2, plan.areaHeightM / 2, undefined, Math.max(d, controls.minDistance));
    },
    setViewPreset(preset: 'top' | 'oblique') {
      const t = controls.target;
      const d = camera.position.distanceTo(t);
      if (preset === 'top') camera.position.set(t.x, d, t.z + d * 0.001);
      else camera.position.set(t.x, d * 0.55, t.z + d * 0.83);
      controls.update();
      requestRender();
    },
    projectToScreen(xM: number, yM: number) {
      const v = new THREE.Vector3(xM, ground(xM, yM), yM).project(camera);
      if (v.z > 1) return null;
      const r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
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
    setPositionMarker(pos) {
      lastPos = pos;
      if (posMarker) {
        scene.remove(posMarker);
        posMarker.traverse(o => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as (THREE.Material & { map?: THREE.Texture | null }) | undefined;
          mat?.map?.dispose();
          mat?.dispose();
        });
        posMarker = null;
      }
      if (pos) {
        const g = new THREE.Group();
        // As in map apps: a blue dot with a white rim that keeps ~22 px on screen at any zoom,
        // plus the accuracy as a faint circle on the ground (that one in metres).
        const acc = Math.max(0.3, pos.accM);
        const area = new THREE.Mesh(new THREE.CircleGeometry(acc, 48), new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.15, depthWrite: false }));
        area.rotation.x = -Math.PI / 2; area.position.y = 0.05;
        const rim = new THREE.Mesh(new THREE.RingGeometry(acc * 0.97, acc, 64), new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.45, depthWrite: false }));
        rim.rotation.x = -Math.PI / 2; rim.position.y = 0.06;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const c = canvas.getContext('2d')!;
        c.fillStyle = 'rgba(2,132,199,0.25)'; c.beginPath(); c.arc(32, 32, 31, 0, Math.PI * 2); c.fill(); // halo
        c.fillStyle = '#ffffff'; c.beginPath(); c.arc(32, 32, 19, 0, Math.PI * 2); c.fill(); // white rim
        c.fillStyle = '#0284c7'; c.beginPath(); c.arc(32, 32, 14, 0, Math.PI * 2); c.fill(); // blue dot
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        const dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        dot.renderOrder = 11;
        const wp = new THREE.Vector3(), size = new THREE.Vector2();
        dot.onBeforeRender = (r, _s, camera) => {
          const cam = camera as THREE.PerspectiveCamera;
          r.getSize(size);
          if (!(size.y > 0) || !cam.isPerspectiveCamera) return;
          dot.getWorldPosition(wp);
          const worldPerPx = 2 * wp.distanceTo(cam.position) * Math.tan((cam.fov * Math.PI) / 360) / size.y;
          const s = 22 * worldPerPx;
          dot.scale.set(s, s, 1);
          dot.position.y = s * 0.15; // sits on the ground, a hair above it
        };
        g.add(area, rim, dot);
        g.position.set(pos.xM, ground(pos.xM, pos.yM), pos.yM);
        g.renderOrder = 10;
        scene.add(g);
        posMarker = g;
      }
      requestRender();
    },
    setSelectedPlacement(placementId: string | null) {
      selectedPlacementId = placementId;
      for (const mesh of plantsGroup.children) {
        const ring = mesh.getObjectByName('selection-ring');
        if (ring) ring.visible = mesh.userData.placementId === placementId;
      }
      requestRender();
    },
    tileStatus,
    setTerrain(t) {
      if (opts.layers?.length) return false;
      useTerrain(t);
      layoutSrc = tileSrc ?? (terrain ? OSM_TILES : null);
      scene.remove(lawn);
      lawn.geometry.dispose();
      (lawn.material as THREE.Material).dispose();
      lawn = buildGroundMesh(plan.areaWidthM, plan.areaHeightM, ground, terrain?.cellM);
      lawn.visible = !layoutSrc;
      scene.add(lawn);
      meadow.position.y = groundMin - 0.3;
      lowestY = groundMin;
      coarseOffset.clear();
      // The current tiles stay as backdrop until the new set (new heights) has loaded, as after a camera move.
      tileGen++;
      tileKey = '';
      refreshTiles();
      scene.remove(boundaryMesh);
      boundaryMesh.geometry.dispose();
      (boundaryMesh.material as THREE.Material).dispose();
      boundaryMesh = buildBoundaryMesh(plan, ground, drapeCell, drapeLift);
      scene.add(boundaryMesh);
      buildBuildings();
      rebuildPlacements();
      rebuildAreas();
      setCoverage(lastCoverage);
      setWater(lastWater);
      setPreview(lastPreview);
      view.setPositionMarker(lastPos);
      return true;
    },
    setBuildings(list) {
      buildingList = list;
      buildBuildings();
      requestRender();
    },
    dispose() {
      disposed = true;
      flyId++;
      for (const e of groundTiles.values()) e.alive = false;
      tileQueue.length = 0;
      clearTimeout(northTimer);
      for (const done of layerCleanups) { try { done(); } catch { /* plugin */ } }
      resizeObserver.disconnect();
      cancelAnimationFrame(northAnim);
      compass.remove();
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
      renderer.forceContextLoss(); // dispose() alone keeps the WebGL context until GC: ~16 rebuilds hit the browser limit
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
    },
  };
  return view;
}
