import { afterEach, describe, expect, it } from 'vitest';
import { getContrast, setContrast, getFontSize, setFontSize } from '../src/lib/settings';

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

describe('display preferences (contrast, text size)', () => {
  afterEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it('default to following the system / 100 %', () => {
    expect(getContrast()).toBe('system');
    expect(getFontSize()).toBe('100');
  });

  it('store explicit choices under the keys boot.js reads', () => {
    setContrast('more'); setFontSize('130');
    expect(store['pdk-contrast']).toBe('more');
    expect(store['pdk-font']).toBe('130');
    expect(getContrast()).toBe('more');
    expect(getFontSize()).toBe('130');
  });

  it('remove the key for the defaults and ignore junk', () => {
    setContrast('more'); setContrast('system');
    setFontSize('115'); setFontSize('100');
    expect(store).toEqual({});
    store['pdk-contrast'] = 'ultra'; store['pdk-font'] = '200';
    expect(getContrast()).toBe('system');
    expect(getFontSize()).toBe('100');
  });
});
