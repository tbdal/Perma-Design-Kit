import { afterEach, describe, expect, it } from 'vitest';
import { dotHtml, badgeDefs } from '../src/lib/plant-detail';
import { monthRanges } from '../src/lib/calendar-sort';
import { loadSettings } from '../src/lib/settings';

const months = (...on: number[]) => Array.from({ length: 12 }, (_, i) => on.includes(i));
const NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

describe('color dots', () => {
  it('are always named for screen readers', () => {
    const html = dotHtml('#dc330c', 'Essbarkeit', 'Es', false);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Essbarkeit"');
    expect(html).not.toContain('>Es<');
  });

  it('show their code with "Kürzel statt Farbpunkte", in readable ink', () => {
    expect(dotHtml('#dc330c', 'Essbarkeit', 'Es', true)).toContain('>Es</span>');
    expect(dotHtml('#fadb07', 'Insekten', 'In', true)).toContain('color:#000');
    expect(dotHtml('#166534', 'Baum', 'B', true)).toContain('color:#fff');
  });

  it('every badged field has a code', () => {
    const t = (k: string) => k;
    for (const g of ['usage', 'function', 'sun', 'water', 'growth'] as const) {
      for (const def of badgeDefs(g, t)) expect(def[4], String(def[0])).toBeTruthy();
    }
  });
});

describe('calendar month ranges', () => {
  it('joins consecutive months', () => {
    expect(monthRanges(months(5, 6, 8), NAMES)).toBe('Jun–Jul, Sep');
    expect(monthRanges(months(0), NAMES)).toBe('Jan');
    expect(monthRanges(months(), NAMES)).toBe('');
  });
});

describe('dotCodes setting', () => {
  const store: Record<string, string> = {};
  (globalThis as any).localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
  afterEach(() => { for (const k of Object.keys(store)) delete store[k]; });

  it('defaults to off and only accepts true', () => {
    expect(loadSettings().dotCodes).toBe(false);
    store['perma-design-kit-settings'] = JSON.stringify({ dotCodes: 'yes' });
    expect(loadSettings().dotCodes).toBe(false);
    store['perma-design-kit-settings'] = JSON.stringify({ dotCodes: true });
    expect(loadSettings().dotCodes).toBe(true);
  });
});
