import { createEmptyPlant, type PlantData, type Polyculture, type GardenPlan } from './types';
import { parseBackup, type ParsedBackup } from './sync';
import { newId } from './id';
import { sanitizePlanView, type PlanView } from './plan-view';

// "Projekt als Link teilen": the whole project travels inside the link's
// #fragment — deflate-compressed JSON, base64url-encoded. Nothing is stored
// on a server; the fragment isn't even sent to one. The receiving page
// (/teilen) decodes it through parseBackup(), i.e. the same normalization as
// every other import path.

export const SHARE_PARAM = 'd';

export interface ShareContent {
  plants: PlantData[];
  polycultures: Polyculture[];
  gardenPlans: GardenPlan[];
  /** How each plan opens (camera, section, 2D/3D, sun, colouring), by plan id. */
  views?: Record<string, PlanView>;
  /** Plan the recipient lands in after importing. */
  start?: { planId: string } | null;
}

export interface ShareOptions {
  includeNotes: boolean;     // plant/polyculture/plan notes
  includeLocation: boolean;  // garden plan geo anchor (≈ home address)
  includeViews?: boolean;    // views + start plan (default: off)
}

/** Drops every plant field still at its createEmptyPlant() default —
 *  normalizePlant() fills them back in on the receiving side. Typically
 *  shrinks a plant to a third. */
function prunePlant(p: PlantData): Record<string, unknown> {
  const empty = createEmptyPlant() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { id: p.id };
  for (const [k, v] of Object.entries(p)) {
    if (k === 'id') continue;
    if (JSON.stringify(v) !== JSON.stringify(empty[k])) out[k] = v;
  }
  return out;
}

export function sharePayload(c: ShareContent, o: ShareOptions): string {
  const plants = c.plants.map(p => prunePlant(o.includeNotes ? p : { ...p, notes: '' }));
  const polycultures = o.includeNotes ? c.polycultures
    : c.polycultures.map(pc => ({ ...pc, notes: '', members: pc.members.map(m => ({ ...m, notes: '' })) }));
  const gardenPlans = c.gardenPlans.map(g => ({
    ...g,
    notes: o.includeNotes ? g.notes : '',
    placements: o.includeNotes ? g.placements : g.placements.map(pl => ({ ...pl, notes: '' })),
    geo: o.includeLocation ? g.geo : null,
  }));
  const planIds = new Set(gardenPlans.map(g => g.id));
  const views = o.includeViews && c.views
    ? Object.fromEntries(Object.entries(c.views).filter(([id]) => planIds.has(id)))
    : null;
  const start = o.includeViews && c.start && planIds.has(c.start.planId) ? c.start : null;
  return JSON.stringify({
    version: 1, shared: true, plants, polycultures, gardenPlans,
    ...(views && Object.keys(views).length ? { views } : {}),
    ...(start ? { start } : {}),
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeShare(c: ShareContent, o: ShareOptions): Promise<string> {
  const json = new TextEncoder().encode(sharePayload(c, o));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export type DecodedShare = ParsedBackup & Pick<ShareContent, 'views' | 'start'>;

/** Views + start plan of a share payload, validated (unknown plans dropped). */
export function shareExtras(json: string, planIds: Set<string>): Pick<ShareContent, 'views' | 'start'> {
  let raw: any;
  try { raw = JSON.parse(json); } catch { return {}; }
  const views: Record<string, PlanView> = {};
  if (raw?.views && typeof raw.views === 'object') {
    for (const [id, v] of Object.entries(raw.views)) {
      const pv = planIds.has(id) ? sanitizePlanView(v) : null;
      if (pv) views[id] = pv;
    }
  }
  const startId = typeof raw?.start?.planId === 'string' && planIds.has(raw.start.planId) ? raw.start.planId : null;
  return { ...(Object.keys(views).length ? { views } : {}), start: startId ? { planId: startId } : null };
}

/** Throws on a damaged or truncated link. */
export async function decodeShare(data: string): Promise<DecodedShare> {
  const bytes = await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw'));
  const json = new TextDecoder().decode(bytes);
  const backup = parseBackup(json);
  return { ...backup, ...shareExtras(json, new Set(backup.gardenPlans.map(g => g.id))) };
}

export function shareUrl(origin: string, data: string): string {
  return `${origin}/teilen/#${SHARE_PARAM}=${data}`;
}

/** Reads the share data from a location hash like "#d=…", or null. */
export function shareDataFromHash(hash: string): string | null {
  const m = /^#?d=([A-Za-z0-9_-]+)$/.exec(hash.trim());
  return m ? m[1] : null;
}

function plantKey(p: PlantData): string | null {
  const latin = p.latinName.trim().toLowerCase();
  return latin ? `${latin}|${(p.varietyName ?? '').trim().toLowerCase()}` : null;
}

export interface MergedShare extends ShareContent {
  reusedPlants: number;   // incoming plants already present (same id or latin name + variety)
  /** Polycultures / plans that arrived with an id the recipient already uses
   *  and were stored as copies (new id, name marked) instead of overwriting. */
  copiedPolycultures: number;
  copiedGardenPlans: number;
  /** Everything in the link is already in the collection (same ids) — e.g.
   *  the example project opened a second time: offer "open" instead of a copy. */
  alreadyPresent: boolean;
}

/** Ids already used in the recipient's collection. */
export interface TakenIds { polycultureIds?: Iterable<string>; gardenPlanIds?: Iterable<string>; }

/** Prepares a decoded share for import into an existing collection: plants
 *  the recipient already has (same id, or same latin name + variety) are not
 *  imported again — the recipient's own record wins — and polycultures /
 *  garden plans are re-pointed at the existing plant ids. */
export function mergeShared(incoming: ShareContent, existing: PlantData[], taken: TakenIds = {}, copySuffix = ' (importiert)'): MergedShare {
  const byId = new Set(existing.map(p => p.id));
  const byKey = new Map<string, string>();
  for (const p of existing) { const k = plantKey(p); if (k && !byKey.has(k)) byKey.set(k, p.id); }

  const idMap = new Map<string, string>();
  const plants: PlantData[] = [];
  for (const p of incoming.plants) {
    if (byId.has(p.id)) { idMap.set(p.id, p.id); continue; }
    const k = plantKey(p);
    const hit = k ? byKey.get(k) : undefined;
    if (hit) { idMap.set(p.id, hit); continue; }
    plants.push(p);
  }
  const map = (id: string) => idMap.get(id) ?? id;
  // Nothing of the recipient's own is ever overwritten: a polyculture / plan
  // whose id exists already (e.g. the link of one's own project, opened again
  // after editing) comes in as a copy with a new id.
  const takenPc = new Set(taken.polycultureIds ?? []);
  const takenPlans = new Set(taken.gardenPlanIds ?? []);
  const pcIdMap = new Map<string, string>();
  let copiedPolycultures = 0, copiedGardenPlans = 0;
  const polycultures = incoming.polycultures.map(pc => {
    const clash = takenPc.has(pc.id);
    const id = clash ? newId() : pc.id;
    if (clash) { copiedPolycultures++; pcIdMap.set(pc.id, id); }
    return {
      ...pc,
      id,
      ...(clash ? { name: `${pc.name}${copySuffix}` } : {}),
      anchorPlantId: pc.anchorPlantId ? map(pc.anchorPlantId) : null,
      members: pc.members.map(m => ({ ...m, plantId: map(m.plantId) })),
    };
  });
  const gardenPlans = incoming.gardenPlans.map(g => {
    const clash = takenPlans.has(g.id);
    if (clash) copiedGardenPlans++;
    return {
      ...g,
      id: clash ? newId() : g.id,
      ...(clash ? { name: `${g.name}${copySuffix}` } : {}),
      polycultureId: g.polycultureId ? (pcIdMap.get(g.polycultureId) ?? g.polycultureId) : null,
      placements: g.placements.map(pl => ({ ...pl, plantId: map(pl.plantId) })),
      ...(g.plantPrices ? { plantPrices: Object.fromEntries(Object.entries(g.plantPrices).map(([id, v]) => [map(id), v])) } : {}),
    };
  });
  // Views and the start plan follow their plan to its (possibly new) id.
  const planIdMap = new Map(incoming.gardenPlans.map((g, i) => [g.id, gardenPlans[i].id]));
  const views = incoming.views
    ? Object.fromEntries(Object.entries(incoming.views).filter(([id]) => planIdMap.has(id)).map(([id, v]) => [planIdMap.get(id)!, v]))
    : undefined;
  const start = incoming.start && planIdMap.has(incoming.start.planId) ? { planId: planIdMap.get(incoming.start.planId)! } : null;
  const alreadyPresent = (incoming.gardenPlans.length + incoming.polycultures.length) > 0
    && copiedGardenPlans === incoming.gardenPlans.length && copiedPolycultures === incoming.polycultures.length
    && plants.length === 0;
  return {
    plants, polycultures, gardenPlans, reusedPlants: incoming.plants.length - plants.length, copiedPolycultures, copiedGardenPlans,
    ...(views && Object.keys(views).length ? { views } : {}), start, alreadyPresent,
  };
}
