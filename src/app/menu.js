// The menu (phase 2b; laid out again after it): Escape opens it over the
// world, which stays drawn behind it, dimmed, while the clock and movement
// stand still. A rail on the left names the game, says where and when you
// are (the seed, the time, the weather) and holds the four sections as tabs,
// each with its icon: Controls (every key, the only place the full list
// appears), Display (the choices kept for the next visit), World (the time,
// the weather, the seed) and Advanced (the tools of earlier phases). One
// section shows at a time. Resume sits at the foot of the rail. Plain HTML
// over the canvas; every control works by mouse and by keyboard alone (the
// arrow keys move between the tabs), and Tab stays inside it while it is
// open. It holds no game state of its own: it reads and sets it through
// `game` (src/main.js).
import { LOOK } from '../look.js';
import { KINDS } from '../weather.js';
import { icon } from './icons.js';

/* global __VERSION__, __BUILT__ */
// (set by the build from package.json; 'dev' when served from src/)
export const VERSION = typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'dev';
const BUILT = typeof __BUILT__ !== 'undefined' ? __BUILT__ : '';

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
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

// Every key, grouped by purpose, with a few plain words each: [keys, words],
// each key drawn as a keycap.
function keyGroups(scene) {
  const world = scene === 'world';
  return [
    ['moving', 'move', [
      [['W', 'A', 'S', 'D'], 'walk'],
      [['Shift'], 'run, while held'],
      [['Space'], world ? 'jump; rise, while flying' : 'jump'],
      world && [['F'], 'fly on or off'],
      world && [['E'], 'greet someone; say yes to a favour'],
    ]],
    world && ['wayfaring', 'book', [
      [['J'], 'your journal'],
      [['K'], 'sketch the view'],
      [['L'], 'your lantern, once you have one'],
    ]],
    ['looking', 'eye', [
      [['mouse'], 'look round (click the picture; Esc frees the mouse)'],
      [['drag'], 'look round where the mouse cannot be held'],
      [['arrows'], 'look round'],
    ]],
    ['time', 'clock', [
      [['1', '2', '3', '4'], 'day, dusk, night, dawn'],
      [['T'], 'stop or start the clock'],
    ]],
    ['world', 'map', [
      world ? [['R'], 'a new world from a new seed'] : [['R'], 'the reference frame beside the picture (the Look Lab)'],
      world && [['M'], 'the map: # fort, o village, * viewpoint, + spawn, @ you'],
      world && [['N'], 'sound on or off'],
      [['G'], 'glyphs on or off'],
      [['-', '+'], 'less or more detail'],
      !world && [['X'], scene === 'stress' ? 'the Look Lab' : 'the stress scene'],
    ]],
    ['views', 'camera', [
      [['C'], 'the next fixed camera'],
      [world ? ['Shift', 'L'] : ['L'], 'the look panel; 5 6 8 9 0 cycle its choices'],
      [['H'], 'full statistics on or off'],
      [['Esc'], 'this menu'],
    ]],
  ].filter(Boolean).map(([name, ic, rows]) => [name, ic, rows.filter(Boolean)]);
}

const TABS = [
  ['controls', 'Controls', 'keyboard', 'Every key, and what it does.'],
  ['display', 'Display', 'monitor', 'How the picture is drawn. Kept in this browser for your next visit.'],
  ['sound', 'Sound', 'speaker', 'What you hear, made from the land as you go, and the music between. Kept in this browser for your next visit.'],
  ['world', 'World', 'landscape', 'The time, the weather and the seed.'],
  ['advanced', 'Advanced', 'sliders', 'The comparison tools of earlier phases.'],
];
const DETAIL = [
  ['coarse', 'about 15,000 large cells, the fastest'],
  ['medium', 'about 25,000 cells'],
  ['fine', 'about 40,000 cells, the default'],
  ['finest', 'about 60,000 small cells, the slowest'],
];
const HUDS = [
  ['none', 'off', 'nothing over the picture'],
  ['minimal', 'compact', 'the frame rate, the frame time, the cells, the time and the weather on one line (the default)'],
  ['full', 'full', 'the time each stage takes, the cell grid, the workers, the world'],
];
export const RATES = [
  ['stopped', 0], ['real time', 1 / 3600], ['an hour a minute', 1 / 60], ['an hour in 15 s', 1 / 15], ['an hour in 4 s', 1 / 4],
];
const TIMES = ['dawn', 'day', 'dusk', 'night'];

export class Menu {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.open = false;
    this.tab = 'controls';
    this.refresh = [];             // functions that bring the controls up to date
    this.build();
    root.addEventListener('keydown', (e) => this.trap(e));
  }

  build() {
    const g = this.game;
    this.back = h('div', { class: 'back', onclick: () => g.close({ recapture: false }) });

    // the rail: the title, where and when you are, the tabs, Resume
    const where = h('span', {}), when = h('span', {});
    this.refresh.push(() => {
      const n = g.now();
      where.textContent = g.scene === 'world' ? `seed ${g.seed} · day ${n.day}` : g.scene === 'stress' ? 'the stress scene' : 'the Look Lab';
      when.textContent = `${n.clock} ${n.timeName} · ${n.weather}${n.running ? ' · clock running' : ''}`;
    });
    this.tabs = {};
    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': 'menu sections', onkeydown: (e) => this.tabKey(e) },
      TABS.map(([id, title, ic]) => (this.tabs[id] = h('button', {
        type: 'button', role: 'tab', id: `menu-tab-${id}`, 'aria-controls': `menu-panel-${id}`, onclick: () => this.select(id),
      }, icon(ic, 18), h('span', {}, title)))));
    this.resumeBtn = h('button', { type: 'button', class: 'resume', onclick: () => g.close({ recapture: true }) },
      icon('play', 14), h('span', {}, 'Resume'), h('kbd', { 'aria-hidden': 'true' }, 'Esc'));
    const rail = h('div', { class: 'rail' },
      h('div', { class: 'brand' }, h('h1', { id: 'menu-title' }, 'Land of Ascii'),
        h('p', { class: 'version', title: BUILT ? `built ${BUILT}` : 'served from the source' }, `version ${VERSION}`),
        h('p', { class: 'status', 'aria-live': 'off' }, where, when)),
      tablist);

    // (Resume comes after the section in the page, so Tab goes from a tab
    // into its section; the grid draws it at the foot of the rail)
    this.pane = h('div', { class: 'pane' });
    this.panel = h('div', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'menu-title' }, rail, this.pane,
      h('div', { class: 'foot' }, this.resumeBtn));
    this.root.append(this.back, this.panel);

    // the sections
    const sections = {};
    const page = (id, ...kids) => {
      const [, title, , lead] = TABS.find((t) => t[0] === id);
      const s = h('section', { role: 'tabpanel', id: `menu-panel-${id}`, 'aria-labelledby': `menu-tab-${id}`, hidden: true },
        h('header', {}, h('h2', {}, title), h('p', { class: 'lead' }, lead)), kids);
      sections[id] = s;
      return s;
    };

    // Controls: every key, in groups
    page('controls', h('div', { class: 'keygroups' }, keyGroups(g.scene).map(([name, ic, rows]) => h('div', { class: 'keygroup' },
      h('h3', {}, icon(ic, 15), name),
      h('dl', { class: 'keys' }, rows.map(([keys, t]) => h('div', {}, h('dt', {}, keys.map((k) => h('kbd', {}, k))), h('dd', {}, t))))))));

    // Display
    page('display',
      this.choice('detail level', DETAIL.map(([n, d], i) => [i, n, d]), () => g.display.density, (v) => g.setDisplay('density', v)),
      this.toggle('glyphs', 'the characters; off shows the cells as plain colour', () => g.display.glyphs, (v) => g.setDisplay('glyphs', v)),
      this.choice('statistics on screen', HUDS, () => g.display.hud, (v) => g.setDisplay('hud', v)),
      this.slider('mouse sensitivity', 0.25, 3, 0.05, () => g.display.sensitivity, (v) => g.setDisplay('sensitivity', v), (v) => `${v.toFixed(2)}×`),
      this.toggle('invert vertical look', 'moving the mouse up looks down', () => g.display.invert, (v) => g.setDisplay('invert', v)));

    // (phase 5b) Sound: on or off, the volume, and each kind of sound's share
    const snd = g.sound;
    const pct = (v) => `${Math.round(v * 100)}%`;
    const sv = (k) => () => (snd ? snd.settings[k] : 0), ss = (k) => (v) => { if (snd) snd.set(k, v); };
    const sndLine = h('p', { class: 'note' });
    this.refresh.push(() => { sndLine.textContent = !snd ? 'Sound plays in the generated world.' : snd.on ? '' : 'Sound starts with your first click in the picture.'; sndLine.hidden = !sndLine.textContent; });
    page('sound', sndLine,
      this.toggle('sound', 'N turns it on or off anywhere', () => !!snd && !snd.settings.muted, (v) => { if (snd) { if (snd.allowed) snd.unlock(); snd.set('muted', !v); } }),
      this.slider('volume', 0, 1, 0.05, sv('master'), ss('master'), pct),
      this.slider('music', 0, 1, 0.05, sv('music'), ss('music'), pct),
      h('h3', { class: 'part' }, 'each kind of sound'),
      this.slider('wind and rain', 0, 1, 0.05, sv('air'), ss('air'), pct),
      this.slider('water', 0, 1, 0.05, sv('water'), ss('water'), pct),
      this.slider('birds and beasts', 0, 1, 0.05, sv('life'), ss('life'), pct),
      this.slider('your footsteps', 0, 1, 0.05, sv('player'), ss('player'), pct),
      this.slider('fires, wells, bells and doors', 0, 1, 0.05, sv('places'), ss('places'), pct));

    // World: now, the time, the weather, then the seed
    const clock = h('span', { class: 'clock' }), clockLine = h('span', {});
    this.refresh.push(() => {
      const n = g.now();
      clock.textContent = n.clock;
      clockLine.textContent = `day ${n.day}${n.moon !== null ? ` · moon ${n.moon}% lit` : ''} · the clock is ${n.running ? 'running' : 'stopped'}`;
    });
    const worldRows = [
      h('div', { class: 'now' }, clock, clockLine),
      this.choice('time of day', TIMES.map((t) => [t, t, null, t]), () => g.now().preset, (v) => g.setTime(v), { words: false }),
      this.choice('how fast time runs', RATES.map(([t, r]) => [r, t]), () => g.rate, (v) => g.setRate(v), { words: false }),
      this.choice('weather', [['auto', 'automatic', null, 'auto'], ...KINDS.map((k) => [k, k, null, k])], () => g.weather, (v) => g.setWeather(v), { words: () => g.weatherLine() }),
    ];
    if (g.scene === 'world') {
      const seedLine = h('span', { class: 'seed' });
      const copied = h('span', { class: 'note', 'aria-live': 'polite' });
      const copyBtn = h('button', { type: 'button', onclick: async () => { copied.textContent = (await g.copyLink()) ? 'link copied' : 'could not copy: the address bar has it'; setTimeout(() => { copied.textContent = ''; }, 2500); } },
        icon('link', 15), h('span', {}, 'copy a link to this world'));
      this.refresh.push(() => { seedLine.textContent = `seed ${g.seed}`; });
      const field = h('input', { type: 'text', inputmode: 'numeric', 'aria-label': 'seed to open', placeholder: 'seed', maxlength: '10',
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); openSeed(); } } });
      const openSeed = () => { const v = field.value.trim(); if (/^\d{1,10}$/.test(v)) g.newWorld(Number(v) >>> 0); else { field.value = ''; field.placeholder = 'digits only'; } };
      worldRows.push(
        h('h3', { class: 'part' }, 'seed'),
        this.row('this world', null, h('div', { class: 'inline' }, seedLine, copyBtn, copied)),
        this.row('another world', 'the same seed always builds the same world', h('div', { class: 'inline' }, field,
          h('button', { type: 'button', onclick: openSeed }, icon('arrow', 15), h('span', {}, 'open this seed')),
          h('button', { type: 'button', onclick: () => g.newWorld() }, icon('dice', 15), h('span', {}, 'a new world'))), { wide: true }));
      worldRows.push(this.progressPart());
    }
    page('world', worldRows);

    // Advanced
    const C = LOOK.choices;
    const workers = h('span', {});
    this.refresh.push(() => { workers.textContent = g.workersLine(); });
    page('advanced',
      h('h3', { class: 'part' }, 'look candidates and comparisons (phases 0c and 2a)'),
      Object.entries(C).map(([name, c]) => this.choice(`${c.label} (key ${c.key})`, Object.entries(c.options).map(([k, label]) => [k, label.startsWith(k) ? label : `${k}: ${label}`]),
        () => String(g.look[name]), (v) => g.setLook(name, v), { words: false })),
      h('h3', { class: 'part' }, 'fixed cameras'),
      h('div', { class: 'opts' }, g.cameras.map((cam, i) => h('button', { type: 'button', onclick: () => { g.camera(i); this.update(); } }, `${i + 1} ${cam.name}`))),
      h('h3', { class: 'part' }, 'scenes'),
      h('div', { class: 'opts' }, [['world', 'the generated world'], ['lab', 'the Look Lab'], ['stress', 'the stress scene'], ['yard', 'the building yard']].map(([s, t]) =>
        h('button', { type: 'button', 'aria-pressed': String(g.scene === s), onclick: () => g.goScene(s) }, t))),
      this.peoplePart(),
      this.animalsPart(),
      h('h3', { class: 'part' }, 'workers'),
      h('p', { class: 'line' }, workers),
      this.benchPart());

    this.pane.append(...TABS.map(([id]) => sections[id]));
    this.sections = sections;
    this.select(this.tab, false);
  }

  // (phase 5a) What is saved for this world: a line saying what, a backup
  // to copy as text, a box to paste one back, and clearing it all (asked
  // first). Each world (seed) keeps its own.
  progressPart() {
    const g = this.game;
    if (!g.progress) return [];
    const line = h('p', { class: 'words saveline' }), note = h('p', { class: 'words' });
    const said = h('span', { class: 'note', 'aria-live': 'polite' });
    const tell = (t) => { said.textContent = t; clearTimeout(this.saidT); this.saidT = setTimeout(() => { said.textContent = ''; }, 3500); };
    this.refresh.push(() => { const P = g.progress; if (!P) return; line.textContent = P.line(); note.textContent = P.note(); });
    const copyBtn = h('button', { type: 'button', onclick: async () => { const t = await g.progress.backup(); tell((await g.copyText(t)) ? 'backup copied: keep it somewhere safe' : 'could not copy'); } }, icon('copy', 15), h('span', {}, 'copy a backup as text'));
    const box = h('textarea', { rows: '4', spellcheck: 'false', 'aria-label': 'paste a backup here', placeholder: 'paste a backup here' });
    const restoreBtn = h('button', { type: 'button', onclick: async () => {
      const r = await g.progress.restore(box.value);
      if (!r.ok) { tell(r.error); return; }
      box.value = '';
      if (r.other) { tell(`restored for seed ${r.seed}`); otherBtn.hidden = false; otherBtn.onclick = () => g.progress.open(r.seed); otherBtn.querySelector('span').textContent = `open seed ${r.seed}`; } else tell('restored');
      this.update();
    } }, icon('paste', 15), h('span', {}, 'restore from this text'));
    const otherBtn = h('button', { type: 'button', hidden: true }, icon('arrow', 15), h('span', {}, 'open that world'));
    const ask = h('div', { class: 'inline ask', hidden: true },
      h('span', {}, 'Clear everything saved for this world? It cannot be undone.'),
      h('button', { type: 'button', class: 'danger', onclick: () => { g.progress.clear(); ask.hidden = true; clearBtn.hidden = false; tell('cleared'); this.update(); clearBtn.focus(); } }, h('span', {}, 'clear it')),
      h('button', { type: 'button', onclick: () => { ask.hidden = true; clearBtn.hidden = false; clearBtn.focus(); } }, h('span', {}, 'keep it')));
    const clearBtn = h('button', { type: 'button', onclick: () => { ask.hidden = false; clearBtn.hidden = true; ask.querySelector('.danger').focus(); } }, icon('trash', 15), h('span', {}, 'clear progress'));
    return [
      h('h3', { class: 'part' }, 'your progress in this world'),
      this.row('saved', h('div', {}, line, note), h('div', { class: 'inline' }, copyBtn), { wide: true }),
      this.row('restore', 'paste a backup copied here before, then restore it', h('div', { class: 'restore' }, box, h('div', { class: 'inline' }, restoreBtn, otherBtn, said)), { wide: true }),
      this.row('start again', 'only this world: other seeds keep theirs', h('div', { class: 'inline' }, clearBtn, ask), { wide: true }),
    ];
  }

  // (phase 4a) Everyone in the world: name, role and what they are doing
  // now, brought up to date when the menu opens; choosing one stands you
  // beside them, looking at them.
  peoplePart() {
    const g = this.game;
    if (!g.people) return [];
    const list = h('div', { class: 'people' });
    const fill = () => {
      const ps = g.people.list();
      list.replaceChildren(...ps.map((p) => h('button', { type: 'button', class: 'person', onclick: () => { g.people.goTo(p.i); this.update(); } },
        h('b', {}, p.name), h('span', { class: 'role' }, p.role), h('span', { class: 'act' }, p.act))));
    };
    this.refresh.push(fill);
    return [h('h3', { class: 'part' }, 'people'), h('p', { class: 'words' }, `${g.people.count} people. Choose one to stand beside them.`), list];
  }

  // (phase 4b) The animals: how many of each kind, and the camera to a
  // flock, a herd, a deer group or a crow's perch (each press the next one,
  // from far enough off that they stay as they are).
  animalsPart() {
    const g = this.game;
    if (!g.animals) return [];
    const counts = h('p', { class: 'words' });
    const fill = () => { counts.textContent = g.animals.counts().filter((c) => c.n).map((c) => `${c.n} ${c.name}`).join(', ') + '.'; };
    this.refresh.push(fill);
    const next = {};
    const go = (type, dist) => {
      const gs = g.animals.groups().filter((x) => x.type === type);
      if (!gs.length) return;
      const k = next[type] = ((next[type] ?? -1) + 1) % gs.length;
      g.animals.goTo(gs[k].id, dist);
      this.update();
    };
    const kinds = [['flock', 'a flock', 14], ['herd', 'a herd', 18], ['deer', 'a deer group', 32], ['crow', 'a perch', 28], ['ducks', 'ducks', 16], ['gulls', 'gulls', 24]];
    return [h('h3', { class: 'part' }, 'animals'), counts,
      h('div', { class: 'opts' }, kinds.filter(([t]) => g.animals.groups().some((x) => x.type === t)).map(([t, label, d]) => h('button', { type: 'button', onclick: () => go(t, d) }, `to ${label}`)))];
  }

  // (phase 3b) The benchmark: run, cancel, the table, copy it as text. It
  // never starts by itself; closing the menu cancels it (main.js).
  benchPart() {
    const g = this.game, B = g.bench;
    const status = h('p', { class: 'words', 'aria-live': 'polite' }, `${g.cameras.length} cameras, in fair weather and rain, at this detail level: about ${Math.round(g.cameras.length * 2 * 1.6 / 10) * 10} seconds. The clock, the weather and the camera are put back after.`);
    const table = h('table', { class: 'bench', hidden: true });
    const copied = h('span', { class: 'note', 'aria-live': 'polite' });
    const copyBtn = h('button', { type: 'button', disabled: true, onclick: async () => { copied.textContent = (await g.copyText(B.text())) ? 'copied' : 'could not copy'; setTimeout(() => { copied.textContent = ''; }, 2500); } },
      icon('copy', 15), h('span', {}, 'copy as text'));
    const fill = () => {
      const inf = B.info || {};
      const cams = [...new Set(B.rows.map((r) => r.cam))];
      const cell = (r) => (r ? r.worker.toFixed(2) : '');
      table.replaceChildren(
        h('caption', {}, `${inf.browser} · ${inf.workers} · shared memory ${inf.shared ? 'yes' : 'no'} · ${inf.detail}, ${inf.cells}`),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'camera'), h('th', { scope: 'col' }, 'fair ms'), h('th', { scope: 'col' }, 'rain ms'))),
        h('tbody', {}, cams.map((c) => {
          const a = B.rows.find((r) => r.cam === c && r.weather === 'fair'), b = B.rows.find((r) => r.cam === c && r.weather === 'rain');
          return h('tr', {}, h('th', { scope: 'row' }, `${c + 1} ${(a || b).name}`), h('td', {}, cell(a)), h('td', {}, cell(b)));
        })));
      table.hidden = !B.rows.length;
    };
    const idle = () => { runBtn.disabled = false; stopBtn.disabled = true; copyBtn.disabled = !B.rows.length; fill(); };
    // (cancelled from here or by closing the menu: at once, whatever the run was waiting for)
    B.onCancel = () => { idle(); status.textContent = 'cancelled; everything is back as it was'; if (this.open) runBtn.focus(); };
    const runBtn = h('button', { type: 'button', onclick: async () => {
      runBtn.disabled = true; stopBtn.disabled = false; copyBtn.disabled = true;
      stopBtn.focus();
      status.textContent = 'starting';
      const run = B.run((done, total, row) => { status.textContent = `${done} of ${total}: ${row.name}, ${row.weather}, ${row.worker.toFixed(2)} ms`; fill(); });
      const mine = B.gen, rows = await run;
      // (only the latest run, not cancelled, speaks)
      if (!rows || mine !== B.gen) return;
      idle();
      const w = rows.reduce((m, r) => (r.worker > m.worker ? r : m));
      status.textContent = `done: the slowest frame ${w.worker.toFixed(2)} ms (${w.cam + 1} ${w.name}, ${w.weather}). Everything is back as it was.`;
      copyBtn.focus();
    } }, icon('gauge', 15), h('span', {}, 'run the benchmark'));
    const stopBtn = h('button', { type: 'button', disabled: true, onclick: () => B.cancel() }, icon('stop', 15), h('span', {}, 'cancel'));
    return [
      h('h3', { class: 'part' }, 'benchmark'),
      this.row('frame time per camera', status, h('div', { class: 'inline' }, runBtn, stopBtn), { wide: true }),
      table,
      h('div', { class: 'inline' }, copyBtn, copied),
    ];
  }

  // A setting: its name and a line of plain words on the left, its control
  // on the right (or under them when `wide`).
  row(label, words, control, { wide = false, id = `m-${slug(label)}` } = {}) {
    return h('div', { class: `setting${wide ? ' wide' : ''}` },
      h('div', { class: 'text' }, h('span', { class: 'label', id }, label), typeof words === 'string' ? h('p', { class: 'words' }, words) : words),
      h('div', { class: 'control' }, control));
  }

  // One of a few, as joined buttons, one pressed: [value, text, words?,
  // icon?]. `words`: by default the pressed one's words are written under
  // the name; a function writes its own line; false writes none.
  choice(label, opts, get, set, { words = true } = {}) {
    const id = `m-${slug(label)}`;
    const line = words ? h('p', { class: 'words', id: `${id}-d` }) : null;
    const btns = opts.map(([v, t, , ic]) => h('button', { type: 'button', 'aria-describedby': line ? `${id}-d` : null, onclick: () => { set(v); this.update(); } },
      ic ? icon(ic, 15) : null, h('span', {}, t)));
    this.refresh.push(() => {
      const cur = get();
      btns.forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === cur)));
      if (!line) return;
      if (typeof words === 'function') line.textContent = words();
      else { const o = opts.find((x) => x[0] === cur); line.textContent = o && o[2] ? o[2] : ''; }
    });
    return h('div', { class: 'setting wide', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'text' }, h('span', { class: 'label', id }, label), line),
      h('div', { class: 'control' }, h('div', { class: 'seg' }, btns)));
  }

  toggle(label, words, get, set) {
    const id = `m-${slug(label)}`;
    const state = h('span', { class: 'state', 'aria-hidden': 'true' });
    const b = h('button', { type: 'button', role: 'switch', class: 'switch', 'aria-labelledby': id, onclick: () => { set(!get()); this.update(); } },
      state, h('span', { class: 'track', 'aria-hidden': 'true' }, h('span', { class: 'knob' })));
    this.refresh.push(() => { const on = get(); b.setAttribute('aria-checked', String(on)); state.textContent = on ? 'on' : 'off'; });
    return this.row(label, words, b, { id });
  }

  slider(label, min, max, step, get, set, fmt) {
    const id = `m-${slug(label)}`;
    const out = h('output', { class: 'value' });
    const r = h('input', { type: 'range', min, max, step, 'aria-labelledby': id, oninput: () => { set(Number(r.value)); out.textContent = fmt(Number(r.value)); } });
    this.refresh.push(() => { if (document.activeElement !== r) r.value = String(get()); out.textContent = fmt(get()); r.setAttribute('aria-valuetext', fmt(get())); });
    return this.row(label, null, h('div', { class: 'inline' }, r, out), { id });
  }

  // Show one section; its tab is the one Tab reaches (the arrow keys move
  // between the tabs).
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
    const ids = TABS.map((t) => t[0]);
    const i = ids.indexOf(this.tab);
    const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    this.select(ids[(to + ids.length) % ids.length], true);
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
    return [...this.panel.querySelectorAll('button, input, textarea')].filter((el) => !el.disabled && el.tabIndex >= 0 && el.offsetParent !== null);
  }

  // For the tools (lab.menu): what the menu shows.
  read() {
    return {
      open: this.open, tab: this.tab, advanced: this.tab === 'advanced',
      focused: this.root.contains(document.activeElement) ? (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent || document.activeElement.type) : null,
      controls: this.focusables().length,
      sections: TABS.map((t) => t[0]),
      keys: [...this.sections.controls.querySelectorAll('dt')].map((d) => [...d.querySelectorAll('kbd')].map((k) => k.textContent).join(' ')),
    };
  }
}
