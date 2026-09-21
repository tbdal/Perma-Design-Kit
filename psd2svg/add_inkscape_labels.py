#!/usr/bin/env python3
"""
Kopiert <title>-Texte (z.B. von psd2svg mit enable_title=True) in
inkscape:label-Attribute, damit Inkscape die Original-Ebenennamen
im Objekte-/Ebenen-Panel anzeigt.

Nutzung:≈
    python3 add_inkscape_labels.py input.svg output.svg
"""
import sys
from lxml import etree

SVG_NS = "http://www.w3.org/2000/svg"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"


def add_labels(input_path, output_path):
    etree.register_namespace("inkscape", INKSCAPE_NS)
    # huge_tree=True: base64-embedded images from psd2svg can put a single
    # line/text-node well past lxml's default libxml2 buffer limit, which
    # otherwise raises "Resource limit exceeded" on real (large) exports.
    parser = etree.XMLParser(huge_tree=True)
    tree = etree.parse(input_path, parser)
    root = tree.getroot()

    count = 0
    for title_el in root.iter(f"{{{SVG_NS}}}title"):
        text = (title_el.text or "").strip()
        if not text:
            continue
        parent = title_el.getparent()
        if parent is None:
            continue
        parent.set(f"{{{INKSCAPE_NS}}}label", text)
        count += 1

    tree.write(output_path, xml_declaration=True, encoding="UTF-8", standalone=False)
    print(f"{count} inkscape:label Attribute gesetzt -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 add_inkscape_labels.py input.svg output.svg")
        sys.exit(1)
    add_labels(sys.argv[1], sys.argv[2])
