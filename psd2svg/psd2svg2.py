from psd_tools import PSDImage
from psd2svg import SVGDocument

# convert('baumscheibe.psd', 'baumscheibe.svg', image_format='png', enable_title=True)
# used to be enough, but psd2svg silently skips every hidden layer, and
# this template hides most icon-variant states (only one shown per group
# as a design preview) — but NOT every hidden layer is a "state to
# restore": some are abandoned draft duplicates that should stay hidden.
# See the long comment in psd2svg_skript.py (kept in sync with this file)
# for how FORCE_VISIBLE_GROUPS was derived and verified group-by-group —
# don't blanket-force every hidden layer without re-checking that. Only
# "layer" and "growth speed" have real per-state code wiring today
# (setLayerIcon()/setGrowthSpeedIcon() in baumscheibe-render.ts); "pH 2"
# needs no forcing (already fully visible); water/light/rating2 are left
# at their original single-preview-icon visibility on purpose.
FORCE_VISIBLE_GROUPS = {'layer', 'growth speed'}

psd = PSDImage.open('baumscheibe.psd')


def force_visible(layer):
    layer.visible = True
    if layer.is_group():
        for child in layer:
            force_visible(child)


for layer in psd:
    if layer.name in FORCE_VISIBLE_GROUPS:
        force_visible(layer)

document = SVGDocument.from_psd(psd, enable_title=True)
document.save('baumscheibe.svg', image_format='png')
