# Roadmap — Perma Design Kit

Offene Punkte. Abgeschlossene Roadmap-Punkte stehen in [`CHANGELOG.md`](CHANGELOG.md).

## Prios
- [ ] spendenbutton

## kurzfristig

- [ ] GitHub release fsl
- [ ] Team-Seite / Kooperationen
- [ ] zulip wieder starten: cd /opt/zulip && docker compose start

  ## Fragen
- [ ] Bundessortenamt anfragen, ob die „Gesamtliste Obst“ als Namensliste für die Sortenauswahl übernommen werden darf (vollständigste deutsche Liste, nur als PDF)

## bugs


## APs
### AP4
- [ ] Offene Folgepunkte aus dem Lizenz-Check: EOX-Sentinel (nur nicht-kommerziell), OSM-Kachelserver (geringer Traffic), Edible-Forest-Gardens-Tabelle (keine ausdrückliche Lizenz, schriftliche Erlaubnis einholen) — Details siehe „Lizenz & Datenquellen" unten


## Karten

## Modi & Experten-Repo
- [ ] **Live schalten:** nginx-Konfiguration (`/api/auth/`, `/api/admin/`, `/api/features`, `/x/` mit `auth_request`) nach `/etc/nginx/sites-available/` kopieren, `nginx -t`, reload; `plant-proxy` neu starten; ersten Admin anlegen (`npm run user -- add <name> --admin`); `src/expert/` im Checkout `/root/pdk/pwa` aus `/root/git/pdk-expert.git` klonen
- [ ] **Backup des Bare-Repos** `/root/git/pdk-expert.git` (z. B. nächtliches `git bundle` an einen zweiten Ort)
- [ ] **Einfacher Modus auf weiteren Seiten:** bisher nur der Waldgartenplan; Pflanzenliste (Filter, Tabellen-PDF), Polykulturen und Einstellungen genauso über `data-feature` vereinfachen
- [ ] **Einfacher Modus prüfen:** mit 2–3 Neulingen ausprobieren — reichen die drei Schritte, fehlt etwas (z. B. Flächen für Teich/Beete)?

## Gartenplan Ideen
Vorschläge vom 2026-10-04, nach Nutzen sortiert. Empfehlung: zuerst 1 + 9, dann 2 + 3 als Paket „Standortanalyse“.
- [ ] **Gebäude aus amtlichen 3D-Daten (LoD2):** Dachformen kommen jetzt aus OSM `roof:shape` bzw. geschätzt (Satteldach für Wohnhäuser); genauer wären die LoD2-Modelle der Länder (z. B. NRW offen) — als CityGML-Kacheln aber zu schwer für den Browser, bräuchte serverseitige Aufbereitung
- [ ] **1-m-Gelände für weitere Länder:** bisher NRW, BB/BE, BW, HE, NI, NL. Bayern nur kostenpflichtiger WCS (DGM1 als Download offen), Sachsen/Sachsen-Anhalt lehnen ab (403), TH/SH/MV/RP/SL kein offener WCS gefunden — erneut prüfen oder Kacheln selbst bereitstellen



### Re: FUNKTIONALITÄT
- [x] Durchmesser auf Baumscheibe etwas runterschieben
      
### Re: Calendars

### Re: Polycultures


### Re: RECHTLICH/LIZENZ
- [ ] contributor erwähnen: Jörn, Andi, Jens, Sebastian, pfaf
  - [ ] lizenz
  - [ ] bild
- [x] lizenz auf github: fair-use — FSL-1.1-MIT seit 2026-10-04 (Tag `fsl-start`), Lizenzgeber Andreas + Jörn; Sebastian & Jens nur verlinkt
- [x] Toensmeier: können wir seine Daten dafür nutzen? Anfrage ist raus@Joern: US-Recht verbietet Nutzung der Tabellendaten nicht


## später / Fragen für Präsentation
- [ ] Zirkeldreher-Tool: Prüfen ob wir uns da was abkucken können, v.a. was garden plan angeht
- [x] domain permadesignkit.org gekauft
- [x] Tabelle: Baum/Strauch/Krautebene als Spalte und Filter/sortierfunktion
- [x] Zeichen für Baum/Strauch.. ebene -> psd erneut in svg konvertieren
      
### Debugging
#### Darstellung Scheibe & mapping prüfen

#### weitere bugs / validierung

### Baumscheibe Karte Feinschliff

### sonst

### PDF Generierung

### Launch-Blocker
- [x] **Lizenz-Metadaten ergänzen** (2026-10-04: `"license": "FSL-1.1-MIT"`, NOTICE mit MIT-Hinweis) — `pwa/package.json` fehlt `"license": "MIT"`. Optional: Copyright-Hinweis in `LICENSE`/README erweitern, da die PWA inzwischen eine vollständige Neuentwicklung ist (Original von Sebastian Schucht war die PowerShell-Tooling-Basis in `legacy/`); MIT erlaubt das Rewrite ohne Einschränkung, solange die bestehende Attribution erhalten bleibt

### Lizenz & Datenquellen (Launch-Blocker)
- ⚠ Keine Rechtsberatung, nur technisch-praktische Einschätzung anhand der tatsächlichen Lizenztexte — vor öffentlichem/kommerziellem Launch ggf. kurz von einem Urheberrechtler gegenchecken lassen, insbesondere NaturaDB

### Sync (Feinschliff)

### Polykulturen (Feinschliff)

### Baumscheibe-Karte (Feinschliff)

### UI / UX
- [ ] **Konfigurierbare Farbthemen** — Farbenblindheits-Modus
- [ ] **Bild-Fallback** — Silhouette nach Pflanzentyp wenn kein Foto vorhanden

### Daten
- [ ] Fehlende Felder: Boden-Typ, Ausbreitungsart, Wurzeltiefe

### von Opus 
  1. ✅ erledigt 2026-09-29 (Vitest-Suite, `npm test`; growth-model/blob-shape/compat noch ohne Tests). Kein Testnetz. Das Projekt hatte keine Testsuite — jede
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

  3. ✅ erledigt 2026-09-29 (`server/pfaf-parse.mjs` + Fixtures in `test/fixtures/pfaf/`). PFAF-Parser ist fragil. Wir hatten diese Session schon zwei echte
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
