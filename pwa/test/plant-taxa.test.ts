import { describe, it, expect, vi, afterEach } from 'vitest';
import { plantTaxa } from '../src/lib/plant-search';

describe('plantTaxa', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('returns the items whose lineage reaches plants or fungi', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q161105' } }] } })));
    expect(await plantTaxa(['Q101362', 'Q161105'])).toEqual(new Set(['Q161105']));
  });
  it('never rejects – an aborted search or a failing service gives null', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('signal is aborted without reason', 'AbortError')));
    }));
    const ctl = new AbortController();
    const p = plantTaxa(['Q1'], ctl.signal);
    ctl.abort();
    await expect(p).resolves.toBeNull();
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline'); });
    await expect(plantTaxa(['Q1'])).resolves.toBeNull();
  });
});
