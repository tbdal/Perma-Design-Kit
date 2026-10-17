import { describe, expect, it } from 'vitest';
import { niceScale, scaleLabel } from '../src/lib/scale-bar';

describe('scale bar', () => {
  it('picks 1/2/5 × 10ⁿ metres that fit into the width', () => {
    expect(niceScale(10)).toMatchObject({ meters: 10 });      // 120 px at 10 px/m = 12 m → 10 m
    expect(niceScale(10)!.widthPx).toBeCloseTo(100);
    expect(niceScale(30)!.meters).toBe(2);                    // 4 m → 2
    expect(niceScale(20)!.meters).toBe(5);                    // 6 m → 5
    expect(niceScale(0.5)!.meters).toBe(200);                 // 240 m → 200
    expect(niceScale(0.05)!.meters).toBe(2000);               // 2400 m → 2 km
    expect(niceScale(500)!.meters).toBe(0.2);                 // 0.24 m → 20 cm
    for (const px of [0.013, 0.7, 3.3, 45, 280, 1900]) { const s = niceScale(px)!; expect(s.widthPx).toBeLessThanOrEqual(120.0001); expect(s.widthPx).toBeGreaterThan(40); }
    expect(niceScale(0)).toBeNull();
    expect(niceScale(NaN)).toBeNull();
  });
  it('labels in cm, m and km', () => {
    expect(scaleLabel(0.2, 'de')).toBe('20 cm');
    expect(scaleLabel(5, 'de')).toBe('5 m');
    expect(scaleLabel(2000, 'de')).toBe('2 km');
    expect(scaleLabel(1500, 'de')).toBe('1,5 km');
  });
});
