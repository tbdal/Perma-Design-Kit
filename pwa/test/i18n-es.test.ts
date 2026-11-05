// Spanish: the chosen language is 'es', code keeps the base language 'en', texts fall back to English;
// every Spanish key belongs to its dict (a typo would silently show English).
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync } from 'node:fs';
import { createT, getLang, getUiLang, setLang, type Dict } from '../src/lib/i18n/core';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
});

describe('Spanish', () => {
  it('es is the UI language, en the base language; missing texts are English', () => {
    setLang('es');
    expect(getUiLang()).toBe('es');
    expect(getLang()).toBe('en');
    const d: Dict = { a: { de: 'Hallo', en: 'Hello', es: 'Hola' }, b: { de: 'Nur', en: 'Only' } };
    const t = createT(d);
    expect(t('a')).toBe('Hola');
    expect(t('b')).toBe('Only');
  });
  it('every Spanish key exists in its dict, and most texts are translated', async () => {
    const dir = new URL('../src/lib/i18n/', import.meta.url);
    let total = 0, translated = 0;
    for (const f of readdirSync(dir).filter(f => f.startsWith('dict-'))) {
      const mod = await import(`../src/lib/i18n/${f}`);
      for (const d of Object.values(mod) as Dict[]) {
        for (const e of Object.values(d)) { total++; if (e.es) translated++; }
      }
      const esFile = f.replace(/^dict-/, '').replace(/\.ts$/, '');
      const esMod = await import(`../src/lib/i18n/es/${esFile}.ts`).catch(() => null);
      if (!esMod) continue;
      const keys = new Set(Object.values(mod).flatMap(d => Object.keys(d as Dict)));
      expect(Object.keys(esMod.es).filter(k => !keys.has(k)), f).toEqual([]);
    }
    expect(translated / total).toBeGreaterThan(0.97);
  });
});
