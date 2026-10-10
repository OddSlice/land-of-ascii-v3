// Land of Ascii v3, phases 0a and 0b: the Look Lab. Boot, the main loop, and
// the debug handle (window.lab) the tools use. ?stress=1 (or X) swaps in the
// stress scene, a big world for measuring the renderer; the lab's own scene is
// untouched by it.
import { LOOK } from './look.js';
import { CELL_STRIDE } from './contract.js';
import { buildWorld } from './world/world.js';
import { buildStressWorld } from './world/stress.js';
import { START, EYE } from './world/layout.js';
import { Presenter } from './present/gl.js';
import { buildAtlas } from './present/atlas.js';
import { Pool } from './app/pool.js';
import { createStripeRenderer } from './render-stripe.js';
import { Player } from './app/player.js';
import { Input } from './app/input.js';
import { Hud } from './app/hud.js';
import { RefView } from './app/refview.js';
import { LookPanel, lookFrom, nextOption } from './app/lookpanel.js';
import { CAMERAS } from './app/cameras.js';
import { layout, cellWidth, TARGETS } from './app/grid.js';
import { MAX_PITCH } from './scene/cpu/view.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const CLOCK_RATE = 1 / 60;      // T: one game hour per real minute

const STRESS = params.get('stress') === '1';
const threadsParam = params.get('threads');
const THREADS = threadsParam !== null ? Math.max(0, parseInt(threadsParam, 10) || 0)
  : Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

const state = {
  hour: LOOK.hours.day, t: 0,
  running: false,            // T: time of day moves
  frozen: false,             // lab.freeze: every clock stands still
  held: false,               // lab.setCamera with a height: no walking or falling
  // density 3 by default (the phase 0b verdict); ?density=1..4 or −/+ for the others
  preset: params.has('density') ? Math.max(0, Math.min(3, (parseInt(params.get('density'), 10) || 3) - 1)) : 2,
  cam: 0, camName: CAMERAS[0].name,
  // the look candidates in use (LOOK.choices), from the URL or the defaults
  look: lookFrom(Object.fromEntries(['tree', 'cloud', 'meadow', 'shallows'].map((k) => [k, params.get(k)]))),
  seq: 0, presented: 0, failed: false,
};

const lab = { errors: [] };
window.lab = lab;

function fail(msg) {
  const el = $('error');
  el.style.display = 'block';
  el.textContent = `Land of Ascii stopped: ${msg}`;
  state.failed = true;
  lab.errors.push(msg);
  console.error(msg);
}
addEventListener('error', (e) => fail(`${e.message} (${e.filename}:${e.lineno})`));
addEventListener('unhandledrejection', (e) => fail(String(e.reason && e.reason.stack || e.reason)));


// Workers build their own copy of the world, so they start first. In the
// stress scene the page builds one too, in steps with a progress line (only
// what walking needs, unless it also renders with ?threads=0).
let pool = null;
const progress = { page: 0, workers: THREADS ? 0 : 1 };
function showProgress() {
  const p = Math.min(progress.page, progress.workers);
  $('progress').style.display = 'block';
  $('progress').textContent = `building the stress scene … ${Math.floor(p * 100)}%`;
}
if (THREADS > 0) {
  pool = new Pool(THREADS, fail, {
    scene: STRESS ? 'stress' : 'default',
    onProgress: (p) => { progress.workers = p; showProgress(); },
  });
  if (STRESS) pool.whenReady.then(() => { progress.workers = 1; });
}
const nextTask = () => new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = resolve; ch.port2.postMessage(0); });
async function makeWorld() {
  if (!STRESS) return buildWorld();
  const gen = buildStressWorld({ render: THREADS === 0 });
  let r;
  while (!(r = gen.next()).done) { progress.page = r.value; showProgress(); await nextTask(); }
  progress.page = 1;
  return r.value;
}
const world = await makeWorld();
const CAMS = STRESS ? world.cameras : CAMERAS;
const player = new Player(world);
const canvas = $('view');
const presenter = new Presenter(canvas);
const hud = new Hud($('hud'));
const ref = new RefView($('ref'));
const lookPanel = new LookPanel($('look'));

// glyph atlases for all four densities, built once
const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);
const atlases = new Map();
for (let p = 0; p < TARGETS.length; p++) {
  const cw = cellWidth(p, dpr);
  if (!atlases.has(cw)) atlases.set(cw, buildAtlas(cw, cw * 2));
}

let grid = null;
function relayout() {
  const w = Math.max(64, innerWidth - ref.width());
  grid = layout(state.preset, w, innerHeight, dpr);
  presenter.resize(grid.cols, grid.rows, atlases.get(grid.cw), dpr);
  full = new Uint8Array(grid.cells * CELL_STRIDE);
}
let full = null;
ref.onResize = relayout;
addEventListener('resize', relayout);

function standAt(x, z, yawDeg, pitchDeg) {
  player.place(x, z, yawDeg * DEG, pitchDeg * DEG);
}
function setTime(name) {
  state.hour = LOOK.hours[name];
  state.running = false;
}
function useCamera(i) {
  const c = CAMS[i];
  state.held = false;
  state.cam = i; state.camName = c.name;
  standAt(c.x, c.z, c.yaw, c.pitch);
  setTime(c.time);
  if (ref.on && c.ref) ref.show(c);
}
const start = STRESS ? world.start : START;
standAt(start.x, start.z, start.yaw, start.pitch);
if (STRESS) state.camName = 'stress: start';

const input = new Input(canvas, {
  time: setTime,
  toggleClock: () => { state.running = !state.running; state.frozen = false; },
  nextCamera: () => useCamera((state.cam + 1) % CAMS.length),
  toggleGlyphs: () => { presenter.glyphs = !presenter.glyphs; },
  // the stress scene has no reference frames
  toggleRef: () => { if (STRESS) return; ref.toggle(CAMERAS[state.cam]); relayout(); },
  toggleScene: () => {
    const q = new URLSearchParams(location.search);
    if (STRESS) q.delete('stress'); else q.set('stress', '1');
    location.search = q.toString();
  },
  toggleHud: () => hud.toggle(),
  toggleLook: () => lookPanel.toggle(),
  cycleLook: (name) => { state.look = nextOption(state.look, name); },
  density: (d) => { state.preset = Math.max(0, Math.min(3, state.preset + d)); relayout(); },
});

relayout();

function makeFrame() {
  return {
    seq: ++state.seq,
    cam: { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch },
    cols: grid.cols, rows: grid.rows,
    fovY: LOOK.fovY * DEG,
    aspect: grid.cols / (2 * grid.rows),
    hour: state.hour, t: state.t,
    look: state.look,
  };
}

// ---- rendering --------------------------------------------------------------

const timing = { fps: 0, march: 0, resolve: 0, draw: 0 };
const light = { settled: false, sweepMs: 0 };
let lastPresent = 0;
const waiters = [];
let collectors = [];

// march and resolve are each the slowest stripe's; worker is the slowest
// stripe's march + resolve together
function presented(seq, march, resolve, drawMs, latency, settled, sweepMs, worker) {
  light.settled = settled;
  if (sweepMs > light.sweepMs) light.sweepMs = sweepMs;
  const now = performance.now();
  const interval = lastPresent ? now - lastPresent : 0;
  lastPresent = now;
  if (interval > 0) timing.fps += (1000 / interval - timing.fps) * 0.1;
  timing.march += (march - timing.march) * 0.2;
  timing.resolve += (resolve - timing.resolve) * 0.2;
  timing.draw += (drawMs - timing.draw) * 0.2;
  state.presented = seq;
  for (const c of collectors) c.push({ interval, march, resolve, draw: drawMs, latency, worker });
  // (with the clock running the light keeps moving, so shadows are always
  // catching up a little: then a frame is enough)
  const caughtUp = settled || state.running;
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (seq >= waiters[i].seq && caughtUp) { const w = waiters.splice(i, 1)[0]; requestAnimationFrame(() => requestAnimationFrame(w.resolve)); }
  }
}

let local = null;
if (THREADS === 0) local = createStripeRenderer(world);

function renderLocal() {
  const f = makeFrame();
  const r = local.render(f, 0, f.cols);
  const t0 = performance.now();
  full = r.cells;
  presenter.upload(0, f.cols, r.cells);
  presenter.draw();
  presented(f.seq, r.march, r.resolve, performance.now() - t0, 0, r.settled, r.sweepMs, r.march + r.resolve);
}

function presentPool(res) {
  if (res.frame.cols !== grid.cols || res.frame.rows !== grid.rows) return;   // stale size
  const t0 = performance.now();
  let march = 0, resolve = 0, worker = 0, settled = true, sweepMs = 0;
  const rows = grid.rows;
  for (const p of res.parts) {
    presenter.upload(p.c0, p.c1, p.cells);
    march = Math.max(march, p.march);
    resolve = Math.max(resolve, p.resolve);
    worker = Math.max(worker, p.march + p.resolve);
    settled = settled && p.settled;
    sweepMs = Math.max(sweepMs, p.sweepMs);
    // keep a whole copy for lab.cellHash()
    const sw = p.c1 - p.c0;
    for (let y = 0; y < rows; y++) full.set(p.cells.subarray(y * sw * CELL_STRIDE, (y + 1) * sw * CELL_STRIDE), (y * grid.cols + p.c0) * CELL_STRIDE);
  }
  presenter.draw();
  presented(res.seq, march, resolve, performance.now() - t0, performance.now() - res.sent, settled, sweepMs, worker);
}

let last = performance.now();
let started = false;
function tick(now) {
  if (state.failed) return;
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const look = input.takeLook(dt);
  if (look.yaw || look.pitch) {
    player.yaw += look.yaw;
    player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch + look.pitch));
  }
  // an eye placed at a height by lab.setCamera stays there until a walk key
  const k = input.keys;
  if (state.held && (k.KeyW || k.KeyA || k.KeyS || k.KeyD)) state.held = false;
  if (!state.held) player.update(dt, k);
  if (!state.frozen) {
    state.t += dt;
    if (state.running) state.hour = (state.hour + dt * CLOCK_RATE) % 24;
  }
  try {
    if (local) renderLocal();
    else if (started) {
      const res = pool.take();
      if (res) presentPool(res);
      if (!pool.busy) pool.submit(makeFrame());
    }
  } catch (err) {
    fail(String(err && err.stack || err));
    return;
  }
  const timeName = keyName(state.hour);
  hud.update(now, {
    ...timing, cols: grid.cols, rows: grid.rows, cells: grid.cells, preset: state.preset,
    threads: THREADS, hour: state.hour, timeName, running: state.running, frozen: state.frozen, camName: state.camName,
    stress: STRESS, buildMs: buildMs(), sweepMs: light.sweepMs, settled: light.settled,
  });
  lookPanel.update(state.look);
  requestAnimationFrame(tick);
}

function keyName(h) {
  const d = Math.abs(h - LOOK.hours.day), k = Math.abs(h - LOOK.hours.dusk), n = Math.min(Math.abs(h - LOOK.hours.night), 24 - Math.abs(h - LOOK.hours.night));
  return d <= k && d <= n ? 'day' : k <= n ? 'dusk' : 'night';
}

// the stress scene's build time: the workers' (they build everything), or the page's
const buildMs = () => (pool ? pool.buildMs : world.buildMs);
const ready = (pool ? pool.whenReady : Promise.resolve()).then(() => { started = true; $('progress').style.display = 'none'; });
requestAnimationFrame(tick);

// ---- the debug handle ---------------------------------------------------------

Object.assign(lab, {
  ready,
  threads: THREADS,
  stress: STRESS,
  cameras: CAMS,
  // Stand at a fixed camera (0..8, or 0..2 in the stress scene); also sets its time of day.
  camera(i) { useCamera(i); },
  // Place the eye. Angles in degrees; without y the feet stand on the ground,
  // with y the eye stays at that height until a walk key is pressed.
  setCamera({ x, z, y, yaw = 0, pitch = 0 }) {
    player.place(x, z, yaw * DEG, pitch * DEG, y !== undefined ? y - EYE : undefined);
    state.held = y !== undefined;
    state.camName = 'free';
  },
  // Freeze every clock (time of day and the animation clock).
  freeze(hour, t = 0) {
    state.frozen = true; state.running = false;
    if (hour !== undefined) state.hour = typeof hour === 'string' ? LOOK.hours[hour] : hour;
    state.t = t;
  },
  unfreeze() { state.frozen = false; },
  setHour(h) { state.hour = typeof h === 'string' ? LOOK.hours[h] : h; },
  runClock(on = true) { state.running = on; },
  setDensity(i) { state.preset = Math.max(0, Math.min(3, i)); relayout(); },
  setGlyphs(on) { presenter.glyphs = !!on; },
  setHud(on) { if (hud.visible !== !!on) hud.toggle(); },
  setRef(on) { if (ref.on !== !!on) { ref.toggle(CAMERAS[state.cam]); relayout(); } },
  // The look candidates: setLook({ tree, cloud, meadow, shallows }) (any of
  // them), resetLook() back to the defaults, look() the ones in use;
  // setLookPanel(on) shows the panel.
  setLook(look) { state.look = lookFrom(look, state.look); return { ...state.look }; },
  resetLook() { state.look = lookFrom({}); return { ...state.look }; },
  look() { return { ...state.look }; },
  setLookPanel(on) { if (lookPanel.on !== !!on) lookPanel.toggle(); },
  state() {
    return {
      x: player.x, z: player.z, eye: player.eye, yaw: player.yaw / DEG, pitch: player.pitch / DEG,
      hour: state.hour, t: state.t, frozen: state.frozen, running: state.running,
      preset: state.preset, cols: grid.cols, rows: grid.rows, cells: grid.cells, cw: grid.cw, dpr,
      threads: THREADS, presented: state.presented, camName: state.camName, settled: light.settled,
      isolated: !!self.crossOriginIsolated, look: { ...state.look },
    };
  },
  // Resolves once a frame made after this call is on screen, with cast
  // shadows caught up (unless the clock is running).
  whenIdle() {
    return ready.then(() => new Promise((resolve) => waiters.push({ seq: state.seq + 1, resolve })));
  },
  // The next n presented frames' timings.
  timings(n) {
    return new Promise((resolve) => {
      const list = [];
      list.push = function (x) { Array.prototype.push.call(this, x); if (this.length >= n) { collectors = collectors.filter((c) => c !== this); resolve(Array.from(this)); } return this.length; };
      collectors.push(list);
    });
  },
  stats() { return { ...timing, ...light }; },
  // Walk with the given keys held for a number of seconds of game time, in
  // fixed 1/60 s steps (for tests; the frame rate does not matter).
  walk(keys, seconds) {
    const held = Object.fromEntries(keys.map((k) => [k, true]));
    for (let i = 0; i < Math.round(seconds * 60); i++) player.update(1 / 60, held);
    return { x: player.x, z: player.z, feet: player.feet };
  },
  // A copy of the whole cell buffer (for tools that compare frames).
  cells() { return full.slice(); },
  // FNV-1a over the whole cell buffer, to compare workers with ?threads=0.
  cellHash() {
    let h = 0x811c9dc5;
    for (let i = 0; i < full.length; i++) { h ^= full[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  },
  atlasReport() { return [...atlases.values()].map((a) => ({ cw: a.cw, ch: a.ch, fontPx: +a.fontPx.toFixed(2), shades: a.report })); },
  // The atlas for a cell width as a PNG data URL (white ink on black), for checking glyphs.
  atlasPNG(cw) {
    const a = cw ? (atlases.get(cw) || buildAtlas(cw, cw * 2)) : atlases.get(grid.cw);
    const c = document.createElement('canvas');
    c.width = a.width; c.height = a.height;
    const g = c.getContext('2d');
    const img = g.createImageData(a.width, a.height);
    for (let i = 0; i < a.cov.length; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = a.cov[i]; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
    return { url: c.toDataURL('image/png'), report: a.report, fontPx: a.fontPx };
  },
  world: {
    kind: world.kind, N: world.N, trees: world.objects.trees.length, bushes: world.objects.bushes.length, torches: world.objects.torches.length,
    get buildMs() { return buildMs(); }, get sweepMs() { return light.sweepMs; },
  },
});
