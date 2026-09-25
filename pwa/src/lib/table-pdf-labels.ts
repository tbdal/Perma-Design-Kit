import type { Lang } from './i18n/core';
import type { TablePdfLabels } from './table-pdf';

/**
 * Shared TablePdfLabels builder for exportPlantTablePDF(), used identically
 * by index.astro's table view and kalender.astro (roadmap: "Tabellenansicht
 * ... genauso diese Tabellendruckfunktion im Kalender-Ansicht einfügen" —
 * literally the same export, not a calendar-specific redesign). Kept here
 * instead of duplicated per-page i18n dict entries, since these ~30 labels
 * belong to the table-PDF layout itself, not either page's own UI text.
 */
export function buildTablePdfLabels(lang: Lang): TablePdfLabels {
  const de = lang !== 'en';
  const pick = (deText: string, enText: string) => (de ? deText : enText);
  return {
    title: pick('Pflanzentabelle — Perma Design Kit', 'Plant table — Perma Design Kit'),
    page: pick('Seite', 'Page'),
    name: pick('Name', 'Name'),
    latin: pick('Lateinisch', 'Latin'),
    layer: pick('Ebene', 'Layer'),
    uses: pick('Nutzung', 'Uses'),
    functions: pick('Funktionen', 'Functions'),
    sun: pick('Sonne', 'Sun'),
    water: pick('Wasser', 'Water'),
    growth: pick('Wuchs', 'Growth'),
    bloom: pick('Blüte', 'Bloom'),
    fruit: pick('Frucht', 'Fruit'),
    legend: pick('Legende:', 'Legend:'),
    monthsNote: pick('Blüte: obere Reihe, Frucht: untere Reihe · H/B in m', 'Bloom: top row, fruit: bottom row · H/W in m'),
    layerNames: {
      tree: pick('Baum', 'Tree'),
      shrub: pick('Strauch', 'Shrub'),
      herb: pick('Kraut/Bodendecker', 'Herb/groundcover'),
    },
    chip: {
      eatable: pick('Essbarkeit', 'Edibility'),
      culinaric: pick('Küche', 'Culinary'),
      meds: pick('Gesundheit', 'Medicinal'),
      material: pick('Materialien', 'Materials'),
      fodder: pick('Tierfutter', 'Fodder'),
      fuel: pick('Brennstoff', 'Fuel'),
      wood: pick('Nutzholz', 'Wood'),
      fiber: pick('Fasern', 'Fiber'),
      ornamental: pick('Ästhetik', 'Ornamental'),
      dyes: pick('Farbstoff', 'Dyes'),
      nitrogenFix: pick('Stickstoff-Fixierer', 'Nitrogen fixer'),
      mineralFix: pick('Mineraliensammler', 'Dynamic accumulator'),
      groundCover: pick('Bodendecker', 'Ground cover'),
      insects: pick('Insekten', 'Invertebrates'),
      pest: pick('Schädlingsschutz', 'Pest control'),
      windBreaking: pick('Windschutz', 'Windbreak'),
      animalProtection: pick('Kleintiere', 'Wildlife'),
      sunFull: pick('Volle Sonne', 'Full sun'),
      sunMid: pick('Halbschatten', 'Partial shade'),
      sunShadow: pick('Schatten', 'Shade'),
      waterDry: pick('Trocken', 'Dry'),
      waterMid: pick('Mittel', 'Medium'),
      waterWet: pick('Nass', 'Wet'),
      growSpeedLow: pick('Langsam', 'Slow'),
      growSpeedMid: pick('Mittel', 'Medium'),
      growSpeedHigh: pick('Schnell', 'Fast'),
    },
  };
}
