import { createEmptyGardenPlan, createEmptyPlant, type GardenPlan, type GardenPlanArea, type PlantData } from './types';
import { planToLatLon, latLonToPlan, planFromLatLngPolygon } from './gartenplan-geo';
import { displayRadiusM } from './growth-model';
import { deriveLayer } from './plant-layer';
import { AREA_PALETTE } from './gartenplan-render';
import { newId } from './id';
import { ageAt } from './phases';

// GeoJSON exchange with QGIS & co. One FeatureCollection in WGS84 (RFC 7946,
// lon/lat): the garden outline and areas as polygons, plants as points with
// attributes useful for styling (layer, canopy radius, …). QGIS opens it by
// drag & drop and saves it back as GeoJSON; planFromGeoJson() reads such a
// file — or any foreign GeoJSON with polygons/points — into a north-up plan.

type Pos = [number, number];
interface Feature { type: 'Feature'; geometry: { type: string; coordinates: any } | null; properties: Record<string, unknown> | null; }
export interface FeatureCollection { type: 'FeatureCollection'; name?: string; features: Feature[]; pdk?: { version: number; planId: string; gridSpacingM: number; yearsSincePlanting: number }; }

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export function planToGeoJson(plan: GardenPlan, plantsById: Map<string, PlantData>): FeatureCollection {
  const geo = plan.geo;
  if (!geo) throw new Error('plan has no location');
  const pos = (p: { xM: number; yM: number }): Pos => { const q = planToLatLon(p, geo); return [round7(q.lon), round7(q.lat)]; };
  const ring = (pts: { xM: number; yM: number }[]): Pos[] => { const r = pts.map(pos); return [...r, r[0]]; };
  const features: Feature[] = [];
  if (plan.boundary.length >= 3) {
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(plan.boundary)] },
      properties: { pdk_type: 'boundary', name: plan.name, description: plan.description, notes: plan.notes } });
  }
  for (const a of plan.areas ?? []) {
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring(a.points)] },
      properties: { pdk_type: 'area', pdk_id: a.id, name: a.name, color: a.color } });
  }
  for (const pl of plan.placements) {
    const p = plantsById.get(pl.plantId);
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pos(pl) },
      properties: {
        pdk_type: 'plant', pdk_id: pl.id, plant_id: pl.plantId,
        latin_name: p?.latinName ?? '', common_name: p?.commonName ?? '',
        layer: p ? deriveLayer(p) : '', height_m: p?.heightM ?? null, width_m: p?.widthM ?? null,
        canopy_radius_m: p ? Math.round(displayRadiusM(p, Math.max(0, ageAt(pl, plan.yearsSincePlanting))) * 100) / 100 : null,
        planting_year_offset: pl.phaseYear ?? 0,
        notes: pl.notes,
      } });
  }
  return {
    type: 'FeatureCollection', name: plan.name || 'Waldgartenplan', features,
    pdk: { version: 1, planId: plan.id, gridSpacingM: plan.gridSpacingM, yearsSincePlanting: plan.yearsSincePlanting },
  };
}

export interface GeoJsonImport {
  plan: GardenPlan;
  newPlants: PlantData[];     // plants created for unknown latin names
  matchedPlants: number;
  skippedFeatures: number;
  /** planId the file came from (exported by PDK), if any. */
  sourcePlanId: string | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Reads a GeoJSON FeatureCollection into a new north-up plan. Polygons
 *  become the outline (pdk_type "boundary", else the bounding box) or areas,
 *  points become placements; plants are matched by plant_id, then latin name,
 *  and created when unknown. Throws on files without usable geometry. */
export function planFromGeoJson(fc: unknown, existingPlants: PlantData[], spacingM = 1): GeoJsonImport {
  const f = fc as FeatureCollection;
  if (!f || f.type !== 'FeatureCollection' || !Array.isArray(f.features)) throw new Error('not a GeoJSON FeatureCollection');

  const polygons: { ring: Pos[]; props: Record<string, unknown> }[] = [];
  const points: { pos: Pos; props: Record<string, unknown> }[] = [];
  let skipped = 0;
  for (const feat of f.features) {
    const g = feat?.geometry, props = feat?.properties ?? {};
    if (!g) { skipped++; continue; }
    if (g.type === 'Polygon') polygons.push({ ring: g.coordinates[0], props });
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((poly: Pos[][]) => polygons.push({ ring: poly[0], props }));
    else if (g.type === 'Point') points.push({ pos: g.coordinates, props });
    else if (g.type === 'MultiPoint') g.coordinates.forEach((c: Pos) => points.push({ pos: c, props }));
    else skipped++;
  }
  const all: Pos[] = [...polygons.flatMap(p => p.ring), ...points.map(p => p.pos)];
  if (all.length === 0) throw new Error('no polygons or points');

  // Anchor + size from everything in the file; pad degenerate inputs.
  const ll = all.map(([lon, lat]) => ({ lat, lon }));
  while (ll.length < 3) ll.push({ lat: ll[0].lat + 1e-6 * ll.length, lon: ll[0].lon + 1e-6 * ll.length });
  const frame = planFromLatLngPolygon(ll, 1, spacingM);
  const geo = { ...frame.geo, basemap: 'osm' as const, opacity: 0.7 };
  const toPlan = ([lon, lat]: Pos) => latLonToPlan(lat, lon, geo);
  const openRing = (r: Pos[]) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);

  const plan = createEmptyGardenPlan();
  plan.id = f.pdk?.planId && typeof f.pdk.planId === 'string' ? f.pdk.planId : newId();
  plan.areaWidthM = frame.widthM;
  plan.areaHeightM = frame.heightM;
  plan.gridSpacingM = spacingM;
  plan.geo = geo;
  if (typeof f.pdk?.yearsSincePlanting === 'number') plan.yearsSincePlanting = f.pdk.yearsSincePlanting;

  const boundaryIdx = polygons.findIndex(p => p.props.pdk_type === 'boundary');
  if (boundaryIdx >= 0) {
    const b = polygons[boundaryIdx];
    plan.boundary = openRing(b.ring).map(toPlan);
    plan.name = str(b.props.name);
    plan.description = str(b.props.description);
    plan.notes = str(b.props.notes);
  } else {
    // No outline in the file: the whole frame minus the 1 m margin.
    plan.boundary = [{ xM: 1, yM: 1 }, { xM: plan.areaWidthM - 1, yM: 1 }, { xM: plan.areaWidthM - 1, yM: plan.areaHeightM - 1 }, { xM: 1, yM: plan.areaHeightM - 1 }];
  }
  if (!plan.name) plan.name = str(f.name) || 'Import';

  plan.areas = polygons.filter((_, i) => i !== boundaryIdx).map((p, i): GardenPlanArea => ({
    id: str(p.props.pdk_id) || newId(),
    name: str(p.props.name) || str(p.props.Name) || `Fläche ${i + 1}`,
    color: /^#[0-9a-f]{6}$/i.test(str(p.props.color)) ? str(p.props.color).toLowerCase() : AREA_PALETTE[i % AREA_PALETTE.length],
    points: openRing(p.ring).map(toPlan),
  })).filter(a => a.points.length >= 3);

  const byId = new Map(existingPlants.map(p => [p.id, p]));
  const byLatin = new Map(existingPlants.filter(p => p.latinName).map(p => [p.latinName.trim().toLowerCase(), p]));
  const newPlants: PlantData[] = [];
  let matched = 0;
  for (const pt of points) {
    const pid = str(pt.props.plant_id);
    const latin = (str(pt.props.latin_name) || str(pt.props.name) || str(pt.props.Name)).trim();
    let plant = (pid && byId.get(pid)) || (latin && byLatin.get(latin.toLowerCase())) || undefined;
    if (plant) matched++;
    else {
      plant = { ...createEmptyPlant(), latinName: latin || 'Unbekannte Pflanze', commonName: str(pt.props.common_name) };
      newPlants.push(plant);
      if (latin) byLatin.set(latin.toLowerCase(), plant);
    }
    const q = toPlan(pt.pos);
    plan.placements.push({ id: str(pt.props.pdk_id) || newId(), plantId: plant.id, xM: q.xM, yM: q.yM, notes: str(pt.props.notes) });
  }
  return { plan, newPlants, matchedPlants: matched, skippedFeatures: skipped, sourcePlanId: f.pdk?.planId ?? null };
}
