// Which way someone chose in the welcome (Layout.astro): own garden, together (groups), professional.
// Per device; it picks the start page after the tour and the hints on empty pages, and can be changed
// in Einstellungen → Einstieg und Ansicht.
export type StartPath = 'garten' | 'gemeinsam' | 'profi';
const KEY = 'pdk-path';
const PATHS: StartPath[] = ['garten', 'gemeinsam', 'profi'];

export function getPath(): StartPath | null {
  try { const v = localStorage.getItem(KEY); return PATHS.includes(v as StartPath) ? v as StartPath : null; } catch { return null; }
}

export function setPath(path: StartPath): void {
  try { localStorage.setItem(KEY, path); } catch { /* private window: the choice holds for this visit only */ }
}
