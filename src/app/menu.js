// The menu (phase 2b): Escape opens it over the world, which stays drawn
// behind it, dimmed, while the clock and movement stand still. Four sections:
// every key explained (the only place the full list appears), the Display
// choices, the World (seed, time, weather) and, collapsed, the Advanced
// tools of earlier phases. Plain HTML over the canvas; every control works
// by mouse and by keyboard alone, and Tab stays inside it while it is open.
// It holds no game state of its own: it reads and sets it through `game`
// (src/main.js).
import { LOOK } from '../look.js';
import { KINDS } from '../weather.js';

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

// Every key, grouped by purpose, with a few plain words each.
function keyGroups(scene) {
  const world = scene === 'world';
  return [
    ['moving', [
      ['W A S D', 'walk'],
      ['Shift', 'run, while held'],
      world && ['F', 'fly on or off'],
      world && ['Space', 'rise, while flying'],
    ]],
    ['looking', [
      ['mouse', 'look round: click the picture to take the mouse, Esc gives it back'],
      ['drag', 'look round where the browser will not give the mouse over'],
      ['arrows', 'look round'],
    ]],
    ['time', [
      ['1 2 3 4', 'day, dusk, night, dawn'],
      ['T', 'start or stop the clock'],
    ]],
    ['world', [
      world ? ['R', 'a new world from a new seed'] : ['R', 'the reference frame beside the picture (the Look Lab)'],
      world && ['M', 'the map: # fort, o village, * viewpoint, + spawn, @ you'],
      ['G', 'glyphs on or off'],
      ['- +', 'less or more detail'],
      !world && ['X', scene === 'stress' ? 'the Look Lab' : 'the stress scene'],
    ]],
    ['views', [
      ['C', 'the next fixed camera'],
      ['L', 'the look panel; 5 6 7 8 9 0 cycle its choices'],
      ['H', 'full statistics on or off'],
      ['Esc', 'this menu'],
    ]],
  ].map(([name, rows]) => [name, rows.filter(Boolean)]);
}

const DETAIL = [
  ['coarse', 'about 15,000 large cells, the fastest'],
  ['medium', 'about 25,000 cells'],
  ['fine', 'about 40,000 cells, the default'],
  ['finest', 'about 60,000 small cells, the slowest'],
];
const HUDS = [['none', 'nothing'], ['minimal', 'time, weather, frame rate'], ['full', 'full statistics']];
export const RATES = [
  ['stopped', 0], ['real time', 1 / 3600], ['an hour a minute', 1 / 60], ['an hour in 15 s', 1 / 15], ['an hour in 4 s', 1 / 4],
];
const TIMES = [['dawn', 'dawn'], ['day', 'day'], ['dusk', 'dusk'], ['night', 'night']];

export class Menu {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.open = false;
    this.refresh = [];             // functions that bring the controls up to date
    this.build();
    root.addEventListener('keydown', (e) => this.trap(e));
  }

  build() {
    const g = this.game;
    this.back = h('div', { class: 'back', onclick: () => g.close({ recapture: false }) });
    this.body = h('div', { class: 'body' });
    const sections = {};
    const jump = (id) => () => {
      if (id === 'advanced' && !this.advOpen) this.setAdvanced(true);
      const s = sections[id];
      this.body.scrollTo({ top: s.offsetTop - this.body.offsetTop - 4, behavior: 'smooth' });
      s.querySelector('h2').focus({ preventScroll: true });
    };
    const nav = h('nav', { 'aria-label': 'menu sections' },
      ['controls', 'display', 'world', 'advanced'].map((id) => h('button', { type: 'button', onclick: jump(id) }, id)));
    this.resumeBtn = h('button', { type: 'button', class: 'resume', onclick: () => g.close({ recapture: true }) }, 'Resume');
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-title' },
      h('header', {}, h('h1', { id: 'menu-title' }, 'Land of Ascii'), nav, this.resumeBtn),
      this.body);
    this.root.append(this.back, this.panel);

    // Controls
    sections.controls = this.section('controls', 'Controls',
      keyGroups(g.scene).map(([name, rows]) => [h('h3', {}, name), h('dl', { class: 'keys' }, rows.map(([k, t]) => [h('dt', {}, k), h('dd', {}, t)]))]));

    // Display
    sections.display = this.section('display', 'Display',
      this.choice('detail level', DETAIL.map(([n, d], i) => [i, n, d]), () => g.display.density, (v) => g.setDisplay('density', v), true),
      this.toggle('glyphs', () => g.display.glyphs, (v) => g.setDisplay('glyphs', v)),
      this.choice('statistics on screen', HUDS.map(([v, t]) => [v, t]), () => g.display.hud, (v) => g.setDisplay('hud', v)),
      this.slider('mouse sensitivity', 0.25, 3, 0.05, () => g.display.sensitivity, (v) => g.setDisplay('sensitivity', v), (v) => `${v.toFixed(2)}×`),
      this.toggle('invert vertical look', () => g.display.invert, (v) => g.setDisplay('invert', v)),
      h('p', { class: 'note' }, 'These choices are kept in this browser for your next visit.'));

    // World
    const worldRows = [];
    if (g.scene === 'world') {
      const seedLine = h('span', {});
      const copied = h('span', { class: 'note', 'aria-live': 'polite' });
      const copyBtn = h('button', { type: 'button', onclick: async () => { copied.textContent = (await g.copyLink()) ? 'link copied' : 'could not copy: the address bar has it'; setTimeout(() => { copied.textContent = ''; }, 2500); } }, 'copy a link to this world');
      this.refresh.push(() => { seedLine.textContent = `seed ${g.seed}`; });
      const field = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'seed to open', placeholder: 'seed', maxlength: '10',
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); openSeed(); } } });
      const openSeed = () => { const v = field.value.trim(); if (/^\d{1,10}$/.test(v)) g.newWorld(Number(v) >>> 0); else { field.value = ''; field.placeholder = 'digits only'; } };
      worldRows.push(
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'this world'), h('div', { class: 'inline' }, seedLine, copyBtn, copied)),
        h('div', { class: 'row' }, h('span', { class: 'label' }, 'another world'),
          h('div', { class: 'inline' }, field, h('button', { type: 'button', onclick: openSeed }, 'open this seed'),
            h('button', { type: 'button', onclick: () => g.newWorld() }, 'a new world'))));
    }
    const clock = h('p', { class: 'line' });
    this.refresh.push(() => { clock.textContent = g.clockLine(); });
    worldRows.push(
      h('div', { class: 'row' }, h('span', { class: 'label' }, 'time of day'),
        h('div', { class: 'opts' }, TIMES.map(([v, t]) => h('button', { type: 'button', onclick: () => { g.setTime(v); this.update(); } }, t)))),
      clock,
      this.choice('how fast time runs', RATES.map(([t, r]) => [r, t]), () => g.rate, (v) => g.setRate(v)),
      this.choice('weather', [['auto', 'automatic'], ...KINDS.map((k) => [k, k])], () => g.weather, (v) => g.setWeather(v)));
    const wx = h('p', { class: 'note' });
    this.refresh.push(() => { wx.textContent = g.weatherLine(); });
    worldRows.push(wx);
    sections.world = this.section('world', 'World', worldRows);

    // Advanced, collapsed until asked for
    const C = LOOK.choices;
    const workers = h('p', { class: 'line' });
    this.refresh.push(() => { workers.textContent = g.workersLine(); });
    this.advBody = h('div', { id: 'menu-advanced', hidden: true },
      h('h3', {}, 'look candidates and comparisons (phases 0c and 2a)'),
      Object.entries(C).map(([name, c]) => this.choice(`${c.label} (key ${c.key})`, Object.entries(c.options).map(([k, label]) => [k, label.startsWith(k) ? label : `${k}: ${label}`]),
        () => String(g.look[name]), (v) => g.setLook(name, v))),
      h('h3', {}, 'fixed cameras'),
      h('div', { class: 'opts' }, g.cameras.map((cam, i) => h('button', { type: 'button', onclick: () => { g.camera(i); this.update(); } }, `${i + 1} ${cam.name}`))),
      h('h3', {}, 'scenes'),
      h('div', { class: 'opts' }, [['world', 'the generated world'], ['lab', 'the Look Lab'], ['stress', 'the stress scene']].map(([s, t]) =>
        h('button', { type: 'button', 'aria-pressed': String(g.scene === s), onclick: () => g.goScene(s) }, t))),
      h('h3', {}, 'workers'),
      workers);
    this.advBtn = h('button', { type: 'button', class: 'disclose', 'aria-expanded': 'false', 'aria-controls': 'menu-advanced', onclick: () => this.setAdvanced(!this.advOpen) }, 'Advanced  +');
    sections.advanced = h('section', { 'aria-labelledby': 'menu-h-advanced' },
      h('h2', { id: 'menu-h-advanced', tabindex: '-1' }, this.advBtn),
      h('p', { class: 'note' }, 'The comparison tools of earlier phases.'),
      this.advBody);
    this.body.append(sections.controls, sections.display, sections.world, sections.advanced);
    this.sections = sections;
    this.advOpen = false;
  }

  section(id, title, ...kids) {
    return h('section', { 'aria-labelledby': `menu-h-${id}` }, h('h2', { id: `menu-h-${id}`, tabindex: '-1' }, title), kids);
  }

  setAdvanced(on) {
    this.advOpen = on;
    this.advBody.hidden = !on;
    this.advBtn.setAttribute('aria-expanded', String(on));
    this.advBtn.textContent = on ? 'Advanced  -' : 'Advanced  +';
  }

  // A row of buttons, one pressed: [value, text, words?]. With `describe`,
  // the pressed one's words are written out under the row.
  choice(label, opts, get, set, describe = false) {
    const id = `m-${label.replace(/[^a-z0-9]+/gi, '-')}`;
    const words = describe ? h('p', { class: 'note', id: `${id}-d` }) : null;
    const btns = opts.map(([v, t, title]) => h('button', { type: 'button', title: describe ? null : title, 'aria-describedby': describe ? `${id}-d` : null, onclick: () => { set(v); this.update(); } }, t));
    this.refresh.push(() => {
      const cur = get();
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === cur)));
      if (words) { const o = opts.find((x) => x[0] === cur); words.textContent = o && o[2] ? o[2] : ''; }
    });
    return h('div', { class: 'row', role: 'group', 'aria-labelledby': id }, h('span', { class: 'label', id }, label), h('div', { class: 'opts' }, btns), words);
  }

  toggle(label, get, set) {
    const b = h('button', { type: 'button', onclick: () => { set(!get()); this.update(); } });
    this.refresh.push(() => { const on = get(); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'on' : 'off'; });
    const id = `m-${label.replace(/[^a-z0-9]+/gi, '-')}`;
    b.setAttribute('aria-labelledby', `${id} ${id}-v`);
    b.id = `${id}-v`;
    return h('div', { class: 'row' }, h('span', { class: 'label', id }, label), b);
  }

  slider(label, min, max, step, get, set, fmt) {
    const id = `m-${label.replace(/[^a-z0-9]+/gi, '-')}`;
    const out = h('span', {});
    const r = h('input', { type: 'range', min, max, step, 'aria-labelledby': id, oninput: () => { set(Number(r.value)); out.textContent = fmt(Number(r.value)); } });
    this.refresh.push(() => { if (document.activeElement !== r) r.value = String(get()); out.textContent = fmt(get()); r.setAttribute('aria-valuetext', fmt(get())); });
    return h('div', { class: 'row' }, h('span', { class: 'label', id }, label), h('div', { class: 'inline' }, r, out));
  }

  update() { for (const f of this.refresh) f(); }

  show() {
    if (this.open) return;
    this.open = true;
    this.update();
    this.root.classList.add('on');
    this.root.setAttribute('aria-hidden', 'false');
    // (the next frame, so the fade runs)
    requestAnimationFrame(() => this.root.classList.add('shown'));
    this.resumeBtn.focus({ preventScroll: true });
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('shown', 'on');
    this.root.setAttribute('aria-hidden', 'true');
    if (this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  // Tab and Shift+Tab stay inside the menu while it is open.
  trap(e) {
    if (!this.open || e.key !== 'Tab') return;
    const f = this.focusables();
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
  }

  focusables() {
    return [...this.panel.querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent !== null);
  }

  // For the tools (lab.menu): what the menu shows.
  read() {
    return {
      open: this.open, advanced: this.advOpen,
      focused: this.root.contains(document.activeElement) ? (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || document.activeElement.type) : null,
      controls: this.focusables().length,
      sections: Object.keys(this.sections),
      keys: [...this.sections.controls.querySelectorAll('dt')].map((d) => d.textContent),
    };
  }
}
