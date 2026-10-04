import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { GardenPlan, PlantData } from './types';
import { deriveLayer, PLANT_LAYERS, type PlantLayer } from './plant-layer';
import { downloadPdf, finishPdf } from './pdf-export';

// "Pflanzliste / Einkaufszettel": what to buy for a garden plan — one row per
// plant with the number placed, planting distance (full-grown width) and
// height, optional price per piece (stored in the plan) and totals. Exported
// as CSV (Excel-friendly: UTF-8 BOM, semicolons) or a simple A4 PDF.

export interface ShoppingRow {
  plantId: string;
  name: string;        // common name (or Latin if none)
  latinName: string;
  layer: PlantLayer;
  count: number;
  widthM: number;      // full-grown width = planting distance
  heightM: number;
}

export function shoppingRows(plan: GardenPlan, plantsById: Map<string, PlantData>, displayName: (p: PlantData) => string): ShoppingRow[] {
  const counts = new Map<string, number>();
  for (const pl of plan.placements) counts.set(pl.plantId, (counts.get(pl.plantId) ?? 0) + 1);
  const rows: ShoppingRow[] = [];
  for (const [id, count] of counts) {
    const p = plantsById.get(id);
    if (!p) continue;
    rows.push({ plantId: id, name: displayName(p), latinName: p.latinName, layer: deriveLayer(p), count, widthM: p.widthM || 0, heightM: p.heightM || 0 });
  }
  return rows.sort((a, b) => PLANT_LAYERS.indexOf(a.layer) - PLANT_LAYERS.indexOf(b.layer) || a.name.localeCompare(b.name));
}

export function shoppingTotal(rows: ShoppingRow[], prices: Record<string, number> | undefined): { count: number; cost: number; priced: number } {
  let count = 0, cost = 0, priced = 0;
  for (const r of rows) {
    count += r.count;
    const p = prices?.[r.plantId];
    if (p != null && p > 0) { cost += p * r.count; priced++; }
  }
  return { count, cost, priced };
}

export interface ShoppingLabels {
  plant: string; latin: string; layer: string; count: string; spacing: string; height: string; price: string; sum: string; total: string;
  /** Short column heads for the PDF table. */
  countShort?: string; spacingShort?: string; priceShort?: string; sumShort?: string;
  layerName: (l: PlantLayer) => string;
}

const num = (v: number, lang: string, digits = 2) => v ? new Intl.NumberFormat(lang, { maximumFractionDigits: digits, minimumFractionDigits: 0, useGrouping: false }).format(v) : '';
const money = (v: number, lang: string) => v ? new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(v) : '';

export function shoppingCsv(rows: ShoppingRow[], prices: Record<string, number> | undefined, L: ShoppingLabels, lang: string): string {
  const esc = (s: string) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const lines = [[L.plant, L.latin, L.layer, L.count, L.spacing, L.height, L.price, L.sum].join(';')];
  for (const r of rows) {
    const p = prices?.[r.plantId] ?? 0;
    lines.push([esc(r.name), esc(r.latinName), esc(L.layerName(r.layer)), String(r.count), num(r.widthM, lang), num(r.heightM, lang), money(p, lang), money(p * r.count, lang)].join(';'));
  }
  const t = shoppingTotal(rows, prices);
  lines.push([L.total, '', '', String(t.count), '', '', '', money(t.cost, lang)].join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** A4 portrait table. Helvetica (WinAnsi) covers German umlauts; other
 *  characters are replaced so pdf-lib doesn't throw. */
export async function exportShoppingPDF(title: string, rows: ShoppingRow[], prices: Record<string, number> | undefined, L: ShoppingLabels, lang: string, filename: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF€–—„“”‚‘’…•]/g, '?');
  const W = 595.28, H = 841.89, M = 40;
  const widths = [135, 120, 85, 40, 45, 45, 45];
  const cols = widths.map((w, i) => ({ x: M + widths.slice(0, i).reduce((a, b) => a + b, 0), w }));
  const head = [L.plant, L.latin, L.layer, L.countShort ?? L.count, L.spacingShort ?? L.spacing, L.priceShort ?? L.price, L.sumShort ?? L.sum];
  let page = doc.addPage([W, H]);
  let y = H - M;
  const fit = (s: string, f: typeof font, size: number, w: number) => {
    let t = safe(s);
    while (t.length > 1 && f.widthOfTextAtSize(t, size) > w - 4) t = t.slice(0, -2) + '…';
    return t;
  };
  page.drawText(fit(title, bold, 16, W - 2 * M), { x: M, y, size: 16, font: bold });
  y -= 18;
  page.drawText(safe(new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date())), { x: M, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 22;
  const drawRow = (cells: string[], f: typeof font, shade: boolean) => {
    if (y < M + 20) { page = doc.addPage([W, H]); y = H - M; }
    if (shade) page.drawRectangle({ x: M - 4, y: y - 4, width: W - 2 * M + 8, height: 15, color: rgb(0.94, 0.95, 0.92) });
    cells.forEach((c, i) => {
      const right = i >= 3;
      const t = fit(c, f, 9, cols[i].w);
      const x = right ? cols[i].x + cols[i].w - 4 - f.widthOfTextAtSize(t, 9) : cols[i].x;
      page.drawText(t, { x, y, size: 9, font: f });
    });
    y -= 16;
  };
  drawRow(head, bold, true);
  rows.forEach((r, i) => {
    const p = prices?.[r.plantId] ?? 0;
    drawRow([r.name, r.latinName, L.layerName(r.layer), String(r.count), num(r.widthM, lang), money(p, lang), money(p * r.count, lang)], font, i % 2 === 1);
  });
  const t = shoppingTotal(rows, prices);
  y -= 4;
  drawRow([L.total, '', '', String(t.count), '', '', money(t.cost, lang)], bold, true);
  downloadPdf(await finishPdf(doc, { title, footerMm: 10, footerXMm: 40 * 25.4 / 72, size: 7 }), filename);
}
