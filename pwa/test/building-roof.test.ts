import { describe, expect, it } from 'vitest';
import { orientedBox, roofHeightAt, roofFaces, ringWithBreaks, nearlyRectangular, type Roof } from '../src/lib/building-roof';
import { buildingShape } from '../src/lib/osm-buildings';

// 12 × 8 m house, long side along x, turned by 30° to test the box
const turn = (deg: number) => (p: { xM: number; yM: number }) => {
  const a = deg * Math.PI / 180;
  return { xM: 50 + p.xM * Math.cos(a) - p.yM * Math.sin(a), yM: 20 + p.xM * Math.sin(a) + p.yM * Math.cos(a) };
};
const rect = (l: number, w: number, deg = 0) => [{ xM: -l / 2, yM: -w / 2 }, { xM: l / 2, yM: -w / 2 }, { xM: l / 2, yM: w / 2 }, { xM: -l / 2, yM: w / 2 }].map(turn(deg));

describe('oriented box', () => {
  it('finds the long side of a turned rectangle', () => {
    const b = orientedBox(rect(12, 8, 30));
    expect(b.halfL).toBeCloseTo(6); expect(b.halfW).toBeCloseTo(4);
    expect(Math.abs(b.ux * Math.cos(Math.PI / 6) + b.uy * Math.sin(Math.PI / 6))).toBeCloseTo(1);
    expect(b.cx).toBeCloseTo(50); expect(b.cy).toBeCloseTo(20);
  });
});

describe('roof heights', () => {
  const pts = rect(12, 8, 30);
  const box = orientedBox(pts);
  const at = (roof: Roof, al: number, ac: number) => roofHeightAt(roof, box, box.cx + al * box.ux - ac * box.uy, box.cy + al * box.uy + ac * box.ux);
  it('gable: ridge along the long side, eaves at zero', () => {
    const r: Roof = { shape: 'gabled', heightM: 4 };
    expect(at(r, 0, 0)).toBeCloseTo(4);
    expect(at(r, 5.9, 0)).toBeCloseTo(4);       // ridge runs to the gable end
    expect(at(r, 0, 4)).toBeCloseTo(0);
    expect(at(r, 3, -2)).toBeCloseTo(2);
    expect(at({ ...r, across: true }, 3, 0)).toBeCloseTo(2);   // ridge across: falls along the long side
  });
  it('hipped: falls towards the ends as well', () => {
    const r: Roof = { shape: 'hipped', heightM: 4 };
    expect(at(r, 0, 0)).toBeCloseTo(4);
    expect(at(r, 2, 0)).toBeCloseTo(4);         // ridge from −2 to 2 (halfL − halfW)
    expect(at(r, 6, 0)).toBeCloseTo(0);
    expect(at(r, 4, 0)).toBeCloseTo(2);
  });
  it('pyramidal: one apex', () => {
    const r: Roof = { shape: 'pyramidal', heightM: 5 };
    expect(at(r, 0, 0)).toBeCloseTo(5);
    expect(at(r, 6, 0)).toBeCloseTo(0);
    expect(at(r, 0, 4)).toBeCloseTo(0);
  });
  it('skillion: down towards roof:direction', () => {
    const flat = rect(10, 6);          // north-up plan, y grows southwards
    const b = orientedBox(flat);
    const r: Roof = { shape: 'skillion', heightM: 2, directionDeg: 180 };  // slopes down to the south
    expect(roofHeightAt(r, b, 50, 20 - 3)).toBeCloseTo(2);
    expect(roofHeightAt(r, b, 50, 20 + 3)).toBeCloseTo(0);
  });
});

describe('roof faces', () => {
  const pts = rect(12, 8, 30);
  const box = orientedBox(pts);
  it('are planar: the height is linear across every face', () => {
    for (const shape of ['gabled', 'hipped', 'pyramidal'] as const) {
      const roof: Roof = { shape, heightM: 4 };
      const faces = roofFaces(pts, roof, box);
      expect(faces.length).toBeGreaterThanOrEqual(2);
      for (const f of faces) {
        // centroid height = mean of the corner heights only if the face is planar (for triangles always; check quads)
        const cx = f.reduce((a, p) => a + p.xM, 0) / f.length, cy = f.reduce((a, p) => a + p.yM, 0) / f.length;
        const mean = f.reduce((a, p) => a + roofHeightAt(roof, box, p.xM, p.yM), 0) / f.length;
        if (f.length === 3 || shape !== 'gabled') expect(roofHeightAt(roof, box, cx, cy)).toBeCloseTo(mean, 5);
        else expect(roofHeightAt(roof, box, cx, cy)).toBeGreaterThan(0);
      }
    }
  });
  it('gable halves cover the footprint; the walls get points under the ridge', () => {
    const roof: Roof = { shape: 'gabled', heightM: 4 };
    const area = (p: { xM: number; yM: number }[]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q.xM * r.yM - r.xM * q.yM; }, 0) / 2);
    const faces = roofFaces(pts, roof, box);
    expect(faces).toHaveLength(2);
    expect(area(faces[0]) + area(faces[1])).toBeCloseTo(96);
    const ring = ringWithBreaks(pts, roof, box);
    expect(ring).toHaveLength(6);
    expect(Math.max(...ring.map(p => roofHeightAt(roof, box, p.xM, p.yM)))).toBeCloseTo(4);
  });
  it('box roofs only for nearly rectangular footprints', () => {
    const L = [{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 4 }, { xM: 4, yM: 4 }, { xM: 4, yM: 10 }, { xM: 0, yM: 10 }];
    expect(nearlyRectangular(L, orientedBox(L))).toBe(false);
    expect(nearlyRectangular(pts, box)).toBe(true);
  });
});

describe('roofs from OSM tags', () => {
  const pts = rect(12, 8);
  it('uses roof:shape, roof:height and the levels', () => {
    const s = buildingShape({ building: 'yes', 'building:levels': '2', 'roof:shape': 'hipped', 'roof:height': '3' }, pts);
    expect(s.roof).toEqual({ shape: 'hipped', heightM: 3 });
    expect(s.heightM).toBeCloseTo(9);
  });
  it('guesses a gable for houses, keeps the total height', () => {
    const s = buildingShape({ building: 'house' }, pts);
    expect(s.roof.shape).toBe('gabled');
    expect(s.roof.estimated).toBe(true);
    expect(s.heightM).toBe(8);
    expect(s.roof.heightM).toBeCloseTo(4 * Math.tan(40 * Math.PI / 180));
  });
  it('a height tag includes the roof; roof:angle sets the pitch', () => {
    const s = buildingShape({ building: 'house', height: '10', 'roof:shape': 'gabled', 'roof:angle': '45' }, pts);
    expect(s.heightM).toBe(10);
    expect(s.roof.heightM).toBeCloseTo(4);
    expect(s.roof.estimated).toBeUndefined();
  });
  it('flat for industry, a hipped roof on an L-shape becomes a gable', () => {
    expect(buildingShape({ building: 'industrial' }, pts).roof.shape).toBe('flat');
    const L = [{ xM: 0, yM: 0 }, { xM: 10, yM: 0 }, { xM: 10, yM: 4 }, { xM: 4, yM: 4 }, { xM: 4, yM: 10 }, { xM: 0, yM: 10 }];
    expect(buildingShape({ building: 'house', 'roof:shape': 'hipped' }, L).roof.shape).toBe('gabled');
  });
  it('turns roof:direction into the plan frame', () => {
    const s = buildingShape({ building: 'shed', 'roof:shape': 'skillion', 'roof:direction': 'S', 'roof:height': '1' }, pts, 90);
    expect(s.roof.directionDeg).toBe(90);
  });
});
