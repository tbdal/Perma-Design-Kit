import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { PlantData } from './types';
import { deriveLayer } from './plant-layer';
import { displayCommonName } from './plant-name';
import { downloadPdf } from './pdf-export';

/** Printable plant table (landscape A4). Every criterion has a fixed slot per
 *  row with its own letter code, so the meaning survives black-and-white
 *  printing: present = filled chip with the letter, absent = faint outline.
 *  Color mode additionally fills chips with the criterion's color; grayscale
 *  mode uses only black/gray. */

type Chip = { key: keyof PlantData; code: string; hex: string; label: string };
export interface TablePdfLabels {
  title: string; page: string; name: string; latin: string; layer: string;
  uses: string; functions: string; sun: string; water: string; growth: string;
  bloom: string; fruit: string; legend: string; monthsNote: string; layerNames: Record<'tree' | 'shrub' | 'herb', string>;
  /** label per chip key */
  chip: Record<string, string>;
}

const PAGE = { w: 297, h: 210 }, MARGIN = 8;
const ROW_H = 6.4, CHIP = 4.2, SLOT = 4.7, FONT = 7;
const pt = (mm: number) => mm * 72 / 25.4;

const CHIP_GROUPS = {
  uses: [
    { key: 'eatable', code: 'Es', hex: '#dc330c' }, { key: 'culinaric', code: 'Ku', hex: '#f88a70' },
    { key: 'meds', code: 'Me', hex: '#fa512a' }, { key: 'material', code: 'Ma', hex: '#fb923c' },
    { key: 'fodder', code: 'Fu', hex: '#a3e635' }, { key: 'fuel', code: 'Br', hex: '#f87171' },
  ],
  functions: [
    { key: 'nitrogenFix', code: 'N', hex: '#92d051' }, { key: 'mineralFix', code: 'Mi', hex: '#3cbbe4' },
    { key: 'groundCover', code: 'Bo', hex: '#d4a525' }, { key: 'insects', code: 'In', hex: '#fadb07' },
    { key: 'windBreaking', code: 'Wi', hex: '#c6c6c6' }, { key: 'animalProtection', code: 'Ti', hex: '#ba7010' },
  ],
  sun: [
    { key: 'sunFull', code: 'V', hex: '#fbbf24' }, { key: 'sunMid', code: 'H', hex: '#fb923c' }, { key: 'sunShadow', code: 'S', hex: '#64748b' },
  ],
  water: [
    { key: 'waterDry', code: 'T', hex: '#d97706' }, { key: 'waterMid', code: 'M', hex: '#38bdf8' }, { key: 'waterWet', code: 'F', hex: '#1d4ed8' },
  ],
  growth: [
    { key: 'growSpeedLow', code: '1', hex: '#ef4444' }, { key: 'growSpeedMid', code: '2', hex: '#f59e0b' }, { key: 'growSpeedHigh', code: '3', hex: '#22c55e' },
  ],
} as const satisfies Record<string, readonly Omit<Chip, 'label'>[]>;
type GroupName = keyof typeof CHIP_GROUPS;
const GROUP_ORDER: GroupName[] = ['uses', 'functions', 'sun', 'water', 'growth'];

// Column layout (mm). Chip groups get slot-count × SLOT.
const COLS = {
  name: 44, latin: 44, h: 10, b: 10, layer: 26,
  uses: 6 * SLOT, functions: 6 * SLOT, sun: 3 * SLOT, water: 3 * SLOT, growth: 3 * SLOT, months: 12 * 2.3,
};
const COL_GAP = 1.5;

const hexRgb = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255] as const;
};
const luminance = (h: string) => { const [r, g, b] = hexRgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };

/** Standard PDF fonts only cover WinAnsi — fold anything else to ASCII. */
function pdfText(s: string): string {
  return s.replace(/[–—]/g, '-').replace(/[’‘]/g, "'").replace(/[“”„]/g, '"')
    .replace(/[^\x20-\x7E -ÿ]/g, c => c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?'));
}

function fitText(font: PDFFont, text: string, size: number, maxW: number): string {
  let s = pdfText(text);
  if (font.widthOfTextAtSize(s, size) <= maxW) return s;
  while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > maxW) s = s.slice(0, -1);
  return s + '.';
}

export async function exportPlantTablePDF(plants: PlantData[], grayscale: boolean, L: TablePdfLabels): Promise<void> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const black = rgb(0, 0, 0);
  const gray = (v: number) => rgb(v, v, v);

  const groupLabel: Record<GroupName, string> = { uses: L.uses, functions: L.functions, sun: L.sun, water: L.water, growth: L.growth };
  const legendH = 15, headerH = 9, titleH = 9;
  const rowsPerPage = Math.floor((PAGE.h - 2 * MARGIN - titleH - headerH - legendH) / ROW_H);
  const pageCount = Math.max(1, Math.ceil(plants.length / rowsPerPage));

  // x offsets per column
  const order = ['name', 'latin', 'h', 'b', 'layer', 'uses', 'functions', 'sun', 'water', 'growth', 'months'] as const;
  const x0: Record<string, number> = {};
  let cx = MARGIN;
  for (const k of order) { x0[k] = cx; cx += COLS[k] + COL_GAP; }

  const text = (page: PDFPage, s: string, xMm: number, yTopMm: number, size: number, f: PDFFont, color = black) =>
    page.drawText(pdfText(s), { x: pt(xMm), y: pt(PAGE.h - yTopMm), size, font: f, color });

  const drawChip = (page: PDFPage, xMm: number, yMm: number, c: { code: string; hex: string }, on: boolean) => {
    const y = PAGE.h - yMm - CHIP;
    if (!on) {
      page.drawRectangle({ x: pt(xMm), y: pt(y), width: pt(CHIP), height: pt(CHIP), borderColor: gray(0.82), borderWidth: 0.4 });
      return;
    }
    const fill = grayscale ? gray(0.15) : rgb(...hexRgb(c.hex));
    page.drawRectangle({ x: pt(xMm), y: pt(y), width: pt(CHIP), height: pt(CHIP), color: fill, borderColor: black, borderWidth: 0.4 });
    const light = !grayscale && luminance(c.hex) > 0.6;
    const w = bold.widthOfTextAtSize(c.code, 5.5);
    page.drawText(c.code, { x: pt(xMm + CHIP / 2) - w / 2, y: pt(y + 1.15), size: 5.5, font: bold, color: grayscale || !light ? rgb(1, 1, 1) : black });
  };

  const drawHeader = (page: PDFPage, pageNo: number, yTop: number) => {
    text(page, L.title + (grayscale ? ' (S/W)' : ''), MARGIN, MARGIN + 4, 11, bold);
    const pg = `${L.page} ${pageNo}/${pageCount}`;
    text(page, pg, PAGE.w - MARGIN - font.widthOfTextAtSize(pdfText(pg), 8) * 25.4 / 72, MARGIN + 4, 8, font, gray(0.4));
    const y = yTop + 5.5;
    text(page, L.name, x0.name, y, 7, bold); text(page, L.latin, x0.latin, y, 7, bold);
    text(page, 'H', x0.h, y, 7, bold); text(page, 'B', x0.b, y, 7, bold);
    text(page, L.layer, x0.layer, y, 7, bold);
    for (const g of GROUP_ORDER) text(page, groupLabel[g], x0[g], y, 7, bold);
    text(page, `${L.bloom} / ${L.fruit}`, x0.months, y, 7, bold);
    page.drawLine({ start: { x: pt(MARGIN), y: pt(PAGE.h - yTop - headerH + 1) }, end: { x: pt(PAGE.w - MARGIN), y: pt(PAGE.h - yTop - headerH + 1) }, thickness: 0.7, color: black });
  };

  const drawLegend = (page: PDFPage) => {
    let y = PAGE.h - MARGIN - legendH + 3;
    let x = MARGIN;
    text(page, L.legend, x, y, 6.5, bold);
    x += 14;
    const line: string[] = [];
    for (const g of GROUP_ORDER) {
      const items = (CHIP_GROUPS[g] as readonly { key: string; code: string }[]).map(c => `${c.code} ${L.chip[c.key]}`).join(', ');
      line.push(`${groupLabel[g]}: ${items}`);
    }
    // wrap into two lines
    const half = Math.ceil(line.length / 2);
    const rows = [line.slice(0, half).join('   |   '), line.slice(half).join('   |   ')];
    rows.forEach((r, i) => text(page, r, x, y + i * 3.4, 6, font, gray(0.25)));
    text(page, L.monthsNote, x, y + 6.8, 6, font, gray(0.25));
  };

  for (let pi = 0; pi < pageCount; pi++) {
    const page = pdf.addPage([pt(PAGE.w), pt(PAGE.h)]);
    const top = MARGIN + titleH;
    drawHeader(page, pi + 1, top);
    const slice = plants.slice(pi * rowsPerPage, (pi + 1) * rowsPerPage);
    slice.forEach((p, ri) => {
      const yTop = top + headerH + ri * ROW_H;
      if (ri % 2 === 1) page.drawRectangle({ x: pt(MARGIN), y: pt(PAGE.h - yTop - ROW_H), width: pt(PAGE.w - 2 * MARGIN), height: pt(ROW_H), color: gray(0.95) });
      const baseY = yTop + 4.3;
      text(page, fitText(bold, displayCommonName(p) || p.latinName, FONT, COLS.name * 72 / 25.4), x0.name, baseY, FONT, bold);
      text(page, fitText(italic, p.latinName, FONT, COLS.latin * 72 / 25.4), x0.latin, baseY, FONT, italic, gray(0.25));
      if (p.heightM != null) text(page, String(p.heightM), x0.h, baseY, FONT, font);
      if (p.widthM != null) text(page, String(p.widthM), x0.b, baseY, FONT, font);
      text(page, fitText(font, L.layerNames[deriveLayer(p)], FONT, COLS.layer * 72 / 25.4), x0.layer, baseY, FONT, font);
      const cy = yTop + (ROW_H - CHIP) / 2;
      for (const g of GROUP_ORDER) {
        CHIP_GROUPS[g].forEach((c, i) => drawChip(page, x0[g] + i * SLOT, cy, c, !!p[c.key as keyof PlantData]));
      }
      // bloom (top) / fruit (bottom) mini-calendars, 12 cells each
      const cw = 2.3, ch = 2.1;
      for (let m = 0; m < 12; m++) {
        for (const [row, arr, colHex, gv] of [[0, p.flowerMonths, '#fbbf24', 0.1], [1, p.fruitMonths, '#22c55e', 0.55]] as const) {
          const on = !!arr?.[m];
          const y = PAGE.h - (yTop + 0.9 + row * (ch + 0.3)) - ch;
          page.drawRectangle({
            x: pt(x0.months + m * cw), y: pt(y), width: pt(cw - 0.3), height: pt(ch),
            color: on ? (grayscale ? gray(gv) : rgb(...hexRgb(colHex))) : gray(0.92),
          });
        }
      }
    });
    drawLegend(page);
  }
  downloadPdf(await pdf.save(), grayscale ? 'pflanzentabelle-sw.pdf' : 'pflanzentabelle.pdf');
}
