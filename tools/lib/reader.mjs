// (phase 5a) A scripted player who knows only what a favour's words say.
// Given the journal's words for a favour (src/game/favours.js
// favourWords), it reads out the town, the way from home, the landmark, the
// person and the hours, then walks it under the player's own rules (the
// people's routes, src/world/people/people.js routeOf, which sample every
// half metre with the player's move rule):
// - to a town: it looks at the towns it can see in the stated direction
//   (within 45 degrees of it, then 90), walks to the nearest, and learns its
//   name on arriving (as the journal notes a village); a wrong one costs the
//   walk there;
// - in the town, to the landmark of the stated kind (the well, the green,
//   the chapel door, the jetty, the fields or pasture or fold on the stated
//   side, the fort's gate);
// - for a person: waits for the stated hours if need be (not counted as
//   walking) and greets the one of that name there;
// - for a lost thing: walks to the described place and looks within 25 m
//   for it.
// It reports every metre walked: the walking time is that over 4.5 m/s.
// If it cannot find what the words describe, the words are wrong.
import { routeOf, planOf, segmentAt } from '../../src/world/people/people.js';
import { clearLine, latticeWay } from '../../src/world/people/walk.js';
import { groundAt } from '../../src/world/objects.js';
import { VILLAGE_NAMES, COMPASS } from '../../src/game/words.js';

const WALK = 4.5, TAU = Math.PI * 2;
const DIRS = Object.fromEntries(COMPASS.map((d, i) => [d, i * TAU / 8]));
// the reader's idea of the stated hours
const HOURS = [
  [/from early morning until evening, but for the midday meal/, [[7.5, 11], [14, 17]]],
  [/in the morning, and again through the afternoon/, [[7.5, 9.3], [14, 16.5]]],
  [/from early morning until evening, unless there is mist/, [[7.5, 10.5], [14, 17]]],
  [/from soon after dawn until dusk/, [[8, 17.5]]],
  [/from six in the morning until two in the afternoon/, [[6.3, 13.7]]],
  [/from two in the afternoon until ten at night/, [[14.3, 21.7]]],
  [/through the night, from ten until six/, [[22.3, 23.9], [0.1, 5.7]]],
];

// What the words say: { town, dir, from, landmark, side, person, hours, lost }.
export function readWords(lines) {
  const t = lines.join(' ');
  const names = [...VILLAGE_NAMES, 'the fort'];
  const r = { text: t };
  // the person to find, where and when (the first "is usually" is theirs)
  const m = t.match(/([A-Z][a-z]+ [A-Z][a-z]+) is usually (.+?), ((?:from|in|through|until)[^.]+)\./);
  if (m) { r.person = m[1]; r.where = m[2]; r.hours = (HOURS.find(([re]) => re.test(m[3])) || [null, [[8, 17]]])[1]; }
  // the town and the way to it
  const lies = t.match(/([A-Z][a-z]+|The fort) lies ([a-z-]+) of (.+?)(?:, the (nearer|farther|nearest|farthest|middle one) of the (two|three) villages that way)?, by the road/);
  if (lies) { r.town = lies[1] === 'The fort' ? 'the fort' : lies[1]; r.dir = lies[2]; r.from = lies[3]; r.which = lies[4] || null; }
  const that = t.match(/That is ([a-z-]+) of ([A-Za-z ]+?)\./);
  if (that) { r.dir = that[1]; r.from = that[2]; }
  // the landmark where the person is
  const w = r.where || '';
  const side = (s) => { const q = s.match(/on the ([a-z-]+) side of|pasture ([a-z-]+) of/); return q ? (q[1] || q[2]) : null; };
  const inTown = (s) => names.find((n) => s.includes(n)) || null;
  if (/gate of the fort/.test(w)) r.landmark = 'gate';
  else if (/on the green/.test(w)) r.landmark = 'green';
  else if (/by the well/.test(w)) r.landmark = 'well';
  else if (/chapel door/.test(w)) r.landmark = 'chapel';
  else if (/jetty/.test(w)) r.landmark = 'jetty';
  else if (/in the fields/.test(w)) { r.landmark = 'fields'; r.side = side(w); }
  else if (/pasture/.test(w)) { r.landmark = 'pasture'; r.side = side(w); }
  if (r.landmark && !r.town) r.town = /fort/.test(w) ? 'the fort' : inTown(w);
  // a lost thing's place
  const lost = t.match(/lost (by the .+?|at the .+?|up on .+?|on the shore of .+?), and bring it back/);
  if (lost) {
    const L = lost[1];
    r.lost = { words: L, town: inTown(L) };
    if (/by the (wall|fence) of the (field|pasture)/.test(L)) Object.assign(r.lost, { kind: 'fieldwall', side: side(L) });
    else if (/sheepfold/.test(L)) Object.assign(r.lost, { kind: 'fold', side: side(L) });
    else if (/signpost/.test(L)) r.lost.kind = 'signpost';
    else if (/foot of the jetty/.test(L)) r.lost.kind = 'jetty';
    else if (/chapel door/.test(L)) r.lost.kind = 'chapel';
    else if (/by the bench/.test(L)) r.lost.kind = 'bench';
    else if (/by the bridge/.test(L)) r.lost.kind = 'bridge';
    else if (/edge of the copse/.test(L)) Object.assign(r.lost, { kind: 'copse', dir: (L.match(/copse ([a-z-]+) of/) || [])[1] });
    else if (/^up on/.test(L)) Object.assign(r.lost, { kind: 'viewpoint', dir: (L.match(/, ([a-z-]+) of/) || [])[1] });
    else if (/shore of/.test(L)) r.lost.kind = 'shore';
  }
  return r;
}

// The reader in a world: `ctx` = { world, P, names (the villages'), }.
export class Reader {
  constructor(world, P, names, lake = []) {
    this.world = world; this.P = P; this.names = names; this.lake = lake;
    this.towns = [...P.villages.map((V) => ({ name: names.villages[V.q], q: V.q, x: V.centre.x, z: V.centre.z, at: V.wells[0] ?? V.houses[0].step })),
      ...(P.fort ? [{ name: 'the fort', q: 'fort', x: world.sites.fort.x, z: world.sites.fort.z, at: P.fort.front }] : [])];
    this.walked = 0; this.legs = [];
    this.temp = new Map();
  }
  // a place to walk to at a point (made once)
  spot(x, z) {
    const k = `${Math.round(x * 2)},${Math.round(z * 2)}`;
    if (!this.temp.has(k)) this.temp.set(k, this.P.place('reader', x, z, groundAt(this.world.terrain, x, z), 0));
    return this.temp.get(k);
  }
  // walk from place a to place b; false if it cannot be walked. Near, a
  // straight line where it can be walked, else a way found on the half-metre
  // lattice (as a player cuts across); further, by the roads (routeOf)
  walk(a, b, why) {
    if (a === b) return true;
    const P = this.P, A = P.places[a], B = P.places[b], d = Math.hypot(B.ax - A.ax, B.az - A.az);
    let len = null;
    if (d < 150 && clearLine(P.move, [A.ax, A.az], [B.ax, B.az], A.ft)) len = d;
    else if (d < 90) {
      const way = latticeWay(P.move, [A.ax, A.az], [B.ax, B.az], A.ft, 20, 30000);
      if (way) { len = 0; for (let i = 1; i < way.length; i++) len += Math.hypot(way[i][0] - way[i - 1][0], way[i][1] - way[i - 1][1]); }
    }
    if (len === null) { const r = routeOf(P, a, b); if (r) len = r.len; }
    if (len === null) { this.legs.push({ why, len: null }); return false; }
    this.walked += len; this.legs.push({ why, len: Math.round(len) });
    this.at = b;
    return true;
  }
  // from here to the town named in the words, by the way they say
  toTown(name, dir, fromXZ, which = null) {
    const want = DIRS[dir];
    const bearing = (t) => Math.atan2(t.x - fromXZ.x, t.z - fromXZ.z);
    const off = (t) => { let d = bearing(t) - want; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d); };
    const here = this.home || this.towns.find((t) => Math.hypot(t.x - fromXZ.x, t.z - fromXZ.z) < 60);
    // (the fort is plainly a fort: it is gone to only when the words name it,
    // and then straight away)
    const fort = this.towns.find((t) => t.q === 'fort');
    if (name === 'the fort' && fort) return this.walk(this.at, fort.at, 'to the fort') ? fort : null;
    for (const width of [Math.PI / 4 + 0.05, Math.PI / 2 + 0.05, Math.PI]) {
      let cands = this.towns.filter((t) => t !== here && t.q !== 'fort' && !this.tried.has(t.name) && off(t) <= width).sort((a, b) => Math.hypot(a.x - fromXZ.x, a.z - fromXZ.z) - Math.hypot(b.x - fromXZ.x, b.z - fromXZ.z));
      // ("the farther of the two villages that way": that one first)
      if (which && width < 1) { const k = which === 'nearer' || which === 'nearest' ? 0 : which === 'middle one' ? 1 : cands.length - 1; if (cands[k]) cands = [cands[k], ...cands.filter((_, j) => j !== k)]; }
      for (const t of cands) {
        this.tried.add(t.name);
        if (!this.walk(this.at, t.at, `to ${t.name}`)) continue;
        if (t.name === name) return t;
      }
    }
    return null;
  }
  // the landmark of a kind in a town: the places to look
  landmark(town, kind, side) {
    const P = this.P, out = [];
    if (town.q === 'fort') { if (kind === 'gate') out.push(P.fort.front); return out; }
    const V = P.villages[town.q], c = V.centre;
    const sideOf = (id) => compassOf(c.x, c.z, P.places[id].x, P.places[id].z);
    if (kind === 'green') out.push(...V.greens.slice(0, 1));
    else if (kind === 'well') out.push(...V.wells.slice(0, 1));
    else if (kind === 'chapel' && V.chapel >= 0) out.push(V.chapel);
    else if (kind === 'jetty') out.push(...V.jetty);
    else if (kind === 'fields') { const gates = [...new Set(V.fields.map((id) => P.places[id].via))]; out.push(...gates.filter((g) => sideOf(g) === side)); }
    else if (kind === 'pasture') out.push(...V.pastures.map((pa) => pa.gate).filter((g) => sideOf(g) === side));
    return out;
  }
  // wait for and greet person `name` at the landmark places (the strips
  // round a field gate, the spots of a green); hours: the stated windows
  meet(places, name, hours, day0) {
    const P = this.P, who = P.persons.filter((p) => p.name === name).map((p) => p.id);
    if (!who.length) return { ok: false, why: 'no one of that name' };
    for (let day = day0; day < day0 + 3; day++) {
      for (const [h0, h1] of hours) {
        for (let h = h0; h <= h1; h += 0.25) for (const i of who) {
          const seg = segmentAt(planOf(P, i, day), h);
          if (seg.kind !== 'stay') continue;
          const pl = P.places[seg.at];
          // there, at one of the landmark's places or a place hung from it
          const near = places.find((id) => id === seg.at || id === pl.via || Math.hypot(P.places[id].x - pl.x, P.places[id].z - pl.z) < 30);
          if (near === undefined) continue;
          // (walk over to them, from the landmark)
          if (!this.walk(this.at, near, 'to the landmark')) return { ok: false, why: 'cannot reach the landmark' };
          if (seg.at !== near && !this.walk(near, seg.at, `to ${name}`)) return { ok: false, why: `cannot reach ${name}` };
          return { ok: true, day, hour: h };
        }
      }
    }
    return { ok: false, why: `${name} is not at the landmark in the stated hours` };
  }
  // look for a lost thing from the described place
  find(r, spot, fromXZ) {
    const P = this.P, L = r.lost, W = this.world;
    // (a place named by a village: to that village first; a bridge is found by
    // the way from home alone)
    let town = L.town && L.kind !== 'bridge' ? this.towns.find((t) => t.name === L.town) : null;
    if (town && town !== this.home) { this.tried = new Set(); town = this.toTown(town.name, r.dir, fromXZ, r.which) || town; }
    let looks = [];
    const V = town && town.q !== 'fort' ? P.villages[town.q] : null, c = V ? V.centre : null;
    if (L.kind === 'fieldwall' && V) {
      const pl = W.sites.villages[town.q].plan;
      for (const f of pl.fields || []) if (compassOf(c.x, c.z, f.x, f.z) === L.side) looks.push([f.x, f.z, Math.hypot(f.L, f.W) + 4]);
    } else if (L.kind === 'fold' && V) for (const fd of W.sites.villages[town.q].plan.folds || []) { if (compassOf(c.x, c.z, fd.x, fd.z) === L.side) looks.push([fd.gate[0], fd.gate[1], 8]); }
    else if (L.kind === 'signpost' && V) { const sp = W.sites.villages[town.q].plan.signpost; if (sp) looks.push([sp.x, sp.z, 8]); }
    else if (L.kind === 'jetty' && V) { const j = W.sites.villages[town.q].plan.jetty; if (j) looks.push([j.a[0], j.a[1], 8]); }
    else if (L.kind === 'chapel' && V) { const ch = P.places[V.chapel]; looks.push([ch.x, ch.z, 8]); }
    else if (L.kind === 'bench' && V) for (const b of W.sites.villages[town.q].plan.benches || []) looks.push([b.x, b.z, 6]);
    else if (L.kind === 'bridge') {
      // the bridges in the stated direction from home, nearest first
      const want = DIRS[r.dir];
      looks = wedge(W.sites.bridges.map((b) => [b.x, b.z, b.len / 2 + 12]), fromXZ, want);
    } else if (L.kind === 'copse' && c) {
      const want = DIRS[L.dir];
      looks = wedge((W.sites.copses || []).map(([x, z]) => [x, z, 34]), c, want);
    } else if (L.kind === 'viewpoint' && c) {
      const want = DIRS[L.dir];
      looks = wedge(W.sites.viewpoints.map((v) => [v.x, v.z, 10]), c, want);
    } else if (L.kind === 'shore' && c) {
      // the lake's edge nearest the village: its water seen from there, and
      // the dry ground before it
      looks.push(shoreNear(W, this.lake, c));
    }
    for (const [x, z, R] of looks) {
      if (x === undefined) continue;
      // walk to the place; the thing is seen if it lies within R + 25 m of it
      if (Math.hypot(spot.x - x, spot.z - z) <= R + 25) {
        if (!this.walk(this.at, this.spot(x, z), 'to the described place') && !this.walk(this.at, spot.place, 'to the thing')) return { ok: false, why: 'cannot reach the described place' };
        if (!this.walk(this.at, spot.place, 'to the thing')) return { ok: false, why: 'cannot reach the thing' };
        return { ok: true };
      }
      this.walk(this.at, this.spot(x, z), 'to a wrong place');
    }
    return { ok: false, why: `no ${L.kind} matching the words` };
  }
}

// (the lake's edge nearest a village: its water nearest the village, then
// back toward the village to dry ground)
function shoreNear(W, lake, c) {
  const T = W.terrain, NN = W.NN;
  const w = lake.reduce((b, pt) => (!b || Math.hypot(pt[0] - c.x, pt[1] - c.z) < Math.hypot(b[0] - c.x, b[1] - c.z) ? pt : b), null);
  const d = Math.hypot(c.x - w[0], c.z - w[1]) || 1, ux = (c.x - w[0]) / d, uz = (c.z - w[1]) / d;
  for (let r = 0; r < d; r += 1) {
    const x = w[0] + ux * r, z = w[1] + uz * r;
    if (T.wWater[Math.round(z) * NN + Math.round(x)] <= 20) return [x + ux * 3, z + uz * 3, 20];
  }
  return [w[0], w[1], 30];
}

// Things that way from (x, z): first those in the compass point's own wedge
// (22.5 degrees either side), nearest first, then the rest within 45.
function wedge(list, o, want) {
  const off = ([x, z]) => { let d = Math.atan2(x - o.x, z - o.z) - want; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return Math.abs(d); };
  const near = (a, b) => Math.hypot(a[0] - o.x, a[1] - o.z) - Math.hypot(b[0] - o.x, b[1] - o.z);
  return [...list.filter((q) => off(q) <= Math.PI / 8 + 0.02).sort(near), ...list.filter((q) => off(q) > Math.PI / 8 + 0.02 && off(q) <= Math.PI / 4 + 0.05).sort(near)];
}

export function compassOf(ax, az, bx, bz) {
  const a = Math.atan2(bx - ax, bz - az);
  return COMPASS[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
}

// Play one favour from its words: returns { ok, metres, minutes, legs, why }.
export function playFavour(world, P, names, fav, words, startPlace, startXZ, day0 = 0, lake = []) {
  const rd = new Reader(world, P, names, lake);
  rd.at = startPlace; rd.start = startPlace; rd.tried = new Set();
  const r = readWords(words);
  // (the words give the way from a village, "north of Ashby": from its
  // middle, and never to it; or from the rise where you met)
  rd.home = rd.towns.find((t) => t.name === r.from) || null;
  if (rd.home) startXZ = { x: rd.home.x, z: rd.home.z };
  const done = (ok, why) => ({ ok, why, metres: Math.round(rd.walked), minutes: rd.walked / WALK / 60, legs: rd.legs, read: { town: r.town, dir: r.dir, landmark: r.landmark, side: r.side, person: r.person, lost: r.lost && r.lost.kind } });
  if (fav.kind === 'find') {
    if (!r.lost) return done(false, 'the words name no place');
    const f = rd.find(r, fav.spot, startXZ);
    if (!f.ok) return done(false, f.why);
    // back to the giver: their landmark, from their words
    const back = readWords(words.slice(-1));
    const g = backTo(rd, back, day0);
    return g.ok ? done(true) : done(false, g.why);
  }
  // to the town, the landmark, the person
  if (!r.town || !r.dir) return done(false, 'the words name no town or way');
  const town = rd.toTown(r.town, r.dir, startXZ, r.which);
  if (!town) return done(false, `could not find ${r.town} ${r.dir} of ${r.from}`);
  const lm = rd.landmark(town, r.landmark, r.side);
  if (!lm.length) return done(false, `no ${r.landmark}${r.side ? ` on the ${r.side} side` : ''} in ${town.name}`);
  const m = rd.meet(lm, r.person, r.hours, day0);
  if (!m.ok) return done(false, m.why);
  if (fav.kind === 'tell') {
    const back = readWords(words.slice(-1));
    const g = backTo(rd, back, m.day);
    if (!g.ok) return done(false, g.why);
  }
  return done(true);
}

// Back to the giver, from their "is usually" line (the town by name: one
// found already on the way out).
function backTo(rd, r, day0) {
  // (the first one to ask, waiting on the road where you met)
  if (/the road where you met/.test(r.where || '')) return rd.walk(rd.at, rd.start, 'back to the road') ? { ok: true } : { ok: false, why: 'cannot walk back to the road' };
  const town = rd.towns.find((t) => t.name === r.town);
  if (!town) return { ok: false, why: 'the giver\'s town is not named' };
  if (!rd.walk(rd.at, town.at, `back to ${town.name}`)) return { ok: false, why: `cannot walk back to ${town.name}` };
  const lm = rd.landmark(town, r.landmark, r.side);
  if (!lm.length) return { ok: false, why: `no ${r.landmark} in ${town.name}` };
  return rd.meet(lm, r.person, r.hours, day0);
}
