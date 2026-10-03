import { describe, expect, it } from 'vitest';
import { createEmptyPlant } from '../src/lib/types';
import { readFileSync } from 'node:fs';
import { BOOL_FIELDS, BOOL_FIELD_KEYS, FORM_BOOL_FIELD_KEYS, fieldsOf } from '../src/lib/plant-fields';

describe('central field table', () => {
  it('covers every boolean PlantData field exactly once', () => {
    const plant = createEmptyPlant();
    const booleanKeys = Object.keys(plant).filter(k => typeof (plant as any)[k] === 'boolean').sort();
    const tableKeys = BOOL_FIELDS.map(f => f.key as string).sort();
    expect(tableKeys).toEqual(booleanKeys);
  });

  it('has unique CSV headers', () => {
    const headers = BOOL_FIELDS.map(f => f.csv);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it('has unique PDF chip codes within each group', () => {
    for (const group of new Set(BOOL_FIELDS.map(f => f.group))) {
      const codes = BOOL_FIELDS.filter(f => f.group === group && f.badge).map(f => f.badge!.pdfCode);
      expect(new Set(codes).size, group).toBe(codes.length);
    }
  });

  it('follows the documented order of uses and functions', () => {
    expect(fieldsOf('usage').map(f => f.key)).toEqual(
      ['eatable', 'meds', 'culinaric', 'material', 'fuel', 'fodder', 'fiber', 'wood', 'ornamental', 'dyes']);
    expect(fieldsOf('function').filter(f => f.inForm !== false).map(f => f.key)).toEqual(
      ['nitrogenFix', 'mineralFix', 'insects', 'pest', 'groundCover', 'animalProtection', 'windBreaking']);
  });

  it('has a checkbox in the edit form for exactly the form fields', () => {
    const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
    const boxes = new Set([...page.matchAll(/<input type="checkbox" id="f-(\w+)"/g)].map(m => m[1]));
    for (const key of FORM_BOOL_FIELD_KEYS) expect(boxes.has(key), key).toBe(true);
    for (const key of BOOL_FIELD_KEYS.filter(k => !FORM_BOOL_FIELD_KEYS.includes(k))) expect(boxes.has(key), key).toBe(false);
  });
});
