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
// (a tall window: the TikTok videos, 9:16. TikTok's own buttons run down the
// right edge and its caption covers the bottom fifth, so text keeps to the
// upper middle, and the game's dialogue box is moved up and in from the right)
const TALL = H > W;
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
  .promo-tall #promo-cap { top:112px; width:460px; padding:14px 18px 15px; font:700 27px/1.28 ${MONO}; text-align:center; white-space:normal; }
  #promo-clock { position:absolute; left:50%; top:232px; transform:translateX(-50%); padding:8px 20px 9px; font:700 46px/1 ${MONO}; letter-spacing:.06em;
    color:#ffb060; background:rgba(13,14,18,.78); border:1px solid #383842; border-radius:6px; font-variant-numeric:tabular-nums; }
  /* (the box's own size is zoomed by the text size, 1.3: 300 + its padding comes to 437 px, its right edge 463 px in, clear of TikTok's buttons) */
  .promo-tall #talk { left:20px !important; right:auto !important; transform:none !important; width:300px !important; bottom:236px !important; }
  .promo-tall #say { left:20px !important; transform:none !important; bottom:236px !important; max-width:300px !important; }
  .promo-tall #prompt { display:none !important; }
  .promo-tall #promo-end { align-items:flex-start; padding-top:212px; box-sizing:border-box; }
  .promo-tall #promo-end .inner { gap:20px; padding:62px 46px 56px; }
  .promo-tall #promo-end .now { font-size:19px; letter-spacing:.12em; }
  .promo-tall #promo-end .url { font-size:27px; padding:13px 22px 14px; }
  #promo-end .bio { font:600 16px/1 ${MONO}; letter-spacing:.08em; color:#a9a397; }
  .promo-noprompt #prompt { display:none !important; }
`;
document.head.append(style);

// (drawn at the page's device pixels, so a cut is as sharp as the frame it breaks up)
const DPR = devicePixelRatio || 1;
const wipe = h('canvas', `position:absolute;left:0;top:0;width:${W}px;height:${H}px;`);
wipe.width = Math.round(W * DPR); wipe.height = Math.round(H * DPR);
const cap = h('div'); cap.id = 'promo-cap'; cap.style.display = 'none';
const cursor = h('div', 'position:absolute;left:0;top:0;width:34px;height:34px;display:none;will-change:transform;',
  '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M5 3.5 18.5 13l-6 .9 3.6 6.9-2.6 1.3-3.6-6.9-4.6 4.2z" fill="#f4efe2" stroke="#16130f" stroke-width="1.4" stroke-linejoin="round"/></svg>');
const ring = h('div', 'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border:3px solid #ffb060;border-radius:50%;display:none;');
const end = h('div'); end.id = 'promo-end'; end.style.display = 'none';
const clock = h('div'); clock.id = 'promo-clock'; clock.style.display = 'none';
root.append(wipe, ring, cursor, cap, clock, end);
if (TALL) document.documentElement.classList.add('promo-tall');
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
  // (the same size on screen whatever the page's zoom: the hook of the first
  // video starts at four device pixels to the CSS pixel)
  if (TALL) cap.style.zoom = String(2 / devicePixelRatio);
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
  // (each cell's colour, the mean of its pixels, worked out here: the
  // browser's own shrinking runs on the graphics card and can differ by a
  // level or two from run to run)
  const full = document.createElement('canvas'); full.width = img.naturalWidth; full.height = img.naturalHeight;
  const fg = full.getContext('2d', { willReadFrequently: true }); fg.drawImage(img, 0, 0);
  const px = fg.getImageData(0, 0, full.width, full.height).data, sx = full.width / COLS, sy = full.height / ROWS;
  cells = new Uint8ClampedArray(COLS * ROWS * 4);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const x0 = Math.floor(x * sx), x1 = Math.min(full.width, Math.floor((x + 1) * sx)), y0 = Math.floor(y * sy), y1 = Math.min(full.height, Math.floor((y + 1) * sy));
    let r = 0, gr = 0, b = 0, n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const o = (yy * full.width + xx) * 4; r += px[o]; gr += px[o + 1]; b += px[o + 2]; n++; }
    const k = (y * COLS + x) * 4; cells[k] = r / Math.max(1, n); cells[k + 1] = gr / Math.max(1, n); cells[k + 2] = b / Math.max(1, n); cells[k + 3] = 255;
  }
  noise = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const across = dir > 0 ? x / COLS : 1 - x / COLS;
    noise[y * COLS + x] = across * 0.78 + (y / ROWS) * 0.12 + hash(x, y) * 0.22;
  }
}
// p from 0 (all the old picture) to 1 (all the new).
export function drawCut(p) {
  const g = wipe.getContext('2d', { willReadFrequently: true });
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!old || p >= 1) return;
  g.drawImage(old, 0, 0, W, H);
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

// ---- the timelapse's clock ----
export function setClock(text) {
  if (!text) { clock.style.display = 'none'; return; }
  clock.style.display = ''; clock.textContent = text;
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
    const lines = TALL ? ['LAND OF', 'ASCII'] : ['LAND OF ASCII'], { cols } = letteringSize(lines);
    drawLettering(name, lines, Math.floor((TALL ? 380 : 860) / cols), { dpr: devicePixelRatio });
    const now = h('div', '', TALL ? 'PLAY FREE IN YOUR BROWSER' : 'PLAY LAND OF ASCII NOW'); now.className = 'now';
    const url = h('div', '', 'ODDSLICE.ITCH.IO'); url.className = 'url';
    inner.append(name, now, url);
    if (TALL) { const bio = h('div', '', 'link in bio'); bio.className = 'bio'; inner.append(bio); }
    panel.append(frame, inner);
    end.append(dim, panel);
    end.style.display = '';
    const r = inner.getBoundingClientRect(), fcw = 10;
    drawFrame(frame, Math.ceil((r.width + 60) / fcw), Math.ceil((r.height + 120) / (2 * fcw)), fcw, TALL ? devicePixelRatio : 1);
  }
  end.style.display = '';
}

// Tidy the game's own notes and hints away (the views), or bring them back.
export function tidy(on, hint = false, note = false) {
  document.documentElement.classList.toggle('promo-tidy', !!on);
  document.documentElement.classList.toggle('promo-nohint', !!hint);
  document.documentElement.classList.toggle('promo-nonote', !!note);
}

window.__ov = { setCursor, setCaption, setClock, setCut, drawCut, setEnd, tidy, ready: true, tall: TALL };
