import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  FEATURES, effectiveMode, featureCss, featureDefaults, initialMode, modesFor, offFeatures, sanitizeFeatureConfig,
  type FeatureDef,
} from '../src/lib/features';

describe('feature table', () => {
  it('has unique, well-formed ids', () => {
    const ids = FEATURES.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]{0,39}$/);
  });

  it('every data-feature in the pages is in the table', () => {
    const known = new Set(FEATURES.map(f => f.id));
    const dirs = ['src/pages', 'src/layouts'];
    const used = new Set<string>();
    for (const dir of dirs) {
      for (const file of readdirSync(dir).filter(f => f.endsWith('.astro'))) {
        const src = readFileSync(join(dir, file), 'utf8');
        for (const m of src.matchAll(/data-feature="([^"]+)"/g)) for (const id of m[1].split(/\s+/)) used.add(id);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter(id => !known.has(id))).toEqual([]);
  });

  it('simple mode hides everything but the guide; classic shows everything but the guide', () => {
    expect(offFeatures('simple')).toEqual(FEATURES.filter(f => f.id !== 'simple-guide').map(f => f.id));
    expect(offFeatures('classic')).toEqual(['simple-guide']);
    expect(offFeatures('expert')).toEqual(['simple-guide']);
    expect(offFeatures('team')).toEqual(['simple-guide']);
  });
});

describe('admin overrides', () => {
  it('override a feature, also in several modes; [] turns it off', () => {
    expect(modesFor('water', { water: ['simple', 'expert'] })).toEqual(['simple', 'expert']);
    expect(offFeatures('simple', { water: ['simple'] })).not.toContain('water');
    expect(offFeatures('classic', { water: [] })).toContain('water');
  });

  it('private features stay expert-only, whatever the config says', () => {
    const defs: FeatureDef[] = [...FEATURES, { id: 'waldrand', de: 'Waldrand', en: 'Forest edge', modes: ['expert'], private: true }];
    expect(modesFor('waldrand', { waldrand: ['simple', 'classic', 'expert'] }, defs)).toEqual(['expert']);
    expect(offFeatures('classic', {}, defs)).toContain('waldrand');
  });

  it('team mode is configured like any other mode; private features can be on there too', () => {
    const defs: FeatureDef[] = [...FEATURES, { id: 'waldrand', de: 'W', en: 'W', modes: ['team'], private: true }];
    expect(offFeatures('team', { water: ['classic'] }, defs)).toEqual(['simple-guide', 'water']);
    expect(modesFor('waldrand', { waldrand: ['classic', 'team'] }, defs)).toEqual(['team']);
  });

  it('every feature has a known group', () => {
    for (const f of FEATURES) expect(f.group, f.id).toBe('gartenplan');
  });

  it('ids only the config knows are off in modes it does not list', () => {
    expect(offFeatures('classic', { 'secret-thing': ['expert'] })).toContain('secret-thing');
  });

  it('sanitizes configs from the network', () => {
    expect(sanitizeFeatureConfig({ water: ['simple', 'bogus'], 'Bad Id': ['simple'], zones: 'x', ok: [] }))
      .toEqual({ water: ['simple'], ok: [] });
    expect(sanitizeFeatureConfig(null)).toEqual({});
    expect(sanitizeFeatureConfig([1, 2])).toEqual({});
  });
});

describe('mode choice', () => {
  it('new visitors start simple, returning ones classic, a stored mode wins', () => {
    expect(initialMode(null, false)).toBe('simple');
    expect(initialMode(null, true)).toBe('classic');
    expect(initialMode('expert', false)).toBe('expert');
    expect(initialMode('nonsense', false)).toBe('simple');
  });

  it('expert needs a login', () => {
    expect(effectiveMode('expert', null)).toBe('classic');
    expect(effectiveMode('expert', 'expert')).toBe('expert');
    expect(effectiveMode('simple', null)).toBe('simple');
  });

  it('team mode needs role team or admin', () => {
    expect(effectiveMode('team', 'team')).toBe('team');
    expect(effectiveMode('team', 'admin')).toBe('team');
    expect(effectiveMode('team', 'expert')).toBe('expert');
    expect(effectiveMode('team', null)).toBe('classic');
  });

  it('builds the hiding css and the boot defaults', () => {
    expect(featureCss(['water', 'zones'])).toBe('[data-feature~="water"]{display:none!important}\n[data-feature~="zones"]{display:none!important}');
    expect(featureDefaults()['simple-guide']).toEqual(['simple']);
  });
});
