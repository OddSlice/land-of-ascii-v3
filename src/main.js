// Land of Ascii v3: boot, the main loop, and the debug handle (window.lab)
// the tools use. The page opens on the generated world (phase 1), built from
// a seed (?seed=, R for a new one). Three tools stay behind URL options:
// ?lab=1 is the Look Lab's fixed valley (phases 0a-0c), ?stress=1 (or X
// from the lab) the stress scene, a big world for measuring the renderer,
// and ?yard=1 (phase 3a) the building yard, every piece of the building kit
// standing alone.
import { LOOK } from './look.js';
import { CELL_STRIDE } from './contract.js';
import { buildWorld } from './world/world.js';
import { buildStressWorld } from './world/stress.js';
import { buildYard, yardFigures, yardAnimals } from './world/yard.js';
import { FS, S } from './world/people/figure.js';
import { roomAt } from './world/kit.js';
import { START, EYE } from './world/layout.js';
import { generateWorld, DEFAULT_SEED } from './world/gen/world.js';
import { People } from './app/people.js';
import { Animals } from './app/animals.js';
import { animalCameras } from './world/animals/cameras.js';
import { peopleCameras } from './world/people/cameras.js';
import { packWorld, unpackWorld, worldHash } from './world/pack.js';
import { shadowStore } from './scene/cpu/light.js';
import { buildInWorker, SharedShadows } from './app/worldboot.js';
import { MapView } from './app/map.js';
import { MapOverlay } from './app/mapover.js';
import { Signs, armYaw } from './game/signs.js';
import { compass as compassWord } from './game/places.js';
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
import { weatherFor, forecastOf, mainKind, KINDS } from './weather.js';
import { Menu, VERSION } from './app/menu.js';
import { BenchRun, browserName } from './app/benchrun.js';
import { loadDisplay, saveDisplay, seenCard, markCardSeen } from './app/settings.js';
import { moonLit } from './world/sky.js';
// (phase 5a) wayfaring: discovery, the journal, sketches, favours, saving
import { Wayfaring, clockOf } from './app/wayfaring.js';
import { toJSON as progressJSON, fromJSON as progressFrom, F as FAVOUR } from './game/progress.js';
import { Journal } from './app/journal.js';
import { Talk } from './app/talk.js';
import { Sound } from './sound/engine.js';
import { START_LINE, CHOICE } from './game/words.js';

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
  // the look candidates in use (LOOK.choices), from the URL or the defaults
  look: lookFrom(Object.fromEntries(Object.keys(LOOK.choices).map((k) => [k, params.get(k)]))),
  // the weather (phase 2b): 'auto', the world's forecast, or one kind held
  // (the lab and the stress scene keep fair, as before weather)
  weather: WORLD ? 'auto' : 'fair',
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
let pool = null, packed = null, shadows = null, shadowStores = null;
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
    scene: STRESS ? 'stress' : YARD ? 'yard' : 'default',
    init: YARD ? { gen: GEN } : {},
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
      const gen = generateWorld(SEED, GEN);
      let r;
      while (!(r = gen.next()).done) { worldProgress(r.value.stage, r.value.p); await nextTask(); }
      packed = packWorld(r.value, null);
    } else {
      packed = await buildInWorker(SEED, SHARED, worldProgress, GEN);
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
      shadowStores = stores;
      pool = new Pool(THREADS, fail, { scene: 'world', init: { world: packed, shared: SHARED, shadows: stores } });
      if (SHARED) shadows = new SharedShadows(w, packed, stores, pool, fail);
    }
    return w;
  }
  if (YARD) return buildYard(GEN);
  if (!STRESS) return buildWorld();
  const gen = buildStressWorld({ render: THREADS === 0 });
  let r;
  while (!(r = gen.next()).done) { progress.page = r.value; showProgress(); await nextTask(); }
  progress.page = 1;
  return r.value;
}
const worldBuild = { total: 0 };
const world = await makeWorld();
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
const ref = new RefView($('ref'));
const lookPanel = new LookPanel($('look'));
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
  const w = Math.max(64, innerWidth - ref.width());
  grid = layout(state.preset, w, innerHeight, dpr, innerWidth * innerHeight);
  presenter.resize(grid.cols, grid.rows, atlasFor(grid.cw), dpr);
  full = new Uint8Array(grid.cells * CELL_STRIDE);
}
let full = null;
ref.onResize = relayout;
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
  setTime(c.time);
  if (ref.on && c.ref) ref.show(c);
}
const start = STRESS || WORLD || YARD ? world.start : START;
standAt(start.x, start.z, start.yaw, start.pitch);
if (STRESS) state.camName = 'stress: start';
if (WORLD) { state.camName = 'spawn'; state.cam = -1; }
if (YARD) { state.camName = CAMS[0].name; state.cam = 0; }

const input = new Input(canvas, {
  time: setTime,
  toggleClock: () => { state.running = !state.running; state.frozen = false; },
  nextCamera: () => useCamera((state.cam + 1) % CAMS.length),
  jump: () => player.jump(),
  toggleGlyphs: () => setDisplay('glyphs', !display.glyphs),
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
  toggleLook: () => lookPanel.toggle(),
  cycleLook: (name) => { state.look = nextOption(state.look, name); },
  density: (d) => setDisplay('density', Math.max(0, Math.min(3, state.preset + d))),
  escape: () => onEscape(),
  unlocked: () => onUnlocked(),
});
input.sensitivity = display.sensitivity;
input.invert = display.invert;
input.blocked = () => menu.open || card.up || journal.open || talk.open;

relayout();

function makeFrame() {
  const f = {
    seq: ++state.seq,
    cam: { x: player.x, y: player.eye, z: player.z, yaw: player.yaw, pitch: player.pitch },
    cols: grid.cols, rows: grid.rows,
    fovY: LOOK.fovY * DEG,
    aspect: grid.cols / (2 * grid.rows),
    hour: state.hour, t: state.t, day: state.day,
    look: state.look,
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
  if (youNow) f.you = youNow;
  soundFrame = f;
  return f;
}
let youNow;

// (phase 4a) Greeting whoever is in front of you (E): their line, a few seconds.
// (phase 5a) Or, if they have a favour to ask or you bring them what they
// asked for, an exchange of a few lines with a choice; E again goes on.
let sayTimer = 0, greetCount = 0;
function greet() {
  if (talk.open) { talk.go(); return; }
  if (!people || !people.on || QUIET || menu.open || journal.open) return;
  const i = people.greetable({ x: player.x, z: player.z, feet: player.feet, yaw: player.yaw });
  if (i < 0) return;
  const ex = way && way.on ? way.greet(i, { day: state.day, hour: state.hour }) : null;
  if (ex) { showTalk(ex, i); lab.lastSaid = { name: ex.who.name, role: ex.who.role, text: ex.pages[0].lines.join(' '), exchange: true }; return; }
  const said = people.say(i, state.day, state.hour, weatherNow());
  const hail = way ? way.hail(i, greetCount++) : '';
  if (hail) said.text = `${hail} ${said.text}`;
  showSay(said.name, said.role, said.text);
  lab.lastSaid = said;
}
// (0.5.5) Who you could greet (E), and the signpost you stand by: shown
// low on the screen while they are near. The posts are read one at a
// time when the page has a moment, or at once when you come up to one.
let promptFor = -2, signFor = null, signFrames = 0;
function nearbyUI() {
  const blocked = menu.open || journal.open || talk.open || card.up || (map && map.on);
  // the prompt
  const i = !blocked && people && people.on ? people.greetable({ x: player.x, z: player.z, feet: player.feet, yaw: player.yaw }) : -1;
  const pr = $('prompt'), hintOn = $('hint').classList.contains('on');
  if (i !== promptFor) {
    promptFor = i;
    const who = i >= 0 ? people.nameOf(i) : null;
    const w = pr.querySelector('.what');
    w.textContent = '';
    if (who) { w.append('talk to '); const b = document.createElement('b'); b.textContent = who.name; w.append(b); }
  }
  pr.classList.toggle('on', i >= 0 && !hintOn);
  // the signpost
  if (!signs) return;
  if (++signFrames % 20 === 0) signs.step();
  const post = blocked || $('say').classList.contains('on') ? null : signs.near(player.x, player.z, player.feet);
  const el = $('sign');
  if (post !== signFor) {
    signFor = post;
    const ul = el.querySelector('ul');
    ul.innerHTML = '';
    if (post) {
      el.querySelector('.head').textContent = 'The signpost reads';
      for (const arm of post.arms) {
        const to = arm.to.filter((t) => t.dist > 60);
        if (!to.length) continue;
        const li = document.createElement('li'); li.dataset.yaw = String(armYaw(arm.a));
        li.innerHTML = '<span class="dir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 13h-4.5v8h-5v-8H5z"/></svg></span><span class="to"></span><span class="far"></span>';
        const t = li.querySelector('.to'), f = li.querySelector('.far');
        to.forEach((d, k) => { if (k) t.append(', '); const b = document.createElement('b'); b.textContent = d.name; t.append(b); });
        const dir = document.createElement('i');
        dir.textContent = ` · ${compassWord(post.x, post.z, post.x + Math.cos(arm.a), post.z + Math.sin(arm.a))}`;
        t.append(dir);
        f.textContent = to.map((d) => (d.dist < 950 ? `${Math.round(d.dist / 10) * 10} m` : `${(d.dist / 1000).toFixed(1)} km`)).join(', ');
        ul.append(li);
      }
      if (!ul.children.length) { const li = document.createElement('li'); li.textContent = 'Its arms are weathered blank.'; ul.append(li); }
    }
  }
  el.classList.toggle('on', !!post);
  // each arm's arrow, turned as you turn: up is the way you face
  if (post) for (const li of el.querySelectorAll('li[data-yaw]')) {
    const rel = (Number(li.dataset.yaw) - player.yaw) * 180 / Math.PI;
    li.querySelector('svg').style.transform = `rotate(${rel.toFixed(1)}deg)`;
  }
}
function showSay(name, role, text) {
  const el = $('say');
  el.querySelector('.who').innerHTML = '';
  if (name) { const b = document.createElement('b'); b.textContent = name; el.querySelector('.who').append(b, document.createTextNode(` · ${role}`)); }
  el.querySelector('.line').textContent = text;
  el.classList.add('on');
  clearTimeout(sayTimer);
  sayTimer = setTimeout(() => el.classList.remove('on'), 5200);
}
function hideSay() { clearTimeout(sayTimer); $('say').classList.remove('on'); }

// (phase 5a) The exchange's box, and what answering does.
const talk = new Talk($('talk'), {
  answer: (id, yes) => way.answer(id, yes, { day: state.day, hour: state.hour }),
  gift: (kind) => { if (kind === 'lantern') showNote('The lantern is yours now. L lights it or puts it away.', 'L', 9000); },
  words: { yes: CHOICE.yes, no: CHOICE.no, on: 'go on', bye: 'farewell' },
  done: (recapture) => {
    $('veil').classList.remove('on');
    input.clear();
    if (recapture && talkHadMouse) input.capture();
  },
});
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
// A quiet note low on the screen (a place found, a key for a new thing).
let noteTimer = 0;
function showNote(text, key = null, ms = 4200) {
  if (QUIET) return;
  hideHint();
  const el = $('note');
  el.replaceChildren();
  if (key) { const k = document.createElement('kbd'); k.textContent = key; el.append(k); }
  el.append(document.createTextNode(text));
  el.classList.add('on');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => el.classList.remove('on'), ms);
}
// K: the view in front of you, kept in the journal.
function sketch() {
  if (!way || !way.on || menu.open || journal.open || card.up || (map && map.on) || !full) return;
  way.sketch(full.slice(), grid.cols, grid.rows, { x: player.x, z: player.z, feet: player.feet, day: state.day, hour: state.hour, weather: weatherName() })
    .then((rec) => { if (rec && rec.full) showNote('The journal has no room for more sketches.'); lab.lastSketch = rec; });
}
// L: the lantern, once you have it (the look panel is Shift L in the world).
function lantern() {
  if (!way || !way.on) return false;
  if (!way.progress.lantern) { if (!QUIET) showNote('You have no lantern yet.'); return true; }
  way.toggleLantern();
  return true;
}

// The frame's weather (src/weather.js): a pure function of the seed, the day
// and the hour, or one kind held.
function weatherNow() { return typeof state.weather === 'object' ? state.weather : weatherFor(SEED, state.day, state.hour, state.weather); }

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
  const paused = menu.open || journal.open || talk.open;
  if (!state.held && !paused) player.update(dt, k);
  // (phase 5a) what you see and find, the lantern and what you carry
  if (way && way.on && started) {
    const aspect = grid.cols / (2 * grid.rows), hfov = 2 * Math.atan(Math.tan(LOOK.fovY * DEG / 2) * aspect);
    youNow = way.update(player, state.day, state.hour, hfov, people && people.on ? people.st : null);
    lab.wayMs = way.ms;
    for (const n of way.takeNotes()) { if (n.kind === 'say') showSay('', '', n.text); else showNote(n.text, 'J'); }
  } else youNow = undefined;
  if (started && !QUIET) nearbyUI();
  if (!state.frozen && !paused) {
    state.t += dt;
    if (state.running) {
      state.hour += dt * state.rate;
      if (state.hour >= 24) { state.hour -= 24; state.day++; }
    }
  }
  if (shadows) shadows.update(state.hour, state.day, state.look.night);
  // (phase 5b) the sound, every display frame, from the newest frame's people
  // and animals
  if (sound && sound.on) {
    const sf = soundFrame;
    sound.update({
      x: player.x, z: player.z, feet: player.feet, eye: player.eye, yaw: player.yaw, mode: player.mode, flying: player.flying,
      room: roomAt(world.kit, player.x, player.z, player.feet + 0.02), running: !!(input.keys.ShiftLeft || input.keys.ShiftRight),
      t: state.t, hour: state.hour, day: state.day, weather: sf ? sf.weather : weatherNow(),
      people: sf && sf.people, lit: sf && sf.lit, animals: sf && sf.animals,
      paused: menu.open || journal.open ? 'menu' : talk.open ? 'talk' : null,
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
    threads: THREADS, hour: state.hour, day: state.day, night: state.look.night, timeName, running: state.running, frozen: state.frozen, camName: state.camName,
    weather: WORLD || state.weather !== 'fair' ? weatherName() : null,
    stress: STRESS, buildMs: buildMs(), sweepMs: shadows ? shadows.sweepMs : light.sweepMs, settled: light.settled, pace: local ? 1 : pacer.every,
    world: WORLD ? { seed: SEED, shared: SHARED, isolated: ISOLATED, buildMs: worldBuild.total, mode: player.mode, map: !!(map && map.on) } : null,
  });
  lookPanel.update(state.look);
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
  .then(() => { started = true; $('progress').style.display = 'none'; if (!card.show()) showHint(); });

// M: the overhead map, drawn in the same cells, instead of the view
function presentMap() {
  const fog = way && way.on ? way.fog() : null;
  const cells = map.render(grid.cols, grid.rows, player, fog, { marks: !mapOver });
  full = cells;
  presenter.upload(0, grid.cols, cells);
  presenter.draw();
  if (mapOver) {
    const aspect = grid.cols / (2 * grid.rows), hfov = 2 * Math.atan(Math.tan(LOOK.fovY * DEG / 2) * aspect);
    mapOver.update(map.geometry(), $('view').getBoundingClientRect(), { x: player.x, z: player.z, yaw: player.yaw, hfov }, fog);
  }
}
requestAnimationFrame(tick);

// ---- the menu, the start card and the hint (phase 2b) --------------------------

// A Display choice, applied at once and kept for the next visit.
function setDisplay(k, v, keep = true) {
  display[k] = v;
  if (state.preset !== display.density) { state.preset = display.density; relayout(); }
  presenter.glyphs = display.glyphs;
  if (k === 'hud') hud.setMode(display.hud);
  input.sensitivity = display.sensitivity; input.invert = display.invert;
  if (keep) saveDisplay(display);
}

const pad2 = (n) => String(n).padStart(2, '0');
function clockText() { const hh = Math.floor(state.hour), mm = Math.floor((state.hour - hh) * 60); return `${pad2(hh)}:${pad2(mm)}`; }
// The weather now, in a few words: one kind, or one turning into another.
function weatherName() {
  const w = weatherNow(), main = mainKind(w);
  const other = KINDS.filter((k) => k !== main && (w.mix[k] || 0) > 0.05).sort((a, b) => w.mix[b] - w.mix[a])[0];
  return other ? `${main} turning ${other}` : main;
}
const reload = (q) => { location.search = q.toString(); };

const game = {
  scene: WORLD ? 'world' : STRESS ? 'stress' : YARD ? 'yard' : 'lab',
  seed: SEED,
  cameras: CAMS,
  get display() { return display; },
  // (phase 5b) the Sound section's
  get sound() { return sound; },
  setDisplay,
  get rate() { return state.running ? state.rate : 0; },
  setRate(r) { if (r === 0) state.running = false; else { state.rate = r; state.running = true; state.frozen = false; } },
  get weather() { return state.weather; },
  setWeather(m) { state.weather = m; },
  setTime(name) { setTime(name); },
  get look() { return state.look; },
  setLook(name, v) { state.look = lookFrom({ ...state.look, [name]: v }); },
  camera(i) { useCamera(i); },
  newWorld(seed) { const q = new URLSearchParams(location.search); q.set('seed', String(seed !== undefined ? seed : (Math.random() * 1e6) >>> 0)); reload(q); },
  goScene(sc) {
    const q = new URLSearchParams(location.search);
    q.delete('lab'); q.delete('stress'); q.delete('yard');
    if (sc === 'lab') q.set('lab', '1'); else if (sc === 'stress') q.set('stress', '1'); else if (sc === 'yard') q.set('yard', '1');
    reload(q);
  },
  // A link to this exact world (its seed), to the clipboard.
  copyLink() { return this.copyText(`${location.href.split(/[?#]/)[0]}?seed=${SEED}`); },
  // Some text to the clipboard (the benchmark's result too).
  async copyText(link) {
    try { await navigator.clipboard.writeText(link); return true; } catch { /* try the old way */ }
    try {
      const t = document.createElement('textarea');
      t.value = link; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.append(t); t.select();
      const ok = document.execCommand('copy');
      t.remove();
      return ok;
    } catch { return false; }
  },
  // Where the clock and the sky stand, for the menu: `preset` names the time
  // of day only while the clock stands exactly on it.
  now() {
    return {
      clock: clockText(), timeName: keyName(state.hour), day: state.day, running: state.running,
      preset: ['dawn', 'day', 'dusk', 'night'].find((k) => Math.abs(state.hour - LOOK.hours[k]) < 1e-9) || null,
      moon: state.look.night === 'moon' ? Math.round(100 * moonLit(state.hour, state.day)) : null,
      weather: WORLD || state.weather !== 'fair' ? weatherName() : 'fair',
    };
  },
  weatherLine() {
    if (!WORLD && state.weather === 'fair') return 'The Look Lab and the stress scene keep fair weather unless one is held here.';
    if (typeof state.weather === 'object') return `set by a tool: ${weatherName()}${state.weather.wet ? ', wet ground' : ''}`;
    return state.weather === 'auto' ? `now ${weatherName()}, from the forecast for seed ${SEED}, day ${state.day}` : `held: ${state.weather}`;
  },
  // (phase 4a) everyone, for the menu's list
  get people() { return people ? lab.people : null; },
  // (phase 4b) the animals, for the menu's counts and its camera buttons
  get animals() { return animals ? lab.animals : null; },
  // (phase 5a) what is saved for this world, for the menu's World section
  get progress() {
    if (!way || !way.on) return null;
    return { line: () => way.saveLine(), note: () => way.store.note, backup: () => way.backup(), restore: (t) => way.restore(t), clear: () => way.clear(), open: (seed) => this.newWorld(seed) };
  },
  workersLine() {
    if (!THREADS) return 'everything on the page, no workers';
    if (!WORLD) return `${THREADS} workers, each building its own copy of the scene`;
    return SHARED ? `${THREADS} workers, sharing one copy of the world (shared memory)`
      : `${THREADS} workers, each with its own copy of the world (${ISOLATED ? 'shared memory off' : 'the page is not cross-origin isolated'})`;
  },
  close({ recapture }) { closeMenu(recapture); },
};
// (phase 3b) the benchmark in the menu (src/app/benchrun.js)
const DETAIL_NAMES = ['coarse', 'medium', 'fine', 'finest'];
game.bench = new BenchRun({
  cameras: CAMS,
  save: () => ({ hour: state.hour, t: state.t, day: state.day, running: state.running, frozen: state.frozen, weather: state.weather, cam: state.cam, camName: state.camName, held: state.held,
    x: player.x, z: player.z, feet: player.feet, yaw: player.yaw, pitch: player.pitch, vy: player.vy, eyeLag: player.eyeLag }),
  restore: (s) => {
    Object.assign(state, { hour: s.hour, t: s.t, day: s.day, running: s.running, frozen: s.frozen, weather: s.weather, cam: s.cam, camName: s.camName, held: s.held });
    Object.assign(player, { x: s.x, z: s.z, feet: s.feet, yaw: s.yaw, pitch: s.pitch, vy: s.vy, eyeLag: s.eyeLag });
  },
  useCamera: (i) => useCamera(i),
  setWeather: (w) => { state.weather = w; },
  freeze: () => { state.frozen = true; state.running = false; },
  whenIdle: () => lab.whenIdle(),
  timings: (n) => lab.timings(n),
  info: () => ({
    when: new Date().toISOString().slice(0, 16).replace('T', ' '), browser: browserName(),
    workers: THREADS ? `${THREADS} workers` : 'no workers', shared: SHARED,
    detail: DETAIL_NAMES[state.preset] || String(state.preset), cells: `${grid.cells} cells, ${grid.cols} x ${grid.rows}`,
    scene: game.scene, seed: WORLD ? SEED : undefined, screen: `${innerWidth} x ${innerHeight} at ${devicePixelRatio}`,
  }),
});
lab.bench = game.bench;   // (for the tools)
// (phase 5b) the sound, for the tools: off unless a tool turns it on (the
// page then needs no click: the tools' browsers allow sound from the start)
lab.sound = {
  enable() { if (!sound) return false; sound.allowed = true; return sound.unlock(); },
  get on() { return !!(sound && sound.on); },
  get settings() { return sound ? { ...sound.settings } : null; },
  set(name, v) { if (sound) sound.set(name, v); },
  startLog() { if (!sound) return; sound.log = []; sound.peak = 0; sound.prePeak = 0; sound.maxVoices = 0; sound.dropped = 0; },
  takeLog() { if (!sound || !sound.log) return null; const l = sound.log; sound.log = []; return l; },
  get spikes() { return sound ? (sound.spikes || []).slice() : []; },
  get state() { return sound && sound.on ? { peak: sound.peak, prePeak: sound.prePeak || 0, maxVoices: sound.maxVoices, voices: sound.voicesNow, dropped: sound.dropped, ms: sound.ms, beds: sound.bedLog || null, underfoot: sound.underfoot || null, ctx: sound.ctx.state, time: sound.ctx.currentTime } : null; },
  scene() { if (!sound || !sound.scene) return null; const c = (g) => g.cells.reduce((a, x) => a + x.length, 0); const S = sound.scene; return { lake: c(S.water.lake), river: c(S.water.river), sea: c(S.water.sea), trees: c(S.trees), fires: c(S.fires), wells: S.wells.slice(), chapels: S.chapels.slice(), gate: S.gate, bridges: S.bridges.slice() }; },
  stream() { return sound && sound.on ? sound.recordStream() : null; },
  get engine() { return sound; },
  // (0.5.3) the music: what plays, and the next piece now
  get music() { const m = sound && sound.music; return m ? { playing: !!m.piece, mode: m.piece ? m.piece.mode : null, bpm: m.piece ? +m.piece.bpm.toFixed(1) : null, lead: m.piece ? m.piece.lead : null, played: m.played, nextIn: m.piece ? 0 : +(m.nextAt - sound.ctx.currentTime).toFixed(1) } : null; },
  nextPiece() { if (sound && sound.music) sound.music.next(); },
};
lab.version = VERSION;
// (phase 4a) people, for the tools and the menu (before the menu, which
// lists them)
// (0.5.5) the signposts, read: [{ x, z, arms: [{ a, to: [{ name, dist }] }] }]
lab.signs = () => (signs ? signs.posts.map((P, i) => { signs.read(i); return { x: P.x, z: P.z, arms: P.arms.map((r) => ({ a: r.a, to: r.to.map((t) => ({ name: t.name, dist: Math.round(t.dist) })) })) }; }) : []);
lab.people = {
  get count() { return people ? people.n : 0; },
  get on() { return !!(people ? people.on : yardFolk && yardFolk.on); },
  set(on) { if (people) people.setOn(on, player); if (yardFolk) yardFolk.on = !!on; },
  list() { return people ? people.list() : []; },
  get updateMs() { return people ? people.updateMs : 0; },
  // which houses are lit, asleep or awake at home this frame (see litGroups)
  get lit() { return people ? Array.from(people.lit) : []; },
  get buildMs() { return people ? people.buildMs : 0; },
  // the camera beside person i, `dist` metres off, looking at them
  goTo(i, dist = 3) {
    if (!people) return false;
    const p = people.list()[i];
    if (!p) return false;
    const a = p.yaw + 0.6, x = p.x + Math.sin(a) * dist, z = p.z + Math.cos(a) * dist;
    player.place(x, z, Math.atan2(p.x - x, p.z - z), -0.08);
    state.held = false; state.camName = `with ${p.name}`;
    return true;
  },
  greet() { greet(); return lab.lastSaid || null; },
};
// (phase 4b) animals, for the tools and the menu: counts by kind, the
// groups, and the camera to one of them
lab.animals = {
  get on() { return !!(animals ? animals.on : yardBeasts && yardBeasts.on); },
  set(on) { if (animals) animals.setOn(on); if (yardBeasts) yardBeasts.on = !!on; if (!on && player) player.others = null; },
  counts() { return animals ? animals.counts() : []; },
  groups() { return animals ? animals.groups() : []; },
  get updateMs() { return animals ? animals.updateMs : 0; },
  get buildMs() { return animals ? animals.buildMs : 0; },
  get left() { return animals ? animals.left : 0; },
  // this frame's states (AS numbers each) and how many
  states() { return animals ? Array.from(animals.st.subarray(0, animals.count * 16)) : []; },
  // where group g is this frame (the middle of its members)
  where(g) { return animals ? animals.where(g) : null; },
  // the camera `dist` metres off group g, looking at it (from its open side)
  goTo(g, dist = 12, pitch = null) {
    if (!animals) return false;
    if (people && people.planned < 0) people.planDay(state.day);
    animals.update(state.day, state.hour, null, null, null, weatherNow());
    const w = animals.where(g);
    if (!w) return false;
    const info = animals.groups()[g];
    const a = (g * 2.39996) % (Math.PI * 2);
    let best = null;
    for (let k = 0; k < 12; k++) {
      const b = a + k * Math.PI / 6, x = w.x + Math.sin(b) * dist, z = w.z + Math.cos(b) * dist;
      if (!player.blocked(x, z, player.restAt ? player.restAt(x, z) : 0)) { best = [x, z]; break; }
    }
    const [x, z] = best || [w.x + Math.sin(a) * dist, w.z + Math.cos(a) * dist];
    // (looking at them: up to a perch, down to the water)
    const eye = player.restAt(x, z) + EYE, d = Math.hypot(w.x - x, w.z - z);
    player.place(x, z, Math.atan2(w.x - x, w.z - z), pitch !== null ? pitch : w.y !== null ? Math.atan2(w.y + 0.4 - eye, d) : -0.1);
    state.held = false; state.camName = `by the ${info.type}`;
    return true;
  },
};
// (phase 5a) the progress, for the tools: on or off, read, set, clear;
// the journal, the exchange, sketches and the lantern, driven as a player would
lab.progress = {
  get on() { return !!(way && way.on); },
  // turn it on in a tool (it starts cleared; `store: false` keeps nothing)
  enable(opts = {}) { if (!way) return false; way.enable({ meet: false, ...opts }); return true; },
  get() { return way && way.on ? JSON.parse(progressJSON(way.progress)) : null; },
  set(json) {
    if (!way || !way.on) return false;
    const p = progressFrom(typeof json === 'string' ? json : JSON.stringify(json), SEED, world.N);
    if (!p) return false;
    way.progress = p; way.afterReset();
    return true;
  },
  clear() { if (way && way.on) way.clear(); },
  save() { if (way && way.on) way.save(true); },
  stored() { try { return localStorage.getItem(`land-of-ascii-v3.progress.${SEED}`); } catch { return null; } },
  note() { return way ? way.store.note : ''; },
  get ms() { return way ? way.ms : 0; },
  get saveMs() { return way ? way.saveMs || 0 : 0; },
  get saves() { return way ? way.saves || 0 : 0; },
  get buildMs() { return way ? way.buildMs : 0; },
  places() { return way && way.on ? way.places.list.map((p) => ({ id: p.id, kind: p.kind, title: p.title, where: p.where, x: p.x, z: p.z, D: p.D, at: p.at })) : []; },
  favours() {
    if (!way || !way.on) return [];
    return way.fav.list.map((f) => ({ id: f.id, kind: f.kind, giver: f.giver, giverName: people.P.persons[f.giver].name, dest: f.dest, destName: f.dest !== undefined ? people.P.persons[f.dest].name : null,
      spot: f.spot ? { x: f.spot.x, z: f.spot.z, ft: f.spot.ft, kind: f.spot.kind, lost: f.spot.lost } : null, len: f.len, parent: f.parent, first: !!f.first, shape: f.shape,
      ask: f.ask, state: way.stateOf(f), words: way.journal().favours.find((x) => x.id === f.id)?.words || null,
      usual: { giver: way.fav.usual.get(f.giver) ? { place: way.fav.usual.get(f.giver).place } : null, dest: f.dest !== undefined && way.fav.usual.get(f.dest) ? { place: way.fav.usual.get(f.dest).place } : null } }));
  },
  // a favour's state set directly (0 new .. 4 done)
  setFavour(id, st) { const f = way.fav.list.find((x) => x.id === id); if (!f) return false; way.setState(f, st, state.day, state.hour); return true; },
  meet() { const m = way && way.fav && way.fav.meet; return m ? { person: m.person, name: people.P.persons[m.person].name, dep: m.dep, arrive: m.arrive, leave: m.leave, back: m.back, spot: { x: m.spot.x, z: m.spot.z, yaw: m.spot.yaw }, on: way.meetOn, town: m.town } : null; },
  journal: {
    open(tab) { return openJournal(tab); }, close() { closeJournal(); }, read() { return journal.read(); },
    tab(id) { journal.select(id, true); }, view(id) { return journal.view(id); }, page(d) { journal.page(d); }, shut() { return journal.shutViewer(); },
    data() { return way && way.on ? way.journal() : null; },
  },
  talk: { read() { return talk.read(); }, go() { talk.go(); }, choose(yes) { talk.choose(yes); }, later() { talk.later(); } },
  async sketch() { sketch(); await new Promise((r) => setTimeout(r, 50)); for (let k = 0; k < 40 && !lab.lastSketch; k++) await new Promise((r) => setTimeout(r, 25)); const r2 = lab.lastSketch; lab.lastSketch = null; return r2; },
  async sketchHash(id) { const c = await way.sketchCells(id); if (!c) return null; let h = 0x811c9dc5; for (let i = 0; i < c.length; i++) { h ^= c[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); },
  async sketchText(id) { const s = way.progress.sketches.find((x) => x.id === id); const c = await way.sketchCells(id); const { sketchText } = await import('./app/journal.js'); return c ? sketchText(c, s.cols, s.rows) : null; },
  lantern() { return lantern(); },
  setLit(on) { if (!way || !way.on) return false; if (on && !way.progress.lantern) way.progress.lantern = true; way.progress.lit = !!on; way.touch(true); return true; },
  backup() { return way.backup(); },
  restore(text) { return way.restore(text); },
  you() { return youNow ? { ...youNow, lost: youNow.lost.slice() } : null; },
  FAVOUR,
};
const menu = new Menu($('menu'), game);
let menuNext = 0, menuOpenedAt = 0, releasing = false;

// (phase 5a) The journal (J): over the world, which stands still under it.
const journal = new Journal($('journal'), {
  data: () => way.journal(),
  cells: (id) => way.sketchCells(id),
  copy: (text) => game.copyText(text),
  close: () => closeJournal(),
});
function toggleJournal() { if (journal.open) closeJournal(); else openJournal(); }
function openJournal(tab) {
  if (!way || !way.on || QUIET || state.failed || card.up || menu.open || journal.open) return false;
  input.clear();
  talk.close();
  journal.show(tab);
  journalOpenedAt = performance.now();
  if (document.pointerLockElement) { releasing = true; document.exitPointerLock(); }
  return true;
}
function closeJournal(recapture = false) {
  if (!journal.open) return;
  journal.hide();
  input.clear();
  if (recapture) input.capture();
}
let journalOpenedAt = 0;

function openMenu() {
  if (QUIET || state.failed || card.up || menu.open) return false;
  input.clear();
  menu.show();
  menuOpenedAt = performance.now();
  hideHint();
  // (the menu gives the mouse back; that is not a reason to open it again)
  if (document.pointerLockElement) { releasing = true; document.exitPointerLock(); }
  return true;
}
// Resume takes the mouse again; Escape, a click beside the menu or anything
// else that closes it does not.
function closeMenu(recapture = false) {
  if (!menu.open) return;
  // (a benchmark under way stops, and puts everything back)
  game.bench.cancel();
  menu.hide();
  input.clear();
  if (recapture) input.capture();
}
function onEscape() {
  if (card.up) { card.dismiss(false); return; }
  // (phase 5a) an exchange: another time; the journal: its sketch, then itself
  if (talk.open) { talk.later(); return; }
  if (journal.open) {
    if (performance.now() - journalOpenedAt < 350) return;
    if (!journal.shutViewer()) closeJournal(false);
    return;
  }
  if (menu.open) {
    // (the browser may deliver the Escape that freed the mouse after the
    // menu has already opened for it)
    if (performance.now() - menuOpenedAt < 350) return;
    closeMenu(false);
  } else openMenu();
}
// The browser frees a captured mouse on the first Escape (or when the tab is
// left): open the menu then too, so one press always works.
function onUnlocked() {
  if (releasing) { releasing = false; return; }
  // (the Escape that freed the mouse during an exchange answers it)
  if (talk.open) { talk.later(); return; }
  if (journal.open) return;
  openMenu();
}

// The start card, on the first visit only: the title, click to explore, the
// essential keys.
const card = {
  el: $('card'),
  up: false,
  show() {
    if (QUIET || !WORLD || state.failed || seenCard()) return false;
    this.up = true;
    // (phase 5a) in a first session, only this: someone is waiting on the road
    if (way && way.meetOn) { this.el.querySelector('.go').textContent = START_LINE; this.el.querySelector('.sub').hidden = false; }
    if (sound) this.el.querySelector('.snd').hidden = false;
    this.el.classList.add('on');
    requestAnimationFrame(() => this.el.classList.add('shown'));
    this.el.focus({ preventScroll: true });
    return true;
  },
  dismiss(capture) {
    if (!this.up) return;
    this.up = false;
    markCardSeen();
    this.el.classList.remove('shown', 'on');
    if (capture) input.capture();
    showHint();
  },
};
card.el.addEventListener('click', () => card.dismiss(true));
addEventListener('keydown', (e) => { if (card.up && e.key !== 'Escape' && e.key !== 'Tab' && !e.repeat) { e.preventDefault(); card.dismiss(true); } });

// The hint that Escape opens the menu, fading after a few seconds.
let hintTimer = 0;
function showHint() {
  if (QUIET || state.failed) return;
  const el = $('hint');
  el.classList.add('on');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => el.classList.remove('on'), 4000);
}
function hideHint() { clearTimeout(hintTimer); $('hint').classList.remove('on'); }

// ---- the debug handle ---------------------------------------------------------

Object.assign(lab, {
  ready,
  threads: THREADS,
  stress: STRESS,
  scene: WORLD ? 'world' : STRESS ? 'stress' : YARD ? 'yard' : 'lab',
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
  // Freeze every clock (time of day and the animation clock); `day` sets
  // the day count too (the moon's phase).
  freeze(hour, t = 0, day) {
    state.frozen = true; state.running = false;
    if (hour !== undefined) state.hour = typeof hour === 'string' ? LOOK.hours[hour] : hour;
    state.t = t;
    if (day !== undefined) state.day = day;
  },
  setDay(d) { state.day = d; },
  unfreeze() { state.frozen = false; },
  setHour(h) { state.hour = typeof h === 'string' ? LOOK.hours[h] : h; },
  // (`rate`: game hours a real second, phase 2b; the menu's speeds)
  runClock(on = true, rate) { state.running = on; if (rate !== undefined) state.rate = rate; },
  setDensity(i) { setDisplay('density', Math.max(0, Math.min(3, i)), false); },
  setGlyphs(on) { setDisplay('glyphs', !!on, false); },
  setHud(on) { hud.force(on ? 'full' : 'none'); },
  // The menu, the hint and the start card suppressed (the tools), or not.
  setQuiet(on) {
    QUIET = !!on;
    if (QUIET) { closeMenu(false); if (card.up) { card.up = false; card.el.classList.remove('shown', 'on'); } hideHint(); }
    // (the tools' pictures carry no statistics unless they ask: lab.setHud)
    hud.setMode(QUIET ? 'none' : display.hud);
  },
  // The menu, for the tools: open it, close it, read what it shows.
  menu: {
    open() { return openMenu(); },
    close(recapture = false) { closeMenu(recapture); },
    isOpen() { return menu.open; },
    read() { return { ...menu.read(), quiet: QUIET, card: card.up, hint: $('hint').classList.contains('on'), hud: hud.shown, display: { ...display } }; },
  },
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
  // The weather: setWeather('auto') for the forecast, or one kind held
  // ('clear', 'fair', 'overcast', 'rain', 'mist'); weather() what it is now
  // (the mode, the kind that applies most, the frame's mix, wetness and
  // drift, and today's forecast).
  // (for the tools also a frame's weather itself, { mix, wet, drift }: e.g.
  // { mix: { fair: 1 }, wet: 1 }, fair weather on wet ground)
  setWeather(mode) {
    if (mode === 'auto' || KINDS.includes(mode)) state.weather = mode;
    else if (mode && typeof mode === 'object' && mode.mix) state.weather = { mix: { ...mode.mix }, wet: +mode.wet || 0, drift: +mode.drift || 0 };
    return state.weather;
  },
  weather() { const w = weatherNow(); return { mode: state.weather, kind: mainKind(w), ...w, forecast: forecastOf(SEED, state.day) }; },
  setLookPanel(on) { if (lookPanel.on !== !!on) lookPanel.toggle(); },
  state() {
    return {
      x: player.x, z: player.z, eye: player.eye, yaw: player.yaw / DEG, pitch: player.pitch / DEG,
      hour: state.hour, t: state.t, day: state.day, frozen: state.frozen, running: state.running,
      preset: state.preset, cols: grid.cols, rows: grid.rows, cells: grid.cells, cw: grid.cw, dpr,
      threads: THREADS, presented: state.presented, camName: state.camName, settled: light.settled,
      isolated: !!self.crossOriginIsolated, shared: SHARED, look: { ...state.look }, mode: player.mode, flying: player.flying,
      pace: local ? 1 : pacer.every, lag: local ? 0 : pacer.lag, refresh: pacer.refresh,
      weather: state.weather, menu: menu.open, rate: state.running ? state.rate : 0,
      glyphs: presenter.glyphs, sensitivity: input.sensitivity, invert: input.invert,
      stripes: pool && pool.edges ? Array.from(pool.edges) : null,
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
  setFly(on) { if ((WORLD || YARD) && player.flying !== !!on) player.toggleFly(); },
  // The overhead map (M) on or off.
  setMap(on) { if (map && map.on !== !!on) { map.toggle(); if (mapOver) mapOver.show(map.on); } },
  // Turn to a yaw (degrees) without moving.
  face(yaw) { player.yaw = yaw * DEG; },
  // The ground and the drawn surface (the water's level where there is water) at a point.
  ground(x, z) {
    const T = world.terrain;
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
    if (SHARED && packed) {
      for (const a of Object.values(packed.arrays)) shared += a.byteLength;
      for (const st of [shadowStores.V, ...shadowStores.S]) for (const a of [].concat(st)) shared += a.byteLength;
    }
    return { bytes: m.bytes, shared, holders: SHARED ? THREADS + 2 : 1,
      breakdown: m.breakdown.map((b) => ({ bytes: b.bytes, types: b.types, scope: b.attribution.map((a) => a.scope).join(',') })) };
  },
});
