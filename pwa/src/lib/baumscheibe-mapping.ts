import type { PlantData } from './types';

// Maps PlantData fields to inkscape:label values inside baumscheibe-template.svg.
// Multiple labels per field cover the original code names ("eatable", "phAcid"),
// the renamed Data-field_new variant from baumscheibe3-data-fields.ods
// ("Edible", "PH-acid"), and — since the baumscheibe2.3_inkl-label.svg template
// swap — the raw Photoshop layer names from the psd2svg export ("u_edible",
// "ph2_acid"). Renderer matches any label in the array. The u_*/f_*/ph<N>_*
// correspondence was derived by comparing this template's element positions
// (getBBox) against the previous template's already-correct labels, not by
// guessing from the names — see CHANGELOG.md "SVG neu generiert:
// baumscheibe2.3_inkl-label.svg".

export const TEXT_FIELDS: Partial<Record<keyof PlantData, string[]>> = {
  // latinName / commonName are handled separately in the renderer —
  // the SVG has image placeholders there, not text elements.
  heightM:     ['heightM',     'Dim-height'],
  widthM:      ['widthM',      'Dim-diameter'],
  climateZone: ['climateZone'],
};

export const BOOL_FIELDS: Partial<Record<keyof PlantData, string[]>> = {
  // Wachstum — the template's "growth speed" group actually has three
  // distinct icons (speed1/speed2/speed3, only one shown as a design
  // preview in the PSD) — as of the 2026-09-21 reconversion all three are
  // included and individually selected by setGrowthSpeedIcon() in
  // baumscheibe-render.ts (via deriveLayer()-style logic, not this generic
  // alias list — the labels below are legacy/aspirational and don't match
  // the real speed1/2/3 layer names, kept only so a hand-relabeled future
  // template revision using these names would work without a code change).
  growSpeedLow:  ['Growth-slow', 'growSpeedLow'],
  growSpeedMid:  ['Growth-mod',  'growSpeedMid'],
  growSpeedHigh: ['Growth-fast', 'growSpeedHigh'],
  // Sonne/Wasser — checked directly against baumscheibe-template.svg: the
  // "light" and "water" groups each contain exactly one <image>, labeled
  // "semishade2" and "humid1" respectively — no fullsun/fullshade/dry/wet
  // variants exist in this artwork (unlike growth speed's speed1/2/3, these
  // were never split out). That single icon does depict a specific,
  // identifiable state though — semi-shade and medium/humid moisture — so
  // it's mapped to sunMid/waterMid and shown only for that state.
  // sunFull/sunShadow/waterDry/waterWet have no corresponding icon in the
  // template and stay unrenderable until the designer adds them.
  sunMid:    ['semishade2', 'Sun-semishade', 'sunMid'],
  waterMid:  ['humid1',     'Water-Mid',     'waterMid'],
  // pH — 2.3 template numbers all 5 states (ph1_v_acid..ph6_v_alk, skipping 4),
  // newly enabling phVeryAcid/phVeryAlkaline which had no element before.
  phVeryAcid:     ['PH-Veryacid',    'phVeryAcid',   'ph1_v_acid'],
  phAcid:         ['phAcid',         'PH-acid',      'ph2_acid'],
  phNeutral:      ['phNeutral',      'PH-neutral',   'ph3_neutral1'],
  phAlkaline:     ['phAlkaline',     'PH-alkaline',  'ph5_alk'],
  phVeryAlkaline: ['PH-veralkaline', 'phVeryAlkaline', 'ph6_v_alk'],
  // Nutzung — the trailing single/short label ('e', 'cul', 'med', …) is the
  // color-wedge fill behind the icon (2.3 template's "color" group), added so
  // hiding a field hides its background color along with the icon, not just
  // the icon on its own. Each verified unique in the template (grep count 1).
  eatable:    ['eatable',   'Edible',    'u_edible',    'e'],
  culinaric:  ['culinaric', 'Culinary',  'u_culinary',  'cul'],
  meds:       ['meds',      'Mecidinal', 'u_medicinal', 'med'],
  material:   ['material',  'Material',  'u_material'],
  fodder:     ['fodder',    'Fodder',    'u_fodder'],
  fuel:       ['fuel',      'Fuel',      'u_fuel'],
  // Funktionen — same color-wedge aliases where the "color" group has one.
  nitrogenFix:      ['nitrogenFix',      'NitrogenFix',   'f_Nfixer',      'n+'],
  mineralFix:       ['mineralFix',       'MineralFix',    'f_dynacc',      'da'],
  groundCover:      ['groundCover',      'GroundCover',   'f_groundcover', 'gc'],
  insects:          ['insects',          'Insects',       'f_pollinators', 'i'],
  animalProtection: ['animalProtection', 'Animalshelter', 'f_shelter',     'sh'],
  windBreaking:     ['windBreaking',     'Windbreak',     'f_windbreak2',  'w'],
};
