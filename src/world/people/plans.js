// Plans (phase 4a; src/world/people/people.js): each person's whole day,
// worked out from the seed, the day and the forecast, as visits to their
// places; nothing is simulated.
import { hash2 } from '../noise.js';
import { forecastOf } from '../../weather.js';
import { SCALE } from '../scale.js';
import { POSE } from './figure.js';
import { routeOf } from './routes.js';

const TAU = Math.PI * 2;

// A plan: segments in time order covering the day, each
//   { t0, t1, kind: 'stay', at: place, pose, act } or
//   { t0, t1, kind: 'walk', from, to, route, act }
// (hours). A stay inside a closed house is hidden; asleep in a bed lies on it.
export function planOf(P, i, day) {
  const key = i * 100000 + day;
  let plan = P.plans.get(key);
  if (plan) return plan;
  const per = P.persons[i];
  const fc = forecastOf(P.seed, day);
  const plan2 = per.role === 'guard' ? guardPlan(P, per, day) : per.role === 'traveller' ? travellerPlan(P, per, day, fc) : per.role === 'shepherd' ? shepherdPlan(P, per, day, fc) : villagerPlan(P, per, day, fc);
  plan = finish(P, per, plan2);
  P.plans.set(key, plan);
  if (P.plans.size > 4000) P.plans.delete(P.plans.keys().next().value);
  return plan;
}

// The day's visits [{ at, from, to, pose, act }] become stays and the walks
// between them (a walk leaves at the stay's end, and the next stay starts on
// arrival; a stay too short for its walk is left out).
function finish(P, per, visits) {
  const segs = [];
  let cur = visits[0], t = 0;
  segs.push({ t0: 0, t1: cur.to, kind: 'stay', at: cur.at, pose: cur.pose, act: cur.act });
  t = cur.to;
  for (let k = 1; k < visits.length; k++) {
    const v = visits[k];
    // (the same place again: one stay, unless the pose or what they are
    // doing changes there: at home, then asleep behind the same door)
    if (v.at === cur.at) { segs[segs.length - 1].t1 = Math.max(segs[segs.length - 1].t1, v.to); if (v.pose !== segs[segs.length - 1].pose || v.act !== segs[segs.length - 1].act) { segs[segs.length - 1].t1 = Math.max(t, v.from); segs.push({ t0: segs[segs.length - 1].t1, t1: v.to, kind: 'stay', at: v.at, pose: v.pose, act: v.act }); } t = segs[segs.length - 1].t1; cur = v; continue; }
    const route = routeOf(P, cur.at, v.at);
    if (!route) continue;
    const dur = route.len / per.speed / 3600;
    const leave = Math.max(t, v.from - dur * 0.5);
    const arrive = leave + dur;
    if (arrive >= v.to - 0.02 && k < visits.length - 1) continue;
    segs[segs.length - 1].t1 = leave;
    segs.push({ t0: leave, t1: arrive, kind: 'walk', from: cur.at, to: v.at, route, act: v.walkAct || 'walk', ...(v.lead ? { lead: v.lead } : {}) });
    segs.push({ t0: arrive, t1: Math.max(arrive, v.to), kind: 'stay', at: v.at, pose: v.pose, act: v.act });
    t = Math.max(arrive, v.to);
    cur = v;
  }
  segs[segs.length - 1].t1 = 24;
  return segs;
}

// rain or mist between a and b in the forecast?
const rainSpans = (fc) => fc.filter(([, , k]) => k === 'rain').map(([f, t]) => [f, t]);

// (phase 4b) Where a pasture's flock grazes round at an hour: a point that
// drifts slowly over the pasture (two slow swings, from the seed and the
// day), and in rain toward its sheltered side (`shelter`, 0..1). Local (u, w)
// and world (x, z).
export function flockCentre(P, PA, day, hour, shelter = 0) {
  const ph = hash2(PA.field * 31 + day, 7, P.seed + 4951) * TAU, ph2 = hash2(PA.field * 31 + day, 8, P.seed + 4951) * TAU;
  const m = SCALE.animals.pastureEdge;
  let u = (PA.L - m) * 0.85 * Math.sin(hour * TAU / 4.3 + ph), w = (PA.W - m) * 0.85 * Math.sin(hour * TAU / 3.1 + ph2);
  if (shelter > 0 && PA.lee) { u += (PA.lee[0] - u) * shelter; w += (PA.lee[1] - w) * shelter; }
  return { u, w, x: PA.x + u * PA.ca - w * PA.sa, z: PA.z + u * PA.sa + w * PA.ca };
}

// (phase 4b) A shepherd's day: out to the fold after dawn and leading the
// flock to its pasture (later while it rains), by the flock through the
// day, moving with it, and bringing it in at dusk (sooner when rain comes
// in the afternoon); home, and to bed. No grazing on a day it rains all day.
function shepherdPlan(P, per, day, fc) {
  const V = P.villages[per.village], H = V.houses[per.home], F = V.folds[per.flock], PA = V.pastures[F.pasture];
  const h = (k) => hash2(per.id * 131 + k, day, P.seed + 4801);
  const home = H.enter ? H.inside : H.closed, sleepAt = H.enter ? H.bed : H.closed, sitAt = H.enter ? H.sit : H.closed;
  const wake = 5.2 + 0.5 * h(1), bed = 21.3 + 0.8 * h(2);
  const v = [];
  v.push({ at: sleepAt, from: 0, to: wake, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  v.push({ at: H.enter ? H.hearth : home, from: wake, to: wake + 0.35, pose: H.enter ? POSE.STAND : POSE.HIDDEN, act: 'at home' });
  let out = 6.4 + 0.5 * h(3), back = 18.0 + 0.5 * h(4);
  for (const [f0, f1, k] of fc) if (k === 'rain' && f0 <= out + 0.5 && f1 > out - 0.2) out = f1 + 0.2;
  for (const [f0, , k] of fc) if (k === 'rain' && f0 > out + 1 && f0 < back) { back = f0 + 0.15; break; }
  if (PA && PA.spots.length && out < back - 1.2) {
    v.push({ at: F.gate, from: out - 0.12, to: out, pose: POSE.STAND, act: 'opening the fold' });
    const near = (t) => {
      const c = flockCentre(P, PA, day, t);
      let best = PA.spots[0], bd = Infinity;
      for (const id of PA.spots) { const q = P.places[id], d = Math.hypot(q.x - c.x, q.z - c.z); if (d < bd) { bd = d; best = id; } }
      return best;
    };
    let t = out + 0.1, first = true;
    while (t < back - 0.3) {
      const t1 = Math.min(back - 0.15, t + 0.9 + 0.4 * h(10 + Math.floor(t)));
      v.push({ at: near(t + 0.2), from: t, to: t1, pose: h(30 + Math.floor(t)) < 0.3 ? POSE.SIT : POSE.STAND, act: 'minding the flock', ...(first ? { walkAct: 'leading the flock out', lead: 'out' } : { walkAct: 'following the flock' }) });
      first = false; t = t1 + 0.02;
    }
    v.push({ at: F.gate, from: back, to: back + 0.2, pose: POSE.STAND, act: 'shutting the fold', walkAct: 'bringing the flock in', lead: 'in' });
  }
  const tHome = Math.max(back + 0.5, (v[v.length - 1].to || 0) + 0.1);
  v.push({ at: H.enter ? sitAt : home, from: tHome, to: bed, pose: H.enter ? POSE.SIT : POSE.HIDDEN, act: 'at home' });
  v.push({ at: sleepAt, from: bed, to: 24, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  return v;
}

function villagerPlan(P, per, day, fc) {
  const V = P.villages[per.village], H = V.houses[per.home];
  // (two of a house never reach its door at the same moment: the second
  // keeps a quarter of a minute behind the first, the third behind that)
  const ord = P.persons.filter((q) => q.village === per.village && q.home === per.home && q.id < per.id).length;
  const h0 = (k) => hash2(per.id * 131 + k, day, P.seed + 4701);
  const h = (k) => h0(k);
  const home = H.enter ? H.inside : H.closed;
  const sleepAt = H.enter ? H.bed : H.closed, sitAt = H.enter ? H.sit : H.closed;
  const wake = 5.5 + 0.9 * h(1), bed = 21.2 + 1.3 * h(2);
  const v = [];
  v.push({ at: sleepAt, from: 0, to: wake, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  v.push({ at: H.enter ? (h(3) < 0.5 ? H.hearth : sitAt) : home, from: wake, to: wake + 0.35 + 0.3 * h(4), pose: H.enter ? (h(3) < 0.5 ? POSE.STAND : POSE.SIT) : POSE.HIDDEN, act: 'at home' });
  let t = v[v.length - 1].to;
  // (spots handed out by one's place among the role's people, moving round
  // from day to day, so two of a kind seldom choose the same one)
  const spot = (list, k) => (list.length ? list[(per.rank * 2 + day + Math.floor(h(k) * 2) + k) % list.length] : -1);
  const out = (at, from, to, pose, act) => { if (at >= 0 && to > from + 0.05) v.push({ at, from, to, pose, act }); };
  // a bench seat of one's own for the day (those who sit, in order; one
  // without a seat stands instead)
  const sitters = P.persons.filter((q) => q.village === per.village && (q.role === 'householder' || q.role === 'minder' || q.role === 'wellkeeper'));
  const sr = sitters.indexOf(per), seatOf = () => (V.benches.length && sr >= 0 && sr < V.benches.length ? V.benches[(sr + day) % V.benches.length] : -1);
  const homeAgain = (from, to, act = 'at home') => out(H.enter ? sitAt : home, from, to, H.enter ? POSE.SIT : POSE.HIDDEN, act);
  const role = per.role;
  if (role === 'farmer') {
    // a strip each (the farmers of a village take different spots, moving
    // round them from day to day; the afternoon's another)
    const nf = V.fields.length, own = (k) => V.fields[(per.rank + day * per.peers + k * per.peers) % nf];
    if (h(6) < 0.4) { out(V.wells[(per.rank + day) % V.wells.length] ?? -1, t + 0.1, t + 0.35, POSE.STAND, 'drawing water'); t += 0.4; }
    out(nf ? own(0) : -1, t + 0.1, 11.7 + 0.3 * h(8), POSE.WORK, 'working the field');
    homeAgain(12.0 + 0.2 * h(9), 12.9 + 0.2 * h(10), 'at the midday meal');
    out(nf ? own(1) : -1, 13.3, 17.2 + 0.6 * h(12), POSE.WORK, 'working the field');
  } else if (role === 'fisher') {
    let start = 6.0 + 0.4 * h(5);
    // mist on the water: they wait for it to lift
    for (const [f0, f1, k] of fc) if (k === 'mist' && f0 <= start + 0.5 && f1 > start) start = f1 + 0.2 + 0.4 * h(6);
    if (start < t + 0.1) start = t + 0.1;
    homeAgain(t, start - 0.15);
    out(V.jetty[(per.id + day) % V.jetty.length], start, 11.0 + 0.4 * h(7), POSE.FISH, 'fishing');
    homeAgain(11.5, 13.0 + 0.3 * h(8), 'at the midday meal');
    out(V.jetty[(per.id + day + 1) % V.jetty.length], 13.6, 17.3 + 0.5 * h(9), POSE.FISH, 'fishing');
  } else if (role === 'carter') {
    // to another town and back, by the roads
    const towns = P.towns.filter((tw) => tw.village !== per.village);
    const tw = towns[(per.id + day) % towns.length];
    const dest = tw.fort ? P.fort.front : (P.villages[tw.village].wells[0] ?? P.villages[tw.village].houses[0].step);
    out(H.step, t + 0.1, 7.0 + 0.4 * h(5), POSE.STAND, 'loading the cart');
    out(dest, 7.5, 12.5 + 0.5 * h(6), POSE.STAND, tw.fort ? 'at the fort' : 'trading');
    out(H.step, 13.0, 17.0, POSE.STAND, 'unloading');
  } else if (role === 'keeper') {
    out(V.chapel, t + 0.1, 9.6 + 0.3 * h(5), POSE.SWEEP, 'sweeping the chapel step');
    out(spot(V.greens.length ? V.greens : V.wells, 6), 9.9, 11.6, POSE.STAND, 'talking');
    homeAgain(12.0, 13.0, 'at the midday meal');
    out(V.chapel, 13.5, 16.8 + 0.4 * h(7), POSE.STAND, 'keeping the chapel');
  } else if (role === 'minder' || role === 'wellkeeper') {
    const place1 = role === 'minder' ? spot(V.greens, 5) : spot(V.wells, 5);
    const seat = h(6) < 0.5 ? seatOf() : -1;
    out(place1, t + 0.2, 10.8, POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
    if (seat >= 0) out(seat, 10.9, 12.8, POSE.SIT, 'resting'); else out(place1, 10.9, 12.8, POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
    homeAgain(13.0, 13.7, 'at the midday meal');
    out(role === 'minder' ? spot(V.greens, 7) : spot(V.wells, 7), 13.5, 18.0 + 0.4 * h(8), POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
  } else {
    // keeping house: the doorstep, the well, a neighbour, the green
    out(H.step, t + 0.1, 8.6 + 0.6 * h(5), POSE.STAND, 'at the door');
    out(spot(V.wells, 6), 8.9 + 0.5 * h(7), 9.5 + 0.5 * h(7), POSE.STAND, 'drawing water');
    if (h(8) < 0.7) {
      const nb = V.houses[(per.home + 1 + Math.floor(h(9) * (V.houses.length - 1))) % V.houses.length];
      out(nb.step, 10.0, 10.9 + 0.4 * h(10), POSE.STAND, 'visiting a neighbour');
    }
    // midday on the green (or by the well, or under the market shelter):
    // where the village meets
    const meet = V.shelter.length && per.rank % 3 === 2 ? V.shelter[per.rank % V.shelter.length] : spot(V.greens.length ? V.greens : V.wells, 13);
    if (h(15) < 0.75) out(meet, 11.1 + 0.3 * h(16), 12.7 + 0.3 * h(17), POSE.STAND, 'talking');
    homeAgain(12.9 + 0.3 * h(18), 14.4 + h(11));
    const seat = seatOf();
    if (seat >= 0 && h(12) < 0.6) out(seat, 15.0, 16.4, POSE.SIT, 'resting');
    else out(spot(V.greens.length ? V.greens : V.wells, 19), 15.0, 16.4, POSE.STAND, 'talking');
    out(H.step, 16.8, 18.0 + 0.5 * h(14), POSE.STAND, 'at the door');
  }
  // rain: out-of-doors work is left for shelter (a barn, the market shelter,
  // or home) while it rains, each person after their own short while
  const spans = rainSpans(fc);
  const sheltered = [];
  for (const vi of v) {
    const pk = P.places[vi.at].kind;
    const outdoors = ['field', 'jetty', 'green', 'well', 'bench', 'door', 'chapel', 'gate'].includes(pk);
    let pieces = [vi];
    if (outdoors) for (const [r0, r1] of spans) {
      const next = [];
      for (const pc of pieces) {
        const a = r0 + 0.1 + 0.35 * h(30 + Math.floor(r0)), b = r1 + 0.15 + 0.3 * h(40 + Math.floor(r1));
        if (b <= pc.from || a >= pc.to) { next.push(pc); continue; }
        if (a > pc.from + 0.1) next.push({ ...pc, to: a });
        const shelter = pk === 'field' && V.barns.length ? V.barns[per.id % V.barns.length] : V.shelter.length && pk === 'green' ? V.shelter[per.id % V.shelter.length] : (H.enter ? sitAt : home);
        next.push({ at: shelter, from: Math.max(a, pc.from), to: Math.min(b, pc.to), pose: P.places[shelter].kind === 'closed' ? POSE.HIDDEN : P.places[shelter].kind === 'sit' ? POSE.SIT : POSE.STAND, act: 'sheltering from the rain' });
        if (b < pc.to - 0.1) next.push({ ...pc, from: b });
      }
      pieces = next;
    }
    sheltered.push(...pieces);
  }
  // evening: home by dusk, awake by the fire, then to bed
  const last = sheltered[sheltered.length - 1];
  const back = Math.max(last.to + 0.1, 18.6 + 0.9 * h(20));
  sheltered.push({ at: H.enter ? sitAt : home, from: back, to: bed, pose: H.enter ? POSE.SIT : POSE.HIDDEN, act: 'at home' });
  sheltered.push({ at: sleepAt, from: bed, to: 24, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  const shift = ord * 0.0042;
  if (shift) for (const vi of sheltered) { if (vi.from > 0) vi.from += shift; if (vi.to < 24) vi.to += shift; }
  return sheltered.sort((a, b) => a.from - b.from);
}

// The guards: three watches of eight hours (6-14, 14-22, 22-6), three to a
// watch: one at the gate, two walking their beats on the wall. The next
// watch leaves the keep early, so a post is never left until its relief has
// come. Off watch: asleep in a bunk for eight hours, else in the hall.
function guardPlan(P, per, day) {
  const F = P.fort, h = (k) => hash2(per.id * 131 + k, day, P.seed + 4801);
  const starts = [6, 14, 22], s0 = starts[per.shift];
  const post = per.post === 0 ? F.post : F.beats.length ? F.beats[(per.post - 1) % F.beats.length].walk : F.post;
  // (a watch sleeps together: a bunk each by post; the watches take turns)
  const bunk = F.bunks[per.post % F.bunks.length];
  const pose = per.post === 0 ? POSE.STAND : POSE.WALK;
  const act = per.post === 0 ? 'keeping the gate' : 'walking the wall';
  // the hour the watch begins and ends on this day
  const v = [];
  const sleepFrom = (s0 + 8 + 0.5) % 24, sleepTo = (sleepFrom + 7.5) % 24;
  const onDuty = (t) => ((t - s0 + 24) % 24) < 8;
  const asleep = (t) => ((t - sleepFrom + 24) % 24) < 7.5;
  // build the day hour by hour in pieces: duty, sleep, the hall
  const bounds = [0, 24, s0 % 24, (s0 + 8) % 24, sleepFrom, sleepTo].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
  for (let k = 0; k < bounds.length - 1; k++) {
    const a = bounds[k], b = bounds[k + 1], mid = (a + b) / 2;
    if (b - a < 1e-6) continue;
    // (the next watch goes up early: a quarter of an hour before the hour;
    // the watch ending comes down once relieved)
    if (onDuty(mid)) {
      const a2 = a === s0 % 24 ? a - 0.25 : a, b2 = b === (s0 + 8) % 24 ? b + 0.05 : b;
      v.push({ at: post, from: Math.max(0, a2), to: Math.min(24, b2), pose, act, duty: true });
    } else if (asleep(mid)) v.push({ at: bunk, from: a, to: b, pose: POSE.SLEEP, act: 'asleep in the barracks' });
    else {
      // the hall (a spot of one's own: each guard their own of the hall's
      // spots), or a turn in the yard
      const own = F.hallSpots.length ? F.hallSpots[per.guard % F.hallSpots.length] : F.hall;
      const yard = F.yard[per.guard % F.yard.length];
      if (b - a > 2 && h(Math.floor(a)) < 0.5) {
        v.push({ at: own, from: a, to: (a + b) / 2, pose: POSE.STAND, act: 'off watch' });
        v.push({ at: yard, from: (a + b) / 2, to: b, pose: POSE.STAND, act: 'off watch' });
      } else v.push({ at: own, from: a, to: b, pose: POSE.STAND, act: 'off watch' });
    }
  }
  // overlapping ends: the duty piece wins (it starts early); trim the rest
  v.sort((x, y) => x.from - y.from || (y.duty ? 1 : 0) - (x.duty ? 1 : 0));
  for (let k = 1; k < v.length; k++) if (v[k].from < v[k - 1].to) { if (v[k].duty) v[k - 1].to = v[k].from; else v[k].from = v[k - 1].to; }
  // (the three of a watch keep a quarter of a minute apart, so they do not
  // walk in one another's steps)
  const sh = per.post * 0.0042;
  if (sh) for (const vi of v) { if (vi.from > 0) vi.from += sh; if (vi.to < 24) vi.to += sh; }
  return v.filter((x) => x.to > x.from + 1e-3);
}

// The travellers: from town to town along the roads, a town a day, resting
// on its benches (or by its well, or in the fort's yard) and staying the
// night there sitting up.
function travellerPlan(P, per, day, fc) {
  const T = P.towns, n = T.length, h = (k) => hash2(per.id * 131 + k, day, P.seed + 4901);
  // (two legs a day round the towns by the main roads: in the morning to the
  // next town, resting by its well through the middle of the day, in the
  // afternoon on to the one after, where the night is spent; so a traveller
  // is round every town in two days, and the next day sets off from there)
  const at = (d) => T[((per.traveller * 2 + d) % n + n) % n];
  const restOf = (tw, k) => {
    if (tw.fort) return P.fort.yard[(per.traveller + k) % P.fort.yard.length];
    const V = P.villages[tw.village];
    const list = V.benches.length ? V.benches : V.wells.length ? V.wells : [V.houses[0].step];
    return list[(per.traveller + k) % list.length];
  };
  // (by a well by day; a bench only from the evening, when the village's
  // own sitters have gone in)
  const wellOf = (tw) => (tw.fort ? P.fort.yard[(per.traveller + 2) % P.fort.yard.length] : (P.villages[tw.village].wells[1] ?? P.villages[tw.village].wells[0] ?? restOf(tw, 0)));
  const seatPose = (pl) => (P.places[pl].kind === 'bench' ? POSE.SIT : POSE.STAND);
  // a traveller waits out heavy rain before setting off (but not past late afternoon)
  const after = (t, last) => { for (const [f0, f1, k] of fc) if (k === 'rain' && f0 <= t + 0.3 && f1 > t) t = Math.min(last, f1 + 0.2); return t; };
  const d0 = day * 2, A = restOf(at(d0), 0), Bw = wellOf(at(d0 + 1)), Cw = wellOf(at(d0 + 2)), C = restOf(at(d0 + 2), 0);
  const v = [];
  v.push({ at: A, from: 0, to: after(7.6 + 0.8 * h(1), 11), pose: seatPose(A), act: 'resting' });
  v.push({ at: Bw, from: v[0].to + 0.1, to: after(12.6 + 0.8 * h(2), 16.5), pose: POSE.STAND, act: 'resting' });
  v.push({ at: Cw, from: v[1].to + 0.1, to: 19.2 + 0.5 * h(3), pose: POSE.STAND, act: 'resting' });
  v.push({ at: C, from: 19.8 + 0.4 * h(4), to: 24, pose: seatPose(C), act: 'resting' });
  return v;
}
