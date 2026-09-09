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
  // Wachstum — 2.3 template only has one growth-speed icon labeled so far
  // ("speed1", at the growSpeedLow position); growSpeedMid/High have no
  // matching element yet and stay silently unrendered, same as before.
  growSpeedLow:  ['Growth-slow', 'growSpeedLow', 'speed1'],
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
  // Nutzung
  eatable:    ['eatable',   'Edible',   'u_edible'],
  culinaric:  ['culinaric', 'Culinary', 'u_culinary'],
  meds:       ['meds',      'Mecidinal', 'u_medicinal'],
  material:   ['material',  'Material', 'u_material'],
  fodder:     ['fodder',    'Fodder',   'u_fodder'],
  fuel:       ['fuel',      'Fuel',     'u_fuel'],
  // Funktionen
  nitrogenFix:      ['nitrogenFix',      'NitrogenFix',   'f_Nfixer'],
  mineralFix:       ['mineralFix',       'MineralFix',    'f_dynacc'],
  groundCover:      ['groundCover',      'GroundCover',   'f_groundcover'],
  insects:          ['insects',          'Insects',       'f_pollinators'],
  animalProtection: ['animalProtection', 'Animalshelter', 'f_shelter'],
  windBreaking:     ['windBreaking',     'Windbreak',     'f_windbreak2'],
};
