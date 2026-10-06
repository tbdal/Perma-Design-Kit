// Contract between the public app and the private expert module.
//
// The expert code lives in its own git repository (bare repo on the VPS),
// checked out at src/expert/ and ignored by this public repo. Its entry
// src/expert/index.ts default-exports an ExpertModule. Layout.astro loads it
// (expert-loader.ts) in expert mode after login; pages publish what plugins
// may use through providePageApi(). Without src/expert/ nothing of this runs
// and the public build is unchanged.
import type { FeatureDef } from './features';
import type { GardenPlan, GardenPlanPoint, PlantData } from './types';
import type { Lang } from './i18n/core';
import type { Scene3DLayer } from './gartenplan-3d';
import type { Occluder } from './sun-hours';

export interface ExpertContext {
  /** Path of the current page, e.g. '/gartenplan'. */
  page: string;
  lang: Lang;
  featureOn(id: string): boolean;
  onFeaturesChange(cb: () => void): void;
  /** Resolves once the page has published that API (never, on pages without it). */
  pageApi<K extends keyof PageApis>(name: K): Promise<PageApis[K]>;
}

export interface ExpertModule {
  /** Must be the marker string from scripts/check-private.mjs: proves after
   *  each build that this code landed under /x/ and nowhere public. */
  marker: string;
  /** Private features (shown on /admin/, only ever on in expert mode). */
  features: FeatureDef[];
  mount(ctx: ExpertContext): void | Promise<void>;
}

/** What the forest garden planner offers plugins. */
export interface GartenplanApi {
  /** The plan open in the editor, or null in the plan list. */
  getPlan(): GardenPlan | null;
  /** Called after every redraw of the plan (placements, areas, outline changed). */
  onPlanChange(cb: (plan: GardenPlan | null) => void): void;
  /** Adds a collapsible box to the sidebar (hidden whenever the feature is off); returns its body. */
  addPanel(featureId: string, title: string): HTMLElement;
  /** Scene content added whenever the 3D view is built (while the feature is on). */
  add3dLayer(featureId: string, layer: Scene3DLayer): void;
  /** Extra shade casters for sun hours and shade hints (while the feature is on); groundZ = absolute ground height. */
  addSunOccluders(featureId: string, occluders: (groundZ: (x: number, y: number) => number) => Occluder[]): void;
  /** A drawing on the 2D plan (above everything, not clickable): SVG markup in plan
   *  metres; `px` = metres per screen pixel, for line widths and text sizes. Redrawn
   *  with the plan and by refresh(); the returned function redraws just the overlays. */
  addPlanOverlay(featureId: string, draw: (px: number) => string): () => void;
  /** Waits for the next tap on the 2D plan and gives its point (plan metres);
   *  null when cancelled (Esc, another pick, editor closed, 3D view open). */
  pickPoint(): Promise<GardenPlanPoint | null>;
  /** All plants of the user's list, by id (the plan's placements refer to them). */
  plantsById(): Map<string, PlantData>;
  /** Ground height (m above sea level) at a plan point, or null without terrain data. */
  groundAt(xM: number, yM: number): number | null;
  /** Redraw what depends on plugin data: 2D overlays, the 3D view, sun hours, hints. */
  refresh(): void;
}

/** What the plant list (index.astro) offers plugins. */
export interface PflanzenApi {
  /** All plants as last loaded for the list. */
  getPlants(): PlantData[];
  /** The plant open in the editor dialog (null = a new, unsaved plant). */
  getEditingPlant(): PlantData | null;
  /** The editor form's current, unsaved state. */
  readEditorForm(): PlantData;
  /** Groups currently selected in the list's group filter. */
  activeGroups(): string[];
  onEditorOpen(cb: (plant: PlantData | null) => void): void;
  /** Called after the list reloaded its plants from the database. */
  onListChange(cb: (plants: PlantData[]) => void): void;
  /** A block in the editor dialog, above its buttons (hidden whenever the feature is off). */
  addEditorSection(featureId: string): HTMLElement;
  /** A button left of the editor's Cancel/Save. */
  addEditorButton(featureId: string, label: string, onClick: () => void): HTMLButtonElement;
  /** A button in the bulk bar; gets the selected plants. */
  addBulkButton(featureId: string, label: string, onClick: (plants: PlantData[]) => void): HTMLButtonElement;
  /** An entry in the "Daten" menu. */
  addDataMenuButton(featureId: string, label: string, onClick: () => void): HTMLButtonElement;
  /** When the editor was opened with ?return=<path>, leaving waits for this (e.g. data saved along with the plant). */
  holdLeave(p: Promise<unknown>): void;
}

/** What every page (Layout.astro) offers plugins. */
export interface LayoutApi {
  /** A menu button in the header, left of the view menu; returns the (empty) drop-down panel. Hidden whenever the feature is off. accent = a colour set apart from the regular menus. */
  addHeaderMenu(featureId: string, label: string, opts?: { accent?: boolean }): HTMLElement;
  /** A link in the main navigation, after the link to `after` (a `data-nav` path, default: last). Hidden whenever the feature is off; highlighted while `href` (path and #hash) is the current page. */
  addNavLink(featureId: string, label: string, href: string, opts?: { after?: string }): HTMLAnchorElement;
}

export interface PageApis {
  gartenplan: GartenplanApi;
  pflanzen: PflanzenApi;
  layout: LayoutApi;
}

const apis = new Map<string, unknown>();
const waiting = new Map<string, ((api: unknown) => void)[]>();

export function providePageApi<K extends keyof PageApis>(name: K, api: PageApis[K]): void {
  apis.set(name, api);
  for (const resolve of waiting.get(name) ?? []) resolve(api);
  waiting.delete(name);
}

export function pageApi<K extends keyof PageApis>(name: K): Promise<PageApis[K]> {
  if (apis.has(name)) return Promise.resolve(apis.get(name) as PageApis[K]);
  return new Promise(resolve => {
    waiting.set(name, [...(waiting.get(name) ?? []), api => resolve(api as PageApis[K])]);
  });
}
