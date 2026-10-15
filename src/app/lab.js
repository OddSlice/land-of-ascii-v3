// The debug handle the tools use (window.lab; src/main.js makes it): stand
// at a fixed camera or anywhere, freeze the clocks, read the cells, the
// timings and the memory, and drive the menu, the people, the animals, the
// sound and the progress as a player would. It reads the page's state live,
// through `app` (src/main.js).
import { VERSION } from './menu.js';
import { sketchCard } from './share.js';
import { F as FAVOUR, fromJSON as progressFrom, toJSON as progressJSON } from '../game/progress.js';
import { LOOK } from '../look.js';
import { buildAtlas } from '../present/atlas.js';
import { KINDS, forecastOf, mainKind } from '../weather.js';
import { EYE } from '../world/layout.js';
import { groundAt } from '../world/objects.js';
import { worldHash } from '../world/pack.js';

export function labParts(app) {
  app.lab.bench = app.game.bench;   // (for the tools)
  // (phase 5b) the sound, for the tools: off unless a tool turns it on (the
  // page then needs no click: the tools' browsers allow sound from the start)
  app.lab.sound = {
    enable() { if (!app.sound) return false; app.sound.allowed = true; return app.sound.unlock(); },
    get on() { return !!(app.sound && app.sound.on); },
    get settings() { return app.sound ? { ...app.sound.settings } : null; },
    set(name, v) { if (app.sound) app.sound.set(name, v); },
    startLog() { if (!app.sound) return; app.sound.log = []; app.sound.peak = 0; app.sound.prePeak = 0; app.sound.maxVoices = 0; app.sound.dropped = 0; },
    takeLog() { if (!app.sound || !app.sound.log) return null; const l = app.sound.log; app.sound.log = []; return l; },
    get spikes() { return app.sound ? (app.sound.spikes || []).slice() : []; },
    get state() { return app.sound && app.sound.on ? { peak: app.sound.peak, prePeak: app.sound.prePeak || 0, maxVoices: app.sound.maxVoices, voices: app.sound.voicesNow, dropped: app.sound.dropped, ms: app.sound.ms, beds: app.sound.bedLog || null, underfoot: app.sound.underfoot || null, ctx: app.sound.ctx.state, time: app.sound.ctx.currentTime } : null; },
    scene() { if (!app.sound || !app.sound.scene) return null; const c = (g) => g.cells.reduce((a, x) => a + x.length, 0); const S = app.sound.scene; return { lake: c(S.water.lake), river: c(S.water.river), sea: c(S.water.sea), trees: c(S.trees), fires: c(S.fires), wells: S.wells.slice(), chapels: S.chapels.slice(), gate: S.gate, bridges: S.bridges.slice() }; },
    stream() { return app.sound && app.sound.on ? app.sound.recordStream() : null; },
    get engine() { return app.sound; },
    // (0.5.3) the music: what plays, and the next piece now
    get music() { const m = app.sound && app.sound.music; return m ? { playing: !!m.piece, mode: m.piece ? m.piece.mode : null, bpm: m.piece ? +m.piece.bpm.toFixed(1) : null, lead: m.piece ? m.piece.lead : null, played: m.played, nextIn: m.piece ? 0 : +(m.nextAt - app.sound.ctx.currentTime).toFixed(1) } : null; },
    nextPiece() { if (app.sound && app.sound.music) app.sound.music.next(); },
  };
  app.lab.version = VERSION;
  // (phase 4a) people, for the tools and the menu (before the menu, which
  // lists them)
  // (0.5.5) the signposts, read: [{ x, z, arms: [{ a, to: [{ name, dist }] }] }]
  app.lab.signs = () => (app.signs ? app.signs.posts.map((P, i) => { app.signs.read(i); return { x: P.x, z: P.z, arms: P.arms.map((r) => ({ a: r.a, to: r.to.map((t) => ({ name: t.name, dist: Math.round(t.dist) })) })) }; }) : []);
  // (phase 6) the title screen, for the tools: is it up, is its panel
  // forward, its choices' words, what has focus, its foot and its note
  app.lab.titleState = () => (app.title ? {
    up: app.title.up, shown: app.title.shown, choices: app.title.choices.map((c) => c.innerText.replace(/\s+/g, ' ').trim()),
    focus: document.activeElement ? document.activeElement.innerText || document.activeElement.getAttribute('aria-label') || '' : '',
    foot: app.title.foot.textContent, note: app.title.note.textContent, welcome: app.title.welcome.textContent, spots: app.lab.titleSpots || [], measuring: app.title.root.classList.contains('measuring'),
  } : null);
  // (and Play or Continue, as the focused choice would)
  app.lab.titlePlay = () => { if (!app.card.up) return false; app.leaveTitle(); return true; };
  app.lab.shareLink = (withPlace) => app.shareLink(withPlace);
  // (a sketch's share card, as a PNG data URL)
  app.lab.shareCard = async (id) => { const sk = app.way.progress.sketches.find((x) => x.id === id); const cells = sk && await app.way.sketchCells(id); return cells ? sketchCard(cells, sk.cols, sk.rows, app.SEED).toDataURL('image/png') : null; };
  app.lab.pace = () => ({ every: app.pacer.every, cap: app.pacer.cap, refresh: app.pacer.refresh });
  app.lab.people = {
    get count() { return app.people ? app.people.n : 0; },
    get on() { return !!(app.people ? app.people.on : app.yardFolk && app.yardFolk.on); },
    set(on) { if (app.people) app.people.setOn(on, app.player); if (app.yardFolk) app.yardFolk.on = !!on; },
    list() { return app.people ? app.people.list() : []; },
    get updateMs() { return app.people ? app.people.updateMs : 0; },
    // which houses are lit, asleep or awake at home this frame (see litGroups)
    get lit() { return app.people ? Array.from(app.people.lit) : []; },
    get buildMs() { return app.people ? app.people.buildMs : 0; },
    // the camera beside person i, `dist` metres off, looking at them
    goTo(i, dist = 3) {
      if (!app.people) return false;
      const p = app.people.list()[i];
      if (!p) return false;
      const a = p.yaw + 0.6, x = p.x + Math.sin(a) * dist, z = p.z + Math.cos(a) * dist;
      app.player.place(x, z, Math.atan2(p.x - x, p.z - z), -0.08);
      app.state.held = false; app.state.camName = `with ${p.name}`;
      return true;
    },
    greet() { app.greet(); return app.lab.lastSaid || null; },
  };
  // (phase 4b) animals, for the tools and the menu: counts by kind, the
  // groups, and the camera to one of them
  app.lab.animals = {
    get on() { return !!(app.animals ? app.animals.on : app.yardBeasts && app.yardBeasts.on); },
    set(on) { if (app.animals) app.animals.setOn(on); if (app.yardBeasts) app.yardBeasts.on = !!on; if (!on && app.player) app.player.others = null; },
    counts() { return app.animals ? app.animals.counts() : []; },
    groups() { return app.animals ? app.animals.groups() : []; },
    get updateMs() { return app.animals ? app.animals.updateMs : 0; },
    get buildMs() { return app.animals ? app.animals.buildMs : 0; },
    get left() { return app.animals ? app.animals.left : 0; },
    // this frame's states (AS numbers each) and how many
    states() { return app.animals ? Array.from(app.animals.st.subarray(0, app.animals.count * 16)) : []; },
    // where group g is this frame (the middle of its members)
    where(g) { return app.animals ? app.animals.where(g) : null; },
    // the camera `dist` metres off group g, looking at it (from its open side)
    goTo(g, dist = 12, pitch = null) {
      if (!app.animals) return false;
      if (app.people && app.people.planned < 0) app.people.planDay(app.state.day);
      app.animals.update(app.state.day, app.state.hour, null, null, null, app.weatherNow());
      const w = app.animals.where(g);
      if (!w) return false;
      const info = app.animals.groups()[g];
      const a = (g * 2.39996) % (Math.PI * 2);
      let best = null;
      for (let k = 0; k < 12; k++) {
        const b = a + k * Math.PI / 6, x = w.x + Math.sin(b) * dist, z = w.z + Math.cos(b) * dist;
        if (!app.player.blocked(x, z, app.player.restAt ? app.player.restAt(x, z) : 0)) { best = [x, z]; break; }
      }
      const [x, z] = best || [w.x + Math.sin(a) * dist, w.z + Math.cos(a) * dist];
      // (looking at them: up to a perch, down to the water)
      const eye = app.player.restAt(x, z) + EYE, d = Math.hypot(w.x - x, w.z - z);
      app.player.place(x, z, Math.atan2(w.x - x, w.z - z), pitch !== null ? pitch : w.y !== null ? Math.atan2(w.y + 0.4 - eye, d) : -0.1);
      app.state.held = false; app.state.camName = `by the ${info.type}`;
      return true;
    },
  };
  // (phase 5a) the progress, for the tools: on or off, read, set, clear;
  // the journal, the exchange, sketches and the lantern, driven as a player would
  app.lab.progress = {
    get on() { return !!(app.way && app.way.on); },
    // turn it on in a tool (it starts cleared; `store: false` keeps nothing)
    enable(opts = {}) { if (!app.way) return false; app.way.enable({ meet: false, ...opts }); return true; },
    get() { return app.way && app.way.on ? JSON.parse(progressJSON(app.way.progress)) : null; },
    set(json) {
      if (!app.way || !app.way.on) return false;
      const p = progressFrom(typeof json === 'string' ? json : JSON.stringify(json), app.SEED, app.world.N);
      if (!p) return false;
      app.way.progress = p; app.way.afterReset();
      return true;
    },
    clear() { if (app.way && app.way.on) app.way.clear(); },
    save() { if (app.way && app.way.on) app.way.save(true); },
    stored() { try { return localStorage.getItem(`land-of-ascii-v3.progress.${app.SEED}`); } catch { return null; } },
    note() { return app.way ? app.way.store.note : ''; },
    get ms() { return app.way ? app.way.ms : 0; },
    get saveMs() { return app.way ? app.way.saveMs || 0 : 0; },
    get saves() { return app.way ? app.way.saves || 0 : 0; },
    get buildMs() { return app.way ? app.way.buildMs : 0; },
    places() { return app.way && app.way.on ? app.way.places.list.map((p) => ({ id: p.id, kind: p.kind, title: p.title, where: p.where, x: p.x, z: p.z, D: p.D, at: p.at })) : []; },
    favours() {
      if (!app.way || !app.way.on) return [];
      return app.way.fav.list.map((f) => ({ id: f.id, kind: f.kind, giver: f.giver, giverName: app.people.P.persons[f.giver].name, dest: f.dest, destName: f.dest !== undefined ? app.people.P.persons[f.dest].name : null,
        spot: f.spot ? { x: f.spot.x, z: f.spot.z, ft: f.spot.ft, kind: f.spot.kind, lost: f.spot.lost } : null, len: f.len, parent: f.parent, first: !!f.first, shape: f.shape,
        ask: f.ask, state: app.way.stateOf(f), words: app.way.journal().favours.find((x) => x.id === f.id)?.words || null,
        usual: { giver: app.way.fav.usual.get(f.giver) ? { place: app.way.fav.usual.get(f.giver).place } : null, dest: f.dest !== undefined && app.way.fav.usual.get(f.dest) ? { place: app.way.fav.usual.get(f.dest).place } : null } }));
    },
    // a favour's state set directly (0 new .. 4 done)
    setFavour(id, st) { const f = app.way.fav.list.find((x) => x.id === id); if (!f) return false; app.way.setState(f, st, app.state.day, app.state.hour); return true; },
    meet() { const m = app.way && app.way.fav && app.way.fav.meet; return m ? { person: m.person, name: app.people.P.persons[m.person].name, dep: m.dep, arrive: m.arrive, leave: m.leave, back: m.back, spot: { x: m.spot.x, z: m.spot.z, yaw: m.spot.yaw }, on: app.way.meetOn, town: m.town } : null; },
    journal: {
      open(tab) { return app.openJournal(tab); }, close() { app.closeJournal(); }, read() { return app.journal.read(); },
      tab(id) { app.journal.select(id, true); }, view(id) { return app.journal.view(id); }, page(d) { app.journal.page(d); }, shut() { return app.journal.shutViewer(); },
      data() { return app.way && app.way.on ? app.way.journal() : null; },
    },
    talk: { read() { return app.talk.read(); }, go() { app.talk.go(); }, choose(yes) { app.talk.choose(yes); }, later() { app.talk.later(); } },
    async sketch() { app.sketch(); await new Promise((r) => setTimeout(r, 50)); for (let k = 0; k < 40 && !app.lab.lastSketch; k++) await new Promise((r) => setTimeout(r, 25)); const r2 = app.lab.lastSketch; app.lab.lastSketch = null; return r2; },
    async sketchHash(id) { const c = await app.way.sketchCells(id); if (!c) return null; let h = 0x811c9dc5; for (let i = 0; i < c.length; i++) { h ^= c[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); },
    async sketchText(id) { const s = app.way.progress.sketches.find((x) => x.id === id); const c = await app.way.sketchCells(id); const { sketchText } = await import('./journal.js'); return c ? sketchText(c, s.cols, s.rows) : null; },
    lantern() { return app.lantern(); },
    setLit(on) { if (!app.way || !app.way.on) return false; if (on && !app.way.progress.lantern) app.way.progress.lantern = true; app.way.progress.lit = !!on; app.way.touch(true); return true; },
    backup() { return app.way.backup(); },
    restore(text) { return app.way.restore(text); },
    you() { return app.youNow ? { ...app.youNow, lost: app.youNow.lost.slice() } : null; },
    FAVOUR,
  };
}

export function labCore(app) {
  // ---- the debug handle ---------------------------------------------------------

  Object.assign(app.lab, {
    ready: app.ready,
    threads: app.THREADS,
    stress: app.STRESS,
    scene: app.WORLD ? 'world' : app.STRESS ? 'stress' : app.YARD ? 'yard' : 'lab',
    seed: app.SEED,
    shared: app.SHARED,
    cameras: app.CAMS,
    // Stand at a fixed camera (0..8, or 0..2 in the stress scene); also sets its time of day.
    camera(i) { app.useCamera(i); },
    // Place the eye. Angles in degrees; without y the feet stand on the ground,
    // with y the eye stays at that height until a walk key is pressed.
    setCamera({ x, z, y, yaw = 0, pitch = 0 }) {
      app.player.place(x, z, yaw * app.DEG, pitch * app.DEG, y !== undefined ? y - EYE : undefined);
      app.state.held = y !== undefined;
      app.state.camName = 'free';
    },
    // Freeze every clock (time of day and the animation clock); `day` sets
    // the day count too (the moon's phase).
    freeze(hour, t = 0, day) {
      app.state.frozen = true; app.state.running = false;
      if (hour !== undefined) app.state.hour = typeof hour === 'string' ? LOOK.hours[hour] : hour;
      app.state.t = t;
      if (day !== undefined) app.state.day = day;
    },
    setDay(d) { app.state.day = d; },
    unfreeze() { app.state.frozen = false; },
    setHour(h) { app.state.hour = typeof h === 'string' ? LOOK.hours[h] : h; },
    // (`rate`: game hours a real second, phase 2b; the menu's speeds)
    runClock(on = true, rate) { app.state.running = on; if (rate !== undefined) app.state.rate = rate; },
    setDensity(i) { app.setDisplay('density', Math.max(0, Math.min(3, i)), false); },
    setGlyphs(on) { app.setDisplay('glyphs', !!on, false); },
    setHud(on) { app.hud.force(on ? 'full' : 'none'); },
    // The menu, the hint and the start card suppressed (the tools), or not.
    setQuiet(on) {
      app.QUIET = !!on;
      if (app.QUIET) { app.closeMenu(false); if (app.card.up) app.leaveTitle(); app.hideHint(); }
      // (the tools' pictures carry no statistics unless they ask: lab.setHud)
      app.hud.setMode(app.QUIET ? 'none' : app.display.hud);
    },
    // The menu, for the tools: open it, close it, read what it shows.
    menu: {
      open() { return app.openMenu(); },
      close(recapture = false) { app.closeMenu(recapture); },
      isOpen() { return app.menu.open; },
      read() { return { ...app.menu.read(), quiet: app.QUIET, card: app.card.up, hint: app.$('hint').classList.contains('on'), hud: app.hud.shown, display: { ...app.display } }; },
    },
    // Hold the frame pacing: a frame every `every` refreshes, each shown `lag`
    // refreshes after it was asked for (setPace() for adaptive again).
    setPace(every, lag = every) { app.pacer.fixed = every ? [every, lag] : null; if (every) { app.pacer.every = every; app.pacer.lag = lag; } },
    // The weather: setWeather('auto') for the forecast, or one kind held
    // ('clear', 'fair', 'overcast', 'rain', 'mist'); weather() what it is now
    // (the mode, the kind that applies most, the frame's mix, wetness and
    // drift, and today's forecast).
    // (for the tools also a frame's weather itself, { mix, wet, drift }: e.g.
    // { mix: { fair: 1 }, wet: 1 }, fair weather on wet ground)
    setWeather(mode) {
      if (mode === 'auto' || KINDS.includes(mode)) app.state.weather = mode;
      else if (mode && typeof mode === 'object' && mode.mix) app.state.weather = { mix: { ...mode.mix }, wet: +mode.wet || 0, drift: +mode.drift || 0 };
      return app.state.weather;
    },
    weather() { const w = app.weatherNow(); return { mode: app.state.weather, kind: mainKind(w), ...w, forecast: forecastOf(app.SEED, app.state.day) }; },
    state() {
      return {
        x: app.player.x, z: app.player.z, eye: app.player.eye, yaw: app.player.yaw / app.DEG, pitch: app.player.pitch / app.DEG,
        hour: app.state.hour, t: app.state.t, day: app.state.day, frozen: app.state.frozen, running: app.state.running,
        preset: app.state.preset, cols: app.grid.cols, rows: app.grid.rows, cells: app.grid.cells, cw: app.grid.cw, dpr: app.dpr,
        threads: app.THREADS, presented: app.state.presented, camName: app.state.camName, settled: app.light.settled,
        isolated: !!self.crossOriginIsolated, shared: app.SHARED, mode: app.player.mode, flying: app.player.flying,
        pace: app.local ? 1 : app.pacer.every, lag: app.local ? 0 : app.pacer.lag, refresh: app.pacer.refresh,
        weather: app.state.weather, menu: app.menu.open, rate: app.state.running ? app.state.rate : 0,
        glyphs: app.presenter.glyphs, sensitivity: app.input.sensitivity, invert: app.input.invert,
        stripes: app.pool && app.pool.edges ? Array.from(app.pool.edges) : null,
      };
    },
    // Resolves once a frame made after this call is on screen, with cast
    // shadows caught up (unless the clock is running).
    whenIdle() {
      return app.ready.then(() => new Promise((resolve) => app.waiters.push({ seq: app.state.seq + 1, resolve })));
    },
    // The next n presented frames' timings.
    timings(n) {
      return new Promise((resolve) => {
        const list = [];
        list.push = function (x) { Array.prototype.push.call(this, x); if (this.length >= n) { app.collectors = app.collectors.filter((c) => c !== this); resolve(Array.from(this)); } return this.length; };
        app.collectors.push(list);
      });
    },
    stats() { return { ...app.timing, ...app.light }; },
    // Walk with the given keys held for a number of seconds of game time, in
    // fixed 1/60 s steps (for tests; the frame rate does not matter).
    walk(keys, seconds) {
      const held = Object.fromEntries(keys.map((k) => [k, true]));
      for (let i = 0; i < Math.round(seconds * 60); i++) app.player.update(1 / 60, held);
      return { x: app.player.x, z: app.player.z, feet: app.player.feet };
    },
    // A copy of the whole cell buffer (for tools that compare frames).
    cells() { return app.full.slice(); },
    // FNV-1a over the whole cell buffer, to compare workers with ?threads=0.
    cellHash() {
      let h = 0x811c9dc5;
      for (let i = 0; i < app.full.length; i++) { h ^= app.full[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16).padStart(8, '0');
    },
    atlasReport() { return [...app.atlases.values()].map((a) => ({ cw: a.cw, ch: a.ch, fontPx: +a.fontPx.toFixed(2), shades: a.report })); },
    // The atlas for a cell width as a PNG data URL (white ink on black), for checking glyphs.
    atlasPNG(cw) {
      const a = cw ? (app.atlases.get(cw) || buildAtlas(cw, cw * 2)) : app.atlases.get(app.grid.cw);
      const c = document.createElement('canvas');
      c.width = a.width; c.height = a.height;
      const g = c.getContext('2d');
      const img = g.createImageData(a.width, a.height);
      for (let i = 0; i < a.cov.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = a.cov[i]; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      return { url: c.toDataURL('image/png'), report: a.report, fontPx: a.fontPx };
    },
    world: {
      kind: app.world.kind, N: app.world.N, trees: app.world.objects.trees.length, bushes: app.world.objects.bushes.length, torches: app.world.objects.torches.length,
      get buildMs() { return app.buildMs(); }, get sweepMs() { return app.shadows ? app.shadows.sweepMs : app.light.sweepMs; },
      seed: app.SEED, sites: app.world.sites, roads: app.world.roads ? app.world.roads.map((r) => ({ id: r.id, to: r.to, x: Array.from(r.x), z: Array.from(r.z) })) : null,
      times: app.world.times || null,
    },
    // The generated world's arrays, hashed (the same seed must give the same bytes on any thread).
    worldHash() { return app.packed ? worldHash(app.packed) : null; },
    // Fly (F) on or off.
    setFly(on) { if ((app.WORLD || app.YARD) && app.player.flying !== !!on) app.player.toggleFly(); },
    // The overhead map (M) on or off.
    setMap(on) { if (app.map && app.map.on !== !!on) { app.map.toggle(); if (app.mapOver) app.mapOver.show(app.map.on); } },
    // Turn to a yaw (degrees) without moving.
    face(yaw) { app.player.yaw = yaw * app.DEG; },
    // The ground and the drawn surface (the water's level where there is water) at a point.
    ground(x, z) {
      const T = app.world.terrain;
      return { ground: groundAt(T, x, z), surface: groundAt({ ground: T.levels[0].H, N: T.N, NN: T.NN }, x, z) };
    },
    // Memory the page and its workers use, where the browser can say
    // (Chromium, cross-origin isolated). `shared`: the bytes of shared memory
    // (the world and the shadow stores), which the browser counts again for
    // every thread that reads them; `holders`: how many threads do.
    async memory() {
      if (!performance.measureUserAgentSpecificMemory) return null;
      const m = await performance.measureUserAgentSpecificMemory();
      let shared = 0;
      if (app.SHARED && app.packed) {
        for (const a of Object.values(app.packed.arrays)) shared += a.byteLength;
        for (const st of [app.shadowStores.V, ...app.shadowStores.S]) for (const a of [].concat(st)) shared += a.byteLength;
      }
      return { bytes: m.bytes, shared, holders: app.SHARED ? app.THREADS + 2 : 1,
        breakdown: m.breakdown.map((b) => ({ bytes: b.bytes, types: b.types, scope: b.attribution.map((a) => a.scope).join(',') })) };
    },
  });
}
