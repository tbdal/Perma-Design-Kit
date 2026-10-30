import { describe, expect, it } from 'vitest';
import { safeNext } from '../src/lib/safe-next';

const O = 'https://permadesignkit.org';

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/gartenplan/?x=1#y', O)).toBe('/gartenplan/?x=1#y');
  });
  it('refuses anything that leaves the site', () => {
    for (const raw of ['/\\evil.com', '/%09/evil.com', '/\t/evil.com', '//evil.com', 'https://evil.com', '', 'gartenplan'])
      expect(new URL(safeNext(raw, O), O).origin, raw).toBe(O);
    expect(safeNext('//evil.com', O)).toBe('/');
    expect(safeNext('https://evil.com', O)).toBe('/');
    expect(safeNext('/\\evil.com', O)).toBe('/');
  });
});
