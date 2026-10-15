// The front page (phase 6): the name in the game's lettering, the title
// screen's stone frame round the picture and the words (after 0.6.2: the
// same drawing, src/app/title.js), the menu's icons, and the pictures,
// each a frame the game drew, saved as its cells
// (tools/front.mjs) and drawn here once, cell by cell, as the game draws a
// cell: its colour, its glyph in its ink. No game is loaded and nothing
// runs after the pictures are drawn (they are drawn again only if the page
// is resized enough to change their size).
//
// ?og=1: the share image instead (1200 x 630), for tools/front.mjs --og.
import { drawLettering, letteringSize } from '../app/lettering.js';
import { drawFrame } from '../app/title.js';
import { icon } from '../app/icons.js';
import { FONT_STACK } from '../present/font.js';

const $ = (s) => document.querySelector(s);
const OG = /[?&]og=1/.test(location.search);

async function load() {
  const el = document.getElementById('data');
  if (el && el.textContent.trim().startsWith('{')) return JSON.parse(el.textContent);
  return (await fetch('/src/front/data.json')).json();     // (served from src/)
}
async function cellsOf(b64) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const out = await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  return new Uint8Array(out);
}
// cells (7 bytes each: background r g b, glyph, ink r g b) at cell width cw
function drawCells(canvas, cells, cols, rows, cw, glyphs, dpr = 1) {
  const ch = cw * 2;
  canvas.width = Math.round(cols * cw * dpr); canvas.height = Math.round(rows * ch * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.font = `${(ch * 0.92).toFixed(2)}px ${FONT_STACK}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const o = (y * cols + x) * 7;
    g.fillStyle = `rgb(${cells[o]},${cells[o + 1]},${cells[o + 2]})`;
    g.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
    const gl = glyphs[cells[o + 3]];
    if (gl && gl !== ' ') { g.fillStyle = `rgb(${cells[o + 4]},${cells[o + 5]},${cells[o + 6]})`; g.fillText(gl, (x + 0.5) * cw, (y + 0.55) * ch); }
  }
}

// The stone frame round the stage: whole cells about 8 px wide, so it
// meets the stage's edges, and the stage as tall as whole rows.
function frameStage(dpr) {
  const st = $('.stage'), c = $('.stage > .frame');
  st.style.minHeight = '';
  const w = st.clientWidth, cols = Math.max(12, Math.round(w / 8)), cw = w / cols;
  const rows = Math.ceil(st.offsetHeight / (2 * cw));
  st.style.minHeight = `${rows * 2 * cw}px`;
  drawFrame(c, cols, rows, cw, dpr);
}

async function main() {
  // the menu's icons, and Enter starts as the button says
  for (const el of document.querySelectorAll('[data-icon]')) { const s = icon(el.dataset.icon, 16); s.classList.add('ic'); el.replaceWith(s); }
  addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLAnchorElement)) location.href = $('.play').getAttribute('href');
  });
  const dpr0 = Math.min(2, window.devicePixelRatio || 1);
  let fw = 0;
  const frame = () => { const w = $('.stage').clientWidth; if (w !== fw) { fw = w; frameStage(dpr0); } };
  frame();
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { fw = 0; frame(); }).observe($('.stage > .inner'));
  addEventListener('resize', frame);
  const data = await load();
  if (typeof DecompressionStream === 'undefined') { document.documentElement.classList.add('nopics'); return; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const glyphs = [...data.glyphs];
  const hero = { ...data.hero, cells: await cellsOf(data.hero.data) };
  const sketches = await Promise.all(data.sketches.map(async (s) => ({ ...s, cells: await cellsOf(s.data) })));
  if (OG) { drawOg(hero, glyphs); return; }

  // (the name: one line, or two on a narrow screen)
  let lastKey = '';
  const draw = async () => {
    const narrow = innerWidth < 600;
    const lines = narrow ? ['LAND OF', 'ASCII'] : ['LAND OF ASCII'];
    const box = $('.name');
    const { cols } = letteringSize(lines);
    const cw = Math.max(2, Math.min(5, Math.floor(Math.min(box.parentElement.clientWidth || innerWidth - 32, 720) / cols)));
    const hw = $('.hero').clientWidth, hcw = Math.max(1.5, hw / hero.cols);
    const sw = $('.sketch').clientWidth, scw = Math.max(1.5, sw / sketches[0].cols);
    const key = `${lines.length},${cw},${hcw.toFixed(2)},${scw.toFixed(2)}`;
    if (key === lastKey) return;
    lastKey = key;
    // (a picture a frame, so no one task holds the page up)
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    drawLettering($('.name canvas'), lines, cw, { dpr });
    await frame();
    drawCells($('.hero canvas'), hero.cells, hero.cols, hero.rows, hcw, glyphs, dpr);
    const figs = document.querySelectorAll('.sketch');
    for (let i = 0; i < figs.length; i++) {
      if (!sketches[i]) continue;
      await frame();
      drawCells(figs[i].querySelector('canvas'), sketches[i].cells, sketches[i].cols, sketches[i].rows, scw, glyphs, dpr);
    }
  };
  draw();
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 150); });
}

// The share image (1200 x 630), in the front page's look: the title
// screen's stone frame round the main picture, the name centred over its
// foot, and the line under the name.
function drawOg(hero, glyphs) {
  const c = $('#og');
  c.hidden = false;
  document.body.classList.add('og');
  const W = 1200, H = 630;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, H);
  // the frame: cells 10 x 20 px; 3 columns of stone at the sides, 2 rows of
  // stone and a timber rail at the top and the foot
  const fr = document.createElement('canvas'), fcw = 10, rows = Math.ceil(H / (2 * fcw));
  drawFrame(fr, W / fcw, rows, fcw, 1);
  const top = -Math.floor((rows * 2 * fcw - H) / 2);
  g.drawImage(fr, 0, top);
  // the picture in the field, as wide as the field, its top shown
  const fx = 3 * fcw, fy = top + 3 * 2 * fcw, fw = W - 2 * fx, fh = rows * 2 * fcw - 2 * 3 * 2 * fcw;
  const pic = document.createElement('canvas');
  drawCells(pic, hero.cells, hero.cols, hero.rows, fw / hero.cols, glyphs, 1);
  g.save(); g.beginPath(); g.rect(fx, fy, fw, fh); g.clip();
  g.drawImage(pic, fx, fy);
  // the name and the line, centred over a dark foot
  const grad = g.createLinearGradient(0, fy + fh - 250, 0, fy + fh);
  grad.addColorStop(0, 'rgba(13,14,18,0)'); grad.addColorStop(0.5, 'rgba(13,14,18,0.82)'); grad.addColorStop(1, 'rgba(13,14,18,0.95)');
  g.fillStyle = grad; g.fillRect(fx, fy + fh - 250, fw, 250);
  const name = document.createElement('canvas');
  drawLettering(name, ['LAND OF ASCII'], 6, { dpr: 1 });
  g.drawImage(name, Math.round((W - name.width) / 2), fy + fh - 160);
  g.font = `22px ${FONT_STACK}`; g.fillStyle = 'rgba(240,230,204,0.88)'; g.textBaseline = 'alphabetic'; g.textAlign = 'center';
  g.fillText('A quiet walk through a land drawn in letters. It runs in your browser.', W / 2, fy + fh - 26);
  g.restore();
  window.ogDone = true;
}

main().catch((e) => { console.error(e); document.documentElement.classList.add('nopics'); });
