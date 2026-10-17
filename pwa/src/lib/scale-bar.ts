// Scale bar of the 2D plan: a round length (1, 2 or 5 × 10ⁿ metres) whose bar is at most `maxPx` wide.

/** Largest 1/2/5 × 10ⁿ m that fits into `maxPx` at `pxPerM`; widthPx is the bar's drawn width. */
export function niceScale(pxPerM: number, maxPx = 120): { meters: number; widthPx: number } | null {
  if (!(pxPerM > 0) || !Number.isFinite(pxPerM)) return null;
  const maxM = maxPx / pxPerM;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  const meters = [5, 2, 1].map(f => Math.round(f * pow * 1e6) / 1e6).find(m => m <= maxM) ?? pow;
  return { meters, widthPx: meters * pxPerM };
}

/** "20 cm", "5 m", "2 km" (decimal comma by language). */
export function scaleLabel(meters: number, lang: string): string {
  const n = (v: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 3 }).format(v);
  if (meters >= 1000) return `${n(meters / 1000)} km`;
  if (meters >= 1) return `${n(meters)} m`;
  return `${n(Math.round(meters * 100))} cm`;
}
