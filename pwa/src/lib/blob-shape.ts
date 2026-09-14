/**
 * Deterministic irregular "blob" outline generator — used on the Gartenplan
 * map so a plant reads as a naturalistic canopy/patch shape rather than a
 * perfect circle, without needing real per-species artwork (which doesn't
 * exist). Seeded by the placement's own id, so a given placement always
 * renders the same wobbly outline across re-renders and reloads, instead of
 * jittering randomly.
 */

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

/** SVG path `d` for a closed, smoothed irregular blob of the given nominal
 *  radius (same units as the caller's coordinate system), centered on
 *  (0,0). `lobes` controls point count (more = more irregular outline),
 *  `wobble` is the max fractional deviation from the nominal radius (0..1). */
export function blobPathD(radius: number, seed: string, lobes: number, wobble: number): string {
  const rand = seededRandom(seed);
  const points: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2;
    const r = radius * (1 - wobble / 2 + rand() * wobble);
    points.push([Math.cos(angle) * r, Math.sin(angle) * r]);
  }
  // Smooth closed curve through the perturbed points: start at the midpoint
  // before the first point, then a quadratic Bezier per edge using each
  // point as the control point and the next midpoint as the endpoint — a
  // simple, standard technique for turning a polygon into a rounded blob.
  const midOf = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const startMid = midOf(points[points.length - 1], points[0]);
  let d = `M ${startMid[0].toFixed(1)} ${startMid[1].toFixed(1)}`;
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const next = points[(i + 1) % points.length];
    const mid = midOf(cur, next);
    d += ` Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${mid[0].toFixed(1)} ${mid[1].toFixed(1)}`;
  }
  return d + ' Z';
}
