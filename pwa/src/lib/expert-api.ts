// Contract between the public app and the private expert module.
//
// The expert code lives in its own git repository (bare repo on the VPS),
// checked out at src/expert/ and ignored by this public repo. Its entry
// src/expert/index.ts default-exports an ExpertModule. Layout.astro loads it
// (expert-loader.ts) in expert mode after login; pages publish what plugins
// may use through providePageApi(). Without src/expert/ nothing of this runs
// and the public build is unchanged.
import type { FeatureDef } from './features';
import type { GardenPlan, GardenPlanPoint, PlantData, Polyculture } from './types';
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
  /** Puts a plant of the list on the plan at this point (current planting year like a click would); returns the new placement's id, null outside the plan area or without a plan. */
  placePlantAt(plantId: string, xM: number, yM: number): string | null;
  /** Direct sun hours per day at a plan point with what the plan has now (plants at the shown age, terrain, buildings, plugins' shade casters); `mode` follows the "Einfärben" choice (a chosen day, else the summer half-year). Null without a plan. */
  sunHoursAt(xM: number, yM: number): { hours: number; maxHours: number; mode: 'day' | 'season' } | null;
  /** Ground height (m above sea level) at a plan point, or null without terrain data. */
  groundAt(xM: number, yM: number): number | null;
  /** Redraw what depends on plugin data: 2D overlays, the 3D view, sun hours, hints. */
  refresh(): void;
  /** This feature's data stored with the open plan (plan.ext[featureId]); undefined when none. */
  getPluginData<T = unknown>(featureId: string): T | undefined;
  /** Stores this feature's data with the open plan (saved like any plan edit); undefined removes it. */
  setPluginData(featureId: string, data: unknown): void;
  /** Takes a GeoJSON FeatureCollection (as the planner's GeoJSON export writes it) as a plan, like the GeoJSON import; throws on unusable data. */
  importGeoJson(data: unknown): Promise<void>;
  /** A box under the selected plant(s) in the selection panel, drawn again with every change of selection; `ids` = the selected placements. */
  addSelectionExtra(featureId: string, render: (box: HTMLElement, ids: string[]) => void): void;
  /** Puts these placements on another plant of the list (saved into the list first when it is new); an undo step like any edit. */
  setPlacementPlant(placementIds: string[], plant: PlantData): Promise<void>;
  /** Whether a placement or area is hidden by some feature (setHidden). */
  isHidden(id: string): boolean;
  /** Plant name labels on the 2D plan: per placement hidden and/or scaled (1 = normal; the selected plant always shows its name); `maxPx` = how big the name may grow when zooming in (default 13 px × scale); null = back to normal. Asked again on every redraw. */
  setLabelStyle(featureId: string, fn: ((placementId: string) => { hidden?: boolean; scale?: number; maxPx?: number } | null | undefined) | null): void;
  /** Placements and areas (by id) not drawn in 2D and 3D while the feature is on; replaces the feature's earlier set. */
  setHidden(featureId: string, ids: Iterable<string>): void;
  /** What is selected on the plan: placements (single or multi-selection) and the selected area. */
  getSelection(): { placementIds: string[]; areaId: string | null };
  /** Called with the outline (plan metres) of every lasso drawn on the 2D plan, before the selection changes. */
  onLasso(cb: (polygon: GardenPlanPoint[]) => void): void;
  /** Called whenever the selection changes. */
  onSelectionChange(cb: () => void): void;
  /** Selects these placements (one, several or none), as a click or the lasso would; none also clears a selected area. */
  setSelection(placementIds: string[]): void;
  /** Room on the 2D canvas covered by floating panels (px, per side): fitting the whole plan keeps it clear. */
  setViewInset(px: { left?: number; right?: number; top?: number; bottom?: number }): void;
  /** Centers the 2D view on a plan point (metres); `widthM` = visible width, else the zoom stays. No effect in 3D. */
  centerOn(xM: number, yM: number, widthM?: number): void;
  /** Where a plan point appears on screen in the 3D view (client coordinates); null in 2D or behind the camera. */
  projectToScreen(xM: number, yM: number): { x: number; y: number } | null;
  /** The canvas height (px) comes from `fn`, asked again on every window resize; null = back to the stored or automatic height. */
  setCanvasHeight(fn: (() => number) | null): void;
  /** Called after a plan was written to the database (autosave, save button, rename). */
  onPlanSaved(cb: (plan: GardenPlan) => void): void;
  /** Called after the user deleted a plan. */
  onPlanDeleted(cb: (id: string) => void): void;
  /** Replaces the open plan's content (same id) with `data`, redraws and saves it; an undo step like any edit. */
  replacePlan(data: GardenPlan): void;
  /** While on, the open plan is shown and can be looked around in, but edits are not saved. */
  setReadOnly(on: boolean): void;
  /** Plants the open plan may refer to without being in the user's list (drawn like the others); [] removes them. */
  setExtraPlants(featureId: string, plants: PlantData[]): void;
  /** A line on each plan tile in the plan list (null = none), while the feature is on. */
  addPlanBadge(featureId: string, fn: (plan: GardenPlan) => string | null): void;
  /** A button on each plan tile in the plan list, while the feature is on; gets the plan's id and the button (e.g. to anchor a menu). `icon`: SVG markup before the label. */
  addPlanTileAction(featureId: string, label: string, onClick: (planId: string, button: HTMLElement) => void, opts?: { icon?: string }): void;
  /** Reads the plans from the database again and redraws the list (after a plugin wrote some). */
  reloadPlans(): Promise<void>;
  /** Opens a plan in the editor; false if there is no plan with that id. */
  openPlan(id: string): boolean;
  /** The undo steps around the current state: what undo would go back to and what redo would bring (null = none). */
  getHistory(): { current: GardenPlan | null; undo: GardenPlan | null; redo: GardenPlan | null };
  /** Called whenever an undo step is recorded, undone or redone, and when another plan opens. */
  onHistoryChange(cb: () => void): void;
  /** Reshapes the line the row tool places plants along (clicked points in, line to follow out); null = the clicked points as they are. */
  setRowPath(fn: ((points: GardenPlanPoint[]) => GardenPlanPoint[]) | null): void;
  /** Redraws the row tool's preview (after `setRowPath`'s output changed). */
  refreshRowDraft(): void;
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

/** What the settings page offers plugins. */
export interface EinstellungenApi {
  /** A collapsible block in the Sync section, above WebDAV (hidden whenever the feature is off); returns its body. */
  addSyncSection(featureId: string, title: string): HTMLElement;
  /** Checks a backup text, asks once with what it contains and merges it in, like a file restore;
   *  returns the summary, or null if the user cancelled. Throws on an unusable backup. */
  restoreFromText(text: string): Promise<string | null>;
  /** Redraws "last backup" / "last sync" and the sync problem line. */
  refreshSyncInfo(): void;
}

/** What the admin page offers plugins. */
export interface AdminApi {
  /** A box in the invitation form. `build` fills it and returns what it adds to the invitation (a plain JSON object, or null); `role` is the form's role select. */
  addInviteExtra(featureId: string, build: (box: HTMLElement, role: HTMLSelectElement) => (() => Promise<Record<string, unknown> | null> | Record<string, unknown> | null)): void;
}

/** What the polycultures page offers plugins. */
export interface PolykulturenApi {
  /** The polyculture open in the editor (members as currently edited), or null. */
  getEditing(): Polyculture | null;
  plantsById(): Map<string, PlantData>;
  /** Called when a polyculture opens in the editor and whenever its members change. */
  onEditorChange(cb: (pc: Polyculture | null) => void): void;
  /** A box below the members in the editor; returns its body. */
  addEditorBox(featureId: string, title: string): HTMLElement;
  /** Extra HTML at the end of each polyculture card in the list (null = none). */
  addCardExtra(featureId: string, fn: (pc: Polyculture) => string | null): void;
}

export interface PageApis {
  admin: AdminApi;
  polykulturen: PolykulturenApi;
  gartenplan: GartenplanApi;
  pflanzen: PflanzenApi;
  layout: LayoutApi;
  einstellungen: EinstellungenApi;
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
