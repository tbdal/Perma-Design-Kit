import { addEs, type Dict } from './core';
import { es as esTexts } from './es/search';

// Plant search (hero on the plant page and on the garden plan page), see lib/plant-search-ui.ts.
export const searchDict: Dict = {
  heroTitle: { de: 'Agroforst und Waldgärten fachlich planen', en: 'Plan agroforestry and forest gardens professionally' },
  heroSubtitle: { de: 'Pflanzen nach Funktion und Standort wählen, Fläche zeichnen, in 3D prüfen, als PDF weitergeben.', en: 'Choose plants by function and site, draw the area, check it in 3D, hand it on as PDF.' },
  searchSubtitle: { de: 'Pflanzendatenbank durchsuchen', en: 'Search the plant database' },
  searchPlaceholder: { de: 'Pflanze suchen, z. B. Holunder', en: 'Search for a plant, e.g. elder' },
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

addEs(searchDict, esTexts);
