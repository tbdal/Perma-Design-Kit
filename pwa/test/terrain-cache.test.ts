// The finished height grid as one cache entry (#588/#593).
import { describe, it, expect } from 'vitest';
import { gridToResponse, gridFromResponse } from '../src/lib/terrain';

describe('grid cache (#588/#593)', () => {
  it('a finished grid survives the round trip through a cache entry, with odd header lengths too', async () => {
    for (const sources of [['a'], ['ab'], ['abc'], ['abcd']]) {
      const g = { minX: -5, minY: -3, cellM: 2, nx: 3, ny: 2, heights: new Float32Array([1, 2, 3, 4.5, 5, 6]), sources,
        dgm: { region: { de: 'Sachsen-Anhalt', en: 'Saxony-Anhalt' }, resolutionM: 1, attributionHtml: '<a href="x">y</a>' } };
      expect(await gridFromResponse(gridToResponse(g))).toEqual(g);
    }
  });
});
