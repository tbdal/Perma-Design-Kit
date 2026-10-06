import {
  createEmptyPlant, createEmptyPolyculture, createEmptyGardenPlan, parseHabit,
  type PlantData, type Polyculture, type GardenPlan, type GardenPlanGeo, type GardenPlanArea, type DataSource, type PolycultureRole,
} from './types';
import { newId } from './id';
import { sanitizeZones } from './zones-sectors';
import { clampPhase } from './phases';
import type { VarietyEntry, VarietyList } from './varieties';

// Everything that arrives from outside the app — JSON import, backup restore,
// Gist/WebDAV pull, CSV — goes through here before it touches IndexedDB. Each
// record is rebuilt on top of the empty default, taking a field only when it
// has the expected type. That keeps old files (missing newer fields like
// `groups`) working, and keeps a crafted file from smuggling markup-shaped
// values into fields the renderers treat as numbers or safe URLs.

const DATA_SOURCES = new Set<DataSource>(['wikidata', 'pfaf', 'efg', 'naturadb', 'manual', 'csv', 'sample']);
const ROLES = new Set<PolycultureRole>(['companion', 'groundCover', 'nFixer', 'mineralFixer', 'insectary', 'pestConfuser', 'fruitProducer', 'other']);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback: string) => typeof v === 'string' ? v : fallback;
const nonEmptyStr = (v: unknown, fallback: string) => typeof v === 'string' && v.trim() ? v : fallback;

function finite(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function months(v: unknown): boolean[] {
  return Array.from({ length: 12 }, (_, i) => Array.isArray(v) && v[i] === true);
}

/** Only http(s) — keeps javascript:/data: URLs out of <img src> and links. */
function safeUrl(v: unknown): string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim()) ? v.trim() : '';
}

export function normalizePlant(raw: unknown): PlantData | null {
  if (!isObject(raw)) return null;
  const p = createEmptyPlant();

  for (const key of Object.keys(p) as (keyof PlantData)[]) {
    const v = raw[key];
    const def = p[key];
    if (typeof def === 'boolean') (p as any)[key] = v === true;
    else if (typeof def === 'string') (p as any)[key] = str(v, def);
  }

  p.id = nonEmptyStr(raw.id, p.id);
  p.habit = parseHabit(raw.habit);
  // Keep a valid add date; data without one counts as added now.
  if (typeof raw.createdAt !== 'string' || Number.isNaN(Date.parse(raw.createdAt))) p.createdAt = new Date().toISOString();
  const h = finite(raw.heightM), w = finite(raw.widthM);
  p.heightM = h != null && h >= 0 ? h : null;
  p.widthM = w != null && w >= 0 ? w : null;
  p.eatableScore = clamp(Math.round(finite(raw.eatableScore) ?? 0), 0, 5);
  p.medsScore = clamp(Math.round(finite(raw.medsScore) ?? 0), 0, 5);
  p.materialScore = clamp(Math.round(finite(raw.materialScore) ?? 0), 0, 5);
  p.printCount = clamp(Math.round(finite(raw.printCount) ?? 1), 0, 99);
  p.fruitMonths = months(raw.fruitMonths);
  p.flowerMonths = months(raw.flowerMonths);
  p.imageUrl = safeUrl(raw.imageUrl);
  p.groups = Array.isArray(raw.groups)
    ? [...new Set(raw.groups.filter((g): g is string => typeof g === 'string').map(g => g.trim()).filter(Boolean))]
    : [];

  if (isObject(raw._sources)) {
    const sources: PlantData['_sources'] = {};
    for (const [k, v] of Object.entries(raw._sources)) {
      if (k in p && DATA_SOURCES.has(v as DataSource)) (sources as any)[k] = v;
    }
    p._sources = sources;
  }

  if (!p.latinName.trim() && !p.commonName.trim()) return null;
  return p;
}

export function normalizePlants(raw: unknown): PlantData[] {
  return Array.isArray(raw) ? raw.map(normalizePlant).filter((p): p is PlantData => p !== null) : [];
}

export function normalizePolyculture(raw: unknown): Polyculture | null {
  if (!isObject(raw)) return null;
  const d = createEmptyPolyculture();
  return {
    id: nonEmptyStr(raw.id, d.id),
    name: str(raw.name, ''),
    description: str(raw.description, ''),
    anchorPlantId: typeof raw.anchorPlantId === 'string' ? raw.anchorPlantId : null,
    members: Array.isArray(raw.members)
      ? raw.members.filter(isObject).filter(m => typeof m.plantId === 'string').map(m => ({
          plantId: m.plantId as string,
          role: ROLES.has(m.role as PolycultureRole) ? m.role as PolycultureRole : 'other',
          notes: str(m.notes, ''),
        }))
      : [],
    notes: str(raw.notes, ''),
    createdAt: str(raw.createdAt, d.createdAt),
    updatedAt: str(raw.updatedAt, d.updatedAt),
  };
}

export function normalizeGardenPlan(raw: unknown): GardenPlan | null {
  if (!isObject(raw)) return null;
  const d = createEmptyGardenPlan();
  const point = (v: unknown) => isObject(v) && finite(v.xM) != null && finite(v.yM) != null
    ? { xM: finite(v.xM)!, yM: finite(v.yM)! } : null;
  return {
    id: nonEmptyStr(raw.id, d.id),
    name: str(raw.name, ''),
    description: str(raw.description, ''),
    polycultureId: typeof raw.polycultureId === 'string' ? raw.polycultureId : null,
    areaWidthM: clamp(finite(raw.areaWidthM) ?? d.areaWidthM, 1, 500),
    areaHeightM: clamp(finite(raw.areaHeightM) ?? d.areaHeightM, 1, 500),
    gridSpacingM: finite(raw.gridSpacingM) ?? d.gridSpacingM,
    boundary: Array.isArray(raw.boundary) ? raw.boundary.map(point).filter((q): q is { xM: number; yM: number } => q !== null) : [],
    placements: Array.isArray(raw.placements)
      ? raw.placements.filter(isObject).filter(pl => typeof pl.plantId === 'string' && point(pl)).map(pl => ({
          id: nonEmptyStr(pl.id, newId()),
          plantId: pl.plantId as string,
          xM: finite(pl.xM)!,
          yM: finite(pl.yM)!,
          notes: str(pl.notes, ''),
          ...(clampPhase(pl.phaseYear) ? { phaseYear: clampPhase(pl.phaseYear)! } : {}),
        }))
      : [],
    yearsSincePlanting: clamp(finite(raw.yearsSincePlanting) ?? 0, 0, 100),
    notes: str(raw.notes, ''),
    geo: normalizeGardenPlanGeo(raw.geo),
    areas: Array.isArray(raw.areas)
      ? raw.areas.map(a => normalizeGardenPlanArea(a, point)).filter((a): a is GardenPlanArea => a !== null)
      : [],
    ...(sanitizeZones(raw.zones) ? { zones: sanitizeZones(raw.zones)! } : {}),
    ...(finite(raw.startYear) != null && finite(raw.startYear)! >= 1900 && finite(raw.startYear)! <= 2200 ? { startYear: Math.round(finite(raw.startYear)!) } : {}),
    ...(isObject(raw.plantPrices) ? { plantPrices: Object.fromEntries(Object.entries(raw.plantPrices)
      .filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0) as [string, number][]) } : {}),
    createdAt: str(raw.createdAt, d.createdAt),
    updatedAt: str(raw.updatedAt, d.updatedAt),
  };
}

function normalizeGardenPlanArea(raw: unknown, point: (v: unknown) => { xM: number; yM: number } | null): GardenPlanArea | null {
  if (!isObject(raw) || !Array.isArray(raw.points)) return null;
  const points = raw.points.map(point).filter((q): q is { xM: number; yM: number } => q !== null);
  if (points.length < 3) return null;
  return {
    id: nonEmptyStr(raw.id, newId()),
    name: str(raw.name, '').slice(0, 80),
    color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color.toLowerCase() : '#22c55e',
    points,
  };
}

function normalizeGardenPlanGeo(raw: unknown): GardenPlanGeo | null {
  if (!isObject(raw)) return null;
  const lat = finite(raw.lat), lon = finite(raw.lon);
  if (lat == null || lon == null || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  const rot = finite(raw.rotationDeg) ?? 0;
  return {
    lat,
    lon,
    rotationDeg: ((rot % 360) + 360) % 360,
    basemap: raw.basemap === 'none' || raw.basemap === 'sat' || raw.basemap === 'ortho' ? raw.basemap : 'osm',
    opacity: clamp(finite(raw.opacity) ?? 0.6, 0, 1),
  };
}

export function normalizePolycultures(raw: unknown): Polyculture[] {
  return Array.isArray(raw) ? raw.map(normalizePolyculture).filter((x): x is Polyculture => x !== null) : [];
}

export function normalizeGardenPlans(raw: unknown): GardenPlan[] {
  return Array.isArray(raw) ? raw.map(normalizeGardenPlan).filter((x): x is GardenPlan => x !== null) : [];
}

/** A variety list from a backup. Entries without a name or species are dropped. */
export function normalizeVarietyList(raw: unknown): VarietyList | null {
  if (!isObject(raw) || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries.filter(isObject).map((e): VarietyEntry | null => {
    const name = str(e.name, '').trim(), species = str(e.species, '').trim().toLowerCase();
    if (!name || !species) return null;
    const synonyms = Array.isArray(e.synonyms) ? e.synonyms.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
    return {
      name,
      species,
      ...(synonyms.length ? { synonyms } : {}),
      ...(typeof e.wikidataId === 'string' && /^Q\d+$/.test(e.wikidataId) ? { wikidataId: e.wikidataId } : {}),
    };
  }).filter((e): e is VarietyEntry => e !== null);
  if (!entries.length) return null;
  return {
    id: nonEmptyStr(raw.id, newId()),
    name: str(raw.name, '').slice(0, 120),
    source: raw.source === 'wikidata' ? 'wikidata' : 'csv',
    license: str(raw.license, ''),
    importedAt: typeof raw.importedAt === 'string' && !Number.isNaN(Date.parse(raw.importedAt)) ? raw.importedAt : new Date().toISOString(),
    enabled: raw.enabled !== false,
    entries,
  };
}

export function normalizeVarietyLists(raw: unknown): VarietyList[] {
  return Array.isArray(raw) ? raw.map(normalizeVarietyList).filter((x): x is VarietyList => x !== null) : [];
}
