import { openDB, type DBSchema } from 'idb';
import type { PlantData, Polyculture } from './types';

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
const DB_VERSION = 4;

function getDB() {
  return openDB<PlantDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, _oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('plants')) {
        const store = db.createObjectStore('plants', { keyPath: 'id' });
        store.createIndex('by-latin', 'latinName');
      }
      if (!db.objectStoreNames.contains('polycultures')) {
        const newStore = db.createObjectStore('polycultures', { keyPath: 'id' });
        if (db.objectStoreNames.contains('guilds')) {
          const oldStore = transaction.objectStore('guilds' as never);
          const all = await oldStore.getAll();
          for (const item of all) await newStore.put(item);
          db.deleteObjectStore('guilds');
        }
      }
    },
  });
}

export async function getAllPlants(): Promise<PlantData[]> {
  const db = await getDB();
  return db.getAll('plants');
}

export async function getPlant(id: string): Promise<PlantData | undefined> {
  const db = await getDB();
  return db.get('plants', id);
}

export async function savePlant(plant: PlantData): Promise<void> {
  const db = await getDB();
  await db.put('plants', plant);
}

export async function deletePlant(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('plants', id);
}

export async function importPlants(plants: PlantData[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('plants', 'readwrite');
  for (const plant of plants) {
    await tx.store.put(plant);
  }
  await tx.done;
}

export async function exportPlants(): Promise<PlantData[]> {
  return getAllPlants();
}

export async function clearAllPlants(): Promise<void> {
  const db = await getDB();
  await db.clear('plants');
}

// ── Polycultures ──────────────────────────────────────────────────────────

export async function getAllPolycultures(): Promise<Polyculture[]> {
  const db = await getDB();
  return db.getAll('polycultures');
}

export async function getPolyculture(id: string): Promise<Polyculture | undefined> {
  const db = await getDB();
  return db.get('polycultures', id);
}

export async function savePolyculture(polyculture: Polyculture): Promise<void> {
  polyculture.updatedAt = new Date().toISOString();
  const db = await getDB();
  await db.put('polycultures', polyculture);
}

export async function deletePolyculture(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('polycultures', id);
}

export async function importPolycultures(polycultures: Polyculture[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('polycultures', 'readwrite');
  for (const polyculture of polycultures) {
    await tx.store.put(polyculture);
  }
  await tx.done;
}
