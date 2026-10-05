// Stores the example project behind permadesignkit.org/example (and /beispiel).
//   npm run example:set -- "https://permadesignkit.org/teilen/#d=…"
// Create the link in the app: Einstellungen → Daten → "Projekt als Link
// teilen" with "Ansicht der Pläne mitschicken" and the plan that should open.
// The link is decoded first, so a cut-off or broken link is refused; then it
// is written to public/example-project.txt. Commit and deploy afterwards.
import { writeFileSync } from 'node:fs';

const arg = (process.argv[2] ?? '').trim();
const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(arg) ?? (/^[A-Za-z0-9_-]{20,}$/.test(arg) ? [null, arg] : null);
if (!m) {
  console.error('Aufruf: npm run example:set -- "<Link aus „Projekt als Link teilen“>"');
  process.exit(1);
}
const data = m[1];
const b64 = data.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((data.length + 3) % 4);
let json;
try {
  const stream = new Blob([Buffer.from(b64, 'base64')]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  json = JSON.parse(await new Response(stream).text());
} catch (e) {
  console.error(`Der Link lässt sich nicht lesen (abgeschnitten oder beschädigt?): ${e.message}`);
  process.exit(1);
}
const plans = json.gardenPlans ?? [];
const start = plans.find(p => p.id === json.start?.planId);
console.log(`Pflanzen: ${json.plants?.length ?? 0} · Polykulturen: ${json.polycultures?.length ?? 0} · Waldgartenpläne: ${plans.length}`);
console.log(`Ansichten: ${Object.keys(json.views ?? {}).length} · Startplan: ${start ? start.name || start.id : '–'}`);
console.log(`Standort in den Plänen: ${plans.filter(p => p.geo).length} von ${plans.length}`);
writeFileSync(new URL('../public/example-project.txt', import.meta.url), `${data}\n`);
console.log(`Gespeichert in public/example-project.txt (${(data.length / 1024).toFixed(1)} KB). Jetzt committen und deployen.`);
