import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GardenPlan, GardenPlanArea, GardenPlanPlacement, PlantData } from './types';
import { displayRadiusM } from './growth-model';
import { deriveLayer, LAYER_STYLE, type PlantLayer } from './plant-layer';
import { seededRandom } from './blob-shape';
import { pointInPolygon } from './gartenplan-geometry';
import { polygonCentroid } from './gartenplan-render';
import { enuToPlan, tilesForRect } from './gartenplan-geo';
import { OSM_TILES, S2_TILES, tileUrl } from './gartenplan-background';
import { sunPosition, sunDirectionEnu } from './sun-position';

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

export interface GardenPlan3DView {
  updateYears(years: number): void;
  refreshPlacements(): void;
  setArmedPlant(plantId: string | null): void;
  setSelectedPlacement(placementId: string | null): void;
  /** Rebuilds the area shapes (after add/rename/recolor/delete/vertex edit)
   *  and shows vertex handles on `selectedAreaId`. */
  refreshAreas(selectedAreaId: string | null): void;
  /** Moves the sun (light, shadows, sky, sun path) to the given moment. */
  setSunTime(date: Date): { bearingDeg: number; altitudeDeg: number };
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
}

const DRAG_THRESHOLD_PX = 4;

/** Moves each vertex of an icosahedron along its own (already-normalized)
 *  position vector by a seeded ± fraction of the radius — same determinism
 *  guarantee as the 2D blob outline (blob-shape.ts): a given placement
 *  always gets the same wobbly canopy shape across re-renders/reloads. */
function jitterVertices(geometry: THREE.BufferGeometry, seed: string, wobble: number, radius: number) {
  const rand = seededRandom(seed);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const scale = 1 - wobble / 2 + rand() * wobble;
    v.multiplyScalar(radius * scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function buildPlantMesh(placement: GardenPlanPlacement, plant: PlantData | undefined, years: number): THREE.Group {
  const group = new THREE.Group();
  const radiusM = plant ? displayRadiusM(plant, years) : 0.2;
  const layer: PlantLayer = plant ? deriveLayer(plant) : 'shrub';
  const style = LAYER_STYLE[layer];

  if (layer === 'tree') {
    // These floors exist only to avoid a degenerate zero-size mesh — they
    // must stay below displayRadiusM()'s own MIN_DISPLAY_RADIUS_M (0.08) run
    // through the same multipliers, or they silently override the age-based
    // scaling below that floor. The old floors (0.3 / 0.04 / 0.05) sat ABOVE
    // radiusM's guaranteed minimum scaled by these multipliers (0.08*1.2 =
    // 0.096 etc.) — for any plant whose widthM defaults to 0.5 (unset, e.g.
    // not yet PFAF-enriched), the mature trunk height (0.25*1.2 = 0.3) never
    // exceeded that floor either, so the trunk rendered at a fixed size for
    // the entire 0-30 year slider range while the canopy still visibly grew.
    const trunkHeight = Math.max(0.05, radiusM * 1.2);
    const trunkGeom = new THREE.CylinderGeometry(
      Math.max(0.01, radiusM * 0.06), Math.max(0.012, radiusM * 0.08), trunkHeight, 8,
    );
    const trunk = new THREE.Mesh(trunkGeom, new THREE.MeshStandardMaterial({ color: 0x78350f }));
    trunk.position.y = trunkHeight / 2;
    group.add(trunk);

    const canopyGeom = new THREE.IcosahedronGeometry(radiusM, 1);
    jitterVertices(canopyGeom, placement.id, style.wobble, radiusM);
    const canopy = new THREE.Mesh(canopyGeom, new THREE.MeshStandardMaterial({ color: style.fill, flatShading: true }));
    canopy.position.y = trunkHeight + radiusM * 0.7;
    group.add(canopy);
  } else if (layer === 'shrub') {
    const shrubGeom = new THREE.IcosahedronGeometry(radiusM, 1);
    jitterVertices(shrubGeom, placement.id, style.wobble, radiusM);
    shrubGeom.scale(1, 0.7, 1);
    const shrub = new THREE.Mesh(shrubGeom, new THREE.MeshStandardMaterial({ color: style.fill, flatShading: true }));
    shrub.position.y = radiusM * 0.6;
    group.add(shrub);
  } else if (layer === 'climber') {
    // A slim leafy column, as if grown up a support. No jitterVertices():
    // it projects onto a sphere and would squash the column.
    const h = Math.max(0.1, radiusM * 2);
    const columnGeom = new THREE.CylinderGeometry(radiusM * 0.35, radiusM * 0.5, h, 8);
    const column = new THREE.Mesh(columnGeom, new THREE.MeshStandardMaterial({ color: style.fill, flatShading: true }));
    column.position.y = h / 2;
    group.add(column);
  } else {
    // herb and rhizo: a low disc (rhizo in its own earthy color)
    const h = Math.max(0.08, radiusM * 0.15);
    const herbGeom = new THREE.CylinderGeometry(radiusM, radiusM * 1.1, h, 12);
    const herb = new THREE.Mesh(herbGeom, new THREE.MeshStandardMaterial({ color: style.fill }));
    herb.position.y = h / 2;
    group.add(herb);
  }

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


function buildBoundaryMesh(plan: GardenPlan): THREE.Mesh {
  const contour = plan.boundary.map(p => new THREE.Vector2(p.xM, p.yM));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const positions = new Float32Array(plan.boundary.flatMap(p => [p.xM, 0.015, p.yM]));
  const indices = triangles.flat();
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(heightM * canvas.width / canvas.height, heightM, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** One area as a translucent colored sheet just above the ground (each one a
 *  hair higher than the previous to avoid z-fighting where areas overlap),
 *  with an outline and a name tag. `userData.areaId` marks it for picking. */
function buildAreaObject(area: GardenPlanArea, index: number, selected: boolean, labelH: number): THREE.Group {
  const group = new THREE.Group();
  group.userData.areaId = area.id;
  const y = 0.03 + index * 0.01;
  const contour = area.points.map(p => new THREE.Vector2(p.xM, p.yM));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(area.points.flatMap(p => [p.xM, y, p.yM])), 3));
  geom.setIndex(triangles.flat());
  geom.computeVertexNormals();
  const fill = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    color: area.color, transparent: true, opacity: selected ? 0.65 : 0.5, side: THREE.DoubleSide, depthWrite: false, roughness: 1,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 * (index + 2),
  }));
  fill.receiveShadow = true;
  fill.userData.areaId = area.id;
  group.add(fill);
  const outlinePts = area.points.map(p => new THREE.Vector3(p.xM, y + 0.003, p.yM));
  group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePts), new THREE.LineBasicMaterial({ color: area.color })));
  if (area.name) {
    const c = polygonCentroid(area.points);
    const label = buildLabelSprite(area.name, labelH);
    label.position.set(c.xM, labelH * 0.8, c.yM);
    group.add(label);
  }
  return group;
}

function buildGroundMesh(widthM: number, heightM: number): THREE.Mesh {
  const positions = new Float32Array([
    0, 0, 0, widthM, 0, 0, widthM, 0, heightM,
    0, 0, 0, widthM, 0, heightM, 0, 0, heightM,
  ]);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
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
  sun.shadow.mapSize.set(2048, 2048);
  // Shadow frustum just covers the plan; biases scale with the shadow-map
  // texel size so big gardens don't get acne / striped shadow artifacts.
  const shadowR = maxDim * 0.75;
  const texel = (2 * shadowR) / 2048;
  Object.assign(sun.shadow.camera, { left: -shadowR, right: shadowR, top: shadowR, bottom: -shadowR, near: 0.5, far: maxDim * 8 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = texel * 1.5;
  sun.shadow.radius = 2; // soft edges (PCF)
  sun.target.position.set(cx, 0, cz);
  scene.add(sun, sun.target);

  // Surrounding meadow so shadows and the sun path have context.
  const meadow = new THREE.Mesh(
    new THREE.CircleGeometry(100000, 64), // reaches the horizon at any zoom
    new THREE.MeshStandardMaterial({ color: 0xa8bd84, roughness: 1 }),
  );
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.set(cx, -0.05, cz);
  meadow.receiveShadow = true;
  scene.add(meadow);

  const lawn = buildGroundMesh(plan.areaWidthM, plan.areaHeightM);
  scene.add(lawn);

  // ── Map background on the ground (OSM / coarse satellite). Reloaded for
  // the visible area after every camera move, so zooming out shows the
  // surroundings at a coarser tile zoom — down to region scale. Tiles are
  // laid out in the local east/south frame and turned with the plan (same
  // mapping as the rotate(−θ) in 2D, here around the vertical axis). The old
  // tile set stays (slightly lowered) until the new one has loaded. ──
  const geo = plan.geo;
  const tileSrc = geo && geo.basemap !== 'none' ? (geo.basemap === 'sat' ? S2_TILES : OSM_TILES) : null;
  const tileLoader = new THREE.TextureLoader();
  tileLoader.setCrossOrigin('anonymous');
  let tileGroup: THREE.Group | null = null;
  let oldTileGroup: THREE.Group | null = null;
  let tileKey = '';
  if (tileSrc) lawn.visible = false; // the map is the ground inside the plan too

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
    if (!geo || !tileSrc) return;
    const t = controls.target;
    const R = Math.max(maxDim * 1.5, camera.position.distanceTo(t) * 1.8);
    const tiles = tilesForRect({ minX: t.x - R, minY: t.z - R, maxX: t.x + R, maxY: t.z + R }, geo, (2 * R) / 2048, tileSrc.maxZoom);
    const key = tiles.map(q => `${q.z}/${q.x}/${q.y}`).join(',');
    if (!tiles.length || key === tileKey) return;
    tileKey = key;
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
      const g = new THREE.PlaneGeometry(q.sizeM * 1.002, q.sizeM * 1.002);
      g.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff });
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(q.eM + q.sizeM / 2, 0, q.sM + q.sizeM / 2);
      mesh.receiveShadow = true;
      mesh.visible = false; // until its texture has arrived
      tileLoader.load(tileUrl(tileSrc, q.z, q.x, q.y), tex => {
        if (tileGroup !== next && oldTileGroup !== next) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        mat.map = tex;
        mat.needsUpdate = true;
        mesh.visible = true;
        requestRender();
        settled();
      }, undefined, settled);
      next.add(mesh);
    }
    scene.add(next);
  }
  scene.add(buildBoundaryMesh(plan));

  const plantsGroup = new THREE.Group();
  scene.add(plantsGroup);
  const areasGroup = new THREE.Group();
  scene.add(areasGroup);
  const handlesGroup = new THREE.Group();
  scene.add(handlesGroup);
  const labelH = Math.max(0.4, maxDim * 0.05);
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
    (plan.areas ?? []).forEach((area, i) => areasGroup.add(buildAreaObject(area, i, area.id === selectedAreaId, labelH)));
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
      h.position.set(p.xM, handleR / 2, p.yM);
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
    plantsGroup.clear();
    for (const placement of plan.placements) {
      const mesh = buildPlantMesh(placement, plantsById.get(placement.plantId), years);
      mesh.traverse(o => { if (o.name !== 'selection-ring' && (o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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

  function rebuildSunPath(date: Date) {
    sunPathGroup.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = (m as any).material as THREE.Material & { map?: THREE.Texture };
      mat?.map?.dispose();
      mat?.dispose();
    });
    sunPathGroup.clear();
    const center = new THREE.Vector3(cx, 0, cz);
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
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
  function setSunTime(date: Date) {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (key !== sunPathDay) { sunPathDay = key; rebuildSunPath(date); }
    const p = sunPosition(date, opts.latLon.lat, opts.latLon.lon);
    const dir = sunVector(p.bearingDeg, p.altitudeDeg);
    const up = p.altitudeDeg > 0;
    sun.position.set(cx, 0, cz).add(dir.clone().multiplyScalar(maxDim * 3));
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

  // ── Interaction: raycasting for place/drag, letting OrbitControls handle
  // everything else untouched (see CHANGELOG.md "Gartenplan: 3D-Ansicht mit
  // vollem Editing" for why a capture-phase listener on the container, not
  // the canvas, reliably wins the race against OrbitControls' own
  // pointerdown handler). ──
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
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
      areasGroup.add(buildAreaObject({ ...area, points: vertexDrag.points }, idx, true, labelH));
    }
    const handle = handlesGroup.children.find(h => h.userData.vertexIndex === vertexDrag!.index);
    handle?.position.set(hit.x, handleR / 2, hit.z);
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
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return;
    const mesh = plantsGroup.children.find(c => c.userData.placementId === dragState!.placementId);
    if (mesh) mesh.position.set(hit.x, 0, hit.z);
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
      if (raycaster.ray.intersectPlane(groundPlane, hit)) {
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
      if (raycaster.ray.intersectPlane(groundPlane, groundHit)
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

  return {
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
