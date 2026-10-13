// Where every animal is and what it is doing (phase 4b): a pure function of
// the seed, the day and the hour (and, for a flock and a dog, their
// person's plan), with one reaction: a local, stateless response to how
// near a walker is (you, or a person). Nothing is simulated and nothing is
// remembered, so far animals cost nothing, a frozen clock gives the same
// picture, and fast time simply works.
//
// The reactions keep alert and flight apart (an animal lifts its head long
// before it moves), and flight grows smoothly over a band of distance, so
// standing at the edge of it gives a steady picture, never a flip between
// two. The band itself narrows a little as the day goes on and widens
// again (`bold`), a slow function of the clock, so a group that fled comes
// back later if you stay where you are.
import { AS, A as AI, APOSE, KIND, SPEC, BIRDS } from './kinds.js';
import { planOf, segmentAt, flockCentre, stateAt as personAt } from '../people/people.js';
import { FS, S as PS, POSE } from '../people/figure.js';
import { hash2 } from '../noise.js';
import { groundAt } from '../objects.js';
import { supportAt as kitTop } from '../kit.js';
import { weatherFor } from '../../weather.js';
import { SCALE } from '../scale.js';

const TAU = Math.PI * 2;
const C = SCALE.animals;
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
// how alert at `d` metres from a walker: half at the kind's alert distance
const alertOf = (spec, d) => smooth(spec.alert * 1.15, spec.alert * 0.85, d);
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// A point at distance s along a route: [x, z, y, yaw].
function along(R, s, out) {
  if (s <= 0) { out[0] = R.x[0]; out[1] = R.z[0]; out[2] = R.y[0]; out[3] = R.n > 1 ? Math.atan2(R.x[1] - R.x[0], R.z[1] - R.z[0]) : 0; return out; }
  if (s >= R.len) { const n = R.n - 1; out[0] = R.x[n]; out[1] = R.z[n]; out[2] = R.y[n]; out[3] = n > 0 ? Math.atan2(R.x[n] - R.x[n - 1], R.z[n] - R.z[n - 1]) : 0; return out; }
  let lo = 0, hi = R.n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.cum[m] <= s) lo = m; else hi = m - 1; }
  const j = Math.min(lo, R.n - 2), L = R.cum[j + 1] - R.cum[j], f = L > 1e-9 ? (s - R.cum[j]) / L : 0;
  out[0] = R.x[j] + (R.x[j + 1] - R.x[j]) * f; out[1] = R.z[j] + (R.z[j + 1] - R.z[j]) * f; out[2] = R.y[j] + (R.y[j + 1] - R.y[j]) * f;
  const k2 = Math.min(R.n - 1, j + 2), k1 = Math.max(0, j - 1);
  out[3] = Math.atan2(R.x[k2] - R.x[k1], R.z[k2] - R.z[k1]);
  return out;
}

// One route made of a lead-in from P0, route R, and a lead-out to P1: the
// point at s along it (before its start: at P0; after its end: at P1).
function path3(P0, R, P1, s, out) {
  const L0 = Math.hypot(R.x[0] - P0[0], R.z[0] - P0[1]), n = R.n - 1, L1 = Math.hypot(P1[0] - R.x[n], P1[1] - R.z[n]);
  if (s <= 0) { out[0] = P0[0]; out[1] = P0[1]; out[2] = P0[2]; out[3] = Math.atan2(R.x[0] - P0[0], R.z[0] - P0[1]); out[4] = 0; return out; }
  if (s < L0) { const f = s / L0; out[0] = P0[0] + (R.x[0] - P0[0]) * f; out[1] = P0[1] + (R.z[0] - P0[1]) * f; out[2] = P0[2] + (R.y[0] - P0[2]) * f; out[3] = Math.atan2(R.x[0] - P0[0], R.z[0] - P0[1]); out[4] = 1; return out; }
  if (s < L0 + R.len) { along(R, s - L0, out); out[4] = 1; return out; }
  const s2 = s - L0 - R.len;
  if (s2 < L1) { const f = s2 / L1; out[0] = R.x[n] + (P1[0] - R.x[n]) * f; out[1] = R.z[n] + (P1[1] - R.z[n]) * f; out[2] = R.y[n] + (P1[2] - R.y[n]) * f; out[3] = Math.atan2(P1[0] - R.x[n], P1[1] - R.z[n]); out[4] = 1; return out; }
  out[0] = P1[0]; out[1] = P1[1]; out[2] = P1[2]; out[3] = Math.atan2(P1[0] - R.x[n], P1[1] - R.z[n]); out[4] = 0; return out;
}
const pathLen = (P0, R, P1) => Math.hypot(R.x[0] - P0[0], R.z[0] - P0[1]) + R.len + Math.hypot(P1[0] - R.x[R.n - 1], P1[1] - R.z[R.n - 1]);

// a route joined from two (the fold's gap, then the shepherd's way)
function joined(A, a, b) {
  const key = a; let m = A.joins || (A.joins = new Map());
  let row = m.get(key); if (!row) { row = new Map(); m.set(key, row); }
  let R = row.get(b);
  if (R) return R;
  const xs = [...a.x, ...b.x.slice(1)], zs = [...a.z, ...b.z.slice(1)], ys = [...a.y, ...b.y.slice(1)];
  const n = xs.length, cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
  R = { x: Float64Array.from(xs), z: Float64Array.from(zs), y: Float64Array.from(ys), n, cum, len: cum[n - 1] };
  row.set(b, R);
  return R;
}
const reversed = (A, R) => {
  let m = A.revs || (A.revs = new Map());
  let Q = m.get(R);
  if (Q) return Q;
  const n = R.n, x = new Float64Array(n), z = new Float64Array(n), y = new Float64Array(n), cum = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = R.x[n - 1 - i]; z[i] = R.z[n - 1 - i]; y[i] = R.y[n - 1 - i]; }
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  Q = { x, z, y, n, cum, len: cum[n - 1] };
  m.set(R, Q);
  return Q;
};

// The weather's rain (0..1) and mist: the frame's weather if given, else
// the forecast's.
function rainOf(seed, day, hour, weather) {
  const w = weather || weatherFor(seed, day, hour), m = (w && w.mix) || {};
  return { rain: m.rain || 0, mist: m.mist || 0 };
}

// Fill the states of the animals of `groups` (all if null) at (day, hour)
// into out (AS numbers each, in member order). `near`: walkers to react to,
// as [x, z, feet, ...] (you first). Returns how many were written; `ids`
// gets their member ids. Birds in the air past their mark distance are also
// written (the frame draws them as marks).
export function animalsAt(A, day, hour, near, out, ids, groups = null, weather = null) {
  const P = A.P, w = A.world, T = w.terrain, G = (x, z) => groundAt(T, x, z);
  const minutes = (day * 24 + hour) * 60;
  const wx = rainOf(A.seed, day, hour, weather);
  const night = hour < 5.2 || hour >= 21.0;
  let n = 0;
  const tmp = [0, 0, 0, 0, 0];
  const put = (m, x, z, y, yaw, pose, phase, head = 0, wing = 0, alert = 0, room = -1) => {
    const o = n * AS, mb = A.members[m];
    out[o + AI.X] = x; out[o + AI.Z] = z; out[o + AI.Y] = y; out[o + AI.YAW] = yaw; out[o + AI.POSE] = pose; out[o + AI.PHASE] = phase;
    out[o + AI.HEAD] = head; out[o + AI.KIND] = mb.kind; out[o + AI.ID] = m; out[o + AI.SCALE] = mb.scale; out[o + AI.WING] = wing;
    out[o + AI.M1] = mb.m1; out[o + AI.M2] = mb.m2; out[o + AI.ALERT] = alert; out[o + AI.ROOM] = room; out[o + AI.SPARE] = mb.rank;
    ids[n] = m; n++;
  };
  // the nearest walker to (x, z), and how far
  const nearest = (x, z) => {
    let bd = Infinity, bx = 0, bz = 0;
    for (let k = 0; k < near.length; k += 3) { const d = Math.hypot(near[k] - x, near[k + 1] - z); if (d < bd) { bd = d; bx = near[k]; bz = near[k + 1]; } }
    return [bd, bx, bz];
  };
  // how bold the group is now (its flight band narrows by up to a quarter)
  const bold = (g) => 0.85 + 0.15 * Math.sin(minutes / 37 + g.id * 1.7);
  // a flight away from (wx, wz): how far along `away`, stopping at water or anything in the way
  // the longest way off among straight away and up to 60 degrees either
  // side (round what is in the way): [ax, az, length]
  const fleeWay = (x, z, ax, az, L, onWater = false) => {
    let best = [ax, az, fleeTo(x, z, ax, az, L, onWater)];
    for (const t of [0.5, -0.5, 1.05, -1.05]) {
      if (best[2] >= L) break;
      const c = Math.cos(t), sn = Math.sin(t), bx = ax * c - az * sn, bz = az * c + ax * sn, d = fleeTo(x, z, bx, bz, L, onWater);
      if (d > best[2] + 2) best = [bx, bz, d];
    }
    return best;
  };
  const fleeTo = (x, z, ax, az, L, onWater = false) => {
    let ok = 0;
    for (let s = 2; s <= L; s += 2) {
      const px = x + ax * s, pz = z + az * s, wet = T.wWater[Math.round(pz) * T.NN + Math.round(px)] > 127;
      if (onWater ? !wet : wet) break;
      if (!onWater && P.p.blocked(px, pz, P.p.supportAt(px, pz, G(px, pz) + 0.3))) break;
      ok = s;
    }
    return ok;
  };
  const list = groups || A.groups;
  for (const g of list) {
    const spec = SPEC[g.kind];
    switch (g.type) {
      case 'flock': flock(A, g, day, hour, minutes, wx, put, tmp); break;
      case 'herd': herd(A, g, day, hour, minutes, wx, night, put); break;
      case 'hens': hens(A, g, day, hour, minutes, wx, put); break;
      case 'dog': dog(A, g, day, hour, minutes, put); break;
      case 'deer': {
        // the group's way through the day
        let s, R, pose = APOSE.GRAZE, cx, cz, cy, yaw = 0, moving = false;
        const tt = [5.0, 5.4, 8.1, 8.5, 17.9, 18.3, 21.2, 21.6];
        const W = g.ways;
        const leg = (R2, t0, t1) => { const f = (hour - t0) / (t1 - t0); along(R2, R2.len * f, tmp); moving = true; return tmp; };
        if (hour < tt[0] || hour >= tt[7]) { cx = g.bed[0]; cz = g.bed[1]; pose = APOSE.LIE; }
        else if (hour < tt[1]) { leg(W.bedEdge, tt[0], tt[1]); cx = tmp[0]; cz = tmp[1]; yaw = tmp[3]; }
        else if (hour < tt[2]) { cx = g.edge[0]; cz = g.edge[1]; }
        else if (hour < tt[3]) { leg(W.edgeDay, tt[2], tt[3]); cx = tmp[0]; cz = tmp[1]; yaw = tmp[3]; }
        else if (hour < tt[4]) { cx = g.day[0]; cz = g.day[1]; pose = hour > 11.5 && hour < 15 ? APOSE.LIE : APOSE.STAND; }
        else if (hour < tt[5]) { leg(W.dayEdge, tt[4], tt[5]); cx = tmp[0]; cz = tmp[1]; yaw = tmp[3]; }
        else if (hour < tt[6]) { cx = g.edge[0]; cz = g.edge[1]; }
        else { leg(W.edgeBed, tt[6], tt[7]); cx = tmp[0]; cz = tmp[1]; yaw = tmp[3]; }
        // (in rain they keep to the trees: their grazing is the day spot's)
        if (wx.rain > 0.3 && (pose === APOSE.GRAZE) && !moving) { cx = g.day[0]; cz = g.day[1]; pose = APOSE.STAND; }
        // a walker near: heads up, then away into the trees
        const [d, nx, nz] = nearest(cx, cz), b = bold(g);
        const alert = alertOf(spec, d);
        const fl = smooth(spec.flight[0] * b, spec.flight[1] * b, d);
        let fx = 0, fz = 0, fd = 0;
        if (fl > 0) {
          const [ax, az, L] = fleeWay(cx, cz, (cx - nx) / (d || 1), (cz - nz) / (d || 1), spec.flee);
          fd = L * fl; fx = ax * fd; fz = az * fd;
        }
        for (const m of g.members) {
          const k = A.members[m].rank, ang = k * 2.39996 + g.id, rr = 1.6 * Math.sqrt(k + 0.4);
          const wn = moving ? 0.2 : 0.7;
          let x = cx + Math.cos(ang) * rr + wn * Math.sin(minutes / 9 + k * 2.1) + fx;
          let z = cz + Math.sin(ang) * rr + wn * Math.cos(minutes / 11 + k * 1.3) + fz;
          let ps = pose, yw = moving ? yaw : ang + 0.9 * Math.sin(minutes / 23 + k);
          if (ps === APOSE.GRAZE && hash2(k + g.id * 17, Math.floor(minutes / 2), 5) < 0.25) ps = APOSE.STAND;
          if (moving) ps = APOSE.WALK;
          let ph = moving ? (hour * 3600 * spec.walk) / spec.stride : 0;
          if (fl > 0.02 && fl < 0.98) { ps = APOSE.RUN; yw = Math.atan2(fx, fz); ph = fd / spec.stride; }
          else if (fl >= 0.98) { ps = APOSE.STAND; yw = Math.atan2(nx - x, nz - z); }
          if (alert > 0.5 && (ps === APOSE.GRAZE || ps === APOSE.LIE)) ps = APOSE.STAND;
          const head = ps === APOSE.GRAZE ? 0 : 1;
          put(m, x, z, P.p.supportAt(x, z, G(x, z) + 0.3), yw, ps, ph % 1, head, 0, alert);
        }
        break;
      }
      case 'hare': {
        // sits in its form, now and then a few hops to another of its spots
        const per = 9, slot = Math.floor(minutes / per), f = minutes / per - slot;
        const a = g.spots[slot % g.spots.length], b = g.spots[(slot + 1) % g.spots.length];
        const hop = smooth(0.9, 1, f);
        let x = a[0] + (b[0] - a[0]) * hop, z = a[1] + (b[1] - a[1]) * hop, yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
        let pose = hop > 0 && hop < 1 ? APOSE.RUN : APOSE.SIT, ph = hop * Math.hypot(b[0] - a[0], b[1] - a[1]) / spec.stride;
        const [d, nx, nz] = nearest(x, z), bb = bold(g);
        const alert = alertOf(spec, d);
        const fl = smooth(spec.flight[0] * bb, spec.flight[1] * bb, d);
        if (fl > 0) {
          const [ax, az, L] = fleeWay(x, z, (x - nx) / (d || 1), (z - nz) / (d || 1), spec.flee), fd = L * fl;
          x += ax * fd; z += az * fd;
          if (fl < 0.98) { pose = APOSE.RUN; yaw = Math.atan2(ax, az); ph = fd / spec.stride; } else { pose = APOSE.SIT; yaw = Math.atan2(nx - x, nz - z); }
        }
        put(g.members[0], x, z, P.p.supportAt(x, z, G(x, z) + 0.3), yaw, pose, ph % 1, alert > 0.5 ? 1 : 0, 0, alert);
        break;
      }
      case 'ducks': {
        // paddling slow loops by day; on the bank at night, tucked in
        const onBank = hour < 5.6 || hour >= 20.6;
        const toBank = smooth(20.1, 20.6, hour) * (hour >= 12 ? 1 : 0) + (hour < 6.1 ? 1 - smooth(5.6, 6.1, hour) : 0);
        for (const m of g.members) {
          const k = A.members[m].rank, ph = minutes / (4.5 + g.id % 3) + k * 2.2 + g.id;
          let x = g.at[0] + Math.cos(ph) * C.duckLoop * 0.8 + Math.cos(k * 2.1) * 0.6, z = g.at[1] + Math.sin(ph) * C.duckLoop * 0.8 + Math.sin(k * 2.1) * 0.6;
          let yaw = Math.atan2(-Math.sin(ph), Math.cos(ph)), y = g.level - 0.06, pose = APOSE.SWIM;
          const bx = g.bank[0] + Math.cos(k * 2.4) * 0.6, bz = g.bank[1] + Math.sin(k * 2.4) * 0.6, by = P.p.supportAt(bx, bz, G(bx, bz) + 0.3);
          if (onBank) { x = bx; z = bz; y = by; pose = APOSE.SIT; yaw = k * 1.9; }
          else if (toBank > 0) {
            // (back to the middle of their water first, then out along the
            // way to the bank that was found to be water all along)
            const ax = g.at[0] + Math.cos(k * 2.4) * 0.3, az = g.at[1] + Math.sin(k * 2.4) * 0.3;
            if (toBank < 0.5) { const f = smooth(0, 1, toBank * 2); x += (ax - x) * f; z += (az - z) * f; }
            else { const f = (toBank - 0.5) * 2; x = ax + (bx - ax) * f; z = az + (bz - az) * f; }
            const wet = T.wWater[Math.round(z) * T.NN + Math.round(x)] > 127;
            y = wet ? g.level - 0.06 : P.p.supportAt(x, z, G(x, z) + 0.3);
            pose = wet ? APOSE.SWIM : APOSE.WALK; yaw = Math.atan2(bx - x, bz - z);
          }
          if (pose === APOSE.SWIM) {
            const [d, nx, nz] = nearest(x, z);
            const fl = smooth(spec.flight[0], spec.flight[1], d);
            if (fl > 0) { const ax = (x - nx) / (d || 1), az = (z - nz) / (d || 1), L = fleeTo(x, z, ax, az, spec.flee, true); x += ax * L * fl; z += az * L * fl; if (fl < 0.98) yaw = Math.atan2(ax, az); }
          }
          put(m, x, z, y, yaw, pose, (minutes * 2.2 + k) % 1, 1);
        }
        break;
      }
      case 'gulls': birdsGulls(A, g, minutes, hour, wx, night, nearest, put); break;
      case 'crow': {
        const pc = g.perch, m = g.members[0];
        const [d] = nearest(pc.x, pc.z);
        const fl = smooth(spec.flight[0], spec.flight[1], d);
        // (now and then, a turn round and back, by the clock)
        const roam = smooth(0, 0.08, ((minutes / 31 + g.id * 0.37) % 1)) * (1 - smooth(0.08, 0.16, ((minutes / 31 + g.id * 0.37) % 1)));
        const up = Math.max(fl, night ? 0 : roam);
        if (up <= 0.01) { put(m, pc.x, pc.z, pc.y, pc.yaw, APOSE.PERCH, 0, 1, 0, alertOf(spec, d)); break; }
        // (up off its perch first, then out to its circle)
        const a = minutes * 6 / C.crowCircle + g.id, R = C.crowCircle * up * up;
        const x = pc.x + Math.cos(a) * R, z = pc.z + Math.sin(a) * R, y = pc.y + 0.15 + (g.fly - pc.y - 0.15) * Math.min(1, up * 2.5);
        put(m, x, z, y, Math.atan2(-Math.sin(a), Math.cos(a)), APOSE.FLY, (minutes * 30 + g.id) % 1, 1, 1);
        break;
      }
      case 'finches': birdsFinches(A, g, minutes, hour, night, put); break;
      case 'kites': {
        if (hour < 8 || hour > 18.5) break;
        for (const m of g.members) {
          const k = A.members[m].rank, a = minutes * TAU / (2.6 + k * 0.4) + k * Math.PI, R = C.kiteCircle * (1 + 0.15 * k);
          const x = g.centre[0] + Math.cos(a) * R + 30 * Math.sin(minutes / 13), z = g.centre[1] + Math.sin(a) * R;
          put(m, x, z, g.ground + C.kiteAlt + 15 * k, Math.atan2(-Math.sin(a), Math.cos(a)), APOSE.FLY, (minutes * 3 + k) % 1, 1, 0.3);
        }
        break;
      }
    }
  }
  return n;
}

// a flock: in its fold, out along its shepherd's way to the pasture, grazing
// round the pasture's drifting centre, back along the shepherd's way at
// dusk; the members one behind another on the way, spread out to graze
function flock(A, g, day, hour, minutes, wx, put, tmp) {
  const P = A.P, plan = planOf(P, g.shepherd, day), per = P.persons[g.shepherd];
  const segOut = plan.find((sg) => sg.lead === 'out'), segIn = plan.find((sg) => sg.lead === 'in');
  const F = g.F, PA = g.PA, sp = SPEC[KIND.SHEEP], v = per.speed;
  const lie = hour < 5.6 || hour >= 20.8;
  const shelter = wx.rain > 0.2 ? Math.min(1, wx.rain * 1.5) : 0;
  const slotAt = (k, t) => {
    const c = flockCentre(P, PA, day, t, shelter), ang = k * 2.39996, rr = C.flockSpace * Math.sqrt(k + 0.6) * (shelter > 0 ? 0.7 : 1);
    const mt = (day * 24 + t) * 60;
    let u = c.u + Math.cos(ang) * rr + 0.45 * Math.sin(mt / 7 + k * 2.1), w = c.w + Math.sin(ang) * rr + 0.45 * Math.cos(mt / 9 + k * 1.3);
    const m = 1.2;
    u = Math.max(-PA.L + m, Math.min(PA.L - m, u)); w = Math.max(-PA.W + m, Math.min(PA.W - m, w));
    const x = PA.x + u * PA.ca - w * PA.sa, z = PA.z + u * PA.sa + w * PA.ca;
    return [x, z, P.p.supportAt(x, z, groundAt(A.world.terrain, x, z) + 0.3)];
  };
  const foldSlot = (k) => F.slots[k % F.slots.length];
  for (const m of g.members) {
    const k = A.members[m].rank, lag = C.flockLead + k * C.flockFile;
    let x, z, y, yaw = k * 1.9, pose = APOSE.STAND, phase = 0;
    // which part of the day
    let mode = 'fold';
    if (segOut && segIn && g.exit) {
      const Rout = joined(A, g.exit, segOut.route);
      const s1 = (hour - segOut.t0) * 3600 * v - lag;
      const Lout = pathLen(foldSlot(k), Rout, [0, 0, 0]);
      const tArr = segOut.t0 + (lag + pathLen(foldSlot(k), Rout, slotAt(k, segOut.t1))) / (3600 * v);
      const Rin = joined(A, segIn.route, reversed(A, g.exit));
      const s2 = (hour - segIn.t0) * 3600 * v - lag;
      if (s1 <= 0) mode = 'fold';
      else if (hour < tArr) mode = 'out';
      else if (s2 <= 0) mode = 'graze';
      else mode = 'in';
      if (mode === 'out') {
        const dest = slotAt(k, tArr);
        path3(foldSlot(k), Rout, dest, s1, tmp);
        x = tmp[0]; z = tmp[1]; y = tmp[2]; yaw = tmp[3]; pose = tmp[4] ? APOSE.WALK : APOSE.STAND; phase = (s1 / sp.stride) % 1;
        void Lout;
      } else if (mode === 'in') {
        const t0 = segIn.t0 + lag / (3600 * v), start = slotAt(k, t0);
        path3(start, Rin, foldSlot(k), s2, tmp);
        x = tmp[0]; z = tmp[1]; y = tmp[2]; yaw = tmp[3]; pose = tmp[4] ? APOSE.WALK : APOSE.STAND; phase = (s2 / sp.stride) % 1;
        if (!tmp[4]) mode = 'fold';
      } else if (mode === 'graze') {
        [x, z, y] = slotAt(k, hour);
        const h = hash2(k + g.id * 31, Math.floor(minutes / 2), 7);
        pose = h < 0.22 ? APOSE.STAND : APOSE.GRAZE;
        // (lying down in the warm middle of the day, some of them)
        if (hour > 12.6 && hour < 14.2 && hash2(k, day + g.id * 7, 9) < 0.45 && shelter === 0) pose = APOSE.LIE;
        yaw = k * 2.3 + 0.8 * Math.sin(minutes / 17 + k);
      }
    }
    if (mode === 'fold') {
      [x, z, y] = foldSlot(k);
      pose = lie ? APOSE.LIE : (hash2(k, Math.floor(minutes / 3), 11) < 0.5 ? APOSE.STAND : APOSE.GRAZE);
      yaw = k * 2.3 + 0.5 * Math.sin(minutes / 29 + k);
    }
    put(m, x, z, y, yaw, pose, phase, pose === APOSE.GRAZE || pose === APOSE.LIE ? 0 : 1);
  }
}

// cattle: grazing their field, slowly; lying down at night and through the
// warm middle of the day; under the field's sheltered side in rain
function herd(A, g, day, hour, minutes, wx, night, put) {
  const P = A.P, PA = g.PA, shelter = wx.rain > 0.2 ? Math.min(1, wx.rain * 1.5) : 0;
  const c = flockCentre(P, PA, day, hour * 0.6, shelter);
  for (const m of g.members) {
    const k = A.members[m].rank, ang = k * 2.39996 + 1, rr = C.herdSpace * Math.sqrt(k + 0.6);
    let u = c.u + Math.cos(ang) * rr + 0.6 * Math.sin(minutes / 19 + k * 2.1), w = c.w + Math.sin(ang) * rr + 0.6 * Math.cos(minutes / 23 + k * 1.3);
    const mg = 2;
    u = Math.max(-PA.L + mg, Math.min(PA.L - mg, u)); w = Math.max(-PA.W + mg, Math.min(PA.W - mg, w));
    const x = PA.x + u * PA.ca - w * PA.sa, z = PA.z + u * PA.sa + w * PA.ca;
    const lie = night || (hour > 12.8 && hour < 14.6 && hash2(k, day, 13) < 0.5);
    const pose = lie ? APOSE.LIE : hash2(k + g.id * 13, Math.floor(minutes / 4), 15) < 0.3 ? APOSE.STAND : APOSE.GRAZE;
    put(m, x, z, P.p.supportAt(x, z, groundAt(A.world.terrain, x, z) + 0.3), k * 2.1 + 0.5 * Math.sin(minutes / 41 + k), pose, 0, pose === APOSE.GRAZE || pose === APOSE.LIE ? 0 : 1);
  }
}

// hens: out of their house's door after dawn, scratching round before it,
// and in to roost before dark (and out of the rain)
function hens(A, g, day, hour, minutes, wx, put) {
  const P = A.P, T = A.world.terrain;
  const out0 = 6.3 + 0.2 * hash2(g.id, day, 21), in0 = 20.0 + 0.3 * hash2(g.id, day, 22);
  const rain = wx.rain > 0.35;
  for (const m of g.members) {
    const k = A.members[m].rank, sp = g.spots[k % g.spots.length];
    const dly = k * 0.006;
    const f = smooth(out0 + dly, out0 + dly + 0.04, hour) * (1 - smooth(in0 + dly, in0 + dly + 0.04, hour));
    if (f <= 0 || rain) continue;
    const wn = 0.9;
    const tx = sp[0] + wn * Math.sin(minutes / 3.1 + k * 2.3) * f, tz = sp[1] + wn * Math.cos(minutes / 3.7 + k * 1.7) * f;
    const x = g.door[0] + (tx - g.door[0]) * f, z = g.door[1] + (tz - g.door[1]) * f;
    const moving = f < 1;
    const pose = moving ? APOSE.WALK : hash2(k, Math.floor(minutes * 4), 23) < 0.55 ? APOSE.PECK : APOSE.STAND;
    const yaw = moving ? Math.atan2(tx - g.door[0], tz - g.door[1]) : k * 1.7 + Math.sin(minutes / 2 + k) * 1.2;
    put(m, x, z, P.p.supportAt(x, z, groundAt(T, x, z) + 0.3), yaw, pose, (minutes * 8 + k) % 1, 1);
  }
}

// a dog: behind its person on their way (through doorways too), lying
// beside them where they stop, and by their door while they are at home
const DOGST = new Float32Array(FS);
function dog(A, g, day, hour, minutes, put) {
  const P = A.P, per = P.persons[g.owner], plan = planOf(P, g.owner, day), seg = segmentAt(plan, hour);
  const st = DOGST;
  personAt(P, g.owner, day, hour, st, 0);
  const m = g.members[0], sp = SPEC[KIND.DOG];
  const T = A.world.terrain;
  const step = P.places[g.H.step];
  const byDoor = () => {
    // (beside the door, on whichever side is clear, else before it)
    let x = 0, z = 0, y = 0;
    for (const [u, f] of [[0.9, 0], [-0.9, 0], [0, 1.3], [1.4, 0.6], [-1.4, 0.6]]) {
      x = step.x + Math.cos(step.yaw) * u + Math.sin(step.yaw) * f; z = step.z - Math.sin(step.yaw) * u + Math.cos(step.yaw) * f;
      y = P.p.supportAt(x, z, groundAt(T, x, z) + 0.3);
      if (!P.p.blocked(x, z, y)) break;
    }
    put(m, x, z, y, step.yaw, APOSE.LIE, 0, 0);
  };
  if (seg.kind === 'walk') {
    const R = seg.route, s = Math.min(R.len, Math.max(0, (hour - seg.t0) * 3600 * per.speed)) - C.dogLag;
    const pa = P.places[seg.from], pb = P.places[seg.to];
    // (not into a house one cannot enter: it waits at the door)
    if ((pa.kind === 'closed' && s < R.hideA + 0.8) || (pb.kind === 'closed' && s > R.len - R.hideB - 0.8)) { byDoor(); return; }
    const tmp = along(R, Math.max(0, s), [0, 0, 0, 0]);
    const side = 0.45, x = tmp[0] + Math.cos(tmp[3]) * side, z = tmp[1] - Math.sin(tmp[3]) * side;
    const y = P.p.blocked(x, z, tmp[2]) ? tmp[2] : P.p.supportAt(x, z, tmp[2] + 0.3);
    const ok = !P.p.blocked(x, z, y);
    // (its room: its person's where they were as far back)
    personAt(P, g.owner, day, Math.max(seg.t0, hour - C.dogLag / per.speed / 3600), st, 0);
    put(m, ok ? x : tmp[0], ok ? z : tmp[1], ok ? y : tmp[2], tmp[3], s > 0 ? APOSE.WALK : APOSE.STAND, ((hour - seg.t0) * 3600 * per.speed / sp.stride) % 1, 1, 0, 0, st[PS.ROOM]);
    return;
  }
  const pl = P.places[seg.at];
  if (st[PS.POSE] === POSE.HIDDEN || seg.pose === POSE.SLEEP || pl.kind === 'closed' || pl.kind === 'in' || pl.kind === 'sit' || pl.kind === 'bed' || pl.kind === 'hearth') { byDoor(); return; }
  // beside them, a little wander
  const a = st[PS.YAW] + 1.9 + 0.4 * Math.sin(minutes / 13);
  let x = st[PS.X] + Math.sin(a) * 1.4, z = st[PS.Z] + Math.cos(a) * 1.4;
  let y = P.p.supportAt(x, z, st[PS.FEET] + 0.3);
  if (P.p.blocked(x, z, y)) { x = st[PS.X] - Math.sin(st[PS.YAW]) * 1.2; z = st[PS.Z] - Math.cos(st[PS.YAW]) * 1.2; y = P.p.supportAt(x, z, st[PS.FEET] + 0.3); }
  put(m, x, z, y, Math.atan2(st[PS.X] - x, st[PS.Z] - z), hash2(g.id, Math.floor(minutes / 6), 31) < 0.6 ? APOSE.LIE : APOSE.SIT, 0, 1);
}

// gulls: by day circling over the water off their shore, some standing on
// the beach (each in turn, by the clock); at night all standing
function birdsGulls(A, g, minutes, hour, wx, night, nearest, put) {
  const spec = SPEC[KIND.GULL];
  for (const m of g.members) {
    const k = A.members[m].rank, pc = g.perches[k % g.perches.length];
    const cyc = (minutes / (14 + k * 3) + k * 0.31 + g.id * 0.17) % 1;
    const flying = !night && cyc < 0.6 && wx.rain < 0.6;
    const [d] = nearest(pc[0], pc[1]);
    const scare = smooth(spec.flight[0], spec.flight[1], d);
    const up = Math.max(flying ? 1 : 0, scare) * (flying ? 1 : smooth(0, 1, scare));
    if (up < 0.02) {
      // (each on its own spot; more gulls than spots share them, a little apart)
      const off = k < g.perches.length ? 0 : 0.5, px = pc[0] + Math.cos(k * 2.1) * off, pz = pc[1] + Math.sin(k * 2.1) * off;
      put(m, px, pz, off ? A.P.p.supportAt(px, pz, pc[2] + 0.3) : pc[2], k * 1.3 + Math.sin(minutes / 5 + k) * 0.6, APOSE.PERCH, 0, 1);
      continue;
    }
    const a = minutes * TAU / (1.3 + k * 0.17) + k * 1.1, R = C.gullCircle * (0.7 + 0.12 * k);
    const cx = flying ? g.centre[0] : pc[0], cz = flying ? g.centre[1] : pc[1];
    const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, y = g.level + C.gullAlt * (0.6 + 0.1 * k) * up + (flying ? 0 : pc[2] - g.level);
    put(m, x, z, Math.max(y, pc[2] + 0.5), Math.atan2(-Math.sin(a), Math.cos(a)), APOSE.FLY, (minutes * 22 + k) % 1, 1, 0.6);
  }
}

// small birds: a flock rests in a copse a while, then flies to the next, a
// loose cloud, each bird a little off the flock's way by its own clock
function birdsFinches(A, g, minutes, hour, night, put) {
  const cps = g.copses, n = cps.length, rest = 7, fly = 1.4;
  const cyc = rest + fly, t = minutes / cyc + g.id * 0.37, i = Math.floor(t), f = t - i;
  const a = cps[((i % n) + n) % n], b = cps[(((i + 1) % n) + n) % n];
  const flying = !night && f > rest / cyc;
  for (const m of g.members) {
    const k = A.members[m].rank;
    if (!flying) {
      // in the copse's crowns
      const ang = k * 2.39996, rr = 2 + 3 * Math.sqrt(k / g.members.length);
      put(m, a[0] + Math.cos(ang) * rr, a[1] + Math.sin(ang) * rr, a[2] + 1.5 * Math.sin(k * 1.7), ang, APOSE.PERCH, 0, 1);
      continue;
    }
    const q = (f - rest / cyc) / (fly / cyc), e = q * q * (3 - 2 * q);
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const bow = Math.sin(q * Math.PI);
    const ox = 4 * Math.sin(minutes * 1.7 + k * 2.1) + Math.cos(k * 2.39996) * 3 * Math.sqrt(k + 1) * 0.6, oz = 4 * Math.cos(minutes * 1.3 + k * 1.3) + Math.sin(k * 2.39996) * 3 * Math.sqrt(k + 1) * 0.6;
    const x = a[0] + dx * e - dz / L * bow * 25 + ox * bow, z = a[1] + dz * e + dx / L * bow * 25 + oz * bow;
    let y = a[2] + (b[2] - a[2]) * e + bow * (18 + 3 * Math.sin(k)) + 1.5 * Math.sin(minutes * 2 + k);
    // (over a rise between the copses they keep clear of the ground)
    const K = A.world.kit, top = K ? Math.max(kitTop(K, x, z, 1e9), kitTop(K, x + 0.7, z, 1e9), kitTop(K, x - 0.7, z, 1e9), kitTop(K, x, z + 0.7, 1e9), kitTop(K, x, z - 0.7, 1e9)) : -Infinity;
    y = Math.max(y, groundAt(A.world.terrain, x, z) + 4 + 8 * bow, top + 2);
    put(m, x, z, y, Math.atan2(dx, dz), APOSE.FLY, (minutes * 40 + k * 0.37) % 1, 1, 1);
  }
}

export { BIRDS };
