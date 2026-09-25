from psd2svg import SVGDocument
from psd_tools import PSDImage

# baumscheibe2.4.psd (2026-09-24, from Andi) — unlike the previous PSD, the
# designer has already set final visibility correctly throughout: layer,
# growth speed, pH 2, rating2, water and light all have their intended
# states directly visible (verified layer-by-layer with psd-tools before
# writing this script, not assumed). No FORCE_VISIBLE_GROUPS hack needed —
# a plain conversion (psd2svg's default "skip hidden layers" behavior)
# already produces exactly the intended output. The genuinely-unused
# groups (Hintergrund*, add background, the old duplicate 'water'/'light'
# bg-2options position, 'soil', 'acronyms (German)', old 'pH'/'rating')
# are hidden in the PSD and get skipped for free by that same default.
psdimage = PSDImage.open("/root/pdk/temp/baumscheibe2.4.psd")
document = SVGDocument.from_psd(psdimage, enable_title=True)
document.save("baumscheibe2.4.svg", image_format="png")
