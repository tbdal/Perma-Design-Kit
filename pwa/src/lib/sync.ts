import {
  getAllPlants, getAllPolycultures, getAllGardenPlans, getVarietyLists,
  importPlants, importPolycultures, importGardenPlans, saveVarietyList,
} from './db';
import { loadSettings, saveSettings, type AppSettings } from './settings';
import type { PlantData, Polyculture, GardenPlan } from './types';
import type { VarietyList } from './varieties';
import { normalizePlants, normalizePolycultures, normalizeGardenPlans, normalizeVarietyLists } from './plant-normalize';
import { readPlanView, writePlanView, sanitizePlanViews, type PlanView } from './plan-view';

export const GIST_FILENAME = 'perma-design-kit-backup.json';
/** Filename earlier versions (Perma Guild Forge) wrote to — read as a
 *  fallback so existing synced Gists still import correctly. */
export const GIST_FILENAME_LEGACY = 'perma-guild-forge-backup.json';

export type SyncProvider = 'webdav' | 'gist';
export interface WebdavCreds { url: string; user: string; pass: string }
export interface GistCreds { token: string; id: string }

const ls = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
  del(k: string) { try { localStorage.removeItem(k); } catch {} },
};

export function isAutoSyncEnabled(): boolean {
  return ls.get('auto-sync-enabled') === 'true';
}

/** A backup left the device by hand (download, share sheet, file access). */
export function rememberBackupAt() {
  ls.set('last-backup-at', new Date().toISOString());
}

// ── Sync state ─────────────────────────────────────────────────────────────
// Per provider we remember which remote backup this device last wrote or read
// (its `exportedAt`) and a fingerprint of the data it pushed. Auto-sync uses
// the first to notice that another device has uploaded in the meantime, and
// the second to skip uploads when nothing changed.

const markerKey = (p: SyncProvider) => `sync-marker-${p}`;
const fingerprintKey = (p: SyncProvider) => `sync-fingerprint-${p}`;
const PROBLEM_KEY = 'auto-sync-problem';

export interface SyncProblem {
  /** conflict = the remote backup is not the one this device last saw. */
  kind: 'error' | 'conflict';
  provider: SyncProvider;
  message: string;
  at: string;
}

export function getSyncProblem(): SyncProblem | null {
  try {
    const p = JSON.parse(ls.get(PROBLEM_KEY) || 'null');
    return p && (p.kind === 'error' || p.kind === 'conflict') && (p.provider === 'webdav' || p.provider === 'gist')
      ? { kind: p.kind, provider: p.provider, message: String(p.message ?? ''), at: String(p.at ?? '') }
      : null;
  } catch { return null; }
}

export function clearSyncProblem() {
  ls.del(PROBLEM_KEY);
}

function setSyncProblem(kind: SyncProblem['kind'], provider: SyncProvider, message: string) {
  ls.set(PROBLEM_KEY, JSON.stringify({ kind, provider, message, at: new Date().toISOString() } satisfies SyncProblem));
}

/** Call when a provider's credentials are removed: the remembered remote state no longer applies. */
export function forgetSyncState(provider: SyncProvider) {
  ls.del(markerKey(provider));
  ls.del(fingerprintKey(provider));
  if (getSyncProblem()?.provider === provider) clearSyncProblem();
}

/** This device and the remote now hold the same backup (after a push or a pull). */
function rememberRemote(provider: SyncProvider, exportedAt: string, fingerprint?: string) {
  const now = new Date().toISOString();
  ls.set(markerKey(provider), exportedAt);
  if (fingerprint) ls.set(fingerprintKey(provider), fingerprint);
  ls.set('last-auto-sync-at', now);
  ls.set('last-auto-sync-provider', provider);
  clearSyncProblem();
}

// ── Building ───────────────────────────────────────────────────────────────

export interface BuiltBackup {
  json: string;
  exportedAt: string;
  /** Hash of the data without timestamp and plan views; '' if hashing is unavailable. */
  fingerprint: string;
}

async function sha256Hex(text: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

export async function buildBackup(): Promise<BuiltBackup> {
  const [plants, polycultures, gardenPlans, allLists] = await Promise.all([
    getAllPlants(), getAllPolycultures(), getAllGardenPlans(), getVarietyLists(),
  ]);
  const settings = loadSettings();
  // The Wikidata list is large and re-imported with one click — only the user's own lists travel.
  const varietyLists = allLists.filter(l => l.source !== 'wikidata');
  const views: Record<string, PlanView> = {};
  for (const g of gardenPlans) {
    const v = readPlanView(g.id);
    if (v) views[g.id] = v;
  }
  const data = { settings, plants, polycultures, gardenPlans, varietyLists };
  const exportedAt = new Date().toISOString();
  return {
    json: JSON.stringify({ version: 1, exportedAt, ...data, views }, null, 2),
    exportedAt,
    fingerprint: await sha256Hex(JSON.stringify(data)),
  };
}

export async function buildBackupJson(): Promise<string> {
  return (await buildBackup()).json;
}

// ── Reading ────────────────────────────────────────────────────────────────

export interface ParsedBackup {
  plants: PlantData[];
  polycultures: Polyculture[];
  gardenPlans: GardenPlan[];
  varietyLists: VarietyList[];
  /** Per-plan view (2D section, 3D camera, sun, colouring), only if the file carried any. */
  views?: Record<string, PlanView>;
  /** Raw settings object, if the backup carried one; loadSettings() validates it on read. */
  settings: Partial<AppSettings> | null;
}

/** Parses a backup file / Gist / WebDAV payload — either the full backup
 *  object or a bare plant array (the plant list's own JSON export). Every
 *  record is normalized; malformed ones are dropped. Throws on invalid JSON. */
export function parseBackup(text: string): ParsedBackup {
  const data: unknown = JSON.parse(text);
  const empty: ParsedBackup = { plants: [], polycultures: [], gardenPlans: [], varietyLists: [], settings: null };
  if (Array.isArray(data)) return { ...empty, plants: normalizePlants(data) };
  if (typeof data !== 'object' || data === null) return empty;
  const d = data as Record<string, unknown>;
  const gardenPlans = normalizeGardenPlans(d.gardenPlans);
  const views = sanitizePlanViews(d.views, new Set(gardenPlans.map(g => g.id)));
  return {
    plants: normalizePlants(d.plants),
    polycultures: normalizePolycultures(d.polycultures ?? d.guilds),
    gardenPlans,
    varietyLists: normalizeVarietyLists(d.varietyLists),
    ...(Object.keys(views).length ? { views } : {}),
    settings: typeof d.settings === 'object' && d.settings !== null && !Array.isArray(d.settings) ? d.settings as Partial<AppSettings> : null,
  };
}

/** True if a parsed backup holds no records at all (wrong file, empty export). */
export function backupIsEmpty(b: ParsedBackup): boolean {
  return !b.plants.length && !b.polycultures.length && !b.gardenPlans.length && !b.varietyLists.length;
}

/** Writes a parsed backup into the app. This merges: records with the same id
 *  are replaced, everything else on the device stays. Settings are replaced
 *  if the backup carries any. */
export async function applyBackup(b: ParsedBackup): Promise<void> {
  if (b.plants.length) await importPlants(b.plants);
  if (b.polycultures.length) await importPolycultures(b.polycultures);
  if (b.gardenPlans.length) await importGardenPlans(b.gardenPlans);
  for (const list of b.varietyLists) await saveVarietyList(list);
  for (const [planId, view] of Object.entries(b.views ?? {})) writePlanView(planId, view);
  if (b.settings) saveSettings(b.settings as AppSettings);
}

function exportedAtOf(text: string): string {
  try {
    const d = JSON.parse(text);
    return d && typeof d.exportedAt === 'string' ? d.exportedAt : '';
  } catch { return ''; }
}

// ── Providers ──────────────────────────────────────────────────────────────

// keepalive lets a request outlive the page (auto-sync runs when the tab is
// hidden or closed), but browsers cap such request bodies at 64 KiB.
const KEEPALIVE_MAX_BYTES = 60_000;
const fitsKeepalive = (body: string) => new Blob([body]).size < KEEPALIVE_MAX_BYTES;

const basicAuth = (c: WebdavCreds) => 'Basic ' + btoa(unescape(encodeURIComponent(`${c.user}:${c.pass}`)));

/** The remote file's text, or null if there is none yet. */
async function webdavRead(c: WebdavCreds, keepalive = false): Promise<string | null> {
  const res = await fetch(c.url, { method: 'GET', headers: { 'Authorization': basicAuth(c) }, cache: 'no-store', keepalive });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  return res.text();
}

/** Uploads the backup; returns the HTTP status. */
export async function webdavPush(c: WebdavCreds, backup: BuiltBackup, keepalive = false): Promise<number> {
  const res = await fetch(c.url, {
    method: 'PUT',
    headers: { 'Authorization': basicAuth(c), 'Content-Type': 'application/json' },
    body: backup.json,
    keepalive: keepalive && fitsKeepalive(backup.json),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
  rememberRemote('webdav', backup.exportedAt, backup.fingerprint);
  ls.set('last-backup-at', new Date().toISOString());
  return res.status;
}

/** Call after the pulled text was applied: this device now knows that remote state. */
export function rememberPulled(provider: SyncProvider, text: string) {
  rememberRemote(provider, exportedAtOf(text));
}

/** Downloads the remote backup text. Throws if there is none. */
export async function webdavPull(c: WebdavCreds): Promise<string> {
  const text = await webdavRead(c);
  if (text === null) throw new Error('HTTP 404');
  return text;
}

const gistHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' });

/** The backup file inside the Gist; null if the Gist or the file does not exist. */
async function gistRead(c: GistCreds, keepalive = false): Promise<string | null> {
  const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(c.id)}`, { headers: gistHeaders(c.token), cache: 'no-store', keepalive });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const gist = await res.json();
  const file = gist.files?.[GIST_FILENAME] ?? gist.files?.[GIST_FILENAME_LEGACY];
  if (!file) return null;
  // The API cuts file contents off at 1 MB; the full text is behind raw_url.
  if (file.truncated && typeof file.raw_url === 'string') {
    const raw = await fetch(file.raw_url, { cache: 'no-store' });
    if (!raw.ok) throw new Error(`GitHub raw ${raw.status}`);
    return raw.text();
  }
  return typeof file.content === 'string' ? file.content : null;
}

/** Uploads the backup (creates the Gist when no id is given); returns the Gist id. */
export async function gistPush(c: GistCreds, backup: BuiltBackup, keepalive = false): Promise<string> {
  const body = JSON.stringify({
    description: 'Perma Design Kit Backup',
    ...(c.id ? {} : { public: false }),
    files: { [GIST_FILENAME]: { content: backup.json } },
  });
  const res = await fetch(c.id ? `https://api.github.com/gists/${encodeURIComponent(c.id)}` : 'https://api.github.com/gists', {
    method: c.id ? 'PATCH' : 'POST',
    headers: { ...gistHeaders(c.token), 'Content-Type': 'application/json' },
    body,
    keepalive: keepalive && fitsKeepalive(body),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}${keepalive ? '' : ': ' + await res.text()}`);
  const id = String((await res.json()).id ?? c.id);
  rememberRemote('gist', backup.exportedAt, backup.fingerprint);
  ls.set('last-backup-at', new Date().toISOString());
  return id;
}

/** Downloads the backup text from the Gist; null if the Gist has no backup file. */
export async function gistPull(c: GistCreds): Promise<string | null> {
  return gistRead(c);
}

// ── Auto-sync ──────────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean;
  provider: SyncProvider | null;
  /** Nothing changed since the last upload. */
  skipped?: boolean;
  /** The remote holds a backup this device has not seen — nothing was uploaded. */
  conflict?: boolean;
  error?: string;
};

/** May this device overwrite the remote backup with the given `exportedAt`? */
function remoteIsKnown(provider: SyncProvider, remoteExportedAt: string): boolean {
  const known = ls.get(markerKey(provider));
  // No marker yet: a device that synced to this provider before this check
  // existed carries on; a device that never did must push or pull by hand once.
  if (known === null) return ls.get('last-auto-sync-provider') === provider;
  return known === remoteExportedAt;
}

async function autoSyncTo(
  provider: SyncProvider,
  read: () => Promise<string | null>,
  push: (backup: BuiltBackup) => Promise<unknown>,
): Promise<SyncResult> {
  try {
    const backup = await buildBackup();
    const problem = getSyncProblem();
    if (backup.fingerprint && backup.fingerprint === ls.get(fingerprintKey(provider)) && !problem) {
      return { ok: true, provider, skipped: true };
    }
    const remote = await read();
    if (remote !== null && !remoteIsKnown(provider, exportedAtOf(remote))) {
      setSyncProblem('conflict', provider, '');
      return { ok: false, provider, conflict: true };
    }
    await push(backup);
    return { ok: true, provider };
  } catch (e) {
    const error = (e as Error).message;
    setSyncProblem('error', provider, error);
    return { ok: false, provider, error };
  }
}

let running: Promise<SyncResult> | null = null;

/** Uploads the backup to the first configured provider (WebDAV, then Gist) if
 *  auto-sync is on, the data changed and the remote is the state this device
 *  last saw. Failures and conflicts are kept for getSyncProblem(). */
export function autoSyncIfConfigured(): Promise<SyncResult> {
  if (running) return running;
  running = runAutoSync().finally(() => { running = null; });
  return running;
}

async function runAutoSync(): Promise<SyncResult> {
  if (!isAutoSyncEnabled()) return { ok: true, provider: null };
  // Offline is not a failure worth a warning — the next change of tab retries.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: true, provider: null, skipped: true };

  const webdav: WebdavCreds = {
    url: (ls.get('webdav-url') || '').trim(),
    user: (ls.get('webdav-user') || '').trim(),
    pass: ls.get('webdav-pass') || '',
  };
  if (webdav.url && webdav.user) {
    return autoSyncTo('webdav', () => webdavRead(webdav, true), b => webdavPush(webdav, b, true));
  }

  const gist: GistCreds = { token: (ls.get('gist-token') || '').trim(), id: (ls.get('gist-id') || '').trim() };
  if (gist.token && gist.id) {
    return autoSyncTo('gist', () => gistRead(gist, true), b => gistPush(gist, b, true));
  }

  return { ok: true, provider: null };
}
