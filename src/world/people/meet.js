// Meetings (phase 4a): a person cannot remember being pushed, so where two
// people, or a person and you, come too close, the one who gives way is moved
// a little aside, or held back along their route, by an amount that is a
// function of the clock and the positions alone. When the cause goes, so
// does the offset: nobody is left off their route.
//
// - People with each other: the later of the two (by id) steps aside, a
//   walker to their right, someone standing away from the other, as far as
//   the walking rules allow there; else the walker waits behind.
// - People with you: a walker coming at you steps round you if there is
//   room, else waits (keeps a metre's gap along the route); everyone near
//   turns their head toward you.
import { FS, S, POSE } from './figure.js';

const GAP = 0.75;            // closer than this, two people make way

// Moves the states in st (n people) for the meetings at this moment. `segs`
// are their plan segments and `along` how far each walker is along its
// route (from stateAt); `you`: { x, z, feet } or null; `p`: a Player for
// the walking rules.
export function adjust(st, n, segs, along, you, p) {
  // clear by the walking rules, and of everyone else (but `skip`)
  const free = (x, z, ft, skip = -1) => {
    if (p.blocked(x, z, ft)) return false;
    if (skip < 0) return true;
    for (let k = 0; k < n; k++) {
      if (k === skip) continue;
      const o = k * FS;
      if (st[o + S.POSE] === POSE.HIDDEN || Math.abs(st[o + S.FEET] - ft) > 1.2) continue;
      if (Math.hypot(st[o + S.X] - x, st[o + S.Z] - z) < GAP - 0.01) return false;
    }
    return true;
  };
  // ---- with you ----
  if (you) {
    for (let i = 0; i < n; i++) {
      const o = i * FS, pose = st[o + S.POSE];
      if (pose === POSE.HIDDEN) continue;
      const dx = you.x - st[o + S.X], dz = you.z - st[o + S.Z], d = Math.hypot(dx, dz);
      if (d > 5 || Math.abs(you.feet - st[o + S.FEET]) > 1.6) continue;
      // the head turns toward you (up to about 60 degrees)
      if (pose !== POSE.SLEEP) {
        let rel = Math.atan2(dx, dz) - st[o + S.YAW];
        while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
        const k = d < 3 ? 1 : (5 - d) / 2;
        st[o + S.HEAD] = Math.max(-1.05, Math.min(1.05, rel)) * k;
      }
      if (pose !== POSE.WALK || d > 2.2) continue;
      const seg = segs[i];
      if (!seg || seg.kind !== 'walk') continue;
      const yaw = st[o + S.YAW], fx = Math.sin(yaw), fz = Math.cos(yaw);
      const ahead = dx * fx + dz * fz, lat = dx * fz - dz * fx;
      if (ahead <= 0 || Math.abs(lat) > 0.95) continue;
      // step round: away from you, as much as you are in the way
      const side = lat > 0 ? -1 : 1, push = 0.8 * (1 - d / 2.2);
      const sx = st[o + S.X] + fz * side * push, sz = st[o + S.Z] - fx * side * push;
      if (free(sx, sz, st[o + S.FEET])) { st[o + S.X] = sx; st[o + S.Z] = sz; continue; }
      // no room (a doorway): wait a metre short of you, along the route
      placeAt(st, o, seg.route, Math.max(0, along[i] - Math.max(0, 1.05 - ahead)));
      st[o + S.PHASE] = 0;
    }
  }
  // ---- with each other ----
  for (let i = 0; i < n; i++) {
    const oi = i * FS;
    if (st[oi + S.POSE] === POSE.HIDDEN || st[oi + S.POSE] === POSE.SLEEP) continue;
    for (let j = i + 1; j < n; j++) {
      const oj = j * FS;
      if (st[oj + S.POSE] === POSE.HIDDEN || st[oj + S.POSE] === POSE.SLEEP) continue;
      if (Math.abs(st[oi + S.FEET] - st[oj + S.FEET]) > 1.6) continue;
      const dx = st[oj + S.X] - st[oi + S.X], dz = st[oj + S.Z] - st[oi + S.Z], d = Math.hypot(dx, dz);
      if (d >= GAP) continue;
      // j makes way (the later one): a walker to its right, else away from i
      let ux, uz;
      if (st[oj + S.POSE] === POSE.WALK) { const y = st[oj + S.YAW]; ux = Math.cos(y); uz = -Math.sin(y); }
      else if (d > 1e-6) { ux = dx / d; uz = dz / d; }
      else { const a = (j * 2.399) % (2 * Math.PI); ux = Math.cos(a); uz = Math.sin(a); }
      const need = GAP - d + 0.05;
      let moved = false;
      // (the first way that is clear: aside, the other side, then round)
      for (let k = 0; k < 8 && !moved; k++) {
        const a = k === 0 ? 0 : k === 1 ? Math.PI : (k - 1) * Math.PI / 3.5;
        const ca = Math.cos(a), sa = Math.sin(a), vx = ux * ca - uz * sa, vz = ux * sa + uz * ca;
        for (const far of [need, need + 0.35]) {
          const sx = st[oj + S.X] + vx * far, sz = st[oj + S.Z] + vz * far;
          if (free(sx, sz, st[oj + S.FEET], j)) { st[oj + S.X] = sx; st[oj + S.Z] = sz; moved = true; break; }
        }
      }
      // (no room for j: i makes way instead, the same ways round)
      if (!moved && st[oi + S.POSE] !== POSE.SIT) {
        for (let k = 0; k < 8 && !moved; k++) {
          const a = k * Math.PI / 4;
          const vx = -ux * Math.cos(a) + uz * Math.sin(a), vz = -uz * Math.cos(a) - ux * Math.sin(a);
          for (const far of [need, need + 0.35]) {
            const sx = st[oi + S.X] + vx * far, sz = st[oi + S.Z] + vz * far;
            if (free(sx, sz, st[oi + S.FEET], i)) { st[oi + S.X] = sx; st[oi + S.Z] = sz; moved = true; break; }
          }
        }
      }
      // (a walker with no room aside waits behind)
      if (!moved && st[oj + S.POSE] === POSE.WALK && segs[j] && segs[j].kind === 'walk') { placeAt(st, oj, segs[j].route, Math.max(0, along[j] - need - 0.3)); st[oj + S.PHASE] = 0; }
    }
  }
}

// Put a walker at distance s along a route.
function placeAt(st, o, R, s) {
  let lo = 0, hi = R.n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.cum[m] <= s) lo = m; else hi = m - 1; }
  const j = Math.min(lo, R.n - 2), L = R.cum[j + 1] - R.cum[j], f = L > 1e-9 ? (s - R.cum[j]) / L : 0;
  st[o + S.X] = R.x[j] + (R.x[j + 1] - R.x[j]) * f; st[o + S.Z] = R.z[j] + (R.z[j + 1] - R.z[j]) * f; st[o + S.FEET] = R.y[j] + (R.y[j + 1] - R.y[j]) * f;
}
