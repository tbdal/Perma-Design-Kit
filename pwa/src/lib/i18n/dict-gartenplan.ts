import type { Dict } from './core';

export const gartenplanDict: Dict = {
  // ── List view ──────────────────────────────────────────────────────────
  pageTitle: { de: 'Gartenplan', en: 'Garden plan' },
  btnNewPlan: { de: '+ Neuer Gartenplan', en: '+ New garden plan' },
  introText: { de: 'Zeichne eine Fläche, platziere Pflanzen darauf und sieh mit dem Schieberegler, wie groß sie nach x Jahren ungefähr werden.', en: 'Draw an area, place plants on it, and use the slider to see roughly how large they’ll be after x years.' },
  emptyStateText: { de: 'Noch keine Gartenpläne angelegt.', en: 'No garden plans created yet.' },
  btnEmptyNew: { de: 'Ersten Gartenplan anlegen', en: 'Create your first garden plan' },
  planUnnamed: { de: 'Unbenannter Gartenplan', en: 'Unnamed garden plan' },
  linkedPolycultureLabel: { de: 'Polykultur:', en: 'Polyculture:' },
  placementCount: { de: '{count} Pflanze(n) platziert', en: '{count} plant(s) placed' },
  areaSizeLabel: { de: '{w}×{h} m', en: '{w}×{h} m' },

  // ── Editor shared ─────────────────────────────────────────────────────
  btnBackToList: { de: '← Zurück zur Liste', en: '← Back to list' },
  btnDeletePlan: { de: 'Löschen', en: 'Delete' },
  btnSavePlan: { de: 'Gartenplan speichern', en: 'Save garden plan' },
  confirmDeletePlan: { de: 'Gartenplan „{name}" wirklich löschen?', en: 'Really delete garden plan "{name}"?' },
  toastPlanSaved: { de: 'Gartenplan gespeichert', en: 'Garden plan saved' },
  toastPlanDeleted: { de: 'Gartenplan gelöscht', en: 'Garden plan deleted' },
  alertEnterName: { de: 'Bitte einen Namen eingeben.', en: 'Please enter a name.' },

  // ── Phase A: setup + boundary drawing ────────────────────────────────
  labelName: { de: 'Name', en: 'Name' },
  placeholderName: { de: 'z.B. Vorgarten Süd', en: 'e.g. South front yard' },
  labelDescription: { de: 'Beschreibung', en: 'Description' },
  labelLinkedPolyculture: { de: 'Bestehende Polykultur verknüpfen (optional)', en: 'Link an existing polyculture (optional)' },
  linkedPolycultureNone: { de: '— keine —', en: '— none —' },
  btnImportMembers: { de: 'Mitglieder übernehmen', en: 'Import members' },
  importMembersHint: { de: 'Übernimmt die Pflanzen der Polykultur einmalig als unplatzierte Liste — keine laufende Synchronisierung.', en: 'Copies the polyculture’s plants in once as an unplaced list — not an ongoing sync.' },
  labelAreaWidth: { de: 'Breite (m)', en: 'Width (m)' },
  labelAreaHeight: { de: 'Tiefe (m)', en: 'Depth (m)' },
  labelGridSpacing: { de: 'Rastergröße', en: 'Grid spacing' },
  labelNotes: { de: 'Notizen', en: 'Notes' },
  placeholderNotes: { de: 'Standort, Boden, Beobachtungen…', en: 'Location, soil, observations…' },
  btnStartDrawing: { de: 'Fläche zeichnen starten', en: 'Start drawing area' },
  hintDrawing: { de: 'Klicke auf die Fläche, um Eckpunkte zu setzen (mind. 3).', en: 'Click on the area to place vertices (at least 3).' },
  vertexCount: { de: '{count} Punkt(e)', en: '{count} point(s)' },
  btnUndoPoint: { de: 'Letzten Punkt entfernen', en: 'Remove last point' },
  btnClearPoints: { de: 'Neu beginnen', en: 'Start over' },
  btnFinishBoundary: { de: 'Fläche abschließen', en: 'Finish area' },
  btnRedrawArea: { de: 'Fläche neu zeichnen', en: 'Redraw area' },
  confirmRedrawArea: { de: 'Fläche neu zeichnen? Das löscht die bisherige Umrandung und alle platzierten Pflanzen.', en: 'Redraw the area? This clears the current boundary and all placed plants.' },

  // ── Phase B: placement + growth slider ───────────────────────────────
  labelYearsSincePlanting: { de: 'Jahre seit Pflanzung', en: 'Years since planting' },
  yearsSuffix: { de: '{years} Jahre', en: '{years} years' },
  pickerHeading: { de: 'Pflanzen', en: 'Plants' },
  pickerFilterPlaceholder: { de: 'Pflanze filtern…', en: 'Filter plants…' },
  hintArmed: { de: 'Auf die Fläche tippen zum Platzieren.', en: 'Tap the area to place it.' },
  unplacedFromPolycultureHeading: { de: 'Aus Polykultur übernommen', en: 'Imported from polyculture' },
  selectedPanelHeading: { de: 'Ausgewählt', en: 'Selected' },
  selectedPanelEmpty: { de: 'Klicke eine platzierte Pflanze an, um sie zu bearbeiten.', en: 'Click a placed plant to edit it.' },
  btnRemovePlacement: { de: 'Entfernen', en: 'Remove' },
  labelPlacementNotes: { de: 'Notizen', en: 'Notes' },
  noPlantsInCollection: { de: 'Noch keine Pflanzen im Bestand — erst auf der Pflanzenseite hinzufügen.', en: 'No plants in your collection yet — add some on the Plants page first.' },
};
