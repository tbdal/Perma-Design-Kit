// Contract between the public app and the private expert module.
//
// The expert code lives in its own git repository (bare repo on the VPS),
// checked out at src/expert/ and ignored by this public repo. Its entry
// src/expert/index.ts default-exports an ExpertModule. Layout.astro loads it
// (expert-loader.ts) in expert mode after login; pages publish what plugins
// may use through providePageApi(). Without src/expert/ nothing of this runs
// and the public build is unchanged.
import type { FeatureDef } from './features';
import type { GardenPlan } from './types';
import type { Lang } from './i18n/core';

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
}

export interface PageApis {
  gartenplan: GartenplanApi;
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
