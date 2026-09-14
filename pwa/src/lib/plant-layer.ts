import type { PlantData } from './types';

export type PlantLayer = 'tree' | 'shrub' | 'herb';

/**
 * No PlantData field for permaculture guild layer (canopy/shrub/herb)
 * exists yet — derived heuristically from heightM, the one physical-size
 * field PFAF reliably provides. Not a substitute for a real layer
 * classification (a groundcover vine or a tall herb won't fit a simple
 * height threshold), but a reasonable default for visual differentiation
 * on the Gartenplan map.
 */
export function deriveLayer(p: Pick<PlantData, 'heightM' | 'groundCover'>): PlantLayer {
  if (p.groundCover && (p.heightM == null || p.heightM < 0.5)) return 'herb';
  if (p.heightM == null) return 'shrub';
  if (p.heightM >= 3) return 'tree';
  if (p.heightM >= 0.5) return 'shrub';
  return 'herb';
}

/** Fill/stroke + blob-shape parameters per layer — see blob-shape.ts for
 *  how lobes/wobble turn into an actual outline. */
export const LAYER_STYLE: Record<PlantLayer, { fill: string; stroke: string; lobes: number; wobble: number }> = {
  tree:  { fill: '#166534', stroke: '#14532d', lobes: 9, wobble: 0.35 },
  shrub: { fill: '#65a30d', stroke: '#4d7c0f', lobes: 7, wobble: 0.28 },
  herb:  { fill: '#a3e635', stroke: '#65a30d', lobes: 6, wobble: 0.22 },
};
