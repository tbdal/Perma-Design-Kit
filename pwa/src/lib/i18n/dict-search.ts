import type { Dict } from './core';

// Plant search (hero on the plant page and on the garden plan page), see lib/plant-search-ui.ts.
export const searchDict: Dict = {
  heroTitle: { de: 'Was wächst in deinem Waldgarten?', en: 'What grows in your forest garden?' },
  searchSubtitle: { de: 'Pflanzendatenbank durchsuchen', en: 'Search the plant database' },
  searchPlaceholder: { de: 'Pflanze suchen — lat. oder dt. Name, z.B. Sambucus nigra', en: 'Search for a plant — Latin or English name, e.g. Sambucus nigra' },
  searchBtn: { de: 'Suchen', en: 'Search' },
  searchLoading: { de: 'Suche…', en: 'Searching…' },
  searchNoResults: { de: 'Keine Ergebnisse.', en: 'No results.' },
  searchResultsCount: { de: '{count} Treffer', en: '{count} results' },
  searchError: { de: 'Fehler: {error}', en: 'Error: {error}' },
  searchAlreadyAdded: { de: 'Bereits in deiner Liste (gleicher lateinischer Name)', en: 'Already in your list (same Latin name)' },
  searchAddAnyway: { de: 'Trotzdem hinzufügen', en: 'Add anyway' },
  searchAddAnywayConfirm: { de: '„{name}" ist bereits in deiner Liste (gleicher lateinischer Name). Trotzdem als weitere Pflanze hinzufügen?', en: '“{name}” is already in your list (same Latin name). Add it again as a separate plant anyway?' },
  searchAddResult: { de: '+ Hinzuf.', en: '+ Add' },
  searchAdding: { de: 'Wird hinzugefügt…', en: 'Adding…' },
  searchAdded: { de: '✓ Hinzugefügt', en: '✓ Added' },
  searchAddFailed: { de: 'Fehler', en: 'Error' },
  searchVarietyOf: { de: 'Sorte von', en: 'Variety of' },
  searchAddVariety: { de: '+ Mit Sorte', en: '+ With variety' },
  searchLoadingSources: { de: 'Lade Daten…', en: 'Loading data…' },
  searchHeroPlan: { de: 'Pflanze für deinen Waldgarten finden', en: 'Find a plant for your forest garden' },
  searchAddedArmed: { de: '„{name}“ ist in deiner Sammlung – zum Setzen in die Karte klicken.', en: '“{name}” is in your collection – click the map to place it.' },
};
