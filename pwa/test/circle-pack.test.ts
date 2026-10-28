import { describe, expect, it } from 'vitest';
import { discAndRing } from '../src/lib/circle-pack';

describe('discAndRing', () => {
  it('true-scale discs: disc = ring = packed size', () => {
    expect(discAndRing(80, 80, 40)).toEqual({ disc: 80, ring: 80 });
  });
  it('fixed 60 mm disc with the true size as ring, small and big plants', () => {
    expect(discAndRing(40, 60, 30, 60)).toEqual({ disc: 60, ring: 40 });
    expect(discAndRing(120, 120, 60, 60)).toEqual({ disc: 60, ring: 120 });
  });
  it('a circle the packer shrank to half shrinks only the ring, the fixed disc stays', () => {
    expect(discAndRing(400, 400, 100, 60)).toEqual({ disc: 60, ring: 200 });
  });
});
