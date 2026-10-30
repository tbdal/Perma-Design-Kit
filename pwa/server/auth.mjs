// Login for expert mode, accounts, and the admin's feature table.
//
// Runs inside plant-proxy-server.mjs (no extra process, no dependencies).
// Accounts live in <private dir>/users.json with scrypt hashes; a session is
// an HMAC-signed cookie (name, role, expiry, account version), so the server
// keeps no session state. nginx asks GET /api/auth/check before serving the
// private chunks under /x/ (auth_request). The private dir is outside git
// (server/data/private/, or PDK_PRIVATE_DIR); scripts/user-admin.mjs manages
// accounts from the shell.
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SESSION_COOKIE = 'pdk_s';
export const SESSION_DAYS = 90;
/** expert: expert mode; team: expert + team mode; admin: like team + /admin/. */
export const ROLES = ['expert', 'team', 'admin'];
const MODES = ['simple', 'classic', 'expert', 'team'];
const FEATURE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,39}$/u;
export const MIN_PASSWORD = 10;

export const DEFAULT_PRIVATE_DIR = process.env.PDK_PRIVATE_DIR
  || join(dirname(fileURLToPath(import.meta.url)), 'data', 'private');

// ── Passwords ────────────────────────────────────────────────────────────
const SCRYPT = { N: 16384, r: 8, p: 1 };

// Async: scrypt takes ~50 ms, the sync variant would block every other request meanwhile.
const scrypt = promisify(scryptCb);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Checked against for unknown names, so the response time doesn't reveal which names exist. */
const DUMMY_HASH = `scrypt$${randomBytes(16).toString('base64')}$${randomBytes(32).toString('base64')}`;

export async function verifyPassword(password, stored) {
  const [kind, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(String(password), Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ── Sessions ─────────────────────────────────────────────────────────────
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** payload: { n: name, r: role, e: expiry ms, v: account version } */
export function signSession(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.n !== 'string' || !ROLES.includes(p.r) || typeof p.e !== 'number' || p.e < now) return null;
    return p;
  } catch {
    return null;
  }
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

// ── Feature table (admin overrides) ─────────────────────────────────────
/** Same rules as sanitizeFeatureConfig() in src/lib/features.ts. */
export function sanitizeFeatures(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, modes] of Object.entries(raw)) {
    if (!FEATURE_ID_RE.test(id) || !Array.isArray(modes)) continue;
    out[id] = MODES.filter(m => modes.includes(m));
  }
  return out;
}

// ── Storage ──────────────────────────────────────────────────────────────
function writePrivate(file, text) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

/** Files in the private dir; re-read when changed on disk (the CLI edits them while the server runs). */
export function createStore(dir = DEFAULT_PRIVATE_DIR) {
  const usersFile = join(dir, 'users.json');
  const featuresFile = join(dir, 'features.json');
  const invitesFile = join(dir, 'invites.json');
  const secretFile = join(dir, 'session-secret');
  const cache = new Map();
  const readJson = (file, fallback) => {
    let mtime = 0;
    try { mtime = statSync(file).mtimeMs; } catch { return fallback; }
    const hit = cache.get(file);
    if (hit && hit.mtime === mtime) return hit.value;
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      cache.set(file, { mtime, value });
      return value;
    } catch {
      return fallback;
    }
  };
  let secret = process.env.PDK_SESSION_SECRET || null;
  return {
    dir,
    users() {
      const list = readJson(usersFile, { users: [] }).users;
      return Array.isArray(list) ? list : [];
    },
    saveUsers(users) { writePrivate(usersFile, JSON.stringify({ users }, null, 2) + '\n'); },
    invites() {
      const list = readJson(invitesFile, { invites: [] }).invites;
      return Array.isArray(list) ? list : [];
    },
    saveInvites(invites) { writePrivate(invitesFile, JSON.stringify({ invites }, null, 2) + '\n'); },
    features() { return sanitizeFeatures(readJson(featuresFile, { features: {} }).features); },
    saveFeatures(features) { writePrivate(featuresFile, JSON.stringify({ features, updatedAt: new Date().toISOString() }, null, 2) + '\n'); },
    secret() {
      if (secret) return secret;
      if (existsSync(secretFile)) secret = readFileSync(secretFile, 'utf8').trim();
      if (!secret) {
        secret = randomBytes(32).toString('base64url');
        writePrivate(secretFile, secret + '\n');
      }
      return secret;
    },
  };
}

// ── Account changes (shared by the admin API and the CLI) ───────────────
export function findUser(users, name) {
  const key = String(name || '').trim().toLowerCase();
  return users.find(u => u.name.toLowerCase() === key) || null;
}

/**
 * Creates or updates an account; resolves to the new list. Rejects with Error(code) on bad input.
 * `users` may be a getter: it is read only after hashing, so a caller that saves
 * right after the await doesn't overwrite changes made meanwhile.
 * @param {any[] | (() => any[])} users
 * @param {{ name: string, role?: string, password?: string }} input
 * @param {Date} [now]
 */
export async function upsertUser(users, { name, role, password, comment }, now = new Date()) {
  name = String(name || '').trim();
  if (!NAME_RE.test(name)) throw new Error('bad-name');
  if (role !== undefined && !ROLES.includes(role)) throw new Error('bad-role');
  if (password !== undefined && String(password).length < MIN_PASSWORD) throw new Error('short-password');
  const hash = password !== undefined ? await hashPassword(String(password)) : undefined;
  if (typeof users === 'function') users = users();
  const note = comment === undefined ? undefined : String(comment).trim().slice(0, 300);
  const existing = findUser(users, name);
  if (!existing) {
    if (password === undefined) throw new Error('short-password');
    return [...users, { name, role: role || 'expert', hash, v: 1, created: now.toISOString(), ...(note ? { comment: note } : {}) }];
  }
  const next = { ...existing };
  if (role !== undefined) next.role = role;
  if (password !== undefined) next.hash = hash;
  if (note !== undefined) { if (note) next.comment = note; else delete next.comment; }
  // A new password or a lost admin right ends that account's open sessions.
  if (password !== undefined || (existing.role === 'admin' && next.role !== 'admin')) next.v = (existing.v || 1) + 1;
  const list = users.map(u => (u === existing ? next : u));
  if (!list.some(u => u.role === 'admin') && users.some(u => u.role === 'admin')) throw new Error('last-admin');
  return list;
}

export function removeUser(users, name) {
  const existing = findUser(users, name);
  if (!existing) throw new Error('not-found');
  const list = users.filter(u => u !== existing);
  if (existing.role === 'admin' && !list.some(u => u.role === 'admin')) throw new Error('last-admin');
  return list;
}

// ── Invitations (link / QR code, valid for one person) ───────────────────
/** Roles an invitation may grant (never admin). */
export const INVITE_ROLES = ['expert', 'team'];
export const INVITE_DAYS = 14;
const tokenHash = (token) => createHash('sha256').update(String(token)).digest('base64url');

/** Data an optional module attaches to an invitation: a small plain JSON object, handed to `onInviteRedeemed`. */
function cleanExtra(extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
  try {
    const text = JSON.stringify(extra);
    return text.length <= 4000 ? JSON.parse(text) : null;
  } catch { return null; }
}

/**
 * Adds an invitation; only a hash of its token is kept. Returns the new list
 * and the token (shown once, put into the link).
 */
export function createInvite(invites, { role, label, by, extra }, now = new Date()) {
  if (!INVITE_ROLES.includes(role)) throw new Error('bad-role');
  const token = randomBytes(24).toString('base64url');
  const cutoff = now.getTime() - 30 * 86_400_000;
  // Used or expired invitations are kept 30 days for the list, then dropped.
  const kept = invites.filter(i => Date.parse(i.used || i.expires) > cutoff);
  const invite = {
    id: randomBytes(6).toString('hex'), hash: tokenHash(token), role,
    label: String(label || '').trim().slice(0, 60), by: by || null,
    ...(cleanExtra(extra) ? { extra: cleanExtra(extra) } : {}),
    created: now.toISOString(), expires: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
  };
  return { invites: [...kept, invite], token, invite };
}

/** The open invitation for a token, or null (unknown, used or expired). */
export function findInvite(invites, token, now = new Date()) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const h = tokenHash(token);
  const hit = invites.find(i => i.hash === h);
  return hit && !hit.used && Date.parse(hit.expires) > now.getTime() ? hit : null;
}

export const inviteStatus = (i, now = new Date()) => (i.used ? 'used' : Date.parse(i.expires) > now.getTime() ? 'open' : 'expired');

// ── Login on a further device (QR code) ──────────────────────────────────
export const DEVICE_MINUTES = 5;

/**
 * One-time codes with which a logged-in person signs in on another device
 * (the phone scans a QR code). Valid for DEVICE_MINUTES, used once, kept only
 * in memory as a hash — a restart of the process simply ends open codes.
 */
export function createDeviceCodes(now = () => Date.now()) {
  const codes = new Map(); // hash → { n, exp }
  const purge = () => { const t = now(); for (const [h, c] of codes) if (c.exp <= t) codes.delete(h); };
  return {
    issue(name) {
      purge();
      if (codes.size > 1000) codes.delete(codes.keys().next().value); // memory cap: drop the oldest, not everyone's codes
      const token = randomBytes(24).toString('base64url');
      const exp = now() + DEVICE_MINUTES * 60_000;
      codes.set(tokenHash(token), { n: name, exp });
      return { token, expires: new Date(exp).toISOString() };
    },
    /** The account name for a valid code (and the code is gone), else null. */
    redeem(token) {
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
      purge();
      const h = tokenHash(token);
      const c = codes.get(h);
      if (!c) return null;
      codes.delete(h);
      return c.n;
    },
  };
}

// ── Login rate limit ─────────────────────────────────────────────────────
export function createLoginLimiter({ max = 5, windowMs = 15 * 60_000 } = {}) {
  const fails = new Map();
  // IPv6 per /64: one connection owns billions of addresses, counting each alone made the limit void.
  const keyOf = ip => String(ip).includes(':') ? String(ip).split(':').slice(0, 4).join(':') : String(ip);
  const recent = (ip, now) => (fails.get(keyOf(ip)) || []).filter(t => now - t < windowMs);
  return {
    blocked(ip, now = Date.now()) { return recent(ip, now).length >= max; },
    fail(ip, now = Date.now()) {
      const k = keyOf(ip), list = [...recent(ip, now), now];
      fails.delete(k); // re-inserted as newest
      fails.set(k, list);
      if (fails.size > 10_000) fails.delete(fails.keys().next().value); // memory cap: drop the oldest, clearing all reset every counter
    },
    reset(ip) { fails.delete(keyOf(ip)); },
  };
}

// ── HTTP ─────────────────────────────────────────────────────────────────
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extra });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJsonBody(req, limit = 10_000) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw new Error('content-type');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function cookieHeader(value, maxAgeS, secure) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`;
}

/**
 * Returns handle(req, res, url, ip) → true when the request was one of ours.
 * isAllowedOrigin: the proxy's origin allowlist — state-changing requests
 * with a foreign Origin are refused (on top of SameSite=Strict).
 * @param {{ store: ReturnType<typeof createStore>, isAllowedOrigin?: (origin: string | null) => boolean,
 *          now?: () => number, limiter?: ReturnType<typeof createLoginLimiter> }} opts
 */
export function createAuthHandler({ store, isAllowedOrigin = () => true, now = () => Date.now(), limiter = createLoginLimiter(), onInviteRedeemed = null, deviceCodes = createDeviceCodes(now) }) {
  function session(req) {
    const p = verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE], store.secret(), now());
    if (!p) return null;
    const user = findUser(store.users(), p.n);
    // Account removed, password changed or role lowered since login: session over.
    if (!user || (user.v || 1) !== p.v || (p.r === 'admin' && user.role !== 'admin')) return null;
    return { name: user.name, role: user.role };
  }

  async function handle(req, res, url, ip) {
    const path = url.pathname;
    if (!path.startsWith('/api/auth/') && !path.startsWith('/api/admin/') && path !== '/api/features') return false;
    const method = req.method;
    const secure = req.headers['x-forwarded-proto'] === 'https';
    if (method !== 'GET' && method !== 'HEAD' && !isAllowedOrigin(req.headers.origin || null)) {
      send(res, 403, { error: 'origin' });
      return true;
    }

    if (path === '/api/features' && method === 'GET') { send(res, 200, { features: store.features() }); return true; }
    if (path === '/api/auth/check') { res.writeHead(session(req) ? 204 : 401, { 'Cache-Control': 'no-store' }); res.end(); return true; }
    if (path === '/api/auth/me' && method === 'GET') {
      const s = session(req);
      s ? send(res, 200, s) : send(res, 401, { error: 'login' });
      return true;
    }
    if (path === '/api/auth/logout' && method === 'POST') { send(res, 204, undefined, { 'Set-Cookie': cookieHeader('', 0, secure) }); return true; }
    if (path === '/api/auth/invite' && (method === 'GET' || method === 'POST')) {
      if (limiter.blocked(ip, now())) { send(res, 429, { error: 'rate' }); return true; }
      const clock = new Date(now());
      try {
        if (method === 'GET') {
          const inv = findInvite(store.invites(), url.searchParams.get('token'), clock);
          if (!inv) { limiter.fail(ip, now()); send(res, 404, { error: 'invalid' }); return true; }
          send(res, 200, { role: inv.role, label: inv.label });
          return true;
        }
        const body = await readJsonBody(req);
        const inv = findInvite(store.invites(), body?.token, clock);
        if (!inv) { limiter.fail(ip, now()); send(res, 404, { error: 'invalid' }); return true; }
        const name = String(body?.name || '').trim();
        if (findUser(store.users(), name)) { send(res, 409, { error: 'name-taken' }); return true; }
        // Checked again after hashing: a parallel request may have used the invite or taken the name meanwhile.
        const users = await upsertUser(() => {
          if (!findInvite(store.invites(), body?.token, clock)) throw new Error('invalid');
          if (findUser(store.users(), name)) throw new Error('name-taken');
          return store.users();
        }, { name, role: inv.role, password: String(body?.password ?? ''), comment: `Eingeladen von ${inv.by || '?'}${inv.label ? ` (${inv.label})` : ''}` }, clock);
        store.saveUsers(users);
        store.saveInvites(store.invites().map(i => (i === inv || i.id === inv.id ? { ...i, used: clock.toISOString(), usedBy: name } : i)));
        const user = findUser(users, name);
        // A module may attach data to an invitation (e.g. shares): carried out now; a failure doesn't undo the account.
        try { await onInviteRedeemed?.(inv, { name: user.name, role: user.role }); } catch (e) { console.error('invite hook failed', e); }
        const token = signSession({ n: user.name, r: user.role, e: now() + SESSION_DAYS * 86_400_000, v: user.v || 1 }, store.secret());
        send(res, 200, { name: user.name, role: user.role }, { 'Set-Cookie': cookieHeader(token, SESSION_DAYS * 86_400, secure) });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'error';
        send(res, code === 'name-taken' ? 409 : code === 'invalid' ? 404 : 400, { error: code });
      }
      return true;
    }
    // A logged-in person asks for a code to sign in on another device (shown as a QR code in Einstellungen).
    if (path === '/api/auth/device' && method === 'POST') {
      const s = session(req);
      if (!s) { send(res, 401, { error: 'login' }); return true; }
      send(res, 200, deviceCodes.issue(s.name));
      return true;
    }
    // The other device redeems it (/anmelden/?geraet=…) and gets its own session.
    if (path === '/api/auth/device/redeem' && method === 'POST') {
      if (limiter.blocked(ip, now())) { send(res, 429, { error: 'rate' }); return true; }
      let body;
      try { body = await readJsonBody(req); } catch { send(res, 400, { error: 'body' }); return true; }
      const name = deviceCodes.redeem(body?.token);
      const user = name ? findUser(store.users(), name) : null;
      if (!user) { limiter.fail(ip, now()); send(res, 404, { error: 'invalid' }); return true; }
      const token = signSession({ n: user.name, r: user.role, e: now() + SESSION_DAYS * 86_400_000, v: user.v || 1 }, store.secret());
      send(res, 200, { name: user.name, role: user.role }, { 'Set-Cookie': cookieHeader(token, SESSION_DAYS * 86_400, secure) });
      return true;
    }
    if (path === '/api/auth/login' && method === 'POST') {
      if (limiter.blocked(ip, now())) { send(res, 429, { error: 'rate' }); return true; }
      let body;
      try { body = await readJsonBody(req); } catch { send(res, 400, { error: 'body' }); return true; }
      const user = findUser(store.users(), body?.name);
      const ok = await verifyPassword(String(body?.password ?? ''), user?.hash || DUMMY_HASH);
      if (!user || !ok) { limiter.fail(ip, now()); send(res, 401, { error: 'credentials' }); return true; }
      limiter.reset(ip);
      const token = signSession({ n: user.name, r: user.role, e: now() + SESSION_DAYS * 86_400_000, v: user.v || 1 }, store.secret());
      send(res, 200, { name: user.name, role: user.role }, { 'Set-Cookie': cookieHeader(token, SESSION_DAYS * 86_400, secure) });
      return true;
    }

    if (path.startsWith('/api/admin/')) {
      const s = session(req);
      if (!s) { send(res, 401, { error: 'login' }); return true; }
      if (s.role !== 'admin') { send(res, 403, { error: 'admin' }); return true; }
      try {
        if (path === '/api/admin/features' && method === 'PUT') {
          const body = await readJsonBody(req);
          const features = sanitizeFeatures(body?.features);
          store.saveFeatures(features);
          send(res, 200, { features });
          return true;
        }
        if (path === '/api/admin/users' && method === 'GET') {
          send(res, 200, { users: store.users().map(u => ({ name: u.name, role: u.role, created: u.created || null, comment: u.comment || '' })) });
          return true;
        }
        if (path === '/api/admin/users' && method === 'POST') {
          const body = await readJsonBody(req);
          const password = body?.password ? String(body.password) : undefined;
          const users = await upsertUser(store.users, { name: body?.name, role: body?.role, password, comment: body?.comment });
          store.saveUsers(users);
          send(res, 200, { ok: true });
          return true;
        }
        if (path === '/api/admin/invites' && method === 'GET') {
          const clock = new Date(now());
          send(res, 200, { invites: store.invites().map(i => ({ id: i.id, extra: i.extra || null, role: i.role, label: i.label, by: i.by, created: i.created, expires: i.expires, used: i.used || null, usedBy: i.usedBy || null, status: inviteStatus(i, clock) })) });
          return true;
        }
        if (path === '/api/admin/invites' && method === 'POST') {
          const body = await readJsonBody(req);
          const made = createInvite(store.invites(), { role: body?.role, label: body?.label, by: s.name, extra: body?.extra }, new Date(now()));
          store.saveInvites(made.invites);
          send(res, 200, { id: made.invite.id, token: made.token, expires: made.invite.expires });
          return true;
        }
        if (path === '/api/admin/invites' && method === 'DELETE') {
          const id = url.searchParams.get('id');
          const list = store.invites();
          if (!list.some(i => i.id === id)) throw new Error('not-found');
          store.saveInvites(list.filter(i => i.id !== id));
          send(res, 200, { ok: true });
          return true;
        }
        if (path === '/api/admin/users' && method === 'DELETE') {
          store.saveUsers(removeUser(store.users(), url.searchParams.get('name')));
          send(res, 200, { ok: true });
          return true;
        }
      } catch (err) {
        const code = err instanceof Error ? err.message : 'error';
        send(res, code === 'not-found' ? 404 : 400, { error: code });
        return true;
      }
    }
    send(res, 404, { error: 'not-found' });
    return true;
  }
  /** The logged-in account of a request ({ name, role }) or null — for other route handlers. */
  handle.session = session;
  return handle;
}
