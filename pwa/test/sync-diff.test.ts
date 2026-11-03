import { describe, expect, it } from 'vitest';
import { diffRecords } from '../src/lib/sync';

describe('diffRecords', () => {
  const local = [{ id: 'a', name: 'A', updatedAt: '2' }, { id: 'b', name: 'B', updatedAt: '5' }, { id: 'c', name: 'C', updatedAt: '1' }];
  const incoming = [{ id: 'a', name: 'A', updatedAt: '2' }, { id: 'b', name: 'B2', updatedAt: '3' }, { id: 'c', name: 'C2', updatedAt: '4' }, { id: 'd', name: 'D' }];

  it('sorts into added, replaced and kept (keepNewer)', () => {
    expect(diffRecords(incoming, local, true)).toEqual({ added: ['D'], replaced: ['C2'], kept: ['B2'] });
  });

  it('without keepNewer the backup wins everywhere it differs', () => {
    expect(diffRecords(incoming, local, false)).toEqual({ added: ['D'], replaced: ['B2', 'C2'], kept: [] });
  });
});
