import { openDB, type DBSchema } from 'idb';
import type { PlantData, Polyculture, GardenPlan } from './types';
import type { VarietyList } from './varieties';
import { announceChange } from './data-channel';

let writes = 0;
/** Counts this tab's writes, so a page can keep its records in memory until one happens. */
export const dbWrites = () => writes;
function changed() { writes++; announceChange(); }

interface PlantDB extends DBSchema {
  plants: {
    key: string;
    value: PlantData;
    indexes: { 'by-latin': string };
  };
  polycultures: {
    key: string;
    value: Polyculture;
  };
  gardenPlans: {
    key: string;
    value: GardenPlan;
  };
  varietyLists: {
    key: string;
    value: VarietyList;
  };
}

const DB_NAME = 'permaculture-guilds';
// v3: idempotent self-healing upgrade. Some browsers ended up with a v2 DB
// that was missing the 'plants' store after an inconsistent upgrade path
// (Symptom: "Failed to execute 'transaction' … object store not found").
// Bumping to v3 forces the upgrade to run for everyone; the handler then
// checks each store individually and creates any that are missing — so
// fresh installs, legacy v1 plants-only DBs, and broken v2 DBs all
// converge to the same shape.
// v4: renamed the 'guilds' store to 'polycultures' (Gilde → Polykultur
// terminology rename). Existing records are copied over, then the old
// store is dropped, so nobody's saved polycultures disappear.
// v5: adds the 'gardenPlans' store for the Gartenplan feature. Additive/
// idempotent, same self-healing pattern as prior bumps.
// v6: adds 'varietyLists' (imported cultivar lists for the Sorte picker).
const DB_VERSION = 6;

// One shared connection per page instead of opening a fresh one on every call.
// Dropped (and re-opened on next use) if another tab upgrades the schema or
// the browser closes it, so a newer tab's upgrade is never blocked by this one.
let dbPromise: ReturnType<typeof openPlantDB> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openPlantDB();
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

/** Drops the shared connection; the next call opens a fresh one. iOS (installed app) loses the
 *  link to its IndexedDB server in the background without a close event, and transactions on the
 *  dead link then neither complete nor fail (#7). close() lets running transactions finish. */
export function reopenDB(): void {
  dbPromise?.then(db => db.close(), () => {});
  dbPromise = null;
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reopenDB(); });
}

const DB_TIMEOUT_MS = 10_000;
/** Runs one IndexedDB job; if it hangs, reopens the connection and tries once more, then throws
 *  so the page shows an error instead of waiting forever. Every job here is safe to repeat. */
async function run<T>(job: (db: Awaited<ReturnType<typeof getDB>>) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('IndexedDB timeout')), DB_TIMEOUT_MS); });
    try {
      return await Promise.race([getDB().then(job), timeout]);
    } catch (err) {
      if ((err as Error).message !== 'IndexedDB timeout' || attempt > 0) throw err;
      reopenDB();
    } finally {
      clearTimeout(timer);
    }
  }
}

function openPlantDB() {
  return openDB<PlantDB>(DB_NAME, DB_VERSION, {
    blocking() {
      // A newer version was requested elsewhere: release our handle.
      dbPromise?.then(db => db.close());
      dbPromise = null;
    },
    terminated() {
      dbPromise = null;
    },
    async upgrade(db, _oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('plants')) {
        const store = db.createObjectStore('plants', { keyPath: 'id' });
        store.createIndex('by-latin', 'latinName');
      }
      if (!db.objectStoreNames.contains('polycultures')) {
        const newStore = db.createObjectStore('polycultures', { keyPath: 'id' });
        if (db.objectStoreNames.contains('guilds' as never)) {
          const oldStore = transaction.objectStore('guilds' as never);
          const all = await oldStore.getAll();
          for (const item of all) await newStore.put(item);
          db.deleteObjectStore('guilds' as never);
        }
      }
      if (!db.objectStoreNames.contains('gardenPlans')) {
        db.createObjectStore('gardenPlans', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('varietyLists')) {
        db.createObjectStore('varietyLists', { keyPath: 'id' });
      }
    },
  });
}

export async function getAllPlants(): Promise<PlantData[]> {
  return run(db => db.getAll('plants'));
}

export async function getPlant(id: string): Promise<PlantData | undefined> {
  return run(db => db.get('plants', id));
}

export async function savePlant(plant: PlantData): Promise<void> {
  await run(async db => {
    plant.updatedAt = new Date().toISOString();
    await db.put('plants', plant);
  });
  changed();
}

export async function deletePlant(id: string): Promise<void> {
  await run(db => db.delete('plants', id));
  changed();
}

export async function importPlants(plants: PlantData[]): Promise<void> {
  await run(async db => {
    const tx = db.transaction('plants', 'readwrite');
    for (const plant of plants) {
      await tx.store.put(plant);
    }
    await tx.done;
  });
  changed();
}

export async function exportPlants(): Promise<PlantData[]> {
  return getAllPlants();
}

export async function clearAllPlants(): Promise<void> {
  await run(db => db.clear('plants'));
  changed();
}

// ── Polycultures ──────────────────────────────────────────────────────────

export async function getAllPolycultures(): Promise<Polyculture[]> {
  return run(db => db.getAll('polycultures'));
}

export async function getPolyculture(id: string): Promise<Polyculture | undefined> {
  return run(db => db.get('polycultures', id));
}

export async function savePolyculture(polyculture: Polyculture): Promise<void> {
  polyculture.updatedAt = new Date().toISOString();
  await run(db => db.put('polycultures', polyculture));
  changed();
}

export async function deletePolyculture(id: string): Promise<void> {
  await run(db => db.delete('polycultures', id));
  changed();
}

export async function importPolycultures(polycultures: Polyculture[]): Promise<void> {
  await run(async db => {
    const tx = db.transaction('polycultures', 'readwrite');
    for (const polyculture of polycultures) {
      await tx.store.put(polyculture);
    }
    await tx.done;
  });
  changed();
}

// ── Garden plans ──────────────────────────────────────────────────────────

export async function getAllGardenPlans(): Promise<GardenPlan[]> {
  return run(db => db.getAll('gardenPlans'));
}

export async function getGardenPlan(id: string): Promise<GardenPlan | undefined> {
  return run(db => db.get('gardenPlans', id));
}

export async function saveGardenPlan(plan: GardenPlan): Promise<void> {
  plan.updatedAt = new Date().toISOString();
  await run(db => db.put('gardenPlans', plan));
  changed();
}

export async function deleteGardenPlan(id: string): Promise<void> {
  await run(db => db.delete('gardenPlans', id));
  changed();
}

export async function importGardenPlans(plans: GardenPlan[]): Promise<void> {
  await run(async db => {
    const tx = db.transaction('gardenPlans', 'readwrite');
    for (const plan of plans) {
      await tx.store.put(plan);
    }
    await tx.done;
  });
  changed();
}

// ── Variety lists (Sortenlisten) ────────────────────────────────────────────

export async function getVarietyLists(): Promise<VarietyList[]> {
  return run(async db => (await db.getAll('varietyLists')).sort((a, b) => a.name.localeCompare(b.name, 'de')));
}

export async function saveVarietyList(list: VarietyList): Promise<void> {
  await run(db => db.put('varietyLists', list));
  changed();
}

export async function deleteVarietyList(id: string): Promise<void> {
  await run(db => db.delete('varietyLists', id));
  changed();
}

// ── Everything ──────────────────────────────────────────────────────────────

/** Empties every store ("Alle Daten löschen"). */
export async function clearAllData(): Promise<void> {
  await run(async db => {
    const tx = db.transaction(['plants', 'polycultures', 'gardenPlans', 'varietyLists'], 'readwrite');
    await Promise.all([
      tx.objectStore('plants').clear(),
      tx.objectStore('polycultures').clear(),
      tx.objectStore('gardenPlans').clear(),
      tx.objectStore('varietyLists').clear(),
      tx.done,
    ]);
  });
  changed();
}
