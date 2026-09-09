import type { PlantData } from './types';
import { hasSource } from './types';
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
// not text elements. We hide the placeholder and inject a real <text> element,
// centered horizontally over the same box (measured from the SVG source) but
// using the *original decorative placeholder text's own baseline y* — at the
// template's font-size (125), the old box-height-fraction formula (tuned for
// a much smaller font) sat wrong; the designer's own y for "COMMON NAME" /
// "Botanical name" is the reliable reference for where 125px text belongs in
// the dome. fontFamily likewise matches that placeholder text: Raleway
// (OFL-licensed, loaded via Google Fonts in Layout.astro) for commonName —
// shown uppercase, matching the placeholder's own "COMMON NAME" styling;
// "Voice-of-the-Highlander" for latinName is a DaFont personal-use-only
// script font — not legally embeddable here without buying a commercial
// license from the designer, so it's requested but not loaded, falling back
// to a serif italic that's at least in the spirit of a handwritten label.
const NAME_BOXES = {
  commonName: { x: 661, w: 975, yBaseline: 680.25, fontSize: 125, italic: false, uppercase: true,  fontFamily: "'Raleway', sans-serif" },
  latinName:  { x: 819, w: 619, yBaseline: 522.75, fontSize: 125, italic: true,  uppercase: false, fontFamily: "'Voice-of-the-Highlander', Georgia, serif" },
} as const;

// The template's own placeholder text ("COMMON NAME" / "Botanical name") is
// short and fits comfortably at font-size 125 — real plant names vary wildly
// in length and regularly wouldn't (e.g. "Robinia pseudoacacia var.
// longissima" spills well past the dome's edges at that size). Shrink the
// font just enough to fit the box width, floored at the old pre-2.3 sizes so
// a long name is never worse off than before, using canvas measureText
// rather than SVG layout APIs since this <text> lives in a detached,
// never-attached SVG (getComputedTextLength requires live layout).
const NAME_MIN_FONT_SIZE = { commonName: 65, latinName: 55 } as const;
let measureCtx: CanvasRenderingContext2D | null = null;
function fitFontSize(text: string, fontFamily: string, italic: boolean, maxFontSize: number, minFontSize: number, maxWidth: number): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return maxFontSize;
  const style = italic ? 'italic ' : '';
  measureCtx.font = `${style}${maxFontSize}px ${fontFamily}`;
  const widthAtMax = measureCtx.measureText(text).width;
  if (widthAtMax <= maxWidth) return maxFontSize;
  const scaled = Math.floor(maxFontSize * (maxWidth / widthAtMax));
  return Math.max(minFontSize, scaled);
}

async function injectNameText(svg: SVGSVGElement, field: keyof typeof NAME_BOXES, value: string) {
  const cfg = NAME_BOXES[field];
  for (const el of findByLabel(svg, [field])) el.setAttribute('display', 'none');
  if (!value) return;
  const displayValue = cfg.uppercase ? value.toUpperCase() : value;
  // The Google Fonts <link> only registers the @font-face — the actual file
  // isn't fetched until something on the page needs it, which never
  // otherwise happens since this text lives in a detached SVG, not the DOM.
  // Force it so the font is ready before the SVG gets rasterized to canvas
  // for PDF export (an <img>-decoded SVG can use fonts the page has already
  // loaded, but won't trigger loading them itself) — and before fitFontSize()
  // measures it below, so the measurement uses the real font, not a fallback.
  try { await document.fonts.load(`500 ${cfg.fontSize}px Raleway`); } catch { /* offline first load, falls back gracefully */ }
  const fontSize = fitFontSize(
    displayValue, cfg.fontFamily, cfg.italic, cfg.fontSize, NAME_MIN_FONT_SIZE[field], cfg.w * 0.92,
  );
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', String(cfg.x + cfg.w / 2));
  text.setAttribute('y', String(cfg.yBaseline));
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('font-family', cfg.fontFamily);
  text.setAttribute('font-size', String(fontSize));
  text.setAttribute('fill', '#000000');
  text.setAttribute('fill-opacity', '0.63');
  if (cfg.italic) text.setAttribute('font-style', 'italic');
  text.textContent = displayValue;
  svg.appendChild(text);
}

function setVisible(el: Element, on: boolean) {
  if (on) el.removeAttribute('display');
  else el.setAttribute('display', 'none');
}

// Fruit/flower month calendar. The 2.3 template's "harvest" and "flowering"
// labeled groups each contain one <image> per month, in DOM order by
// angular position around the ring (month 0 = Jan at the left/180°, sweeping
// through the bottom to month 11 = Dec at the right/0° — same convention the
// old hardcoded-arc approach used). Confirmed by measuring each image's
// angle from the ring center (1140, 1130) and checking the order is
// monotonic. "harvest" (fruit) has only 11 images — no April (index 3) icon
// exists in this artwork — while "flowering" has the full 12; matched by
// nearest angle against flowering's evenly-spaced 12 positions.
const HARVEST_MONTH_INDEX = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11];

function setMonthRing(svg: SVGSVGElement, groupLabel: string, months: boolean[], monthIndexByOrder?: number[]) {
  const [group] = findByLabel(svg, [groupLabel]);
  if (!group) return;
  Array.from(group.querySelectorAll('image')).forEach((el, order) => {
    const monthIdx = monthIndexByOrder ? monthIndexByOrder[order] : order;
    if (monthIdx == null) return;
    setVisible(el, !!months[monthIdx]);
  });
}

function injectMonthCalendar(svg: SVGSVGElement, fruitMonths: boolean[], flowerMonths: boolean[]) {
  setMonthRing(svg, 'harvest', fruitMonths, HARVEST_MONTH_INDEX);
  setMonthRing(svg, 'flowering', flowerMonths);
}

/** PFAF's database text is CC BY 4.0, which requires attribution wherever the
 *  data is republished. Placed in the dome's otherwise-empty area, right of
 *  the name text, below the month calendar. */
function injectPfafAttribution(svg: SVGSVGElement) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '1250');
  text.setAttribute('y', '700');
  text.setAttribute('font-family', 'Inter, sans-serif');
  text.setAttribute('font-size', '18');
  text.setAttribute('fill', '#999999');
  text.textContent = 'Daten: PFAF.org (CC BY 4.0)';
  svg.appendChild(text);
}

/** The 2.3 template's "growth speed" group has a single generic icon (not
 *  three distinct Low/Mid/High icons), so it can only show "a growth speed
 *  is known" — visible when any of the three booleans is true. */
function setGrowthSpeedIcon(svg: SVGSVGElement, plant: PlantData) {
  const [group] = findByLabel(svg, ['growth speed']);
  if (!group) return;
  const on = plant.growSpeedLow || plant.growSpeedMid || plant.growSpeedHigh;
  group.querySelectorAll('image').forEach(el => setVisible(el, on));
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

  await injectNameText(svg, 'commonName', plant.commonName || '');
  await injectNameText(svg, 'latinName',  plant.latinName  || '');
  injectMonthCalendar(svg, plant.fruitMonths, plant.flowerMonths);
  setGrowthSpeedIcon(svg, plant);
  if (hasSource(plant, 'pfaf')) injectPfafAttribution(svg);

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
