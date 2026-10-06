import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyPlant, createEmptyGardenPlan, createEmptyPolyculture, type PlantData, type Polyculture, type GardenPlan } from '../src/lib/types';
import type { VarietyList } from '../src/lib/varieties';
import type { PlanView } from '../src/lib/plan-view';

// In-memory stand-ins for IndexedDB and localStorage.
const db = { plants: [] as PlantData[], polycultures: [] as Polyculture[], gardenPlans: [] as GardenPlan[], varietyLists: [] as VarietyList[] };
const put = <T extends { id: string }>(store: T[], items: T[]) => {
  for (const item of items) {
    const i = store.findIndex(x => x.id === item.id);
    if (i >= 0) store[i] = item; else store.push(item);
  }
};
vi.mock('../src/lib/db', () => ({
  getAllPlants: async () => db.plants,
  getAllPolycultures: async () => db.polycultures,
  getAllGardenPlans: async () => db.gardenPlans,
  getVarietyLists: async () => db.varietyLists,
  importPlants: async (x: PlantData[]) => put(db.plants, x),
  importPolycultures: async (x: Polyculture[]) => put(db.polycultures, x),
  importGardenPlans: async (x: GardenPlan[]) => put(db.gardenPlans, x),
  saveVarietyList: async (x: VarietyList) => put(db.varietyLists, [x]),
}));

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

import {
  buildBackup, parseBackup, applyBackup, backupIsEmpty, autoSyncIfConfigured, getSyncProblem,
  webdavPush, rememberPulled, forgetSyncState,
} from '../src/lib/sync';
import { loadSettings, saveSettings } from '../src/lib/settings';
import { planViewKey, readPlanView } from '../src/lib/plan-view';

const plant = { ...createEmptyPlant(), id: 'p1', latinName: 'Malus domestica', commonName: 'Apfel', nitrogenFix: true };
const pc = { ...createEmptyPolyculture(), id: 'pc1', name: 'Apfelgilde', anchorPlantId: 'p1', members: [{ plantId: 'p1', role: 'other' as const, notes: 'x' }] };
const plan = {
  ...createEmptyGardenPlan(), id: 'gp1', name: 'Waldgarten',
  placements: [{ id: 'x', plantId: 'p1', xM: 1, yM: 2, notes: '' }],
  areas: [{ id: 'a1', name: 'Teich', color: '#3b82f6', points: [{ xM: 0, yM: 0 }, { xM: 2, yM: 0 }, { xM: 2, yM: 2 }] }],
  geo: { lat: 49.5, lon: 8.3, rotationDeg: 0, basemap: 'osm' as const, opacity: 0.6 },
  plantPrices: { p1: 24.5 }, startYear: 2025,
};
const csvList: VarietyList = {
  id: 'vl1', name: 'Meine Äpfel', source: 'csv', license: 'eigene Liste', importedAt: '2026-01-02T03:04:05.000Z', enabled: true,
  entries: [{ name: 'Boskoop', species: 'malus domestica', synonyms: ['Belle de Boskoop'] }],
};
const wikidataList: VarietyList = { ...csvList, id: 'wikidata-fruit', name: 'Wikidata', source: 'wikidata', entries: [{ name: 'Topaz', species: 'malus domestica', wikidataId: 'Q123' }] };
const view: PlanView = { view2d: { x: 0, y: 0, w: 100, h: 50 }, cam3d: null, mode: '2d', sun: null };

function fillDevice() {
  db.plants = [plant]; db.polycultures = [pc]; db.gardenPlans = [plan]; db.varietyLists = [csvList, wikidataList];
  store[planViewKey('gp1')] = JSON.stringify(view);
}
function emptyDevice() {
  db.plants = []; db.polycultures = []; db.gardenPlans = []; db.varietyLists = [];
  for (const k of Object.keys(store)) delete store[k];
}

beforeEach(fillDevice);
afterEach(() => { emptyDevice(); vi.unstubAllGlobals(); });

describe('backup round trip', () => {
  it('restores everything onto an empty device', async () => {
    saveSettings({ ...loadSettings(), defaultView: 'list', dotCodes: true });
    const { json } = await buildBackup();
    emptyDevice();

    const parsed = parseBackup(json);
    expect(backupIsEmpty(parsed)).toBe(false);
    await applyBackup(parsed);

    expect(db.plants).toEqual([plant]);
    expect(db.polycultures).toEqual([pc]);
    expect(db.gardenPlans).toEqual([plan]);
    expect(db.varietyLists).toEqual([csvList]);
    expect(readPlanView('gp1')).toEqual(view);
    expect(loadSettings().defaultView).toBe('list');
    expect(loadSettings().dotCodes).toBe(true);
  });

  it('leaves the Wikidata variety list out (it is re-imported with one click)', async () => {
    const parsed = parseBackup((await buildBackup()).json);
    expect(parsed.varietyLists.map(l => l.id)).toEqual(['vl1']);
  });

  it('merges: same id is replaced, other records stay', async () => {
    const { json } = await buildBackup();
    const local = { ...createEmptyPlant(), id: 'p2', latinName: 'Pyrus communis' };
    db.plants = [{ ...plant, commonName: 'geändert' }, local];
    await applyBackup(parseBackup(json));
    expect(db.plants.find(p => p.id === 'p1')?.commonName).toBe('Apfel');
    expect(db.plants.find(p => p.id === 'p2')).toEqual(local);
  });

  it('accepts a backup without plants', async () => {
    db.plants = [];
    const parsed = parseBackup((await buildBackup()).json);
    expect(parsed.plants).toEqual([]);
    expect(backupIsEmpty(parsed)).toBe(false);
    expect(parsed.gardenPlans).toHaveLength(1);
  });

  it('reads old backups and bare plant arrays, and calls unrelated JSON empty', () => {
    const old = parseBackup(JSON.stringify({ version: 1, plants: [plant], guilds: [pc] }));
    expect(old.polycultures).toHaveLength(1);
    expect(old.varietyLists).toEqual([]);
    expect(old.views).toBeUndefined();
    expect(parseBackup(JSON.stringify([plant])).plants).toHaveLength(1);
    expect(backupIsEmpty(parseBackup('{"foo":1}'))).toBe(true);
    expect(backupIsEmpty(parseBackup('42'))).toBe(true);
  });

  it('drops views of plans the backup does not contain and broken variety entries', () => {
    const parsed = parseBackup(JSON.stringify({
      gardenPlans: [plan], views: { gp1: view, nope: view },
      varietyLists: [{ ...csvList, entries: [{ name: 'Boskoop', species: 'malus domestica' }, { name: '', species: 'x' }, 7] }, { id: 'empty', entries: [] }],
    }));
    expect(Object.keys(parsed.views ?? {})).toEqual(['gp1']);
    expect(parsed.varietyLists).toHaveLength(1);
    expect(parsed.varietyLists[0].entries).toEqual([{ name: 'Boskoop', species: 'malus domestica' }]);
  });

  it('fingerprint follows the data, not the time or the view', async () => {
    const a = await buildBackup();
    store[planViewKey('gp1')] = JSON.stringify({ ...view, mode: '3d' });
    const b = await buildBackup();
    expect(b.fingerprint).toBe(a.fingerprint);
    db.plants = [{ ...plant, commonName: 'Kulturapfel' }];
    expect((await buildBackup()).fingerprint).not.toBe(a.fingerprint);
  });
});

describe('auto-sync (WebDAV)', () => {
  const creds = { url: 'https://dav.example/backup.json', user: 'u', pass: 'p' };
  /** A fake WebDAV server holding one file. */
  function server(initial: string | null = null, putStatus = 201) {
    const state = { body: initial, puts: 0, gets: 0 };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit = {}) => {
      if (init.method === 'PUT') {
        state.puts++;
        if (putStatus >= 400) return new Response('', { status: putStatus });
        state.body = String(init.body);
        return new Response(null, { status: putStatus });
      }
      state.gets++;
      return state.body === null ? new Response('', { status: 404 }) : new Response(state.body, { status: 200 });
    }));
    return state;
  }
  function configure() {
    store['auto-sync-enabled'] = 'true';
    store['webdav-url'] = creds.url; store['webdav-user'] = creds.user; store['webdav-pass'] = creds.pass;
  }

  it('does nothing when switched off', async () => {
    const s = server();
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: null });
    expect(s.gets + s.puts).toBe(0);
  });

  it('uploads once, then skips while nothing changes, and uploads again after a change', async () => {
    const s = server();
    configure();
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: 'webdav' });
    expect(s.puts).toBe(1);
    expect(parseBackup(s.body!).plants).toHaveLength(1);

    expect(await autoSyncIfConfigured()).toMatchObject({ ok: true, skipped: true });
    expect(s.puts).toBe(1);

    db.plants = [...db.plants, { ...createEmptyPlant(), id: 'p2', latinName: 'Pyrus communis' }];
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: 'webdav' });
    expect(s.puts).toBe(2);
    expect(getSyncProblem()).toBeNull();
  });

  it('does not overwrite a backup another device uploaded', async () => {
    const s = server();
    configure();
    await autoSyncIfConfigured();
    const foreign = JSON.stringify({ version: 1, exportedAt: '2030-01-01T00:00:00.000Z', plants: [{ ...plant, id: 'other' }] });
    s.body = foreign;
    db.plants = [{ ...plant, commonName: 'geändert' }];

    expect(await autoSyncIfConfigured()).toMatchObject({ ok: false, conflict: true });
    expect(s.body).toBe(foreign);
    expect(getSyncProblem()).toMatchObject({ kind: 'conflict', provider: 'webdav' });

    // Reading the remote backup in resolves it: the next run uploads the merged state.
    await applyBackup(parseBackup(foreign));
    rememberPulled('webdav', foreign);
    expect(getSyncProblem()).toBeNull();
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: 'webdav' });
    expect(parseBackup(s.body!).plants.map(p => p.id).sort()).toEqual(['other', 'p1']);
  });

  it('a device that never synced does not overwrite an existing remote backup', async () => {
    const existing = JSON.stringify({ version: 1, exportedAt: '2026-01-01T00:00:00.000Z', plants: [plant] });
    const s = server(existing);
    configure();
    expect(await autoSyncIfConfigured()).toMatchObject({ ok: false, conflict: true });
    expect(s.puts).toBe(0);

    // An explicit upload from the settings page takes over the remote.
    await webdavPush(creds, await buildBackup());
    expect(getSyncProblem()).toBeNull();
    expect(await autoSyncIfConfigured()).toMatchObject({ ok: true, skipped: true });
  });

  it('a device that auto-synced before this check existed carries on', async () => {
    const s = server(JSON.stringify({ version: 1, exportedAt: '2026-01-01T00:00:00.000Z', plants: [plant] }));
    configure();
    store['last-auto-sync-provider'] = 'webdav';
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: 'webdav' });
    expect(s.puts).toBe(1);
  });

  it('keeps a failed upload visible and retries it', async () => {
    server(null, 507);
    configure();
    expect(await autoSyncIfConfigured()).toMatchObject({ ok: false, provider: 'webdav', error: 'HTTP 507' });
    expect(getSyncProblem()).toMatchObject({ kind: 'error', provider: 'webdav', message: 'HTTP 507' });

    const s = server();
    expect(await autoSyncIfConfigured()).toEqual({ ok: true, provider: 'webdav' });
    expect(s.puts).toBe(1);
    expect(getSyncProblem()).toBeNull();
  });

  it('forgets the remembered remote state with the credentials', async () => {
    server();
    configure();
    await autoSyncIfConfigured();
    forgetSyncState('webdav');
    expect(store['sync-marker-webdav']).toBeUndefined();
    expect(store['sync-fingerprint-webdav']).toBeUndefined();
  });
});
