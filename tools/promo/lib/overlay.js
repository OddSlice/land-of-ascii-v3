// The trailer's layer over the game page (loaded as a module into the
// stage, see trailer.mjs): a cursor, captions typed in the game's own font,
// the cuts between shots done in letters (the outgoing picture breaks into
// the game's glyph ramp and clears, cell by cell, along a ragged sweep),
// and the end card in the title screen's stone frame and lettering. Every
// piece is drawn from numbers the recorder passes for each frame, so the
// layer, like the game, keeps no clock of its own.
import { drawFrame } from '/src/app/title.js';
import { drawLettering, letteringSize } from '/src/app/lettering.js';

const W = innerWidth, H = innerHeight;
const MONO = '"Cascadia Mono", Menlo, Consolas, monospace';
const h = (tag, css = '', html = '') => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (html) e.innerHTML = html; return e; };

const root = h('div', 'position:fixed;inset:0;z-index:2000;pointer-events:none;');
const style = h('style');
style.textContent = `
  #promo-cap { position:absolute; left:50%; top:54px; transform:translateX(-50%); padding:14px 26px 15px; font:600 30px/1.2 ${MONO}; letter-spacing:.01em;
    color:#f0e6cc; background:rgba(13,14,18,.82); border:1px solid #383842; border-radius:6px; white-space:pre; text-shadow:0 1px 0 #000; }
  #promo-cap .k { display:inline-block; width:.6em; margin-left:2px; background:#ffb060; height:1em; vertical-align:-0.12em; }
  #promo-end { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  #promo-end .dim { position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(13,14,18,.38) 20%, rgba(13,14,18,.8) 100%); }
  #promo-end .panel { position:relative; }
  #promo-end .frame { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); }
  #promo-end .inner { position:relative; display:flex; flex-direction:column; align-items:center; gap:22px; padding:70px 92px 66px; }
  #promo-end .now { font:700 34px/1 ${MONO}; letter-spacing:.14em; color:#f0e6cc; }
  #promo-end .url { font:700 40px/1 ${MONO}; letter-spacing:.08em; color:#1d1409; background:#ffb060; padding:16px 30px 17px; border-radius:6px; border:1px solid #000; }
  .promo-tidy #note, .promo-tidy #say, .promo-tidy #hint, .promo-tidy #prompt, .promo-tidy #sign { display:none !important; }
  .promo-nohint #hint { display:none !important; }
  .promo-nonote #note { display:none !important; }
  .promo-noprompt #prompt { display:none !important; }
`;
document.head.append(style);

const wipe = h('canvas', 'position:absolute;left:0;top:0;');
wipe.width = W; wipe.height = H;
const cap = h('div'); cap.id = 'promo-cap'; cap.style.display = 'none';
const cursor = h('div', 'position:absolute;left:0;top:0;width:34px;height:34px;display:none;will-change:transform;',
  '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 3.5 18.5 13l-6 .9 3.6 6.9-2.6 1.3-3.6-6.9-4.6 4.2z" fill="#f4efe2" stroke="#16130f" stroke-width="1.4" stroke-linejoin="round"/></svg>');
const ring = h('div', 'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #ffb060;border-radius:50%;display:none;');
const end = h('div'); end.id = 'promo-end'; end.style.display = 'none';
root.append(wipe, ring, cursor, cap, end);
document.body.append(root);

// ---- the cursor ----
export function setCursor(o) {
  if (!o) { cursor.style.display = 'none'; ring.style.display = 'none'; return; }
  cursor.style.display = '';
  cursor.style.transform = `translate(${o.x - 6}px, ${o.y - 4}px) scale(${o.down ? 0.9 : 1})`;
  if (o.ring > 0 && o.ring < 1) {
    ring.style.display = '';
    const s = 0.5 + o.ring * 1.4;
    ring.style.transform = `translate(${o.x}px, ${o.y}px) scale(${s})`;
    ring.style.opacity = String(1 - o.ring);
  } else ring.style.display = 'none';
}

// ---- captions: typed on, then taken back a letter at a time ----
export function setCaption(text, shown) {
  if (!text || shown <= 0) { cap.style.display = 'none'; return; }
  const n = Math.min(text.length, Math.round(shown));
  cap.style.display = '';
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // (the box keeps the whole line's width; the letters not yet typed are clear)
  cap.innerHTML = `${esc(text.slice(0, n))}<span style="color:transparent">${esc(text.slice(n))}</span>`;
  if (n < text.length) cap.innerHTML = `${esc(text.slice(0, n))}<span class="k"></span><span style="color:transparent">${esc(text.slice(n + 1))}</span>`;
}

// ---- the cut in letters ----
const RAMP = ['█', '▓', '▒', '░', '#', '=', '+', ':', '.'];
const CW = 16, CH = 32, COLS = Math.ceil(W / CW), ROWS = Math.ceil(H / CH);
let old = null, cells = null, noise = null;
const hash = (a, b) => { let x = Math.imul(a, 374761393) ^ Math.imul(b, 668265263); x = Math.imul(x ^ (x >>> 13), 1274126177); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
// The picture to break up (a data URL of the last frame before the cut).
export async function setCut(url, dir = 1) {
  const img = new Image(); img.src = url; await img.decode();
  old = img;
  const small = document.createElement('canvas'); small.width = COLS; small.height = ROWS;
  const g = small.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(img, 0, 0, COLS, ROWS);
  cells = g.getImageData(0, 0, COLS, ROWS).data;
  noise = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const across = dir > 0 ? x / COLS : 1 - x / COLS;
    noise[y * COLS + x] = across * 0.78 + (y / ROWS) * 0.12 + hash(x, y) * 0.22;
  }
}
// p from 0 (all the old picture) to 1 (all the new).
export function drawCut(p) {
  const g = wipe.getContext('2d');
  g.clearRect(0, 0, W, H);
  if (!old || p >= 1) return;
  g.drawImage(old, 0, 0);
  g.font = `700 ${CH - 4}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const front = p * 1.42 - 0.12, band = 0.16;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const k = y * COLS + x, q = (front - noise[k]) / band;
    if (q <= 0) continue;
    g.clearRect(x * CW, y * CH, CW, CH);
    if (q >= 1) continue;
    const r = cells[k * 4], gr = cells[k * 4 + 1], b = cells[k * 4 + 2];
    g.fillStyle = `rgb(${r * 0.35 | 0},${gr * 0.35 | 0},${b * 0.38 | 0})`;
    g.fillRect(x * CW, y * CH, CW, CH);
    const lift = (v) => Math.min(255, v * 1.25 + 40) | 0;
    g.fillStyle = q > 0.55 ? `rgb(255,${176 + (q * 40 | 0)},96)` : `rgb(${lift(r)},${lift(gr)},${lift(b)})`;
    g.fillText(RAMP[Math.min(RAMP.length - 1, Math.floor(q * RAMP.length))], x * CW + CW / 2, y * CH + CH / 2 + 1);
  }
}

// ---- the end card ----
let built = false;
export function setEnd(on) {
  if (!on) { end.style.display = 'none'; return; }
  if (!built) {
    built = true;
    const dim = h('div'); dim.className = 'dim';
    const panel = h('div'); panel.className = 'panel';
    const frame = h('canvas'); frame.className = 'frame';
    const inner = h('div'); inner.className = 'inner';
    const name = h('canvas');
    const lines = ['LAND OF ASCII'], { cols } = letteringSize(lines);
    drawLettering(name, lines, Math.floor(860 / cols), { dpr: 1 });
    const now = h('div', '', 'PLAY LAND OF ASCII NOW'); now.className = 'now';
    const url = h('div', '', 'ODDSLICE.ITCH.IO'); url.className = 'url';
    inner.append(name, now, url);
    panel.append(frame, inner);
    end.append(dim, panel);
    end.style.display = '';
    const r = inner.getBoundingClientRect(), fcw = 10;
    drawFrame(frame, Math.ceil((r.width + 60) / fcw), Math.ceil((r.height + 120) / (2 * fcw)), fcw, 1);
  }
  end.style.display = '';
}

// Tidy the game's own notes and hints away (the views), or bring them back.
export function tidy(on, hint = false, note = false) {
  document.documentElement.classList.toggle('promo-tidy', !!on);
  document.documentElement.classList.toggle('promo-nohint', !!hint);
  document.documentElement.classList.toggle('promo-nonote', !!note);
}

window.__ov = { setCursor, setCaption, setCut, drawCut, setEnd, tidy, ready: true };
