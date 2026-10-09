// Land of Ascii v3, phase 0a: the Look Lab. Boot, the main loop, and the
// debug handle (window.lab) the tools use.
import { LOOK } from './look.js';
import { CELL_STRIDE } from './contract.js';
import { buildWorld } from './world/world.js';
import { START, EYE } from './world/layout.js';
import { Presenter } from './present/gl.js';
import { buildAtlas } from './present/atlas.js';
import { Pool } from './app/pool.js';
import { createStripeRenderer } from './render-stripe.js';
import { Player } from './app/player.js';
import { Input } from './app/input.js';
import { Hud } from './app/hud.js';
import { RefView } from './app/refview.js';
import { CAMERAS } from './app/cameras.js';
import { layout, cellWidth, TARGETS } from './app/grid.js';
import { MAX_PITCH } from './scene/cpu/view.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const CLOCK_RATE = 1 / 60;      // T: one game hour per real minute

const threadsParam = params.get('threads');
const THREADS = threadsParam !== null ? Math.max(0, parseInt(threadsParam, 10) || 0)
  : Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));

const state = {
  hour: LOOK.hours.day, t: 0,
  running: false,            // T: time of day moves
  frozen: false,             // lab.freeze: every clock stands still
  preset: params.has('density') ? Math.max(0, Math.min(3, (parseInt(params.get('density'), 10) || 4) - 1)) : 3,
  cam: 0, camName: CAMERAS[0].name,
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


const world = buildWorld();
const player = new Player(world);
const canvas = $('view');
const presenter = new Presenter(canvas);
const hud = new Hud($('hud'));
const ref = new RefView($('ref'));

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
  const c = CAMERAS[i];
  state.cam = i; state.camName = c.name;
  standAt(c.x, c.z, c.yaw, c.pitch);
  setTime(c.time);
  if (ref.on) ref.show(c);
}
standAt(START.x, START.z, START.yaw, START.pitch);

const input = new Input(canvas, {
  time: setTime,
  toggleClock: () => { state.running = !state.running; state.frozen = false; },
  nextCamera: () => useCamera((state.cam + 1) % CAMERAS.length),
  toggleGlyphs: () => { presenter.glyphs = !presenter.glyphs; },
  toggleRef: () => { ref.toggle(CAMERAS[state.cam]); relayout(); },
  toggleHud: () => hud.toggle(),
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
  };
}

// ---- rendering --------------------------------------------------------------

const timing = { fps: 0, march: 0, resolve: 0, draw: 0 };
let lastPresent = 0;
const waiters = [];
let collectors = [];

function presented(seq, march, resolve, drawMs, latency) {
  const now = performance.now();
  const interval = lastPresent ? now - lastPresent : 0;
  lastPresent = now;
  if (interval > 0) timing.fps += (1000 / interval - timing.fps) * 0.1;
  timing.march += (march - timing.march) * 0.2;
  timing.resolve += (resolve - timing.resolve) * 0.2;
  timing.draw += (drawMs - timing.draw) * 0.2;
  state.presented = seq;
  for (const c of collectors) c.push({ interval, march, resolve, draw: drawMs, latency });
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (seq >= waiters[i].seq) { const w = waiters.splice(i, 1)[0]; requestAnimationFrame(() => requestAnimationFrame(w.resolve)); }
  }
}

let local = null, pool = null;
if (THREADS === 0) local = createStripeRenderer(world);
else pool = new Pool(THREADS, fail);

function renderLocal() {
  const f = makeFrame();
  const r = local.render(f, 0, f.cols);
  const t0 = performance.now();
  full = r.cells;
  presenter.upload(0, f.cols, r.cells);
  presenter.draw();
  presented(f.seq, r.march, r.resolve, performance.now() - t0, 0);
}

function presentPool(res) {
  if (res.frame.cols !== grid.cols || res.frame.rows !== grid.rows) return;   // stale size
  const t0 = performance.now();
  let march = 0, resolve = 0;
  const rows = grid.rows;
  for (const p of res.parts) {
    presenter.upload(p.c0, p.c1, p.cells);
    march = Math.max(march, p.march);
    resolve = Math.max(resolve, p.resolve);
    // keep a whole copy for lab.cellHash()
    const sw = p.c1 - p.c0;
    for (let y = 0; y < rows; y++) full.set(p.cells.subarray(y * sw * CELL_STRIDE, (y + 1) * sw * CELL_STRIDE), (y * grid.cols + p.c0) * CELL_STRIDE);
  }
  presenter.draw();
  presented(res.seq, march, resolve, performance.now() - t0, performance.now() - res.sent);
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
  player.update(dt, input.keys);
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
  });
  requestAnimationFrame(tick);
}

function keyName(h) {
  const d = Math.abs(h - LOOK.hours.day), k = Math.abs(h - LOOK.hours.dusk), n = Math.min(Math.abs(h - LOOK.hours.night), 24 - Math.abs(h - LOOK.hours.night));
  return d <= k && d <= n ? 'day' : k <= n ? 'dusk' : 'night';
}

const ready = (pool ? pool.whenReady : Promise.resolve()).then(() => { started = true; });
requestAnimationFrame(tick);

// ---- the debug handle ---------------------------------------------------------

Object.assign(lab, {
  ready,
  threads: THREADS,
  cameras: CAMERAS,
  // Stand at a fixed camera (0..4); also sets its time of day.
  camera(i) { useCamera(i); },
  // Place the eye. Angles in degrees; without y the feet stand on the ground.
  setCamera({ x, z, y, yaw = 0, pitch = 0 }) {
    player.place(x, z, yaw * DEG, pitch * DEG, y !== undefined ? y - EYE : undefined);
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
  state() {
    return {
      x: player.x, z: player.z, eye: player.eye, yaw: player.yaw / DEG, pitch: player.pitch / DEG,
      hour: state.hour, t: state.t, frozen: state.frozen, running: state.running,
      preset: state.preset, cols: grid.cols, rows: grid.rows, cells: grid.cells, cw: grid.cw, dpr,
      threads: THREADS, presented: state.presented, camName: state.camName,
    };
  },
  // Resolves once a frame made after this call is on screen.
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
  stats() { return { ...timing }; },
  // FNV-1a over the whole cell buffer, to compare workers with ?threads=0.
  cellHash() {
    let h = 0x811c9dc5;
    for (let i = 0; i < full.length; i++) { h ^= full[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
  },
  atlasReport() { return [...atlases.values()].map((a) => ({ cw: a.cw, ch: a.ch, fontPx: +a.fontPx.toFixed(2), shades: a.report })); },
  world: { buildMs: world.buildMs, trees: world.objects.trees.length, bushes: world.objects.bushes.length },
});
