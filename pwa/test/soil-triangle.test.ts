// Soil texture triangle (#600 stage 2): the USDA classes cover the triangle and sit in the right step.
import { describe, it, expect } from 'vitest';
import { classOf, TEXTURE_CLASSES, triangleSvg } from '../src/lib/soil-triangle';

describe('soil texture triangle', () => {
  it('finds the class of a composition', () => {
    expect(classOf(72, 8)?.k).toBe('sl');   // sandy loam, light
    expect(classOf(40, 20)?.k).toBe('l');   // loam
    expect(classOf(22, 34)?.k).toBe('cl');  // clay loam
    expect(classOf(10, 5)?.k).toBe('si');   // silt
    expect(classOf(20, 60)?.z).toBe('H');   // clay
  });
  it('every point of a 5 % grid lies in a class', () => {
    for (let sand = 0; sand <= 100; sand += 5) for (let clay = 0; sand + clay <= 100; clay += 5) expect(classOf(sand, clay), `${sand}/${clay}`).toBeTruthy();
    expect(TEXTURE_CLASSES).toHaveLength(12);
  });
  it('draws all classes, the chosen one pressed', () => {
    const svg = triangleSvg({ cls: 'l', lang: 'de', labels: { clay: 'Ton', sand: 'Sand', silt: 'Schluff', step: { L: 'leicht', M: 'mittel', H: 'schwer' }, aria: 'Dreieck' } });
    expect(svg.match(/data-soil-cls=/g)).toHaveLength(12);
    expect(svg).toMatch(/data-soil-cls="l"[^>]*aria-pressed="true"/);
  });
});
