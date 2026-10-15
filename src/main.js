// Land of Ascii v3: boot, the main loop, and the debug handle (window.lab)
// the tools use. The page opens on the generated world (phase 1), built from
// a seed (?seed=, R for a new one). Three tools stay behind URL options:
// ?lab=1 is the Look Lab's fixed valley (phases 0a-0c), ?stress=1 (or X
// from the lab) the stress scene, a big world for measuring the renderer,
// and ?yard=1 (phase 3a) the building yard, every piece of the building kit
// standing alone.
import { LOOK } from './look.js';
import { CELL_STRIDE } from './contract.js';
import { yardFigures, yardAnimals } from './world/yard.js';
import { FS, S } from './world/people/figure.js';
import { roomAt } from './world/kit.js';
import { START, EYE } from './world/layout.js';
import { DEFAULT_SEED } from './world/gen/world.js';
import { People } from './app/people.js';
import { Animals } from './app/animals.js';
import { animalCameras } from './world/animals/cameras.js';
import { peopleCameras } from './world/people/cameras.js';
import { startScene } from './app/boot.js';
import { MapView } from './app/map.js';
import { MapOverlay } from './app/mapover.js';
import { Signs } from './game/signs.js';
import { Presenter } from './present/gl.js';
import { buildAtlas } from './present/atlas.js';
import { createStripeRenderer } from './render-stripe.js';
import { Player } from './app/player.js';
import { Input } from './app/input.js';
import { Hud } from './app/hud.js';
import { Pacer } from './app/pace.js';
import { CAMERAS } from './app/cameras.js';
import { layout, cellWidth, TARGETS } from './app/grid.js';
import { MAX_PITCH } from './scene/cpu/view.js';
import { weatherFor, mainKind, KINDS } from './weather.js';
import { Menu } from './app/menu.js';
import { loadDisplay, saveDisplay, reducedMotion, hasDisplay } from './app/settings.js';
import { Title } from './app/title.js';
import { loadKeys, saveKeys, remapOf, keyLabel } from './app/keys.js';
import { sketchCard, saveImage, copyImage, canCopyImage } from './app/share.js';
import { missingFeatures, showUnsupported } from './app/support.js';
// (phase 5a) wayfaring: discovery, the journal, sketches, favours, saving
import { Wayfaring } from './app/wayfaring.js';
import { F as FAVOUR } from './game/progress.js';
import { Journal } from './app/journal.js';
import { labParts, labCore } from './app/lab.js';
import { titleFlow } from './app/titleflow.js';
import { makeGame } from './app/game.js';
import { initNotes, nearbyUI, showSay, hideSay, showNote, showHint, hideHint } from './app/notes.js';
import { initPresent, renderLocal, presentPool, presentMap } from './app/present.js';
import { initActs, greet, sketch, lantern } from './app/acts.js';
import { initComfort, comeBack, toggleFullscreen, shareLink } from './app/comfort.js';
import { initPanels, toggleJournal, openJournal, closeJournal, openMenu, closeMenu, onEscape, onUnlocked } from './app/panels.js';
import { Talk } from './app/talk.js';
import { Sound } from './sound/engine.js';
import { CHOICE } from './game/words.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;
const CLOCK_RATE = 1 / 3600;    // real time: one game hour per real hour (after phase 3a the default)

const STRESS = params.get('stress') === '1';
const YARD = !STRESS && params.get('yard') === '1';
const LAB = !STRESS && !YARD && params.get('lab') === '1';
// (phase 4b) ?wild=0: no wild ground detail; ?animals=0: no animals, nor
// their pastures and folds (both off: phase 4a's world, byte for byte)
const GEN = { wild: params.get('wild') !== '0', animals: params.get('animals') !== '0' };
const WORLD = !STRESS && !LAB && !YARD;
const SEED = WORLD ? (params.has('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : DEFAULT_SEED) : 0;
// Shared memory needs the page to be cross-origin isolated (the Vercel copy
// sends the headers). Without it (GitHub Pages, a file on disk) every worker
// holds its own copy of the world, so the world falls back to at most four.
const ISOLATED = !!self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined';
const threadsParam = params.get('threads');
const AUTO = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
const THREADS = threadsParam !== null ? Math.max(0, parseInt(threadsParam, 10) || 0) : WORLD && !ISOLATED ? Math.min(4, AUTO) : AUTO;
const SHARED = WORLD && ISOLATED && THREADS > 0;
// The menu's Display choices, kept between visits (phase 2b); ?density= still wins.
const display = loadDisplay();
const DISPLAY_KEPT = hasDisplay();     // (phase 6: choices from an earlier visit are left alone)
if (params.has('density')) display.density = Math.max(0, Math.min(3, (parseInt(params.get('density'), 10) || 3) - 1));
// The tools run with the menu, the hint and the start card suppressed
// (tools/lib/serve.mjs sets this before the page starts; lab.setQuiet too).
let QUIET = !!self.LAND_QUIET;

const state = {
  hour: LOOK.hours.day, t: 0,
  // the day count (?day=), which the moon's phase follows; it moves on as
  // the clock passes midnight
  day: params.has('day') ? (parseInt(params.get('day'), 10) || 0) : LOOK.moon.startDay,
  running: true,             // T: time of day moves (at real time from the start, after phase 3a)
  rate: CLOCK_RATE,          // how fast it moves, game hours a second (the menu)
  frozen: false,             // lab.freeze: every clock stands still
  held: false,               // lab.setCamera with a height: no walking or falling
  // density 3 by default (the phase 0b verdict); ?density=1..4 or −/+ for the others
  preset: display.density,
  cam: 0, camName: CAMERAS[0].name,
  // the weather (phase 2b): 'auto', the world's forecast, or one kind held
  // (the lab and the stress scene keep fair, as before weather)
  weather: WORLD ? 'auto' : 'fair',
  seq: 0, presented: 0, failed: false,
};

const lab = { errors: [] };
window.lab = lab;

// (phase 6) a browser that cannot run the game is told so plainly, naming
// what it lacks, before anything is built
{
  const miss = missingFeatures();
  if (miss.length) { showUnsupported($('error'), miss); lab.unsupported = miss; state.failed = true; await new Promise(() => {}); }
}

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


// The scene: the generated world, or one of the tools' scenes (src/app/boot.js).
const boot = await startScene({ WORLD, STRESS, YARD, THREADS, SHARED, SEED, GEN, fail });
const { world, pool, packed, shadows, shadowStores, worldProgress } = boot;
const worldBuild = { total: boot.buildMs };
const CAMS = STRESS || WORLD || YARD ? world.cameras : CAMERAS;
const player = new Player(world, { rules: WORLD || YARD ? 'world' : 'lab' });
// (phase 4a) the people of the generated world (?people=0: none)
const people = WORLD ? new People(world) : null;
// (0.5.5) what the signposts say, read from the people's road network
const signs = people ? new Signs(world, people.P.net) : null;
if (people && params.get('people') === '0') people.on = false;
// (and the cameras that look at them: a green at midday, the wall walk at
// night, a traveller on the road)
if (people) world.cameras.push(...peopleCameras(world, people.P));
// (phase 4b) the animals (?animals=0: none, nor their pastures and folds)
const animals = people && GEN.animals ? new Animals(world, people.P) : null;
// (and the cameras that look at them: a pasture with its flock, deer at a
// forest edge at dawn, gulls on the coast, crows on the wall walk)
if (animals) world.cameras.push(...animalCameras(world, animals.A));
// (phase 5a) the player's progress in this world: what is found, met,
// sketched and done. The tools run with it off (progress cleared, nothing
// drawn or tracked), unless they ask for it (self.LAND_PROGRESS, or
// lab.progress.enable()).
const way = people ? new Wayfaring(world, people, { on: !QUIET || !!self.LAND_PROGRESS }) : null;
// (phase 5b) the world's sound, made in code: silent until the first click
// or key (a browser allows sound only then); the tools run without it
// unless they ask (lab.sound.enable)
const sound = WORLD ? new Sound(world) : null;
if (sound) {
  sound.allowed = !QUIET;
  const first = () => { if (sound.allowed && sound.unlock()) { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); } };
  addEventListener('pointerdown', first, true);
  addEventListener('keydown', first, true);
}
let soundFrame = null;
// (in the building yard: a line of figures standing still, in every pose)
const yardFolk = YARD ? { st: yardFigures(), on: params.get('people') !== '0' } : null;
// (phase 4b) and every animal in every pose, standing still
const yardBeasts = YARD && GEN.animals ? { st: yardAnimals(), on: true } : null;
// (each in the room the kit says they stand in, as the world's people are)
if (yardFolk) for (let o = 0; o < yardFolk.st.length; o += FS) yardFolk.st[o + S.ROOM] = roomAt(world.kit, yardFolk.st[o + S.X], yardFolk.st[o + S.Z], yardFolk.st[o + S.FEET] + 0.02);
const canvas = $('view');
const presenter = new Presenter(canvas);
presenter.glyphs = display.glyphs;
const hud = new Hud($('hud'));
hud.setMode(QUIET ? 'none' : display.hud);
const map = WORLD ? new MapView(world) : null;
// (0.5.5) the map's drawn layer: names, compass, legend, you (not in the tools' pictures)
const mapOver = WORLD && !QUIET ? new MapOverlay(world, $('mapover')) : null;

// glyph atlases for all four densities, built once (and one more for each
// new cell size a larger window asks for)
const dpr = Math.max(1, Math.round((window.devicePixelRatio || 1) * 100) / 100);
const atlases = new Map();
const atlasFor = (cw) => { if (!atlases.has(cw)) atlases.set(cw, buildAtlas(cw, cw * 2)); return atlases.get(cw); };
for (let p = 0; p < TARGETS.length; p++) atlasFor(cellWidth(p, dpr));

let grid = null;
function relayout() {
  grid = layout(state.preset, Math.max(64, innerWidth), innerHeight, dpr, innerWidth * innerHeight);
  presenter.resize(grid.cols, grid.rows, atlasFor(grid.cw), dpr);
  full = new Uint8Array(grid.cells * CELL_STRIDE);
}
let full = null;
addEventListener('resize', relayout);

// (`eyeY`: a camera's own eye height, for a place under a roof or arch)
function standAt(x, z, yawDeg, pitchDeg, eyeY) {
  player.place(x, z, yawDeg * DEG, pitchDeg * DEG, eyeY !== undefined ? eyeY - EYE : undefined);
}
// (the clock goes on running from there, if it was)
function setTime(name) {
  // (phase 4a: a camera's time can be an hour, a traveller's say)
  state.hour = typeof name === 'number' ? name : LOOK.hours[name];
}
function useCamera(i) {
  const c = CAMS[i];
  state.held = false;
  state.cam = i; state.camName = c.name;
  standAt(c.x, c.z, c.yaw, c.pitch, c.y);
  if (c.stand) player.feet = player.standOn(c.x, c.z, player.feet);
  state.held = !!c.held;
  setTime(c.time);
}
const start = STRESS || WORLD || YARD ? world.start : START;
standAt(start.x, start.z, start.yaw, start.pitch);
if (STRESS) state.camName = 'stress: start';
if (WORLD) { state.camName = 'spawn'; state.cam = -1; }
// (phase 6) a shared link's place and hour: ?at=x,z,yaw (metres, metres,
// degrees) and ?hour=h; a place off the land is ignored
const SHARED_AT = (() => {
  if (!WORLD || !params.has('at')) return null;
  const a = params.get('at').split(',').map(Number);
  return a.length >= 2 && a.slice(0, 3).every(Number.isFinite) && a[0] >= 0 && a[1] >= 0 && a[0] <= world.N && a[1] <= world.N ? a : null;
})();
if (SHARED_AT) { standAt(SHARED_AT[0], SHARED_AT[1], SHARED_AT[2] || 0, 0); state.camName = 'shared'; }
if (WORLD && params.has('hour')) { const hh = Number(params.get('hour')); if (hh >= 0 && hh < 24) state.hour = hh; }
if (YARD) { state.camName = CAMS[0].name; state.cam = 0; }

const input = new Input(canvas, {
  time: setTime,
  toggleClock: () => { state.running = !state.running; state.frozen = false; },
  nextCamera: () => useCamera((state.cam + 1) % CAMS.length),
  jump: () => player.jump(),
  toggleGlyphs: () => setDisplay('glyphs', !display.glyphs),
  // R: in the world, a new world from a new seed (the page reloads with it,
  // so the old world's memory is freed)
  newWorld: () => {
    if (WORLD) { const q = new URLSearchParams(location.search); q.set('seed', String((Math.random() * 1e6) >>> 0)); location.search = q.toString(); }
  },
  toggleScene: () => {
    if (WORLD) return;
    const q = new URLSearchParams(location.search);
    if (STRESS) { q.delete('stress'); q.set('lab', '1'); } else { q.delete('lab'); q.set('stress', '1'); }
    location.search = q.toString();
  },
  toggleFly: () => { if (WORLD || YARD) player.toggleFly(); },
  toggleMap: () => { if (map) { map.toggle(); if (mapOver) mapOver.show(map.on); if (map.on) hideHint(); } },
  mute: () => {
    if (!sound) return;
    if (sound.allowed) sound.unlock();
    const off = sound.toggleMute();
    showNote(off ? 'Sound off.' : 'Sound on.', 'N', 2000);
    if (menu.open) menu.update();
  },
  greet: () => greet(),
  journal: () => toggleJournal(),
  // (J closes the journal, which otherwise holds the keys)
  blockedKey: (e) => {
    if (journal.open && e.code === 'KeyJ' && !e.repeat && journal.viewing === null) { e.preventDefault(); closeJournal(false); }
    // (E goes on in an exchange, which otherwise holds the keys)
    if (talk.open && e.code === 'KeyE' && !e.repeat) { e.preventDefault(); talk.go(); }
  },
  sketch: () => sketch(),
  lantern: () => (WORLD ? lantern() : false),
  toggleHud: () => hud.toggle(),
  density: (d) => setDisplay('density', Math.max(0, Math.min(3, state.preset + d))),
  escape: () => onEscape(),
  unlocked: () => onUnlocked(),
});
input.sensitivity = display.sensitivity;
input.invert = display.invert;
input.blocked = () => menu.open || card.up || journal.open || talk.open || away;

relayout();

function makeFrame() {
  const f = {
    seq: ++state.seq,
    cam: { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch },
    cols: grid.cols, rows: grid.rows,
    fovY: LOOK.fovY * DEG,
    aspect: grid.cols / (2 * grid.rows),
    hour: state.hour, t: state.t, day: state.day,
    weather: weatherNow(),
  };
  // which shared shadow store this frame reads
  if (shadows) f.shadow = shadows.frame;
  // (phase 4a) everyone's state at this frame's day and hour, and the houses
  // with someone awake inside
  if (people && people.on) {
    if (people.planned < 0) people.planDay(state.day);
    f.people = people.update(state.day, state.hour, { x: player.x, z: player.z, feet: player.feet }, player);
    f.lit = people.lit.slice();
  }
  if (yardFolk && yardFolk.on) f.people = yardFolk.st;
  // (phase 4b) every animal's state, reacting to you and to the people
  if (animals && animals.on) {
    if (people && people.planned < 0) people.planDay(state.day);
    const t0 = performance.now();
    f.animals = animals.update(state.day, state.hour, { x: player.x, z: player.z, feet: player.feet }, f.people || null, player, f.weather, state.frozen ? null : state.t);
    f.marks = animals.marks(f);
    lab.mainMs = (people && people.on ? people.updateMs : 0) + (performance.now() - t0);
  } else if (people && people.on) lab.mainMs = people.updateMs;
  if (yardBeasts && yardBeasts.on) f.animals = yardBeasts.st;
  // (phase 5a) what you carry, your lantern, and the lost things
  if (youNow) f.you = reducedMotion(display) && youNow.walk ? { ...youNow, walk: 0 } : youNow;
  soundFrame = f;
  return f;
}
let youNow;

// (phase 5a) The exchange's box, and what answering does.
const talk = new Talk($('talk'), {
  answer: (id, yes) => {
    // (phase 6) the first favour taken: once the exchange closes, where to look for it
    if (yes && !Object.values(way.progress.favours).some((f) => f.s >= FAVOUR.TAKEN)) firstFavourNote = true;
    return way.answer(id, yes, { day: state.day, hour: state.hour });
  },
  gift: (kind) => { if (kind === 'lantern') showNote('The lantern is yours now. L lights it or puts it away.', 'L', 9000); },
  words: { yes: CHOICE.yes, no: CHOICE.no, on: 'go on', bye: 'farewell' },
  done: (recapture) => {
    $('veil').classList.remove('on');
    input.clear();
    if (recapture && talkHadMouse) input.capture();
    if (firstFavourNote) { firstFavourNote = false; setTimeout(() => showNote(`Your journal (${keyLabel(keys.journal)}) keeps the favour. The map (${keyLabel(keys.map)}) shows north, south, east and west.`, keyLabel(keys.journal), 9000), 1200); }
  },
});
let firstFavourNote = false;
// (phase 5b) an exchange stands the clock still, dims the world under it
// and frees the mouse for its buttons
let talkHadMouse = false;
function showTalk(ex, i) {
  hideSay(); hideHint();
  input.clear();
  talk.show(ex, i);
  $('veil').classList.add('on');
  talkHadMouse = !!document.pointerLockElement;
  if (talkHadMouse) { releasing = true; document.exitPointerLock(); }
}

// The frame's weather (src/weather.js): a pure function of the seed, the day
// and the hour, or one kind held.
function weatherNow() { return typeof state.weather === 'object' ? state.weather : weatherFor(SEED, state.day, state.hour, state.weather); }

// ---- rendering --------------------------------------------------------------

const timing = { fps: 0, march: 0, resolve: 0, draw: 0 };
const light = { settled: false, sweepMs: 0 };
const waiters = [];
let collectors = [];

let local = null;
if (THREADS === 0) local = createStripeRenderer(world);

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
  const look = menu.open || journal.open || talk.open ? { yaw: 0, pitch: 0 } : input.takeLook(dt);
  if (look.yaw || look.pitch) {
    player.yaw += look.yaw;
    player.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, player.pitch + look.pitch));
  }
  // an eye placed at a height by lab.setCamera stays there until a walk key
  const k = input.keys;
  if (state.held && (k.KeyW || k.KeyA || k.KeyS || k.KeyD)) state.held = false;
  // (while the menu, the journal or an exchange is open the clocks and
  // movement stand still)
  const paused = menu.open || journal.open || talk.open || away;
  if (!state.held && !paused) player.update(dt, k);
  // (phase 6) the title screen's flyover: a slow turn at each spot
  if (fly) flow.flyTick(now);
  // (phase 5a) what you see and find, the lantern and what you carry
  if (way && way.on && started && !card.up) {
    const aspect = grid.cols / (2 * grid.rows), hfov = 2 * Math.atan(Math.tan(LOOK.fovY * DEG / 2) * aspect);
    youNow = way.update(player, state.day, state.hour, hfov, people && people.on ? people.st : null);
    lab.wayMs = way.ms;
    for (const n of way.takeNotes()) { if (n.kind === 'say') showSay('', '', n.text); else showNote(n.text, 'J'); }
  } else youNow = undefined;
  if (started && !QUIET && !card.up) nearbyUI();
  if (!state.frozen && !paused) {
    state.t += dt;
    if (state.running) {
      state.hour += dt * state.rate;
      if (state.hour >= 24) { state.hour -= 24; state.day++; }
    }
  }
  if (shadows) shadows.update(state.hour, state.day);
  // (phase 5b) the sound, every display frame, from the newest frame's people
  // and animals
  if (sound && sound.on) {
    const sf = soundFrame;
    sound.update({
      x: player.x, z: player.z, feet: player.feet, eye: player.eye, yaw: player.yaw, mode: player.mode, flying: player.flying,
      room: roomAt(world.kit, player.x, player.z, player.feet + 0.02), running: !!(input.keys.ShiftLeft || input.keys.ShiftRight),
      t: state.t, hour: state.hour, day: state.day, weather: sf ? sf.weather : weatherNow(),
      people: sf && sf.people, lit: sf && sf.lit, animals: sf && sf.animals,
      paused: menu.open || journal.open || away || card.up ? 'menu' : talk.open ? 'talk' : null,
    });
    lab.soundMs = sound.ms;
  }
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
      if (res) { shownTag = res.tag; presentPool(res); pacer.sinceShown = 0; if (fly && fly.next) flow.flyNext(); }
      if (pacer.shouldSend(pool.inFlight + pool.finished.length)) { pool.submit(makeFrame(), pacer.tick); pacer.sent(); }
    }
  } catch (err) {
    fail(String(err && err.stack || err));
    return;
  }
  const timeName = keyName(state.hour);
  // (phase 6) no statistics over the title screen
  $('hud').style.visibility = card.up ? 'hidden' : '';
  hud.update(now, {
    ...timing, cols: grid.cols, rows: grid.rows, cells: grid.cells, preset: state.preset,
    threads: THREADS, hour: state.hour, day: state.day, timeName, running: state.running, frozen: state.frozen, camName: state.camName,
    weather: WORLD || state.weather !== 'fair' ? weatherName() : null,
    stress: STRESS, buildMs: buildMs(), sweepMs: shadows ? shadows.sweepMs : light.sweepMs, settled: light.settled, pace: local ? 1 : pacer.every,
    world: WORLD ? { seed: SEED, shared: SHARED, isolated: ISOLATED, buildMs: worldBuild.total, mode: player.mode, map: !!(map && map.on && !mapOver) } : null,
  });
  if (menu.open && now > menuNext) { menuNext = now + 250; menu.update(); }
  requestAnimationFrame(tick);
}

function keyName(h) {
  let best = 'day', bd = Infinity;
  for (const [name, at] of Object.entries(LOOK.hours)) {
    const d = Math.min(Math.abs(h - at), 24 - Math.abs(h - at));
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

// the stress scene's build time: the workers' (they build everything), or the page's
const buildMs = () => (WORLD ? worldBuild.total : pool ? pool.buildMs : world.buildMs);
// (with shared shadows, frames wait for the first sweep)
const ready = (pool ? pool.whenReady : Promise.resolve()).then(() => (shadows ? (worldProgress('casting shadows', 0.98), shadows.first) : null))
  .then(() => { started = true; $('progress').style.display = 'none'; if (!flow.showTitle()) showHint(); });

requestAnimationFrame(tick);

// ---- the menu, the start card and the hint (phase 2b) --------------------------

// A Display choice, applied at once and kept for the next visit.
function setDisplay(k, v, keep = true) {
  display[k] = v;
  if (state.preset !== display.density) { state.preset = display.density; relayout(); }
  presenter.glyphs = display.glyphs;
  if (k === 'hud') hud.setMode(display.hud);
  input.sensitivity = display.sensitivity; input.invert = display.invert;
  applyUI();
  if (keep) saveDisplay(display);
}
// (phase 6) the text size, reduced motion and the frame-rate cap
function applyUI() {
  const r = document.documentElement;
  r.style.setProperty('--ui-text', String(display.text));
  r.classList.toggle('still', reducedMotion(display));
  pacer.cap = display.cap;
}

const pad2 = (n) => String(n).padStart(2, '0');
function clockText() { const hh = Math.floor(state.hour), mm = Math.floor((state.hour - hh) * 60); return `${pad2(hh)}:${pad2(mm)}`; }
// The weather now, in a few words: one kind, or one turning into another.
function weatherName() {
  const w = weatherNow(), main = mainKind(w);
  const other = KINDS.filter((k) => k !== main && (w.mix[k] || 0) > 0.05).sort((a, b) => w.mix[b] - w.mix[a])[0];
  return other ? `${main} turning ${other}` : main;
}
// (phase 3b) the benchmark in the menu (src/app/benchrun.js)
const DETAIL_NAMES = ['coarse', 'medium', 'fine', 'finest'];
// What the parts of the page kept in their own modules (src/app/lab.js,
// ...) read and set of this one's state, live: each a getter, so a module
// always sees the current value (the grid after a resize, the cells of the
// last frame).
const app = {
  get $() { return $; }, get animals() { return animals; }, get atlases() { return atlases; },
  get away() { return away; }, get buildMs() { return buildMs; }, get CAMS() { return CAMS; },
  get canvas() { return canvas; }, get card() { return card; }, get CLOCK_RATE() { return CLOCK_RATE; },
  get clockText() { return clockText; }, get closeJournal() { return closeJournal; },
  get closeMenu() { return closeMenu; }, get collectors() { return collectors; },
  get comeBack() { return comeBack; }, get DEG() { return DEG; }, get DETAIL_NAMES() { return DETAIL_NAMES; },
  get display() { return display; }, get DISPLAY_KEPT() { return DISPLAY_KEPT; }, get dpr() { return dpr; },
  get fly() { return fly; }, get full() { return full; }, get game() { return game; }, get greet() { return greet; },
  get grid() { return grid; }, get hideHint() { return hideHint; }, get home() { return home; },
  get hud() { return hud; }, get input() { return input; }, get ISOLATED() { return ISOLATED; },
  get journal() { return journal; }, get keyName() { return keyName; }, get keys() { return keys; },
  get lab() { return lab; }, get lantern() { return lantern; }, get leaveTitle() { return flow.leaveTitle; },
  get light() { return light; }, get local() { return local; }, get makeFrame() { return makeFrame; },
  get map() { return map; }, get mapOver() { return mapOver; }, get menu() { return menu; },
  get openJournal() { return openJournal; }, get openMenu() { return openMenu; }, get pacer() { return pacer; },
  get packed() { return packed; }, get params() { return params; }, get people() { return people; },
  get player() { return player; }, get pool() { return pool; }, get presenter() { return presenter; },
  get QUIET() { return QUIET; }, get ready() { return ready; }, get refreshAt() { return refreshAt; },
  get releasing() { return releasing; }, get SEED() { return SEED; }, get setDisplay() { return setDisplay; },
  get setKeys() { return setKeys; }, get setTime() { return setTime; }, get shadows() { return shadows; },
  get shadowStores() { return shadowStores; }, get SHARED() { return SHARED; },
  get SHARED_AT() { return SHARED_AT; }, get shareLink() { return shareLink; }, get showHint() { return showHint; },
  get shownTag() { return shownTag; }, get showTalk() { return showTalk; }, get signs() { return signs; },
  get sketch() { return sketch; }, get sound() { return sound; }, get standAt() { return standAt; },
  get started() { return started; }, get state() { return state; }, get STRESS() { return STRESS; },
  get talk() { return talk; }, get THREADS() { return THREADS; }, get timing() { return timing; },
  get title() { return title; }, get toggleFullscreen() { return toggleFullscreen; },
  get useCamera() { return useCamera; }, get waiters() { return waiters; }, get way() { return way; },
  get weatherName() { return weatherName; }, get weatherNow() { return weatherNow; }, get WORLD() { return WORLD; },
  get world() { return world; }, get YARD() { return YARD; }, get yardBeasts() { return yardBeasts; },
  get yardFolk() { return yardFolk; }, get youNow() { return youNow; }, set QUIET(v) { QUIET = v; },
  set away(v) { away = v; }, set collectors(v) { collectors = v; }, set fly(v) { fly = v; },
  set full(v) { full = v; }, set home(v) { home = v; }, set releasing(v) { releasing = v; }
};
initNotes(app);
initPresent(app);
initActs(app);
initPanels(app);
const game = makeGame(app);
labParts(app);
const menu = new Menu($('menu'), game);
let menuNext = 0, releasing = false;

// (phase 5a) The journal (J): over the world, which stands still under it.
const journal = new Journal($('journal'), {
  data: () => way.journal(),
  cells: (id) => way.sketchCells(id),
  copy: (text) => game.copyText(text),
  close: () => closeJournal(),
  // (phase 6) a sketch as an image: shared (copied) where the browser can, else saved
  async image(cells, sk, mode) {
    const c = sketchCard(cells, sk.cols, sk.rows, SEED);
    const name = `land-of-ascii-seed-${SEED}-${String(sk.place || 'sketch').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
    if (mode === 'share' && canCopyImage() && await copyImage(c)) return 'copied';
    return (await saveImage(c, name)) ? 'saved' : null;
  },
});

// ---- (phase 6) the title screen ------------------------------------------------
// Grown from the start card. Behind it the world drifts on the fixed
// cameras (four spots from the world's own records: the lake at dawn, the
// fort from the road at dusk, a village green at midday, a viewpoint in
// rain), each held 20 s and cross-faded, the clock, the weather and the
// people alive. Nothing of it touches the saved progress, the clock or where
// you stand: those are put back as they were when Play or Continue is
// chosen (Continue then stands you where you left off; a shared link's
// place wins). The tools never see it.
const title = WORLD ? new Title($('title'), {
  play: () => flow.leaveTitle(),
  newWorld: (seed) => game.newWorld(seed),
  settings: () => openMenu(),
  share: () => game.share(false),
}) : null;
// (the rest of the game asks `card.up`)
const card = { get up() { return !!(title && title.up); } };
let home = null, fly = null;

const flow = titleFlow(app);

// (phase 6) Paused while the window is elsewhere (src/app/comfort.js).
let away = false;
initComfort(app);
document.addEventListener('fullscreenchange', () => { if (menu.open) menu.update(); });

// (phase 6) the keys a player has changed
let keys = loadKeys();
function setKeys(b) { keys = b; saveKeys(b); input.remap = remapOf(b); }
input.remap = remapOf(keys);
applyUI();

labCore(app);
