import type { Dict } from './core';

/** Labels shared by anything that renders plant detail info — the plant
 *  tiles/table on the Pflanzen page and the Gartenplan's detail panel
 *  (see lib/plant-detail.ts). Kept in one dict so both pages show the same
 *  wording instead of drifting apart in two copies. Merge it into the
 *  page's own dict: createT(pageDict, plantDetailDict). */
export const plantDetailDict: Dict = {
  zoneLabel: { de: 'Zone {zone}', en: 'Zone {zone}' },
  thPhenology: { de: 'Blüte/Frucht', en: 'Bloom/Fruit' },

  badgeEatable: { de: 'Essbarkeit', en: 'Edibility' },
  badgeCulinaric: { de: 'Küche', en: 'Culinary' },
  badgeMeds: { de: 'Gesundheit', en: 'Medicinal' },
  badgeMaterial: { de: 'Materialien', en: 'Materials' },
  badgeFodder: { de: 'Tierfutter', en: 'Fodder' },
  badgeFuel: { de: 'Brennstoff', en: 'Fuel' },
  badgeWood: { de: 'Nutzholz', en: 'Wood' },
  badgeFiber: { de: 'Fasern', en: 'Fiber' },
  badgeOrnamental: { de: 'Ästhetik', en: 'Ornamental' },
  badgeDyes: { de: 'Farbstoff', en: 'Dyes' },
  badgeNitrogenFix: { de: 'Stickstoff-Fixierer', en: 'Nitrogen fixer' },
  badgeMineralFix: { de: 'Mineraliensammler', en: 'Dynamic accumulator' },
  badgeGroundCover: { de: 'Bodendecker', en: 'Ground cover' },
  badgeInsects: { de: 'Insekten', en: 'Invertebrates' },
  badgePest: { de: 'Schädlingsschutz', en: 'Pest control' },
  badgeWindBreaking: { de: 'Windschutz', en: 'Windbreak' },
  badgeAnimalProtection: { de: 'Kleintiere', en: 'Wildlife' },
};
