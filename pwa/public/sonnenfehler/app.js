const DAYS = 92;     // so weit reicht die Abfrage zurück
const BAR_DAYS = 30; // so viele Tage zeigt die Grafik
const $ = id => document.getElementById(id);

// Ab so vielen Sonnenminuten pro Stunde zählt eine Stunde als sonnig (vom Nutzer einstellbar)
const minSec = () => Math.min(60, Math.max(1, Number($('min').value) || 10)) * 60;

// Index der letzten Stunde mit mindestens min Sekunden Sonne bis einschließlich nowIdx, sonst -1
function lastSun(values, nowIdx, min) {
  for (let i = nowIdx; i >= 0; i--) if (values[i] >= min) return i;
  return -1;
}

// Minuten Sonne pro Tag; nur Stunden ab min Sekunden zählen (min = 0: alle)
function avgPerDay(values, min) {
  const sec = values.reduce((s, v) => s + (v >= min ? v : 0), 0);
  return values.length ? sec / 60 / (values.length / 24) : 0;
}
const hm = m => (m = Math.round(m)) >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} min` : `${m} min`;

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

let place, data; // zuletzt geladener Ort und seine Wetterdaten, für Neuberechnung ohne Abruf

async function show(p) {
  $('hits').textContent = '';
  $('out').textContent = 'Lade Wetterdaten …';
  try { localStorage.setItem('ort', JSON.stringify(p)); } catch {}
  try {
    data = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&hourly=sunshine_duration&daily=daylight_duration&current=sunshine_duration&past_days=${DAYS}&forecast_days=1&timezone=auto`);
    place = p;
    render();
  } catch (err) { $('out').textContent = 'Fehler beim Laden: ' + err.message; }
}

function render() {
  if (!data) return;
  const p = place, min = minSec();
  const { time, sunshine_duration: sun } = data.hourly;
  const nowIdx = time.indexOf(data.current.time.slice(0, 13) + ':00');
  if (nowIdx < 0) { $('out').textContent = 'Fehler: aktuelle Stunde fehlt in den Daten.'; return; }
  const i = lastSun(sun, nowIdx, min);

  let html;
  if (i === nowIdx) html = `<div class="big">☀️ Gerade scheint die Sonne!</div>`;
  else if (i < 0) html = `<div class="big">über ${DAYS} Tage</div><p>In ${esc(label(p))} hat seit über ${DAYS} Tagen keine Sonne geschienen.</p>`;
  else html = `<div class="big">seit ${ago(t(data.current.time) - t(time[i]) - 36e5)}</div>
    <p>ohne Sonne in <b>${esc(label(p))}</b>.<br><span class="muted">Zuletzt Sonne: ${fmt(time[i])} Uhr (Ortszeit)</span></p>`;

  // Durchschnitt über die letzten BAR_DAYS × 24 Stunden bis jetzt
  const month = sun.slice(Math.max(0, nowIdx + 1 - BAR_DAYS * 24), nowIdx + 1);
  html += `<p>Ø Sonne pro Tag in den letzten ${BAR_DAYS} Tagen: <b>${hm(avgPerDay(month, min))}</b>
    <span class="muted">(nur Stunden ab ${min / 60} min Sonne) · ohne Schwelle ${hm(avgPerDay(month, 0))}</span>`;
  // Mögliche Sonne = Tageslicht von Sonnenauf- bis -untergang, Ø der letzten BAR_DAYS Tage bis heute
  const di = data.daily.time.indexOf(data.current.time.slice(0, 10));
  const light = data.daily.daylight_duration.slice(Math.max(0, di + 1 - BAR_DAYS), di + 1);
  const possible = light.reduce((s, v) => s + v, 0) / 60 / light.length;
  html += di < 0 ? '</p>' : `<br>Ø möglich (heller Tag, Sonnenauf- bis -untergang): <b>${hm(possible)}</b>
    <span class="muted">· davon schien die Sonne ${Math.round(avgPerDay(month, 0) / possible * 100)} %</span></p>`;

  // Grafik: letzte BAR_DAYS Tage, eine Zeile pro Tag, eine Zelle pro Stunde
  const from = Math.max(0, nowIdx - nowIdx % 24 - (BAR_DAYS - 1) * 24); // ab Mitternacht, Daten starten um 00:00
  const cells = sun.slice(from, nowIdx + 1).map((v, k) =>
    `<div class="${v >= min ? 's' : ''}" title="${fmt(time[from + k])}: ${Math.round(v / 60)} min"></div>`).join('');
  $('out').innerHTML = html + `<div class="muted">Letzte ${BAR_DAYS} Tage (eine Zeile pro Tag, 0–23 Uhr, gelb = Sonne):</div><div id="bar">${cells}</div>`;
}

$('min').oninput = () => {
  try { localStorage.setItem('min', $('min').value); } catch {}
  render();
};

try { const m = localStorage.getItem('min'); if (m) $('min').value = m; } catch {}
try { const p = JSON.parse(localStorage.getItem('ort')); if (p) { $('q').value = p.name; show(p); } } catch {}

// Self-Check
console.assert(lastSun([0, 700, 0], 2, 600) === 1, 'Sonne vor 1 h');
console.assert(lastSun([0, 0, 900], 2, 600) === 2, 'Sonne jetzt');
console.assert(lastSun([0, 0, 0], 2, 600) === -1, 'nie Sonne');
console.assert(lastSun([599, 0], 1, 600) === -1, 'unter Schwelle');
console.assert(lastSun([599, 0], 1, 60) === 0, 'niedrigere Schwelle');
console.assert(lastSun([700, 0, 800], 1, 600) === 0, 'Zukunft ignoriert');
console.assert(ago(30 * 36e5) === '1 Tag 6 Std.', 'ago');
console.assert(avgPerDay(Array(48).fill(0).fill(3600, 0, 2), 0) === 60, 'Ø ohne Schwelle');
console.assert(avgPerDay([600, 300, ...Array(22).fill(0)], 600) === 10, 'Ø mit Schwelle');
console.assert(hm(125) === '2 Std. 5 min' && hm(7) === '7 min', 'hm');
