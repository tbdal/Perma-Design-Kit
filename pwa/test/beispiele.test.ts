import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { cleanItem, cleanItems, createBeispiele, createBeispieleHandler } from '../server/beispiele.mjs';

const item = (over: Record<string, unknown> = {}) => ({ id: 'a', title: 'Apfel', plants: [{ latinName: 'Malus domestica' }, { latinName: 'Symphytum officinale' }], members: [{ latinName: 'Symphytum officinale', role: 'mineralFixer', notes: 'x' }, { latinName: 'Gibt es nicht', role: 'companion' }], ...over });

describe('example polycultures (server)', () => {
  it('cleans an item: safe id, https image only, members only for plants of the item', () => {
    const c = cleanItem(item({ id: 'a b/../c', image: 'javascript:1', hidden: 'yes' }))!;
    expect(c.id).toBe('abc');
    expect(c.image).toBe('');
    expect(c.hidden).toBe(false);
    expect(c.members.map((m: { latinName: string }) => m.latinName)).toEqual(['Symphytum officinale']);
    expect(cleanItem(item({ title: '' }))).toBeNull();
    expect(cleanItem(item({ plants: [] }))).toBeNull();
    expect(cleanItem(item({ image: 'https://commons.wikimedia.org/x.jpg' }))!.image).toBe('https://commons.wikimedia.org/x.jpg');
  });
  it('drops doubles and junk from a list', () => {
    expect(cleanItems([item(), item(), 5, null, item({ id: 'b' })]).map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
  });
  it('serves the six defaults until an admin saves; hidden ones are not public', () => {
    const store = createBeispiele({ dir: mkdtempSync(join(tmpdir(), 'bsp-')) });
    expect(store.all()).toHaveLength(6);
    store.save([item({ hidden: true }), item({ id: 'b' })]);
    expect(store.all()).toHaveLength(2);
    expect(store.visible().map((i: { id: string }) => i.id)).toEqual(['b']);
  });
  it('lets only admins read the whole list or write it', async () => {
    const store = createBeispiele({ dir: mkdtempSync(join(tmpdir(), 'bsp-')) });
    let role: string | null = null;
    const handle = createBeispieleHandler({ store, session: () => (role ? { name: 'x', role } : null) });
    const call = async (method: string, path: string, body?: unknown) => {
      const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, headers: { 'content-type': 'application/json' } });
      let status = 0, out = '';
      const res = { writeHead: (s: number) => { status = s; }, end: (t: string) => { out = t; } };
      const done = await handle(req, res, new URL(`http://x${path}`));
      return { done, status, json: out ? JSON.parse(out) : null };
    };
    expect((await call('GET', '/api/polykultur-beispiele')).json.items).toHaveLength(6);
    expect((await call('GET', '/api/admin/big/beispiele')).status).toBe(401);
    role = 'team';
    expect((await call('PUT', '/api/admin/big/beispiele', { items: [] })).status).toBe(403);
    role = 'admin';
    expect((await call('PUT', '/api/admin/big/beispiele', { items: [item({ id: 'z', hidden: true })] })).status).toBe(200);
    expect((await call('GET', '/api/admin/big/beispiele')).json.items).toHaveLength(1);
    expect((await call('GET', '/api/polykultur-beispiele')).json.items).toHaveLength(0);
    expect((await call('GET', '/api/other')).done).toBe(false);
  });
});
