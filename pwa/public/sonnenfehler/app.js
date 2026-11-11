const MIN_SUN_SEC = 600; // weniger als 10 min/Std. gilt als Modellrauschen
const DAYS = 92;
const $ = id => document.getElementById(id);

// Index der letzten Stunde mit Sonne bis einschließlich nowIdx, sonst -1
function lastSun(values, nowIdx) {
  for (let i = nowIdx; i >= 0; i--) if (values[i] >= MIN_SUN_SEC) return i;
  return -1;
}

function ago(ms) {
  const h = Math.max(0, Math.round(ms / 36e5)), d = Math.floor(h / 24), r = h % 24;
  return d ? `${d} ${d === 1 ? 'Tag' : 'Tagen'} ${r} Std.` : `${r} Std.`;
}

// Ortszeit-Strings wie "2026-11-11T17:00" als UTC lesen, damit Differenzen stimmen
const t = s => Date.parse(s + 'Z');
const fmt = s => new Date(t(s)).toLocaleString('de-DE', { timeZone:'UTC', weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });

function label(p) { return [p.name, p.admin1, p.country_code].filter(Boolean).join(', '); }
const esc = s => s.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`); // API-Text in innerHTML

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

$('f').onsubmit = async e => {
  e.preventDefault();
  $('hits').textContent = ''; $('out').textContent = 'Suche …';
  try {
    const d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=5&language=de&name=' + encodeURIComponent($('q').value.trim()));
    if (!d.results) { $('out').textContent = 'Kein Ort gefunden.'; return; }
    $('out').textContent = '';
    if (d.results.length === 1) return show(d.results[0]);
    for (const p of d.results) {
      const b = document.createElement('button');
      b.textContent = label(p);
      b.onclick = () => show(p);
      $('hits').append(b);
    }
  } catch (err) { $('out').textContent = 'Fehler bei der Suche: ' + err.message; }
};

async function show(p) {
  $('hits').textContent = '';
  $('out').textContent = 'Lade Wetterdaten …';
  try { localStorage.setItem('ort', JSON.stringify(p)); } catch {}
  try {
    const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=sunshine_duration&current=sunshine_duration&past_days=${DAYS}&forecast_days=1&timezone=auto`);
    const { time, sunshine_duration: sun } = d.hourly;
    const nowHour = d.current.time.slice(0, 13) + ':00';
    const nowIdx = time.indexOf(nowHour);
    if (nowIdx < 0) throw new Error('aktuelle Stunde fehlt');
    const i = lastSun(sun, nowIdx);

    let html;
    if (i === nowIdx) html = `<div class="big">☀️ Gerade scheint die Sonne!</div>`;
    else if (i < 0) html = `<div class="big">über ${DAYS} Tage</div><p>In ${esc(label(p))} hat seit über ${DAYS} Tagen keine Sonne geschienen.</p>`;
    else html = `<div class="big">seit ${ago(t(d.current.time) - t(time[i]) - 36e5)}</div>
      <p>ohne Sonne in <b>${esc(label(p))}</b>.<br><span class="muted">Zuletzt Sonne: ${fmt(time[i])} Uhr (Ortszeit)</span></p>`;

    // Leiste: letzte 7 Tage, eine Zelle pro Stunde
    const from = Math.max(0, nowIdx - nowIdx % 24 - 6 * 24); // ab Mitternacht vor 6 Tagen, Daten starten um 00:00
    const cells = sun.slice(from, nowIdx + 1).map(v => `<div class="${v >= MIN_SUN_SEC ? 's' : ''}"></div>`).join('');
    $('out').innerHTML = html + `<div class="muted">Letzte 7 Tage (eine Zeile pro Tag, 0–23 Uhr, gelb = Sonne):</div><div id="bar">${cells}</div>`;
  } catch (err) { $('out').textContent = 'Fehler beim Laden: ' + err.message; }
}

try { const p = JSON.parse(localStorage.getItem('ort')); if (p) { $('q').value = p.name; show(p); } } catch {}

// Self-Check
console.assert(lastSun([0, 700, 0], 2) === 1, 'Sonne vor 1 h');
console.assert(lastSun([0, 0, 900], 2) === 2, 'Sonne jetzt');
console.assert(lastSun([0, 0, 0], 2) === -1, 'nie Sonne');
console.assert(lastSun([599, 0], 1) === -1, 'unter Schwelle');
console.assert(lastSun([700, 0, 800], 1) === 0, 'Zukunft ignoriert');
console.assert(ago(30 * 36e5) === '1 Tag 6 Std.', 'ago');
