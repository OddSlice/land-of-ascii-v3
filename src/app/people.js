// People on the main thread (phase 4a): each frame, everyone's state at the
// frame's day and hour (src/world/people/people.js), the meetings with you
// and with each other (meet.js), the people near you as bodies you cannot
// walk through, which houses have someone awake inside (their windows), and
// what someone says when you greet them. The frame carries the states to
// the render workers, so every worker draws the same people.
import { buildPeople, planOf, stateAt, segmentAt, alongOf, litGroups, DUSK, DAWN } from '../world/people/people.js';
import { adjust } from '../world/people/meet.js';
import { FS, S, POSE, FIG } from '../world/people/figure.js';
import { LINES } from '../world/people/lines.js';
import { mainKind } from '../weather.js';

export class People {
  constructor(world) {
    const t0 = performance.now();
    this.world = world;
    this.P = buildPeople(world);
    this.n = this.P.persons.length;
    this.st = new Float32Array(this.n * FS);
    this.segs = new Array(this.n);
    this.along = new Float64Array(this.n);
    this.lit = new Uint8Array(1 + 3 * 32 + 32);
    this.others = new Float64Array(this.n * 5);
    this.on = true;
    this.updateMs = 0;
    this.last = new Map();             // the line each person said last
    this.planned = -1;
    // (phase 5a) the first meeting, in a first session: one person's state
    // replaced, for a while, by their walk out to the road and back (a pure
    // function of the day and hour; see src/app/wayfaring.js)
    this.meet = null;
    this.buildMs = performance.now() - t0;
  }

  // Plans for a whole day, at once (at start), or a person at a time (in the
  // evening, ahead of midnight, so the new day starts without a stall).
  planDay(day) { for (let i = 0; i < this.n; i++) planOf(this.P, i, day); this.planned = day; }
  planAhead(day, budget = 2) {
    for (let i = 0, k = 0; i < this.n && k < budget; i++) {
      if (!this.P.plans.has(i * 100000 + day)) { planOf(this.P, i, day); k++; }
    }
  }

  // Everyone's state for (day, hour), with you at `you` ({ x, z, feet } or
  // null); returns the states (a copy for the frame) and fills the lit houses.
  update(day, hour, you, player) {
    const t0 = performance.now();
    const P = this.P, st = this.st;
    if (hour > 20) this.planAhead(day + 1);
    for (let i = 0; i < this.n; i++) {
      const seg = stateAt(P, i, day, hour, st, i * FS);
      this.segs[i] = seg; this.along[i] = alongOf(P, i, seg, hour);
    }
    if (this.meet) this.meet.apply(day, hour, st, this.segs, this.along);
    adjust(st, this.n, this.segs, this.along, you, P.p);
    litGroups(P, day, hour, this.lit);
    // the people near you, as bodies
    if (player) {
      let k = 0;
      for (let i = 0; i < this.n; i++) {
        const o = i * FS, pose = st[o + S.POSE];
        if (pose === POSE.HIDDEN) continue;
        const x = st[o + S.X], z = st[o + S.Z];
        if (Math.abs(x - player.x) > 4 || Math.abs(z - player.z) > 4) continue;
        const lying = pose === POSE.SLEEP;
        this.others[k++] = x; this.others[k++] = z; this.others[k++] = FIG.radius * (st[o + S.SCALE] || 1);
        this.others[k++] = st[o + S.FEET] + (lying ? st[o + S.AUX] : 0); this.others[k++] = st[o + S.FEET] + (lying ? st[o + S.AUX] + 0.3 : FIG.height);
      }
      player.others = k ? this.others.subarray(0, k) : null;
    }
    this.updateMs = performance.now() - t0;
    return st.slice();
  }

  // Off: nobody drawn, nobody in the way, the windows as before.
  setOn(on, player) { this.on = !!on; if (!on && player) player.others = null; }

  // The person you would greet: within two and a bit metres, in front of
  // you, awake, and facing you (their head turned to you counts).
  greetable(you) {
    const st = this.st;
    let best = -1, bd = 2.3;
    for (let i = 0; i < this.n; i++) {
      const o = i * FS, pose = st[o + S.POSE];
      if (pose === POSE.HIDDEN || pose === POSE.SLEEP) continue;
      const dx = st[o + S.X] - you.x, dz = st[o + S.Z] - you.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs(st[o + S.FEET] - you.feet) > 1.2) continue;
      // in front of you
      if (dx * Math.sin(you.yaw) + dz * Math.cos(you.yaw) < 0.3 * d) continue;
      // and they face you: their looking direction toward you
      const look = st[o + S.YAW] + st[o + S.HEAD];
      if (-(dx * Math.sin(look) + dz * Math.cos(look)) < 0.2 * d) continue;
      best = i; bd = d;
    }
    return best;
  }

  // What person i says now: one line that fits who they are, what they are
  // doing, the hour and the weather, never the same as their last.
  say(i, day, hour, weather) {
    const per = this.P.persons[i], seg = this.segs[i] || segmentAt(planOf(this.P, i, day), hour);
    const lines = LINES[per.role] || LINES.householder;
    const tags = new Set();
    tags.add(hour < 5 || hour >= 21 ? 'night' : hour < 8 ? 'dawn' : hour < 11.5 ? 'morning' : hour < 13.5 ? 'noon' : hour < 18 ? 'afternoon' : 'dusk');
    const wk = mainKind(weather);
    tags.add(wk);
    if (wk === 'clear') tags.add('fair');
    const pl = seg.kind === 'stay' ? this.P.places[seg.at] : null;
    const placeTag = { pasture: 'field', pastgate: 'field', foldgate: 'field', foldin: 'field', field: 'field', fieldgate: 'field', jetty: 'jetty', jettyfoot: 'jetty', green: 'green', bench: 'green', shelter: 'green', well: 'well', chapel: 'chapel',
      door: 'home', in: 'inside', sit: 'inside', hearth: 'inside', bed: 'inside', closed: 'home', post: 'gate', gate: 'gate', walk: 'wall', yard: 'fort', inner: 'fort', hall: 'inside', keepdoor: 'fort', barn: 'field' };
    if (pl && placeTag[pl.kind]) tags.add(placeTag[pl.kind]);
    if (seg.kind === 'walk') { tags.add('walk'); if (this.onRoad(i)) tags.add('road'); }
    const poseTag = { [POSE.WORK]: 'work', [POSE.FISH]: 'fish', [POSE.SIT]: 'sit', [POSE.SWEEP]: 'sweep' };
    if (seg.kind === 'stay' && poseTag[seg.pose]) tags.add(poseTag[seg.pose]);
    if (per.role === 'guard' && pl && pl.kind === 'walk') tags.add('patrol');
    if (per.role === 'guard' && pl && pl.kind === 'post') tags.add('watch');
    if (seg.act === 'resting' || seg.act === 'off watch') tags.add('rest');
    if (seg.act === 'at the fort' || (pl && (pl.kind === 'yard' || pl.kind === 'gate'))) tags.add('fort');
    // the lines that fit, the best fitting first
    const fit = [];
    lines.forEach(([text, t], k) => {
      const need = t ? t.split(' ') : [];
      if (need.every((x) => tags.has(x))) fit.push([need.length, k, text]);
    });
    if (!fit.length) lines.forEach(([text, t], k) => { if (!t) fit.push([0, k, text]); });
    fit.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    // among the best two levels of fit, a different line from last time
    const top = fit.filter((f) => f[0] >= Math.max(0, fit[0][0] - 1));
    const last = this.last.get(i);
    let pick = top.filter((f) => f[1] !== last);
    if (!pick.length) pick = top;
    const k = Math.floor(((Math.imul(i * 2654435761, day + 7) >>> 0) / 4294967296 + (this.count(i) * 0.618)) * pick.length) % pick.length;
    const chosen = pick[k];
    this.last.set(i, chosen[1]);
    const text = chosen[2].replace('{village}', 'this village').replace('{fort}', 'the fort');
    return { name: per.name, role: per.label, text: text.charAt(0).toUpperCase() + text.slice(1) };
  }

  count(i) { this.counts = this.counts || new Map(); const c = (this.counts.get(i) || 0) + 1; this.counts.set(i, c); return c; }

  // Is person i walking on a road (not a lane or a path)?
  onRoad(i) {
    const st = this.st, o = i * FS, x = st[o + S.X], z = st[o + S.Z];
    const T = this.world.terrain, j = Math.round(z) * T.NN + Math.round(x);
    return T.wRoad && T.wRoad[j] > 127;
  }

  // Everyone, for the menu and the tools: name, role, what they are doing, where.
  list() {
    return this.P.persons.map((per, i) => {
      const o = i * FS, seg = this.segs[i];
      return { i, name: per.name, role: per.label, act: seg ? (seg.kind === 'walk' ? walkName(this.P, seg) : seg.act) : '', x: this.st[o + S.X], z: this.st[o + S.Z], feet: this.st[o + S.FEET], yaw: this.st[o + S.YAW], hidden: this.st[o + S.POSE] === POSE.HIDDEN };
    });
  }
}

function walkName(P, seg) {
  const to = P.places[seg.to].kind;
  const where = { pasture: 'to the pasture', pastgate: 'to the pasture', foldgate: 'to the fold', door: 'home', in: 'home', sit: 'home', bed: 'home to bed', closed: 'home', hearth: 'home', field: 'to the fields', jetty: 'to the jetty', well: 'to the well', green: 'to the green',
    bench: 'to a bench', chapel: 'to the chapel', post: 'to the gate', walk: 'up to the wall', yard: 'across the yard', gate: 'to the fort', barn: 'to the barn', shelter: 'to the shelter', hall: 'to the hall' }[to] || 'along the road';
  return `walking ${where}`;
}

export { DUSK, DAWN };
