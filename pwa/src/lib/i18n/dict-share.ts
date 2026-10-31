import type { Dict } from './core';

// "Projekt als Link teilen" dialog (src/lib/share-dialog.ts), opened from the plan and polyculture pages.
export const shareDict: Dict = {
  shareTitle: { de: 'Projekt als Link teilen', en: 'Share project as link' },
  shareIntro: { de: 'Pflanzen, Polykulturen und Waldgartenpläne werden komprimiert in den Link gepackt. Es wird nichts auf einem Server gespeichert. Wer den Link hat, kann das Projekt in die eigene App übernehmen.', en: 'Plants, polycultures and forest garden plans are packed, compressed, into the link. Nothing is stored on a server. Anyone with the link can copy the project into their own app.' },
  shareIncludePolycultures: { de: 'Polykulturen mitteilen', en: 'Include polycultures' },
  shareIncludeGardenPlans: { de: 'Waldgartenpläne mitteilen', en: 'Include forest garden plans' },
  shareIncludeNotes: { de: 'Notizen mitteilen', en: 'Include notes' },
  shareIncludeLocation: { de: 'Standort der Waldgartenpläne mitteilen', en: 'Include forest garden plan locations' },
  shareLocationHint: { de: 'Zeigt, wo dein Garten liegt – oft deine Adresse. Ohne Standort kommen die Pläne ohne Kartenhintergrund an.', en: 'Reveals where your garden is – often your address. Without it, plans arrive without a map background.' },
  shareCreate: { de: 'Link erstellen', en: 'Create link' },
  shareCopy: { de: 'Link kopieren', en: 'Copy link' },
  shareNative: { de: 'Teilen…', en: 'Share…' },
  shareClose: { de: 'Schließen', en: 'Close' },
  shareCopied: { de: 'Link kopiert', en: 'Link copied' },
  shareSize: { de: '{plants} Pflanzen · Link {kb} KB', en: '{plants} plants · link {kb} KB' },
  shareSizeLong: { de: '{plants} Pflanzen · Link {kb} KB – sehr lang; manche Messenger kürzen so lange Links. Dann lieber per E-Mail schicken oder „Backup teilen“ nutzen.', en: '{plants} plants · link {kb} KB – very long; some messengers cut links this long. Send it by e-mail instead or use “Share backup”.' },
  shareIncludeViews: { de: 'Ansicht der Pläne mitschicken', en: 'Include the plans’ view' },
  shareViewsHint: { de: 'Kamera, Ausschnitt, 2D/3D, Sonnenstand und Einfärben – so, wie du die Pläne zuletzt verlassen hast.', en: 'Camera, section, 2D/3D, sun position and colouring – as you last left the plans.' },
  shareStartPlan: { de: 'Öffnet nach dem Übernehmen:', en: 'Opens after importing:' },
  shareStartNone: { de: '– keinen Plan –', en: '– no plan –' },
  shareOpen: { de: '🔗 Teilen…', en: '🔗 Share…' },
  shareOpenTitle: { de: 'Projekt als Link teilen', en: 'Share project as link' },
};
