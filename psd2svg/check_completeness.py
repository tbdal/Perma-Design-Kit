from psd_tools import PSDImage
from lxml import etree

psd = PSDImage.open('/root/pdk/temp/baumscheibe2.4.psd')
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

INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'
tree = etree.parse('baumscheibe2.4_labeled.svg', etree.XMLParser(huge_tree=True))
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
