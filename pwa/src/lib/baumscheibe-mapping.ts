import type { PlantData } from './types';

// Maps PlantData fields to inkscape:label values inside baumscheibe-template.svg.
// Multiple labels per field cover the original code names ("eatable", "phAcid"),
// the renamed Data-field_new variant from baumscheibe3-data-fields.ods
// ("Edible", "PH-acid"), and — since the baumscheibe2.3_inkl-label.svg template
// swap — the raw Photoshop layer names from the psd2svg export ("u_edible",
// "ph2_acid"). Renderer matches any label in the array. The u_*/f_*/ph<N>_*
// correspondence was derived by comparing this template's element positions
// (getBBox) against the previous template's already-correct labels, not by
// guessing from the names — see the "Baumscheibe 2.3" ROADMAP entry.

export const TEXT_FIELDS: Partial<Record<keyof PlantData, string[]>> = {
  // latinName / commonName are handled separately in the renderer —
  // the SVG has image placeholders there, not text elements.
  heightM:     ['heightM',     'Dim-height'],
  widthM:      ['widthM',      'Dim-diameter'],
  climateZone: ['climateZone'],
};

export const BOOL_FIELDS: Partial<Record<keyof PlantData, string[]>> = {
  // Wachstum — the 2.3 template has only one generic growth-speed icon (the
  // "growth speed" group's single image, id "speed1"), not three distinct
  // ones, so it can't distinguish Low/Mid/High individually. Handled by
  // setGrowthSpeedIcon() in baumscheibe-render.ts instead (shown whenever any
  // of the three is true), not through this generic per-field alias list.
  growSpeedLow:  ['Growth-slow', 'growSpeedLow'],
  growSpeedMid:  ['Growth-mod',  'growSpeedMid'],
  growSpeedHigh: ['Growth-fast', 'growSpeedHigh'],
  // Sonne — no per-state elements in the 2.3 template either (still just one
  // generic sun icon); stays unrendered.
  sunFull:       ['Sun-fullsun',   'sunFull'],
  sunMid:        ['Sun-semishade', 'sunMid'],
  sunShadow:     ['Sun-fullshade', 'sunShadow'],
  // Wasser — same limitation as Sonne.
  waterDry:      ['Water-dry', 'waterDry'],
  waterMid:      ['Water-Mid', 'waterMid'],
  waterWet:      ['Water-Wet', 'waterWet'],
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
