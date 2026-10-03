import { describe, it, expect } from 'vitest';
import { createEmptyGardenPlan, createEmptyPlant, type GardenPlan, type PlantData } from '../src/lib/types';
import { planToGeoJson, planFromGeoJson } from '../src/lib/gartenplan-geojson';
import { planToLatLon } from '../src/lib/gartenplan-geo';
import { pointsAlongPolyline } from '../src/lib/gartenplan-geometry';

const apple: PlantData = { ...createEmptyPlant(), id: 'apple', latinName: 'Malus domestica', commonName: 'Apfel', heightM: 5, widthM: 4 };
const plan: GardenPlan = {
  ...createEmptyGardenPlan(), id: 'plan1', name: 'Testgarten', areaWidthM: 20, areaHeightM: 12, gridSpacingM: 1, yearsSincePlanting: 7,
  boundary: [{ xM: 1, yM: 1 }, { xM: 19, yM: 1 }, { xM: 19, yM: 11 }, { xM: 1, yM: 11 }],
  areas: [{ id: 'bed', name: 'Beet', color: '#f97316', points: [{ xM: 3, yM: 3 }, { xM: 8, yM: 3 }, { xM: 8, yM: 6 }] }],
  placements: [{ id: 'pl1', plantId: 'apple', xM: 12, yM: 5, notes: 'Südseite' }],
  geo: { lat: 48.137, lon: 11.575, rotationDeg: 0, basemap: 'osm', opacity: 0.7 },
};

describe('GeoJSON export', () => {
  const fc = planToGeoJson(plan, new Map([['apple', apple]]));

  it('writes outline, areas and plants as WGS84 features', () => {
    expect(fc.features.map(f => f.properties?.pdk_type)).toEqual(['boundary', 'area', 'plant']);
    const ring = fc.features[0].geometry!.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);           // closed ring
    expect(ring[0][0]).toBeCloseTo(planToLatLon({ xM: 1, yM: 1 }, plan.geo!).lon, 6); // lon first
    expect(fc.features[2].properties).toMatchObject({ latin_name: 'Malus domestica', layer: 'tree', notes: 'Südseite' });
    expect(fc.pdk?.planId).toBe('plan1');
  });

  it('refuses plans without a location', () => {
    expect(() => planToGeoJson({ ...plan, geo: null }, new Map())).toThrow();
  });
});

describe('GeoJSON import', () => {
  it('round-trips a PDK export to the same spots on Earth', () => {
    const fc = JSON.parse(JSON.stringify(planToGeoJson(plan, new Map([['apple', apple]]))));
    const r = planFromGeoJson(fc, [apple]);
    expect(r.sourcePlanId).toBe('plan1');
    expect(r.plan.name).toBe('Testgarten');
    expect(r.plan.yearsSincePlanting).toBe(7);
    expect(r.newPlants).toHaveLength(0);
    expect(r.matchedPlants).toBe(1);
    expect(r.plan.areas[0]).toMatchObject({ id: 'bed', name: 'Beet', color: '#f97316' });
    const before = planToLatLon(plan.placements[0], plan.geo!);
    const after = planToLatLon(r.plan.placements[0], r.plan.geo!);
    expect(after.lat).toBeCloseTo(before.lat, 6);
    expect(after.lon).toBeCloseTo(before.lon, 6);
    expect(r.plan.placements[0].notes).toBe('Südseite');
  });

  it('reads foreign GeoJSON (plain polygon + named points) and creates unknown plants once', () => {
    const fc = {
      type: 'FeatureCollection', name: 'Aus QGIS',
      features: [
        { type: 'Feature', properties: { Name: 'Teich' }, geometry: { type: 'Polygon', coordinates: [[[11.5750, 48.1370], [11.5752, 48.1370], [11.5752, 48.1371], [11.5750, 48.1370]]] } },
        { type: 'Feature', properties: { name: 'Corylus avellana' }, geometry: { type: 'Point', coordinates: [11.57505, 48.13705] } },
        { type: 'Feature', properties: { name: 'Corylus avellana' }, geometry: { type: 'Point', coordinates: [11.57510, 48.13705] } },
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[11.575, 48.137], [11.576, 48.137]] } },
      ],
    };
    const r = planFromGeoJson(fc, []);
    expect(r.plan.name).toBe('Aus QGIS');
    expect(r.plan.areas).toHaveLength(1);
    expect(r.plan.areas[0].name).toBe('Teich');
    expect(r.plan.boundary).toHaveLength(4);       // frame as outline
    expect(r.newPlants.map(p => p.latinName)).toEqual(['Corylus avellana']);
    expect(r.plan.placements).toHaveLength(2);
    expect(r.skippedFeatures).toBe(1);
    expect(r.sourcePlanId).toBeNull();
  });

  it('rejects files without geometry', () => {
    expect(() => planFromGeoJson({ type: 'FeatureCollection', features: [] }, [])).toThrow();
    expect(() => planFromGeoJson({ foo: 1 }, [])).toThrow();
  });
});

describe('pointsAlongPolyline', () => {
  it('places points every x m along a bent line, including an exact end', () => {
    const pts = pointsAlongPolyline([{ xM: 0, yM: 0 }, { xM: 3, yM: 0 }, { xM: 3, yM: 3 }], 1.5);
    expect(pts.map(p => [p.xM, p.yM])).toEqual([[0, 0], [1.5, 0], [3, 0], [3, 1.5], [3, 3]]);
  });

  it('carries the remainder around corners', () => {
    const pts = pointsAlongPolyline([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }, { xM: 1, yM: 2 }], 1.5);
    expect(pts).toHaveLength(3);
    expect(pts[1].xM).toBeCloseTo(1); expect(pts[1].yM).toBeCloseTo(0.5);
    expect(pts[2].yM).toBeCloseTo(2);
  });

  it('returns nothing for invalid spacing', () => {
    expect(pointsAlongPolyline([{ xM: 0, yM: 0 }, { xM: 1, yM: 0 }], 0)).toEqual([]);
  });
});
