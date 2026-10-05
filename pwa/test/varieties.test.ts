import { describe, expect, it } from 'vitest';
import {
  speciesKey, splitCultivarName, parseVarietyCsv, dedupeEntries, entriesFromSparql, isCultivarEntity, cultivarOf,
  varietyOptions, filterVarietyOptions, varietyListToCsv, type VarietyList,
} from '../src/lib/varieties';

describe('speciesKey', () => {
  it('reduces a latin name to the species', () => {
    expect(speciesKey('Malus domestica')).toBe('malus domestica');
    expect(speciesKey("Malus domestica 'Boskoop'")).toBe('malus domestica');
    expect(speciesKey('Prunus domestica subsp. insititia')).toBe('prunus domestica');
    expect(speciesKey('Prunus domestica insititia')).toBe('prunus domestica');
    expect(speciesKey('Prunus persica var. nucipersica')).toBe('prunus persica');
  });
  it('keeps hybrids and maps known synonyms', () => {
    expect(speciesKey('Ribes × nidigrolaria')).toBe('ribes x nidigrolaria');
    expect(speciesKey('Malus pumila')).toBe('malus domestica');
    expect(speciesKey('Malus × domestica')).toBe('malus domestica');
    expect(speciesKey('Prunus insititia')).toBe('prunus domestica');
  });
});

describe('splitCultivarName', () => {
  it('splits taxon name and quoted cultivar', () => {
    expect(splitCultivarName('Pyrus communis ‘Conference’')).toEqual({ species: 'Pyrus communis', cultivar: 'Conference' });
    expect(splitCultivarName("Malus domestica 'Gravenstein'")).toEqual({ species: 'Malus domestica', cultivar: 'Gravenstein' });
    expect(splitCultivarName('Pyrus communis')).toBeNull();
  });
});

describe('parseVarietyCsv', () => {
  it('reads Art/Sorte/Synonyme with ; and German fruit words', () => {
    const e = parseVarietyCsv('Art;Sorte;Synonyme\nMalus domestica;Boskoop;Schöner aus Boskoop, Belle de Boskoop\nApfel;Topaz;\nBirne;Conference;\nApfel;boskoop;\n');
    expect(e).toHaveLength(3);
    const bos = e.find(x => x.name === 'Boskoop')!;
    expect(bos.species).toBe('malus domestica');
    expect(bos.synonyms).toEqual(['Schöner aus Boskoop', 'Belle de Boskoop']);
    expect(e.find(x => x.name === 'Conference')!.species).toBe('pyrus communis');
  });
  it('accepts English headers and commas', () => {
    expect(parseVarietyCsv('species,variety\nPrunus avium,Kordia\n')).toEqual([{ name: 'Kordia', species: 'prunus avium' }]);
  });
  it('explains a missing column', () => {
    expect(() => parseVarietyCsv('Foo;Bar\n1;2\n')).toThrow(/Art/);
  });
  it('round-trips through the CSV export', () => {
    const list: VarietyList = { id: 'x', name: 'L', source: 'csv', license: '', importedAt: '', enabled: true,
      entries: [{ name: 'Rote; Sternrenette', species: 'malus domestica', synonyms: ['Sternapi'] }] };
    expect(parseVarietyCsv(varietyListToCsv(list))).toEqual(list.entries);
  });
});

describe('dedupeEntries', () => {
  it('merges same species + name, case-insensitive', () => {
    const d = dedupeEntries([{ name: 'Elstar', species: 'malus domestica', synonyms: ['a'] }, { name: 'elstar ', species: 'malus domestica', synonyms: ['b'], wikidataId: 'Q1' }]);
    expect(d).toEqual([{ name: 'Elstar', species: 'malus domestica', synonyms: ['a', 'b'], wikidataId: 'Q1' }]);
  });
});

describe('entriesFromSparql', () => {
  const row = (q: string, key: string, o: Record<string, string>) => ({
    c: { value: `http://www.wikidata.org/entity/${q}` }, key: { value: key },
    ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }])),
  });
  it('prefers the German label, then English, then the cultivar epithet', () => {
    const e = entriesFromSparql([
      row('Q1', 'pyrus communis', { de: 'Williams Christ', en: 'Williams pear', tx: "Pyrus communis 'Williams Bon Chrétien'" }),
      row('Q2', 'malus domestica', { en: 'Estiva' }),
      row('Q3', 'malus domestica', { de: "Malus domestica 'Toki'", tx: "Malus domestica 'Toki'" }),
      row('Q4', 'malus domestica', { any: 'Q4' }),
    ]);
    expect(e.map(x => x.name)).toEqual(['Estiva', 'Toki', 'Williams Christ']);
    expect(e.find(x => x.name === 'Williams Christ')!.synonyms).toEqual(['Williams pear', 'Williams Bon Chrétien']);
    expect(e.find(x => x.name === 'Estiva')!.wikidataId).toBe('Q2');
  });
});

describe('cultivar detection in Wikidata hits', () => {
  const claim = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } });
  const conference = {
    labels: { de: { value: 'Conference' } },
    claims: { P105: [claim('Q4886')], P31: [claim('Q20898395')], P225: [{ mainsnak: { datavalue: { value: 'Pyrus communis ‘Conference’' } } }] },
  };
  const elstar = { labels: { de: { value: 'Elstar' } }, claims: { P31: [claim('Q15731356')] } };
  const pear = { labels: { de: { value: 'Birne' } }, claims: { P105: [claim('Q7432')], P225: [{ mainsnak: { datavalue: { value: 'Pyrus communis' } } }] } };
  it('flags cultivars, not species', () => {
    expect(isCultivarEntity(conference)).toBe(true);
    expect(isCultivarEntity(elstar)).toBe(true);
    expect(isCultivarEntity(pear)).toBe(false);
  });
  it('derives species and name', () => {
    expect(cultivarOf(conference)).toEqual({ species: 'Pyrus communis', name: 'Conference' });
    expect(cultivarOf(elstar)).toEqual({ species: 'Malus domestica', name: 'Elstar' });
    expect(cultivarOf(pear)).toBeNull();
  });
});

describe('varietyOptions', () => {
  const lists: VarietyList[] = [
    { id: 'a', name: 'Wikidata', source: 'wikidata', license: '', importedAt: '', enabled: true, entries: [
      { name: 'Boskoop', species: 'malus domestica' }, { name: 'Elstar', species: 'malus domestica', synonyms: ['Elshof'] }, { name: 'Conference', species: 'pyrus communis' }] },
    { id: 'b', name: 'Aus', source: 'csv', license: '', importedAt: '', enabled: false, entries: [{ name: 'Topaz', species: 'malus domestica' }] },
  ];
  it('lists own names first, then enabled lists for the species, without duplicates', () => {
    const o = varietyOptions("Malus domestica 'X'", lists, ['Gelber Bellefleur', 'boskoop'], 'Eigene');
    expect(o.map(x => `${x.group}:${x.name}`)).toEqual(['Eigene:Gelber Bellefleur', 'Eigene:boskoop', 'Wikidata:Elstar']);
  });
  it('filters by name and synonym, prefix hits first', () => {
    const o = varietyOptions('Malus domestica', lists, [], 'Eigene');
    expect(filterVarietyOptions(o, 'els').map(x => x.name)).toEqual(['Elstar']);
    expect(filterVarietyOptions(o, 'hof').map(x => x.name)).toEqual(['Elstar']);
    expect(filterVarietyOptions([{ name: 'Roter Boskoop', group: '' }, { name: 'Boskoop', group: '' }], 'bos').map(x => x.name)).toEqual(['Boskoop', 'Roter Boskoop']);
  });
});
