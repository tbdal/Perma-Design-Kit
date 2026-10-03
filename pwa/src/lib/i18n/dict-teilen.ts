import type { Dict } from './core';

export const teilenDict: Dict = {
  shTitle: { de: 'Geteiltes Projekt', en: 'Shared project' },
  shLoading: { de: 'Link wird gelesen…', en: 'Reading link…' },
  shNoLink: { de: 'Diese Seite öffnet Projekt-Links, die jemand über „Projekt als Link teilen“ (Einstellungen) erstellt hat. In dieser Adresse steckt kein Projekt.', en: 'This page opens project links created via “Share project as link” (settings). This address contains no project.' },
  shBroken: { de: 'Der Link ist unvollständig oder beschädigt – vielleicht wurde er beim Versenden gekürzt. Bitte lass ihn dir noch einmal schicken, am besten per E-Mail.', en: 'The link is incomplete or damaged – maybe it was cut off when sent. Please ask for it again, ideally by e-mail.' },
  shSummary: { de: '{plants} Pflanzen · {polycultures} Polykulturen · {plans} Gartenpläne', en: '{plants} plants · {polycultures} polycultures · {plans} garden plans' },
  shPlants: { de: 'Pflanzen', en: 'Plants' },
  shPolycultures: { de: 'Polykulturen', en: 'Polycultures' },
  shGardenPlans: { de: 'Gartenpläne', en: 'Garden plans' },
  shMore: { de: '+ {n} weitere', en: '+ {n} more' },
  shPrivacy: { de: 'Die Daten werden nur in deinem Browser gespeichert, wie alles in dieser App. Pflanzen, die du schon hast (gleicher lateinischer Name und Sorte), werden nicht doppelt angelegt – deine eigenen Einträge bleiben unverändert.', en: 'The data is stored only in your browser, like everything in this app. Plants you already have (same Latin name and variety) are not added twice – your own entries stay unchanged.' },
  shImport: { de: 'In meine App übernehmen', en: 'Add to my app' },
  shCancel: { de: 'Abbrechen', en: 'Cancel' },
  shDone: { de: 'Übernommen: {plants} neue Pflanzen ({reused} schon vorhanden), {polycultures} Polykulturen, {plans} Gartenpläne.', en: 'Added: {plants} new plants ({reused} already present), {polycultures} polycultures, {plans} garden plans.' },
  shToPlants: { de: 'Zu den Pflanzen', en: 'Go to plants' },
  shToPlans: { de: 'Zu den Gartenplänen', en: 'Go to garden plans' },
  shFailed: { de: 'Übernehmen fehlgeschlagen: {msg}', en: 'Import failed: {msg}' },
};
