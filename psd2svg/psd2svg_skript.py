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
#   - "water"/"light"/"rating2": same multi-state pattern, but deliberately
#     NOT forced — their icon variants (wet1/wet2/humid1/humid2,
#     fullshade1/2/semishade1/2) don't map cleanly 1:1 onto the app's 3
#     sun/water states, and PFAF score-star rendering isn't implemented at
#     all (see ROADMAP). Forcing them visible with no code to select a
#     single state made every variant render simultaneously, overlapping —
#     left at their original single-preview-icon visibility instead
#     (matches the pre-existing template's behavior exactly). Revisit if
#     that mapping/feature gets built.
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
