import { describe, expect, it } from 'vitest';
import { crownShape } from '../src/lib/plant-mesh-3d';
import { trunkRadiusM, maturityYears } from '../src/lib/growth-model';

const p = (latinName: string) => ({ latinName });

describe('crownShape', () => {
  it('draws conifers as cones and broadleaf trees round', () => {
    expect(crownShape(p('Picea abies'), 'tree')).toBe('cone');
    expect(crownShape(p('Tsuga canadensis'), 'tree')).toBe('cone');
    expect(crownShape(p('Pinus koraiensis'), 'tree')).toBe('cone');
    expect(crownShape(p('Malus domestica'), 'tree')).toBe('round');
    expect(crownShape(p('Ginkgo biloba'), 'tree')).toBe('round');
  });
  it('gives umbrella pines their flat crown', () => {
    expect(crownShape(p('Pinus pinea'), 'tree')).toBe('pine');
    expect(crownShape(p("Pinus sylvestris 'Watereri'"), 'tree')).toBe('pine');
  });
  it('keeps conifer shrubs needled and other shrubs leafy', () => {
    expect(crownShape(p('Taxus baccata'), 'shrub')).toBe('cone');
    expect(crownShape(p('Cephalotaxus harringtonia'), 'shrub')).toBe('cone');
    expect(crownShape(p('Ribes nigrum'), 'shrub')).toBe('shrub');
  });
});

describe('trunkRadiusM', () => {
  it('grows with height', () => {
    expect(trunkRadiusM(10, 5, 'mid')).toBeGreaterThan(trunkRadiusM(5, 5, 'mid'));
    expect(trunkRadiusM(9, 10, 'mid')).toBeCloseTo(0.1, 5);
  });
  it('keeps thickening after full size, up to +80 % after 40 more years', () => {
    const m = maturityYears('mid');
    expect(trunkRadiusM(10, m + 20, 'mid')).toBeGreaterThan(trunkRadiusM(10, m, 'mid'));
    expect(trunkRadiusM(10, m + 40, 'mid')).toBeCloseTo(trunkRadiusM(10, m, 'mid') * 1.8, 5);
    expect(trunkRadiusM(10, m + 80, 'mid')).toBeCloseTo(trunkRadiusM(10, m + 40, 'mid'), 5);
  });
  it('never vanishes for a seedling', () => {
    expect(trunkRadiusM(0.1, 0, 'low')).toBeGreaterThanOrEqual(0.012);
  });
});
