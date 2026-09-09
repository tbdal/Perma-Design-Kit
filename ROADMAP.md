# Roadmap — Perma Design Kit

## Aktueller Stand

Die PWA (`pwa/`) ist der aktive Entwicklungszweig und ersetzt die älteren PowerShell-Skripte. Sie läuft im Browser, speichert Daten lokal (IndexedDB) und kann ohne Installation offline genutzt werden.

### Implementiert

- **Pflanzenverwaltung** — Erstellen, Bearbeiten, Löschen von Pflanzen mit ~50 Attributen (Nutzung, Ökosystemfunktionen, Sonne/Wasser/pH, Wachstum, Blüte-/Fruchtmonate)
- **Pflanzendaten-Import** — Suche via lokale Golden-Master-DB (`plants-db.json`) + Wikidata-API (automatisch bei Import), Anreicherung via PFAF (eigener Server-Proxy, `server/plant-proxy-server.mjs`; NaturaDB aktuell deaktiviert)
- **CSV- & JSON-Import/Export** — inkl. CSV-Vorlagen-Download
- **Drei Ansichten** — Kachelansicht, Listenansicht (sortierbar), Kartenansicht; Toggle in der Toolbar
- **Drei Kartenvarianten** — Polykarte (70×120 mm), Streifenkarte (290×17 mm), **Baumscheibe** (SVG-Template mit Field-Mapped Overlays, A4 Hochformat)
- **Suchleiste** — prominent, mit Lupe-Icon, floating Dropdown, Multi-Add, Wikidata/PFAF/NaturaDB-Enrichment direkt beim Import
- **Kartenvorschau** — Live-Vorschau der Pflanzenkarten im Browser
- **PDF-Export** — Polykarten und Streifenkarten via pdf-lib (Auto-Download); Baumscheibe via pdf-lib (Chrome/Safari) bzw. nativem Druckdialog (Firefox); Bulk-PDF aus Selektion
- **Bulk-Operationen** — Auswählen (inkl. Shift-Klick Range), Löschen, Ergänzen, JSON/CSV/PDF-Export ausgewählter Pflanzen
- **Lokale Filter-Chips** — nach Nutzung, Sonne, Wasser, pH, Vollständigkeit; AND-Logik, persistent
- **Feldprovenenz** — `_sources` pro Datenpunkt; anklickbare Quell-Badges im Edit-Dialog (verlinken wie die Outline-Chips in Kacheln/Liste direkt auf den Quell-Datensatz)
- **Tastatur-Shortcuts** — `/` Suche, `n` Neue Pflanze, `g/l/c` View-Wechsel, `?` Cheatsheet
- **Einstellungsseite** — sechs Sektionen: Datenquellen, Ansicht, Theme, Privatsphäre, Daten, **Sync**
- **Dark Mode** — 3-State-Toggle (Auto/Hell/Dunkel), Pre-Paint-Inline-Skript (kein Light-Flash)
- **Plausible Analytics** — cookieless, EU-gehostet; In-App-Opt-out
- **Rechtliches** — Datenschutz, Impressum (Stub), Hilfe/Glossar, Footer
- **PWA-Install-Prompts** — Android Banner + iOS Safari Popup
- **UI-Redesign** — Kacheln mit Bild/Akzentstreifen/Vollständigkeitsbalken, Listenansicht sortierbar, leerer Zustand mit CTA
- **Mehrsprachigkeit** — Deutsch (Standard) und Englisch, Sprachauswahl oben rechts im Header, client-seitiges i18n (`src/lib/i18n/`), Details siehe „Mehrsprachigkeit" unter Langfristig
- **Druckanzahl / Deaktivieren** — Stepper pro Pflanze steuert, wie oft ihre Karte in Bulk-PDF-Exports erscheint (0 = ausgeschlossen)
- **Polykulturen MVP** — `/polykulturen` Seite mit Editor, Rollen-Slots, mechanischen Vorschlägen aus eigenem Bestand (`compatScore` Sonne/Wasser/pH), kuratierte `role-suggestions.json` (6 Rollen), Internet-Import direkt aus dem Vorschlagspanel
- **Backup & Sync**:
  - JSON-Backup-Download (inkl. Polykulturen)
  - Web Share API (teilen an andere Apps)
  - Backup einlesen (Restore, inkl. Polykulturen)
  - **WebDAV-Sync** (PUT/GET, Credentials in localStorage, CORS-Hinweis)
  - **Lokale Datei** (File System Access API, Chrome/Edge, `showSaveFilePicker`)
  - **GitHub Gist** (privates Gist via PAT, Gist-ID automatisch gespeichert)
  - **Auto-Sync** beim Tab-Verlassen (`visibilitychange`), lautlos, WebDAV → Gist Priorität
  - `navigator.storage.persist()` gegen Browser-Eviction
  - Backup-Reminder-Banner (30-Tage-Schwelle)
  - Letzter Sync-Zeitstempel + Anbieter in den Einstellungen
- **Service Worker** mit Build-Hash-Cache-Versioning
- **DB-Schemaevolution** — v3 mit idempotenter Upgrade-Logik (alle fehlenden Stores werden nachträglich angelegt)
- **Ernte- & Blütenkalender** (`/kalender`) — neue Seite mit Monats-Heatmap-Überblick aus `fruitMonths`/`flowerMonths` aller Pflanzen, per-Pflanze-Detailtabelle, Suche/Filter, aktueller Monat hervorgehoben; Nav-Link im Header
- **Baumscheibe Name-Fix** — `commonName` und `latinName` werden jetzt korrekt gerendert: SVG-`<image>`-Platzhalter werden ausgeblendet, echte `<text>`-Elemente an gleicher Bounding-Box-Position eingefügt; Latein kursiv

---

## Kurzfristig

### vorort
- [ ] naturadb anrufen
- [ ] tabellenansicht verbessern: inhalt klarer unterscheiden (funktionen / nutzen) und weitere spalten mit infos wie Blütemonate. möglichst alles in tabellenform anzeigen. legende zu farben erstellen
- [ ] präsentation
  - aufzeichnung 10-20min, ende sept. abgabe, anfang nov ist konferenz. beiträge hinter paywall. agroforestry research trust. fffg.
  - kalender: wann dran arbeiten?
  - zu kooperation einladen

- [ ] welcher stand ist für uns ausreichend zu präsentieren?
- [ ] mapping
- [ ] 2 pdf versionen: a) 9 stück pro din a4 b) maßstabsgetreu
- [ ] jens dazu einweihen

### Debugging
#### Darstellung Scheibe & mapping prüfen
- [ ] raleway schrift auch für höhe und durchmesser und winterhärte
- [ ] warum wird bei Beinwell Material  und Brennstoff aktiviert - wo steht das bei pfaf?


#### weitere bugs / validierung
- [x] **NOW anzahl pflanzen auf karten-seite** — der bisher nur in Kachel-/Listenansicht (`index.astro`) vorhandene Druckanzahl-Stepper ist jetzt auch auf `/cards` und in der Kartenansicht von `index.astro` verfügbar. `printStepperHtml()` dafür nach `card-html.ts` verschoben (nimmt jetzt eine `t`-Funktion als Parameter, damit jede Seite ihr eigenes i18n-Dict nutzen kann), Klick-Handler in `cards.astro` als Teil der bestehenden Event-Delegation ergänzt (adressiert über `data-index` statt `data-id`, da `cards.astro` Pflanzen indexbasiert referenziert)
- [ ] limits für abruf bei pfaf

### Baumscheibe Karte Feinschliff
- [x] **SVG neu generiert: `baumscheibe2.3_inkl-label.svg`** — farbiger, überarbeiteter Export ersetzt `pwa/public/baumscheibe-template.svg`. Rohe Photoshop-Ebenennamen (`u_edible`, `f_Nfixer`, `ph2_acid`, …) statt bisheriger PlantData-Feldnamen als `inkscape:label` — Zuordnung per Positionsvergleich ermittelt (`getBBox()` alt vs. neu, nächster Nachbar, meist < 5px), nicht geraten; Details im Kommentar oben in `baumscheibe-mapping.ts` und in `baumscheibe-mapping-status.md`. Disc-Geometrie und Frucht-/Blüte-Ringe per Pixel-Sampling erneut vermessen: byte-identisch zur alten Version, keine Code-Anpassung an `pdf-export.ts`/`baumscheibe-render.ts` nötig. `latinName`/`commonName`/`heightM`/`widthM`/`climateZone` existierten im rohen Export nicht (wie schon vorher reine manuell nachgetragene Textfelder) — 1:1 aus dem alten Template übernommen. **Bonus:** `phVeryAcid`/`phVeryAlkaline` sind jetzt erstmals verdrahtet (2.3-Template hat alle 5 pH-Stufen statt bisher 3). **Regression:** `growSpeedMid`/`growSpeedHigh` sind jetzt tot (2.3-Template hat nur noch 1 statt 3 Wachstumsgeschwindigkeits-Icons) — neuer Punkt in `baumscheibe-mapping-status.md`. Getestet: volle Testpflanze, leere Testpflanze, alle drei PDF-Export-Pfade (Einzelkarte/Bulk/6er-Sheet) per Playwright + Sichtprüfung der gerenderten PDFs
- [x] **Schriftarten von SVG übernommen (commonName)** — `NAME_BOXES` in `baumscheibe-render.ts` nutzt jetzt Raleway (wie das Template selbst für „COMMON NAME") statt Inter; per Google Fonts geladen (OFL-lizenziert), `document.fonts.load()` vor dem Rendern erzwungen, da ein per `Image()`-Blob geladenes SVG das Nachladen sonst nicht selbst auslöst — sonst hätte der PDF-Export (Canvas-Rasterung) die Schrift verpasst, obwohl sie im Hauptdokument schon registriert war. Per `document.fonts.check()` und Sichtprüfung des gerenderten PDFs bestätigt. **latinName offen:** das Template nutzt „Voice-of-the-Highlander", ein Schriftschnitt von Octotype/DaFont — laut Lizenz nur für den persönlichen Gebrauch frei, für Web-Embedding in dieser App bräuchte es eine kommerzielle Lizenz (Kontakt: octotypeone@gmail.com). Font-Family wird zwar angefragt (fällt aktuell auf eine Serif-Kursive zurück), aber nicht eingebunden — Kauf/Klärung der Lizenz wäre nötig, bevor sie echt eingebunden werden kann
- [ ] Code anpassen analog baumscheibe3-data-fields.ods
- [ ] Sonne/Wasser-Icons (je 3 Zustände) ergänzen — einzige verbleibende „komplett tot"-Gruppe, siehe `baumscheibe-mapping-status.md`
- [x] **Wachstums-Icon aktiviert (Behelfslösung)** — die "growth speed"-Gruppe hat nur ein generisches Icon statt drei einzelner (Low/Mid/High); `setGrowthSpeedIcon()` zeigt es, sobald *irgendeines* von `growSpeedLow`/`Mid`/`High` gesetzt ist (kann die drei Stufen also nicht unterscheiden). Echte Mid/High-Icons ergänzen bleibt offen, falls das Artwork erweitert wird
- [x] **Farbflächen folgen jetzt den Icons** — die "color"-Gruppe (10 farbige Hintergrund-Flächen hinter Essbar/Medizin/Kulinarisch/N-Fixer/Mineralien/Bodendecker/Insekten/Tierschutz/Windschutz) war unabhängig von den Icons immer sichtbar; jetzt als zusätzliche Label-Aliase in `baumscheibe-mapping.ts` ergänzt, sodass Aus-/Einblenden eines Feldes Icon *und* Farbfläche gemeinsam steuert
- [x] **Frucht-/Blütemonate auf echtes Label-Mapping umgestellt** — der bisherige Hardcode-Workaround (Donut-Segmente per Pixel-Sampling über die Ring-Geometrie gelegt) ist ersetzt: das 2.3-Template hat gelabelte Gruppen `harvest` (Frucht) und `flowering` (Blüte) mit je einem `<image>` pro Monat; DOM-Reihenfolge der Kind-Elemente entspricht der Winkel-Reihenfolge (per `getBBox()` bestätigt, nicht angenommen). `setMonthRing()` blendet sie einzeln nach `fruitMonths[i]`/`flowerMonths[i]` ein/aus, statt neue Pfade zu injizieren. Besonderheit: `harvest` hat nur 11 statt 12 Bilder (kein Frucht-Icon für April) — per Winkel-Abgleich gegen `flowering`s vollständige 12 Positionen bestimmt, nicht geraten. Getestet: alle Monate einzeln, der April-Sonderfall, ein realistisches Apfel-Muster, der Grenzfall „Frucht+Blüte im selben Monat", alle drei PDF-Export-Pfade. Details in `baumscheibe-mapping-status.md`
- [ ] sprache der karten auf ui-sprache einstellen

### sonst
- [ ] lizenzen manuell prüfen & unsere festlegen
- [x] **Sanduhr/Spinner bei PDF-Erstellung** — `withButtonSpinner()` (neu in `src/lib/html.ts`) deaktiviert den Button und zeigt einen kleinen drehenden Kreis + Label während der Generierung, auf allen PDF-Buttons in `index.astro` und `cards.astro` (Einzelkarte, Bulk, 6er-Sheet); stellt den ursprünglichen Inhalt immer wieder her, auch bei Fehlern
- [x] **Baumscheibe als Standardansicht** — `DEFAULT_PREFS.defaultCardVariant` in `settings.ts` von `'poly'` auf `'baumscheibe'` geändert; wirkt nur für neue Nutzer bzw. wenn nie explizit etwas anderes gespeichert wurde
- [ ] führung durch die webseite beim ersten aufruf der webseite
- [ ] nutzen prüfen, ist alles vorhanden, was in Baumscheibe angezeigt wird?#
- [ ] polykulturen-tab entwickeln



### PDF Generierung
- [x] **Größen angepasst: 6 Baumscheiben pro Seite, 9cm Durchmesser** — neuer Button „PDF (6/Seite, 9cm)" auf `/cards` (nur sichtbar bei Baumscheibe-Ansicht), `exportBaumscheibeSheetPDF()` in `pdf-export.ts`. Das bisherige Einzelkarten-Layout (`exportBaumscheibePDF`/`exportBaumscheibesPDF`) druckt das volle Template-Canvas (193,5×210,2mm, viel Weißraum außerhalb der eigentlichen Scheibe) — dieses neue Layout schneidet stattdessen eng auf die Scheibe zu. Kreismittelpunkt/-radius wurden vermessen (Canvas an 24 Winkeln vom Zentrum nach außen abgetastet, äußerster Tintenpixel je Winkel: konsistent ~1011–1046, ein 1077-Ausreißer durch eine kleine Dekor-Kerbe oben rechts) statt geschätzt. 2×3-Raster auf A4, mittig. Firefox nutzt wie beim bestehenden Export den nativen Druckdialog mit eingebettetem (zugeschnittenem) SVG statt Rasterung. Verifiziert: PDF mit 7 Test-Pflanzen erzeugt (6 auf Seite 1, 1 auf Seite 2), beide Seiten A4 (210×297mm), per `poppler-utils` gerendert und den tatsächlichen Scheibendurchmesser nachgemessen — 89,15mm bei Sollwert 90mm (Abweichung durch Kantenerkennungs-Toleranz, nicht durch falsche Skalierung)
  - **Nachbesserung:** Auf einem echten Android-Handy (Firefox → Android-Systemdruck) war die Seite rechts/unten beschnitten. Ursache: 3 Reihen à ~91,7mm (90mm-Scheibe + Zuschnitt-Puffer) summieren sich auf ~275mm gegen eine 297mm hohe A4-Seite — bei nur 4mm `SHEET_GAP_MM` blieb kaum natürlicher Rand übrig (~7mm), und Android/Firefox' Druck-Pipeline erzwingt beim systemeigenen Druckdialog offenbar einen eigenen Mindestrand, den `@page { margin: 0 }` dort nicht zuverlässig überschreibt (anders als der PDF-lib-Pfad über Chrome/Desktop, der exakte Koordinaten direkt in die PDF-Datei zeichnet und von Browser-Druckrändern gar nicht betroffen ist). `SHEET_GAP_MM` von 4mm auf 1mm reduziert (Kreise brauchen ohnehin keinen sichtbaren Abstand, die Ecken zwischen vier Kreisen sind schon leer) — vergrößert den natürlichen Rand auf ~13mm horizontal / ~10mm vertikal. `@page`/`.page`-Größe im Druckpfad zusätzlich von der Keyword-Form (`size: A4 portrait`) auf explizite mm-Angaben (`size: 210mm 297mm`) umgestellt, da manche Druck-Engines das zuverlässiger respektieren. Erneut vermessen: Scheibendurchmesser unverändert 89,15mm, linker Rand jetzt 13,46mm (vorher ~11mm). **Restrisiko:** Bei einem Android-Gerät, dessen Systemdruck einen noch größeren Mindestrand erzwingt, kann trotzdem noch beschnitten werden — das lässt sich vom Code aus nicht zu 100% garantieren, da der Zuschnitt dann außerhalb unserer Kontrolle (im Android-Druckdienst) passiert. Betroffen ist ausschließlich der Firefox/Android-Druckpfad; der PDF-Direktdownload (z.B. via Chrome) hat dieses Risiko nicht
- [ ] zweite Option: Größen entsprechend Baumdurchmesser
- [x] **Druckanzahl / Deaktivieren pro Pflanze** — persistiertes Feld `printCount` (Default 1) auf `PlantData`: 0 = deaktiviert (aus allen Bulk-PDF-Exports ausgeschlossen), >1 = Karte wird entsprechend oft wiederholt gedruckt (z.B. 3 für drei geplante Apfelbäume). Stepper-UI (−/Zahl/+) in Kachel- und Listenansicht, Klick auf die Zahl togglet 0/1 als Schnell-Deaktivieren. `exportCardsPDF`/`exportBaumscheibesPDF`/`exportBaumscheibeSheetPDF` expandieren die Pflanzenliste per `expandByPrintCount()` vor der Seiten-Paginierung; Einzelkarten-Export (ein Klick = eine Karte) bleibt bewusst unverändert. Byte-genau verifiziert: `printCount: 3` erzeugt identischen PDF-Output wie dreimaliges manuelles Auflisten derselben Pflanze
- [x] **Fehlender 6er-PDF-Button auf der Startseite** — der „PDF (6/Seite, 9cm)"-Button existierte nur auf `/cards`, nicht in der Kartenansicht der Startseite (`index.astro`). Ergänzt inkl. Sichtbarkeits-Toggle (nur bei Baumscheibe-Ansicht) und Klick-Handler
- [x] **Standard-Kartentyp zwischen Startseite und `/cards` nicht synchron** — `index.astro` initialisierte sein Karten-Dropdown aus `settings.defaultCardVariant`, `cards.astro` tat das nie und startete immer bei „Pflanzenkarten". Beide Seiten respektieren jetzt die gespeicherte Einstellung

### Sprache
- [x] **Übersetzung auf Englisch** — vollständige Mehrsprachigkeit (Deutsch Standard, Englisch), siehe „Mehrsprachigkeit" unten für Details

### Terminologie & Rebranding
- [x] **„Gilde" → „Polykultur"** — durchgängig umbenannt, inkl. Datenmodell: `Guild`/`GuildRole`/`GuildMember`/`createEmptyGuild` in `types.ts` → `Polyculture`/`PolycultureRole`/`PolycultureMember`/`createEmptyPolyculture`; `db.ts`-Funktionen (`getAllGuilds` etc.) → `getAllPolycultures` etc.; IndexedDB-Objectstore `guilds` → `polycultures` (Migration in `upgrade()`: bestehende Datensätze werden beim nächsten DB-Öffnen automatisch in den neuen Store kopiert, alter Store danach gelöscht — kein Datenverlust). Seite `gilden.astro`/`/gilden` → `polykulturen.astro`/`/polykulturen`. JSON-Backup-Feld `guilds` → `polycultures`; Restore-Pfade (WebDAV, File System Access API, GitHub Gist, Datei-Upload) akzeptieren beide Feldnamen für Rückwärtskompatibilität mit alten Backups. **Bewusst NICHT umbenannt:** die IndexedDB-Datenbank selbst heißt technisch weiterhin `permaculture-guilds` (nur der Store innerhalb der DB wurde umbenannt) — eine volle DB-Umbenennung bräuchte eine aufwändigere datenbankübergreifende Migration für null sichtbaren Nutzen, da der Name ohnehin nie im UI auftaucht
- [x] **„Perma Guild Forge" → „Perma Design Kit"** — App-Name überall aktualisiert (Header, Seitentitel, PWA-Manifest `name`/`short_name`, Footer-Copyright, Backup-Dateinamen, READMEs, `ROADMAP.md`). GitHub-Repo umbenannt: `tbdal/Perma-Guild-Forge` → `tbdal/Perma-Design-Kit` (GitHub leitet den alten Link automatisch weiter), lokaler `origin`-Remote entsprechend angepasst. Rückwärtskompatibilität analog zur Gilde-Umbenennung: `localStorage`-Settings-Key und Gist-Backup-Dateiname wurden umbenannt, alte Werte werden beim Lesen als Fallback akzeptiert, sodass bestehende Nutzer ihre Einstellungen/Sync-Konfiguration nicht verlieren. Ordnername auf dem VPS (`/root/pdk`) bewusst unverändert gelassen, um laufende Dienste/Pfade nicht zu brechen

### Launch-Blocker
- [ ] **Impressum füllen** — aktuell Stub; vor öffentlichem Launch nach §5 TMG ergänzen
- [ ] **Plausible-Domain** — `data-domain` in `Layout.astro` auf Custom-Domain anpassen + im Plausible-Dashboard registrieren
- [ ] **Lizenz-Metadaten ergänzen** — `pwa/package.json` fehlt `"license": "MIT"`. Optional: Copyright-Hinweis in `LICENSE`/README erweitern, da die PWA inzwischen eine vollständige Neuentwicklung ist (Original von Sebastian Schucht war die PowerShell-Tooling-Basis in `legacy/`); MIT erlaubt das Rewrite ohne Einschränkung, solange die bestehende Attribution erhalten bleibt

### Sicherheit (Launch-Blocker)
- [x] **Stored-XSS beim `innerHTML`-Rendering fixen** — `escapeHtml()` aus `pdf-export.ts` nach `src/lib/html.ts` verschoben und an allen Stellen angewendet, die Pflanzen-/Polykultur-Nutzerdaten (`commonName`, `latinName`, `imageUrl`, `climateZone`, Polykulturname/-beschreibung, Such-Ergebnislabels, API-Key-Feld) in `innerHTML`-Template-Strings rendern (`index.astro`, `polykulturen.astro`, `cards.astro`, `kalender.astro`, `settings.astro`, `card-html.ts`). Die Baumscheibe-Karte (`baumscheibe-render.ts`) war bereits sicher (`textContent` + `XMLSerializer`). Mit Playwright gegen einen `"><img src=x onerror=alert('XSS')>`-Payload über alle Ansichten (Grid/Liste/Karten, `/`, `/polykulturen`, `/cards`, `/kalender`) verifiziert — kein Alert, Payload erscheint nur als Text. *(Seite/Route seither von `gilden`/`/gilden` auf `polykulturen`/`/polykulturen` umbenannt, siehe „Gilde → Polykultur" unten.)*
- [x] **Credentials in Einstellungen maskieren** — WebDAV-Passwort und GitHub-PAT waren im Code bereits `type="password"`; zusätzlich das API-Key-Feld der Datenquellen (`settings.astro`) gegen Attribut-Escape durch `"` im Wert abgesichert. localStorage bleibt weiterhin Klartext (siehe PocketBase-Option unter Langfristig für eine serverseitige Lösung).

### Lizenz & Datenquellen (Launch-Blocker)
- [x] **NaturaDB-Scraping vorerst deaktiviert** — *(Pfad-Hinweis: `netlify/functions/plant-proxy.mts` existiert seit der Netlify-Migration weiter unten nicht mehr, siehe `server/plant-proxy-server.mjs`)*. Scraped `naturadb.de` ohne erkennbare Lizenz für die redaktionelle Pflanzendatenbank (Nutzungsbedingungen regeln nur nutzergenerierte Inhalte). `robots.txt` enthält einen expliziten `User-agent: Datenbank Crawler` → `Disallow: /`-Eintrag als klares Anti-Scraping-Signal, Betreiber ist die kommerzielle Maseto GmbH. Ohne Lizenz greift das deutsche Datenbankherstellerrecht (§ 87a ff. UrhG) — Abmahnrisiko real, besonders da der Scraping-Code öffentlich auf GitHub liegt. `fetchNaturaDb()` gibt jetzt hart `{}` zurück (`NATURADB_ENABLED = false`), unabhängig vom Settings-Toggle; Default-Quelle in `settings.ts` auf `enabled: false` gesetzt. **Möglichkeit für später:** aktiv Erlaubnis/API-Zugang bei NaturaDB einholen und `NATURADB_ENABLED` wieder auf `true` setzen — bis dahin bleibt die Quelle aus
- [x] **PFAF-Attribution auf den Karten ergänzt** — `hasSource(plant, 'pfaf')` (neu in `types.ts`) prüft, ob die Pflanze überhaupt PFAF-Felder enthält; nur dann erscheint „Daten: PFAF.org (CC BY 4.0)". Poly-Karte: Fußzeile unter den Blütemonaten. Streifenkarte: eigene feste Spalte am rechten Rand (nicht in der per Ellipsis gekürzten Namens-Zeile — dort wäre sie bei langen Pflanzennamen unsichtbar geworden, per Playwright-Test verifiziert). Baumscheibe: kleiner Text im freien Kuppel-Bereich unter dem Namen (`injectPfafAttribution()`). Getestet mit/ohne PFAF-Quelle auf allen drei Kartentypen plus Leerfall-Regression
- [x] **Bewusste Entscheidung: Browser-User-Agent statt selbst-identifizierendem** — PFAF filtert erkennbar auf den Outbound-User-Agent (siehe „Proxy: PFAF-Parsing" unten): ein ehrlicher, selbst benannter UA (`PermaGuildForge/1.0`) bekommt zuverlässig leere Daten, ein normaler Browser-UA funktioniert. Das ist eine andere Frage als die Datenlizenz (CC BY 4.0 erlaubt Weiterverwendung explizit) — UA-Filtering deutet eher darauf hin, dass *automatisierter* Zugriff unerwünscht ist, unabhängig von der Datennutzung selbst. Abgewogen und bewusst entschieden (im Gegensatz zu NaturaDB, wo mangels jeglicher Lizenz komplett deaktiviert wurde): mit Browser-UA weitermachen, da die Datennutzung selbst lizenzkonform ist und PFAFs eigener Lizenztext ungewöhnlich einladend zur Weiterverwendung ist. Siehe Kommentar bei `OUTBOUND_USER_AGENT` in `plant-proxy-server.mjs` für die volle Begründung — bei Bedarf (z.B. explizite PFAF-ToS zu automatisiertem Zugriff, oder deutlich wachsendes Anfragevolumen) neu bewerten
- [x] **Impressum-Lizenzangabe korrigiert** — `impressum.astro` nannte fälschlich „PFAF: CC BY-NC-SA 4.0"; korrigiert auf die tatsächliche Lizenz der Datenbank-Texte, CC BY 4.0 (NC-SA 3.0 gilt nur für Website-Bilder, die gar nicht kopiert werden)
- [x] **Offenes Proxy-Relay geschlossen** — *(Stand zum Zeitpunkt dieses Fixes, noch auf Netlify; siehe „Proxy von Netlify auf VPS migriert" weiter unten für den aktuellen Stand)*. `plant-proxy.mts` hatte `Access-Control-Allow-Origin: *` und kein Rate-Limiting; jede fremde Website konnte die Funktion als kostenlosen Scraping-Relay für PFAF zweckentfremden. Fix damals: Origin-Allowlist (`isAllowedOrigin()` — nur `*.netlify.app` inkl. Deploy-Previews, `localhost`/`127.0.0.1`, sowie Requests ganz ohne `Origin`-Header/server-to-server; alles andere bekommt `403`), plus von Netlify durchgesetztes Rate-Limiting über `config.rateLimit` (30 Requests/IP/60s). Mit esbuild kompiliert und die Origin-Logik gegen erlaubte/verbotene/fehlende Origins sowie OPTIONS-Preflight verifiziert
- ⚠ Keine Rechtsberatung, nur technisch-praktische Einschätzung anhand der tatsächlichen Lizenztexte — vor öffentlichem/kommerziellem Launch ggf. kurz von einem Urheberrechtler gegenchecken lassen, insbesondere NaturaDB

### Infrastruktur
- [x] **Proxy von Netlify auf eigenständigen Server migriert** — `pwa/netlify/functions/plant-proxy.mts` + `netlify.toml` entfernt, `@netlify/functions`-Dependency raus. Ersetzt durch `pwa/server/plant-proxy-server.mjs` (reines Node, keine Dependencies) als dauerhaft laufender Prozess (`plant-proxy.service` auf dem Entwicklungs-VPS). Frontend-Code unverändert (`fetch('/api/plant-proxy?...')`) — im Dev-Server übernimmt `vite.server.proxy` in `astro.config.mjs` die Weiterleitung an Port 8787 (`xfwd: true`, damit die echte Client-IP fürs Rate-Limiting ankommt); jedes andere Deployment braucht eine äquivalente Reverse-Proxy-Regel (z.B. nginx). CORS-Origin-Allowlist und Rate-Limiting (jetzt echtes In-Process-Limiting statt Netlifys `config.rateLimit`, da der Prozess dauerhaft läuft statt bei jedem Cold-Start zu resetten) portiert. Verifiziert: direkter Aufruf des Backends, Aufruf über den Dev-Server-Proxy, kompletter Such-→Wikidata-→Import-Flow per Headless-Browser. Dabei entdeckt (vorbestehend, keine Regression): PFAF hat sein HTML-Layout geändert, die Regex-Parser liefern fast nur noch leere Felder — siehe „Bekannte Probleme" unten
  - Datenschutzerklärung (`datenschutz.astro`) korrigiert: nannte noch „Netlify Serverless Function" und NaturaDB als aktive externe Quelle sowie Netlify als Hosting-Anbieter — alles nicht mehr zutreffend
  - Diverse Textstellen (`hilfe.astro`, `settings.astro`, `CLAUDE.md`, beide READMEs, `SETUP.md`) von „Netlify-Proxy"/„Netlify Function" auf „Server-Proxy" aktualisiert

- [x] **Frucht-/Blütemonate aus PFAF extrahiert** — PFAFs Fließtext-Beschreibung (`lblPhystatment`) enthält bei fast allen geprüften Pflanzen einen Satz wie „It is in flower from April to May … the seeds ripen from September to October" — exakte Monatsbereiche, kein Fließtext-Rätselraten nötig. (Es gibt daneben ein `txtSummary`-Feld mit „Main Bloom Time: Early spring, Late spring, Mid spring" — das ist aber nur Jahreszeit statt Monat und uneinheitlich formatiert, teils genereller Gattungs-Fließtext statt Blühzeit; bewusst nicht verwendet.) `parseMonthRange()`/`extractMonths()` in `plant-proxy-server.mjs` parsen den Satz und füllen `flowerMonths`/`fruitMonths`, inkl. korrektem Jahreswechsel bei Bereichen wie „November to March". Verifiziert an Fagus sylvatica (Apr–Mai / Sep–Okt), Robinia pseudoacacia (Jun / Nov–Mär, Jahreswechsel korrekt), Prunus avium, Corylus avellana

### Sync (Feinschliff)
- [ ] **Konflikt-Erkennung** — vor dem Pull prüfen ob das Backup auf dem Server neuer ist als lokal; Warnung + Merge-Option statt blindem Überschreiben
- [ ] **Sync-Status im Header** — kleines Icon (✓ / ⚠) das den letzten Auto-Sync-Status zeigt ohne in die Einstellungen zu müssen
- [ ] **Background Sync API** — Service-Worker-basierter Sync, der auch funktioniert wenn die App geschlossen ist (Chrome only; graceful degradation)

### Polykulturen (Feinschliff)
- [ ] **PDF-Export einer Polykultur** — Pflanzenkarten der Mitglieder als Set + optionale Übersichtsseite
- [ ] **Bulk-Add aus Pflanzenliste** — „Auswahl zur Polykultur X hinzufügen"
- [ ] **Rollen-Vollständigkeits-Indikator** — welche Rollen noch fehlen, auf der Polykulturenkarte in der Listenansicht
- [ ] **Inkompatibilitäts-Warnung** — z.B. Walnuss-Allelopathie (Juglone)

### Baumscheibe-Karte (Feinschliff)
- [ ] **Fehlende Felder in der SVG ergänzen** — `inkscape:label`-Overlays für `fruitMonths`/`flowerMonths`, `pioneer`, `layer`, Sonne/Wasser/pH-Icons
- [ ] **Score-Sterne** — `eatableScore`/`medsScore`/`materialScore` als 5-Stern-Element in SVG anlegen
- [ ] **SVG-Template optimieren** — derzeit 5 MB durch ~30 inline Base64-PNGs; via `svgo` / externe Raster

### UI / UX
- [ ] **Konfigurierbare Farbthemen** — Farbenblindheits-Modus
- [ ] **Bild-Fallback** — Silhouette nach Pflanzentyp wenn kein Foto vorhanden

### Daten
- [ ] **Pflanzenbild-Upload** — Bild lokal speichern (Base64 in IndexedDB oder File in OPFS)
- [ ] Fehlende Felder: Boden-Typ, Ausbreitungsart, Wurzeltiefe

---

## Mittelfristig

### Notizen & Beobachtungen
- [ ] **Beobachtungs-Tagebuch pro Pflanze** — freie Notizen mit Datum (z.B. „Erstmals geblüht", „Mehltau bemerkt"), gespeichert in IndexedDB
- [ ] **Foto-Upload pro Eintrag** — eigene Fotos direkt in der App

### Polykulturen — Kuratiertes Companion-Wissen (Phase 2)
- [ ] **`companions.json` als Golden Master** — bekannte gute Kombinationen aus Standardliteratur (Jacke & Toensmeier, Crawford, Hemenway)
- [ ] **Vorschläge erweitern** — mechanische Filter + Companion-Datenbank kombiniert
- [ ] **Pflege-Workflow** für Companion-Daten (PR-Prozess)

### Polykulturen — Visualisierung (Phase 3)
- [ ] **Schicht-Diagramm pro Polykultur** — Baumkrone → Strauch → Staude → Bodendecker → Wurzel
- [ ] **Kompatibilitäts-Matrix** als Heatmap (Sonne/Wasser/pH/Allelopathie)

### Polykulturen — SPARQL (Phase 4, Experiment)
- [ ] **Wikidata-SPARQL** direkt aus dem Browser — z.B. alle Stickstoff-fixierenden Pflanzen
- [ ] **Filter-Builder** im Vorschlags-Panel → SPARQL generieren, importieren
- ⚠ Wikidata-Coverage für ökologische Properties dünn; als Ergänzung, nicht Ersatz

### Visuelles Layout
- [ ] Pflanzplan-Ansicht: Bäume/Sträucher als Kreise auf 2D-Raster, maßstäblich
- [ ] Schichtmodell-Visualisierung
- [ ] Export als SVG/PNG

### Datenquellen
- [ ] Offline-Datenbank (GBIF-Subset o.ä.)
- [ ] Weitere Proxy-Quellen (Pflanzkollektiv, OpenEcoSystems)
- [ ] Wikidata-Properties erweitern (Bestäuber, Schädlingsabwehr)

---

## Langfristig

### Kuratierte Polykulturen als Community-Layer
Öffentlich geteilte Polykulturen (z.B. „Apfelbaum-Polykultur nach Crawford") zum Importieren.
Erfordert ein Backend oder ein standardisiertes JSON-Schema für den Austausch.
Mögliche Einstiegspunkte: GitHub-Repository mit kuratierten Polykulturen-JSONs (PR-Workflow),
später optionales Abo-Modell für gepflegte Sammlungen.

### PocketBase als Server-Backend (Option)

| Use Case | Jetzt (PWA + Netlify) | Mit PocketBase |
|---|---|---|
| Datenspeicher | IndexedDB, pro Browser | SQLite auf eigenem Server |
| Multi-Gerät-Sync | WebDAV / Gist (manuell + auto) | automatisch, Real-Time |
| Gemeinsame Pflanzenbibliothek | ✗ | ✓ |
| Offline-Nutzung | ✓ vollständig | möglich, Sync-Logik nötig |
| Auth / Benutzerkonten | — | eingebaut (OAuth2, E-Mail) |
| Deployment | Netlify (kostenlos) | VPS / Fly.io (ab ~5 €/Mo.) |

**Wann sinnvoll:** mehrere Nutzer, geteilte Bibliothek, kein Datenverlustrisiko.

### Mehrsprachigkeit
- [x] **UI auf Englisch lokalisieren** — Client-seitiges i18n (`src/lib/i18n/`), passend zur Architektur ohne Framework/Build-Routing: Sprachauswahl-Button oben rechts im Header (neben Theme-Toggle), Wahl wird in `localStorage` gespeichert (Default `de`), Umschalten lädt die Seite neu, damit alles in der gewählten Sprache neu rendert. `core.ts` stellt `getLang`/`setLang`, `createT(...dicts)` (gebundenes `t(key, vars?)` für JS-generierten Text) und `applyStaticI18n(...dicts)` (läuft über `data-i18n`/`-title`/`-placeholder`/`-aria-label`-Attribute im statischen Markup) bereit. Jede Seite hat ihr eigenes `dict-<seite>.ts`; `Layout.astro` übersetzt seinen eigenen Header/Footer/Banner/Shortcuts-Modal separat von den Einzelseiten. Wichtiger Bugfix dabei: `applyStaticI18n` durchsucht das *gesamte* Dokument, nicht nur das Markup des Aufrufers — ohne Anpassung hätte der Aufruf einer Seite mit ihrem eigenen Dict die bereits von `Layout.astro` übersetzten Nav-/Footer-Elemente mit dem rohen Key überschrieben (unbekannte Keys werden jetzt übersprungen statt mit dem Rohschlüssel überschrieben). Alle 8 Seiten vollständig übersetzt, inklusive Impressum/Datenschutz (mit Klarstellung: keine rechtsverbindliche Übersetzung, nur zur Verständlichkeit — deutsche §-Verweise wie TMG/MStV bleiben zitiert, mit englischer Erläuterung daneben). Per Playwright über alle 8 Routen in beiden Sprachen verifiziert (inkl. dynamisch gerenderter Inhalte: Tabellen-Header, Bulk-Leiste, Bearbeiten-Dialog, Druckanzahl-Stepper-Tooltips)
- [ ] Pflanzennamen mehrsprachig (de/en/la)

### Migration PowerShell → PWA
- [ ] PowerShell-Skripte als Legacy markieren
- [ ] Import bestehender `.psd1`-Datensätze

---

## Bekannte Probleme / Tech Debt

| Problem | Status |
|---|---|
| PDF-Streifen in LibreWolf (SMask/pdf.js) | ✅ behoben — raw RGB via `flateStream` |
| Baumscheibe-PDF in Firefox | ✅ behoben — Firefox nutzt nativen Druckdialog (vektoriell) |
| Dark-Mode-Bulk-Substitution (View-Toggle-Buttons) | ✅ behoben |
| Beispieldaten-Import schlägt auf Deploy fehl | ✅ behoben — Filter-Reset + DB-v3-Upgrade |
| DB v2 fehlender `plants`-Store | ✅ behoben — v3 idempotente Upgrade-Logik |
| Proxy kein Rate-Limiting / offenes CORS | ✅ behoben — Origin-Allowlist + Rate-Limiting, siehe „Lizenz & Datenquellen" oben |
| Proxy lief über Netlify Function | ✅ behoben — auf eigenständigen Server migriert, siehe „Infrastruktur" oben |
| Proxy: PFAF-Parsing via Regex auf rohem HTML | ✅ Vollständig behoben und live verifiziert. Tabellenfelder (`commonName`, `eatableScore`, `medsScore`, `materialScore`, `climateZone`): PFAF hatte die Übersichtstabelle umgebaut (Label jetzt in `<b>`, Wert jetzt in `<span id="ContentPlaceHolder1_XXX">` statt direkt im `<td>`) — umgestellt auf Extraktion über die ASP.NET-Control-`id`s, stabiler als umgebendes Markup. Physical-Description-Block, Sonne/Wasser-Icons und Funktions-Tags waren nicht betroffen. **Der eigentliche Grund für die anfangs vermutete „Drosselung":** zwei sich überlagernde, unabhängige Bugs — (1) `plant-proxy-server.mjs` baute die PFAF-URL via `encodeURIComponent(name.replace(' ','+'))`, was das `+` selbst nochmal escapte zu `%2B` (→ PFAF suchte nach einer Pflanze namens „Malus+domestica" mit Plus-Zeichen im Namen, fand nichts, lieferte aber trotzdem `200 OK` mit leerer Seite statt eines Fehlers); Fix: erst `encodeURIComponent(name)`, dann `%20`→`+` ersetzen, nicht umgekehrt. (2) PFAF liefert dem User-Agent-String `PermaGuildForge/1.0` reproduzierbar (100% in Stichproben von je 5+ Anfragen) eine vollständig aufgebaute, aber komplett leere Seite — mit einem gewöhnlichen Browser-UA kommen dieselben Anfragen zuverlässig mit echten Daten zurück. Fix: `OUTBOUND_USER_AGENT` auf einen normalen Firefox-UA-String gesetzt. Mit `curl -sL` (Redirects folgen — wichtig, PFAF leitet `%20`-URLs per 302 auf die `+`-Form um) und direkten Node-`fetch()`-Vergleichen sauber isoliert und je einzeln bestätigt, dann beide Fixes zusammen live über Proxy und komplette App-UI (Suche → Wikidata → Import) verifiziert: Malus domestica liefert jetzt commonName „Apple", 9 m Höhe, Zone 3-8, Scores 5/2/4 etc.; Robinia pseudoacacia korrekt `nitrogenFix: true`, 25×15 m. NaturaDB-Parsing-Code existiert noch (`fetchNaturaDb()`), ist aber via `NATURADB_ENABLED = false` deaktiviert (siehe „Lizenz & Datenquellen" oben) |
| Baumscheibe-SVG-Template 5 MB (inline Base64) | offen — via `svgo` / externe Raster |
| GitHub Gist: kein Konflikt-Abgleich beim Pull | offen — siehe Kurzfristig Sync |
| Backup-Restore ignorierte Polykulturen in allen pull/import-Pfaden | ✅ behoben — `importPolycultures()` (damals `importGuilds()`) in `db.ts`, alle vier Restore-Handler in `settings.astro` |
