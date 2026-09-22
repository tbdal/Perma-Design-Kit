from psd2svg import SVGDocument
from psd_tools import PSDImage

# psd2svg silently skips every layer whose Photoshop visibility flag is
# off. That's usually right (invisible = unused), EXCEPT for a specific
# set of groups where this template stores multiple icon *states* as
# siblings with only one shown as a design preview — e.g. "layer"
# (l_rhizo/l_climber/l_herb/l_shrub were hidden, only l_tree visible) or
# "growth speed" (speed2/speed3 hidden, only speed1 visible). Those need
# every child forced visible so the app can toggle them per-plant.
#
# Verified group-by-group (2026-09-21) which hidden-layer groups are this
# "multi-state" pattern vs. something else — do NOT blanket-force every
# hidden layer in the file:
#   - "layer" and "growth speed": genuine multi-state icon sets (only one
#     shown as a design preview) that the app can now select from
#     per-plant — see setLayerIcon()/setGrowthSpeedIcon() in
#     baumscheibe-render.ts. Forced visible below so all states exist to
#     pick from.
#   - "pH 2": also multi-state, but every state was ALREADY visible in the
#     PSD (no forcing needed) — already-working code (BOOL_FIELDS'
#     ph1_v_acid..ph6_v_alk aliases) toggles these individually.
#   - "water"/"light"/"rating2": same multi-state pattern, but NOT forced
#     by this script — each had exactly one extra state pulled out
#     individually with psd-tools (force-composited to confirm it has real
#     pixel content, not an empty placeholder) and spliced by hand into the
#     existing baumscheibe-template.svg, instead of via this whole-script
#     regeneration, to avoid disturbing unrelated hand-tuned positions
#     elsewhere in the template. Done for "rating2" (all 5 stripes,
#     2026-09-21, see setRatingStripe() and CHANGELOG.md) and for
#     "water"/"light" (fullshade2 + wet1 only — one extra state each,
#     spliced at their already-visible sibling's position, 2026-09-22, see
#     setSunIcon()/setWaterIcon() in baumscheibe-render.ts). sunFull/
#     waterDry still have no icon at all in the PSD (any state); the other
#     near-duplicate hidden copies (wet2/humid2, fullshade1/semishade1) are
#     unused. Running this script as-is will NOT reproduce any of these
#     splices — redo them by hand against a newer PSD if needed.
#   - "symbols_functions"/"symbols_uses" (under "symbols") looked like the
#     same pattern but ISN'T: their hidden children (u_edible2, u_tea,
#     u_fodder2/3, u_dye2, u_crafts, f_wind2, f_dynacc2, "Ebene 13",
#     "wind-icon...Kopie") are abandoned draft duplicates sitting in an
#     off-canvas reference area, confirmed by rendering with everything
#     forced visible: they showed up as a stray icon cluster below the
#     card. Left at their original (mostly hidden) visibility.
#   - Whole groups that are themselves hidden and superseded by a visible
#     sibling (pH vs pH 2, rating vs rating2, acronyms (German) — an
#     abandoned alternate design whose internal layer names collide with
#     the real icons', e.g. both have one literally named "e") or are
#     unused draft full-canvas backgrounds (Hintergrund*, Ebene 1, add
#     background) are simply never touched — they stay hidden/excluded by
#     just not being in FORCE_VISIBLE_GROUPS.
#
# If re-running this against an updated PSD, re-verify with a full-canvas
# screenshot render (see psd2svg-anleitung.md step 5) rather than assuming
# this list still matches — Photoshop layers get added/renamed over time.
FORCE_VISIBLE_GROUPS = {'layer', 'growth speed'}

psdimage = PSDImage.open("baumscheibe.psd")


def force_visible(layer):
    layer.visible = True
    if layer.is_group():
        for child in layer:
            force_visible(child)


for layer in psdimage:
    if layer.name in FORCE_VISIBLE_GROUPS:
        force_visible(layer)

# enable_title belongs on from_psd(), not save() — passing it to save() as
# well throws a TypeError in the installed psd2svg version (unexpected
# keyword argument).
document = SVGDocument.from_psd(psdimage, enable_title=True)
document.save("baumscheibe.svg", image_format="png")
