// Filtering and sorting of the public variety list /baumschule7l (rows from GET /api/beta/baumschule7l).
export interface B7Row { art: string; latin: string; sorte: string; stock: string; pick: string; eat: string; keep: string }
export type B7Col = 'art' | 'sorte' | 'stock' | 'pick' | 'eat' | 'keep';
export const COLS: B7Col[] = ['art', 'sorte', 'stock', 'pick', 'eat', 'keep'];

const MONTHS = ['jan', 'feb', 'mär', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dez'];
const MONTH_WORDS = [/\bjan/, /\bfeb/, /\bm(ä|ae)rz|\bmär/, /\bapr/, /\bmai\b/, /\bjun/, /\bjul/, /\baug/, /\bsep/, /\bokt/, /\bnov/, /\bdez/];

/** What a cell shows ("wie Pflückreife" for an empty Genussreife). */
export const cellText = (r: B7Row, c: B7Col): string => (c === 'eat' ? r.eat || (r.pick ? 'wie Pflückreife' : '') : r[c]);

/** Month columns by the first month named ("Mitte September" → 8), the rest by text; '' = empty. */
function keyOf(r: B7Row, c: B7Col): string | number {
  const t = (c === 'eat' ? r.eat || r.pick : r[c]).trim().toLowerCase();
  if (!t) return '';
  if (c === 'pick' || c === 'eat' || c === 'keep') {
    let best = -1, at = Infinity;
    MONTH_WORDS.forEach((re, i) => { const m = re.exec(t); if (m && m.index < at) { at = m.index; best = i; } });
    if (best >= 0) return best;
    const n = Number(/^\d+/.exec(t)?.[0]);
    if (Number.isFinite(n)) return 100 + n; // "5-6 Monate" after the month names
  }
  return t;
}
void MONTHS;

/** "12 Sorten, 15 Pflanzen": a row is one tree (variety on one rootstock), a variety counts once per species. */
export function countText(rows: B7Row[]): string {
  const sorten = new Set(rows.map(r => `${r.art}|${r.sorte}`.toLowerCase())).size;
  return `${sorten} ${sorten === 1 ? 'Sorte' : 'Sorten'}, ${rows.length} ${rows.length === 1 ? 'Pflanze' : 'Pflanzen'}`;
}

/** Species chip, search over all columns (every word somewhere), column filters (every word in that column). */
export function filterRows(rows: B7Row[], f: { art: string; text: string; cols: Partial<Record<B7Col, string>> }): B7Row[] {
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  const cols = COLS.map(c => [c, (f.cols[c] ?? '').toLowerCase().split(/\s+/).filter(Boolean)] as const).filter(([, w]) => w.length);
  return rows.filter(r => (!f.art || r.art === f.art)
    && words.every(w => `${COLS.map(c => cellText(r, c)).join(' ')} ${r.latin}`.toLowerCase().includes(w))
    && cols.every(([c, ws]) => ws.every(w => cellText(r, c).toLowerCase().includes(w))));
}

/** Sorted by one column (empty cells last either way), ties by species and variety. */
export function sortRows(rows: B7Row[], col: B7Col, dir: 1 | -1): B7Row[] {
  return [...rows].sort((a, b) => {
    const ka = keyOf(a, col), kb = keyOf(b, col);
    if (ka === '' || kb === '') { if (ka !== kb) return ka === '' ? 1 : -1; }
    else {
      const c = typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'de', { numeric: true });
      if (c) return c * dir;
    }
    return a.art.localeCompare(b.art, 'de') || a.sorte.localeCompare(b.sorte, 'de', { numeric: true });
  });
}
