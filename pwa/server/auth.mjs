// Login for expert mode, accounts, and the admin's feature table.
//
// Runs inside plant-proxy-server.mjs (no extra process, no dependencies).
// Accounts live in <private dir>/users.json with scrypt hashes; a session is
// an HMAC-signed cookie (name, role, expiry, account version), so the server
// keeps no session state. nginx asks GET /api/auth/check before serving the
// private chunks under /x/ (auth_request). The private dir is outside git
// (server/data/private/, or PDK_PRIVATE_DIR); scripts/user-admin.mjs manages
// accounts from the shell.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
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

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Checked against for unknown names, so the response time doesn't reveal which names exist. */
const DUMMY_HASH = hashPassword(randomBytes(12).toString('base64'));

export function verifyPassword(password, stored) {
  const [kind, saltB64, hashB64] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
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
 * Creates or updates an account; returns the new list. Throws Error(code) on bad input.
 * @param {any[]} users
 * @param {{ name: string, role?: string, password?: string }} input
 * @param {Date} [now]
 */
export function upsertUser(users, { name, role, password }, now = new Date()) {
  name = String(name || '').trim();
  if (!NAME_RE.test(name)) throw new Error('bad-name');
  if (role !== undefined && !ROLES.includes(role)) throw new Error('bad-role');
  if (password !== undefined && String(password).length < MIN_PASSWORD) throw new Error('short-password');
  const existing = findUser(users, name);
  if (!existing) {
    if (password === undefined) throw new Error('short-password');
    return [...users, { name, role: role || 'expert', hash: hashPassword(String(password)), v: 1, created: now.toISOString() }];
  }
  const next = { ...existing };
  if (role !== undefined) next.role = role;
  if (password !== undefined) next.hash = hashPassword(String(password));
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

// ── Login rate limit ─────────────────────────────────────────────────────
export function createLoginLimiter({ max = 5, windowMs = 15 * 60_000 } = {}) {
  const fails = new Map();
  const recent = (ip, now) => (fails.get(ip) || []).filter(t => now - t < windowMs);
  return {
    blocked(ip, now = Date.now()) { return recent(ip, now).length >= max; },
    fail(ip, now = Date.now()) {
      fails.set(ip, [...recent(ip, now), now]);
      if (fails.size > 10_000) fails.clear(); // memory cap under abuse
    },
    reset(ip) { fails.delete(ip); },
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
export function createAuthHandler({ store, isAllowedOrigin = () => true, now = () => Date.now(), limiter = createLoginLimiter() }) {
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
    if (path === '/api/auth/login' && method === 'POST') {
      if (limiter.blocked(ip, now())) { send(res, 429, { error: 'rate' }); return true; }
      let body;
      try { body = await readJsonBody(req); } catch { send(res, 400, { error: 'body' }); return true; }
      const user = findUser(store.users(), body?.name);
      const ok = verifyPassword(String(body?.password ?? ''), user?.hash || DUMMY_HASH);
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
          send(res, 200, { users: store.users().map(u => ({ name: u.name, role: u.role, created: u.created || null })) });
          return true;
        }
        if (path === '/api/admin/users' && method === 'POST') {
          const body = await readJsonBody(req);
          const password = body?.password ? String(body.password) : undefined;
          const users = upsertUser(store.users(), { name: body?.name, role: body?.role, password });
          store.saveUsers(users);
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
