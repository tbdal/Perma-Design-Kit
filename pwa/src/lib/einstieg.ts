// How someone wants to use the kit, chosen in the welcome (three ways) or in the settings:
// steers the start dialog after the welcome and the hints on empty pages.
export type Einstieg = 'garten' | 'gemeinsam' | 'beruflich';
const KEY = 'pdk-einstieg';
export const EINSTIEGE: readonly Einstieg[] = ['garten', 'gemeinsam', 'beruflich'];

export function getEinstieg(): Einstieg | null {
  try { const v = localStorage.getItem(KEY) as Einstieg | null; return v && EINSTIEGE.includes(v) ? v : null; } catch { return null; }
}

export function setEinstieg(v: Einstieg): void {
  try { localStorage.setItem(KEY, v); } catch { /* private mode: the choice is just not kept */ }
}
