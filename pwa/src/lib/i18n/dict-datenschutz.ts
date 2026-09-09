import type { Dict } from './core';

export const datenschutzDict: Dict = {
  dsTitle: { de: 'Datenschutz­erklärung', en: 'Privacy Policy' },
  dsAsOfLabel: { de: 'Stand:', en: 'Last updated:' },
  dsAsOfDate: { de: '1. Mai 2026', en: 'May 1, 2026' },

  dsSummaryTitle: { de: 'Kurzfassung', en: 'Summary' },
  dsSummaryBody: {
    de: 'Perma Guild Forge ist eine Local-First-Webanwendung. Deine Pflanzen­daten werden ausschließlich in deinem Browser (IndexedDB) gespeichert und nicht an einen Server übertragen. Es gibt kein Tracking, keine Cookies zu Marketing- oder Analyse­zwecken und keine Nutzer­konten.',
    en: 'Perma Guild Forge is a local-first web application. Your plant data is stored exclusively in your browser (IndexedDB) and is not transmitted to a server. There is no tracking, no cookies for marketing or analytics purposes, and no user accounts.',
  },

  dsResponsibleTitle: { de: 'Verantwortlich', en: 'Responsible Party' },
  dsResponsibleBody1: { de: 'Verantwortlich für die Bereitstellung dieser Anwendung sind die im', en: 'The persons named in the' },
  dsResponsibleLink: { de: 'Impressum', en: 'Legal Notice' },
  dsResponsibleBody2: { de: 'genannten Personen.', en: 'are responsible for providing this application.' },

  dsLocalDataTitle: { de: 'Lokal gespeicherte Daten', en: 'Locally Stored Data' },
  dsLocalDataIntro: { de: 'Folgende Daten werden ausschließlich lokal in deinem Browser gespeichert und verlassen dein Gerät nicht:', en: 'The following data is stored exclusively locally in your browser and never leaves your device:' },
  dsLi1Strong: { de: 'Pflanzen­datenbank und Gilden', en: 'Plant database and guilds' },
  dsLi1Body: {
    de: 'die von dir erfassten oder importierten Pflanzen­datensätze inklusive Eigenschaften, Quellen und Bild-URLs sowie deine angelegten Gilden.',
    en: 'the plant records you have entered or imported, including attributes, sources and image URLs, as well as the guilds you have created.',
  },
  dsLi2Strong: { de: 'Einstellungen, Filter und Hinweise', en: 'Settings, filters and notices' },
  dsLi2Body: {
    de: 'aktivierte Daten­quellen, Theme-Präferenz (Hell/Dunkel/Auto), Standard-Ansicht, lokale Pflanzen-Filter, Hinweise die du weggeklickt hast, Zeitstempel des letzten Backups.',
    en: 'enabled data sources, theme preference (Light/Dark/Auto), default view, local plant filters, notices you have dismissed, timestamp of the last backup.',
  },
  dsLi3Strong: { de: 'Sync-Zugangsdaten', en: 'Sync credentials' },
  dsLi3Body1: {
    de: 'falls du in den Einstellungen WebDAV- oder GitHub-Gist-Sync eingerichtet hast, werden URL, Benutzername, Passwort bzw. Personal Access Token ausschließlich in deinem Browser gespeichert. Sie verlassen dein Gerät nur, wenn du eine Sync-Aktion auslöst — und dann ausschließlich an die von dir angegebene Adresse (dein WebDAV-Server bzw.',
    en: 'if you have set up WebDAV or GitHub Gist sync in the settings, the URL, username, password or personal access token are stored exclusively in your browser. They only leave your device when you trigger a sync action — and then only to the address you specified (your WebDAV server or',
  },
  dsLi3Body2: { de: ').', en: ').' },
  dsLi4Strong: { de: 'Service-Worker-Cache', en: 'Service worker cache' },
  dsLi4Body1: { de: 'statische Anwendungs­dateien für die Offline-Nutzung. Die App fragt den Browser außerdem über', en: 'static application files for offline use. The app also asks the browser via' },
  dsLi4Body2: { de: 'an, die lokalen Daten bei Speicherdruck nicht zu verwerfen.', en: 'not to discard local data under storage pressure.' },
  dsLocalDataOutro: {
    de: 'Du kannst diese Daten jederzeit über die Browser-Einstellungen oder über die Export- und Lösch­funktionen innerhalb der App entfernen.',
    en: 'You can remove this data at any time via your browser settings or the export and delete functions within the app.',
  },

  dsExternalTitle: { de: 'Externe Dienste', en: 'External Services' },
  dsExternalIntro: {
    de: 'Wenn du Pflanzen­daten suchst oder anreicherst, werden Anfragen an externe Dienste gesendet. Welche Quellen aktiv sind, kannst du in den Einstellungen festlegen.',
    en: 'When you search for or enrich plant data, requests are sent to external services. You can choose which sources are active in the settings.',
  },
  dsExtLi1Body: { de: 'direkte API-Anfragen aus deinem Browser für Such­ergebnisse und Pflanzen­details.', en: 'direct API requests from your browser for search results and plant details.' },
  dsExtLi2Body1: { de: 'Anfragen werden über einen eigenen Server-Proxy (', en: 'requests are routed through our own server proxy (' },
  dsExtLi2Body2: { de: ') weitergeleitet, weil die Quelle keinen direkten Browser-Zugriff erlaubt. (NaturaDB ist aktuell deaktiviert, siehe ROADMAP.md.)', en: ') because the source does not allow direct browser access. (NaturaDB is currently disabled, see ROADMAP.md.)' },
  dsExtLi3Body: { de: 'Pflanzen­bilder werden bei Bedarf direkt von dort geladen.', en: 'plant images are loaded directly from there when needed.' },
  dsExtLi4Body1: { de: 'nur wenn du Gist-Sync aktiviert hast. Anfragen gehen mit deinem Personal Access Token direkt an', en: 'only if you have enabled Gist sync. Requests go with your personal access token directly to' },
  dsExternalOutro: {
    de: 'Bei diesen Anfragen wird deine IP-Adresse vom jeweiligen Anbieter verarbeitet. Wir haben darauf keinen Einfluss.',
    en: 'Your IP address is processed by the respective provider for these requests. We have no influence over this.',
  },

  dsHostingTitle: { de: 'Hosting', en: 'Hosting' },
  dsHostingBody: {
    de: 'Die Anwendung wird von einem eigenen Server ausgeliefert. Beim Aufruf der Seite werden technisch notwendige Server-Logs (z.B. IP-Adresse, Zeitstempel, User-Agent) verarbeitet.',
    en: 'The application is served from our own server. When the page is accessed, technically necessary server logs (e.g. IP address, timestamp, user agent) are processed.',
  },

  dsCookiesTitle: { de: 'Cookies', en: 'Cookies' },
  dsCookiesBody1: { de: 'Diese Anwendung setzt keine Cookies. Für lokale Einstellungen wird ausschließlich', en: 'This application does not use cookies. For local settings it uses exclusively' },
  dsCookiesBody2: { de: 'und', en: 'and' },
  dsCookiesBody3: { de: 'verwendet. Diese Daten verbleiben auf deinem Gerät.', en: 'This data remains on your device.' },

  dsPlausibleTitle: { de: 'Reichweiten­messung mit Plausible', en: 'Analytics with Plausible' },
  dsPlausibleIntro1: { de: 'Wir verwenden', en: 'We use' },
  dsPlausibleAddress: { de: '(Plausible Insights OÜ, Västriku tn 2, 50403 Tartu, Estland —', en: '(Plausible Insights OÜ, Västriku tn 2, 50403 Tartu, Estonia —' },
  dsPlausibleIntro2: {
    de: '), um Seitenaufrufe und grobe Nutzungsmuster zu zählen. Plausible ist ein datenschutz­freundliches, in der EU gehostetes Analyse-Tool, das ausdrücklich auf personen­bezogene Daten verzichtet:',
    en: ') to count page views and rough usage patterns. Plausible is a privacy-friendly, EU-hosted analytics tool that explicitly forgoes personal data:',
  },
  dsPlausibleLi1: { de: 'keine Cookies, kein Local-Storage durch Plausible,', en: 'no cookies, no local storage used by Plausible,' },
  dsPlausibleLi2: { de: 'keine dauerhafte Speicherung der IP-Adresse (nur kurzfristig zur Aggregation),', en: 'no permanent storage of the IP address (only briefly for aggregation),' },
  dsPlausibleLi3: { de: 'keine geräte- oder personen­übergreifende Wieder­erkennung,', en: 'no cross-device or cross-person recognition,' },
  dsPlausibleLi4: { de: 'kein Cross-Site-Tracking.', en: 'no cross-site tracking.' },
  dsPlausibleBody2: {
    de: 'Erfasst werden ausschließlich aggregierte Werte wie Seitenpfad, Verweis-Domain (Referrer), ungefährer Standort auf Länder-/Regionsebene, Browser- und Geräte-Typ. Eine Einwilligung ist nach Auffassung der Aufsichts­behörden für diese cookielose Form der Reichweiten­messung nicht erforderlich.',
    en: 'Only aggregated values are recorded, such as page path, referring domain, approximate location at country/region level, and browser and device type. In the view of the supervisory authorities, consent is not required for this cookieless form of analytics.',
  },
  dsPlausibleOptOutTitle: { de: 'Reichweiten­messung deaktivieren', en: 'Disabling Analytics' },
  dsPlausibleOptOutIntro: { de: 'Wenn du nicht gezählt werden möchtest, kannst du die Messung direkt in der App deaktivieren:', en: 'If you do not want to be counted, you can disable analytics directly in the app:' },
  dsOptOutLi1a: { de: 'Öffne die', en: 'Open the' },
  dsSettingsLink: { de: 'Einstellungen', en: 'Settings' },
  dsOptOutLi2a: { de: 'Setze in der Sektion', en: 'In the' },
  dsPrivacySection: { de: 'Privatsphäre', en: 'Privacy' },
  dsOptOutLi2b: { de: 'den Haken bei „', en: 'section, check the box for "' },
  dsPlausibleOptOutLabel: { de: 'Plausible-Reichweitenmessung deaktivieren', en: 'Disable Plausible analytics' },
  dsOptOutLi2c: { de: '".', en: '".' },
  dsOptOutLi3a: { de: 'Klicke auf', en: 'Click' },
  dsSaveSettingsBtn: { de: 'Einstellungen speichern', en: 'Save settings' },
  dsOptOutBody1: { de: 'Technisch wird dabei in deinem Browser der lokale Schlüssel', en: 'Technically, this sets the local key' },
  dsOptOutBody2: { de: 'auf', en: 'to' },
  dsOptOutBody3: {
    de: 'gesetzt — ein offizielles Opt-out-Signal, das das Plausible-Skript automatisch respektiert. Es werden ab dem Zeitpunkt keine weiteren Aufrufe gezählt. Die Einstellung wirkt nur in diesem Browser-Profil und nur, solange du den lokalen Speicher der Seite nicht löschst.',
    en: 'in your browser — an official opt-out signal that the Plausible script automatically respects. From that point on, no further page views are counted. The setting only applies to this browser profile, and only as long as you don’t clear the site’s local storage.',
  },
  dsPlausibleAltMethods: {
    de: 'Alternativ helfen browser­seitige Maßnahmen wie „Do Not Track", ein Tracking-Blocker oder ein Werbe-Blocker mit aktiven EasyPrivacy-Listen.',
    en: 'Alternatively, browser-side measures such as "Do Not Track", a tracking blocker, or an ad blocker with active EasyPrivacy lists can help.',
  },

  dsRightsTitle: { de: 'Deine Rechte', en: 'Your Rights' },
  dsRightsBody1: {
    de: 'Da personen­bezogene Daten ausschließlich auf deinem Gerät verbleiben, hast du jederzeit volle Kontrolle: Daten exportieren (JSON / CSV), bearbeiten oder löschen. Server­seitig werden keine personen­bezogenen Daten gespeichert, die wir auf Anfrage herausgeben oder löschen müssten.',
    en: 'Because personal data remains exclusively on your device, you are always in full control: export (JSON / CSV), edit, or delete data. No personal data is stored server-side that we would need to disclose or delete on request.',
  },
  dsRightsBody2a: { de: 'Bei Fragen zum Datenschutz wende dich an die im', en: 'For privacy questions, please contact the address given in the' },
  dsRightsBody2b: { de: 'genannte Adresse.', en: '.' },
};
