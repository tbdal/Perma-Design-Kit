import type { PlantData } from './types';
import { TEXT_FIELDS, BOOL_FIELDS } from './baumscheibe-mapping';

const TEMPLATE_URL = '/baumscheibe-template.svg';
let templatePromise: Promise<SVGSVGElement> | null = null;

async function loadTemplate(): Promise<SVGSVGElement> {
  if (templatePromise) return templatePromise;
  templatePromise = (async () => {
    const res = await fetch(TEMPLATE_URL);
    if (!res.ok) throw new Error(`Baumscheibe-Template fehlt (${res.status})`);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Template-SVG kann nicht geparst werden');
    return doc.documentElement as unknown as SVGSVGElement;
  })();
  return templatePromise;
}

const INK_NS = 'http://www.inkscape.org/namespaces/inkscape';

function findByLabel(root: Element, labels: string[]): Element[] {
  const out: Element[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const v = el.getAttributeNS(INK_NS, 'label') ?? el.getAttribute('inkscape:label');
    if (v && labels.includes(v)) out.push(el);
  }
  return out;
}

function setText(el: Element, value: string) {
  const tspan = el.querySelector('tspan');
  (tspan ?? el).textContent = value;
}

// commonName / latinName in the SVG template are <image> placeholder rasters,
// not text elements. We hide the placeholder and inject a real <text> element
// at the same bounding-box coordinates (measured from the SVG source).
const NAME_BOXES = {
  commonName: { x: 661, y: 590, w: 975, h: 91, fontSize: 65, italic: false },
  latinName:  { x: 819, y: 435, w: 619, h: 97, fontSize: 55, italic: true  },
} as const;

function injectNameText(svg: SVGSVGElement, field: keyof typeof NAME_BOXES, value: string) {
  const cfg = NAME_BOXES[field];
  for (const el of findByLabel(svg, [field])) el.setAttribute('display', 'none');
  if (!value) return;
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(cfg.x + cfg.w / 2));
  text.setAttribute('y', String(cfg.y + cfg.h * 0.78));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', 'Inter, sans-serif');
  text.setAttribute('font-size', String(cfg.fontSize));
  text.setAttribute('fill', '#000000');
  text.setAttribute('fill-opacity', '0.63');
  if (cfg.italic) text.setAttribute('font-style', 'italic');
  text.textContent = value;
  svg.appendChild(text);
}

function setVisible(el: Element, on: boolean) {
  if (on) el.removeAttribute('display');
  else el.setAttribute('display', 'none');
}

// Fruit/flower month calendar — no template artwork exists for this yet
// (see baumscheibe-mapping-status.md), so it's injected programmatically
// at a fixed position in the free area of the upper dome, right of the
// name text. Two rows of 12 boxes: fruit (red) above flower (pink).
const MONTH_LETTERS = ['J','F','M','A','M','J','J','A','S','O','N','D'];
const CAL = {
  x: 1250, y: 300, cell: 44, gap: 6,
  labelH: 40, rowGap: 8,
};

function injectMonthCalendar(svg: SVGSVGElement, fruitMonths: boolean[], flowerMonths: boolean[]) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(SVG_NS, 'g');

  const addRow = (values: boolean[], rowY: number, activeColor: string, rowLabel: string) => {
    const labelText = document.createElementNS(SVG_NS, 'text');
    labelText.setAttribute('x', String(CAL.x - 14));
    labelText.setAttribute('y', String(rowY + CAL.cell / 2 + 6));
    labelText.setAttribute('text-anchor', 'end');
    labelText.setAttribute('font-family', 'Inter, sans-serif');
    labelText.setAttribute('font-size', '15');
    labelText.setAttribute('fill', '#555555');
    labelText.textContent = rowLabel;
    g.appendChild(labelText);

    values.forEach((active, i) => {
      const x = CAL.x + i * (CAL.cell + CAL.gap);
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(rowY));
      rect.setAttribute('width', String(CAL.cell));
      rect.setAttribute('height', String(CAL.cell));
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', active ? activeColor : '#f0f0f0');
      rect.setAttribute('stroke', '#bbbbbb');
      rect.setAttribute('stroke-width', '1.5');
      g.appendChild(rect);

      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x + CAL.cell / 2));
      label.setAttribute('y', String(rowY + CAL.cell / 2 + 6));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-family', 'Inter, sans-serif');
      label.setAttribute('font-size', '16');
      label.setAttribute('fill', active ? '#ffffff' : '#999999');
      label.textContent = MONTH_LETTERS[i];
      g.appendChild(label);
    });
  };

  const fruitY = CAL.y + CAL.labelH;
  const flowerY = fruitY + CAL.cell + CAL.rowGap;
  addRow(fruitMonths, fruitY, '#e64545', 'Frucht');
  addRow(flowerMonths, flowerY, '#e64ba0', 'Blüte');

  svg.appendChild(g);
}

/** Render a plant into the Baumscheibe SVG template; returns serialized SVG markup. */
export async function renderBaumscheibeSvg(plant: PlantData): Promise<string> {
  const tpl = await loadTemplate();
  const svg = tpl.cloneNode(true) as SVGSVGElement;

  for (const [field, labels] of Object.entries(TEXT_FIELDS)) {
    if (!labels) continue;
    const v = (plant as any)[field];
    const text = v == null || v === '' ? '' : String(v);
    for (const el of findByLabel(svg, labels)) setText(el, text);
  }

  injectNameText(svg, 'commonName', plant.commonName || '');
  injectNameText(svg, 'latinName',  plant.latinName  || '');
  injectMonthCalendar(svg, plant.fruitMonths, plant.flowerMonths);

  for (const [field, labels] of Object.entries(BOOL_FIELDS)) {
    if (!labels) continue;
    const on = !!(plant as any)[field];
    for (const el of findByLabel(svg, labels)) setVisible(el, on);
  }

  // Replace the original "in" units with the viewBox pixel dims so the SVG has
  // an intrinsic size (needed by Firefox when loading via Image for canvas
  // rasterization). HTML embedding scales it via CSS in the wrapper below.
  const vb = svg.getAttribute('viewBox')?.split(/\s+/);
  if (vb && vb.length === 4) {
    svg.setAttribute('width',  vb[2]);
    svg.setAttribute('height', vb[3]);
  } else {
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }

  return new XMLSerializer().serializeToString(svg);
}

/** Card-shaped wrapper around the rendered SVG, matching the cards-view layout. */
export async function renderBaumscheibeCardHtml(plant: PlantData): Promise<string> {
  let svg = await renderBaumscheibeSvg(plant);
  // Inline-scale the SVG to fill its container without affecting its intrinsic
  // size when used elsewhere (e.g. PDF rasterization).
  svg = svg.replace('<svg', '<svg style="width:100%;height:auto;display:block;"');
  return (
    `<div style="width:480px;background:#fff;border:1px solid #ccc;` +
    `border-radius:4px;overflow:hidden;box-sizing:border-box;">${svg}</div>`
  );
}
