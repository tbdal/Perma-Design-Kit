# Roadmap — Perma Design Kit

Offene Punkte. Abgeschlossene Roadmap-Punkte stehen in [`CHANGELOG.md`](CHANGELOG.md).

## jetzt: hier mit [o] abhaken, damit ich sehe, was passiert ist
- [ ] contributor erwähnen
- [o] link zu github neben Impressum mit icon
- [o] Baumscheibe
  - [o] Bewertung edibility, medicinal & material --> jetzt nur edibility nutzen. dafür die 5 streifen oben, gruppe "rating" befüllen
  - [o] plantlist-icon ausblenden
  - [o] raleway schriftart für höhe, breite und Härtegrad nutzen
  -   1x einschub + "m"
  - [o] Maßstab angeben (klein & unscheinbar)
- [o] Produkt-Tour: einführung in webseite für ersten Start: erklärung der funktionen. wie lässt 
  - [o] kannst du vor dem erstem Start eine kurze Erläuterung einblenden, was das permamente Speichern im Browser bedeutet
- [o] eine zweite pdf-version der Baumscheibe, welche maßstabsgetreu in 1:50 die Baumscheibe auf druckbar macht. Der Maßstab soll änderbar sind. Dabei soll die maximale Fläche des Papiers genutzt werden, d.h. die Anordnung der Baumscheiben auf dem Druck so gewählt werden, dass möglichst wenig weiße Fläche übrig bleibt. Ränder wie bisher. Auswahl als A4, A3 und A2 ermöglichen. 
- [o] tabelle als pdf druckbar machen. Auch als zweite Graustufenversion die verschiedenen Kriterien gut unterscheidbar macht
- [o] tabelle: button oder andere funktion damit gefilterte alle für druck (anzahl) auf einmal angepasst werden können
- [o] englische pflanznamen bei englischer ui anzeigen
- [o] besuchsstatistiken, wie? — Antwort: Plausible (schon eingebaut) ist die Lösung, braucht nur ein Konto + Domain-Eintrag auf plausible.io; Alternative Skript entfernen. Entscheidung offen → Punkt „plausible“ unter kurzfristig bleibt

## kurzfristig
- [ ] Durchmesser auf Baumscheibe etwas runterschieben
- [ ] prüfen: Wasser und Sonne sind im SVG nicht vollständig -> psd erneut in svg konvertieren @Andi
- [ ] naturadb anrufen (Anfrage: Erlaubnis für gemeinnützige, nicht-kommerzielle Nutzung der Daten?)
- [ ] Toensmeier: können wir seine Daten dafür nutzen? @Joern
- [ ] spendenbutton: vorschlag machen
- [ ] plausible


## später / Fragen für Präsentation
- [ ] Boden-Dreieck mappen und aktiveren
- [ ] unfarbige Felder in Baumscheibe
- [ ] medicinal & material sinnvoll auf Baumscheibe?
- [ ] plantlist-icon nutzen?
- [ ] erweiterung: essbarkeit: Pflanzenteile (aus PFAF) angeben



- [x] domain permadesignkit.org gekauft
- [x] Tabelle: Baum/Strauch/Krautebene als Spalte und Filter/sortierfunktion
- [x] Zeichen für Baum/Strauch.. ebene -> psd erneut in svg konvertieren
### Debugging
#### Darstellung Scheibe & mapping prüfen
- [ ] testen: **warum wird bei Beinwell Material und Brennstoff aktiviert - wo steht das bei pfaf?** — Zwei getrennte Befunde: **Material ist korrekt** — PFAFs eigenes „Other Uses Rating" für Comfrey/Beinwell steht bei 4 von 5, `material = materialScore > 2` bildet das nur ab. **Brennstoff war ein echter Bug**, jetzt behoben in `plant-proxy-server.mjs`: (1) die `fieldSection`-Extraktion (`/boots[^"]*"[^>]*>…<\/div>/gi`) matchte ungewollt auch die Kette „boots**trap**" aus dem Bootstrap-CDN-Link im `<head>`, wodurch der träge Capture bis zum nächsten `</div>` zig KB unbeteiligter Kopfzeilen-/Script-Inhalte mitriss — gefixt durch `class="boots\d*"[^>]*>…` (erfordert das `class="`-Präfix). (2) Der eigentliche Auslöser für den falschen Wert: `fuel`/`fodder`/`groundCover`/etc. wurden per loser Prosa-Suche (`/\bFuel\b/i` etc.) statt anhand von PFAFs echten Tag-Links geprüft — Comfrey ist bei PFAF nur mit Biomass/Compost/Gum/Dynamic accumulator/Food Forest getaggt, aber der Tooltip-Text des (korrekten) Biomass-Tags lautet „…can be converted into **fuel** etc.", und der Fließtext unter „Landscape Uses" erwähnt beiläufig „**Ground cover**" — beides wurde fälschlich als eigenes Tag erkannt. Fix: `hasUseTag()` prüft jetzt den exakten Anker-Text (`>Fuel</a>`) der zugewiesenen Tags, nicht mehr Fließtext-Vorkommen — geprüft gegen reale PFAF-Seiten (Comfrey, Robinia pseudoacacia, Acer campestre), nicht geraten. `windBreaking`/`animalProtection` bleiben Prosa-basiert (bestätigt: PFAF hat für „Windbreak"/„Living Trellis" gar keine eigene Tag-Kategorie, auch bei klassischen Windschutz-Arten wie Elaeagnus x ebbingei nicht), aber jetzt auf den korrekt eingegrenzten `fieldSection`-Ausschnitt statt den überlaufenden Blob angewandt. Live gegen `/api/plant-proxy` verifiziert: Comfrey liefert jetzt `fuel: false, fodder: false, groundCover: false, material: true, mineralFix: true`; Robinia/Acer weiterhin korrekt `fuel: true`.

#### weitere bugs / validierung
- [ ] limits für abruf bei pfaf

### Baumscheibe Karte Feinschliff
- [ ] Sonne/Wasser-Icons (je 3 Zustände) ergänzen — einzige verbleibende „komplett tot"-Gruppe, siehe `baumscheibe-mapping-status.md`
- [ ] sprache der karten auf ui-sprache einstellen

### sonst
- [ ] lizenzen manuell prüfen & unsere festlegen
- [ ] führung durch die webseite beim ersten aufruf der webseite
- [ ] nutzen prüfen, ist alles vorhanden, was in Baumscheibe angezeigt wird?#
- [ ] polykulturen-tab entwickeln



### PDF Generierung
- [ ] zweite Option: Größen entsprechend Baumdurchmesser

### Launch-Blocker
- [ ] **Plausible-Domain** — `data-domain` in `Layout.astro` auf Custom-Domain anpassen + im Plausible-Dashboard registrieren
- [ ] **Lizenz-Metadaten ergänzen** — `pwa/package.json` fehlt `"license": "MIT"`. Optional: Copyright-Hinweis in `LICENSE`/README erweitern, da die PWA inzwischen eine vollständige Neuentwicklung ist (Original von Sebastian Schucht war die PowerShell-Tooling-Basis in `legacy/`); MIT erlaubt das Rewrite ohne Einschränkung, solange die bestehende Attribution erhalten bleibt

### Lizenz & Datenquellen (Launch-Blocker)
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

### von Opus 
  1. Kein Testnetz. Das Projekt hat bis heute keine Testsuite — jede
  Regression fällt nur auf, wenn ich sie manuell per Playwright suche.
  Bei inzwischen ~10 Seiten und Modulen wie Wachstumsmodell,
  Blob-Geometrie, compatScore, PFAF-Parser wäre eine kleine Vitest-Suite
  für die reinen Funktionen (growth-model.ts, blob-shape.ts, compat.ts,
  plant-layer.ts, CSV-Import) in ~1 Stunde gebaut und würde dauerhaft
  Zeit sparen. Mein klarer Top-Vorschlag.

  2. gartenplan.astro ist mit ~800 Zeilen zu groß geworden — dasselbe
  Muster wie index.astro. Die Renderer sind schon in Libs ausgelagert,
  aber State + Handler liegen alle in einem <script>-Block. Aufteilen
  lohnt sich, bevor es weiter wächst.

  3. PFAF-Parser ist fragil. Wir hatten diese Session schon zwei echte
  Bugs darin (Bootstrap-Regex, Prosa-Matching). Der Parser hat null Tests
  und bricht still, wenn PFAF sein Markup ändert — ein Satz
  gespeicherter HTML-Fixtures plus Tests wäre günstig und würde genau die
  Klasse Fehler abfangen, die uns zweimal getroffen hat.

  4. Datenqualität sichtbar machen. Das Wachstumsmodell, die
  Ebenen-Ableitung und die Formen sind alles Heuristiken. In der Infobox
  steht es, aber in Karten und PDF-Export nicht — ein kleiner Hinweis
  dort wäre ehrlicher, gerade wenn Dritte die Ausdrucke sehen.

  5. Bundle-Größe. Der Build warnt bei jedem Lauf über Chunks >500 kB.
  Three.js und pdf-lib sind bereits lazy, der Rest ist ungeprüft — einmal
  reinschauen lohnt sich, gerade für eine PWA auf dem Handy im Garten.
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
- [ ] Pflanzennamen mehrsprachig (de/en/la)

### Migration PowerShell → PWA
- [ ] PowerShell-Skripte als Legacy markieren
- [ ] Import bestehender `.psd1`-Datensätze

---

## Bekannte Probleme / Tech Debt

| Problem | Status |
|---|---|
| Baumscheibe-SVG-Template 5 MB (inline Base64) | offen — via `svgo` / externe Raster |
| Baumscheibe-SVG: kein Farbkeil für `material`/`fodder`/`fuel` in der "color"-Gruppe (nur 9 von 15 Nutzung/Funktionen-Feldern haben einen) — Tabellendots für diese drei nutzen daher einen Platzhalter-Hex statt einer echten Template-Farbe | offen — User ergänzt die fehlenden Farbkeile im Template |
| GitHub Gist: kein Konflikt-Abgleich beim Pull | offen — siehe Kurzfristig Sync |

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
