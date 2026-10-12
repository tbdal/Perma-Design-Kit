import type { GardenPlan, GardenPlanPlacement } from './types';

// Construction phases (Bauabschnitte): every placement can have a planting
// year relative to the plan's start (phaseYear 0 = the first planting,
// 1 = a year later …, negative = an existing plant planted before the
// start). The years slider is "years since the start"; a
// plant's own age is that minus its phase — negative means not yet planted.
// plan.startYear (calendar year) only labels the phases.

export const MAX_PHASE = 80;   // as long as the years slider
/** Existing plants (Bestand) may have been planted up to 50 years before the start. */
export const MIN_PHASE = -50;

export const phaseOf = (pl: Pick<GardenPlanPlacement, 'phaseYear'>) => pl.phaseYear ?? 0;

/** Age of a placement when `years` have passed since the plan's start. */
export const ageAt = (pl: Pick<GardenPlanPlacement, 'phaseYear'>, years: number) => years - phaseOf(pl);

export const isPlanted = (pl: Pick<GardenPlanPlacement, 'phaseYear'>, years: number) => ageAt(pl, years) >= 0;

/** "2027" with a start year, else "Start" / "+2" / "−3". */
export function phaseLabel(plan: Pick<GardenPlan, 'startYear'>, phase: number, startWord = 'Start'): string {
  if (plan.startYear) return String(plan.startYear + phase);
  return phase === 0 ? startWord : phase > 0 ? `+${phase}` : `−${-phase}`;
}

/** Placements per phase, ascending. */
export function phaseGroups(plan: Pick<GardenPlan, 'placements'>): [number, GardenPlanPlacement[]][] {
  const m = new Map<number, GardenPlanPlacement[]>();
  for (const pl of plan.placements) m.set(phaseOf(pl), [...(m.get(phaseOf(pl)) ?? []), pl]);
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

export function clampPhase(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const r = Math.max(MIN_PHASE, Math.min(MAX_PHASE, Math.round(v)));
  return r === 0 ? undefined : r;
}
