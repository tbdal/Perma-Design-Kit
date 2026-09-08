import { createEmptyPlant, type PlantData } from './types';

// Species list for a forest-garden starter set (after Martin Crawford's
// "Creating a Forest Garden"). Only latinName is filled in — deliberately no
// invented heights/pH/scores/etc., since those would be fabricated botanical
// data rather than sourced facts. Use the per-plant "↻ Ergänzen" button
// (fetchProxyData -> PFAF) after import to fill in real values.
const LATIN_NAMES = [
  'Amelanchier alnifolia',
  'Bunias orientalis',
  'Caragana arborescens',
  'Chaenomeles japonica',
  'Corylus avellana',
  'Crataegus monogyna',
  'Cynara cardunculus',
  'Cytisus scoparius',
  'Elaeagnus multiflora',
  'Fagus sylvatica',
  'Halesia carolina',
  'Laurus nobilis',
  'Malus domestica',
  'Mespilus germanica',
  'Morus nigra',
  'Myrica gale',
  'Phormium tenax',
  'Phyllostachys edulis',
  'Prunus avium',
  'Prunus dulcis',
  'Prunus domestica',
  'Prunus domestica insititia',
  'Pyrus communis',
  'Rheum rhabarbarum',
  'Ribes nigrum',
  'Ribes rubrum',
  'Ribes uva-crispa',
  'Ribes x nidigrolaria',
  'Robinia pseudoacacia',
  'Rosa rugosa',
  'Rubus fruticosus',
  'Rubus idaeus',
  'Rubus nepalensis',
  'Rubus pentalobus',
  'Rubus phoenicolasius',
  'Salvia officinalis',
  'Sambucus canadensis',
  'Symphytum officinale',
  'Tilia cordata',
  'Vaccinium corymbosum',
  'Zanthoxylum piperitum',
] as const;

export const crawfordPlants: PlantData[] = LATIN_NAMES.map((latinName, i) => ({
  ...createEmptyPlant(),
  id: `crawford-${i + 1}`,
  latinName,
}));
