// Soil per area (Werkstatt #600, stage 1): each area of a plan — and the plot itself for everything outside an area —
// can carry a short soil profile. Plants are checked against the soil of the smallest area they stand in, with the data
// the plants already have (pH in five steps, water dry/mid/wet) and, since stage 2, the texture from PFAF (light/medium/
// heavy) and "prefers well-drained soil". The texture can be set finer as a USDA class (soil-triangle.ts).
import type { GardenPlan, GardenPlanPoint, PlantData } from './types';
import { pointInPolygon, polygonAreaM2 } from './gartenplan-geometry';
import { textureClass } from './soil-triangle';

export type SoilTexture = 'L' | 'M' | 'H';
export type SoilWater = 'd' | 'm' | 'w' | 's';
export type SoilNutrients = 'poor' | 'mid' | 'rich';
/** Every field may stay empty: then it is not checked. ph: 0 very acidic … 4 very alkaline (the plant data's steps). */
export interface Soil { tex?: SoilTexture; ph?: number; wat?: SoilWater; nut?: SoilNutrients; /** USDA texture class (soil-triangle.ts); sets `tex`. */ cls?: string }

export const SOIL_TEX: SoilTexture[] = ['L', 'M', 'H'];
export const SOIL_WAT: SoilWater[] = ['d', 'm', 'w', 's'];
export const SOIL_NUT: SoilNutrients[] = ['poor', 'mid', 'rich'];
const PH_KEYS = ['phVeryAcid', 'phAcid', 'phNeutral', 'phAlkaline', 'phVeryAlkaline'] as const;

/** Stored value → a valid soil, or null when nothing is set. */
export function normalizeSoil(raw: unknown): Soil | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>, s: Soil = {};
  if (SOIL_TEX.includes(r.tex as SoilTexture)) s.tex = r.tex as SoilTexture;
  if (Number.isInteger(r.ph) && (r.ph as number) >= 0 && (r.ph as number) <= 4) s.ph = r.ph as number;
  if (SOIL_WAT.includes(r.wat as SoilWater)) s.wat = r.wat as SoilWater;
  if (SOIL_NUT.includes(r.nut as SoilNutrients)) s.nut = r.nut as SoilNutrients;
  const c = typeof r.cls === 'string' ? textureClass(r.cls) : undefined;
  if (c) { s.cls = c.k; s.tex = c.z; } // the class decides the step
  return Object.keys(s).length ? s : null;
}

/** The soil at a plan point: the smallest area there that has a soil, else the plot's; with where it comes from. */
export function soilAt(plan: Pick<GardenPlan, 'areas' | 'soil'>, at: GardenPlanPoint): { soil: Soil; areaId: string | null } | null {
  const hit = plan.areas.filter(a => a.soil && a.points.length >= 3 && pointInPolygon(at, a.points))
    .sort((a, b) => polygonAreaM2(a.points) - polygonAreaM2(b.points))[0];
  if (hit) return { soil: hit.soil!, areaId: hit.id };
  return plan.soil ? { soil: plan.soil, areaId: null } : null;
}

export type SoilIssue = { kind: 'ph'; need: [number, number]; have: number } | { kind: 'tex'; have: SoilTexture } | { kind: 'dry' | 'wet' | 'waterlogged' };
const TEX_KEYS = { L: 'soilLight', M: 'soilMedium', H: 'soilHeavy' } as const;
export interface SoilCheck { level: 'ok' | 'hint' | 'unsuitable'; issues: SoilIssue[] }

/** How a plant fits a soil; null when the plant has none of the data to compare (no hint then).
 *  pH outside the plant's steps, a dry or wet soil the plant does not take: hint. Waterlogged soil for a plant that
 *  does not take wet ground: unsuitable (the commonest cause of losses in the first year). */
export function soilCheck(p: Pick<PlantData, 'waterDry' | 'waterMid' | 'waterWet' | (typeof PH_KEYS)[number]> & Partial<Pick<PlantData, 'soilLight' | 'soilMedium' | 'soilHeavy' | 'soilWellDrained'>>, s: Soil): SoilCheck | null {
  const issues: SoilIssue[] = [];
  let known = false, level: SoilCheck['level'] = 'ok';
  const steps = PH_KEYS.map((k, i) => (p[k] ? i : -1)).filter(i => i >= 0);
  if (s.ph != null && steps.length) {
    known = true;
    if (!steps.includes(s.ph)) { issues.push({ kind: 'ph', need: [steps[0], steps[steps.length - 1]], have: s.ph }); level = 'hint'; }
  }
  if (s.tex && (p.soilLight || p.soilMedium || p.soilHeavy)) {
    known = true;
    if (!p[TEX_KEYS[s.tex]]) { issues.push({ kind: 'tex', have: s.tex }); level = 'hint'; }
  }
  if (s.wat === 's' && p.soilWellDrained) { known = true; issues.push({ kind: 'waterlogged' }); level = 'unsuitable'; }
  else if (s.wat && (p.waterDry || p.waterMid || p.waterWet)) {
    known = true;
    if (s.wat === 's' && !p.waterWet) { issues.push({ kind: 'waterlogged' }); level = 'unsuitable'; }
    else if (s.wat === 'w' && !p.waterWet) { issues.push({ kind: 'wet' }); if (level === 'ok') level = 'hint'; }
    else if (s.wat === 'd' && !p.waterDry) { issues.push({ kind: 'dry' }); if (level === 'ok') level = 'hint'; }
  }
  return known ? { level, issues } : null;
}
