# PSD → SVG mit psd2svg (macOS) – Kurzanleitung

## 1. Installation

```bash
brew install python
```

**Virtuelle Umgebung anlegen** (empfohlen, hält die Installation isoliert vom System-Python):

```bash
mkdir -p ~/psd2svg && cd ~/psd2svg
python3 -m venv venv
source venv/bin/activate
```

Danach psd2svg in diese venv installieren:

```bash
pip install psd2svg
```

> Wichtig: `source venv/bin/activate` muss in **jedem neuen Terminal-Fenster** erneut ausgeführt werden, bevor du `psd2svg`, `python3` oder `pip` aus dieser Anleitung nutzt – sonst landen Befehle im System-Python statt in der venv. Am Prompt erkennst du die aktive venv am vorangestellten `(venv)`.

**Fontconfig-Warnung beheben** (`Fontconfig error: Cannot load default config file`):

```bash
brew install fontconfig
echo 'export FONTCONFIG_PATH="$(brew --prefix)/etc/fonts"' >> ~/.zshrc
source ~/.zshrc
```

## 2. Konvertieren – mit PNG statt WebP und mit Titeln

*(venv aktiv? sonst: `cd ~/psd2svg && source venv/bin/activate`)*

WebP wird von Inkscapes Bild-Decoder oft nicht unterstützt → Bilder erscheinen als rote X-Platzhalter. PNG erzwingen und Layer-Titel aktivieren:

```python
from psd2svg import convert

convert('input.psd', 'output.svg', image_format='png', enable_title=True)
```

> ⚠️ **Versteckte Ebenen werden von psd2svg stillschweigend übersprungen** — bestätigt am 2026-09-21: eine Neukonvertierung von `baumscheibe.psd` hatte nur 83 statt ~178 benannten Ebenen im Output, u.a. fehlten 4 von 5 Kindern der Gruppe „layer" (`l_rhizo`/`l_climber`/`l_herb`/`l_shrub`, nur `l_tree` war in Photoshop sichtbar geschaltet). Diese PSD nutzt versteckte Ebenen systematisch als Mehrfach-Varianten-Speicher (z.B. `growth speed`, `pH`/`pH 2`, `rating`/`rating2`, `layer`) — jeweils nur ein Zustand als Vorschau sichtbar, alle anderen Zustände als Ebene vorhanden, aber ausgeblendet. `convert()`/`SVGDocument.from_psd()` haben **keinen** Parameter, um das zu übersteuern — vor der Konvertierung müssen alle Ebenen per `psd-tools` selbst auf sichtbar gesetzt werden:
>
> ```python
> from psd_tools import PSDImage
> from psd2svg import SVGDocument
>
> psd = PSDImage.open('input.psd')
>
> def force_visible(layer):
>     layer.visible = True
>     if layer.is_group():
>         for child in layer:
>             force_visible(child)
>
> for layer in psd:
>     force_visible(layer)
>
> document = SVGDocument.from_psd(psd, enable_title=True)
> document.save('output.svg', image_format='png')
> ```
>
> Nebeneffekt: die Datei wird dadurch größer, da jetzt alle Varianten-Icons mit eingebettet werden statt nur der sichtbaren.
>
> **Aber Vorsicht — nicht blind alles sichtbar schalten:** ein erster Durchlauf mit obigem Skript (alle Ebenen ohne Ausnahme sichtbar) landete bei `baumscheibe.psd` bei **~50 MB** (statt ~5,7 MB) — der Löwenanteil (~41 MB) kam von 4 einzelnen, unbenutzten Hintergrund-Ebenen (`Hintergrund`, `Hintergrund Kopie`, `Hintergrund Kopie 2`, `Ebene 1`, alle ganzoberflächengroß) plus der Gruppe `add background` (`bg1`/`bg2`/`bg3`) — alle fünf waren in Photoshop bewusst ausgeblendet, tauchen im aktuellen Produktions-Export nicht auf und sind echte Karteileichen, keine Varianten-Zustände. Namentlich ausschließen bringt die Datei auf ~7,7 MB, ohne einen einzigen echten Layer zu verlieren:
>
> ```python
> SKIP_TOP_LEVEL = {'Hintergrund', 'Hintergrund Kopie', 'Hintergrund Kopie 2', 'Ebene 1', 'add background'}
>
> for layer in psd:
>     if layer.name in SKIP_TOP_LEVEL:
>         layer.visible = False
>         continue
>     force_visible(layer)
> ```
>
> PNG-Nachoptimierung (`optipng -o7`) probiert, aber nur ~5 % zusätzliche Ersparnis gebracht — der Aufwand (jedes Bild extrahieren, optimieren, wieder einbetten) lohnt sich hier nicht. Fertige Skripte mit beiden Fixes (versteckte Ebenen UND Karteileichen-Ausschluss) liegen als `psd2svg_skript.py`/`psd2svg2.py` im selben Ordner — bei einer anderen PSD-Datei zuerst per Schritt 5 prüfen, ob es dort ähnliche unbenutzte Ebenen gibt, bevor man `SKIP_TOP_LEVEL` blind übernimmt.

> `enable_title` bei `.save()` direkt hat bei mir einen `TypeError` geworfen – über `convert()` hat es funktioniert. Falls Zweifel an der Signatur bestehen, direkt in der installierten Version nachsehen:
> ```python
> from psd2svg import convert
> help(convert)
> ```

**Sofort prüfen, ob die Titel wirklich drin sind:**

```bash
grep -c '<title' output.svg
```

## 3. Warum Inkscape die Namen trotzdem nicht anzeigt

Inkscapes Objekte-/Ebenen-Panel liest **kein** Standard-`<title>`-Element, sondern ausschließlich sein eigenes `inkscape:label`-Attribut. Ohne Umwandlung bleiben dort generische IDs wie `g60`, `image_53` sichtbar.

```
PSD (Ebenennamen)
   │  psd2svg mit enable_title=True
   ▼
SVG mit <title>-Elementen   ← Namen stecken jetzt in der Datei
   │  add_inkscape_labels.py
   ▼
SVG mit inkscape:label      ← Inkscape zeigt sie jetzt an
```

Prüf-Logik:

- `grep -c '<title'` → **0**: Problem liegt schon bei der Konvertierung (Schritt 2 wiederholen/prüfen), bevor an Schritt 4 gedacht wird.
- `grep -c '<title'` → **> 0**: Namen sind vorhanden, nur die Anzeige fehlt → weiter mit Schritt 4.

## 4. Titel in Inkscape sichtbar machen

*(venv aktiv? sonst: `cd ~/psd2svg && source venv/bin/activate`)*

Skript `add_inkscape_labels.py` (liegt im selben Ordner wie diese Anleitung) kopiert die `<title>`-Texte in `inkscape:label`-Attribute:

```bash
pip install lxml --break-system-packages
python3 add_inkscape_labels.py output.svg output_labeled.svg
```

Anschließend `output_labeled.svg` in Inkscape öffnen – die Ebenennamen aus Photoshop erscheinen dann im Objekte-Panel.

## 5. Vollständigkeit prüfen (PSD-Ebenenbaum vs. SVG-Labels)

*(venv aktiv? sonst: `cd ~/psd2svg && source venv/bin/activate`)*

Nach jeder Neukonvertierung gegenchecken, dass wirklich jede benannte Ebene (inkl. Ordner) im Output gelandet ist — nicht nur "ein paar Titel sind da" annehmen:

```bash
python3 - <<'PYEOF'
from psd_tools import PSDImage
from lxml import etree

# 1) Ground truth aus der PSD: jeder Ebenenname als voller Pfad, plus ob sie
#    überhaupt Pixel hat (leere Ebenen liefert psd2svg absichtlich nicht).
psd = PSDImage.open('input.psd')
psd_paths = []
def walk_psd(layer, path):
    p = path + [layer.name]
    has_pixels = layer.is_group() or layer.has_pixels()
    psd_paths.append(('/'.join(p), has_pixels))
    if layer.is_group():
        for c in layer:
            walk_psd(c, p)
for l in psd:
    walk_psd(l, [])
expected = {p for p, has_pixels in psd_paths if has_pixels}

# 2) Was im gelabelten SVG tatsächlich ankam (inkscape:label je Element).
INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'
tree = etree.parse('output_labeled.svg', etree.XMLParser(huge_tree=True))
svg_paths = []
def walk_svg(el, path):
    label = el.get(f'{{{INKSCAPE_NS}}}label')
    p = path + [label] if label else path
    if label:
        svg_paths.append('/'.join(p))
    for c in el:
        walk_svg(c, p)
walk_svg(tree.getroot(), [])
found = set(svg_paths)

missing = expected - found
print(f'{len(missing)} fehlen von {len(expected)} erwarteten Ebenen:')
for m in sorted(missing):
    print(' ', m)
PYEOF
```

`0 fehlen` = vollständig. Bei Treffern: prüfen, ob es sich um Text-Ebenen handelt (`layer.kind == 'type'`, z.B. Namens-Platzhalter) — die bekommen von `psd2svg` derzeit **kein** `<title>`, sind aber trotzdem als reines `<text>`-Element im SVG vorhanden (mit `grep -o "<text[^>]*>DEIN_TEXT" output.svg` prüfen), nur eben nicht per `inkscape:label` auffindbar. Alles andere, das hier auftaucht, ist ein echter Datenverlust — meist wieder das Versteckte-Ebenen-Problem aus Schritt 2, wenn dort vergessen wurde.

## Troubleshooting-Checkliste

- `pip show psd2svg` → installierte Version prüfen, ggf. `pip install --upgrade psd2svg`
- `psd2svg --help` → tatsächliche CLI-Flags der installierten Version ansehen (Doku online kann abweichen)
- `help(convert)`, `help(SVGDocument.save)`, `help(SVGDocument.from_psd)` → tatsächliche Python-Signaturen prüfen
- Bilder erscheinen als rotes X in Inkscape → `image_format='png'` statt `'webp'` verwenden
- Ebenennamen fehlen in Inkscape → erst `<title>`-Vorhandensein prüfen (Schritt 2), dann `add_inkscape_labels.py` (Schritt 4)