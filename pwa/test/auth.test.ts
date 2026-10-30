import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAuthHandler, createLoginLimiter, createStore, hashPassword, parseCookies, removeUser, sanitizeFeatures,
  signSession, upsertUser, verifyPassword, verifySession,
} from '../server/auth.mjs';

describe('passwords and sessions', () => {
  it('hashes and verifies', async () => {
    const h = await hashPassword('richtig-lang-1');
    expect(h).toMatch(/^scrypt\$/);
    expect(await verifyPassword('richtig-lang-1', h)).toBe(true);
    expect(await verifyPassword('falsch', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });

  it('signs sessions and rejects tampered or expired ones', () => {
    const tok = signSession({ n: 'Ann', r: 'expert', e: 2000, v: 1 }, 'geheim');
    expect(verifySession(tok, 'geheim', 1000)).toMatchObject({ n: 'Ann', r: 'expert' });
    expect(verifySession(tok, 'geheim', 3000)).toBeNull();
    expect(verifySession(tok, 'anderes', 1000)).toBeNull();
    const [body, mac] = tok.split('.');
    const forged = Buffer.from(JSON.stringify({ n: 'Ann', r: 'admin', e: 2000, v: 1 })).toString('base64url');
    expect(verifySession(`${forged}.${mac}`, 'geheim', 1000)).toBeNull();
    expect(verifySession(`${body}.`, 'geheim', 1000)).toBeNull();
  });

  it('parses cookies', () => {
    expect(parseCookies('a=1; pdk_s=abc.def; b=')).toEqual({ a: '1', pdk_s: 'abc.def', b: '' });
  });
});

describe('accounts', () => {
  it('creates, updates and removes; keeps the last admin', async () => {
    let users = await upsertUser([], { name: 'Admin', role: 'admin', password: 'zehn-zeichen' });
    users = await upsertUser(users, { name: 'Gast', password: 'zehn-zeichen' });
    expect(users.map((u: { role: string }) => u.role)).toEqual(['admin', 'expert']);
    await expect(upsertUser(users, { name: 'admin', role: 'expert' })).rejects.toThrow('last-admin');
    expect(() => removeUser(users, 'Admin')).toThrow('last-admin');
    await expect(upsertUser(users, { name: 'Neu', password: 'kurz' })).rejects.toThrow('short-password');
    await expect(upsertUser(users, { name: '<script>', password: 'zehn-zeichen' })).rejects.toThrow('bad-name');
    const v1 = users[1].v;
    users = await upsertUser(() => users, { name: 'gast', password: 'anderes-passwort' });
    expect(users[1].v).toBe(v1 + 1);
    expect(removeUser(users, 'GAST')).toHaveLength(1);
    expect((await upsertUser(users, { name: 'Team', role: 'team', password: 'zehn-zeichen' })).at(-1).role).toBe('team');
    await expect(upsertUser(users, { name: 'X', role: 'root', password: 'zehn-zeichen' })).rejects.toThrow('bad-role');
  });

  it('feature table keeps only known modes and valid ids', () => {
    expect(sanitizeFeatures({ water: ['simple', 'x'], 'Bad Id': [], zones: 'no' })).toEqual({ water: ['simple'] });
  });

  it('rate-limits failed logins per address', () => {
    const l = createLoginLimiter({ max: 2, windowMs: 1000 });
    l.fail('1.2.3.4', 0); l.fail('1.2.3.4', 10);
    expect(l.blocked('1.2.3.4', 20)).toBe(true);
    expect(l.blocked('5.6.7.8', 20)).toBe(false);
    expect(l.blocked('1.2.3.4', 1500)).toBe(false);
  });

  it('counts an IPv6 /64 as one client', () => {
    const l = createLoginLimiter({ max: 2, windowMs: 1000 });
    l.fail('2001:db8:1:2::a', 0); l.fail('2001:db8:1:2::b', 10);
    expect(l.blocked('2001:db8:1:2::c', 20)).toBe(true);
    expect(l.blocked('2001:db8:1:3::a', 20)).toBe(false);
  });
});

describe('HTTP endpoints', () => {
  let server: Server;
  let base = '';
  let dir = '';
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pdk-auth-'));
    const store = createStore(dir);
    store.saveUsers(await upsertUser(await upsertUser([], { name: 'Admin', role: 'admin', password: 'admin-passwort' }), { name: 'Gast', password: 'gast-passwort' }));
    const handle = createAuthHandler({ store, isAllowedOrigin: (o: string | null) => !o || o === 'http://ok.example' });
    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://x');
      void handle(req, res, url, '9.9.9.9').then((done: boolean) => { if (!done) { res.writeHead(418); res.end(); } });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(() => { server.close(); rmSync(dir, { recursive: true, force: true }); });

  const login = (name: string, password: string) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password }),
  });
  const cookieOf = (res: Response) => (res.headers.get('set-cookie') || '').split(';')[0];

  it('signs in a further device with a one-time code from a logged-in session', async () => {
    const post = (path: string, body: unknown, cookie = '') => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    expect((await post('/api/auth/device', {})).status).toBe(401);
    const cookie = cookieOf(await login('gast', 'gast-passwort'));
    const code = await (await post('/api/auth/device', {}, cookie)).json();
    expect(code.token.length).toBeGreaterThan(20);
    expect(Date.parse(code.expires) - Date.now()).toBeLessThanOrEqual(5 * 60_000 + 1000);
    const phone = await post('/api/auth/device/redeem', { token: code.token });
    expect(phone.status).toBe(200);
    expect(await phone.json()).toEqual({ name: 'Gast', role: 'expert' });
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: cookieOf(phone) } })).status).toBe(200);
    // once only
    expect((await post('/api/auth/device/redeem', { token: code.token })).status).toBe(404);
  });

  it('leaves other paths to the plant proxy', async () => {
    expect((await fetch(`${base}/api/plant-proxy?name=x`)).status).toBe(418);
  });

  it('logs in, reports the session, logs out', async () => {
    expect((await fetch(`${base}/api/auth/me`)).status).toBe(401);
    expect((await fetch(`${base}/api/auth/check`)).status).toBe(401);
    expect((await login('gast', 'falsch-falsch')).status).toBe(401);
    const res = await login('gast', 'gast-passwort');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ name: 'Gast', role: 'expert' });
    const setCookie = res.headers.get('set-cookie') || '';
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
    const cookie = cookieOf(res);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie } })).status).toBe(200);
    expect((await fetch(`${base}/api/auth/check`, { headers: { cookie } })).status).toBe(204);
    // experts are not admins
    expect((await fetch(`${base}/api/admin/users`, { headers: { cookie } })).status).toBe(403);
    const out = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { cookie } });
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  it('refuses state changes from foreign origins and non-JSON bodies', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}',
    });
    expect(res.status).toBe(403);
    const form = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'name=a' });
    expect(form.status).toBe(400);
  });

  it('lets the admin edit features and accounts; a new password ends sessions', async () => {
    const cookie = cookieOf(await login('Admin', 'admin-passwort'));
    const put = await fetch(`${base}/api/admin/features`, {
      method: 'PUT', headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: { water: ['simple', 'expert'], junk: 'x' } }),
    });
    expect(await put.json()).toEqual({ features: { water: ['simple', 'expert'] } });
    expect(await (await fetch(`${base}/api/features`)).json()).toEqual({ features: { water: ['simple', 'expert'] } });
    expect(statSync(join(dir, 'features.json')).mode & 0o777).toBe(0o600);

    const gast = cookieOf(await login('Gast', 'gast-passwort'));
    const pw = await fetch(`${base}/api/admin/users`, {
      method: 'POST', headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Gast', password: 'neues-passwort' }),
    });
    expect(pw.status).toBe(200);
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: gast } })).status).toBe(401);
    const list = await (await fetch(`${base}/api/admin/users`, { headers: { cookie } })).json();
    expect(list.users.map((u: { name: string }) => u.name)).toEqual(['Admin', 'Gast']);
    expect(JSON.stringify(list)).not.toContain('scrypt');
    const del = await fetch(`${base}/api/admin/users?name=Admin`, { method: 'DELETE', headers: { cookie } });
    expect(await del.json()).toEqual({ error: 'last-admin' });
  });

  it('invites one person per link: role preset, single use, admin only', async () => {
    const admin = cookieOf(await login('Admin', 'admin-passwort'));
    const json = { 'Content-Type': 'application/json' };
    const noAdmin = await fetch(`${base}/api/admin/invites`, { method: 'POST', headers: json, body: JSON.stringify({ role: 'team' }) });
    expect(noAdmin.status).toBe(401);
    const bad = await fetch(`${base}/api/admin/invites`, { method: 'POST', headers: { ...json, cookie: admin }, body: JSON.stringify({ role: 'admin' }) });
    expect(bad.status).toBe(400);
    const made = await (await fetch(`${base}/api/admin/invites`, { method: 'POST', headers: { ...json, cookie: admin }, body: JSON.stringify({ role: 'team', label: 'Jörn' }) })).json();
    expect(made.token).toMatch(/^[\w-]{30,}$/);
    // the token itself is not stored
    expect(readFileSync(join(dir, 'invites.json'), 'utf8')).not.toContain(made.token);

    expect(await (await fetch(`${base}/api/auth/invite?token=${made.token}`)).json()).toEqual({ role: 'team', label: 'Jörn' });
    const redeem = (token: string, name: string, password = 'langes-passwort') => fetch(`${base}/api/auth/invite`, { method: 'POST', headers: json, body: JSON.stringify({ token, name, password }) });
    expect((await redeem(made.token, 'Gast')).status).toBe(409); // name taken
    expect((await redeem(made.token, 'Neu', 'kurz')).status).toBe(400);
    const ok = await redeem(made.token, 'Jörn');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ name: 'Jörn', role: 'team' });
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: cookieOf(ok) } })).status).toBe(200);
    // the account's comment says who invited (and for whom); admins can edit it later
    const users = await (await fetch(`${base}/api/admin/users`, { headers: { cookie: admin } })).json();
    expect(users.users.find((u: { name: string }) => u.name === 'Jörn').comment).toBe('Eingeladen von Admin (Jörn)');
    const edit = await fetch(`${base}/api/admin/users`, { method: 'POST', headers: { ...json, cookie: admin }, body: JSON.stringify({ name: 'Jörn', comment: 'Bauleitung, Tel. im Büro' }) });
    expect(edit.status).toBe(200);
    expect((await (await fetch(`${base}/api/admin/users`, { headers: { cookie: admin } })).json()).users.find((u: { name: string }) => u.name === 'Jörn').comment).toBe('Bauleitung, Tel. im Büro');
    expect((await fetch(`${base}/api/auth/me`, { headers: { cookie: cookieOf(ok) } })).status).toBe(200); // editing does not end the session
    // second use fails
    expect((await redeem(made.token, 'Zweite')).status).toBe(404);
    expect((await fetch(`${base}/api/auth/invite?token=${made.token}`)).status).toBe(404);
    const list = await (await fetch(`${base}/api/admin/invites`, { headers: { cookie: admin } })).json();
    expect(list.invites[0]).toMatchObject({ status: 'used', usedBy: 'Jörn', role: 'team' });
    expect(JSON.stringify(list)).not.toContain(made.token);
    // revoke
    const m2 = await (await fetch(`${base}/api/admin/invites`, { method: 'POST', headers: { ...json, cookie: admin }, body: JSON.stringify({ role: 'expert' }) })).json();
    const del = await fetch(`${base}/api/admin/invites?id=${m2.id}`, { method: 'DELETE', headers: { cookie: admin } });
    expect(del.status).toBe(200);
    expect((await redeem(m2.token, 'Dritte')).status).toBe(404);
  });
});
