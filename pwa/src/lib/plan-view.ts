// What a garden plan looks like when it is opened: 2D section, 3D camera,
// which of the two is open, sun date/time and the colouring ("Einfärben").
// Kept per plan and device in localStorage — and carried along in a share
// link when "Ansicht mitschicken" is ticked, so an example project opens
// exactly as it was set up.

export interface PlanView {
  view2d: { x: number; y: number; w: number; h: number } | null;
  cam3d: { position: [number, number, number]; target: [number, number, number] } | null;
  mode: '2d' | '3d';
  /** Sun for the 3D view: date as yyyy-mm-dd, time as minutes after midnight. */
  sun?: { date: string; minutes: number } | null;
  /** Value of the "Einfärben" select ('' = off, 'all', a function key, 'sun-day', 'sun-season'). */
  coverage?: string;
}

/** Plan that /gartenplan opens on load (cleared by "back to list"). */
export const LAST_PLAN_KEY = 'pgd-gartenplan-last-id';
export const planViewKey = (id: string) => `pgd-gartenplan-view-${id}`;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(num);

/** Validates anything that claims to be a PlanView (localStorage, share link); null if unusable. */
export function sanitizePlanView(raw: unknown): PlanView | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const v2 = r.view2d;
  const view2d = v2 && [v2.x, v2.y, v2.w, v2.h].every(num) && v2.w > 0 && v2.h > 0 ? { x: v2.x, y: v2.y, w: v2.w, h: v2.h } : null;
  const c = r.cam3d;
  const cam3d = c && vec3(c.position) && vec3(c.target) ? { position: c.position, target: c.target } : null;
  const s = r.sun;
  const sun = s && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && num(s.minutes) && s.minutes >= 0 && s.minutes < 1440
    ? { date: s.date, minutes: Math.round(s.minutes) } : null;
  const coverage = typeof r.coverage === 'string' && /^[\w-]{0,40}$/.test(r.coverage) ? r.coverage : undefined;
  return { view2d, cam3d, mode: r.mode === '3d' ? '3d' : '2d', sun, ...(coverage !== undefined ? { coverage } : {}) };
}

export function readPlanView(planId: string): PlanView | null {
  try { return sanitizePlanView(JSON.parse(localStorage.getItem(planViewKey(planId)) || 'null')); } catch { return null; }
}

export function writePlanView(planId: string, view: PlanView): void {
  try { localStorage.setItem(planViewKey(planId), JSON.stringify(view)); } catch { /* storage full or blocked */ }
}

/** Views keyed by plan id (backup, share link), validated; views of unknown plans are dropped. */
export function sanitizePlanViews(raw: unknown, planIds: Set<string>): Record<string, PlanView> {
  const views: Record<string, PlanView> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, v] of Object.entries(raw)) {
      const pv = planIds.has(id) ? sanitizePlanView(v) : null;
      if (pv) views[id] = pv;
    }
  }
  return views;
}
