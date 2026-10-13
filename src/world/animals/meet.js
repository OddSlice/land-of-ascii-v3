// Meetings (phase 4b), as people's (src/world/people/meet.js): an animal
// cannot remember being pushed, so where two come too close, or one and a
// walker (you or a person), the one who gives way is moved a little aside,
// by an amount that is a function of the positions alone. When the cause
// goes, so does the offset.
//
// An animal's body is a capsule along its facing: two circles of its radius
// at its length's ends. The later of two (by member order) moves away from
// the other by their overlap if the walking rules allow it there, else the
// earlier does, else both a half; in later rounds a little further and to
// the side, so nobody is left stuck in a corner of a fold.
import { AS, A, APOSE, KIND, SPEC } from './kinds.js';
import { bodyBlocked } from '../kit.js';

const WALKER_R = 0.3;
const TURNS = [0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5];
// (the kinds that share the ground; birds in the air and perched, and ducks
// on the water among themselves only)
const ground = (pose, kind) => pose !== APOSE.FLY && pose !== APOSE.PERCH && pose !== APOSE.HIDDEN && kind !== KIND.GULL && kind !== KIND.CROW && kind !== KIND.FINCH && kind !== KIND.KITE;

// the capsule of animal o: [ax, az, bx, bz, r]
export function capsule(st, o, out) {
  const sp = SPEC[st[o + A.KIND]], s = st[o + A.SCALE] || 1, r = sp.r * s * 0.8;
  const h = Math.max(0, sp.len * s / 2 - r), yaw = st[o + A.YAW], fx = Math.sin(yaw) * h, fz = Math.cos(yaw) * h;
  const x = st[o + A.X], z = st[o + A.Z];
  out[0] = x - fx; out[1] = z - fz; out[2] = x + fx; out[3] = z + fz; out[4] = r;
  return out;
}

// closest points of two segments: the distance and the direction (from b to a)
function segDist(a, b, out) {
  const d1x = a[2] - a[0], d1z = a[3] - a[1], d2x = b[2] - b[0], d2z = b[3] - b[1];
  const rx = a[0] - b[0], rz = a[1] - b[1];
  const aa = d1x * d1x + d1z * d1z, ee = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  let s = 0, t = 0;
  if (aa <= 1e-9 && ee <= 1e-9) { s = t = 0; }
  else if (aa <= 1e-9) { t = Math.max(0, Math.min(1, f / ee)); }
  else {
    const c = d1x * rx + d1z * rz;
    if (ee <= 1e-9) { s = Math.max(0, Math.min(1, -c / aa)); }
    else {
      const bb = d1x * d2x + d1z * d2z, den = aa * ee - bb * bb;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (bb * f - c * ee) / den)) : 0;
      t = (bb * s + f) / ee;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / aa)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (bb - c) / aa)); }
    }
  }
  const px = a[0] + d1x * s, pz = a[1] + d1z * s, qx = b[0] + d2x * t, qz = b[1] + d2z * t;
  const dx = px - qx, dz = pz - qz, d = Math.hypot(dx, dz);
  out[0] = d; out[1] = d > 1e-6 ? dx / d : 1; out[2] = d > 1e-6 ? dz / d : 0;
  return out;
}

// How far two animals' bodies overlap (positive: they do).
export function overlap(st, oi, oj) {
  const a = capsule(st, oi, CA), b = capsule(st, oj, CB);
  const r = segDist(a, b, SD);
  return a[4] + b[4] - r[0];
}
const CA = [0, 0, 0, 0, 0], CB = [0, 0, 0, 0, 0], SD = [0, 0, 0];

// Move the n states in st for the meetings now. `walkers`: [x, z, feet, ...]
// (you first, then the people outdoors); `p`: a Player for the walking rules.
// Returns how many pairs were still too close at the end (the tools check it).
// `focus` ({ x, z, r } or null): only the animals within r of (x, z) take
// part (the game passes you and the distance past which a small overlap
// cannot be seen; the tools pass null: all).
export function settle(st, n, walkers, p, focus = null) {
  // (clear by the walking rules, and its own body clear of every shape,
  // however low: a rail, a log)
  const free = (o, x, z) => {
    if (st[o + A.POSE] === APOSE.SWIM) return true;
    const sp = SPEC[st[o + A.KIND]], s = st[o + A.SCALE] || 1, h = Math.max(0, sp.len * s / 2 - sp.r * s * 0.8);
    const fx = Math.sin(st[o + A.YAW]) * h, fz = Math.cos(st[o + A.YAW]) * h, y = st[o + A.Y];
    const lo = y + 0.12, hi = y + Math.max(0.15, sp.back * s * (st[o + A.POSE] === APOSE.LIE ? 0.5 : 0.9)), r = sp.r * s * 0.6;
    // (and, but for ducks, out of water deeper than a puddle)
    const T = p.world.terrain, wet = (bx, bz) => { const j = Math.round(bz) * T.NN + Math.round(bx); return T.wWater[j] > 127 && T.levels[0].H[j] - T.ground[j] > 0.15; };
    const body = (bx, bz) => !(p.kit && bodyBlocked(p.kit, bx, bz, lo, hi, r)) && (st[o + A.KIND] === KIND.DUCK || !wet(bx, bz));
    // (the walking rules once, at the middle: walls, trunks, the map's edge)
    return body(x, z) && !p.blocked(x, z, y) && (h <= 0 || (body(x + fx, z + fz) && body(x - fx, z - fz)));
  };
  const tryMove = (o, dx, dz) => {
    const x = Math.fround(st[o + A.X] + dx), z = Math.fround(st[o + A.Z] + dz);
    if (!free(o, x, z)) return false;
    st[o + A.X] = x; st[o + A.Z] = z;
    return true;
  };
  // the ones that take part, by 4 m cells
  const idx = [];
  for (let i = 0; i < n; i++) {
    const o = i * AS;
    if (!ground(st[o + A.POSE], st[o + A.KIND])) continue;
    if (focus && Math.abs(st[o + A.X] - focus.x) + Math.abs(st[o + A.Z] - focus.z) > focus.r) continue;
    idx.push(i);
  }
  // ---- with the shapes: one standing in something steps out of it ----
  for (const i of idx) {
    const o = i * AS;
    if (free(o, st[o + A.X], st[o + A.Z])) continue;
    let done = false;
    for (let d = 0.3; d <= 1.5 && !done; d += 0.3) for (let k = 0; k < 8 && !done; k++) {
      const ang = k * Math.PI / 4 + i * 0.7;
      done = tryMove(o, Math.sin(ang) * d, Math.cos(ang) * d);
    }
  }
  // ---- with walkers ----
  for (const i of idx) {
    const o = i * AS, c = capsule(st, o, CA);
    for (let k = 0; k < walkers.length; k += 3) {
      if (Math.abs(walkers[k + 2] - st[o + A.Y]) > 1.6) continue;
      CB[0] = CB[2] = walkers[k]; CB[1] = CB[3] = walkers[k + 1];
      const r = segDist(c, CB, SD), ov = c[4] + WALKER_R - r[0];
      if (ov <= 0) continue;
      const push = ov + 0.02;
      if (!tryMove(o, SD[1] * push, SD[2] * push)) tryMove(o, -SD[2] * push, SD[1] * push) || tryMove(o, SD[2] * push, -SD[1] * push);
      capsule(st, o, CA);
    }
  }
  // ---- with each other ----
  let left = 0;
  for (let round = 0; round < 5; round++) {
    left = 0;
    let moved = false;
    const side = round >= 2 ? 0.6 : 0;
    for (let a = 0; a < idx.length; a++) {
      const oi = idx[a] * AS;
      for (let b = a + 1; b < idx.length; b++) {
        const oj = idx[b] * AS;
        if (Math.abs(st[oi + A.X] - st[oj + A.X]) > 3 || Math.abs(st[oi + A.Z] - st[oj + A.Z]) > 3) continue;
        if (Math.abs(st[oi + A.Y] - st[oj + A.Y]) > 1.2) continue;
        const ca = capsule(st, oj, CA), cb = capsule(st, oi, CB), r = segDist(ca, cb, SD), ov = ca[4] + cb[4] - r[0];
        if (ov <= 0) continue;
        const push = ov + 0.02 + round * 0.04, ux = SD[1], uz = SD[2];
        const sx = -uz * side * push, sz = ux * side * push;
        if (tryMove(oj, ux * push + sx, uz * push + sz) || tryMove(oi, -ux * push - sx, -uz * push - sz)) { moved = true; continue; }
        if (tryMove(oj, ux * push / 2, uz * push / 2) && tryMove(oi, -ux * push / 2, -uz * push / 2)) { moved = true; continue; }
        // (hemmed in: the later one tries round the other, a little further)
        let found = false;
        for (const ang of TURNS) {
          const c = Math.cos(ang), sn = Math.sin(ang), q = push * 1.3;
          if (tryMove(oj, (ux * c - uz * sn) * q, (uz * c + ux * sn) * q)) { found = true; break; }
        }
        if (found) { moved = true; continue; }
        // (turned along each other: the later one faces the earlier's way)
        const y0 = st[oj + A.YAW];
        st[oj + A.YAW] = st[oi + A.YAW];
        if (overlap(st, oi, oj) <= 0 && free(oj, st[oj + A.X], st[oj + A.Z])) { moved = true; continue; }
        st[oj + A.YAW] = y0;
        left++;
      }
    }
    if (!moved) break;
  }
  return left;
}
