import { parseCSV } from './csv';

// Variety (cultivar) lists for the "Sorte" picker in the plant editor.
// A list is a plain set of names per species, imported once and kept in
// IndexedDB (db.ts → 'varietyLists'): the built-in source is Wikidata (CC0,
// fruit cultivar classes + rank "cultivar"), further lists come from CSV
// files the user is allowed to use. Plants keep storing the chosen name in
// `varietyName` only — the lists are a picking aid, never a reference.

export interface VarietyEntry {
  name: string;
  /** speciesKey() of the species the variety belongs to, e.g. "malus domestica". */
  species: string;
  synonyms?: string[];
  wikidataId?: string;
}

export type VarietyListSource = 'wikidata' | 'csv';

export interface VarietyList {
  id: string;
  name: string;
  source: VarietyListSource;
  /** Licence / origin note shown in the settings, e.g. "Wikidata, CC0". */
  license: string;
  importedAt: string;   // ISO
  enabled: boolean;
  entries: VarietyEntry[];
}

export const WIKIDATA_LIST_ID = 'wikidata-fruit';

// Spellings that mean the same species for variety purposes.
const SPECIES_ALIASES: Record<string, string> = {
  'malus pumila': 'malus domestica',
  'malus x domestica': 'malus domestica',
  'malus sylvestris var. domestica': 'malus domestica',
  'pyrus domestica': 'pyrus communis',
  'prunus insititia': 'prunus domestica',
  'prunus italica': 'prunus domestica',
  'prunus cerasifera var. domestica': 'prunus domestica',
  'cerasus avium': 'prunus avium',
  'cerasus vulgaris': 'prunus cerasus',
  'armeniaca vulgaris': 'prunus armeniaca',
  'persica vulgaris': 'prunus persica',
};

/** Species part of a latin name, lower case, for matching plants to variety
 *  entries: cultivar epithets ('Boskoop'), ranks and further epithets are
 *  dropped ("Prunus domestica subsp. insititia" → "prunus domestica"), × → x. */
export function speciesKey(latin: string): string {
  const clean = latin
    .replace(/['‘’"„“].*$/, '')     // cultivar part in quotes
    .replace(/[×✕]/g, ' x ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const full = SPECIES_ALIASES[clean];
  if (full) return full;
  const w = clean.split(' ');
  const key = w[1] === 'x' ? w.slice(0, 3).join(' ') : w.slice(0, 2).join(' ');
  return SPECIES_ALIASES[key] ?? key;
}

/** "Pyrus communis ‘Conference’" → { species: "Pyrus communis", cultivar: "Conference" }. */
export function splitCultivarName(taxonName: string): { species: string; cultivar: string } | null {
  const m = /^(.+?)\s*['‘’"„“]\s*(.+?)\s*['‘’"“]\s*$/.exec(taxonName.trim());
  return m ? { species: m[1].trim(), cultivar: m[2].trim() } : null;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Removes duplicates (same species + name, case-insensitive), merging synonyms. */
export function dedupeEntries(entries: VarietyEntry[]): VarietyEntry[] {
  const byKey = new Map<string, VarietyEntry>();
  for (const e of entries) {
    const name = e.name.trim();
    if (!name || !e.species) continue;
    const k = `${e.species}|${norm(name)}`;
    const hit = byKey.get(k);
    if (!hit) { byKey.set(k, { ...e, name }); continue; }
    const syn = new Set([...(hit.synonyms ?? []), ...(e.synonyms ?? [])]);
    if (syn.size) hit.synonyms = [...syn];
    hit.wikidataId ??= e.wikidataId;
  }
  return [...byKey.values()].sort((a, b) => a.species.localeCompare(b.species) || a.name.localeCompare(b.name, 'de'));
}

// ── CSV ──────────────────────────────────────────────────────────────────

const COL_SPECIES = ['art', 'lateinisch', 'lateinischer name', 'species', 'latin', 'latinname', 'botanischer name', 'obstart'];
const COL_NAME = ['sorte', 'sortenname', 'sortenbezeichnung', 'variety', 'cultivar', 'name'];
const COL_SYN = ['synonyme', 'synonym', 'synonyms', 'weitere sortenbezeichnung', 'ggf. weitere sortenbezeichnung'];

/** Common German fruit names → species, for lists that only say "Apfel". */
const FRUIT_WORDS: Record<string, string> = {
  apfel: 'malus domestica', birne: 'pyrus communis', quitte: 'cydonia oblonga',
  pflaume: 'prunus domestica', zwetschge: 'prunus domestica', zwetsche: 'prunus domestica', mirabelle: 'prunus domestica', reneklode: 'prunus domestica',
  süßkirsche: 'prunus avium', suesskirsche: 'prunus avium', sauerkirsche: 'prunus cerasus',
  aprikose: 'prunus armeniaca', marille: 'prunus armeniaca', pfirsich: 'prunus persica', nektarine: 'prunus persica',
  apple: 'malus domestica', pear: 'pyrus communis', plum: 'prunus domestica', cherry: 'prunus avium', apricot: 'prunus armeniaca', peach: 'prunus persica',
};

function speciesFromCell(v: string): string {
  const s = v.trim();
  if (!s) return '';
  return FRUIT_WORDS[s.toLowerCase()] ?? speciesKey(s);
}

export const VARIETY_CSV_TEMPLATE = 'Art;Sorte;Synonyme\nMalus domestica;Boskoop;Schöner aus Boskoop, Belle de Boskoop\nPyrus communis;Conference;\nApfel;Topaz;\n';

/** Parses a variety CSV (columns Art/Sorte/Synonyme, see VARIETY_CSV_TEMPLATE;
 *  ";" or "," separated). Throws with a readable message on a missing column. */
export function parseVarietyCsv(text: string): VarietyEntry[] {
  const rows = parseCSV(text);
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  const find = (names: string[]) => headers.find(h => names.includes(h.trim().toLowerCase()));
  const hSpecies = find(COL_SPECIES), hName = find(COL_NAME), hSyn = find(COL_SYN);
  if (!hSpecies || !hName) throw new Error(`Spalten „Art“ und „Sorte“ nicht gefunden (vorhanden: ${headers.join(', ')})`);
  return dedupeEntries(rows.map(r => ({
    name: (r[hName] ?? '').trim(),
    species: speciesFromCell(r[hSpecies] ?? ''),
    ...(hSyn && r[hSyn]?.trim() ? { synonyms: r[hSyn].split(/[;,|]/).map(s => s.trim()).filter(Boolean) } : {}),
  })));
}

export function varietyListToCsv(list: VarietyList): string {
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return 'Art;Sorte;Synonyme\n' + list.entries.map(e => [e.species, e.name, (e.synonyms ?? []).join(', ')].map(q).join(';')).join('\n') + '\n';
}

// ── Wikidata ─────────────────────────────────────────────────────────────

/** Wikidata classes of fruit cultivars ("Apfelsorte" …) per species. */
export const WIKIDATA_CULTIVAR_CLASSES: Record<string, string> = {
  Q15731356: 'malus domestica',   // Apfelsorte
  Q3029797: 'malus domestica',    // Apfelwein-Apfel
  Q969986: 'malus domestica',     // Calville
  Q20898395: 'pyrus communis',    // Birnensorte
  Q115606891: 'prunus domestica', // Pflaumensorte
  Q49621791: 'prunus avium',      // Süßkirschensorte
  Q49661826: 'prunus cerasus',    // Sauerkirschsorte
  Q133455038: 'prunus armeniaca', // Aprikosensorte
  Q134454354: 'prunus persica',   // Pfirsichsorte
  Q139565694: 'ribes uva-crispa', // Stachelbeersorte
  Q135678255: 'actinidia arguta', // Kiwibeeren-Sorte
  Q135781333: 'cornus mas',       // Kornelkirsche
  Q117101722: 'vaccinium corymbosum', // Heidelbeersorte
};

/** Species whose cultivars are also found by rank "cultivar" + parent taxon. */
export const WIKIDATA_SPECIES = [
  'Malus domestica', 'Pyrus communis', 'Cydonia oblonga', 'Mespilus germanica',
  'Prunus domestica', 'Prunus avium', 'Prunus cerasus', 'Prunus armeniaca', 'Prunus persica',
  'Ribes uva-crispa', 'Ribes nigrum', 'Ribes rubrum', 'Corylus avellana', 'Juglans regia', 'Castanea sativa',
  'Sambucus nigra', 'Aronia melanocarpa', 'Actinidia arguta', 'Cornus mas', 'Vaccinium corymbosum',
];

const SPARQL_URL = 'https://query.wikidata.org/sparql';

function sparqlFor(keys: string[] | null): string {
  const classes = Object.entries(WIKIDATA_CULTIVAR_CLASSES).filter(([, k]) => !keys || keys.includes(k));
  const species = WIKIDATA_SPECIES.filter(n => !keys || keys.includes(speciesKey(n)));
  // A plant outside the built-in table: still search rank "cultivar" under it.
  const extra = keys ? keys.filter(k => !species.some(n => speciesKey(n) === k)) : [];
  const names = [...species.map(n => [n, speciesKey(n)]), ...extra.map(k => [k[0].toUpperCase() + k.slice(1), k])];
  const parts: string[] = [];
  if (classes.length) parts.push(`{ VALUES (?cls ?key0) { ${classes.map(([q, k]) => `(wd:${q} "${k}")`).join(' ')} } ?c wdt:P31 ?cls . }`);
  if (names.length) parts.push(`{ VALUES (?n ?key0) { ${names.map(([n, k]) => `("${n.replace(/"/g, '')}" "${k}")`).join(' ')} } ?sp wdt:P225 ?n . ?c wdt:P171 ?sp ; wdt:P105 wd:Q4886 . }`);
  return `SELECT ?c (SAMPLE(?key0) AS ?key) (SAMPLE(?de0) AS ?de) (SAMPLE(?en0) AS ?en) (SAMPLE(?any0) AS ?any) (SAMPLE(?tx0) AS ?tx) WHERE {
  ${parts.join(' UNION ')}
  OPTIONAL { ?c rdfs:label ?de0 FILTER(LANG(?de0) = "de") }
  OPTIONAL { ?c rdfs:label ?en0 FILTER(LANG(?en0) = "en") }
  OPTIONAL { ?c rdfs:label ?any0 }
  OPTIONAL { ?c wdt:P225 ?tx0 }
} GROUP BY ?c`;
}

interface SparqlRow { c: { value: string }; key?: { value: string }; de?: { value: string }; en?: { value: string }; any?: { value: string }; tx?: { value: string }; }

/** Wikidata rows → entries. Name: German label, else English, else the
 *  cultivar epithet of the taxon name, else any label; labels that are the
 *  whole taxon name ("Malus domestica 'Toki'") are reduced to the epithet. */
export function entriesFromSparql(rows: SparqlRow[]): VarietyEntry[] {
  const out: VarietyEntry[] = [];
  for (const r of rows) {
    const species = r.key?.value;
    if (!species) continue;
    const epithet = r.tx?.value ? splitCultivarName(r.tx.value)?.cultivar : undefined;
    const pick = (s?: string) => (s ? (splitCultivarName(s)?.cultivar ?? s) : '');
    const name = pick(r.de?.value) || pick(r.en?.value) || epithet || pick(r.any?.value);
    if (!name || /^Q\d+$/.test(name)) continue;
    const syn = [pick(r.en?.value), epithet].filter((s): s is string => !!s && s !== name);
    out.push({ name, species, wikidataId: r.c.value.replace(/^.*\//, ''), ...(syn.length ? { synonyms: [...new Set(syn)] } : {}) });
  }
  return dedupeEntries(out);
}

/** Cultivars from Wikidata — all known fruit species (`keys` = null) or only
 *  the given speciesKey()s. */
export async function fetchWikidataVarieties(keys: string[] | null, signal?: AbortSignal): Promise<VarietyEntry[]> {
  const res = await fetch(SPARQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
    body: new URLSearchParams({ query: sparqlFor(keys) }),
    signal,
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const data = await res.json();
  return entriesFromSparql(data.results?.bindings ?? []);
}

// ── Recognising cultivars among Wikidata search hits ────────────────────

/** True for a Wikidata entity that is a cultivar rather than a species: rank
 *  "cultivar" (Q4886), one of the fruit cultivar classes, or a taxon name with
 *  a quoted cultivar epithet. */
export function isCultivarEntity(entity: any): boolean {
  const ids = (p: string): string[] => (entity?.claims?.[p] ?? []).map((s: any) => s?.mainsnak?.datavalue?.value?.id).filter(Boolean);
  if (ids('P105').includes('Q4886')) return true;
  if (ids('P31').some(id => id in WIKIDATA_CULTIVAR_CLASSES)) return true;
  const taxon: string = entity?.claims?.P225?.[0]?.mainsnak?.datavalue?.value ?? '';
  return !!splitCultivarName(taxon);
}

/** Species latin name + cultivar name of a cultivar entity, when derivable
 *  without further requests (taxon name in quotes, or a known class). */
export function cultivarOf(entity: any): { species: string; name: string } | null {
  const taxon: string = entity?.claims?.P225?.[0]?.mainsnak?.datavalue?.value ?? '';
  const label: string = entity?.labels?.de?.value ?? entity?.labels?.en?.value ?? '';
  const split = splitCultivarName(taxon);
  if (split) return { species: split.species, name: label && !splitCultivarName(label) ? label : split.cultivar };
  const cls = (entity?.claims?.P31 ?? []).map((s: any) => s?.mainsnak?.datavalue?.value?.id).find((id: string) => id in WIKIDATA_CULTIVAR_CLASSES);
  if (cls && label) {
    const key = WIKIDATA_CULTIVAR_CLASSES[cls];
    return { species: key[0].toUpperCase() + key.slice(1), name: label };
  }
  return null;
}

// ── Picker candidates ────────────────────────────────────────────────────

export interface VarietyOption { name: string; group: string; synonyms?: string[]; wikidataId?: string; }

/** Options for one plant: own names first (varieties used on other plants of
 *  the same species), then each enabled list; one entry per name. */
export function varietyOptions(latinName: string, lists: VarietyList[], ownNames: string[], ownLabel: string): VarietyOption[] {
  const key = speciesKey(latinName);
  const seen = new Set<string>();
  const out: VarietyOption[] = [];
  for (const n of ownNames) {
    const k = norm(n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ name: n.trim(), group: ownLabel });
  }
  for (const l of lists) {
    if (!l.enabled) continue;
    for (const e of l.entries) {
      if (e.species !== key || seen.has(norm(e.name))) continue;
      seen.add(norm(e.name));
      out.push({ name: e.name, group: l.name, synonyms: e.synonyms, wikidataId: e.wikidataId });
    }
  }
  return out;
}

/** Filters options by a query (name or synonym, case-insensitive), prefix hits first. */
export function filterVarietyOptions(opts: VarietyOption[], query: string): VarietyOption[] {
  const q = norm(query);
  if (!q) return opts;
  const hits = opts.filter(o => norm(o.name).includes(q) || o.synonyms?.some(s => norm(s).includes(q)));
  return hits.sort((a, b) => Number(!norm(a.name).startsWith(q)) - Number(!norm(b.name).startsWith(q)));
}
