import { sunPosition } from './sun-position';

// Permaculture zones and sectors for the garden plan (2D layer).
// Zones 0–4 are rings around a centre (usually the house; zone 5 is
// everything beyond the last ring). Sectors are the outside energies reaching
// the site, drawn as wedges from the centre: summer and winter sun (sunrise to
// sunset bearing at the solstices), the main wind (site climate) and cold air
// (flows downhill, from the terrain's slope).
// All bearings are compass degrees (0 = N, clockwise); the plan may be
// rotated (geo.rotationDeg = bearing of plan "up").

export interface PlanZones {
  show: boolean;
  centerXM: number;
  centerYM: number;
  /** Outer radius (m) of zones 0…4, ascending. */
  radiiM: number[];
}

export const DEFAULT_ZONE_RADII = [6, 15, 30, 60, 120];
export const ZONE_COLORS = ['#7c2d12', '#b45309', '#ca8a04', '#65a30d', '#15803d'];

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function sanitizeZones(raw: unknown): PlanZones | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!num(r.centerXM) || !num(r.centerYM)) return undefined;
  const radii = Array.isArray(r.radiiM) && r.radiiM.length === 5 && r.radiiM.every(v => num(v) && v > 0)
    ? (r.radiiM as number[]).slice().sort((a, b) => a - b) : DEFAULT_ZONE_RADII.slice();
  return { show: r.show === true, centerXM: r.centerXM, centerYM: r.centerYM, radiiM: radii };
}

/** Unit vector in plan coordinates (x right, y down) pointing towards a compass bearing. */
export function bearingVector(bearingDeg: number, rotationDeg: number): { x: number; y: number } {
  const a = (bearingDeg - rotationDeg) * Math.PI / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/** SVG path of a wedge from bearing `from` clockwise to `to`, radius r (SVG units). */
export function wedgePath(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, rotationDeg: number): string {
  const span = ((toDeg - fromDeg) % 360 + 360) % 360 || 360;
  const a = bearingVector(fromDeg, rotationDeg), b = bearingVector(fromDeg + span, rotationDeg);
  const f = (v: number) => +v.toFixed(2);
  return `M${f(cx)},${f(cy)} L${f(cx + a.x * r)},${f(cy + a.y * r)} A${f(r)},${f(r)} 0 ${span > 180 ? 1 : 0} 1 ${f(cx + b.x * r)},${f(cy + b.y * r)} Z`;
}

/** Sunrise and sunset bearing on a given day (search in 2-minute steps around solar noon). */
export function sunriseSunsetBearing(date: { y: number; m: number; d: number }, lat: number, lon: number): { rise: number; set: number } | null {
  const noonUtc = Date.UTC(date.y, date.m - 1, date.d, 12) - (lon / 15) * 3600e3;
  let rise: number | null = null, set: number | null = null, prevUp = false;
  for (let t = -12 * 60; t <= 12 * 60; t += 2) {
    const p = sunPosition(new Date(noonUtc + t * 60e3), lat, lon);
    const up = p.altitudeDeg > -0.833;          // upper limb + refraction
    if (up && !prevUp && t > -12 * 60) rise ??= p.bearingDeg;
    if (!up && prevUp) set = p.bearingDeg;
    prevUp = up;
  }
  return rise != null && set != null ? { rise, set } : null;
}

export interface SunSectors { summer: { rise: number; set: number } | null; winter: { rise: number; set: number } | null; }

export function solsticeSectors(lat: number, lon: number): SunSectors {
  const y = new Date().getFullYear();
  return {
    summer: sunriseSunsetBearing(lat >= 0 ? { y, m: 6, d: 21 } : { y, m: 12, d: 21 }, lat, lon),
    winter: sunriseSunsetBearing(lat >= 0 ? { y, m: 12, d: 21 } : { y, m: 6, d: 21 }, lat, lon),
  };
}

/** Index of the zone a point lies in (0…4), 5 beyond the last ring. */
export function zoneAt(z: PlanZones, xM: number, yM: number): number {
  const d = Math.hypot(xM - z.centerXM, yM - z.centerYM);
  const i = z.radiiM.findIndex(r => d <= r);
  return i < 0 ? 5 : i;
}
