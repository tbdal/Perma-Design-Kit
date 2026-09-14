import type { Dict } from './core';

/** Labels shared by anything that renders plant detail info — the plant
 *  tiles/table on the Pflanzen page and the Gartenplan's detail panel
 *  (see lib/plant-detail.ts). Kept in one dict so both pages show the same
 *  wording instead of drifting apart in two copies. Merge it into the
 *  page's own dict: createT(pageDict, plantDetailDict). */
export const plantDetailDict: Dict = {
  zoneLabel: { de: 'Zone {zone}', en: 'Zone {zone}' },
  thPhenology: { de: 'Blüte/Frucht', en: 'Bloom/Fruit' },

  badgeEatable: { de: 'Essbar', en: 'Edible' },
  badgeCulinaric: { de: 'Kulinarisch', en: 'Culinary' },
  badgeMeds: { de: 'Medizin', en: 'Medicinal' },
  badgeMaterial: { de: 'Material', en: 'Material' },
  badgeFodder: { de: 'Futter', en: 'Fodder' },
  badgeFuel: { de: 'Brennstoff', en: 'Fuel' },
  badgeNitrogenFix: { de: 'N-Fix', en: 'N-fix' },
  badgeMineralFix: { de: 'Mineraliensammler', en: 'Mineral accumulator' },
  badgeGroundCover: { de: 'Bodendecker', en: 'Ground cover' },
  badgeInsects: { de: 'Insekten', en: 'Insects' },
  badgeWindBreaking: { de: 'Windschutz', en: 'Windbreak' },
  badgeAnimalProtection: { de: 'Tierschutz', en: 'Animal shelter' },
};
