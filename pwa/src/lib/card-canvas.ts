/**
 * card-canvas.ts
 * Renders plant cards directly onto an HTMLCanvasElement using the 2D API.
 * No external renderer, no CSS parsing, no oklch issues.
 */
import type { PlantData } from './types';
import { displayCommonName } from './plant-name';

const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const C = {
  header:           '#004754',
  fruit:            '#ff0000',
  flower:           '#ff00cc',
  eatable:          '#8bc34a',
  culinaric:        '#e1b2d3',
  meds:             '#f44336',
  material:         '#7b6a58',
  fodder:           '#79c197',
  fuel:             '#fbec53',
  nitrogenFix:      '#95c11f',
  mineralFix:       '#1d71b8',
  groundCover:      '#f39200',
  insects:          '#dedc00',
  pest:             '#c8db85',
  animalProtection: '#b17f4a',
  windBreaking:     '#de87cd',
  windBreakingOnSea:'#b0d0ff',
  sunFull:          '#ffdd00',
  sunMid:           '#ffee66',
  sunShadow:        '#b0bec5',
  waterDry:         '#e8d5b7',
  waterMid:         '#81d4fa',
  waterWet:         '#1565c0',
  waterPlant:       '#006064',
  phVeryAcid:       '#ff5555',
  phAcid:           '#ffd42a',
  phNeutral:        '#00d400',
  phAlkaline:       '#2ca089',
  phVeryAlkaline:   '#0066ff',
  phSaline:         '#7f2aff',
  inactive:         '#e8e8e8',
  border:           '#cccccc',
  text:             '#1a1a1a',
  dim:              '#999999',
};

// ── Primitives ────────────────────────────────────────────────────────────────

function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke = C.border) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, w, h);
  }
}

function badge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, active: boolean, color: string, score?: number | null,
) {
  rect(ctx, x, y, w, h, active ? color : C.inactive);
  ctx.fillStyle = active ? C.text : C.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.floor(h * 0.34);
  ctx.font = `${active ? 'bold ' : ''}${fontSize}px Arial, sans-serif`;
  ctx.fillText(label, x + w / 2, y + h / 2 - (active && score ? h * 0.1 : 0));
  if (active && score) {
    ctx.font = `${Math.floor(h * 0.24)}px Arial, sans-serif`;
    ctx.fillText(String(score), x + w / 2, y + h * 0.78);
  }
}

function monthBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  label: string, active: boolean, color: string,
) {
  rect(ctx, x, y, size, size, active ? color : C.inactive);
  ctx.fillStyle = active ? C.text : C.dim;
  ctx.font = `${Math.floor(size * 0.48)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + size / 2, y + size / 2);
}

/** Draw a small pill label, return its width (including right margin). */
function pill(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  label: string, active: boolean, color: string, lightText = false,
): number {
  const fs = 9;
  ctx.font = `${fs}px Arial, sans-serif`;
  const tw  = ctx.measureText(label).width;
  const pw  = tw + 8;
  const ph  = 14;
  rect(ctx, x, y, pw, ph, active ? color : C.inactive);
  ctx.fillStyle = active ? (lightText ? '#ffffff' : C.text) : C.dim;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + pw / 2, y + ph / 2);
  return pw + 2;
}

function sectionLabel(ctx: CanvasRenderingContext2D, x: number, y: number, label: string) {
  ctx.fillStyle = '#888888';
  ctx.font = '9px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

async function drawImage(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
  x: number, y: number, w: number, h: number,
): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => { ctx.drawImage(img, x, y, w, h); resolve(); };
    img.onerror = () => resolve();
    img.src = dataUrl;
  });
}

// ── Poly card  (280 × 480 px) ─────────────────────────────────────────────────

export async function renderPolyCardToCanvas(
  plant: PlantData,
  imgDataUrl?: string,
): Promise<HTMLCanvasElement> {
  const SCALE = 2;
  const W = 280, H = 480;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  let y = 0;

  // ── Header ──────────────────────────────────────────────────────────────────
  ctx.fillStyle = C.header;
  ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(plant.latinName || '—', 8, 7, W - 16);
  ctx.font = '11px Arial, sans-serif';
  ctx.globalAlpha = 0.85;
  ctx.fillText(displayCommonName(plant), 8, 24, W - 16);
  ctx.globalAlpha = 1;
  y = 44;

  // ── Photo ────────────────────────────────────────────────────────────────────
  const imgH = 128;
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, y, W, imgH);
  if (imgDataUrl) {
    await drawImage(ctx, imgDataUrl, 0, y, W, imgH);
    if (plant.imageCredit) {
      // Attribution strip (CC BY / CC BY-SA need author + license on the print too).
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, y + imgH - 12, W, 12);
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(plant.imageCredit, 4, y + imgH - 6, W - 8);
    }
  } else {
    sectionLabel(ctx, W / 2 - 22, y + imgH / 2, 'Kein Bild');
  }
  y += imgH;

  // ── Info bar ─────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, y, W, 20);
  const infoText = [
    plant.heightM  != null && `H:${plant.heightM}m`,
    plant.widthM   != null && `B:${plant.widthM}m`,
    plant.climateZone      && `Zone ${plant.climateZone}`,
    [plant.growSpeedLow && 'langsam', plant.growSpeedMid && 'mittel', plant.growSpeedHigh && 'schnell']
      .filter(Boolean).join('/'),
  ].filter(Boolean).join('  ');
  ctx.fillStyle = '#555555';
  ctx.font = '9px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(infoText, 8, y + 10, W - 16);
  y += 20;

  // ── Function badges – row 1 ───────────────────────────────────────────────────
  const BS = 38, BG = 2, BX = 4;
  y += 4;
  ([
    ['Eat',  plant.eatable,     C.eatable,   plant.eatableScore],
    ['Cul',  plant.culinaric,   C.culinaric,  null],
    ['Med',  plant.meds,        C.meds,       plant.medsScore],
    ['Mat',  plant.material,    C.material,   plant.materialScore],
    ['Fod',  plant.fodder,      C.fodder,     null],
    ['Fuel', plant.fuel,        C.fuel,       null],
  ] as [string, boolean, string, number | null][]).forEach(([l, a, c, s], i) => {
    badge(ctx, BX + i * (BS + BG), y, BS, BS, l, a, c, s);
  });
  y += BS + 2;

  // ── Function badges – row 2 ───────────────────────────────────────────────────
  ([
    ['N\u2082',  plant.nitrogenFix,      C.nitrogenFix],
    ['Min',      plant.mineralFix,       C.mineralFix],
    ['Grnd',     plant.groundCover,      C.groundCover],
    ['Ins',      plant.insects,          C.insects],
    ['Pest',     plant.pest,             C.pest],
    ['Ani',      plant.animalProtection, C.animalProtection],
  ] as [string, boolean, string][]).forEach(([l, a, c], i) => {
    badge(ctx, BX + i * (BS + BG), y, BS, BS, l, a, c);
  });
  y += BS + 4;

  // ── Wind ─────────────────────────────────────────────────────────────────────
  let wx = 8;
  if (plant.windBreaking) {
    ctx.fillStyle = C.windBreaking;
    ctx.fillRect(wx, y, 38, 14);
    ctx.fillStyle = C.text;
    ctx.font = '9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Wind', wx + 19, y + 7);
    wx += 42;
  }
  if (plant.windBreakingOnSea) {
    ctx.fillStyle = C.windBreakingOnSea;
    ctx.fillRect(wx, y, 54, 14);
    ctx.fillStyle = C.text;
    ctx.font = '9px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Wind (See)', wx + 27, y + 7);
  }
  y += 18;

  // ── Sun ───────────────────────────────────────────────────────────────────────
  sectionLabel(ctx, 8, y + 7, 'Sonne:');
  let px = 52;
  px += pill(ctx, px, y, 'Voll',  plant.sunFull,   C.sunFull);
  px += pill(ctx, px, y, 'Halb',  plant.sunMid,    C.sunMid);
  px += pill(ctx, px, y, 'Schat', plant.sunShadow, C.sunShadow);
  y += 18;

  // ── Water ─────────────────────────────────────────────────────────────────────
  sectionLabel(ctx, 8, y + 7, 'Wasser:');
  px = 58;
  px += pill(ctx, px, y, 'Tro', plant.waterDry,   C.waterDry);
  px += pill(ctx, px, y, 'Mit', plant.waterMid,   C.waterMid);
  px += pill(ctx, px, y, 'Nas', plant.waterWet,   C.waterWet,   true);
  px += pill(ctx, px, y, 'Tei', plant.waterPlant, C.waterPlant, true);
  y += 18;

  // ── pH ────────────────────────────────────────────────────────────────────────
  sectionLabel(ctx, 8, y + 7, 'pH:');
  px = 34;
  px += pill(ctx, px, y, 'vS',  plant.phVeryAcid,     C.phVeryAcid);
  px += pill(ctx, px, y, 'S',   plant.phAcid,          C.phAcid);
  px += pill(ctx, px, y, 'N',   plant.phNeutral,       C.phNeutral);
  px += pill(ctx, px, y, 'A',   plant.phAlkaline,      C.phAlkaline);
  px += pill(ctx, px, y, 'vA',  plant.phVeryAlkaline,  C.phVeryAlkaline, true);
  px += pill(ctx, px, y, 'Sal', plant.phSaline,        C.phSaline,        true);
  y += 18;

  // ── Fruit months ─────────────────────────────────────────────────────────────
  const MBS = 18, MBG = 1;
  y += 3;
  sectionLabel(ctx, 8, y + MBS / 2, 'Frucht:');
  MONTHS.forEach((m, i) => monthBox(ctx, 50 + i * (MBS + MBG), y, MBS, m, plant.fruitMonths[i], C.fruit));
  y += MBS + 2;

  // ── Flower months ─────────────────────────────────────────────────────────────
  sectionLabel(ctx, 8, y + MBS / 2, 'Bl\u00fcte:');
  MONTHS.forEach((m, i) => monthBox(ctx, 50 + i * (MBS + MBG), y, MBS, m, plant.flowerMonths[i], C.flower));

  return canvas;
}

// ── Stripe card  (870 × 50 px) ───────────────────────────────────────────────

export async function renderStripeCardToCanvas(
  plant: PlantData,
  imgDataUrl?: string,
): Promise<HTMLCanvasElement> {
  const SCALE = 2;
  const W = 870, H = 50;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Background + border
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(0, 0, W, H);

  let x = 0;

  // Photo
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 0, H, H);
  if (imgDataUrl) await drawImage(ctx, imgDataUrl, 0, 0, H, H);
  x = H + 1;

  // Name
  ctx.fillStyle = C.header;
  ctx.font = 'bold 11px Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(plant.latinName || '—', x + 6, 7, 140);
  ctx.fillStyle = '#555555';
  ctx.font = '9px Arial, sans-serif';
  ctx.fillText(displayCommonName(plant), x + 6, 21, 140);
  x += 158;

  // Specs
  const specs = [
    plant.heightM != null && `H:${plant.heightM}m`,
    plant.widthM  != null && `B:${plant.widthM}m`,
    plant.climateZone     && `Z:${plant.climateZone}`,
  ].filter(Boolean) as string[];
  ctx.fillStyle = '#555555';
  ctx.font = '9px Arial, sans-serif';
  ctx.textBaseline = 'top';
  specs.forEach((s, i) => ctx.fillText(s, x, 6 + i * 13, 68));
  x += 72;

  // Function dots (22×22)
  const DS = 22, DG = 1;
  const dots: [boolean, string, string][] = [
    [plant.eatable,            C.eatable,          'E'],
    [plant.culinaric,          C.culinaric,         'C'],
    [plant.meds,               C.meds,              'M'],
    [plant.material,           C.material,          'Ma'],
    [plant.fodder,             C.fodder,            'F'],
    [plant.fuel,               C.fuel,              'Br'],
    [plant.nitrogenFix,        C.nitrogenFix,       'N\u2082'],
    [plant.mineralFix,         C.mineralFix,        'Mi'],
    [plant.groundCover,        C.groundCover,       'Gd'],
    [plant.insects,            C.insects,           'In'],
    [plant.pest,               C.pest,              'Ps'],
    [plant.animalProtection,   C.animalProtection,  'An'],
  ];
  const dotY = (H - DS) / 2;
  dots.forEach(([a, c, l], i) => {
    monthBox(ctx, x + i * (DS + DG), dotY, DS, l, a, c);
  });
  x += dots.length * (DS + DG) + 4;

  // Month boxes (16×16, 2 rows)
  const MS = 16, MG = 1;
  const rowY1 = 4, rowY2 = H - MS - 4;
  MONTHS.forEach((m, i) => {
    monthBox(ctx, x + i * (MS + MG), rowY1, MS, m, plant.fruitMonths[i],  C.fruit);
    monthBox(ctx, x + i * (MS + MG), rowY2, MS, m, plant.flowerMonths[i], C.flower);
  });
  x += MONTHS.length * (MS + MG) + 6;

  // Sun / Water pills (tiny)
  ctx.font = '8px Arial, sans-serif';
  let py = 4;
  ([
    [plant.sunFull, C.sunFull, 'Voll', false],
    [plant.sunMid,  C.sunMid,  'Halb', false],
    [plant.sunShadow, C.sunShadow, 'Scha', false],
  ] as [boolean, string, string, boolean][]).filter(([a]) => a).forEach(([a, c, l, lt]) => {
    pill(ctx, x, py, l, a, c, lt);
    x += ctx.measureText(l).width + 12;
  });
  x = H + 158 + 72 + dots.length * (DS + DG) + 4 + MONTHS.length * (MS + MG) + 6; // reset
  py = rowY2;
  ([
    [plant.waterDry,   C.waterDry,   'Tro', false],
    [plant.waterMid,   C.waterMid,   'Mit', false],
    [plant.waterWet,   C.waterWet,   'Nas', true],
    [plant.waterPlant, C.waterPlant, 'Tei', true],
  ] as [boolean, string, string, boolean][]).filter(([a]) => a).forEach(([a, c, l, lt]) => {
    pill(ctx, x, py, l, a, c, lt);
    x += ctx.measureText(l).width + 12;
  });

  return canvas;
}
