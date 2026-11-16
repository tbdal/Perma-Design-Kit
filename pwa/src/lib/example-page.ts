import { escapeHtml } from './html';
import { getLang } from './i18n/core';
import { EXAMPLE_FILE, exampleData } from './example-project';

// /example and /beispiel: the example project plus the two public Vorbilder
// (Dartington, Garden Cottage). Their share data is public/vorbilder/<key>.txt, a copy of
// src/expert/vorbilder/data/<key>.txt (test/vorbilder.test.ts in the private repo fails on drift);
// the other Vorbilder stay in the private module.

type L = 'de' | 'en';
interface Link { title: string; url: string }
interface Card { key: string; kind: Record<L, string>; title: string; place: Record<L, string>; facts: Record<L, string>; learn: Record<L, string>; info: Link[] }

export const PUBLIC_VORBILDER: Card[] = [
  {
    key: 'dartington', title: 'Agroforestry Research Trust – Forest Garden',
    kind: { de: 'Waldgarten', en: 'Forest garden' },
    place: { de: 'Dartington, Devon (UK) · seit 1994 · ca. 0,9 ha · leicht geneigt (≈ 8 m)', en: 'Dartington, Devon (UK) · since 1994 · approx. 0.9 ha · gentle slope (≈ 8 m)' },
    facts: { de: 'Martin Crawfords Waldgarten hinter dem Old Postern, der bekannteste im gemäßigten Klima: über 30 Jahre Erfahrung, Bücher, Kurse, Führungen.', en: 'Martin Crawford’s forest garden behind the Old Postern, the best-known in a temperate climate: 30+ years of experience, books, courses, tours.' },
    learn: { de: 'Windschutz zuerst, Stickstoffbinder zwischen Obst, lichte Kronen mit Lichtungen, dauerhafte Bodendecker.', en: 'Windbreak first, nitrogen fixers among the fruit, open canopy with glades, permanent ground cover.' },
    info: [
      { title: 'Agroforestry Research Trust', url: 'https://www.agroforestry.co.uk/' },
      { title: 'Wikipedia: Agroforestry Research Trust', url: 'https://en.wikipedia.org/wiki/Agroforestry_Research_Trust' },
      { title: 'Devon Gardens Trust: Forest Garden, Dartington', url: 'https://devongardenstrust.org.uk/node/382' },
    ],
  },
  {
    key: 'gardencottage', title: 'Garden Cottage (Graham Bell)',
    kind: { de: 'Waldgarten · Hausgarten', en: 'Forest garden · home garden' },
    place: { de: 'Coldstream, Scottish Borders (UK) · seit 1990 · ca. 800 m² · eben', en: 'Coldstream, Scottish Borders (UK) · since 1990 · approx. 800 m² · flat' },
    facts: { de: 'Graham Bells Hausgarten, einer der ältesten absichtlich angelegten Waldgärten Großbritanniens: rund 800 m², nach eigenen Angaben bis 1,25 t Nahrung im Jahr, dazu Kurse und Pflanzenvermehrung.', en: 'Graham Bell’s home garden, one of the oldest intentionally planted forest gardens in Britain: about 800 m², by his own account up to 1.25 t of food a year, plus courses and plant propagation.' },
    learn: { de: 'Was auf kleinster Fläche im kühlen Klima geht: Schichten dicht gepackt, Windschutz am Rand, wenig Pflege.', en: 'What is possible on a very small plot in a cool climate: layers packed densely, windbreak at the edge, little upkeep.' },
    info: [
      { title: 'permies.com: The Permaculture Garden – Graham Bell', url: 'https://permies.com/wiki/157281/permaculture/Permaculture-Garden-Graham-Bell' },
      { title: 'RSPB: Glasgow to Globe – nature solutions for our food', url: 'https://community.rspb.org.uk/ourwork/b/glasgow/posts/glasgow-to-globe-nature-solutions-for-our-food' },
    ],
  },
];

const T = {
  de: {
    title: 'Beispiele', intro: 'Das Beispielprojekt und zwei Vorbilder: Waldgärten mit langer Erfahrung, als Waldgartenpläne nachgebaut. Ein Klick öffnet sie im Planer.',
    example: 'Beispielprojekt', exampleText: 'Ein kleines Projekt zum Ausprobieren: Pflanzen, Plan, 3D und Sonne.',
    open: 'Im Waldgartenplan öffnen', learn: 'Lernen', sources: 'Quellen', failed: 'Der Plan konnte nicht geladen werden.',
    attribution: 'Umriss © OpenStreetMap-Mitwirkende (ODbL 1.0), Höhen aus den Terrain Tiles (AWS Open Data), Pflanzendaten PFAF (CC BY 4.0) und Edible Forest Gardens. Die Pläne sind Nachbauten zum Lernen, keine Vermessung; Bepflanzung schematisch nach veröffentlichten Beschreibungen.',
  },
  en: {
    title: 'Examples', intro: 'The example project and two role models: forest gardens with long experience, rebuilt as forest garden plans. One click opens them in the planner.',
    example: 'Example project', exampleText: 'A small project to try out: plants, plan, 3D and sun.',
    open: 'Open in the planner', learn: 'Learn', sources: 'Sources', failed: 'The plan could not be loaded.',
    attribution: 'Outline © OpenStreetMap contributors (ODbL 1.0), heights from Terrain Tiles (AWS Open Data), plant data PFAF (CC BY 4.0) and Edible Forest Gardens. The plans are rebuilds for learning, not surveys; planting is schematic after published descriptions.',
  },
};

const btn = 'rounded-md bg-green-700 px-3 py-1 text-sm font-semibold text-white hover:bg-green-800';
const box = 'rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 space-y-2';

/** Draws the page into `root` and wires the open buttons. */
export async function mountExamplePage(root: HTMLElement): Promise<void> {
  const lang: L = getLang() === 'de' ? 'de' : 'en';
  const L = T[lang];
  document.title = `Perma Design Kit — ${L.title}`;
  let exampleHref = '';
  try {
    const res = await fetch(EXAMPLE_FILE, { cache: 'no-cache' });
    const data = res.ok ? exampleData(await res.text()) : null;
    if (data) exampleHref = `/teilen/?beispiel=1#d=${data}`;
  } catch { /* no example project: only the Vorbilder */ }
  const link = (s: Link) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="underline">${escapeHtml(s.title)}</a></li>`;
  root.innerHTML = `
    <h1 class="text-2xl font-bold">${escapeHtml(L.title)}</h1>
    <p class="text-sm text-stone-600 dark:text-stone-300">${escapeHtml(L.intro)}</p>
    <p id="ex-status" role="status" class="text-sm text-red-700"></p>
    ${exampleHref ? `<article class="${box}"><h2 class="text-lg font-semibold">${escapeHtml(L.example)}</h2><p class="text-sm">${escapeHtml(L.exampleText)}</p>
      <a id="ex-open" href="${escapeHtml(exampleHref)}" class="${btn} inline-block">${escapeHtml(L.open)}</a></article>` : ''}
    ${PUBLIC_VORBILDER.map(v => `<article class="${box}" data-vorbild="${v.key}">
      <p class="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-400">${escapeHtml(v.kind[lang])}</p>
      <h2 class="text-lg font-semibold">${escapeHtml(v.title)}</h2>
      <p class="text-sm text-stone-500 dark:text-stone-400">${escapeHtml(v.place[lang])}</p>
      <p class="text-sm">${escapeHtml(v.facts[lang])}</p>
      <p class="text-sm"><span class="font-medium">${escapeHtml(L.learn)}:</span> ${escapeHtml(v.learn[lang])}</p>
      <details class="text-xs"><summary class="cursor-pointer font-medium text-green-700 dark:text-green-400">${escapeHtml(L.sources)}</summary><ul class="list-disc space-y-0.5 pl-4 pt-1">${v.info.map(link).join('')}</ul></details>
      <button type="button" class="${btn}" data-open="${v.key}">${escapeHtml(L.open)}</button>
    </article>`).join('')}
    <p class="text-xs text-stone-500 dark:text-stone-400">${escapeHtml(L.attribution)}</p>`;
  root.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-open]');
    if (!b) return;
    try {
      const res = await fetch(`/vorbilder/${b.dataset.open}.txt`);
      const data = res.ok ? (await res.text()).trim() : '';
      if (!/^[A-Za-z0-9_-]+$/.test(data)) throw new Error('bad data');
      location.href = `/teilen/#d=${data}`;
    } catch { root.querySelector('#ex-status')!.textContent = L.failed; }
  });
}
