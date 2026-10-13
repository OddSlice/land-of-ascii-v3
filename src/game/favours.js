// The favours of a world (phase 5a), chosen once from the seed and the
// world's own people and places; nothing here changes anyone's day. Three
// kinds (src/game/words.js has every word):
// - carry: take a thing to a named person in another village or at the fort;
// - find: find a thing lost at a described place and bring it back;
// - tell: tell someone something and bring back their answer.
//
// Who asks, and who is asked for, are people whose days keep them at one
// landmark (the green, the well, the chapel door, the jetty, their fields,
// the flock's pasture, the fort's gate), so a villager's words can say where
// and when they are usually found. A favour sends you between towns: its
// walk (there, or there and back) is meant to take four to twelve minutes.
// Some favours chain: the person at the far end has one of their own, asked
// once you have done what you came for.
//
// The first meeting: the first time you play, someone from the village
// nearest the spawn walks out to the spawn's road, arriving a minute after
// the start, waits there at the road's edge for two hours and more, and
// then goes back to their day (`meetingOf`). Their way out and back is a
// pure function of the clock, like everyone's day; it applies only in a
// first session (src/app/wayfaring.js).
import { hash2 } from '../world/noise.js';
import { groundAt } from '../world/objects.js';
import { routeOf, planOf, segmentAt } from '../world/people/people.js';
import { LOOK } from '../look.js';
import { CARRY, FIND, TELL, USUAL, ROLE_IS, FIRST } from './words.js';
import { compass, fill, cap } from './places.js';

export const START_DAY = LOOK.moon.startDay, START_HOUR = LOOK.hours.day;
const WALK = 4.5;                              // the player's walking speed (m/s)
export const WALK_MIN = 4 * 60 * WALK, WALK_MAX = 12 * 60 * WALK;   // a favour's walk, metres
// the walks aimed for (a little inside the limits, so a reader who
// looks about a little still keeps within them)
const CARRY_LEN = [1250, 2900], RETURN_LEN = [640, 1450], FIND_LEN = [1200, 2850];
const TAU = Math.PI * 2;

// Where and when someone is usually found: { place, where, when, town },
// or null for someone whose day keeps them nowhere in particular.
export function usualOf(P, names, i) {
  const per = P.persons[i];
  if (per.role === 'guard') {
    if (per.post !== 0 || !P.fort) return null;
    const U = USUAL[`guard${per.shift}`];
    return { place: P.fort.post, at: [P.fort.post], where: U.where, when: U.when, town: 'fort', side: '' };
  }
  if (per.village === undefined) return null;
  const V = P.villages[per.village], town = names.villages[per.village], c = V.centre || { x: 0, z: 0 };
  const side = (id) => compass(c.x, c.z, P.places[id].x, P.places[id].z);
  let place = -1;
  if (per.role === 'minder' && V.greens.length) place = V.greens[0];
  else if (per.role === 'wellkeeper' && V.wells.length) place = V.wells[0];
  else if (per.role === 'keeper' && V.chapel >= 0) place = V.chapel;
  else if (per.role === 'fisher' && V.jetty.length) place = V.jetty[0];
  else if (per.role === 'farmer' && V.fields.length) place = P.places[V.fields[per.rank % V.fields.length]].via;
  else if (per.role === 'shepherd' && per.flock >= 0) { const F = V.folds[per.flock]; if (F && F.pasture >= 0) place = V.pastures[F.pasture].gate; }
  if (place < 0) return null;
  const U = USUAL[per.role];
  // (the places that count as being there: any spot of the green, the
  // well or the jetty, any strip of the village's fields, the pasture)
  const at = per.role === 'minder' ? V.greens : per.role === 'wellkeeper' ? V.wells : per.role === 'fisher' ? V.jetty : [place];
  const sd = per.role === 'farmer' || per.role === 'shepherd' ? side(place) : '';
  return { place, at, where: fill(U.where, { town, side: sd }), when: U.when, town: per.village, side: sd };
}

// Is person i at their usual place (staying there, not passing) at an hour?
export function atUsual(P, u, i, day, hour) {
  const seg = segmentAt(planOf(P, i, day), hour);
  if (seg.kind !== 'stay') return false;
  const pl = P.places[seg.at];
  return u.at.includes(seg.at) || u.at.includes(pl.via) || (pl.kind === 'pasture' && P.places[pl.via] && u.at.includes(pl.via));
}

const lenOf = (P, a, b) => { try { const r = routeOf(P, a, b); return r ? r.len : Infinity; } catch { return Infinity; } };

// Distances over the road network from a place to every node (one sweep),
// for choosing; the chosen walk is then found in full (routeOf).
function netFrom(P, x, z) {
  const net = P.net, n = net.n, dist = new Float64Array(n).fill(Infinity);
  const s = net.nearby(x, z, 200)[0];
  if (s === undefined) return null;
  dist[s] = Math.hypot(net.x[s] - x, net.z[s] - z);
  const heap = [[dist[s], s]];
  const push = (f, c) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, c] = pop();
    if (d > dist[c]) continue;
    const nb = net.nb[c];
    for (let k = 0; k < nb.length; k += 2) { const j = nb[k], nd = d + nb[k + 1]; if (nd < dist[j]) { dist[j] = nd; push(nd, j); } }
  }
  return dist;
}
// The estimated walk from a sweep to a point: to its nearest node, then across.
function estTo(P, dist, x, z) {
  if (!dist) return Infinity;
  const k = P.net.nearby(x, z, 200)[0];
  return k === undefined ? Infinity : dist[k] + Math.hypot(P.net.x[k] - x, P.net.z[k] - z);
}

// ---- the first meeting ------------------------------------------------------------------

// The spot at the spawn road's edge, 26 m along the road from the spawn,
// 1.7 m off its middle, facing the spawn; and who comes out to it.
export function meetingOf(world, P, names) {
  const p = P.p, rd = world.roads[0], T = world.terrain;
  if (!rd) return null;
  // (the road's end at the spawn: the nearer end)
  const e = Math.hypot(rd.x[rd.n - 1] - world.start.x, rd.z[rd.n - 1] - world.start.z) < Math.hypot(rd.x[0] - world.start.x, rd.z[0] - world.start.z) ? rd.n - 1 : 0;
  const dir = e === 0 ? 1 : -1;
  let k = e, run = 0;
  while (run < 26 && k + dir >= 0 && k + dir < rd.n) { run += Math.hypot(rd.x[k + dir] - rd.x[k], rd.z[k + dir] - rd.z[k]); k += dir; }
  const k2 = Math.max(0, Math.min(rd.n - 1, k + dir * 3)), tx = rd.x[k2] - rd.x[k], tz = rd.z[k2] - rd.z[k], tl = Math.hypot(tx, tz) || 1;
  const nx = -tz / tl, nz = tx / tl;
  let spot = null;
  for (const s of [1, -1]) {
    const x = rd.x[k] + nx * 1.7 * s, z = rd.z[k] + nz * 1.7 * s, ft = p.supportAt(x, z, groundAt(T, x, z) + 0.3);
    if (p.blocked(x, z, ft) || T.wWater[Math.round(z) * world.NN + Math.round(x)] > 30) continue;
    spot = { x, z, ft, yaw: Math.atan2(world.start.x - x, world.start.z - z), side: s, centre: [rd.x[k], rd.z[k]] };
    break;
  }
  if (!spot) return null;
  // who: from the village nearest the spawn by the road network, someone
  // free in the afternoon (not a shepherd or the dog's person), whose day
  // lets them leave a stay in time
  const net = P.net, near = (x, z) => net.nearby(x, z, 120)[0];
  const sNode = near(world.start.x, world.start.z);
  const byRoad = P.villages.map((V) => {
    const c = V.centre, n0 = near(c.x, c.z);
    if (sNode === undefined || n0 === undefined) return Infinity;
    const way = net.path(sNode, n0);
    if (!way) return Infinity;
    let L = 0; for (let i = 1; i < way.length; i++) L += Math.hypot(net.x[way[i]] - net.x[way[i - 1]], net.z[way[i]] - net.z[way[i - 1]]);
    return L;
  });
  const order = byRoad.map((L, q) => [L, q]).filter((x) => x[0] < Infinity).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const pref = ['householder', 'minder', 'wellkeeper', 'keeper', 'farmer', 'fisher', 'carter'];
  const id = P.place('meet', spot.x, spot.z, groundAt(T, spot.x, spot.z), spot.yaw);
  const arrive = START_HOUR + 1 / 60;
  for (const q of order) {
    const V = P.villages[q];
    const cand = P.persons.filter((per) => per.village === q && pref.includes(per.role) && per.id !== V.dogOwner)
      .sort((a, b) => pref.indexOf(a.role) - pref.indexOf(b.role) || hash2(a.id, 3, P.seed + 8101) - hash2(b.id, 3, P.seed + 8101));
    for (const per of cand) {
      const m = meetPlan(P, per, id, arrive);
      if (m) return { ...m, spot: { ...spot, place: id }, village: q, town: names.villages[q] };
    }
  }
  return null;
}

// Out from the stay they are in when they must leave, to the spot by
// `arrive`; there until about two hours and more later; back to the stay
// their day has them in then.
function meetPlan(P, per, spot, arrive) {
  const plan = planOf(P, per.id, START_DAY);
  let from = -1, rin = null, dep = 0;
  for (let it = 0; it < 4; it++) {
    const guess = it === 0 ? arrive - 0.15 : dep;
    const seg = segmentAt(plan, guess);
    if (seg.kind !== 'stay') return null;
    if (seg.at === from && rin) break;
    from = seg.at;
    rin = routeOf(P, from, spot);
    if (!rin) return null;
    dep = arrive - rin.len / per.speed / 3600;
    const s2 = segmentAt(plan, dep);
    if (s2.kind === 'stay' && s2.at === from && s2.t0 <= dep) break;
  }
  const s0 = segmentAt(plan, dep);
  if (!rin || s0.kind !== 'stay' || s0.at !== from || dep < START_HOUR - 1 || dep < s0.t0) return null;
  // back: a stay of theirs between two and two and a half hours on
  for (let w = 2.0; w <= 2.45; w += 0.05) {
    const back = START_HOUR + w, seg = segmentAt(plan, back);
    if (seg.kind !== 'stay' || seg.t1 < back + 0.05) continue;
    const rout = routeOf(P, spot, seg.at);
    if (!rout) continue;
    const leave = back - rout.len / per.speed / 3600;
    if (leave < arrive + 1) continue;
    return { person: per.id, day: START_DAY, dep, arrive, leave, back, rin, rout, from, to: seg.at };
  }
  return null;
}

// ---- the lost things' places -----------------------------------------------------------

// Spots where a thing can lie, from the world's landmarks, each with the
// words for it: { kind, x, z, ft, yaw, lost (words), village (nearest) }.
export function spotsOf(world, P, places) {
  const p = P.p, T = world.terrain, NN = world.NN, names = places.names, out = [];
  const G = (x, z) => groundAt(T, x, z);
  const centres = P.villages.map((V) => V.centre);
  const nearV = (x, z) => { let b = 0, bd = Infinity; centres.forEach((c, q) => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; b = q; } }); return b; };
  // clear of shapes, water, roads, lanes, paths and fields' gates
  const clear = (x, z) => {
    if (x < 4 || z < 4 || x > world.N - 4 || z > world.N - 4) return null;
    const ft = p.supportAt(x, z, G(x, z) + 0.3);
    if (p.blocked(x, z, ft) || Math.abs(ft - G(x, z)) > 0.25) return null;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const j = Math.round(z + dz) * NN + Math.round(x + dx);
      if (Math.hypot(dx, dz) <= 1.6 && T.wWater[j] > 20) return null;
      if (Math.hypot(dx, dz) <= 2.2 && ((T.wRoad && T.wRoad[j] > 20) || (T.wPath && T.wPath[j] > 20))) return null;
    }
    return ft;
  };
  const push = (kind, x, z, lost, extra = {}) => {
    const ft = clear(x, z);
    if (ft === null) return false;
    out.push({ kind, x, z, ft, yaw: hash2(Math.round(x), Math.round(z), P.seed + 8201) * TAU, lost, village: nearV(x, z), ...extra });
    return true;
  };
  const tryRing = (kind, x0, z0, r0, lost, extra) => {
    for (let r = r0; r <= r0 + 2.5; r += 0.5) for (let a = 0; a < 12; a++) if (push(kind, x0 + Math.cos(a * TAU / 12) * r, z0 + Math.sin(a * TAU / 12) * r, lost, extra)) return true;
    return false;
  };
  world.sites.villages.forEach((v, q) => {
    const pl = v.plan, town = names.villages[q], c = P.villages[q].centre;
    if (!pl) return;
    const wall = pl.bounds === 'fence' ? 'fence' : 'wall';
    // field walls: outside the middle of a field's far side, for fields
    // alone on their side of the village
    const fs = (pl.fields || []).map((f) => ({ f, side: compass(c.x, c.z, f.x, f.z) }));
    for (const { f, side } of fs) {
      if (fs.filter((o) => o.side === side).length > 1) continue;
      const ca = Math.cos(f.a), sa = Math.sin(f.a), toW = (u, w) => [f.x + u * ca - w * sa, f.z + u * sa + w * ca];
      const sides = [[f.L + 1.3, 0], [-f.L - 1.3, 0], [0, f.W + 1.3], [0, -f.W - 1.3]].map((uw) => toW(...uw)).sort((A, B) => Math.hypot(B[0] - c.x, B[1] - c.z) - Math.hypot(A[0] - c.x, A[1] - c.z));
      const what = f.pasture ? 'pasture' : 'field';
      for (const [x, z] of sides) if (push('fieldwall', x, z, `by the ${wall} of the ${what} on the ${side} side of ${town}`, { town: q })) break;
    }
    // the sheepfold
    for (const fd of pl.folds || []) {
      const side = compass(c.x, c.z, fd.x, fd.z);
      if ((pl.folds || []).filter((o) => compass(c.x, c.z, o.x, o.z) === side).length > 1) continue;
      const [gx, gz] = fd.gate, dx = gx - fd.x, dz = gz - fd.z, dl = Math.hypot(dx, dz) || 1;
      push('fold', gx + (-dz / dl) * 3, gz + (dx / dl) * 3, `by the sheepfold on the ${side} side of ${town}`, { town: q }) || push('fold', gx + (dz / dl) * 3, gz - (dx / dl) * 3, `by the sheepfold on the ${side} side of ${town}`, { town: q });
    }
    if (pl.signpost) tryRing('signpost', pl.signpost.x, pl.signpost.z, 2.5, `by the signpost where the road from ${town} meets the main road`, { town: q });
    if (pl.jetty) { const [ax, az] = pl.jetty.a, [bx, bz] = pl.jetty.b, L = Math.hypot(bx - ax, bz - az); tryRing('jetty', ax - (bx - ax) / L * 2.2, az - (bz - az) / L * 2.2, 1.5, `at the foot of the jetty at ${town}`, { town: q }); }
    if (pl.chapel) { const ch = P.places[P.villages[q].chapel]; if (ch) tryRing('chapel', ch.x, ch.z, 1.4, `by the chapel door in ${town}`, { town: q }); }
    if ((pl.benches || []).length) { const b = pl.benches[0]; tryRing('bench', b.x, b.z, 1.2, `by the bench in ${town}`, { town: q }); }
  });
  // the bridges: on the bank beside the end nearer a village
  for (const pl of places.list.filter((x) => x.kind === 'bridge')) {
    const b = world.sites.bridges[Number(pl.id.slice(6))], ca = Math.cos(b.a), sa = Math.sin(b.a);
    const ends = [[b.x + ca * (b.len / 2 + 3), b.z + sa * (b.len / 2 + 3)], [b.x - ca * (b.len / 2 + 3), b.z - sa * (b.len / 2 + 3)]];
    const words = `by the bridge where the road to ${pl.title === 'the bridge' ? 'the fort' : pl.where.replace(/^on the road to /, '')} crosses ${pl.title.replace(/^the bridge over /, '')}`;
    let done = false;
    for (const [ex, ez] of ends) for (const s of [1, -1]) if (!done) done = push('bridge', ex - sa * 4.2 * s, ez + ca * 4.2 * s, words);
  }
  // the copses: just outside each, on the side toward the nearest village
  // (only the nearest copse in its direction from its village, so "the copse
  // west of Ashby" is one copse)
  const copses = (world.sites.copses || []).map(([cx, cz]) => { const q = nearV(cx, cz); return { cx, cz, q, dir: compass(centres[q].x, centres[q].z, cx, cz), d: Math.hypot(cx - centres[q].x, cz - centres[q].z) }; });
  for (const { cx, cz, q, dir, d: dc } of copses) {
    if (copses.some((o) => o.q === q && o.dir === dir && o.d < dc)) continue;
    const c = centres[q], d = Math.hypot(cx - c.x, cz - c.z) || 1, ux = (c.x - cx) / d, uz = (c.z - cz) / d;
    let edge = 0;
    for (const t of world.objects.trees) { const dx = t.x - cx, dz = t.z - cz; if (dx * dx + dz * dz < 900) { const along = dx * ux + dz * uz; if (along > edge) edge = along; } }
    const words = `at the edge of the copse ${compass(c.x, c.z, cx, cz)} of ${names.villages[q]}`;
    for (let r = edge + 3; r <= edge + 7; r += 1) if (push('copse', cx + ux * r, cz + uz * r, words, { copse: [cx, cz], town: q })) break;
  }
  // the viewpoints: beside the top
  const views = places.list.filter((x) => x.kind === 'viewpoint').map((pl) => { const q = nearV(pl.x, pl.z); return { pl, q, dir: compass(centres[q].x, centres[q].z, pl.x, pl.z), d: Math.hypot(pl.x - centres[q].x, pl.z - centres[q].z) }; });
  for (const { pl, q, dir, d } of views) {
    if (views.some((o) => o.q === q && o.dir === dir && o.d < d)) continue;
    tryRing('viewpoint', pl.x, pl.z, 2.5, `up on ${pl.title}, ${compass(centres[q].x, centres[q].z, pl.x, pl.z)} of ${names.villages[q]}`, { view: pl.id, town: q });
  }
  // the great lake's shore: the dry ground nearest each village
  const lake = places.list.find((x) => x.kind === 'lake');
  if (lake) centres.forEach((c, q) => {
    const w = lake.at.reduce((b, pt) => (!b || Math.hypot(pt[0] - c.x, pt[1] - c.z) < Math.hypot(b[0] - c.x, b[1] - c.z) ? pt : b), null);
    const d = Math.hypot(c.x - w[0], c.z - w[1]) || 1, ux = (c.x - w[0]) / d, uz = (c.z - w[1]) / d;
    for (let r = 0; r < Math.min(d, 120); r += 1) {
      const x = w[0] + ux * r, z = w[1] + uz * r;
      if (T.wWater[Math.round(z) * NN + Math.round(x)] > 20) continue;
      for (let s = 2; s <= 5; s++) if (push('shore', x + ux * s, z + uz * s, `on the shore of ${lake.title}, on the side nearest ${names.villages[q]}`, { town: q })) return;
      return;
    }
  });
  return out;
}

// ---- choosing the favours ------------------------------------------------------------------

// The favours of a world: { list, meet, byGiver, byDest }.
export function buildFavours(world, P, places) {
  const seed = P.seed >>> 0, names = places.names;
  const h = (a, b) => hash2(a, b, seed + 8301);
  const shuffled = (list, salt) => list.map((x, i) => [h(i, salt), x]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
  const tpl = { carry: shuffled(CARRY, 1), find: shuffled(FIND, 2), tell: shuffled(TELL, 3) };
  const used = { carry: 0, find: 0, tell: 0 };
  const townName = (t) => (t === 'fort' ? 'the fort' : names.villages[t]);
  const townXZ = (t) => (t === 'fort' ? { x: world.sites.fort.x, z: world.sites.fort.z } : P.villages[t].centre);
  // the people with a landmark, and where
  const usual = new Map();
  P.persons.forEach((per, i) => { const u = usualOf(P, names, i); if (u) usual.set(i, u); });
  const meet = meetingOf(world, P, names);
  const spots = spotsOf(world, P, places);
  const list = [], givers = new Set(), dests = new Set();
  const destIs = (i) => { const per = P.persons[i]; return fill(ROLE_IS[per.role] || ROLE_IS.householder, { town: townName(per.role === 'guard' ? 'fort' : per.village) }); };

  // a favour, with its words
  const make = (kind, giver, from, home, t, extra) => {
    const f = { id: `f${list.length}`, kind, giver, tpl: t.id, shape: t.shape || null, parent: null, ...extra };
    const G = P.persons[giver], gu = usual.get(giver);
    const sl = { giver: G.name, home: townName(home), thing: t.thing, short: t.short, doing: t.doing };
    if (gu) { sl.gwhere = gu.where; sl.gwhen = gu.when; }
    if (f.dest !== undefined) {
      const D = P.persons[f.dest], du = usual.get(f.dest), dt = du.town;
      const a = from, b = townXZ(dt);
      Object.assign(sl, { dest: D.name, destIs: destIs(f.dest), town: townName(dt), Town: cap(townName(dt)), dir: compass(a.x, a.z, b.x, b.z), which: whichOf(a, dt), where: du.where, when: du.when, msg: t.msg, answer: t.answer });
    }
    if (f.spot) {
      sl.lost = f.spot.lost; const hx = townXZ(home); sl.spotDir = compass(hx.x, hx.z, f.spot.x, f.spot.z);
      // (placed by another village: the way to that village)
      if (f.spot.town !== undefined && f.spot.town !== home) { const b = townXZ(f.spot.town); Object.assign(sl, { spotTown: cap(townName(f.spot.town)), spotTownDir: compass(hx.x, hx.z, b.x, b.z), spotWhich: whichOf(hx, f.spot.town) }); }
    }
    f.slots = sl;
    f.ask = t.ask ? t.ask.map((s) => cap(fill(s, sl))) : [cap(fill('I have lost {thing}. I had it when I was {doing} {lost}.', sl)), 'If you pass that way, would you look for it and bring it back to me?'];
    f.got = (t.got || t.found || []).map((s) => cap(fill(s, sl)));
    f.answer = t.answer || null;
    list.push(f);
    givers.add(giver);
    if (f.dest !== undefined) dests.add(f.dest);
    return f;
  };
  // the next unused template of a kind (wrapping round)
  const nextTpl = (kind, ok = () => true) => {
    const L = tpl[kind];
    for (let k = 0; k < L.length; k++) { const t = L[(used[kind] + k) % L.length]; if (ok(t)) { used[kind] += k + 1; return t; } }
    return null;
  };
  // the best of `cands` (scored by how near its walk is to the middle of `range`)
  // (the estimates first, the nearest the middle first; then each walked
  // in full until one can be, its own length kept)
  const best = (cands, range, from) => {
    const mid = (range[0] + range[1]) / 2;
    const ok = cands.filter((c) => c.len >= range[0] * 0.9 && c.len <= range[1] * 1.05).sort((a, b) => Math.abs(a.len - mid) - Math.abs(b.len - mid));
    for (const c of ok.slice(0, 6)) {
      const L = lenOf(P, from, c.place);
      if (L >= range[0] && L <= range[1]) return { ...c, len: L };
    }
    return null;
  };
  const townOf = (i) => (P.persons[i].role === 'guard' ? 'fort' : P.persons[i].village);
  // Is a town plainly the one its direction names from (x, z)? (no other
  // village lies nearer within 45 degrees of that direction: a reader of
  // "Corwen lies west of here" goes to the first village west, and the fort
  // is plainly a fort)
  // ", the farther of the two villages that way", when another village
  // lies within 45 degrees of the direction from (x, z) to town t
  const whichOf = (from, t) => {
    if (t === 'fort') return '';
    const b = townXZ(t), dirA = Math.round(Math.atan2(b.x - from.x, b.z - from.z) / (TAU / 8)) * (TAU / 8);
    const way = P.villages.filter((V) => {
      const c = V.centre;
      if (Math.hypot(c.x - from.x, c.z - from.z) < 60) return false;
      let a = Math.atan2(c.x - from.x, c.z - from.z) - dirA; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
      return Math.abs(a) <= Math.PI / 4 + 0.05;
    }).sort((A, B) => Math.hypot(A.centre.x - from.x, A.centre.z - from.z) - Math.hypot(B.centre.x - from.x, B.centre.z - from.z));
    if (way.length < 2) return '';
    const k = way.findIndex((V) => V.q === t), n = way.length;
    if (n === 2) return `, the ${k === 0 ? 'nearer' : 'farther'} of the two villages that way`;
    return `, the ${k === 0 ? 'nearest' : k === n - 1 ? 'farthest' : 'middle one'} of the ${n === 3 ? 'three' : n} villages that way`;
  };
  const plainFrom = (from, t) => {
    if (t === 'fort') return true;
    const b = townXZ(t), dirA = Math.round(Math.atan2(b.x - from.x, b.z - from.z) / (TAU / 8)) * (TAU / 8), d = Math.hypot(b.x - from.x, b.z - from.z);
    return !P.villages.some((V) => {
      if (V.q === t) return false;
      const c = V.centre, e = Math.hypot(c.x - from.x, c.z - from.z);
      if (e < 60 || e >= d) return false;
      let a = Math.atan2(c.x - from.x, c.z - from.z) - dirA; while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU;
      return Math.abs(a) <= Math.PI / 4 + 0.05;
    });
  };
  const sweeps = new Map();
  const sweep = (place) => { if (!sweeps.has(place)) sweeps.set(place, netFrom(P, P.places[place].ax, P.places[place].az)); return sweeps.get(place); };
  const destCands = (fromPlace) => {
    const out = [], dist = sweep(fromPlace);
    for (const [i, u] of usual) {
      if (dests.has(i) || givers.has(i)) continue;
      const q = P.places[u.place];
      out.push({ i, len: estTo(P, dist, q.ax, q.az), place: u.place, town: u.town });
    }
    return out;
  };
  const spotCands = (fromPlace, kinds) => {
    const out = [], dist = sweep(fromPlace);
    for (const s of spots) {
      if (!kinds.includes(s.kind) || s.used) continue;
      out.push({ s, len: estTo(P, dist, s.x, s.z), get place() { if (s.place === undefined) s.place = P.place('lost', s.x, s.z, s.ft, s.yaw); return s.place; } });
    }
    return out;
  };
  // a favour of `kind` from giver i (at place `from`, in town `home`)
  const offer = (kind, i, fromPlace, home, parent = null) => {
    const fromXZ = home === undefined ? null : townXZ(home);
    if (kind === 'carry' || kind === 'tell') {
      const R = kind === 'carry' ? CARRY_LEN : RETURN_LEN;
      const all = destCands(fromPlace).filter((x) => x.town !== home);
      const c = best(all.filter((x) => plainFrom(fromXZ, x.town)), R, fromPlace) || best(all, R, fromPlace);
      if (!c) return null;
      const t = nextTpl(kind);
      return make(kind, i, fromXZ, home, t, { dest: c.i, len: kind === 'carry' ? c.len : 2 * c.len, parent });
    }
    // find: a template whose places include a spot in reach. The walk is
    // there and back; by the village the words name first, when that is
    // not home (the words place it by that village)
    const via = (sp) => (sp.town !== undefined && sp.town !== home ? (P.villages[sp.town].wells[0] ?? P.villages[sp.town].houses[0].step) : -1);
    for (let k = 0; k < FIND.length; k++) {
      const t = tpl.find[(used.find + k) % FIND.length];
      const mid = (FIND_LEN[0] + FIND_LEN[1]) / 2, from = sweep(fromPlace);
      const hx = townXZ(home);
      const plain = (sp) => {
        if (sp.kind !== 'bridge') return true;
        const dir = compass(hx.x, hx.z, sp.x, sp.z), d = Math.hypot(sp.x - hx.x, sp.z - hx.z);
        return !world.sites.bridges.some((b) => compass(hx.x, hx.z, b.x, b.z) === dir && Math.hypot(b.x - hx.x, b.z - hx.z) < d - 30);
      };
      const cands = spotCands(fromPlace, t.at).filter((c) => plain(c.s) && (c.s.town === undefined || c.s.town === home || plainFrom(hx, c.s.town))).map((c) => {
        const v = via(c.s);
        const est = v < 0 ? 2 * c.len : estTo(P, from, P.places[v].ax, P.places[v].az) + estTo(P, sweep(v), c.s.x, c.s.z) + c.len;
        return { ...c, est, v };
      }).filter((c) => c.est >= FIND_LEN[0] * 0.9 && c.est <= FIND_LEN[1] * 1.05).sort((a, b) => Math.abs(a.est - mid) - Math.abs(b.est - mid));
      for (const c of cands.slice(0, 6)) {
        const sp = c.place;
        const L = c.v < 0 ? lenOf(P, fromPlace, sp) + lenOf(P, sp, fromPlace) : lenOf(P, fromPlace, c.v) + lenOf(P, c.v, sp) + lenOf(P, sp, fromPlace);
        if (!(L >= FIND_LEN[0] && L <= FIND_LEN[1])) continue;
        used.find += k + 1;
        c.s.used = true;
        return make('find', i, fromXZ, home, t, { spot: c.s, len: L, parent });
      }
    }
    return null;
  };

  // 1. the first favour: carried from the road to someone in another town;
  // the one it is carried to has the next, and so on, three long
  let first = null;
  if (meet) {
    const per = P.persons[meet.person];
    // (someone who will be at their place when you get there that first
    // afternoon, and for an hour after)
    const there = (x) => { const u = usual.get(x.i), t = meet.arrive + 0.05 + x.len / WALK / 3600; for (let k = 0; k <= 4; k++) if (!atUsual(P, u, x.i, START_DAY, t + k * 0.25)) return false; return true; };
    const cands = destCands(meet.spot.place).filter((x) => x.town !== per.village && there(x));
    let c = best(cands.filter((x) => plainFrom(meet.spot, x.town)), CARRY_LEN, meet.spot.place) || best(cands, CARRY_LEN, meet.spot.place), kind = 'carry';
    // (no one far enough to carry to: word to take there and back, the giver
    // waiting on the road meanwhile; there and back is twice the walk)
    if (!c) {
      const near2 = cands.map((x) => ({ ...x, len: x.len }));
      c = best(near2.filter((x) => plainFrom(meet.spot, x.town)), RETURN_LEN, meet.spot.place) || best(near2, RETURN_LEN, meet.spot.place);
      if (c) kind = 'tell';
    }
    // (no one at all in reach: the farthest that can be walked to)
    if (!c) for (const x of cands.sort((a, b) => b.len - a.len).slice(0, 4)) { const L = lenOf(P, meet.spot.place, x.place); if (L < Infinity) { c = { ...x, len: L }; break; } }
    if (c) {
      const t = nextTpl(kind);
      if (kind === 'tell') usual.set(meet.person, { place: meet.spot.place, at: [meet.spot.place], where: FIRST.where, when: FIRST.when, town: per.village, side: '' });
      first = make(kind, meet.person, { x: meet.spot.x, z: meet.spot.z }, per.village, t, { dest: c.i, len: kind === 'tell' ? 2 * c.len : c.len, first: true });
      first.slots.dir = compass(meet.spot.x, meet.spot.z, townXZ(usual.get(c.i).town).x, townXZ(usual.get(c.i).town).z);
      first.slots.which = whichOf(meet.spot, usual.get(c.i).town);
      // (the words again, with the way from the road)
      const t2 = (kind === 'tell' ? TELL : CARRY).find((x) => x.id === t.id);
      first.ask = [...FIRST.hello, ...t2.ask.map((s2) => cap(fill(s2, { ...first.slots, dir: first.slots.dir })))].slice(0, 3);
      let at = c.i, kinds = ['tell', 'find'];
      let parent = first;
      for (let k = 0; k < 2; k++) {
        const u = usual.get(at);
        let f = null;
        for (const kind of kinds) { f = offer(kind, at, u.place, u.town, parent.id); if (f) break; }
        if (!f) break;
        parent = f;
        if (f.kind !== 'tell') break;
        at = f.dest; kinds = ['find', 'tell'];
      }
    }
  }
  // 2. one or two from each town, the kinds taken in turn, so a world has
  // some of each; now and then the one at the far end has one of their own
  const towns = [...P.villages.map((V) => V.q), ...(P.fort ? ['fort'] : [])];
  const order = ['find', 'tell', 'carry'];
  let turn = Math.floor(h(9, 9) * 3);
  for (let round = 0; round < 2 && list.length < 12; round++) {
    for (const tw of towns) {
      const cands = shuffled([...usual.keys()].filter((i) => usual.get(i).town === tw && !givers.has(i) && !dests.has(i)), 10 + round);
      for (const i of cands.slice(0, 1)) {
        const u = usual.get(i);
        let f = null;
        for (let k = 0; k < 3 && !f; k++) f = offer(order[(turn + k) % 3], i, u.place, u.town);
        turn++;
        if (!f) continue;
        if (f.dest !== undefined && h(list.length, 11) < 0.5) {
          const du = usual.get(f.dest);
          for (const kind of ['find', 'tell']) { if (offer(kind, f.dest, du.place, du.town, f.id)) break; }
        }
      }
    }
  }
  const byGiver = new Map(), byDest = new Map();
  for (const f of list) {
    if (!byGiver.has(f.giver)) byGiver.set(f.giver, []);
    byGiver.get(f.giver).push(f);
    if (f.dest !== undefined) { if (!byDest.has(f.dest)) byDest.set(f.dest, []); byDest.get(f.dest).push(f); }
  }
  return { list, meet, first: first ? first.id : null, byGiver, byDest, usual, spots };
}

// The journal's words for a favour at its state: what to do, where, when.
export function favourWords(fv, P, usual, state) {
  const s = fv.slots, out = [];
  const gu = usual.get(fv.giver);
  if (fv.kind === 'carry') {
    out.push(`Take ${s.short} to ${s.dest}, who ${s.destIs}.`);
    out.push(`${s.Town} lies ${s.dir} of ${fv.first ? 'the rise where you met' : s.home}${s.which || ''}, by the road. ${s.dest} is usually ${s.where}, ${s.when}.`);
  } else if (fv.kind === 'tell') {
    if (state >= 3) out.push(`Bring ${s.dest}'s answer back to ${s.giver}: "${fv.answer}"`);
    else {
      out.push(`Tell ${s.dest}, who ${s.destIs}, that ${s.msg}, and bring the answer back to ${s.giver}.`);
      out.push(`${s.Town} lies ${s.dir} of ${fv.first ? 'the rise where you met' : s.home}${s.which || ''}, by the road. ${s.dest} is usually ${s.where}, ${s.when}.`);
    }
    if (gu) out.push(`${s.giver} is usually ${gu.where}, ${gu.when}.`);
  } else {
    if (state >= 3) out.push(`Bring ${s.short} back to ${s.giver}.`);
    else out.push(`Find ${s.thing}, which ${s.giver} lost ${s.lost}, and bring it back. ${s.spotTown ? `${s.spotTown} lies ${s.spotTownDir} of ${s.home}${s.spotWhich || ''}, by the road.` : `That is ${s.spotDir} of ${s.home}.`}`);
    if (gu) out.push(`${s.giver} is usually ${gu.where}, ${gu.when}.`);
  }
  return out;
}
