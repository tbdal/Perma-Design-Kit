import { getAllPlants, importPlants } from './db';
import { parseBackup } from './sync';

/** Imports the default species list (public/plants-db.json, names only) as
 *  bare plant records; species already in the collection (same latin name)
 *  are skipped. Returns how many were added. Shared by the plant page's
 *  "Daten ⋮" menu and Einstellungen → Daten. */
export async function loadMasterList(): Promise<number> {
  const res = await fetch('/plants-db.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { plants: master } = parseBackup(await res.text());
  const existing = new Set((await getAllPlants()).map(p => p.latinName.trim().toLowerCase()));
  const plants = master.filter(p => !existing.has(p.latinName.trim().toLowerCase()));
  await importPlants(plants);
  return plants.length;
}
