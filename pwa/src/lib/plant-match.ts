// Names compared for "is this plant already in the list?" when plants come in
// with a shared project or a GeoJSON file: spelling details don't make a
// second entry.

/** Lower case, umlauts and ß folded, accents, quotes, hyphens and extra spaces gone. */
export function tidyName(s: string): string {
  return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['‘’`´"„“”«»‹›]/g, '').replace(/[-‐–—_.,]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
