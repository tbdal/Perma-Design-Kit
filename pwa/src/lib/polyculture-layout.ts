import type { GardenPlanPoint, PlantData, Polyculture, PolycultureRole } from './types';
import { displayRadiusM } from './growth-model';
import { seededRandom } from './blob-shape';

// "Polykultur als Paket platzieren": the anchor goes to the chosen spot, the
// members around it in rings by role — ground cover under the canopy, the
// support functions (N-fixer, accumulator, insectary, pest confuser) at the
// drip line where the anchor's feeder roots are, fruit producers and general
// companions in an outer ring. Positions are deterministic per polyculture.

const RING: Record<PolycultureRole, number> = {
  groundCover: 0, nFixer: 1, mineralFixer: 1, insectary: 1, pestConfuser: 1, fruitProducer: 2, companion: 2, other: 2,
};

export interface PackagePlacement { plantId: string; xM: number; yM: number; }

export function layoutPolyculture(pc: Polyculture, plantsById: Map<string, PlantData>, center: GardenPlanPoint, years: number): PackagePlacement[] {
  const rand = seededRandom(pc.id);
  const anchor = pc.anchorPlantId ? plantsById.get(pc.anchorPlantId) : undefined;
  const anchorR = anchor ? displayRadiusM(anchor, Math.max(years, 10)) : 1.5;
  const out: PackagePlacement[] = [];
  if (anchor) out.push({ plantId: anchor.id, xM: center.xM, yM: center.yM });
  const rings: { plantId: string; r: number }[][] = [[], [], []];
  for (const m of pc.members) {
    if (m.plantId === pc.anchorPlantId) continue;
    const p = plantsById.get(m.plantId);
    rings[RING[m.role] ?? 2].push({ plantId: m.plantId, r: p ? displayRadiusM(p, Math.max(years, 5)) : 0.4 });
  }
  const base = anchor ? anchorR : 0.8;
  rings.forEach((ring, ri) => {
    if (!ring.length) return;
    const maxR = Math.max(...ring.map(x => x.r));
    const dist = ri === 0 ? base * 0.55 : ri === 1 ? base + maxR * 0.6 : base + maxR + Math.max(1, base * 0.6);
    const offset = rand() * Math.PI * 2;
    ring.forEach((m, i) => {
      const a = offset + (i / ring.length) * Math.PI * 2 + (rand() - 0.5) * 0.3;
      const d = dist * (0.92 + rand() * 0.16);
      out.push({ plantId: m.plantId, xM: center.xM + Math.cos(a) * d, yM: center.yM + Math.sin(a) * d });
    });
  });
  return out;
}
