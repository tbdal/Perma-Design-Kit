// Klima-Explorer in the planner's "Standortklima" box (#530): choose target year, scenario and model for the plan;
// course of a metric over all models, key figures, plants of the plan on a USDA zone ruler, scenario fan (IPCC).
// Pure string building — the page wires the controls (data-clim-*) and stores the choice with the plan.
import type { PlantData } from './types';
import { escapeHtml } from './html';
import {
  AR6, SSPS, LAST_DATA_YEAR, TARGET_YEARS, FUTURE_METRICS, modelLabel, modelDelta, modelKoeppen, scenarioModels, availableModels,
  futureOutlook, climateCheck, plantZoneRange, zoneLabel, type ClimateScenario, type FutureClimate, type FutureMetric, type SiteClimate,
  type ClimateStatus, type Ssp,
} from './site-climate';

type Lang = 'de' | 'en';
// Sources linked from the explanations (checked 2026-11: DOIs via Crossref, model pages in the WDCC/DKRZ CMIP6 catalogue)
const SRC = {
  ipcc: 'https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/', ssps: 'https://doi.org/10.1016/j.gloenvcha.2016.05.009',
  'SSP1-2.6': 'https://doi.org/10.1016/j.gloenvcha.2016.05.008', 'SSP2-4.5': 'https://doi.org/10.1016/j.gloenvcha.2016.06.004',
  'SSP3-7.0': 'https://doi.org/10.1016/j.gloenvcha.2016.06.009', 'SSP5-8.5': 'https://doi.org/10.1016/j.gloenvcha.2016.05.015',
  highresmip: 'https://doi.org/10.5194/gmd-9-4185-2016', openMeteo: 'https://open-meteo.com/en/docs/climate-api', kottek: 'https://doi.org/10.1127/0941-2948/2006/0130',
};
const MODEL_SRC: Record<string, string> = {
  'EC-Earth3P-HR': 'EC-Earth-Consortium', 'MPI-ESM1-2-XR': 'MPI-M', 'CMCC-CM2-VHR4': 'CMCC', 'MRI-AGCM3-2-S': 'MRI', 'HiRAM-SIT-HR': 'AS-RCEC', 'NICAM16-8S': 'MIROC', 'FGOALS-f3-H': 'CAS',
};
const modelUrl = (m: string) => `https://www.wdc-climate.de/ui/cmip6?input=CMIP6.HighResMIP.${MODEL_SRC[m]}.${m}`;
const T = {
  de: {
    year: 'Zieljahr', ssp: 'Szenario', sspHint: 'zählt ab {y}', model: 'Modell', metric: 'Merkmal',
    all: 'Alle: Median + Spanne', data: 'Modelldaten', proj: 'Hochrechnung {s}',
    metrics: { tann: 'Jahresmittel', minT: 'Tiefste Temperatur im Jahr', hot: 'Hitzetage ≥ 30 °C', frost: 'Frosttage', summerRain: 'Sommerregen Jun–Aug' },
    units: { tann: '°C', minT: '°C', hot: 'Tage', frost: 'Tage', summerRain: '%' },
    delta: 'Änderung {m} ({u}) gegenüber 1994–2023',
    valueAt: '{m} um {y}, {who}', median: 'Median der {n} Modelle', range: 'Spanne der {n} Modelle', rangeProj: 'Spanne der Modelle ({s})',
    zone: 'USDA-Winterhärtezone', koeppen: 'Köppen-Geiger-Klasse',
    ruler: 'Pflanzen im Zonenlineal', site: 'Standort', today: 'heute', unknownMax: 'obere Grenze unbekannt', noPlants: 'Keine Pflanze im Plan hat einen Zonenbereich.',
    status: { fit: 'klimafest', becomesPossible: 'wird möglich', underPressure: 'unter Druck', notHardy: 'nicht winterhart' } as Record<ClimateStatus, string>,
    warmN: 'zu warm {n}/{of}', drier: 'trockener', possibleN: 'wird möglich {n}/{of}',
    legend: {
      fit: 'klimafest: heute und im Zieljahr in allen gezeigten Modellen im Bereich',
      becomesPossible: 'wird möglich: heute zu kalt, im Zieljahr in einigen Modellen im Bereich',
      underPressure: 'unter Druck: in einigen Modellen wärmer als die obere Zone, oder Nässe-Pflanze bei weniger Sommerregen',
      notHardy: 'nicht winterhart, auch im Zieljahr',
    } as Record<ClimateStatus, string>,
    fan: 'Szenarien im Vergleich', fanNote: 'Globale Erwärmung gegenüber 1850–1900, Median und sehr wahrscheinlicher Bereich (5–95 %), IPCC AR6 WG1, Tabelle SPM.1. Über Land und in Mitteleuropa fällt die Erwärmung höher aus. Die Modelldaten folgen etwa SSP5-8.5 und enden 2050.',
    more: 'Mehr dazu', twin: 'Klimatische Zwillingsstädte (UBA)', dwd: 'Deutscher Klimaatlas (DWD)', geo: 'Verschiebung der Klimazonen (GeoSphere Austria)',
    info: 'Erklärung',
    infoZone: '**USDA-Winterhärtezone**: eingeteilt nach der tiefsten Temperatur, die im Mittel einmal im Winter erreicht wird, in Schritten von 5,6 K (a/b je halbe Zone), z. B.:\n- **6b**: etwa −20,6 bis −17,8 °C\n- **7b**: etwa −14,9 bis −12,2 °C\nPflanzenlisten geben einen Bereich an („5–9“):\n- **unter der unteren Zone** erfriert die Pflanze\n- **über der oberen Zone** fehlt oft der Kältereiz für Blüte und Frucht, seltener ist es Hitze\n**„Um <Jahr>“**: die Zone, die der Standort mit der Erwärmung der Klimamodelle bekommt – eine pro Modell.',
    infoModels: `Sieben Klimamodelle aus dem Projekt [CMIP6 HighResMIP](${SRC.highresmip}) (besonders feine Gitter), von [Open-Meteo](${SRC.openMeteo}) auf 10 km herunterskaliert und je Monat an gemessene Werte angeglichen. Alle rechnen mit hohen Emissionen bis 2050.\nGezeigt wird je Modell nur die Änderung gegenüber 1994–2023 im selben Modell, aufgeschlagen auf das gemessene Klima. **„Alle“**: Median der Modelle, die Fläche zeigt ihre Spanne.`,
    models: [['EC-Earth3P-HR', 'Europa (SMHI u. a.), 29 km, gekoppelt'], ['MPI-ESM1-2-XR', 'Deutschland (MPI-M Hamburg), 51 km, gekoppelt'], ['CMCC-CM2-VHR4', 'Italien (CMCC), 30 km, gekoppelt'], ['MRI-AGCM3-2-S', 'Japan (MRI), 20 km, Atmosphäre'], ['HiRAM-SIT-HR', 'Taiwan (AS-RCEC), 25 km, Atmosphäre + einfacher Ozean'], ['NICAM16-8S', 'Japan (JAMSTEC), 31 km, Atmosphäre'], ['FGOALS-f3-H', 'China (CAS), 28 km, Atmosphäre']],
    modelsNote: `**Gekoppelt**: das Modell rechnet Ozean und Meereis mit; **Atmosphäre**: künftige Meerestemperaturen sind vorgegeben.\nQuelle: [Open-Meteo Climate API](${SRC.openMeteo}) (CC BY 4.0). Die Modellnamen führen zu den Daten im CMIP6-Katalog des DKRZ.`,
    infoSsp: `Emissionsszenarien des Weltklimarats ([IPCC AR6](${SRC.ipcc}), [Überblick der SSP](${SRC.ssps})):\n- **[SSP1-2.6](${SRC['SSP1-2.6']})**: starker Klimaschutz\n- **[SSP2-4.5](${SRC['SSP2-4.5']})**: mittlerer Weg\n- **[SSP3-7.0](${SRC['SSP3-7.0']})**: Rivalität und hohe Emissionen\n- **[SSP5-8.5](${SRC['SSP5-8.5']})**: fossiler Ausbau\nBis {y} folgen die Modelldaten etwa SSP5-8.5; danach wird die Änderung der Modelle mit der globalen Erwärmung des gewählten Szenarios hochgerechnet (Tabelle SPM.1).\nFür Bäume, die 2080 noch tragen sollen, ist das der wichtigere Teil.`,
    infoMetric: 'Alle als 11-Jahres-Mittel um das Jahr:\n- **Jahresmittel**: Mittel der Tagesmitteltemperatur\n- **Tiefste Temperatur**: kältester Wert eines Jahres (Grundlage der Winterhärtezone)\n- **Hitzetage**: Tage mit mindestens 30 °C\n- **Frosttage**: Tage, an denen es unter 0 °C abkühlt\n- **Sommerregen**: Niederschlag Juni–August in Prozent gegenüber 1994–2023',
    infoMode: '- **Modelldaten**: Werte direkt aus den Klimamodellen (bis {y}, dem letzten Jahr mit vollem 11-Jahres-Fenster)\n- **Hochrechnung**: danach skaliert die Änderung um {y} mit der globalen Erwärmung des Szenarios\nDas ist grob: Hitze und Trockenheit steigen in Wirklichkeit eher stärker.',
    infoRange: '- **Median**: der mittlere Wert der Modelle (die Hälfte liegt darüber, die Hälfte darunter)\n- **Spanne**: kleinster bis größter Wert der Modelle; bei einer Hochrechnung zusätzlich der sehr wahrscheinliche Bereich (5–95 %) des Szenarios\nJe breiter die Spanne, desto unsicherer.',
    infoKoeppen: `Köppen-Geiger-Klasse ([Kottek u. a. 2006](${SRC.kottek})) aus Monatsmitteln von Temperatur und Niederschlag, berechnet aus den Modellen (Mehrheit).\n- **1. Buchstabe, Hauptklima**: A tropisch, B trocken, C gemäßigt, D kontinental (kalte Winter), E polar\n- **2. Buchstabe, Niederschlag**: f ganzjährig feucht, s trockene Sommer, w trockene Winter (bei B: W Wüste, S Steppe)\n- **3. Buchstabe, Sommer**: a heiß (wärmster Monat ≥ 22 °C), b warm, c kühl\nBeispiel: Cfb → Cfa heißt, aus warmen werden heiße Sommer.`,
    infoWarm: '- **„zu warm 3/7“**: in 3 von 7 Modellen liegt die Zone des Standorts im Zieljahr über der oberen Zone der Pflanze\n- **„wird möglich 2/7“**: heute zu kalt, im Zieljahr in 2 Modellen im Bereich\n**Reihenfolge**: heute zu kalte Pflanzen zuerst, dann nach Spielraum über der heutigen Standortzone (wenigster zuerst). Sie bleibt beim Wechsel von Jahr, Szenario und Modell gleich. Gleichnamige Pflanzen stehen in einer Zeile (×Anzahl).\nKlick auf eine Pflanze öffnet sie zum Bearbeiten.',
    note: 'Bis {y}: sieben Klimamodelle (CMIP6 HighResMIP, hoher Emissionspfad, Open-Meteo, CC BY 4.0), je Modell die Änderung gegenüber 1994–2023 als 11-Jahres-Mittel, auf das gemessene Klima aufgeschlagen. Danach grobe Hochrechnung: die Änderung um {y} wird mit der globalen Erwärmung des Szenarios skaliert (IPCC AR6). Eine Bandbreite, keine Prognose. Hinweise und Vorschläge des Plans nutzen diese Auswahl.',
  },
  en: {
    year: 'Target year', ssp: 'Scenario', sspHint: 'counts from {y}', model: 'Model', metric: 'Measure',
    all: 'All: median + range', data: 'model data', proj: 'projection {s}',
    metrics: { tann: 'Annual mean', minT: 'Lowest temperature of the year', hot: 'Hot days ≥ 30 °C', frost: 'Frost days', summerRain: 'Summer rain Jun–Aug' },
    units: { tann: '°C', minT: '°C', hot: 'days', frost: 'days', summerRain: '%' },
    delta: 'Change of {m} ({u}) against 1994–2023',
    valueAt: '{m} around {y}, {who}', median: 'median of {n} models', range: 'range of {n} models', rangeProj: 'range of the models ({s})',
    zone: 'USDA hardiness zone', koeppen: 'Köppen-Geiger class',
    ruler: 'Plants on the zone ruler', site: 'Site', today: 'today', unknownMax: 'upper limit unknown', noPlants: 'No plant in the plan has a zone range.',
    status: { fit: 'climate-proof', becomesPossible: 'becomes possible', underPressure: 'under pressure', notHardy: 'not hardy' } as Record<ClimateStatus, string>,
    warmN: 'too warm {n}/{of}', drier: 'drier', possibleN: 'becomes possible {n}/{of}',
    legend: {
      fit: 'climate-proof: within range today and in the target year in all models shown',
      becomesPossible: 'becomes possible: too cold today, within range in some models in the target year',
      underPressure: 'under pressure: warmer than the upper zone in some models, or a wet-soil plant with less summer rain',
      notHardy: 'not hardy, also in the target year',
    } as Record<ClimateStatus, string>,
    fan: 'Scenarios compared', fanNote: 'Global warming against 1850–1900, median and very likely range (5–95 %), IPCC AR6 WG1, table SPM.1. Warming over land and in Central Europe is higher. The model data follow roughly SSP5-8.5 and end in 2050.',
    more: 'More', twin: 'Climate twin cities (UBA)', dwd: 'German climate atlas (DWD)', geo: 'Shifting climate zones (GeoSphere Austria)',
    info: 'Explanation',
    infoZone: '**USDA hardiness zone**: by the lowest temperature reached once a winter on average, in steps of 5.6 K (a/b half zones), e.g.:\n- **6b**: about −20.6 to −17.8 °C\n- **7b**: about −14.9 to −12.2 °C\nPlant lists give a range (“5–9”):\n- **below the lowest zone** the plant freezes\n- **above the highest zone** it often lacks the winter chill for flowers and fruit, more rarely it is heat\n**“Around <year>”**: the zone the site gets with each climate model’s warming – one per model.',
    infoModels: `Seven climate models of the [CMIP6 HighResMIP](${SRC.highresmip}) project (very fine grids), downscaled by [Open-Meteo](${SRC.openMeteo}) to 10 km and adjusted to measured values per month. All follow high emissions up to 2050.\nShown is each model’s change against 1994–2023 in the same model, added to the measured climate. **“All”**: median of the models, the band shows their range.`,
    models: [['EC-Earth3P-HR', 'Europe (SMHI et al.), 29 km, coupled'], ['MPI-ESM1-2-XR', 'Germany (MPI-M Hamburg), 51 km, coupled'], ['CMCC-CM2-VHR4', 'Italy (CMCC), 30 km, coupled'], ['MRI-AGCM3-2-S', 'Japan (MRI), 20 km, atmosphere'], ['HiRAM-SIT-HR', 'Taiwan (AS-RCEC), 25 km, atmosphere + simple ocean'], ['NICAM16-8S', 'Japan (JAMSTEC), 31 km, atmosphere'], ['FGOALS-f3-H', 'China (CAS), 28 km, atmosphere']],
    modelsNote: `**Coupled**: the model computes ocean and sea ice too; **atmosphere**: future sea temperatures are given.\nSource: [Open-Meteo Climate API](${SRC.openMeteo}) (CC BY 4.0). The model names link to the data in the DKRZ CMIP6 catalogue.`,
    infoSsp: `Emission scenarios of the IPCC ([AR6](${SRC.ipcc}), [overview of the SSPs](${SRC.ssps})):\n- **[SSP1-2.6](${SRC['SSP1-2.6']})**: strong climate protection\n- **[SSP2-4.5](${SRC['SSP2-4.5']})**: middle of the road\n- **[SSP3-7.0](${SRC['SSP3-7.0']})**: rivalry and high emissions\n- **[SSP5-8.5](${SRC['SSP5-8.5']})**: fossil growth\nUp to {y} the model data follow roughly SSP5-8.5; after that the models’ change is scaled with the chosen scenario’s global warming (table SPM.1).\nFor trees that should still bear in 2080 that is the more important part.`,
    infoMetric: 'All as 11-year means around the year:\n- **Annual mean**: mean of the daily mean temperature\n- **Lowest temperature**: the coldest value of a year (basis of the hardiness zone)\n- **Hot days**: days with at least 30 °C\n- **Frost days**: days that cool below 0 °C\n- **Summer rain**: rain June–August in percent against 1994–2023',
    infoMode: '- **Model data**: values straight from the climate models (up to {y}, the last year with a full 11-year window)\n- **Projection**: after that the change around {y} is scaled with the scenario’s global warming\nThat is rough: heat and drought tend to rise faster in reality.',
    infoRange: '- **Median**: the middle value of the models (half above, half below)\n- **Range**: lowest to highest model; for a projection also the scenario’s very likely range (5–95 %)\nThe wider the range, the less certain.',
    infoKoeppen: `Köppen-Geiger class ([Kottek et al. 2006](${SRC.kottek})) from monthly temperature and rain, computed from the models (majority).\n- **1st letter, main climate**: A tropical, B dry, C temperate, D continental (cold winters), E polar\n- **2nd letter, rain**: f wet all year, s dry summers, w dry winters (for B: W desert, S steppe)\n- **3rd letter, summer**: a hot (warmest month ≥ 22 °C), b warm, c cool\nExample: Cfb → Cfa means warm summers become hot.`,
    infoWarm: '- **“too warm 3/7”**: in 3 of 7 models the site’s zone in the target year is above the plant’s highest zone\n- **“becomes possible 2/7”**: too cold today, within range in 2 models in the target year\n**Order**: plants too cold today first, then by the zones left above today’s site zone (fewest first). It stays the same when year, scenario or model change. Plants with the same name share one row (×count).\nA click on a plant opens it for editing.',
    note: 'Up to {y}: seven climate models (CMIP6 HighResMIP, high emission path, Open-Meteo, CC BY 4.0), per model the change against 1994–2023 as an 11-year mean, added to the measured climate. After that a rough projection: the change around {y} scaled with the scenario’s global warming (IPCC AR6). A range, not a forecast. The plan’s hints and suggestions use this choice.',
  },
};
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/** An "i" that opens a short explanation (native popover, #603); `html` is already escaped markup. */
export function infoHtml(key: string, html: string, label: string): string {
  return `<button type="button" popovertarget="clim-i-${key}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle text-[10px] font-semibold italic text-stone-500 ring-1 ring-stone-300 hover:bg-stone-200 hover:text-stone-800 dark:text-stone-400 dark:ring-stone-600 dark:hover:bg-stone-700">i</button>`
    + `<div id="clim-i-${key}" popover class="m-auto max-w-md rounded-lg bg-white p-4 text-sm leading-relaxed text-stone-700 shadow-xl ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:ring-stone-700 space-y-2">${html}</div>`;
}
/** Explanation text → markup: each line a paragraph, "- " lines a bullet list, **bold**, [text](https://…). */
export function richText(s: string): string {
  const inline = (t: string) => escapeHtml(t)
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a class="underline" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  let h = '', li = '';
  const flush = () => { if (li) h += `<ul class="list-disc space-y-0.5 pl-5">${li}</ul>`; li = ''; };
  for (const line of s.split('\n')) {
    if (line.startsWith('- ')) li += `<li>${inline(line.slice(2))}</li>`;
    else { flush(); if (line.trim()) h += `<p>${inline(line)}</p>`; }
  }
  flush();
  return h;
}
/** The explanations as markup, by key (the page uses 'zone' beside "Zone um <Jahr>"). */
export function infoText(key: 'zone' | 'models' | 'ssp' | 'metric' | 'mode' | 'range' | 'koeppen' | 'warm', lang: Lang): string {
  const L = T[lang];
  if (key === 'models') return richText([L.infoModels, ...L.models.map(([n, d]) => `- **[${n}](${modelUrl(n)})**: ${d}`), L.modelsNote].join('\n'));
  const txt = { zone: L.infoZone, ssp: L.infoSsp, metric: L.infoMetric, mode: L.infoMode, range: L.infoRange, koeppen: L.infoKoeppen, warm: L.infoWarm }[key];
  return richText(fill(txt, { y: LAST_DATA_YEAR }));
}
const info = (key: Parameters<typeof infoText>[0], lang: Lang) => infoHtml(key, infoText(key, lang), T[lang].info);

export const STATUS_COLOR: Record<ClimateStatus, string> = { fit: '#16a34a', becomesPossible: '#3b82f6', underPressure: '#d97706', notHardy: '#dc2626' };
const ACCENT = '#16a34a', WARM = '#ea580c', COLD = '#3b82f6';
const SSP_COLOR: Record<Ssp, string> = { 'SSP1-2.6': '#3b82f6', 'SSP2-4.5': '#16a34a', 'SSP3-7.0': '#d97706', 'SSP5-8.5': '#dc2626' };
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mode = (a: string[]) => { const c = new Map<string, number>(); a.forEach(v => c.set(v, (c.get(v) ?? 0) + 1)); return [...c].sort((x, y) => y[1] - x[1])[0]?.[0] ?? ''; };
function niceStep(raw: number) { const p = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / p; return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * p; }
const SVG = (w: number, h: number, label: string, body: string, fs = 9) =>
  `<svg viewBox="0 0 ${w} ${h}" class="block h-auto w-full" font-size="${fs}" fill="currentColor" role="img" aria-label="${escapeHtml(label)}">${body}</svg>`;
/** Drawing sizes: the sidebar box, or the zoomer (#602: twice as wide, text a bit larger, so it reads like the page). */
const SIZE = { narrow: { W: 340, H: 190, fs: 9, rh: 18, fanH: 150 }, wide: { W: 680, H: 280, fs: 11, rh: 22, fanH: 190 } };
type Size = typeof SIZE.narrow;

/** The controls; drawn once per panel render so the year slider keeps working while it is dragged. */
export function explorerControlsHtml(f: FutureClimate, s: ClimateScenario, metric: FutureMetric, lang: Lang): string {
  const L = T[lang];
  const sel = 'min-w-0 flex-1 rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-1.5 py-0.5 text-xs';
  const lbl = 'w-20 shrink-0 text-stone-500 dark:text-stone-400';
  return `<div class="space-y-1.5">
    <div class="flex items-center gap-2"><label for="clim-year" class="${lbl}">${escapeHtml(L.year)}</label>
      <input id="clim-year" data-clim-year type="range" min="${TARGET_YEARS[0]}" max="${TARGET_YEARS[1]}" step="1" value="${s.year}" class="min-w-0 flex-1 accent-green-700" />
      <output for="clim-year" data-clim-year-out class="w-9 text-right text-sm font-semibold tabular-nums">${s.year}</output></div>
    <div class="flex items-center gap-2"><span class="${lbl} inline-flex items-center gap-1">${escapeHtml(L.ssp)} ${info('ssp', lang)}</span><span class="flex flex-wrap gap-1" role="group" aria-label="${escapeHtml(L.ssp)}">${SSPS.map(x =>
      `<button type="button" data-clim-ssp="${x}" aria-pressed="${s.ssp === x}" class="rounded-full px-1.5 py-0.5 text-[10px] ring-1 ring-stone-300 dark:ring-stone-600 aria-pressed:bg-green-700 aria-pressed:text-white aria-pressed:ring-green-700">${x.replace('SSP', '')}</button>`).join('')}</span></div>
    <p class="flex items-center gap-1 pl-[5.5rem] text-[10px]"><span data-clim-mode></span>${info('mode', lang)}</p>
    <div class="flex items-center gap-2"><span class="${lbl} inline-flex items-center gap-1"><label for="clim-model">${escapeHtml(L.model)}</label> ${info('models', lang)}</span><select id="clim-model" data-clim-model class="${sel}">
      <option value="all"${s.model === 'all' ? ' selected' : ''}>${escapeHtml(L.all)}</option>${availableModels(f).map(m => `<option value="${m}"${s.model === m ? ' selected' : ''}>${escapeHtml(modelLabel(m))}</option>`).join('')}</select></div>
    <div class="flex items-center gap-2"><span class="${lbl} inline-flex items-center gap-1"><label for="clim-metric">${escapeHtml(L.metric)}</label> ${info('metric', lang)}</span><select id="clim-metric" data-clim-metric class="${sel}">
      ${FUTURE_METRICS.map(m => `<option value="${m}"${metric === m ? ' selected' : ''}>${escapeHtml(L.metrics[m])}</option>`).join('')}</select></div>
  </div>`;
}

export interface RulerPlant extends Pick<PlantData, 'id' | 'climateZone' | 'waterDry' | 'waterMid' | 'waterWet'> { name: string }

/** Everything that follows the choice: mode label, course chart, key figures, zone ruler, scenario fan, links, note. */
export function explorerOutHtml(c: SiteClimate, f: FutureClimate, s: ClimateScenario, metric: FutureMetric, lang: Lang, plants: RulerPlant[], wide = false): { mode: string; html: string } {
  const L = T[lang];
  const Z = wide ? SIZE.wide : SIZE.narrow, k = Z.fs / 9;
  const nf = (v: number, d: number, sign = true) => new Intl.NumberFormat(lang, { maximumFractionDigits: d, minimumFractionDigits: d, ...(sign ? { signDisplay: 'exceptZero' as const } : {}) }).format(v);
  const projected = s.year > LAST_DATA_YEAR;
  const all = availableModels(f), ms = scenarioModels(f, s), one = ms.length === 1 && s.model !== 'all' ? ms[0] : null;
  const d = metric === 'hot' || metric === 'frost' || metric === 'summerRain' ? 0 : 1;
  const unit = L.units[metric];
  const at = (m: string, y: number, k: 0 | 1 | 2 = 0) => modelDelta(f, m, metric, y, s.ssp, k);
  const targets = ms.map(m => at(m, s.year)).filter((v): v is number => v != null);
  const main = targets.length ? (one ? targets[0] : median(targets)) : 0;

  // ── course ──
  const { W, H } = Z, Lx = 30 * k, R = 6, Ty = 14 * k, B = 18 * k, x0 = 1999, x1 = 2100;
  const X = (y: number) => Lx + (y - x0) / (x1 - x0) * (W - Lx - R);
  const years: number[] = []; for (let y = x0; y <= LAST_DATA_YEAR; y++) years.push(y);
  const series = new Map(all.map(m => [m, years.map(y => at(m, y) ?? 0)]));
  const projYears: number[] = []; for (let y = LAST_DATA_YEAR; y <= x1; y += 5) projYears.push(y);
  const band = projYears.map(y => { const v = ms.flatMap(m => [at(m, y, 1) ?? 0, at(m, y, 2) ?? 0]); return [y, Math.min(...v), Math.max(...v)]; });
  const vals = [...[...series.values()].flat(), ...band.flatMap(b => [b[1], b[2]]), 0];
  let lo = Math.min(...vals), hi = Math.max(...vals); const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const Y = (v: number) => Ty + (hi - v) / (hi - lo) * (H - Ty - B);
  const step = niceStep((hi - lo) / 4);
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  let g = '';
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) g += `<line x1="${Lx}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity="${Math.abs(v) < 1e-9 ? 0.4 : 0.12}"/><text x="${Lx - 4}" y="${Y(v) + 3}" text-anchor="end" fill-opacity=".6">${nf(v, step < 1 ? 1 : 0)}</text>`;
  for (let y = 2000; y <= 2100; y += 25) g += `<text x="${X(y)}" y="${H - 5}" text-anchor="${y === 2100 ? 'end' : y === 2000 ? 'start' : 'middle'}" fill-opacity=".6">${y}</text>`;
  g += `<rect x="${X(LAST_DATA_YEAR)}" y="${Ty}" width="${X(x1) - X(LAST_DATA_YEAR)}" height="${H - Ty - B}" fill="${WARM}" fill-opacity=".06"/>`;
  const mins = years.map((_, i) => Math.min(...ms.map(m => series.get(m)![i]))), maxs = years.map((_, i) => Math.max(...ms.map(m => series.get(m)![i])));
  if (ms.length > 1) g += `<polygon points="${pts(years.map((y, i) => [y, maxs[i]]))} ${pts(years.map((y, i) => [y, mins[i]] as [number, number]).reverse())}" fill="${ACCENT}" fill-opacity=".15"/>`;
  g += `<polygon points="${pts(band.map(b => [b[0], b[2]]))} ${pts(band.map(b => [b[0], b[1]] as [number, number]).reverse())}" fill="${WARM}" fill-opacity=".16"/>`;
  for (const m of all) g += `<polyline points="${pts(years.map((y, i) => [y, series.get(m)![i]]))}" fill="none" stroke="currentColor" stroke-opacity="${one ? 0.2 : 0.3}" stroke-width=".7"><title>${escapeHtml(modelLabel(m))}</title></polyline>`;
  const line = years.map((y, i) => [y, one ? series.get(one)![i] : median(ms.map(m => series.get(m)![i]))] as [number, number]);
  g += `<polyline points="${pts(line)}" fill="none" stroke="${ACCENT}" stroke-width="2"/>`;
  const projLine = projYears.map(y => [y, one ? at(one, y) ?? 0 : median(ms.map(m => at(m, y) ?? 0))] as [number, number]);
  g += `<polyline points="${pts(projLine)}" fill="none" stroke="${WARM}" stroke-width="1.8" stroke-dasharray="4 3"/>`;
  const now = new Date().getFullYear();
  g += `<line data-clim-today x1="${X(now)}" x2="${X(now)}" y1="${Ty}" y2="${H - B}" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="3 3"/><text x="${X(now) - 3}" y="${Ty + 9 * k}" text-anchor="end" fill-opacity=".6">${escapeHtml(L.today)}</text>`;
  g += `<line x1="${X(s.year)}" x2="${X(s.year)}" y1="${Ty}" y2="${H - B}" stroke="currentColor" stroke-opacity=".7" stroke-width="1.5"/><circle cx="${X(s.year)}" cy="${Y(main)}" r="3.5" fill="currentColor"/>`;
  // value at the (draggable) target-year line: median or the one model, range of the models
  const val = `${s.year}: ${nf(main, d)} ${unit}${targets.length > 1 ? ` (${nf(Math.min(...targets), d)} … ${nf(Math.max(...targets), d)})` : ''}`;
  const right = X(s.year) < (Lx + W) / 2, tw = val.length * Z.fs * 0.55, tx = right ? X(s.year) + 6 : X(s.year) - 6 - tw;
  const ty = Math.max(Ty + Z.fs + 2, Y(main) - 6);
  g += `<g data-clim-value><rect x="${tx - 2}" y="${ty - Z.fs}" width="${tw + 4}" height="${Z.fs + 4}" rx="2" class="fill-white dark:fill-stone-900" fill-opacity=".85"/><text x="${tx}" y="${ty}" font-weight="600">${escapeHtml(val)}</text></g>`;
  g += `<text x="${Lx}" y="${Ty - 4}" fill-opacity=".7">${escapeHtml(fill(L.delta, { m: L.metrics[metric], u: unit }))}</text>`;
  // data-clim-course: the page lets the target-year line be dragged (viewBox x of 1999 and 2100, width)
  const chart = SVG(W, H, fill(L.delta, { m: L.metrics[metric], u: unit }), g, Z.fs)
    .replace('<svg ', `<svg data-clim-course="${X(x0)},${X(x1)},${x0},${x1},${W}" style="cursor:ew-resize;touch-action:pan-y" `);

  // ── key figures ──
  const o = futureOutlook(c, f, s);
  const zt = o.zones;
  const kp = ms.map(m => modelKoeppen(f, m, s)).filter((v): v is [string, string] => !!v);
  const kr = mode(kp.map(k => k[0])), kt = mode(kp.map(k => k[1]));
  const who = one ? modelLabel(one) : fill(L.median, { n: ms.length });
  const stat = (b: string, t: string, i = '') => `<div class="rounded-md bg-white/70 dark:bg-stone-800/60 p-1.5 ring-1 ring-stone-200 dark:ring-stone-700"><b class="block text-sm tabular-nums">${b}</b><span class="inline-flex items-start gap-1 text-[10px] leading-tight text-stone-500 dark:text-stone-400"><span>${t}</span>${i}</span></div>`;
  const zoneTxt = zt.length ? `${zoneLabel(c.zone)} → ${zoneLabel(zt[0])}${zt[zt.length - 1] !== zt[0] ? '–' + zoneLabel(zt[zt.length - 1]) : ''}` : '—';
  const stats = `<div class="grid ${wide ? 'grid-cols-4' : 'grid-cols-2'} gap-1.5">${[
    stat(`${nf(main, d)} ${escapeHtml(unit)}`, escapeHtml(fill(L.valueAt, { m: L.metrics[metric], y: s.year, who }))),
    stat(targets.length > 1 ? `${nf(Math.min(...targets), d)} … ${nf(Math.max(...targets), d)}` : '—', escapeHtml(projected ? fill(L.rangeProj, { s: s.ssp }) : fill(L.range, { n: ms.length })), info('range', lang)),
    stat(zoneTxt, escapeHtml(L.zone), info('zone', lang)),
    stat(kr ? `${kr} → ${kt}` : '—', escapeHtml(L.koeppen), info('koeppen', lang)),
  ].join('')}</div>`;

  return {
    mode: projected ? fill(L.proj, { s: s.ssp }) : L.data,
    html: `${chart}${stats}${rulerHtml(c, o, plants, lang, Z)}
      <details class="text-[10px]"${wide ? ' open' : ''}><summary class="cursor-pointer font-semibold text-stone-600 dark:text-stone-300">${escapeHtml(L.fan)}</summary>${fanSvg(s.ssp, Z)}<p class="text-stone-500 dark:text-stone-400">${escapeHtml(L.fanNote)}</p></details>
      <p class="text-[10px] text-stone-500 dark:text-stone-400">${escapeHtml(L.more)}: <a class="underline" href="https://kunden.dwd.de/klimaatlas/" target="_blank" rel="noopener">${escapeHtml(L.dwd)}</a> · <a class="underline" href="https://klimaportal.geosphere.at/informationsportal-klimawandel/klimazonen.html" target="_blank" rel="noopener">${escapeHtml(L.geo)}</a> · <a class="underline" href="https://www.umweltbundesamt.de/klimatische-zwillingsstaedte-in-europa" target="_blank" rel="noopener">${escapeHtml(L.twin)}</a></p>
      <p class="text-[10px] text-stone-500 dark:text-stone-400">${escapeHtml(fill(L.note, { y: LAST_DATA_YEAR }))}</p>`,
  };
}

const ORDER: Record<ClimateStatus, number> = { underPressure: 0, notHardy: 1, becomesPossible: 2, fit: 3 };

/** Site today (blue) and per model in the target year (orange), each plant's zone range coloured by its status. */
function rulerHtml(c: SiteClimate, o: ReturnType<typeof futureOutlook>, plants: RulerPlant[], lang: Lang, Z: Size): string {
  const L = T[lang];
  // Fixed order, independent of year/scenario/model, so a plant keeps its place: too cold today first (the colder the higher),
  // then by zones left above today's site zone (fewest first), no upper limit last.
  const site = Math.floor(c.zone);
  const risk = ({ r, ck }: { r: [number, number]; ck: { maxZone: number | null } }) => site < r[0] ? site - r[0] : (ck.maxZone ?? 99) - site;
  const rows = plants.map(p => ({ p, r: plantZoneRange(p.climateZone), ck: climateCheck(p, c, o) }))
    .filter((x): x is { p: RulerPlant; r: [number, number]; ck: NonNullable<ReturnType<typeof climateCheck>> } => !!x.r && !!x.ck)
    .sort((a, b) => risk(a) - risk(b) || a.p.name.localeCompare(b.p.name, lang));
  // same name (e.g. several walnut entries) → one row with a count, the most critical one stands for the group
  const groups = new Map<string, (typeof rows)[number] & { n: number }>();
  for (const x of rows) { const g = groups.get(x.p.name); if (g) g.n++; else groups.set(x.p.name, { ...x, n: 1 }); }
  const shown = [...groups.values()];
  const k = Z.fs / 9, W = Z.W, z0 = 2, z1 = 11, xa = 104 * k, xb = W - 72 * k, X = (z: number) => xa + (z - z0) / (z1 - z0) * (xb - xa);
  const top = 50 * k, rh = Z.rh, H = top + Math.max(shown.length, 1) * rh + 4;
  const zs = o.zones, tMin = zs[0] ?? c.zone, tMax = (zs[zs.length - 1] ?? c.zone) + 0.5;
  let g = `<defs><linearGradient id="clim-fade" x1="0" x2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="clim-fm" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#clim-fade)"/></mask></defs>`;
  for (let z = z0; z <= z1; z++) g += `<text x="${X(z)}" y="${9 * k}" text-anchor="middle" fill-opacity=".6">${z}</text><line x1="${X(z)}" x2="${X(z)}" y1="${13 * k}" y2="${H}" stroke="currentColor" stroke-opacity=".1"/>`;
  g += `<rect x="${X(tMin)}" y="${20 * k}" width="${X(tMax) - X(tMin)}" height="${H - 20 * k}" fill="${WARM}" fill-opacity=".1"/>`;
  g += `<line x1="${X(c.zone + 0.25)}" x2="${X(c.zone + 0.25)}" y1="${20 * k}" y2="${H}" stroke="${COLD}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  g += `<text x="0" y="${33 * k}" font-weight="600" font-size="${Z.fs + 1}">${escapeHtml(L.site)}</text><text x="${xa - 6}" y="${33 * k}" text-anchor="end" fill-opacity=".6">${escapeHtml(zoneLabel(c.zone))} → ${escapeHtml(zoneLabel(tMin))}${tMax - 0.5 > tMin ? '–' + escapeHtml(zoneLabel(tMax - 0.5)) : ''}</text>`;
  g += `<circle cx="${X(c.zone + 0.25)}" cy="${30 * k}" r="${4.5 * k}" fill="${COLD}"><title>${escapeHtml(L.today)}: ${zoneLabel(c.zone)}</title></circle>`;
  const byZone = new Map<number, number>();
  for (const z of zs) {
    const i = byZone.get(z) ?? 0; byZone.set(z, i + 1);
    g += `<circle cx="${X(z + 0.25) + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 6 * k}" cy="${30 * k}" r="${3 * k}" fill="${WARM}" stroke="#fff" stroke-width=".7"><title>${zoneLabel(z)} (${o.scenario.year})</title></circle>`;
  }
  g += `<line x1="0" x2="${W}" y1="${top - 8}" y2="${top - 8}" stroke="currentColor" stroke-opacity=".15"/>`;
  shown.forEach(({ p, r, ck, n }, i) => {
    const y = top + i * rh, col = STATUS_COLOR[ck.status], cnt = n > 1 ? ` ×${n}` : '', max = 20 - cnt.length;
    const name = (p.name.length > max ? p.name.slice(0, max - 1) + '…' : p.name) + cnt;
    // a click opens the plant for editing (#603)
    g += `<g data-plant-id="${escapeHtml(p.id)}" tabindex="0" role="button" aria-label="${escapeHtml(p.name)}" style="cursor:pointer"><rect x="0" y="${y - 3 * k}" width="${W}" height="${rh}" fill="transparent"/><text x="0" y="${y + 8 * k}" font-size="${Z.fs + 1}"><title>${escapeHtml(p.name)}</title>${escapeHtml(name)}</text><text x="${xa - 6}" y="${y + 8 * k}" text-anchor="end" fill-opacity=".6">${r[0]}–${ck.maxZone ?? '?'}</text>`;
    const x1 = X(r[0]), x2 = ck.maxZone != null ? X(ck.maxZone + 1) : X(z1);
    g += `<rect x="${x1}" y="${y}" width="${Math.max(2, x2 - x1)}" height="${9 * k}" rx="2" fill="${col}" fill-opacity=".6"${ck.maxZone == null ? ' mask="url(#clim-fm)"' : ''}><title>${escapeHtml(ck.maxZone == null ? L.unknownMax : `${r[0]}–${ck.maxZone}`)}</title></rect>`;
    const label = ck.status === 'underPressure' ? (ck.tooWarm ? fill(L.warmN, { n: ck.tooWarm, of: ck.models }) : L.drier)
      : ck.status === 'becomesPossible' && ck.models > 1 ? fill(L.possibleN, { n: ck.fits, of: ck.models }) : L.status[ck.status];
    g += `<text x="${xb + 6}" y="${y + 8 * k}" fill="${col}" font-weight="600">${escapeHtml(label)}</text></g>`;
  });
  if (!shown.length) g += `<text x="0" y="${top + 8}" fill-opacity=".6">${escapeHtml(L.noPlants)}</text>`;
  const legend = (Object.keys(ORDER) as ClimateStatus[]).sort((a, b) => ORDER[b] - ORDER[a])
    .map(k => `<span class="inline-flex items-start gap-1"><i class="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full" style="background:${STATUS_COLOR[k]}"></i>${escapeHtml(L.legend[k])}</span>`).join('');
  return `<p class="flex items-center gap-1 pt-1 text-xs font-semibold">${escapeHtml(L.ruler)} ${info('warm', lang)}</p>${SVG(W, H, L.ruler, g, Z.fs)}
    <div class="grid gap-0.5 text-[10px] text-stone-500 dark:text-stone-400">${legend}</div>`;
}

/** IPCC AR6: global warming per scenario and period, the plan's scenario highlighted. */
function fanSvg(active: Ssp, Z: Size): string {
  const k = Z.fs / 9, W = Z.W, H = Z.fanH, Lx = 26 * k, Ty = 8 * k, B = 20 * k, groups = ['2021–40', '2041–60', '2081–2100'];
  const Y = (v: number) => Ty + (6 - v) / 6 * (H - Ty - B), gw = (W - Lx - 4) / 3;
  let g = '';
  for (let v = 0; v <= 6; v += 1) g += `<line x1="${Lx}" x2="${W - 4}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${Lx - 3}" y="${Y(v) + 3}" text-anchor="end" fill-opacity=".6">${v}°</text>`;
  g += `<line x1="${Lx}" x2="${W - 4}" y1="${Y(1.5)}" y2="${Y(1.5)}" stroke="currentColor" stroke-dasharray="2 2" stroke-opacity=".6"/>`;
  groups.forEach((lab, gi) => {
    const gx = Lx + gi * gw;
    g += `<text x="${gx + gw / 2}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
    SSPS.forEach((s, i) => {
      const [m, a, b] = AR6[s][gi], x = gx + gw * (0.2 + i * 0.2), on = s === active;
      g += `<line x1="${x}" x2="${x}" y1="${Y(a)}" y2="${Y(b)}" stroke="${SSP_COLOR[s]}" stroke-width="${on ? 7 : 5}" stroke-linecap="round" stroke-opacity="${on ? 0.6 : 0.3}"/><circle cx="${x}" cy="${Y(m)}" r="${on ? 4 : 3}" fill="${SSP_COLOR[s]}"><title>${s}: ${m} °C (${a}–${b})</title></circle>`;
    });
  });
  const leg = SSPS.map((s, i) => `<g transform="translate(${Lx + i * 78 * k},${Ty + 4})"><circle r="3" cx="3" cy="-3" fill="${SSP_COLOR[s]}"/><text x="9" y="0" font-weight="${s === active ? 700 : 400}">${s}</text></g>`).join('');
  return SVG(W, H, 'IPCC AR6', g + leg, Z.fs);
}

/** Short status text for a dot or tooltip ("klimafest um 2050", "zu warm 3/7 um 2050"). */
export function statusTitle(ck: NonNullable<ReturnType<typeof climateCheck>>, year: number, lang: Lang): string {
  const L = T[lang];
  const s = ck.status === 'underPressure' ? (ck.tooWarm ? fill(L.warmN, { n: ck.tooWarm, of: ck.models }) : L.drier)
    : ck.status === 'becomesPossible' && ck.models > 1 ? fill(L.possibleN, { n: ck.fits, of: ck.models }) : L.status[ck.status];
  return `${s} ${lang === 'en' ? 'around' : 'um'} ${year}`;
}
