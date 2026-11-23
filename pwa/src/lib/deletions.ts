// Deletion marks ("Löschmarken"): what was deleted on this device, and when, so a deletion travels to the other
// devices with the next backup / sync instead of the record coming back from them. A record whose last change is
// older than its mark is gone everywhere; one changed after the mark (edited elsewhere later) stays.
// Kept per device in localStorage, carried in every backup (`deleted`), pruned after a year.

export type DelStore = 'plants' | 'polycultures' | 'gardenPlans';
/** `${store}:${id}` → ISO time of the deletion. */
export type Deletions = Record<string, string>;

const KEY = 'pdk-deleted';
const KEEP_MS = 365 * 86_400_000;
const KEY_RE = /^(plants|polycultures|gardenPlans):[\w.-]{1,100}$/;

const keyOf = (store: DelStore, id: string) => `${store}:${id}`;

/** Only well-formed entries younger than a year (from storage or from a backup file). */
export function cleanDeletions(raw: unknown, now = Date.now()): Deletions {
  const out: Deletions = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!KEY_RE.test(k) || typeof v !== 'string') continue;
    const t = Date.parse(v);
    if (Number.isFinite(t) && now - t < KEEP_MS) out[k] = new Date(t).toISOString();
  }
  return out;
}

export function readDeletions(): Deletions {
  try { return cleanDeletions(JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { return {}; }
}

function write(d: Deletions) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked: the deletion stays local */ }
}

/** Both lists, the later time per record. */
export function mergeDeletions(a: Deletions, b: Deletions): Deletions {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) if (!out[k] || out[k] < v) out[k] = v;
  return out;
}

export function noteDeleted(store: DelStore, ids: string[], at = new Date().toISOString()): void {
  if (!ids.length) return;
  const d = readDeletions();
  for (const id of ids) d[keyOf(store, id)] = at;
  write(d);
}

/** The records exist again on purpose (saved, imported, restored): their marks go. */
export function forgetDeleted(store: DelStore, ids: string[]): void {
  const d = readDeletions();
  let hit = false;
  for (const id of ids) if (keyOf(store, id) in d) { delete d[keyOf(store, id)]; hit = true; }
  if (hit) write(d);
}

/** Saves a merged list (after a sync round). */
export function storeDeletions(d: Deletions): void { write(cleanDeletions(d)); }

/** Deleted at or after its last change (a record without `updatedAt` counts as old). */
export function isDeleted(d: Deletions, store: DelStore, rec: { id: string; updatedAt?: string }): boolean {
  const at = d[keyOf(store, rec.id)];
  return !!at && (rec.updatedAt || '') <= at;
}
