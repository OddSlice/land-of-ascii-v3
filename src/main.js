// Land of Ascii v3: boot, the main loop, and the debug handle (window.lab)
// the tools use. The page opens on the generated world (phase 1), built from
// a seed (?seed=, R for a new one). Two tools stay behind URL options:
// ?lab=1 is the Look Lab's fixed valley (phases 0a-0c) and ?stress=1 (or X
// from the lab) the stress scene, a big world for measuring the renderer.
import { LOOK } from './look.js';
import { CELL_STRIDE } from './contract.js';
import { buildWorld } from './world/world.js';
import { buildStressWorld } from './world/stress.js';
import { START, EYE } from './world/layout.js';
import { generateWorld, DEFAULT_SEED } from './world/gen/world.js';
import { packWorld, unpackWorld, worldHash } from './world/pack.js';
import { shadowStore } from './scene/cpu/light.js';
import { buildInWorker, SharedShadows } from './app/worldboot.js';
import { MapView } from './app/map.js';
import { groundAt } from './world/objects.js';
import { Presenter } from './present/gl.js';
import { buildAtlas } from './present/atlas.js';
import { Pool } from './app/pool.js';
import { createStripeRenderer } from './render-stripe.js';
import { Player } from './app/player.js';
import { Input } from './app/input.js';
import { Hud } from './app/hud.js';
import { RefView } from './app/refview.js';
import { LookPanel, lookFrom, nextOption } from './app/lookpanel.js';
import { Pacer } from './app/pace.js';
import { CAMERAS } from './app/cameras.js';
import { layout, cellWidth, TARGETS } from './app/grid.js';
import { MAX_PITCH } from './scene/cpu/view.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const CLOCK_RATE = 1 / 60;      // T: one game hour per real minute

const STRESS = params.get('stress') === '1';
const LAB = !STRESS && params.get('lab') === '1';
const WORLD = !STRESS && !LAB;
const SEED = WORLD ? (params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : DEFAULT_SEED) : 0;
// Shared memory needs the page to be cross-origin isolated (the Vercel copy
// sends the headers). Without it (GitHub Pages, a file on disk) every worker
// holds its own copy of the world, so the world falls back to at most four.
const ISOLATED = !!self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
const threadsParam = params.get('threads');
const AUTO = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
const THREADS = threadsParam !== null ? Math.max(0, parseInt(threadsParam, 10) || 0) : WORLD && !ISOLATED ? Math.min(4, AUTO) : AUTO;
const SHARED = WORLD && ISOLATED && THREADS > 0;

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


// The lab and the stress scene: workers build their own copy of the world,
// so they start first. In the stress scene the page builds one too, in steps
// with a progress line (only what walking needs, unless it also renders with
// ?threads=0). The generated world is built once, in its own worker (or on
// the page with ?threads=0), then handed to the render workers.
let pool = null, packed = null, shadows = null;
const progress = { page: 0, workers: THREADS ? 0 : 1 };
function showProgress() {
  const p = Math.min(progress.page, progress.workers);
  $('progress').style.display = 'block';
  $('progress').textContent = `building the stress scene … ${Math.floor(p * 100)}%`;
}
function worldProgress(stage, p) {
  $('progress').style.display = 'block';
  $('progress').textContent = `building the world (seed ${SEED}) · ${stage} … ${Math.floor(p * 100)}%`;
}
if (THREADS > 0 && !WORLD) {
  pool = new Pool(THREADS, fail, {
    scene: STRESS ? 'stress' : 'default',
    onProgress: (p) => { progress.workers = p; showProgress(); },
  });
  if (STRESS) pool.whenReady.then(() => { progress.workers = 1; });
}
const nextTask = () => new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = resolve; ch.port2.postMessage(0); });
async function makeWorld() {
  if (WORLD) {
    const t0 = performance.now();
    if (THREADS === 0) {
      // all on the page, in steps, so the progress line still paints
      const gen = generateWorld(SEED);
      let r;
      while (!(r = gen.next()).done) { worldProgress(r.value.stage, r.value.p); await nextTask(); }
      packed = packWorld(r.value, null);
    } else {
      packed = await buildInWorker(SEED, SHARED, worldProgress);
    }
    worldBuild.total = performance.now() - t0;
    const w = unpackWorld(packed);
    worldProgress('starting the workers', 0.96);
    if (THREADS > 0) {
      // with shared memory every worker reads the one world, and cast
      // shadows come from one shadow worker into two shared stores; without
      // it each worker gets its own copy and sweeps its own shadows
      const stores = SHARED ? { V: [], S: [] } : null;
      if (SHARED) for (let b = 0; b < 2; b++) { const st = shadowStore(w, SharedArrayBuffer); stores.V.push(st.V); stores.S.push(st.S); }
      pool = new Pool(THREADS, fail, { scene: 'world', init: { world: packed, shared: SHARED, shadows: stores } });
      if (SHARED) shadows = new SharedShadows(w, packed, stores, pool, fail);
    }
    return w;
  }
  if (!STRESS) return buildWorld();
  const gen = buildStressWorld({ render: THREADS === 0 });
  let r;
  while (!(r = gen.next()).done) { progress.page = r.value; showProgress(); await nextTask(); }
  progress.page = 1;
  return r.value;
}
const worldBuild = { total: 0 };
const world = await makeWorld();
const CAMS = STRESS || WORLD ? world.cameras : CAMERAS;
const player = new Player(world, { rules: WORLD ? 'world' : 'lab' });
const canvas = $('view');
const presenter = new Presenter(canvas);
const hud = new Hud($('hud'));
const ref = new RefView($('ref'));
const lookPanel = new LookPanel($('look'));
const map = WORLD ? new MapView(world) : null;

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
const start = STRESS || WORLD ? world.start : START;
standAt(start.x, start.z, start.yaw, start.pitch);
if (STRESS) state.camName = 'stress: start';
if (WORLD) { state.camName = 'spawn'; state.cam = -1; }

const input = new Input(canvas, {
  time: setTime,
  toggleClock: () => { state.running = !state.running; state.frozen = false; },
  nextCamera: () => useCamera((state.cam + 1) % CAMS.length),
  toggleGlyphs: () => { presenter.glyphs = !presenter.glyphs; },
  // R: in the lab, the reference frame (the stress scene has none); in the
  // world, a new world from a new seed (the page reloads with it, so the
  // old world's memory is freed)
  toggleRef: () => {
    if (WORLD) { const q = new URLSearchParams(location.search); q.set('seed', String((Math.random() * 1e6) >>> 0)); location.search = q.toString(); return; }
    if (STRESS) return;
    ref.toggle(CAMERAS[state.cam]); relayout();
  },
  toggleScene: () => {
    if (WORLD) return;
    const q = new URLSearchParams(location.search);
    if (STRESS) { q.delete('stress'); q.set('lab', '1'); } else { q.delete('lab'); q.set('stress', '1'); }
    location.search = q.toString();
  },
  toggleFly: () => { if (WORLD) player.toggleFly(); },
  toggleMap: () => { if (map) map.toggle(); },
  toggleHud: () => hud.toggle(),
  toggleLook: () => lookPanel.toggle(),
  cycleLook: (name) => { state.look = nextOption(state.look, name); },
  density: (d) => { state.preset = Math.max(0, Math.min(3, state.preset + d)); relayout(); },
});

relayout();

function makeFrame() {
  const f = {
    seq: ++state.seq,
    cam: { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch },
    cols: grid.cols, rows: grid.rows,
    fovY: LOOK.fovY * DEG,
    aspect: grid.cols / (2 * grid.rows),
    hour: state.hour, t: state.t,
    look: state.look,
  };
  // which shared shadow store this frame reads
  if (shadows) f.shadow = shadows.frame;
  return f;
}

// ---- rendering --------------------------------------------------------------

const timing = { fps: 0, march: 0, resolve: 0, draw: 0 };
const light = { settled: false, sweepMs: 0 };
let lastPresent = 0;
const waiters = [];
let collectors = [];

// march and resolve are each the slowest stripe's; worker is the slowest
// stripe's march + resolve together
function presented(seq, march, resolve, drawMs, latency, settled, sweepMs, worker, yaw, trip = 0, total = worker) {
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
  // `at`: when it was shown; `yaw`: the camera it was drawn from
  for (const c of collectors) c.push({ interval, march, resolve, draw: drawMs, latency, worker, total, at: refreshAt, yaw, trip, every: pacer.every, lag: pacer.lag, dropped: pacer.dropped || 0, tag: shownTag, tick: pacer.tick });
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
  presented(f.seq, r.march, r.resolve, performance.now() - t0, 0, r.settled, r.sweepMs, r.march + r.resolve, f.cam.yaw);
}

function presentPool(res) {
  if (res.frame.cols !== grid.cols || res.frame.rows !== grid.rows) return;   // stale size
  const t0 = performance.now();
  let march = 0, resolve = 0, worker = 0, total = 0, settled = true, sweepMs = 0;
  const rows = grid.rows;
  for (const p of res.parts) {
    presenter.upload(p.c0, p.c1, p.cells);
    march = Math.max(march, p.march);
    resolve = Math.max(resolve, p.resolve);
    worker = Math.max(worker, p.march + p.resolve);
    total += p.march + p.resolve;
    settled = settled && p.settled;
    sweepMs = Math.max(sweepMs, p.sweepMs);
    // keep a whole copy for lab.cellHash()
    const sw = p.c1 - p.c0;
    for (let y = 0; y < rows; y++) full.set(p.cells.subarray(y * sw * CELL_STRIDE, (y + 1) * sw * CELL_STRIDE), (y * grid.cols + p.c0) * CELL_STRIDE);
  }
  presenter.draw();
  presented(res.seq, march, resolve, performance.now() - t0, performance.now() - res.sent, settled, sweepMs, worker, res.frame.cam.yaw, res.ready - res.sent, total);
}

let last = performance.now();
let started = false;
let refreshAt = 0;            // requestAnimationFrame's time for this refresh (lab.timings' `at`)
let shownTag = 0;             // the refresh the frame being shown was asked for in (lab.timings' `tag`)
const pacer = new Pacer();
function tick(now) {
  if (state.failed) return;
  refreshAt = now;
  pacer.onRefresh(now);
  // Time moves in whole display refreshes. requestAnimationFrame's times
  // wobble by a few milliseconds (6.7, 10.3, 7.5 ms on a steady 8.3 ms
  // display); moving the camera by them made turning speed wobble too. A
  // refresh that was really missed still counts as two.
  const R = pacer.refresh / 1000, raw = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.1, raw > 0 ? R * Math.max(1, Math.round(raw / R)) : 0);
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
  if (shadows) shadows.update(state.hour);
  try {
    if (map && map.on) { if (started || local) presentMap(); }
    else if (local) renderLocal();
    else if (started) {
      // show the newest finished frame whose refresh has come (an older one
      // still waiting has been overtaken, and is dropped), then ask for the
      // next if it is time (see app/pace.js)
      // Frames whose refresh has passed are dropped (shown late, the view
      // would fall a refresh behind and then jump), unless nothing has been
      // shown for a while; the pacer learns from every frame.
      let res = null, dropped = 0;
      while (pool.finished.length && pacer.due(pool.finished[0].tag)) {
        const f = pool.finished.shift();
        pacer.shown(f.tag, f.ready - f.sent, Math.max(...f.parts.map((p) => p.march + p.resolve)));
        if (res) dropped++;
        res = f;
      }
      if (res && pacer.late(res.tag) && pacer.sinceShown < 2 * pacer.lag + 2) { dropped++; res = null; }
      pacer.dropped = dropped;
      if (res) { shownTag = res.tag; presentPool(res); pacer.sinceShown = 0; }
      if (pacer.shouldSend(pool.inFlight + pool.finished.length)) { pool.submit(makeFrame(), pacer.tick); pacer.sent(); }
    }
  } catch (err) {
    fail(String(err && err.stack || err));
    return;
  }
  const timeName = keyName(state.hour);
  hud.update(now, {
    ...timing, cols: grid.cols, rows: grid.rows, cells: grid.cells, preset: state.preset,
    threads: THREADS, hour: state.hour, timeName, running: state.running, frozen: state.frozen, camName: state.camName,
    stress: STRESS, buildMs: buildMs(), sweepMs: shadows ? shadows.sweepMs : light.sweepMs, settled: light.settled, pace: local ? 1 : pacer.every,
    world: WORLD ? { seed: SEED, shared: SHARED, isolated: ISOLATED, buildMs: worldBuild.total, mode: player.mode, map: !!(map && map.on) } : null,
  });
  lookPanel.update(state.look);
  requestAnimationFrame(tick);
}

function keyName(h) {
  const d = Math.abs(h - LOOK.hours.day), k = Math.abs(h - LOOK.hours.dusk), n = Math.min(Math.abs(h - LOOK.hours.night), 24 - Math.abs(h - LOOK.hours.night));
  return d <= k && d <= n ? 'day' : k <= n ? 'dusk' : 'night';
}

// the stress scene's build time: the workers' (they build everything), or the page's
const buildMs = () => (WORLD ? worldBuild.total : pool ? pool.buildMs : world.buildMs);
// (with shared shadows, frames wait for the first sweep)
const ready = (pool ? pool.whenReady : Promise.resolve()).then(() => (shadows ? (worldProgress('casting shadows', 0.98), shadows.first) : null))
  .then(() => { started = true; $('progress').style.display = 'none'; });

// M: the overhead map, drawn in the same cells, instead of the view
function presentMap() {
  const cells = map.render(grid.cols, grid.rows, player);
  full = cells;
  presenter.upload(0, grid.cols, cells);
  presenter.draw();
}
requestAnimationFrame(tick);

// ---- the debug handle ---------------------------------------------------------

Object.assign(lab, {
  ready,
  threads: THREADS,
  stress: STRESS,
  scene: WORLD ? 'world' : STRESS ? 'stress' : 'lab',
  seed: SEED,
  shared: SHARED,
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
  // Hold the frame pacing: a frame every `every` refreshes, each shown `lag`
  // refreshes after it was asked for (setPace() for adaptive again).
  setPace(every, lag = every) { pacer.fixed = every ? [every, lag] : null; if (every) { pacer.every = every; pacer.lag = lag; } },
  look() { return { ...state.look }; },
  setLookPanel(on) { if (lookPanel.on !== !!on) lookPanel.toggle(); },
  state() {
    return {
      x: player.x, z: player.z, eye: player.eye, yaw: player.yaw / DEG, pitch: player.pitch / DEG,
      hour: state.hour, t: state.t, frozen: state.frozen, running: state.running,
      preset: state.preset, cols: grid.cols, rows: grid.rows, cells: grid.cells, cw: grid.cw, dpr,
      threads: THREADS, presented: state.presented, camName: state.camName, settled: light.settled,
      isolated: !!self.crossOriginIsolated, shared: SHARED, look: { ...state.look }, mode: player.mode, flying: player.flying,
      pace: local ? 1 : pacer.every, lag: local ? 0 : pacer.lag, refresh: pacer.refresh,
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
    get buildMs() { return buildMs(); }, get sweepMs() { return shadows ? shadows.sweepMs : light.sweepMs; },
    seed: SEED, sites: world.sites, roads: world.roads ? world.roads.map((r) => ({ id: r.id, to: r.to, x: Array.from(r.x), z: Array.from(r.z) })) : null,
    times: world.times || null,
  },
  // The generated world's arrays, hashed (the same seed must give the same bytes on any thread).
  worldHash() { return packed ? worldHash(packed) : null; },
  // Fly (F) on or off.
  setFly(on) { if (WORLD && player.flying !== !!on) player.toggleFly(); },
  // The overhead map (M) on or off.
  setMap(on) { if (map && map.on !== !!on) map.toggle(); },
  // Turn to a yaw (degrees) without moving.
  face(yaw) { player.yaw = yaw * DEG; },
  // The ground and the drawn surface (the water's level where there is water) at a point.
  ground(x, z) {
    const T = world.terrain;
    return { ground: groundAt(T, x, z), surface: groundAt({ ground: T.levels[0].H, N: T.N, NN: T.NN }, x, z) };
  },
  // Memory the page and its workers use, where the browser can say
  // (Chromium, cross-origin isolated).
  async memory() {
    if (!performance.measureUserAgentSpecificMemory) return null;
    const m = await performance.measureUserAgentSpecificMemory();
    return { bytes: m.bytes, breakdown: m.breakdown.map((b) => ({ bytes: b.bytes, types: b.types, scope: b.attribution.map((a) => a.scope).join(',') })) };
  },
});
