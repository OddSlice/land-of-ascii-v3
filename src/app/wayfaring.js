// Wayfaring on the main thread (phase 5a): the player's progress kept up
// to date each frame, and everything that reads it.
// - What you have seen (src/game/discovery.js) and the places you find
//   (src/game/places.js), checked a few times a second.
// - Who you have met, and when you last saw them.
// - Favours (src/game/favours.js): what someone says when you greet them,
//   as an exchange of a few lines with a choice; things picked up where
//   they were lost; the standing they earn; the lantern.
// - The first meeting: in a first session, the first favour's giver walks
//   out to the spawn's road (a pure function of the clock, applied over
//   their day's state, see People.update).
// - Sketches (K): the current frame's cells, kept with the place, the hour
//   and the weather.
// - Saving (src/game/progress.js): a change is written within a few
//   seconds, at once for a favour, a sketch or the lantern, and when the page
//   is left.
// Off (the tools, which run with progress cleared): nothing is tracked or
// drawn, and nothing changes from phase 4b.
import { freshProgress, fromJSON, toJSON, Store, F, countBits, packSketch, unpackSketch, backupText, readBackup, bit, packBits } from '../game/progress.js';
import { placesOf, finds, compass, fill, cap } from '../game/places.js';
import { buildFavours, favourWords, START_DAY, START_HOUR } from '../game/favours.js';
import { Discovery, VIEW_REVEAL } from '../game/discovery.js';
import { FS, S, POSE } from '../world/people/figure.js';
import { roomAt } from '../world/kit.js';
import { mainKind } from '../weather.js';
import { WAITING, BACK, AND_ME, LATER, YES, LANTERN_GIFT, STANDING, HAILS, PICK_UP, SKETCHED, SKETCHED_NOTABLE, NOTABLE_WALL, NOTABLE_HILL, NOTABLE_AT, PARTS_OF_DAY, FIRST, CHOICE, CARRY, FIND } from '../game/words.js';

const SAVE_EVERY = 4000;          // ms: changes are written at most this often (sooner for the important ones)
const PICK = 1.8;                 // m: how close a lost thing is picked up
const MAX_SKETCHES = 60;

const STRIDE = 1.3;

export function partOfDay(h) { for (const [t, w] of PARTS_OF_DAY) if (h < t) return w; return 'night'; }
export function clockOf(h) { const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

export class Wayfaring {
  // `people`: the app's People (src/app/people.js); `on`: false for the
  // tools (progress cleared, nothing drawn).
  constructor(world, people, { on = true } = {}) {
    this.world = world;
    this.people = people;
    this.on = false;
    this.seed = world.seed;
    this.listeners = [];
    this.ms = 0;
    this.frameNo = 0;
    this.notes = [];             // lines to show (picked up, found, sketched)
    this.lastSave = 0;
    this.dirty = false;
    this.urgent = false;
    this.sketchCache = new Map();
    this.store = new Store(this.seed, { off: true });
    this.progress = freshProgress(this.seed, world.N);
    this.meetOn = false;
    if (on) this.enable();
  }

  // Start tracking (at load, or by a tool): read what is saved.
  // (`meet`: the first meeting in a first session; a tool turning progress
  // on has none unless it asks)
  enable({ store = true, meet = true } = {}) {
    if (this.on) return;
    const t0 = performance.now();
    this.on = true;
    const W = this.world, P = this.people.P;
    this.places = placesOf(W);
    this.fav = buildFavours(W, P, this.places);
    this.disc = new Discovery(W);
    this.store = new Store(this.seed, { off: !store });
    const saved = this.store.get('progress');
    const p = saved ? fromJSON(saved, this.seed, W.N) : null;
    this.progress = p || freshProgress(this.seed, W.N);
    this.fresh = !p;
    // (the first meeting: a first session only)
    this.meetOn = meet && this.fresh && !!this.fav.meet && !this.progress.first;
    this.people.meet = this.meetOn ? this.meetState() : null;
    this.buildMs = performance.now() - t0;
    if (typeof addEventListener === 'function' && !this.hooked) {
      this.hooked = true;
      const flush = () => this.save(true);
      addEventListener('pagehide', flush);
      addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    }
    this.changed();
  }

  // ---- each frame -------------------------------------------------------------------

  // Tracks what you see and where you are; returns the frame's `you`
  // (what the renderer draws for you), or undefined.
  update(player, day, hour, hfov, people) {
    if (!this.on) return undefined;
    const t0 = performance.now();
    const p = this.progress, k = this.frameNo++;
    // what is in view, and where you walk
    if (this.disc.step(p, player.x, player.z, player.eye, player.yaw, hfov)) this.touch();
    // the places, one a frame in turn (each a few times a second)
    const list = this.places.list, pl = list[k % list.length];
    if (!p.found[pl.id] && finds(this.world, pl, player.x, player.z, player.eye)) {
      p.found[pl.id] = [day, round2(hour)];
      this.note(`The journal notes ${pl.title}.`, 'found');
      this.touch(true);
    }
    // (standing on a viewpoint shows the land round it)
    if (pl.kind === 'viewpoint' && !this.revealed?.has(pl.id) && Math.hypot(pl.x - player.x, pl.z - player.z) < 8) {
      (this.revealed ||= new Set()).add(pl.id);
      if (this.disc.circle(p, pl.x, pl.z, VIEW_REVEAL)) this.touch();
    }
    // a lost thing within reach is picked up
    for (const f of this.fav.list) {
      if (f.kind !== 'find' || this.stateOf(f) !== F.TAKEN) continue;
      const s = f.spot;
      if (Math.hypot(s.x - player.x, s.z - player.z) < PICK && Math.abs(s.ft - player.feet) < 1.5) {
        this.setState(f, F.GOT, day, hour);
        this.note(cap(fill(PICK_UP, { short: f.slots.short, lost: f.spot.lost })), 'say');
      }
    }
    // when you last saw the people you have met (every half second)
    if (people && k % 30 === 5) {
      for (const id of Object.keys(p.met)) {
        const o = Number(id) * FS;
        if (o >= people.length || people[o + S.POSE] === POSE.HIDDEN) continue;
        if (Math.hypot(people[o + S.X] - player.x, people[o + S.Z] - player.z) > 12) continue;
        const was = p.met[id];
        if (was[0] !== day || Math.abs(was[1] - hour) > 0.1) { p.met[id] = [day, round2(hour)]; this.touch(); }
      }
    }
    // (the walk's stride, for the hands' sway)
    if (this.lastX !== undefined) this.walked = (this.walked || 0) + Math.hypot(player.x - this.lastX, player.z - this.lastZ);
    this.lastX = player.x; this.lastZ = player.z;
    this.maybeSave();
    const you = this.you(player);
    this.ms = performance.now() - t0;
    return you;
  }

  // What the renderer draws for you: the lantern, the thing carried, the
  // lost things (of favours taken).
  you(player) {
    const p = this.progress, list = this.fav.list;
    // (the favours looked at without making anything; the lost things'
    // list and the answer are made again only when they change)
    let carry = null, latest = -1, key = 0, nl = 0;
    for (let j = 0; j < list.length; j++) {
      const f = list[j], st = this.stateOf(f);
      if (f.kind === 'find' && st === F.TAKEN) { key = (key * 31 + j + 1) | 0; nl++; }
      if ((f.kind === 'carry' && st === F.TAKEN) || (f.kind === 'find' && st === F.GOT)) {
        const t = p.favours[f.id].n || 0;
        if (t > latest) { latest = t; carry = f.shape; }
      }
    }
    if (!p.lit && !carry && !nl) return undefined;
    let y = this.youWas;
    if (!y || y.lantern !== !!p.lit || y.carry !== carry || this.lostKey !== key) {
      const lost = [];
      for (const f of list) if (f.kind === 'find' && this.stateOf(f) === F.TAKEN) lost.push([f.spot.x, f.spot.z, f.spot.ft, f.shape, f.spot.yaw]);
      y = this.youWas = { lantern: !!p.lit, carry, lost, walk: 0, room: -1 };
      this.lostKey = key;
    }
    y.walk = this.walked || 0;
    y.room = p.lit || carry ? roomAt(this.world.kit, player.x, player.z, player.feet + 0.02) : -1;
    return y;
  }

  // ---- favours ------------------------------------------------------------------------

  stateOf(f) { const r = this.progress.favours[f.id]; return r ? r.s : F.NEW; }
  setState(f, s, day, hour) {
    const p = this.progress;
    p.seq = Math.max(p.seq || 0, ...Object.values(p.favours).map((r) => r.n || 0)) + 1;
    p.favours[f.id] = { s, t: [day, round2(hour)], n: p.seq };
    this.touch(true);
  }
  // Can f be asked now? Not before what the favour it follows asked of you
  // has reached them: a thing carried to them (done), or word brought to
  // them (whose answer you then carry back)
  open(f) {
    if (this.stateOf(f) >= F.TAKEN) return false;
    if (!f.parent) return true;
    const pa = this.fav.list.find((x) => x.id === f.parent), ps = this.stateOf(pa);
    return ps === F.DONE || (pa.kind === 'tell' && ps === F.GOT);
  }
  get done() { return this.fav ? this.fav.list.filter((f) => this.stateOf(f) === F.DONE).length : 0; }
  get standing() { const d = this.done; let t = STANDING[0]; for (const s of STANDING) if (d >= s.at) t = s; return t; }
  standingIndex() { const d = this.done; let k = 0; STANDING.forEach((s, i) => { if (d >= s.at) k = i; }); return k; }

  // What happens when you greet person i: an exchange (pages of lines, the
  // last with a choice) or null for their usual line. `ctx`: { day, hour }.
  greet(i, ctx) {
    if (!this.on) return null;
    const p = this.progress, per = this.people.P.persons[i], { day, hour } = ctx;
    const first = !p.met[i];
    p.met[i] = [day, round2(hour)];
    this.touch(true);
    const pages = [];
    const who = { name: per.name, role: per.label };
    let completed = 0;
    // things for them: a thing you carry, or word you bring
    for (const f of this.fav.byDest.get(i) || []) {
      const st = this.stateOf(f);
      if (f.kind === 'carry' && st === F.TAKEN) { this.setState(f, F.DONE, day, hour); completed++; pages.push({ lines: [...f.got] }); }
      else if (f.kind === 'tell' && st === F.TAKEN) { this.setState(f, F.GOT, day, hour); pages.push({ lines: [`So ${f.slots.msg}. ${f.answer}`, `Take that back to ${f.slots.giver}.`] }); }
    }
    // things back to them: what they lost, or the answer they waited for
    for (const f of this.fav.byGiver.get(i) || []) {
      if (this.stateOf(f) !== F.GOT) continue;
      this.setState(f, F.DONE, day, hour); completed++;
      if (f.kind === 'find') pages.push({ lines: [...f.got] });
      else pages.push({ lines: BACK.tell.map((s) => cap(fill(s, { dest: f.slots.dest, answer: f.answer }))) });
    }
    // the first favour done: the lantern
    if (completed && !p.lantern) {
      p.lantern = true;
      pages.push({ lines: [...LANTERN_GIFT], gift: 'lantern' });
      this.touch(true);
    }
    // their own favour, if they have one to ask
    const own = (this.fav.byGiver.get(i) || []).find((f) => this.open(f));
    if (own) {
      const lines = pages.length ? [AND_ME[(i + day) % AND_ME.length], ...own.ask.slice(-2)] : own.ask.slice(0, 3);
      pages.push({ lines, choice: true, favour: own.id });
      if (this.stateOf(own) < F.ASKED) this.setState(own, F.ASKED, day, hour);
      if (own.first) { p.first = true; this.touch(true); }
    } else if (!pages.length) {
      // a favour of theirs taken and not yet done: a reminder
      const mine = (this.fav.byGiver.get(i) || []).find((f) => this.stateOf(f) === F.TAKEN);
      if (mine) {
        const s = { ...mine.slots, where: cap(mine.slots.where || ''), when: mine.slots.when };
        pages.push({ lines: [cap(fill(WAITING[mine.kind][(day + Math.floor(hour)) % 2], s))] });
      }
    }
    if (!pages.length) return null;
    return { who, pages, first };
  }

  // Your answer to an exchange's choice.
  answer(id, yes, ctx) {
    const f = this.fav.list.find((x) => x.id === id);
    if (!f) return null;
    if (yes) {
      this.setState(f, F.TAKEN, ctx.day, ctx.hour);
      return YES[(ctx.day + Math.floor(ctx.hour * 7)) % YES.length];
    }
    return LATER[(ctx.day + Math.floor(ctx.hour * 7)) % LATER.length];
  }

  // A hail for your standing, now and then, before someone's usual line.
  hail(i, count) {
    if (!this.on) return '';
    const k = this.standingIndex(), list = HAILS[k] || [];
    if (!list.length || count % 2) return '';
    return list[(i + count) % list.length];
  }

  // ---- the lantern ---------------------------------------------------------------------

  toggleLantern() {
    if (!this.on || !this.progress.lantern) return false;
    this.progress.lit = !this.progress.lit;
    this.touch(true);
    return true;
  }

  // ---- sketches -----------------------------------------------------------------------

  // Keep the current frame as a sketch: `cells` (the cell buffer), its
  // size, and where and when. Resolves with its record.
  async sketch(cells, cols, rows, at) {
    if (!this.on) return null;
    const p = this.progress;
    if (p.sketches.length >= MAX_SKETCHES) return { full: true };
    const notable = this.notableAt(at);
    const near = this.nearestFound(at.x, at.z);
    const id = p.nextSketch++;
    const rec = { id, day: at.day, hour: round2(at.hour), weather: at.weather, cols, rows, notable: notable ? notable.id : null,
      place: notable ? `the view ${notable.words}` : near ? `near ${near.title}` : 'in the open country' };
    const data = await packSketch(cells);
    this.sketchCache.set(id, cells);
    p.sketches.push(rec);
    this.store.set(`sketch.${id}`, data);
    this.touch(true);
    const words = notable ? fill(SKETCHED_NOTABLE, { notable: notable.words, time: clockOf(at.hour), weather: at.weather })
      : fill(SKETCHED, { at: near ? ` near ${near.title}` : '', time: clockOf(at.hour), weather: at.weather });
    this.note(words, 'say');
    return rec;
  }

  // The notable view you stand at, if any: a viewpoint, or the fort's wall walk.
  notableAt(at) {
    for (const pl of this.places.list) if (pl.kind === 'viewpoint' && Math.hypot(pl.x - at.x, pl.z - at.z) <= NOTABLE_AT.viewpoint) return { id: pl.id, words: fill(NOTABLE_HILL, { name: pl.title }) };
    const Fo = this.people.P.fort;
    if (Fo) for (const b of Fo.beats) {
      const ax = b.a[0], az = b.a[1], dx = b.b[0] - ax, dz = b.b[1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((at.x - ax) * dx + (at.z - az) * dz) / L2));
      if (Math.hypot(ax + dx * t - at.x, az + dz * t - at.z) <= NOTABLE_AT.wall && at.feet > b.y - 0.5) return { id: 'wall', words: NOTABLE_WALL };
    }
    return null;
  }
  notables() {
    const list = this.places.list.filter((x) => x.kind === 'viewpoint').map((pl) => ({ id: pl.id, title: `the view from ${pl.title}` }));
    if (this.people.P.fort) list.push({ id: 'wall', title: 'the view from the wall walk of the fort' });
    return list.map((n) => ({ ...n, sketch: this.progress.sketches.find((s) => s.notable === n.id) || null }));
  }
  nearestFound(x, z) {
    let best = null, bd = 300;
    for (const pl of this.places.list) {
      if (!this.progress.found[pl.id]) continue;
      const d = Math.min(...pl.at.map((a) => Math.hypot(a[0] - x, a[1] - z)));
      if (d < bd) { bd = d; best = pl; }
    }
    return best;
  }
  async sketchCells(id) {
    if (this.sketchCache.has(id)) return this.sketchCache.get(id);
    const s = this.store.get(`sketch.${id}`);
    if (!s) return null;
    try { const c = await unpackSketch(s); this.sketchCache.set(id, c); return c; } catch { return null; }
  }

  // ---- saving -------------------------------------------------------------------------

  touch(urgent = false) { this.dirty = true; if (urgent) this.urgent = true; this.changed(); }
  // A save in play is spread over four frames, so no frame pays for all of
  // it: the seen squares packed, the walked squares packed, the record made,
  // the record written. (What changes in between is in the next save.)
  maybeSave() {
    if (this.staged) {
      const g = this.staged, p = this.progress, t0 = performance.now();
      if (g.seen === undefined) g.seen = packBits(p.seen, p.sn * p.sn);
      else if (g.walked === undefined) g.walked = packBits(p.walked, p.wn * p.wn);
      else if (g.text === undefined) g.text = toJSON(p, g);
      else { this.staged = null; this.write(g.text); }
      this.saveMs = Math.max(this.saveStep || 0, performance.now() - t0);
      this.saveStep = this.saveMs;
      return;
    }
    if (!this.dirty) return;
    const now = performance.now();
    if (this.urgent || now - this.lastSave > SAVE_EVERY) {
      this.lastSave = now;
      this.dirty = false; this.urgent = false;
      this.staged = {}; this.saveStep = 0;
    }
  }
  // Everything at once (leaving the page, a tool, a restore).
  save(force = false) {
    if (!this.on || (!this.dirty && !force && !this.staged)) return;
    const t0 = performance.now();
    this.lastSave = t0;
    this.dirty = false; this.urgent = false; this.staged = null;
    this.write(toJSON(this.progress));
    this.saveMs = performance.now() - t0;
  }
  write(text) { this.store.set('progress', text); this.saves = (this.saves || 0) + 1; }
  changed() { for (const f of this.listeners) f(); }
  onChange(f) { this.listeners.push(f); }
  note(text, kind) { this.notes.push({ text, kind }); }
  takeNotes() { const n = this.notes; this.notes = []; return n; }

  // What is saved for this world, in a line (the menu's World section).
  saveLine() {
    if (!this.on) return 'Progress is not kept here.';
    const p = this.progress, found = Object.keys(p.found).length, met = Object.keys(p.met).length;
    const parts = [`${found} of ${this.places.list.length} places found`, `${met} ${met === 1 ? 'person' : 'people'} met`,
      `${p.sketches.length} ${p.sketches.length === 1 ? 'sketch' : 'sketches'}`, `${this.done} ${this.done === 1 ? 'favour' : 'favours'} done`, this.standing.title];
    if (p.lantern) parts.push('the lantern');
    return `${cap(parts.join(', '))}.`;
  }
  async backup() {
    const sk = {};
    for (const s of this.progress.sketches) { const d = this.store.get(`sketch.${s.id}`); if (d) sk[s.id] = d; }
    return backupText(this.progress, sk);
  }
  // Restore from pasted text: { ok, seed, error }.
  async restore(text) {
    const r = await readBackup(text, this.world.N);
    if (r.error) return { ok: false, error: r.error };
    if (r.progress.seed !== this.seed) {
      // (another world's: kept for that world, to open)
      const st = new Store(r.progress.seed);
      st.set('progress', toJSON(r.progress));
      for (const [id, d] of Object.entries(r.sketches)) st.set(`sketch.${id}`, d);
      return { ok: true, seed: r.progress.seed, other: true };
    }
    this.store.clear(this.progress.sketches.map((s) => s.id));
    this.progress = r.progress;
    this.sketchCache.clear();
    for (const [id, d] of Object.entries(r.sketches)) this.store.set(`sketch.${id}`, d);
    this.store.set('progress', toJSON(this.progress));
    this.afterReset();
    return { ok: true, seed: this.seed };
  }
  clear() {
    this.store.clear(this.progress.sketches.map((s) => s.id));
    this.progress = freshProgress(this.seed, this.world.N);
    this.sketchCache.clear();
    this.afterReset();
  }
  afterReset() {
    this.revealed = new Set();
    this.dirty = false; this.urgent = false; this.staged = null; this.youWas = null;
    this.store.set('progress', toJSON(this.progress));
    this.changed();
  }

  // ---- the first meeting ------------------------------------------------------------------

  // The override of the first giver's state (applied in People.update after
  // their day's state, before the meetings): out along the road, waiting at
  // its edge, back. A pure function of the day and hour.
  meetState() {
    const m = this.fav.meet, P = this.people.P, per = P.persons[m.person];
    const spot = { kind: 'stay', at: m.spot.place, pose: POSE.STAND, act: FIRST.waiting };
    const walkIn = { kind: 'walk', from: m.from, to: m.spot.place, route: m.rin, t0: m.dep, t1: m.arrive, act: 'walking to the road' };
    const walkOut = { kind: 'walk', from: m.spot.place, to: m.to, route: m.rout, t0: m.leave, t1: m.back, act: 'walking home' };
    return {
      person: m.person,
      apply(day, hour, st, segs, along) {
        if (day !== m.day || hour < m.dep || hour >= m.back) return;
        const o = m.person * FS;
        if (hour < m.arrive || hour >= m.leave) {
          const seg = hour < m.arrive ? walkIn : walkOut, R = seg.route;
          const s = Math.min(R.len, Math.max(0, (hour - seg.t0) * 3600 * per.speed));
          placeOn(st, o, R, s);
          st[o + S.POSE] = (seg === walkIn && P.places[m.from].kind === 'closed' && s < R.hideA) || (seg === walkOut && P.places[m.to].kind === 'closed' && R.len - s < R.hideB) ? POSE.HIDDEN : POSE.WALK;
          st[o + S.PHASE] = (s / STRIDE) % 1;
          st[o + S.ROOM] = -1; st[o + S.LIGHT] = 0; st[o + S.TOOL] = per.tool; st[o + S.AUX] = 0;
          segs[m.person] = seg; along[m.person] = s;
        } else {
          st[o + S.X] = m.spot.x; st[o + S.Z] = m.spot.z; st[o + S.FEET] = m.spot.ft; st[o + S.YAW] = m.spot.yaw;
          st[o + S.POSE] = POSE.STAND; st[o + S.PHASE] = 0; st[o + S.ROOM] = -1; st[o + S.LIGHT] = 0; st[o + S.TOOL] = per.tool; st[o + S.AUX] = 0;
          segs[m.person] = spot; along[m.person] = 0;
        }
      },
    };
  }

  // What the overhead map draws: only what you have seen, the roads you
  // have walked, the sites you have found.
  fog() { const p = this.progress; return { seen: p.seen, sn: p.sn, walked: p.walked, wn: p.wn, found: p.found }; }

  // ---- for the journal and the tools ----------------------------------------------------

  journal() {
    const p = this.progress, P = this.people.P, list = this.places.list;
    const places = list.map((pl) => ({ id: pl.id, kind: pl.kind, title: pl.title, where: pl.where, hint: pl.hint, found: p.found[pl.id] || null }));
    const people = Object.entries(p.met).map(([id, t]) => {
      const per = P.persons[Number(id)];
      // (a guard's role says the fort already; a traveller is on the road)
      const town = per.village !== undefined ? this.places.names.villages[per.village] : per.role === 'guard' ? '' : 'on the road';
      return { id: Number(id), name: per.name, role: per.label, town, seen: t };
    }).sort((a, b) => (b.seen[0] - a.seen[0]) || (b.seen[1] - a.seen[1]));
    const favours = this.fav.list.filter((f) => this.stateOf(f) >= F.ASKED).map((f) => {
      const st = this.stateOf(f);
      return { id: f.id, kind: f.kind, state: st, giver: P.persons[f.giver].name, words: st === F.ASKED ? [this.askedWords(f)] : st === F.DONE ? [this.doneWords(f)] : favourWords(f, P, this.fav.usual, st), t: p.favours[f.id].t };
    });
    const carried = [];
    for (const f of this.fav.list) {
      const st = this.stateOf(f);
      if (f.kind === 'carry' && st === F.TAKEN) carried.push(`${f.slots.short}, for ${f.slots.dest}`);
      if (f.kind === 'find' && st === F.GOT) carried.push(`${f.slots.short}, for ${f.slots.giver}`);
      if (f.kind === 'tell' && st === F.TAKEN) carried.push(`word for ${f.slots.dest}`);
      if (f.kind === 'tell' && st === F.GOT) carried.push(`${f.slots.dest}'s answer, for ${f.slots.giver}`);
    }
    if (p.lantern) carried.push(p.lit ? 'your lantern, lit' : 'your lantern');
    return {
      places, people, favours, carried, standing: this.standing.title, done: this.done,
      sketches: p.sketches.slice().reverse(), notables: this.notables(),
      seen: countBits(p.seen) / (p.sn * p.sn), note: this.store.note,
    };
  }
  askedWords(f) {
    const s = f.slots, P = this.people.P, u = this.fav.usual.get(f.giver);
    const where = u ? `, ${u.where}` : f.first ? ' on the road where you first met' : '';
    return `${s.giver}${where} asked a favour of you. You said another time.`;
  }
  doneWords(f) {
    const s = f.slots;
    if (f.kind === 'carry') return `You took ${s.short} to ${s.dest} for ${s.giver}.`;
    if (f.kind === 'find') return `You found ${s.short} for ${s.giver}, ${s.lost}.`;
    return `You took word to ${s.dest} for ${s.giver}, and brought back the answer.`;
  }
}

function placeOn(st, o, R, s) {
  let lo = 0, hi = R.n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.cum[m] <= s) lo = m; else hi = m - 1; }
  const j = Math.min(lo, R.n - 2), seg0 = R.cum[j + 1] - R.cum[j], f = seg0 > 1e-9 ? (s - R.cum[j]) / seg0 : 0;
  st[o + S.X] = R.x[j] + (R.x[j + 1] - R.x[j]) * f; st[o + S.Z] = R.z[j] + (R.z[j + 1] - R.z[j]) * f; st[o + S.FEET] = R.y[j] + (R.y[j + 1] - R.y[j]) * f;
  const k2 = Math.min(R.n - 1, j + 3), k1 = Math.max(0, j - 2);
  st[o + S.YAW] = Math.atan2(R.x[k2] - R.x[k1], R.z[k2] - R.z[k1]);
}
const round2 = (h) => Math.round(h * 100) / 100;

export { START_DAY, START_HOUR, CHOICE, mainKind, compass, bit };
