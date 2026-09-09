// Standalone replacement for the old Netlify Function (netlify/functions/plant-proxy.mts,
// removed). Scrapes PFAF for plant data — the browser can't do this directly due to CORS.
//
// Runs as its own long-lived process (see /etc/systemd/system/plant-proxy.service on the
// VPS), bound to 127.0.0.1 only. It's reached at /api/plant-proxy via a dev-server proxy
// rule (astro.config.mjs) locally, or should be reverse-proxied the same way in any other
// deployment — the frontend (src/lib/plant-search.ts) always calls the relative path and
// has no knowledge of where this process runs.
import { createServer } from 'node:http';

const PORT = process.env.PLANT_PROXY_PORT || 8787;

// PFAF filters on the outbound User-Agent: a self-identifying string like
// "PermaGuildForge/1.0" got a server-side "200 OK, full page, every field
// empty" response every time, while an ordinary browser UA worked every
// time (confirmed by alternating the two back to back, same IP, same
// moment — see ROADMAP.md "Lizenz & Datenquellen" for the full writeup).
//
// This is a deliberate, discussed choice, not an oversight: PFAF's CC BY 4.0
// license explicitly permits reuse of their data, but UA filtering signals
// they don't want *automated* access, which is a separate question from
// whether reusing the data itself is allowed. Weighed masking as a browser
// against leaving PFAF enrichment broken (as chosen for NaturaDB, which
// grants no reuse license at all — a materially different situation) or
// asking PFAF first. Decided to proceed with a browser UA: the data use
// itself is within license, and PFAF is a small non-profit whose own
// licensing text is unusually welcoming to reuse ("we ask that you let us
// know if you ... do anything groovy with this information"). Revisit if
// that balance ever seems off — e.g. if PFAF's ToS explicitly addresses
// automated access, or if request volume grows enough to matter to them.
const OUTBOUND_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';

// --- Origin allowlist ---
// This process is bind-only to 127.0.0.1, so in practice only the dev-server proxy (or a
// same-host reverse proxy) can reach it — a browser can never hit this port directly. Kept
// anyway as defense in depth in case that ever changes (e.g. a future reverse-proxy
// misconfiguration exposing the port directly).
function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / non-browser / proxied request, no Origin header
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '178.254.23.156';
  } catch {
    return false;
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin && isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

// --- Best-effort in-process rate limiting ---
// Unlike a serverless function, this is one long-running process, so an in-memory counter
// actually works reliably here (no cold-start reset, no multi-instance fan-out to worry
// about). Real client IP is read from X-Forwarded-For, set by the dev-server proxy
// (xfwd: true in astro.config.mjs) or should be set by any reverse proxy in front of this.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const requestLog = new Map();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

// Periodically drop IPs with no recent activity so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of requestLog) {
    if (timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) requestLog.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

function emptyResult(latinName) {
  return {
    latinName,
    commonName: '',
    heightM: null, widthM: null,
    climateZone: '',
    eatableScore: null, medsScore: null, materialScore: null,
    eatable: false, meds: false, material: false, culinaric: false,
    fodder: false, fuel: false,
    nitrogenFix: false, mineralFix: false, groundCover: false,
    insects: false, pest: false, animalProtection: false,
    windBreaking: false, windBreakingOnSea: false,
    sunFull: false, sunMid: false, sunShadow: false,
    waterDry: false, waterMid: false, waterWet: false, waterPlant: false,
    growSpeedLow: false, growSpeedMid: false, growSpeedHigh: false,
    phVeryAcid: false, phAcid: false, phNeutral: false,
    phAlkaline: false, phVeryAlkaline: false, phSaline: false,
    fruitMonths: Array(12).fill(false),
    flowerMonths: Array(12).fill(false),
    source: '',
  };
}

// --- PFAF parsing ---

function parsePfafScore(text) {
  const m = text.match(/\((\d) of \d\)/);
  return m ? parseInt(m[1]) : null;
}

function parsePfafDimension(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(m|cm)/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  return m[2] === 'cm' ? val / 100 : val;
}

async function fetchPfaf(name) {
  // PFAF's canonical URL form uses '+' for spaces (application/x-www-form-
  // urlencoded style); encode first, then swap %20 for '+' — NOT the reverse
  // (replace space with '+' and THEN encode), which double-encodes the '+'
  // into a literal %2B. That bug sent PFAF a search for a plant literally
  // named "Malus+domestica", which obviously never matched anything — the
  // page still loaded (200 OK) but with every field empty, which looked
  // exactly like the separate User-Agent-blocking issue above and delayed
  // finding this by a full day. Confirmed via curl -sL: %20 without this bug
  // still works (PFAF 302-redirects it to the '+' form), but going straight
  // to the canonical form skips that extra round trip.
  const url = `https://pfaf.org/user/Plant.aspx?LatinName=${encodeURIComponent(name).replace(/%20/g, '+')}`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
    if (!res.ok) return {};
    html = await res.text();
  } catch { return {}; }

  const result = { source: 'pfaf' };

  // PFAF's overview table used to be plain `<td>Label</td><td>Value</td>` —
  // matched by searching for the label text and reading the next <td>. PFAF
  // redesigned the table (label now in <b>, value now in a <span id="...">),
  // which broke that: the label regex could no longer reach past the </b>
  // tag, and the value was no longer directly inside the <td>. ASP.NET control
  // ids (id="ContentPlaceHolder1_XXX") are far more stable than surrounding
  // markup, since they're tied to server-side code rather than page styling —
  // so look values up by id instead of by adjacent label text.
  const getById = (id) => {
    const m = html.match(new RegExp(`id="ContentPlaceHolder1_${id}"[^>]*>([^<]*)`, 'i'));
    return m ? m[1].replace(/&nbsp;/g, ' ').trim() : '';
  };

  const commonName = getById('lblCommanName'); // sic — typo in PFAF's own markup
  if (commonName) result.commonName = commonName.split(',')[0].trim();

  const edibleRating = getById('txtEdrating');
  if (edibleRating) {
    result.eatableScore = parsePfafScore(edibleRating);
    result.eatable = (result.eatableScore || 0) > 2;
  }

  const medRating = getById('txtMedRating');
  if (medRating) {
    result.medsScore = parsePfafScore(medRating);
    result.meds = (result.medsScore || 0) > 2;
  }

  const otherUseRating = getById('txtOtherUseRating');
  if (otherUseRating) {
    result.materialScore = parsePfafScore(otherUseRating);
    result.material = (result.materialScore || 0) > 2;
  }

  const climateZone = getById('lblUSDAhardiness');
  if (climateZone) result.climateZone = climateZone;

  const physMatch = html.match(/lblPhystatment[^>]*>([^<]+(?:<[^>]+>[^<]*)*)/i);
  const phys = physMatch ? physMatch[1].replace(/<[^>]+>/g, '') : '';

  const heightMatch = phys.match(/growing to (\d+(?:\.\d+)?)\s*(m|cm)/i);
  if (heightMatch) result.heightM = parsePfafDimension(heightMatch[0]);

  const widthMatch = phys.match(/by (\d+(?:\.\d+)?)\s*(m|cm)/i);
  if (widthMatch) result.widthM = parsePfafDimension(widthMatch[0]);

  result.growSpeedHigh = /at a fast rate/i.test(phys);
  result.growSpeedMid = /at a medium rate/i.test(phys);
  result.growSpeedLow = /at a slow rate/i.test(phys);

  result.phVeryAcid = /pH:.*very acid.*soils\./i.test(phys);
  result.phAcid = /pH:.*mildly acid.*soils\./i.test(phys);
  result.phNeutral = /pH:.*neutral.*soils\./i.test(phys);
  result.phAlkaline = /pH:.*mildly alkaline.*soils\./i.test(phys);
  result.phVeryAlkaline = /pH:.*very alkaline.*soils\./i.test(phys);
  result.phSaline = /pH:.*saline.*soils\./i.test(phys);

  result.windBreakingOnSea = /tolerate maritime exposure/i.test(phys);

  result.sunFull = html.includes('sun.jpg');
  result.sunMid = html.includes('partsun.jpg');
  result.sunShadow = html.includes('fullsun.jpg');
  result.waterDry = html.includes('water1.jpg');
  result.waterMid = html.includes('water2.jpg');
  result.waterWet = html.includes('water3.jpg');
  result.waterPlant = html.includes('water4.jpg');

  const fieldSection = html.match(/boots[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)?.join(' ') || '';
  result.nitrogenFix = /Nitrogen Fixer/i.test(fieldSection);
  result.groundCover = /Ground Cover/i.test(fieldSection);
  result.insects = /Attracts Wildlife/i.test(fieldSection);
  result.windBreaking = /Windbreak/i.test(fieldSection);
  result.fuel = /\bFuel\b/i.test(fieldSection);
  result.fodder = /\bFodder\b/i.test(fieldSection);
  result.pest = /\bRepellent\b/i.test(fieldSection);
  result.animalProtection = /Living trellis/i.test(fieldSection);
  result.mineralFix = /Dynamic accumulator/i.test(fieldSection);
  result.culinaric = /\bCondiment\b/i.test(fieldSection);

  return result;
}

// --- NaturaDB parsing ---
//
// Disabled for now (see ROADMAP.md "Lizenz & Datenquellen"): naturadb.de grants no reuse
// license for its editorial plant database, and its robots.txt has an explicit
// "Datenbank Crawler: Disallow /" entry — a clear anti-scraping signal. Re-enable only
// after obtaining permission or API access from NaturaDB.
const NATURADB_ENABLED = false;

function getTableValue(html, key) {
  const re = new RegExp(`<td[^>]*>\\s*${key}:?\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

function parseMonthIndicators(html) {
  const months = Array(12).fill(false);
  const indicators = html.match(/month-indicator[^>]*>/gi) || [];
  indicators.forEach((indicator, i) => {
    if (i < 12) months[i] = /data-active/i.test(indicator);
  });
  return months;
}

async function fetchNaturaDb(name) {
  if (!NATURADB_ENABLED) return {};

  const slug = name.toLowerCase().replace(/ /g, '-');
  const url = `https://www.naturadb.de/pflanzen/${slug}/`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
    if (!res.ok) return {};
    html = await res.text();
  } catch { return {}; }

  const result = { source: 'naturadb' };

  const h1Match = html.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match) result.commonName = h1Match[1].trim();

  const heightStr = getTableValue(html, 'Höhe');
  const hMatch = heightStr.match(/([\d,]+)\s*(?:-\s*([\d,]+))?\s*(m|cm)/);
  if (hMatch) {
    const val = parseFloat(hMatch[2] || hMatch[1]);
    result.heightM = hMatch[3] === 'cm' ? val / 100 : val;
  }

  const widthStr = getTableValue(html, 'Breite');
  const wMatch = widthStr.match(/([\d,]+)\s*(?:-\s*([\d,]+))?\s*(m|cm)/);
  if (wMatch) {
    const val = parseFloat(wMatch[2] || wMatch[1]);
    result.widthM = wMatch[3] === 'cm' ? val / 100 : val;
  }

  const licht = getTableValue(html, 'Licht');
  result.sunFull = licht.includes('sun_0') || licht.includes('Sonne');
  result.sunMid = licht.includes('sun_1') || licht.includes('Halbschatten');
  result.sunShadow = licht.includes('sun_2') || licht.includes('Schatten');

  const wasser = getTableValue(html, 'Wasser');
  result.waterDry = wasser.includes('water_0') || /trocken/i.test(wasser);
  result.waterMid = wasser.includes('water_1') || /frisch|feucht/i.test(wasser);
  result.waterWet = wasser.includes('water_2') || /nass/i.test(wasser);
  result.waterPlant = /wasserpflanze/i.test(wasser);

  result.fruitMonths = parseMonthIndicators(getTableValue(html, 'Fruchtreife'));
  result.flowerMonths = parseMonthIndicators(getTableValue(html, 'Blühzeit'));

  return result;
}

// --- Main handler ---

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const origin = req.headers.origin || null;
  const headers = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }

  if (origin && !isAllowedOrigin(origin)) {
    res.writeHead(403, headers);
    return res.end(JSON.stringify({ error: 'Origin not allowed' }));
  }

  if (isRateLimited(clientIp(req))) {
    res.writeHead(429, headers);
    return res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
  }

  const name = url.searchParams.get('name');
  if (!name) {
    res.writeHead(400, headers);
    return res.end(JSON.stringify({ error: 'Missing ?name= parameter' }));
  }

  const result = emptyResult(name);
  const [pfaf, naturaDb] = await Promise.all([fetchPfaf(name), fetchNaturaDb(name)]);

  const sources = [];

  if (Object.keys(pfaf).length > 1) {
    sources.push('pfaf');
    for (const [key, value] of Object.entries(pfaf)) {
      if (key === 'source') continue;
      if (value !== null && value !== undefined && value !== '' && value !== false) {
        result[key] = value;
      }
    }
  }

  if (Object.keys(naturaDb).length > 1) {
    sources.push('naturadb');
    for (const [key, value] of Object.entries(naturaDb)) {
      if (key === 'source') continue;
      const current = result[key];
      const isEmpty = current === null || current === undefined || current === '' || current === false ||
        (Array.isArray(current) && current.every((v) => !v));
      if (isEmpty && value !== null && value !== undefined && value !== '') {
        result[key] = value;
      }
    }
  }

  result.source = sources.join('+');

  res.writeHead(200, headers);
  res.end(JSON.stringify(result));
}

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error('plant-proxy-server error:', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`plant-proxy-server listening on http://127.0.0.1:${PORT} (NaturaDB: ${NATURADB_ENABLED ? 'enabled' : 'disabled'})`);
});
