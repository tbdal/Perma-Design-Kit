# Roadmap — Permaculture Tree Guilds Designer

## Aktueller Stand

Die PWA (`pwa/`) ist der aktive Entwicklungszweig und ersetzt die älteren PowerShell-Skripte. Sie läuft im Browser, speichert Daten lokal (IndexedDB) und kann ohne Installation offline genutzt werden.

### Implementiert

- **Pflanzenverwaltung** — Erstellen, Bearbeiten, Löschen von Pflanzen mit ~50 Attributen (Nutzung, Ökosystemfunktionen, Sonne/Wasser/pH, Wachstum, Blüte-/Fruchtmonate)
- **Pflanzendaten-Import** — Suche via lokale Golden-Master-DB (`plants-db.json`) + Wikidata-API (automatisch bei Import), Anreicherung via PFAF & NaturaDB (Netlify-Proxy)
- **CSV- & JSON-Import/Export** — inkl. CSV-Vorlagen-Download
- **Drei Ansichten** — Kachelansicht, Listenansicht (sortierbar), Kartenansicht; Toggle in der Toolbar
- **Drei Kartenvarianten** — Polykarte (70×120 mm), Streifenkarte (290×17 mm), **Baumscheibe** (SVG-Template mit Field-Mapped Overlays, A4 Hochformat)
- **Suchleiste** — prominent, mit Lupe-Icon, floating Dropdown, Multi-Add, Wikidata/PFAF/NaturaDB-Enrichment direkt beim Import
- **Kartenvorschau** — Live-Vorschau der Pflanzenkarten im Browser
- **PDF-Export** — Polykarten und Streifenkarten via pdf-lib (Auto-Download); Baumscheibe via pdf-lib (Chrome/Safari) bzw. nativem Druckdialog (Firefox); Bulk-PDF aus Selektion
- **Bulk-Operationen** — Auswählen (inkl. Shift-Klick Range), Löschen, Ergänzen, JSON/CSV/PDF-Export ausgewählter Pflanzen
- **Lokale Filter-Chips** — nach Nutzung, Sonne, Wasser, pH, Vollständigkeit; AND-Logik, persistent
- **Feldprovenenz** — `_sources` pro Datenpunkt; Quell-Badges im Edit-Dialog; Outline-Chips in Kacheln/Liste
- **Tastatur-Shortcuts** — `/` Suche, `n` Neue Pflanze, `g/l/c` View-Wechsel, `?` Cheatsheet
- **Einstellungsseite** — sechs Sektionen: Datenquellen, Ansicht, Theme, Privatsphäre, Daten, **Sync**
- **Dark Mode** — 3-State-Toggle (Auto/Hell/Dunkel), Pre-Paint-Inline-Skript (kein Light-Flash)
- **Plausible Analytics** — cookieless, EU-gehostet; In-App-Opt-out
- **Rechtliches** — Datenschutz, Impressum (Stub), Hilfe/Glossar, Footer
- **PWA-Install-Prompts** — Android Banner + iOS Safari Popup
- **UI-Redesign** — Kacheln mit Bild/Akzentstreifen/Vollständigkeitsbalken, Listenansicht sortierbar, leerer Zustand mit CTA
- **Polykulturen MVP** — `/Polykulturen` Seite mit Editor, Rollen-Slots, mechanischen Vorschlägen aus eigenem Bestand (`compatScore` Sonne/Wasser/pH), kuratierte `role-suggestions.json` (6 Rollen), Internet-Import direkt aus dem Vorschlagspanel
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
### Baumscheibe Karte Feinschliff
- [ ] SVG neu generieren mit anpassungen in baumscheibe3-data-fields.ods --> python-skript existiert nun.
- [ ] Schriftarten im SVG anpassen entsprechend PSD
- [ ] Code anpassen analog baumscheibe3-data-fields.ods

### PDF Generierung
- [ ] Größen anpassen: 6 Baumscheiben pro Seite, 9cm Durchmesser
- [ ] zweite Option: Größen entsprechend Baumdurchmesser

### Sprache
- [ ] Übersetzung auf Englisch

### Launch-Blocker
- [ ] **Impressum füllen** — aktuell Stub; vor öffentlichem Launch nach §5 TMG ergänzen
- [ ] **Plausible-Domain** — `data-domain` in `Layout.astro` auf Custom-Domain anpassen + im Plausible-Dashboard registrieren
- [ ] **Lizenz-Metadaten ergänzen** — `pwa/package.json` fehlt `"license": "MIT"`. Optional: Copyright-Hinweis in `LICENSE`/README erweitern, da die PWA inzwischen eine vollständige Neuentwicklung ist (Original von Sebastian Schucht war die PowerShell-Tooling-Basis in `legacy/`); MIT erlaubt das Rewrite ohne Einschränkung, solange die bestehende Attribution erhalten bleibt

### Sicherheit (Launch-Blocker)
- [x] **Stored-XSS beim `innerHTML`-Rendering fixen** — `escapeHtml()` aus `pdf-export.ts` nach `src/lib/html.ts` verschoben und an allen Stellen angewendet, die Pflanzen-/Gilden-Nutzerdaten (`commonName`, `latinName`, `imageUrl`, `climateZone`, Gildenname/-beschreibung, Such-Ergebnislabels, API-Key-Feld) in `innerHTML`-Template-Strings rendern (`index.astro`, `gilden.astro`, `cards.astro`, `kalender.astro`, `settings.astro`, `card-html.ts`). Die Baumscheibe-Karte (`baumscheibe-render.ts`) war bereits sicher (`textContent` + `XMLSerializer`). Mit Playwright gegen einen `"><img src=x onerror=alert('XSS')>`-Payload über alle Ansichten (Grid/Liste/Karten, `/`, `/gilden`, `/cards`, `/kalender`) verifiziert — kein Alert, Payload erscheint nur als Text.
- [x] **Credentials in Einstellungen maskieren** — WebDAV-Passwort und GitHub-PAT waren im Code bereits `type="password"`; zusätzlich das API-Key-Feld der Datenquellen (`settings.astro`) gegen Attribut-Escape durch `"` im Wert abgesichert. localStorage bleibt weiterhin Klartext (siehe PocketBase-Option unter Langfristig für eine serverseitige Lösung).

### Lizenz & Datenquellen (Launch-Blocker)
- [x] **NaturaDB-Scraping vorerst deaktiviert** — `netlify/functions/plant-proxy.mts` scraped `naturadb.de` ohne erkennbare Lizenz für die redaktionelle Pflanzendatenbank (Nutzungsbedingungen regeln nur nutzergenerierte Inhalte). `robots.txt` enthält einen expliziten `User-agent: Datenbank Crawler` → `Disallow: /`-Eintrag als klares Anti-Scraping-Signal, Betreiber ist die kommerzielle Maseto GmbH. Ohne Lizenz greift das deutsche Datenbankherstellerrecht (§ 87a ff. UrhG) — Abmahnrisiko real, besonders da der Scraping-Code öffentlich auf GitHub liegt. `fetchNaturaDb()` gibt jetzt hart `{}` zurück (`NATURADB_ENABLED = false`), unabhängig vom Settings-Toggle; Default-Quelle in `settings.ts` auf `enabled: false` gesetzt. **Möglichkeit für später:** aktiv Erlaubnis/API-Zugang bei NaturaDB einholen und `NATURADB_ENABLED` wieder auf `true` setzen — bis dahin bleibt die Quelle aus
- [x] **PFAF-Attribution auf den Karten ergänzt** — `hasSource(plant, 'pfaf')` (neu in `types.ts`) prüft, ob die Pflanze überhaupt PFAF-Felder enthält; nur dann erscheint „Daten: PFAF.org (CC BY 4.0)". Poly-Karte: Fußzeile unter den Blütemonaten. Streifenkarte: eigene feste Spalte am rechten Rand (nicht in der per Ellipsis gekürzten Namens-Zeile — dort wäre sie bei langen Pflanzennamen unsichtbar geworden, per Playwright-Test verifiziert). Baumscheibe: kleiner Text im freien Kuppel-Bereich unter dem Namen (`injectPfafAttribution()`). Getestet mit/ohne PFAF-Quelle auf allen drei Kartentypen plus Leerfall-Regression
- [ ] **Impressum-Lizenzangabe korrigieren** — nennt fälschlich „PFAF: CC BY-NC-SA 4.0"; tatsächliche Lizenz der Datenbank-Texte ist CC BY 4.0 (NC-SA 3.0 gilt nur für Website-Bilder, die gar nicht kopiert werden)
- [ ] **Offenes Proxy-Relay schließen** — `plant-proxy.mts` hat `Access-Control-Allow-Origin: *` und kein Rate-Limiting; jede fremde Website kann die Funktion aktuell als kostenlosen Scraping-Relay für PFAF/NaturaDB zweckentfremden (vergrößert das Zugriffsvolumen, für das wir verantwortlich sind, über die eigene App-Nutzung hinaus). Siehe auch „Bekannte Probleme" unten
- ⚠ Keine Rechtsberatung, nur technisch-praktische Einschätzung anhand der tatsächlichen Lizenztexte — vor öffentlichem/kommerziellem Launch ggf. kurz von einem Urheberrechtler gegenchecken lassen, insbesondere NaturaDB

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
- [ ] UI auf Englisch lokalisieren
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
| Netlify-Proxy kein Rate-Limiting | offen — zusätzlich: `Access-Control-Allow-Origin: *` erlaubt jeder fremden Seite, die Funktion als kostenlosen Scraping-Relay zu nutzen |
| Netlify-Proxy: PFAF-Parsing via Regex auf rohem HTML | offen — bricht lautlos (leere Felder, kein Fehler) sobald sich das Markup der Zielseite ändert. NaturaDB-Parsing-Code existiert noch (`fetchNaturaDb()`), ist aber via `NATURADB_ENABLED = false` deaktiviert (siehe „Lizenz & Datenquellen" oben) |
| Baumscheibe-SVG-Template 5 MB (inline Base64) | offen — via `svgo` / externe Raster |
| GitHub Gist: kein Konflikt-Abgleich beim Pull | offen — siehe Kurzfristig Sync |
| Backup-Restore ignorierte Polykulturen in allen pull/import-Pfaden | ✅ behoben — `importGuilds()` in `db.ts`, alle vier Restore-Handler in `settings.astro` |
