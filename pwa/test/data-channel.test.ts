import { describe, expect, it } from 'vitest';
import { staleAction } from '../src/lib/data-channel';

describe('reaction to a change made in another tab', () => {
  it('a hidden tab reloads when the user returns', () => {
    expect(staleAction(true, false)).toBe('reload-on-return');
  });
  it('a tab in view only offers the reload', () => {
    expect(staleAction(false, false)).toBe('offer');
  });
  it('an open dialog is never thrown away by a reload', () => {
    expect(staleAction(true, true)).toBe('offer');
    expect(staleAction(false, true)).toBe('offer');
  });
});
