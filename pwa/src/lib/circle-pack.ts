/** Greedy first-fit circle packing onto fixed-size pages, used by the
 *  scaled Baumscheibe print. Sizes are placed largest-first; each circle
 *  takes the first free spot found scanning the page top-to-bottom,
 *  left-to-right (on a coarse grid), trying existing pages before opening a
 *  new one — so small circles fill the gaps left next to big ones and the
 *  fewest pages / least white space results. Units are arbitrary (mm). */

export interface PackedCircle {
  /** index into the input array */
  index: number;
  page: number;
  /** center, measured from the page's top-left corner */
  cx: number;
  cy: number;
  /** radius actually used (smaller than requested if the circle didn't fit an empty page) */
  r: number;
  shrunk: boolean;
}

export function packCircles(
  diameters: number[],
  pageW: number,
  pageH: number,
  margin: number,
  gap: number,
  step = 3,
): PackedCircle[] {
  const usableW = pageW - 2 * margin;
  const usableH = pageH - 2 * margin;
  const maxR = Math.min(usableW, usableH) / 2;
  const order = diameters.map((d, i) => i).sort((a, b) => diameters[b] - diameters[a]);
  const pages: PackedCircle[][] = [];
  const out: PackedCircle[] = new Array(diameters.length);

  const fits = (page: PackedCircle[], cx: number, cy: number, r: number) => {
    for (const c of page) {
      const dx = c.cx - cx, dy = c.cy - cy, min = c.r + r + gap;
      if (dx * dx + dy * dy < min * min) return false;
    }
    return true;
  };

  for (const idx of order) {
    let r = diameters[idx] / 2;
    const shrunk = r > maxR;
    if (shrunk) r = maxR;
    let placed = false;
    for (let p = 0; p < pages.length && !placed; p++) {
      placed = tryPlace(pages[p], p);
    }
    if (!placed) {
      pages.push([]);
      placed = tryPlace(pages[pages.length - 1], pages.length - 1);
    }

    function tryPlace(page: PackedCircle[], pageNo: number): boolean {
      for (let cy = margin + r; cy <= pageH - margin - r + 1e-6; cy += step) {
        for (let cx = margin + r; cx <= pageW - margin - r + 1e-6; cx += step) {
          if (fits(page, cx, cy, r)) {
            const c: PackedCircle = { index: idx, page: pageNo, cx, cy, r, shrunk };
            page.push(c); out[idx] = c;
            return true;
          }
        }
      }
      return false;
    }
  }
  return out;
}
