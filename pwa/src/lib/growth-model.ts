import type { PlantData } from './types';

/**
 * Growth-over-time heuristic for the Gartenplan visualization. PFAF has no
 * age-based growth data — only mature heightM/widthM and three independent
 * growSpeed flags. This is an INVENTED heuristic (simplified logistic
 * curve), not sourced data — treat any number derived from it as
 * illustrative, not horticultural fact.
 */
export type GrowthPace = 'low' | 'mid' | 'high';

const MATURITY_AGE_YEARS: Record<GrowthPace, number> = { high: 6, mid: 15, low: 30 };
const MIN_DISPLAY_RADIUS_M = 0.08; // ~8cm floor so a year-0 planting stays visible/clickable

/** 0 or ≥2 flags set is ambiguous — falls back to 'mid'. */
export function resolveGrowthPace(
  p: Pick<PlantData, 'growSpeedLow' | 'growSpeedMid' | 'growSpeedHigh'>
): GrowthPace {
  const set = [p.growSpeedHigh, p.growSpeedMid, p.growSpeedLow].filter(Boolean).length;
  if (set === 1) return p.growSpeedHigh ? 'high' : p.growSpeedLow ? 'low' : 'mid';
  return 'mid';
}

/** size(t)/final = 1 / (1 + e^-k(t - tMid)); tMid = maturityAge/2;
 *  k = ln(19)/tMid so the curve hits ~95% of final size at maturityAge. */
export function growthFraction(years: number, pace: GrowthPace): number {
  const tMid = MATURITY_AGE_YEARS[pace] / 2;
  const k = Math.log(19) / tMid;
  return 1 / (1 + Math.exp(-k * (Math.max(0, years) - tMid)));
}

/** Years until a plant of this pace is (nearly) full size. */
export function maturityYears(pace: GrowthPace): number {
  return MATURITY_AGE_YEARS[pace];
}

/**
 * Trunk radius for the 3D view, from the current height (stem/height ratio of
 * roughly 1:45 in diameter for a mature tree) — and, unlike the crown, the
 * trunk keeps thickening after the plant is full size: up to +80 % over the
 * following 40 years. Same caveat as above: an illustrative heuristic.
 */
export function trunkRadiusM(currentHeightM: number, years: number, pace: GrowthPace): number {
  const extra = Math.min(1, Math.max(0, (years - MATURITY_AGE_YEARS[pace]) / 40));
  return Math.max(0.012, (currentHeightM / 90) * (1 + 0.8 * extra));
}

export function displayRadiusM(
  p: Pick<PlantData, 'widthM' | 'growSpeedLow' | 'growSpeedMid' | 'growSpeedHigh'>,
  years: number
): number {
  const finalWidthM = p.widthM && p.widthM > 0 ? p.widthM : 0.5; // unknown widthM ⇒ small default
  const finalRadius = finalWidthM / 2;
  return Math.max(MIN_DISPLAY_RADIUS_M, finalRadius * growthFraction(years, resolveGrowthPace(p)));
}
