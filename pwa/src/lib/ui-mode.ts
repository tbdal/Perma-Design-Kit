// Browser side of the UI modes (Einfach / Klassisch / Experte): which mode is
// active, which features are on, login state, admin overrides. The table and
// the pure rules live in features.ts; public/boot.js already applied the
// stored mode before first paint, this module keeps it up to date.
import {
  AUTH_KEY, FEATURE_CONFIG_KEY, FEATURES, LOGIN_MODES, MODE_KEY,
  effectiveMode, featureCss, initialMode, isUiMode, modesFor, offFeatures, sanitizeFeatureConfig,
  type FeatureConfig, type FeatureDef, type Role, type UiMode,
} from './features';

export interface AuthInfo { name: string; role: Role }

const CHANGE_EVENT = 'pdk-features-change';

function readJson(key: string): unknown {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage blocked: the mode then lasts for this page only */ }
}

function parseAuth(raw: unknown): AuthInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, role } = raw as Record<string, unknown>;
  return typeof name === 'string' && (role === 'expert' || role === 'team' || role === 'admin') ? { name, role } : null;
}

let config: FeatureConfig = sanitizeFeatureConfig(readJson(FEATURE_CONFIG_KEY));
let auth: AuthInfo | null = parseAuth(readJson(AUTH_KEY));
/** Private features registered by the expert module (src/expert/) at runtime. */
let extraDefs: FeatureDef[] = [];

const allDefs = (): readonly FeatureDef[] => [...FEATURES, ...extraDefs];

export const getAuth = (): AuthInfo | null => auth;
export const getFeatureConfig = (): FeatureConfig => ({ ...config });

/** The chosen mode, as stored (may be expert/team while logged out). */
export function chosenMode(): UiMode {
  let stored: string | null = null;
  let returning = false;
  try { stored = localStorage.getItem(MODE_KEY); returning = !!localStorage.getItem('pdk-welcome-seen'); } catch { /* ignore */ }
  return initialMode(stored, returning);
}

/** The mode in effect on this page. */
export function currentMode(): UiMode {
  return effectiveMode(chosenMode(), auth?.role ?? null);
}

export function featureOn(id: string): boolean {
  return modesFor(id, config, allDefs()).includes(currentMode());
}

/** Lets the expert module add its own (private) features to the table. */
export function registerFeatures(defs: readonly FeatureDef[]): void {
  extraDefs = [...extraDefs.filter(d => !defs.some(n => n.id === d.id)), ...defs.map(d => ({ ...d, private: true }))];
  applyFeatures();
}

export const registeredFeatures = (): readonly FeatureDef[] => allDefs();

function featureSheet(): CSSStyleSheet | null {
  const w = window as unknown as { __pdkFeatureSheet?: CSSStyleSheet };
  if (w.__pdkFeatureSheet) return w.__pdkFeatureSheet;
  try {
    const sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    w.__pdkFeatureSheet = sheet;
    return sheet;
  } catch { return null; }
}

/** Re-applies mode + feature visibility and tells listeners (pages re-render overlays). */
export function applyFeatures(): void {
  const mode = currentMode();
  document.documentElement.dataset.mode = mode;
  featureSheet()?.replaceSync(featureCss(offFeatures(mode, config, allDefs())));
  document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { mode } }));
}

export function onFeaturesChange(cb: (mode: UiMode) => void): void {
  document.addEventListener(CHANGE_EVENT, e => cb((e as CustomEvent<{ mode: UiMode }>).detail.mode));
}

/** Whether private code runs in this mode (expert, team). */
export const isLoginMode = (mode: UiMode): boolean => LOGIN_MODES.includes(mode);

/** Switches the mode. Entering or leaving a login mode reloads the page, so private code is mounted or gone. */
export function setMode(mode: UiMode): void {
  const before = currentMode();
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* ignore */ }
  const after = currentMode();
  if (isLoginMode(before) || isLoginMode(after)) location.reload();
  else applyFeatures();
}

/** Asks the server who is logged in. Network trouble keeps the last known state (offline use). */
export async function refreshAuth(): Promise<AuthInfo | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) setAuth(null);
    else if (res.ok) setAuth(parseAuth(await res.json()));
  } catch { /* offline */ }
  return auth;
}

function setAuth(next: AuthInfo | null): void {
  const before = auth;
  const changed = JSON.stringify(next) !== JSON.stringify(auth);
  auth = next;
  writeJson(AUTH_KEY, next);
  if (changed) {
    // Logged out elsewhere, session expired or role changed while in a login mode: reload into what is allowed.
    const was = effectiveMode(chosenMode(), before?.role ?? null);
    if (isLoginMode(was) !== isLoginMode(currentMode())) location.reload();
    else applyFeatures();
  }
}

/** Loads the admin's overrides; without the server the cached ones (or the defaults) stay. */
export async function refreshFeatureConfig(): Promise<void> {
  try {
    const res = await fetch('/api/features', { cache: 'no-store' });
    if (!res.ok) return;
    const body = await res.json() as { features?: unknown };
    const next = sanitizeFeatureConfig(body.features);
    if (JSON.stringify(next) === JSON.stringify(config)) return;
    config = next;
    writeJson(FEATURE_CONFIG_KEY, next);
    applyFeatures();
  } catch { /* offline */ }
}

export type LoginResult = { ok: true; auth: AuthInfo } | { ok: false; reason: 'credentials' | 'rate' | 'server' };

export async function login(name: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    if (res.status === 401) return { ok: false, reason: 'credentials' };
    if (res.status === 429) return { ok: false, reason: 'rate' };
    const a = res.ok ? parseAuth(await res.json()) : null;
    if (!a) return { ok: false, reason: 'server' };
    auth = a;
    writeJson(AUTH_KEY, a);
    return { ok: true, auth: a };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

/** Logs out, drops private code from the offline cache and leaves expert mode. */
export async function logout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* offline: cookie stays until it expires */ }
  auth = null;
  writeJson(AUTH_KEY, null);
  await dropPrivateCache();
  if (isLoginMode(chosenMode())) { try { localStorage.setItem(MODE_KEY, 'classic'); } catch { /* ignore */ } }
  location.reload();
}

/** Removes /x/ (private chunks) from the service worker caches. */
async function dropPrivateCache(): Promise<void> {
  if (!('caches' in window)) return;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith('/x/')) await cache.delete(req);
    }
  } catch { /* ignore */ }
}

export { isUiMode };
