import type { PlanXY } from './gartenplan-geo';

// Field mode (phone in the garden): own GPS position in plan metres, and the
// way to a selected plant as distance + compass direction for staking out.
// Plan coordinates: x right, y down; geo.rotationDeg = compass bearing of
// plan "up". Phone GPS is good to roughly 3–10 m — the UI shows the accuracy.

/** Distance (m) and compass bearing (0 = N, clockwise) from `from` to `to`. */
export function wayTo(from: PlanXY, to: PlanXY, rotationDeg: number): { distM: number; bearingDeg: number } {
  const dx = to.xM - from.xM, dy = to.yM - from.yM;
  const planAngle = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 = plan up, clockwise
  return { distM: Math.hypot(dx, dy), bearingDeg: ((planAngle + rotationDeg) % 360 + 360) % 360 };
}

/** Within reach of the GPS accuracy: "you are there". */
export function arrived(distM: number, accuracyM: number): boolean {
  return distM <= Math.max(1, Math.min(accuracyM, 5));
}
