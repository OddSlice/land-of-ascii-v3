// The game's name in its own glyph lettering (phase 6), for the title
// screen and the front page: block letters five "pixels" wide and seven
// tall, each pixel two cells wide and one tall (a cell is twice as tall as
// it is wide, so the pixel is square), each cell a glyph from the game's own
// ramp, lit from above in the masonry's cream and shaded toward its foot,
// with a shadow a cell down and to the right. Drawn on a canvas; the page
// carries the name as text for readers that cannot see it.
import { FONT_STACK } from '../present/font.js';

const FONT = {
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  A: ['.111.', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
  N: ['1...1', '11..1', '11..1', '1.1.1', '1..11', '1..11', '1...1'],
  D: ['1111.', '1...1', '1...1', '1...1', '1...1', '1...1', '1111.'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  F: ['11111', '1....', '1....', '1111.', '1....', '1....', '1....'],
  S: ['.1111', '1....', '1....', '.111.', '....1', '....1', '1111.'],
  C: ['.1111', '1....', '1....', '1....', '1....', '1....', '.1111'],
  I: ['11111', '..1..', '..1..', '..1..', '..1..', '..1..', '11111'],
};
const GAP = 2, SPACE = 6;            // columns between letters, and for a space
// the glyphs, brightest first (the game's own ramp, in spirit)
const RAMP = ['@', '#', '%', '&', '=', '+'];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// The size of `lines` in cells.
export function letteringSize(lines) {
  let cols = 0;
  for (const s of lines) {
    let w = 0;
    for (const ch of s) w += ch === ' ' ? SPACE : 10 + GAP;
    cols = Math.max(cols, w - GAP + 1);
  }
  return { cols, rows: lines.length * 8 + (lines.length - 1) };
}

// Draw `lines` on `canvas` at cell width `cw` (pixels; a cell is cw x 2cw),
// in the colours `top` and `foot` (the lit and the shaded masonry by default).
export function drawLettering(canvas, lines, cw, { top = '#e9dcbc', foot = '#8f8574', shadow = 'rgba(0,0,0,0.6)', dpr = 1 } = {}) {
  const { cols, rows } = letteringSize(lines), ch = cw * 2;
  canvas.width = Math.round(cols * cw * dpr); canvas.height = Math.round(rows * ch * dpr);
  canvas.style.width = `${cols * cw}px`; canvas.style.height = `${rows * ch}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.font = `600 ${Math.round(ch * 0.9)}px ${FONT_STACK}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const T = hex(top), B = hex(foot);
  const cells = [];
  lines.forEach((s, li) => {
    const { cols: lw } = letteringSize([s]);
    let x = Math.floor((cols - lw) / 2);
    const y0 = li * 9;
    for (const c of s.toUpperCase()) {
      if (c === ' ') { x += SPACE; continue; }
      const F = FONT[c];
      if (F) for (let r = 0; r < 7; r++) for (let p = 0; p < 5; p++) if (F[r][p] === '1') {
        const above = r > 0 && F[r - 1][p] === '1', left = p > 0 && F[r][p - 1] === '1';
        for (const k of [0, 1]) cells.push({ x: x + p * 2 + k, y: y0 + r, r, edge: !above ? 0 : !left && k === 0 ? 1 : 2 });
      }
      x += 10 + GAP;
    }
  });
  // the shadow, then the letters: each cell filled as the game fills a
  // cell (its colour), its glyph over it a step lighter or darker
  for (const c of cells) { g.fillStyle = shadow; g.fillRect((c.x + 1) * cw, (c.y + 1) * ch, cw + 0.6, ch + 0.6); }
  for (const c of cells) {
    const t = c.r / 6, col = mix(T, B, t), ink = c.edge === 0 ? mix(col, [255, 255, 255], 0.55) : mix(col, [20, 18, 16], 0.38);
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fillRect(c.x * cw, c.y * ch, cw + 0.6, ch + 0.6);
    g.fillStyle = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
    g.fillText(RAMP[Math.min(RAMP.length - 1, c.edge + Math.floor(t * 3))], (c.x + 0.5) * cw, (c.y + 0.55) * ch);
  }
  return { cols, rows };
}
