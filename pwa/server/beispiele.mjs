// Example polycultures ("Beispiele laden" on /polykulturen): the list lives in server/data/private/polykultur-beispiele.json
// (admins change it on /admin/); until then the six defaults from server/data/polykultur-beispiele.default.json are served.
//   GET /api/polykultur-beispiele        – visible examples, for everyone
//   GET /api/admin/big/beispiele         – all examples (admin)
//   PUT /api/admin/big/beispiele         – replace the list (admin), body { items }
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILE = join(HERE, 'data', 'polykultur-beispiele.default.json');
export const MAX_ITEMS = 60;
export const MAX_BYTES = 1_500_000;
const ROLES = ['companion', 'groundCover', 'nFixer', 'mineralFixer', 'insectary', 'pestConfuser', 'fruitProducer', 'other'];
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const isPlainObject = o => o && typeof o === 'object' && !Array.isArray(o);

/** One example as the server keeps it; null when it is unusable. Plants stay free-form (the browser normalizes them on load). */
export function cleanItem(raw) {
  if (!isPlainObject(raw)) return null;
  const id = str(raw.id, 60).replace(/[^A-Za-z0-9_-]/g, '');
  const title = str(raw.title, 80);
  if (!id || !title || !Array.isArray(raw.plants) || !raw.plants.length) return null;
  const image = /^https:\/\//.test(str(raw.image, 400)) ? str(raw.image, 400) : '';
  const plants = raw.plants.slice(0, 40).filter(p => isPlainObject(p) && str(p.latinName, 120)).map(p => JSON.parse(JSON.stringify(p)));
  if (!plants.length) return null;
  const latin = new Set(plants.map(p => `${str(p.latinName, 120)}|${str(p.varietyName, 80)}`.toLowerCase()));
  const members = (Array.isArray(raw.members) ? raw.members : []).slice(0, 40).filter(m => isPlainObject(m) && str(m.latinName, 120))
    .map(m => ({ latinName: str(m.latinName, 120), ...(str(m.varietyName, 80) ? { varietyName: str(m.varietyName, 80) } : {}), role: ROLES.includes(m.role) ? m.role : 'companion', notes: str(m.notes, 300) }))
    .filter(m => latin.has(`${m.latinName}|${m.varietyName ?? ''}`.toLowerCase()));
  return { id, title, description: str(raw.description, 500), image, hidden: raw.hidden === true, anchor: str(raw.anchor, 120), plants, members };
}

export function cleanItems(raw) {
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(raw) ? raw.slice(0, MAX_ITEMS) : []) {
    const it = cleanItem(r);
    if (it && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
  }
  return out;
}

export function createBeispiele({ dir, defaultFile = DEFAULT_FILE }) {
  const file = join(dir, 'polykultur-beispiele.json');
  const read = (f) => { try { return cleanItems(JSON.parse(readFileSync(f, 'utf8')).items); } catch { return []; } };
  return {
    all() { return existsSync(file) ? read(file) : read(defaultFile); },
    visible() { return this.all().filter(i => !i.hidden); },
    save(items) {
      const clean = cleanItems(items);
      const text = JSON.stringify({ items: clean, updatedAt: new Date().toISOString() });
      if (text.length > MAX_BYTES) throw Object.assign(new Error('too-large'), { status: 413 });
      mkdirSync(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, text, { mode: 0o600 });
      renameSync(tmp, file);
      return clean;
    },
  };
}

/** Request handler: returns true when it answered. `session(req)` gives { name, role } or null. */
async function readJson(req, limit = MAX_BYTES) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('content-type'), { status: 400 });
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too-large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export function createBeispieleHandler({ store, session, readBody = readJson, isAllowedOrigin = () => true }) {
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return async function handle(req, res, url) {
    const path = url.pathname;
    if (path === '/api/polykultur-beispiele' && req.method === 'GET') { send(res, 200, { items: store.visible() }); return true; }
    if (path !== '/api/admin/big/beispiele') return false;
    const s = session(req);
    if (!s) { send(res, 401, { error: 'login' }); return true; }
    if (s.role !== 'admin') { send(res, 403, { error: 'admin' }); return true; }
    if (req.method === 'GET') { send(res, 200, { items: store.all() }); return true; }
    if (req.method === 'PUT') {
      if (!isAllowedOrigin(req.headers.origin || null)) { send(res, 403, { error: 'origin' }); return true; }
      try {
        const body = await readBody(req);
        send(res, 200, { items: store.save(body?.items) });
      } catch (e) { send(res, e?.status === 413 ? 413 : 400, { error: e?.status === 413 ? 'too-large' : 'body' }); }
      return true;
    }
    send(res, 405, { error: 'method' });
    return true;
  };
}
