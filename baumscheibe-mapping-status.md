# Baumscheibe-Feldverknüpfung — Ist-Stand

Testmethode: `renderBaumscheibeSvg()` mit einer vollständig ausgefüllten Testpflanze (alle Booleans `true`, alle Text-/Zahlenfelder gesetzt) über einen Headless-Browser gerendert und das Ergebnis-SVG per `inkscape:label`-Suche ausgewertet — dieselbe Logik, die der Renderer selbst nutzt (`findByLabel()` in `baumscheibe-render.ts`). Ergänzt um eine manuelle Analyse von `baumscheibe-template.svg` (welche `inkscape:label`-Elemente tatsächlich existieren, welchen Element-Typ sie haben, ob sie standardmäßig sichtbar sind).

Quelle für Soll-Zustand: `baumscheibe3-data-fields.ods`, Sheet „baumscheibe3-data-fields".

**Ergebnis in Kurzform:** 23 von 38 PlantData-Feldern werden korrekt gerendert (inkl. Frucht-/Blütemonate, s.u.). 8 Felder sind im Code gemappt, aber im SVG existiert kein passendes Element (Mapping läuft ins Leere — kein Fehler, einfach kein sichtbarer Effekt). 7 Felder haben gar kein Code-Mapping. Mindestens 3 SVG-Icons sind unverknüpft und **immer sichtbar** (nicht ausgeblendet) — beim Test mit einer leeren Pflanze blieben zusätzlich zum bekannten Baum-/Duftverwirrer-/Faser-Icon noch eine zweite Biene und ein Holzscheit sichtbar, die keinem der drei dokumentierten Icons entsprechen; welche Felder das genau sein sollen ist unklar (evtl. die vom ODS-Kommentar erwähnte Aufteilung „mat-construction/mat-fibre" bei `material`, oder ein zweites Insekten-Icon) — nicht weiter untersucht, da außerhalb des aktuellen Auftrags.

## Legende

- ✅ **OK** — SVG-Element vorhanden, Code-Mapping vorhanden, im Test korrekt gerendert
- ⚠️ **Mapping tot** — Code-Mapping vorhanden, aber kein passendes `inkscape:label` im SVG gefunden → Feld hat nie eine sichtbare Wirkung
- ❌ **Kein Mapping** — kein Eintrag in `baumscheibe-mapping.ts`; teils weil im SVG kein Element existiert, teils bewusst zurückgestellt (siehe Kommentar)
- 🖼️ **Icon immer sichtbar** — SVG-Icon existiert, ist nicht an ein Feld gekoppelt und hat kein `display:none` im Template → erscheint auf **jeder** Karte unabhängig von den Pflanzendaten
- — **kein PlantData-Feld** — in der ODS als Konzept genannt, aber nicht im Datenmodell (`types.ts`) umgesetzt

## Identität / Dimensionen / Klima

| data-field | SVG-Element (Typ) | Status | Kommentar |
|---|---|---|---|
| `latinName` | `latinName` (`<image>`, wird durch injizierten `<text>` ersetzt) | ✅ OK | Sonderfall: Platzhalter-Raster wird versteckt, echter `<text>` an fester Position eingefügt (kursiv) |
| `commonName` | `commonName` (`<image>` → `<text>`) | ✅ OK | wie oben, nicht kursiv |
| `heightM` | `heightM` (`<text>`) | ✅ OK | |
| `widthM` | `widthM` (`<text>`) | ✅ OK | |
| `climateZone` | `climateZone` (`<text>`) | ✅ OK | |
| `imageUrl` | — | — n/a | ODS: „NA" — Baumscheibe hat keinen Foto-Slot, nur Poly-/Streifenkarte |
| (Pioneer) | `layer` (`<image>`, raster31) | — kein PlantData-Feld / 🖼️ immer sichtbar | ODS: „fehlt in Code". Icon existiert oben rechts im Kreis, ist nie ausgeblendet |
| `layer` (Ebene/Schicht) | `layer` (s.o., gleiches Icon wie Pioneer?) | — kein PlantData-Feld | Kein `layer`-Feld in `types.ts`; unklar ob Pioneer und Ebene dasselbe Icon teilen sollen |

## Wachstum

| data-field | SVG-Element | Status |
|---|---|---|
| `growSpeedLow` | `Growth-slow` (`<image>`) | ✅ OK |
| `growSpeedMid` | `Growth-mod` (`<image>`) | ✅ OK |
| `growSpeedHigh` | `Growth-fast` (`<image>`) | ✅ OK |

## Sonne — komplett tot

| data-field | Gesuchte Labels | SVG-Element | Status |
|---|---|---|---|
| `sunFull` | `Sun-fullsun` / `sunFull` | nur Gruppe `sun` vorhanden, keine Kind-Elemente mit Label | ⚠️ Mapping tot |
| `sunMid` | `Sun-semishade` / `sunMid` | s.o. | ⚠️ Mapping tot |
| `sunShadow` | `Sun-fullshade` / `sunShadow` | s.o. | ⚠️ Mapping tot |

Die Gruppe `sun` (`<g id="group6">`) existiert als leerer Container — die einzelnen Sonne-Icons wurden nie mit `inkscape:label` versehen.

## Wasser — komplett tot

| data-field | Gesuchte Labels | SVG-Element | Status |
|---|---|---|---|
| `waterDry` | `Water-dry` / `waterDry` | nur Gruppe `water` vorhanden | ⚠️ Mapping tot |
| `waterMid` | `Water-Mid` / `waterMid` | s.o. | ⚠️ Mapping tot |
| `waterWet` | `Water-Wet` / `waterWet` | s.o. | ⚠️ Mapping tot |
| `waterPlant` | — | kein Element | ❌ Kein Mapping (ODS: „NA, für spätere Version") |

Gleiches Bild wie bei Sonne: Gruppe `water` (`<g id="group5">`) ist ein leerer Container.

## Boden-pH — teilweise funktioniert

| data-field | Gesuchte Labels | SVG-Element | Status |
|---|---|---|---|
| `phVeryAcid` | `PH-Veryacid` / `phVeryAcid` | kein Element gefunden | ⚠️ Mapping tot |
| `phAcid` | `phAcid` / `PH-acid` | `phAcid` (`<image>`) | ✅ OK |
| `phNeutral` | `phNeutral` / `PH-neutral` | `phNeutral` (`<image>`) | ✅ OK |
| `phAlkaline` | `phAlkaline` / `PH-alkaline` | `phAlkaline` (`<image>`) | ✅ OK |
| `phVeryAlkaline` | `PH-veralkaline` / `phVeryAlkaline` | kein Element gefunden | ⚠️ Mapping tot |
| `phSaline` | — | kein Element | ❌ Kein Mapping (ODS: „NA, für spätere Version") |

Nur die mittleren drei der ursprünglich geplanten 5 pH-Stufen (ODS Task2: „Grafik in 5 Elemente ändern") existieren im SVG. „Sehr sauer" und „Sehr alkalisch" fehlen als Icons komplett — passend zum ODS-Kommentar, dass diese Erweiterung noch aussteht.

## Nutzung

| data-field | SVG-Element | Status | Kommentar |
|---|---|---|---|
| `eatable` | `eatable` (`<image>`) | ✅ OK | |
| `eatableScore` | — (Gruppe `rating` existiert, ungenutzt) | ❌ Kein Mapping | ODS: 5-Sterne-Grafik geplant, noch nicht verdrahtet |
| `culinaric` | `culinaric` (`<image>`) | ✅ OK | |
| `meds` | `meds` (`<image>`) | ✅ OK | |
| `medsScore` | — (Gruppe `rating`) | ❌ Kein Mapping | s.o. |
| `material` | `material` (`<image>`) | ✅ OK | |
| `materialScore` | — (Gruppe `rating`) | ❌ Kein Mapping | s.o. |
| `fodder` | `fodder` (`<image>`) | ✅ OK | |
| `fuel` | `fuel` (`<image>`) | ✅ OK | |
| *(fibre / Faser)* | `fibre` (`<image>`, raster10) | — kein PlantData-Feld / 🖼️ immer sichtbar | Kein `fibre`-Feld in `types.ts` (nur `material`); Icon im SVG vorhanden, nie ausgeblendet |

## Ökosystem-Funktionen

| data-field | SVG-Element | Status | Kommentar |
|---|---|---|---|
| `nitrogenFix` | `nitrogenFix` (`<image>`) | ✅ OK | |
| `mineralFix` | `mineralFix` (`<image>`) | ✅ OK | |
| `groundCover` | `groundCover` (`<image>`) | ✅ OK | |
| `insects` | `insects` (`<image>`) | ✅ OK | |
| *(pest confuser / Duftverwirrer)* | `duftverwirrer` (`<image>`, raster4) | — kein PlantData-Feld / 🖼️ immer sichtbar | ODS: „vorerst ignorieren"; Icon trotzdem immer sichtbar |
| `pest` | — | kein passendes Element | ❌ Kein Mapping (ODS: „vorerst ignorieren") |
| `animalProtection` | `animalProtection` (`<image>`) | ✅ OK | |
| `windBreaking` | `windBreaking` (`<image>`) | ✅ OK | |
| `windBreakingOnSea` | — | kein Element | ❌ Kein Mapping (ODS: „NA, für spätere Version") |

## Phänologie

| data-field | Status |
|---|---|
| `fruitMonths` | ✅ OK (Ring-Overlay, s.u.) |
| `flowerMonths` | ✅ OK (Ring-Overlay, s.u.) |

**Korrektur (2026-09-08):** Erste Version dieses Dokuments hatte hier fälschlich „kein Ansatzpunkt im Template" behauptet und stattdessen einen komplett neuen Kalender (12 Boxen) frei in der Kuppel platziert. Das war falsch — im unteren Bereich des Templates existieren bereits **zwei konzentrische, handgezeichnete Ringe** genau für diesen Zweck (innerer Ring = Frucht, äußerer Ring = Blüte, je in 12 Segmente unterteilt). Sie tragen nur kein `inkscape:label` und sind Teil des einen großen `background`-Rasterbilds (die ganze Zeichnung ist ein einziges `<image>`, 0 `<path>`-Elemente in der Datei) — deshalb waren sie über `findByLabel()` nicht auffindbar. Bestätigt durch Vergleich von `pwa/public/baumscheibe-template.svg` und der Repo-Root-Datei `baumscheibe3.svg` (identische MD5-Summe, exakt dieselben 40 Labels in beiden).

Da diese Ringe keine einzeln ansteuerbaren Elemente sind, funktioniert das reguläre Label-Mapping hier nicht. Stattdessen legt `injectMonthRing()` (in `baumscheibe-render.ts`) für jeden aktiven Monat ein halbtransparentes Kreisring-Segment (`<path>`, Donut-Ausschnitt) direkt über die vermessene Ringgeometrie:

- Zentrum `(1140, 1130)`, Frucht-Ring `r=860–905`, Blüte-Ring `r=925–995` (Bildkoordinaten des 2286×2482-Viewbox)
- Geometrie wurde nicht geschätzt, sondern per Canvas-Pixel-Sampling aus dem gerenderten Template ermittelt (Radius-Konsistenz über 10 Winkel geprüft, Std-Abw. ~6px bei mean~1023 für die äußere Randlinie) und zusätzlich visuell durch Overlay-Kreise + 12-Teilstriche gegen die echten Tuschestriche/Punkte im Bild verifiziert
- Monat 0 (Jan) bei 180° (links), Monat 11 (Dez) bei ~0° (rechts), Sweep durch 90° (unten) — liest sich links→rechts wie ein normaler Zeitstrahl
- Getestet: realistisches Apfel-Muster (Blüte links, Frucht rechts, beide sauber im jeweiligen Ring), überlappende Testmonate zur Verifikation der Innen/Außen-Zuordnung (Frucht innen, Blüte außen — bestätigt), Leerfall (keine Monate) ohne Crash

**Einschränkung:** Center/Radien sind für *dieses* Template hart codiert (`RING_CENTER`, `FRUIT_RING`, `FLOWER_RING` in `baumscheibe-render.ts`). Wird die Zeichnung in Inkscape neu exportiert oder verschoben, müssen sie neu vermessen werden — im Idealfall bekommen die beiden Ringe dann echte `inkscape:label`-Werte (z.B. `fruitMonths`/`flowerMonths` mit 12 einzeln beschrifteten Segmenten), dann kann dieser Hardcode-Workaround durch reguläres Label-Mapping ersetzt werden.

## Statische/strukturelle SVG-Labels ohne Datenbezug

`?`, `Höhe, Breite`, `Name`, `background`, `functions`, `growthSpeedGroup`, `pH`, `phFrame`, `phText`, `rating`, `soil`, `sun`, `tbd`, `uses`, `water` — Gruppen-Container, Sektionsüberschriften oder Platzhalter ohne eigene Sichtbarkeits-Logik. `tbd` und `?` sind wörtlich unfertige Platzhalter im Template.

---

## Priorisierte Lücken (Vorschlag)

1. **Sonne/Wasser komplett tot** (6 Felder) — größte verbleibende Lücke, da diese Angaben bei jeder Pflanze vorhanden sind. Braucht Icons in Inkscape mit den erwarteten Labels (`Sun-fullsun`/`sunFull` etc.).
2. **Immer sichtbare Geister-Icons** (`layer`, `duftverwirrer`, `fibre` + mind. 2 weitere unklare, s.o.) — zeigen aktuell bei *jeder* Pflanze an, auch wenn die Eigenschaft nicht zutrifft. Schnell behebbar: entweder per Default `display="none"` setzen (bis die Felder verdrahtet sind) oder ans Datenmodell anbinden.
3. **pH-Extremstufen** (`phVeryAcid`, `phVeryAlkaline`) — 2 von 5 fehlen im SVG.
4. **Score-Sterne** (`eatableScore`/`medsScore`/`materialScore`) — Gruppe `rating` existiert als Platzhalter, aber ohne Struktur für 3×5 Sterne.
5. ~~**Fruchtmonate/Blütemonate**~~ — erledigt: programmatisch injizierter Kalender (s. Abschnitt Phänologie oben), da kein SVG-Ansatzpunkt existierte.

Diese Datei spiegelt den Stand von `baumscheibe-template.svg` + `baumscheibe-mapping.ts` zum Testzeitpunkt wider — bei Änderungen am SVG in Inkscape muss sie neu erzeugt werden.
