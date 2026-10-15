// The title screen (phase 6), grown from the start card: the live world
// drifting behind (the flyover, src/main.js), and in the middle a panel in
// the kit's own materials, a stone frame with timber rails drawn in glyphs,
// holding the name in the game's lettering, a welcome line that changes each
// visit, and the choices: Play (or Continue, with your standing and where
// you were), New world (a seed, or a random one), Settings, Share this
// world. A thin line at the foot: the version and the seed.
//
// Every choice works by keyboard alone: the first is focused, the arrow
// keys move between them, Enter or Space takes one. The panel fades in;
// any key or click while it does brings it forward at once. It holds no
// game state: `hooks` (src/main.js) does everything.
import { drawLettering, letteringSize } from './lettering.js';
import { FONT_STACK } from '../present/font.js';
import { LOOK } from '../look.js';
import { icon } from './icons.js';

// the welcome lines, one a visit, in turn
const WELCOMES = [
  'The road\'s open, and the weather\'s fair enough.',
  'Someone in the next village will want a word with you.',
  'Walk wherever you like. Your map fills in as you go.',
  'There\'s a view worth sketching not far from here.',
  'The fort keeps watch day and night, and each village keeps its own hours.',
  'Take the long way round. Nobody is waiting on you but the weather.',
];

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const hashU = (a, b, c = 0) => {
  let x = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1442695041);
  x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

// The frame: `cols` x `rows` cells of `cw` x 2cw pixels. A border of
// dressed stone in courses (two rows deep, three columns wide), lit from
// above and the left; inside it a timber rail under the top and over the
// foot, pegged every few cells; the field dark, with the faintest grain.
export function drawFrame(canvas, cols, rows, cw, dpr = 1) {
  const ch = cw * 2, K = LOOK.keys.day;
  canvas.width = Math.round(cols * cw * dpr); canvas.height = Math.round(rows * ch * dpr);
  canvas.style.width = `${cols * cw}px`; canvas.style.height = `${rows * ch}px`;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.font = `${Math.round(ch * 0.86)}px ${FONT_STACK}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const sL = hex(K.masonry.lit), sD = hex(K.masonry.shade), tL = hex(K.timber3.lit), tD = hex(K.timber3.shade);
  const cell = (x, y, bg, ink, glyph) => {
    g.fillStyle = rgb(bg); g.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
    if (glyph) { g.fillStyle = rgb(ink); g.fillText(glyph, (x + 0.5) * cw, (y + 0.52) * ch); }
  };
  const BX = 3, BY = 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const inStone = x < BX || x >= cols - BX || y < BY || y >= rows - BY;
      if (inStone) {
        // courses: a row each; blocks 4 to 7 columns long, joints offset course to course
        const n = hashU(x, y, 7);
        const start = (y * 5) % 6, joint = ((x + start) % 6 === 0) || y === 0 || y === rows - 1 && false;
        // light: from above and the left, falling across the frame
        const lit = 0.8 - 0.45 * (y / rows) - 0.2 * (x / cols) + (n - 0.5) * 0.12;
        const face = mix(sD, sL, Math.max(0, Math.min(1, lit)));
        if (joint) cell(x, y, mix(face, [20, 18, 16], 0.55), mix(face, [10, 9, 8], 0.4), '|');
        else cell(x, y, mix(face, [24, 22, 20], 0.28), mix(face, [255, 250, 235], 0.25), n < 0.18 ? '%' : n < 0.55 ? '#' : n < 0.8 ? '=' : '+');
        continue;
      }
      // the rails: one row of timber inside the top and the foot
      if (y === BY || y === rows - BY - 1) {
        const lit = y === BY ? 0.75 : 0.45, face = mix(tD, tL, lit + (hashU(x, y, 3) - 0.5) * 0.15);
        const peg = (x - BX) % 8 === 4;
        cell(x, y, mix(face, [16, 12, 9], 0.25), peg ? [24, 18, 12] : mix(face, [250, 230, 200], 0.2), peg ? 'o' : '=');
        continue;
      }
      // the field
      cell(x, y, [15, 15, 18], [30, 30, 36], hashU(x, y, 11) < 0.04 ? '.' : '');
    }
  }
}

export class Title {
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.up = false;
    this.shown = false;
    this.build();
  }

  build() {
    const H = this.hooks;
    this.fadeCanvas = h('canvas', { class: 'xfade', 'aria-hidden': 'true' });
    this.frame = h('canvas', { class: 'frame', 'aria-hidden': 'true' });
    this.name = h('canvas', { class: 'name', 'aria-hidden': 'true' });
    this.welcome = h('p', { class: 'welcome' });
    this.note = h('p', { class: 'note', 'aria-live': 'polite' });
    // the choices
    this.playBtn = h('button', { type: 'button', class: 'choice main', onclick: () => H.play() }, h('span', { class: 'what' }, 'Play'), h('span', { class: 'more' }));
    this.newBtn = h('button', { type: 'button', class: 'choice', 'aria-expanded': 'false', onclick: () => this.toggleNew() }, h('span', { class: 'what' }, 'New world'), h('span', { class: 'more' }, 'another land, from a seed'));
    this.seedInput = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'seed', placeholder: 'a seed', maxlength: '10' });
    this.seedInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.openSeed(); } });
    this.newRow = h('div', { class: 'newrow', hidden: true },
      this.seedInput,
      h('button', { type: 'button', class: 'small', onclick: () => this.openSeed() }, 'open'),
      h('button', { type: 'button', class: 'small', onclick: () => H.newWorld() }, icon('dice', 14), 'random'));
    this.setBtn = h('button', { type: 'button', class: 'choice', onclick: () => H.settings() }, h('span', { class: 'what' }, 'Settings'), h('span', { class: 'more' }, 'keys, display, sound'));
    this.shareBtn = h('button', { type: 'button', class: 'choice', onclick: () => this.share() }, h('span', { class: 'what' }, 'Share this world'), h('span', { class: 'more' }, 'copy a link to this seed'));
    this.choices = [this.playBtn, this.newBtn, this.setBtn, this.shareBtn];
    const list = h('div', { class: 'choices', onkeydown: (e) => this.arrows(e) }, this.playBtn, this.newBtn, this.newRow, this.setBtn, this.shareBtn);
    this.inner = h('div', { class: 'inner' }, h('h1', { id: 'title-name', class: 'sr' }, 'Land of Ascii'), this.name, this.welcome, list, this.note);
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'title-name' }, this.frame, this.inner);
    this.foot = h('p', { class: 'foot' });
    this.root.append(this.fadeCanvas, this.panel, this.foot);
    // a key or a click while it fades in brings it forward at once
    this.root.addEventListener('pointerdown', () => this.forward(), true);
    addEventListener('keydown', (e) => { if (this.up && !this.shown) { this.forward(); if (e.key !== 'Tab') e.preventDefault(); } }, true);
    // (a click beside the panel keeps the keyboard on its choices; Enter
    // with nothing in particular focused takes the first)
    this.root.addEventListener('click', (e) => { if (this.up && !this.panel.contains(e.target)) this.focusFirst(); });
    addEventListener('keydown', (e) => {
      if (!this.up || !this.shown || e.defaultPrevented) return;
      const a = document.activeElement;
      if ((e.key === 'Enter' || e.key === ' ') && (!a || a === document.body || !this.root.contains(a)) && !document.querySelector('.menu.on')) { e.preventDefault(); this.hooks.play(); }
    });
    addEventListener('resize', () => { if (this.up) this.draw(); });
  }

  // Show it: `state` { progress: null | { standing, where }, seed, version, visit, reduced }.
  show(st) {
    this.st = st;
    this.up = true; this.shown = false;
    this.welcome.textContent = WELCOMES[(st.visit - 1) % WELCOMES.length];
    const cont = !!st.progress;
    this.playBtn.querySelector('.what').textContent = cont ? 'Continue' : 'Play';
    this.playBtn.querySelector('.more').textContent = cont ? `${st.progress.standing}${st.progress.where ? `, last near ${st.progress.where}` : ''}` : 'a new walk in this land';
    this.foot.textContent = `version ${st.version} · seed ${st.seed}`;
    this.seedInput.value = '';
    this.root.hidden = false;
    this.root.classList.add('on');
    this.root.classList.toggle('still', !!st.reduced);
    this.draw();
    // (it comes up over a second, unless asked for sooner)
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => this.forward(), st.reduced ? 0 : 1100);
    requestAnimationFrame(() => this.root.classList.add('rising'));
  }
  focusFirst() { this.playBtn.focus({ preventScroll: true }); }
  forward() {
    if (!this.up || this.shown) return;
    this.shown = true;
    clearTimeout(this.fadeTimer);
    this.root.classList.add('shown');
    this.playBtn.focus({ preventScroll: true });
  }
  hide() {
    this.up = false; this.shown = false;
    this.root.classList.remove('on', 'rising', 'shown');
    this.root.hidden = true;
  }

  // the frame and the name, at a cell size that fits the screen
  draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const narrow = innerWidth < 560;
    const lines = narrow ? ['LAND OF', 'ASCII'] : ['LAND OF ASCII'];
    const { cols } = letteringSize(lines);
    const maxW = Math.min(innerWidth - 32, 600) - 6 * 8;
    const cw = Math.max(2, Math.min(5, Math.floor(maxW / cols)));
    drawLettering(this.name, lines, cw, { dpr });
    // the frame round what it holds
    requestAnimationFrame(() => {
      const r = this.inner.getBoundingClientRect(), fcw = 8;
      const fc = Math.ceil((r.width + 2 * 3 * fcw + 16) / fcw), fr = Math.ceil((r.height + 2 * 3 * 2 * fcw) / (2 * fcw));
      drawFrame(this.frame, fc, fr, fcw, dpr);
    });
  }

  arrows(e) {
    if (e.target === this.seedInput) return;
    const vis = this.choices.filter((b) => !b.hidden);
    const k = vis.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = k < 0 ? 0 : (k + (e.key === 'ArrowDown' ? 1 : -1) + vis.length) % vis.length;
      vis[n].focus();
    }
  }
  toggleNew() {
    const open = this.newRow.hidden;
    this.newRow.hidden = !open;
    this.newBtn.setAttribute('aria-expanded', String(open));
    if (open) this.seedInput.focus();
  }
  openSeed() {
    const v = this.seedInput.value.trim();
    if (!/^\d{1,10}$/.test(v)) { this.say('A seed is a whole number, such as 3 or 48211.'); this.seedInput.focus(); return; }
    this.hooks.newWorld(parseInt(v, 10) >>> 0);
  }
  async share() {
    const ok = await this.hooks.share();
    this.say(ok ? 'Link copied. Anyone who opens it walks the same land.' : 'The browser wouldn\'t copy the link.');
  }
  say(text, ms = 5000) {
    this.note.textContent = text;
    clearTimeout(this.noteTimer);
    if (ms) this.noteTimer = setTimeout(() => { this.note.textContent = ''; }, ms);
  }

  // The cross-fade: the picture as it was is laid over the new one, then
  // faded out (src/main.js draws it from the game's canvas).
  crossFade(source, ms) {
    const c = this.fadeCanvas;
    c.width = source.width; c.height = source.height;
    const r = source.getBoundingClientRect();
    Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    c.getContext('2d').drawImage(source, 0, 0);
    c.style.transition = 'none'; c.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = `opacity ${ms}ms ease`; c.style.opacity = '0'; }));
  }
}
