// The journal (J, phase 5a), in the menu's style (src/app/menu.js shares its
// look): a rail with your standing and what you carry, and four pages as
// tabs, one at a time:
// - Places: every place the land has, found or not yet, with a count;
// - People: everyone you have greeted, their role and village, and when
//   you last saw them;
// - Sketches: the notable views, ticked once sketched, and every sketch,
//   each opened full-screen with a page-through and a copy as plain text;
// - Favours: what you have taken on, what was asked, what is done.
// Mouse and keyboard alike (the arrow keys move between tabs, Tab stays
// inside, Escape or J closes; in the viewer the arrow keys page through).
// While it is open the world stands still, as under the menu.
import { icon } from './icons.js';
import { buildAtlas } from '../present/atlas.js';
import { GLYPHS } from '../glyphs.js';
import { clockOf, partOfDay } from './wayfaring.js';

const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};

const PAGES = [
  ['places', 'Places', 'signpost'],
  ['people', 'People', 'people'],
  ['sketches', 'Sketches', 'sketch'],
  ['favours', 'Favours', 'bundle'],
];
const KIND_HEADS = [['fort', 'the fort'], ['village', 'villages'], ['viewpoint', 'high places'], ['lake', 'water'], ['coast', 'water'], ['bridge', 'bridges'], ['source', 'where the rivers rise'], ['foot', 'the mountains']];
// (the kids of a page, flattened, with the empty ones left out)
const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
const when = (t) => (t ? `day ${t[0]}, ${partOfDay(t[1])}` : '');
const STATE = ['', 'asked', 'taken', 'on the way back', 'done'];

// A sketch's cells as plain text: one line a row.
export function sketchText(cells, cols, rows) {
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let s = '';
    for (let x = 0; x < cols; x++) s += GLYPHS[cells[(y * cols + x) * 8 + 3]] || ' ';
    lines.push(s);
  }
  return lines.join('\n');
}

// A sketch drawn as the game draws it: each cell its background, its glyph
// in its ink, from the glyph atlas at a cell width `cw`.
export function drawSketch(canvas, cells, cols, rows, cw) {
  const ch = cw * 2, a = buildAtlas(cw, ch), AC = 16;
  canvas.width = cols * cw; canvas.height = rows * ch;
  const g = canvas.getContext('2d'), img = g.createImageData(canvas.width, canvas.height), d = img.data, W = canvas.width;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const o = (cy * cols + cx) * 8, gi = cells[o + 3];
    const ax = (gi % AC) * cw, ay = Math.floor(gi / AC) * ch;
    for (let py = 0; py < ch; py++) {
      let q = ((cy * ch + py) * W + cx * cw) * 4;
      for (let px = 0; px < cw; px++, q += 4) {
        const c = a.cov[(ay + py) * a.width + ax + px] / 255;
        d[q] = cells[o] + (cells[o + 4] - cells[o]) * c; d[q + 1] = cells[o + 1] + (cells[o + 5] - cells[o + 1]) * c; d[q + 2] = cells[o + 2] + (cells[o + 6] - cells[o + 2]) * c; d[q + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
}
// A small picture: each cell its background, a pixel wide and two tall.
function drawThumb(canvas, cells, cols, rows) {
  canvas.width = cols; canvas.height = rows * 2;
  const g = canvas.getContext('2d'), img = g.createImageData(cols, rows * 2), d = img.data;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const o = (cy * cols + cx) * 8;
    for (const r of [0, 1]) { const q = (((cy * 2 + r) * cols) + cx) * 4; d[q] = cells[o]; d[q + 1] = cells[o + 1]; d[q + 2] = cells[o + 2]; d[q + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
}

export class Journal {
  // `book`: { data(), cells(id) (a promise), copy(text) (a promise), close() }
  constructor(root, book) {
    this.root = root;
    this.book = book;
    this.open = false;
    this.tab = 'places';
    this.viewing = null;
    this.build();
    root.addEventListener('keydown', (e) => this.keys(e));
  }

  build() {
    const b = this.book;
    this.back = h('div', { class: 'back', onclick: () => b.close() });
    this.standing = h('span', {}); this.count = h('span', {});
    this.carried = h('ul', { class: 'carried', 'aria-label': 'what you carry' });
    this.tabs = {};
    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'journal pages', onkeydown: (e) => this.tabKey(e) },
      PAGES.map(([id, title, ic]) => (this.tabs[id] = h('button', { type: 'button', role: 'tab', id: `jr-tab-${id}`, 'aria-controls': `jr-panel-${id}`, onclick: () => this.select(id) }, icon(ic, 18), h('span', {}, title)))));
    this.closeBtn = h('button', { type: 'button', class: 'resume', onclick: () => b.close() }, icon('play', 14), h('span', {}, 'Back to the road'), h('kbd', { 'aria-hidden': 'true' }, 'J'));
    const rail = h('div', { class: 'rail' },
      h('div', { class: 'brand' }, h('h1', { id: 'jr-title' }, 'Journal'), h('p', { class: 'status' }, this.standing, this.count)),
      tablist,
      h('div', { class: 'carry' }, h('h3', {}, icon('bundle', 14), 'carrying'), this.carried));
    this.pane = h('div', { class: 'pane' });
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'jr-title' }, rail, this.pane, h('div', { class: 'foot' }, this.closeBtn));
    this.sections = {};
    for (const [id, title] of PAGES) this.sections[id] = h('section', { role: 'tabpanel', id: `jr-panel-${id}`, 'aria-labelledby': `jr-tab-${id}`, hidden: true });
    this.pane.append(...Object.values(this.sections));
    // the viewer, over everything
    this.canvas = h('canvas', { class: 'sheet', role: 'img' });
    this.caption = h('p', { class: 'caption' });
    this.copied = h('span', { class: 'note', 'aria-live': 'polite' });
    this.prevBtn = h('button', { type: 'button', onclick: () => this.page(-1), 'aria-label': 'the sketch before' }, icon('left', 15), h('span', {}, 'before'));
    this.nextBtn = h('button', { type: 'button', onclick: () => this.page(1), 'aria-label': 'the sketch after' }, h('span', {}, 'after'), icon('arrow', 15));
    this.viewer = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'a sketch', hidden: true },
      h('div', { class: 'frame' }, this.canvas),
      h('div', { class: 'bar' }, this.caption, h('div', { class: 'inline' }, this.prevBtn, this.nextBtn,
        h('button', { type: 'button', onclick: () => this.image('share') }, icon('share', 15), h('span', {}, 'share')),
        h('button', { type: 'button', onclick: () => this.image('save') }, icon('download', 15), h('span', {}, 'save image')),
        h('button', { type: 'button', onclick: () => this.copy() }, icon('copy', 15), h('span', {}, 'copy as text')), this.copied,
        h('button', { type: 'button', class: 'shut', onclick: () => this.shutViewer() }, icon('close', 15), h('span', {}, 'close'), h('kbd', {}, 'Esc')))));
    this.root.append(this.back, this.panel, this.viewer);
    this.select(this.tab);
  }

  // Bring every page up to date.
  fill() {
    const d = this.book.data();
    this.d = d;
    this.standing.textContent = `known as ${d.standing}`;
    this.count.textContent = `${d.done} ${d.done === 1 ? 'favour' : 'favours'} done`;
    this.carried.replaceChildren(...(d.carried.length ? d.carried.map((c) => h('li', {}, c)) : [h('li', { class: 'none' }, 'nothing yet')]));
    // places, grouped
    const found = d.places.filter((p) => p.found).length;
    const groups = [];
    for (const [kind, head] of KIND_HEADS) {
      let g = groups.find((x) => x.head === head);
      if (!g) groups.push((g = { head, list: [] }));
      g.list.push(...d.places.filter((p) => p.kind === kind));
    }
    put(this.sections.places, 
      h('header', {}, h('h2', {}, 'Places'), h('p', { class: 'lead' }, `${found} of ${d.places.length} found. A place is noted the first time you come near it and can see it. You have seen ${Math.round(d.seen * 100)}% of the land.`)),
      groups.filter((g) => g.list.length).map((g) => h('div', { class: 'group' }, h('h3', { class: 'part' }, `${g.head} (${g.list.filter((p) => p.found).length} of ${g.list.length})`),
        h('ul', { class: 'rows' }, g.list.map((p) => (p.found
          ? h('li', { class: 'row found' }, icon('tick', 14), h('div', {}, h('b', {}, p.title), h('span', { class: 'sub' }, p.where)), h('span', { class: 'when' }, when(p.found)))
          : h('li', { class: 'row' }, icon('open', 14), h('div', {}, h('b', {}, 'not yet found'), h('span', { class: 'sub' }, p.hint)), h('span', { class: 'when' }, ''))))))));
    // people
    put(this.sections.people, 
      h('header', {}, h('h2', {}, 'People'), h('p', { class: 'lead' }, d.people.length ? `You have met ${d.people.length} ${d.people.length === 1 ? 'person' : 'people'}. Press E beside someone facing you to greet them.` : 'No one yet. Press E beside someone facing you to greet them.')),
      h('ul', { class: 'rows' }, d.people.map((p) => h('li', { class: 'row found' }, icon('people', 14), h('div', {}, h('b', {}, p.name), h('span', { class: 'sub' }, p.town ? `${p.role}, ${p.town}` : p.role)), h('span', { class: 'when' }, `last seen ${when(p.seen)}`)))));
    // sketches
    const ticked = d.notables.filter((n) => n.sketch).length;
    this.thumbs = [];
    put(this.sections.sketches, 
      h('header', {}, h('h2', {}, 'Sketches'), h('p', { class: 'lead' }, `Press K to sketch the view in front of you. ${ticked} of ${d.notables.length} notable views sketched.`)),
      h('h3', { class: 'part' }, 'notable views'),
      h('ul', { class: 'rows' }, d.notables.map((n) => h('li', { class: `row${n.sketch ? ' found' : ''}` }, icon(n.sketch ? 'tick' : 'open', 14), h('div', {}, h('b', {}, n.title)),
        n.sketch ? h('button', { type: 'button', class: 'link', onclick: () => this.view(n.sketch.id) }, 'open the sketch') : h('span', { class: 'when' }, 'not yet sketched')))),
      h('h3', { class: 'part' }, `your sketches (${d.sketches.length})`),
      d.sketches.length ? h('div', { class: 'sketches' }, d.sketches.map((s) => {
        const c = h('canvas', { class: 'thumb', 'aria-hidden': 'true' });
        this.thumbs.push([c, s]);
        return h('button', { type: 'button', class: 'card', onclick: () => this.view(s.id), 'aria-label': `open the sketch ${s.place}, day ${s.day} ${clockOf(s.hour)}` }, c,
          h('span', { class: 'cap' }, h('b', {}, s.place), h('span', { class: 'sub' }, `day ${s.day}, ${clockOf(s.hour)}, ${s.weather}`)));
      })) : h('p', { class: 'words' }, 'None yet.'));
    this.drawThumbs();
    // favours
    const by = (st) => d.favours.filter((f) => f.state === st || (st === 2 && f.state === 3));
    const fav = (f) => h('li', { class: `fav ${f.state === 4 ? 'done' : ''}` }, h('div', { class: 'head' }, h('b', {}, f.giver), h('span', { class: 'sub' }, `${STATE[f.state]}, ${when(f.t)}`)), f.words.map((w) => h('p', {}, w)));
    const doing = by(2), asked = by(1), done = by(4);
    put(this.sections.favours,
      h('header', {}, h('h2', {}, 'Favours'), h('p', { class: 'lead' }, `You are known as ${d.standing}. Some people have a favour to ask when you greet them.`)),
      h('h3', { class: 'part' }, `on your way (${doing.length})`), doing.length ? h('ul', { class: 'favs' }, doing.map(fav)) : h('p', { class: 'words' }, 'Nothing at the moment.'),
      asked.length ? [h('h3', { class: 'part' }, `asked of you (${asked.length})`), h('ul', { class: 'favs' }, asked.map(fav))] : null,
      done.length ? [h('h3', { class: 'part' }, `done (${done.length})`), h('ul', { class: 'favs' }, done.map(fav))] : null,
      d.note ? h('p', { class: 'words note' }, d.note) : null);
  }

  async drawThumbs() {
    for (const [c, s] of this.thumbs) {
      const cells = await this.book.cells(s.id);
      if (cells) drawThumb(c, cells, s.cols, s.rows);
    }
  }

  // ---- the viewer ----
  async view(id) {
    const list = this.d.sketches, k = list.findIndex((s) => s.id === id);
    if (k < 0) return;
    this.viewing = k;
    this.viewer.hidden = false;
    this.root.classList.add('viewing');
    await this.render();
    this.viewer.querySelector('.shut').focus({ preventScroll: true });
  }
  async render() {
    const s = this.d.sketches[this.viewing];
    const cells = await this.book.cells(s.id);
    this.caption.textContent = `${s.place}, day ${s.day}, ${clockOf(s.hour)}, ${s.weather}. ${this.viewing + 1} of ${this.d.sketches.length}.`;
    this.prevBtn.disabled = this.viewing <= 0; this.nextBtn.disabled = this.viewing >= this.d.sketches.length - 1;
    if (!cells) { this.canvas.width = 1; this.canvas.height = 1; return; }
    const dpr = window.devicePixelRatio || 1, W = (innerWidth - 48) * dpr, H = (innerHeight - 110) * dpr;
    const cw = Math.max(2, Math.min(Math.floor(W / s.cols), Math.floor(H / (2 * s.rows))));
    drawSketch(this.canvas, cells, s.cols, s.rows, cw);
    this.canvas.style.width = `${(s.cols * cw) / dpr}px`; this.canvas.style.height = `${(s.rows * cw * 2) / dpr}px`;
    this.canvas.setAttribute('aria-label', `the sketch ${s.place}`);
    this.cells = cells;
  }
  page(d) {
    if (this.viewing === null) return;
    const k = this.viewing + d;
    if (k < 0 || k >= this.d.sketches.length) return;
    this.viewing = k;
    this.render();
  }
  async copy() {
    const s = this.d.sketches[this.viewing];
    if (!this.cells) return;
    const ok = await this.book.copy(sketchText(this.cells, s.cols, s.rows));
    this.copied.textContent = ok ? 'copied' : 'could not copy';
    setTimeout(() => { this.copied.textContent = ''; }, 2500);
  }
  // (phase 6) the sketch as an image with a thin frame, the game's name and
  // the seed: shared to the clipboard where the browser allows an image
  // there, else saved; or saved
  async image(mode) {
    const s = this.d.sketches[this.viewing];
    if (!this.cells || !this.book.image) return;
    const how = await this.book.image(this.cells, s, mode);
    this.copied.textContent = how === 'copied' ? 'the image is copied' : how === 'saved' ? 'the image is saved' : 'the browser would not make the image';
    setTimeout(() => { this.copied.textContent = ''; }, 3000);
  }
  shutViewer() {
    if (this.viewing === null) return false;
    this.viewing = null;
    this.viewer.hidden = true;
    this.root.classList.remove('viewing');
    this.tabs[this.tab].focus({ preventScroll: true });
    return true;
  }

  // ---- tabs, keys, opening ----
  select(id, focusTab = false) {
    this.tab = id;
    for (const [k, b] of Object.entries(this.tabs)) {
      const on = k === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      this.sections[k].hidden = !on;
    }
    this.pane.scrollTop = 0;
    if (focusTab) this.tabs[id].focus();
  }
  tabKey(e) {
    const ids = PAGES.map((t) => t[0]), i = ids.indexOf(this.tab);
    const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault(); e.stopPropagation();
    this.select(ids[(to + ids.length) % ids.length], true);
  }
  keys(e) {
    if (!this.open) return;
    if (this.viewing !== null && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); this.page(e.key === 'ArrowLeft' ? -1 : 1); return; }
    if (e.key !== 'Tab') return;
    const scope = this.viewing !== null ? this.viewer : this.panel;
    const f = [...scope.querySelectorAll('button')].filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }
  show(tab) {
    if (tab) this.tab = tab;
    this.open = true;
    this.fill();
    this.select(this.tab);
    this.root.classList.add('on');
    this.root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => this.root.classList.add('shown'));
    this.tabs[this.tab].focus({ preventScroll: true });
  }
  hide() {
    if (!this.open) return;
    this.shutViewer();
    this.open = false;
    this.root.classList.remove('shown', 'on');
    this.root.setAttribute('aria-hidden', 'true');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }
  // For the tools: what the journal shows.
  read() {
    return {
      open: this.open, tab: this.tab, viewing: this.viewing,
      text: this.open ? this.sections[this.tab].innerText : '', rail: this.open ? this.panel.querySelector('.rail').innerText : '',
      buttons: this.open ? [...(this.viewing !== null ? this.viewer : this.panel).querySelectorAll('button')].filter((b) => b.offsetParent !== null).length : 0,
    };
  }
}
