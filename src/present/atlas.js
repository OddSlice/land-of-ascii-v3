// The glyph atlas: every glyph of src/glyphs.js rasterised once, at the exact
// device-pixel size of a cell, from a monospace font stack. Stored as one
// coverage byte per pixel. Nothing is drawn with fillText after this.
//
// Shade blocks (░ ▒ ▓ █) are checked: many fonts render them solid, as a grey
// smear or as a coarse crosshatch at small sizes. If the font's version is not
// close to the intended dot pattern, it is drawn by hand.
import { GLYPHS, SHADES } from '../glyphs.js';

import { FONT_STACK } from './font.js';
export { FONT_STACK };
export const ATLAS_COLS = 16;

// The intended pattern of a shade block, 1 = ink.
function shadeInk(ch, x, y) {
  switch (ch) {
    case '░': return (y & 1) === 0 && ((x + (y >> 1)) & 1) === 0 ? 1 : 0;
    case '▒': return (x + y) & 1 ? 0 : 1;
    case '▓': return (y & 1) === 0 && ((x + (y >> 1)) & 1) === 0 ? 0 : 1;
    default: return 1;
  }
}

export function buildAtlas(cw, ch) {
  const rowsN = Math.ceil(GLYPHS.length / ATLAS_COLS);
  const W = ATLAS_COLS * cw, H = rowsN * ch;
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, W, H);
  // font size: the font's advance fills the cell's width, its body fits the height
  g.font = `100px ${FONT_STACK}`;
  const adv = g.measureText('M').width || 60;
  const px = Math.max(4, Math.min(cw * 100 / adv, ch * 0.86));
  g.font = `${px}px ${FONT_STACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  for (let i = 0; i < GLYPHS.length; i++) {
    const x = (i % ATLAS_COLS) * cw, y = Math.floor(i / ATLAS_COLS) * ch;
    g.save();
    g.beginPath(); g.rect(x, y, cw, ch); g.clip();
    g.fillText(GLYPHS[i], x + cw / 2, y + ch / 2 + px * 0.04);
    g.restore();
  }
  const img = g.getImageData(0, 0, W, H).data;
  const cov = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) cov[i] = img[i * 4 + 3];

  // check the shade blocks against their intended patterns
  const report = [];
  for (const [chr, want] of Object.entries(SHADES)) {
    const i = GLYPHS.indexOf(chr);
    if (i < 0) continue;
    const x0 = (i % ATLAS_COLS) * cw, y0 = Math.floor(i / ATLAS_COLS) * ch;
    let sum = 0, mid = 0, match = 0;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const c = cov[(y0 + y) * W + x0 + x] / 255;
        sum += c;
        if (c > 0.2 && c < 0.8) mid++;
        if ((c >= 0.5 ? 1 : 0) === shadeInk(chr, x, y)) match++;
      }
    }
    const n = cw * ch, mean = sum / n;
    // good: the right amount of ink, crisp pixels, roughly the intended dots
    const good = Math.abs(mean - want) < 0.08 && mid / n < 0.2 && (want === 1 || match / n > 0.8);
    report.push({ glyph: chr, mean: +mean.toFixed(2), blurry: +(mid / n).toFixed(2), match: +(match / n).toFixed(2), font: good });
    if (!good) {
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) cov[(y0 + y) * W + x0 + x] = shadeInk(chr, x, y) * 255;
    }
  }
  return { cov, width: W, height: H, cw, ch, fontPx: px, report };
}
