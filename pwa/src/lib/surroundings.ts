// How far around a plan the surroundings are loaded — buildings, terrain margin, forest (Werkstatt #611). Kept per
// device: a phone may want less (faster, less data), a big screen more. Absent = each layer's own standard.
export const SURROUND_KEY = 'pdk-surround-m';
export const SURROUND_STEPS = [150, 300, 600, 1000];

/** The chosen radius in metres, or `standard` when none is chosen. */
export function surroundM(standard: number): number {
  try {
    const v = Number(localStorage.getItem(SURROUND_KEY));
    return SURROUND_STEPS.includes(v) ? v : standard;
  } catch { return standard; }
}
