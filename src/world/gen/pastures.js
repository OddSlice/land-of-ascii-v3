// Pastures and folds (phase 4b; src/world/gen/village.js): which field
// blocks become pasture, and the fold beside a barn.
import { SCALE } from '../scale.js';
import { hash2 } from '../noise.js';
import { KIND } from './water.js';
import { heightAt } from './sites.js';
import { rect, overlaps, over } from './placing.js';

const K = SCALE.kit;

// Which of a village's field blocks become pasture (all grass, fenced all
// round): one, or two in a village of more than a dozen houses, nearest its
// barn (or its centre); and, at a village by water, a field for its cattle,
// the block nearest the water. Marks the blocks; returns their ids.
export function choosePastures(q, rec, blocks, water, cattle) {
  if (blocks.length < 2) return { sheep: [], cattle: null };
  const A = rec.barns[0] ? [rec.barns[0].x, rec.barns[0].z] : [rec.centre.x, rec.centre.z];
  const byNear = blocks.slice().sort((a, b) => Math.hypot(a.x - A[0], a.z - A[1]) - Math.hypot(b.x - A[0], b.z - A[1]) || a.id - b.id);
  const want = Math.min(blocks.length - 1, rec.houses.length > 12 ? 2 : 1);
  const sheep = byNear.slice(0, want);
  let cow = null;
  if (cattle && water && blocks.length - want >= 2) {
    const rest = blocks.filter((b) => !sheep.includes(b));
    cow = rest.sort((a, b) => Math.hypot(a.x - water.x, a.z - water.z) - Math.hypot(b.x - water.x, b.z - water.z) || a.id - b.id)[0];
  }
  for (const b of [...sheep, ...(cow ? [cow] : [])]) { b.pasture = b === cow ? 'cattle' : 'sheep'; b.main = 4; for (const st of b.strips) st.kind = 4; }
  return { sheep: sheep.map((b) => b.id), cattle: cow ? cow.id : null };
}

// A fold for a flock: a small square of fence pieces beside a barn (or, if
// there is no room, in the pasture's corner by its gate), its gate facing
// the pasture's. Returns { rect, pieces, gate (outside), inside } or null.
export function planFold(q, k, rec, pas, gate, env) {
  const { H, N, kind, seed } = env, NN = N + 1;
  const F = SCALE.animals.fold, gAt = (x, z) => heightAt(H, N, x, z);
  const wetAt = (x, z) => { const i = Math.round(x), kk = Math.round(z); return i < 0 || kk < 0 || i > N || kk > N || kind[kk * NN + i] !== KIND.NONE; };
  const tryAt = (x, z, a) => {
    const R = rect(x, z, a, F.hw, F.hd);
    if (env.ways.clear(x, z, 16) < Math.hypot(F.hw, F.hd) + 1.5) return null;
    for (const B of env.built) if (overlaps(R, B, 2)) return null;
    for (const B of env.fields) if (overlaps(R, B, 1.5)) return null;
    let lo = Infinity, hi = -Infinity;
    for (const [px, pz] of over(R, 0, 1)) { if (wetAt(px, pz)) return null; const g = gAt(px, pz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    return hi - lo < F.fall ? R : null;
  };
  let R = null;
  const anchors = rec.barns.length ? rec.barns.map((b) => [b.x, b.z, b.a, Math.hypot(b.w, b.d)]) : [];
  anchors.push([gate[0], gate[1], pas.a, 2]);
  outer: for (const [ax, az, aa, ar] of anchors) {
    for (const d of [ar + F.hw + 3, ar + F.hw + 6, ar + F.hw + 9]) {
      for (let t = 0; t < 12; t++) {
        const ang = aa + t * Math.PI / 6 + hash2(q * 7 + k, t, seed + 9611) * 0.3;
        R = tryAt(ax + Math.cos(ang) * d, az + Math.sin(ang) * d, aa);
        if (R) break outer;
      }
    }
  }
  // (no room: the pasture's corner nearest its gate, inside it)
  let inside = false;
  if (!R) {
    const L = pas.L - F.hw - 1.5, W = pas.W - F.hd - 1.5;
    let best = null;
    for (const [su, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = pas.x + su * L * pas.ca - sw * W * pas.sa, z = pas.z + su * L * pas.sa + sw * W * pas.ca;
      const d = Math.hypot(x - gate[0], z - gate[1]);
      if (!best || d < best[0]) best = [d, x, z];
    }
    R = rect(best[1], best[2], pas.a, F.hw, F.hd); inside = true;
  }
  // the four sides; the gate on the one facing the pasture's gate
  const to = inside ? [pas.x, pas.z] : gate;
  const sides = [[[-1, 1], [1, 1], [0, 1]], [[1, -1], [-1, -1], [0, -1]], [[1, 1], [1, -1], [1, 0]], [[-1, -1], [-1, 1], [-1, 0]]];
  const W2 = (u, w) => [R.x + u * R.ca - w * R.sa, R.z + u * R.sa + w * R.ca];
  let gs = 0, bd = -Infinity;
  sides.forEach(([, , n], i) => { const [ox, oz] = W2(n[0] * F.hw, n[1] * F.hd); const dd = ((to[0] - R.x) * (ox - R.x) + (to[1] - R.z) * (oz - R.z)) / (Math.hypot(ox - R.x, oz - R.z) || 1); if (dd > bd) { bd = dd; gs = i; } });
  const pieces = [];
  let gateOut = null, gateIn = null;
  sides.forEach(([a, b, n], i) => {
    const A = [a[0] * F.hw, a[1] * F.hd], B = [b[0] * F.hw, b[1] * F.hd], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const run = (t0, t1) => {
      const pts = [], m = Math.max(1, Math.round((t1 - t0) / K.fence.span));
      for (let j = 0; j <= m; j++) { const t = t0 + (t1 - t0) * j / m, u = A[0] + (B[0] - A[0]) * t / len, w = A[1] + (B[1] - A[1]) * t / len, [x, z] = W2(u, w); pts.push([x, z, gAt(x, z)]); }
      return pts;
    };
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) + R.a, sd = 3700 + q * 40 + k * 10 + i * 2;
    if (i !== gs) { pieces.push({ kind: 'fence', pts: run(0, len), angle: ang, seed: sd }); return; }
    const g0 = len / 2 - F.gate / 2, g1 = len / 2 + F.gate / 2, P0 = run(0, g0), P1 = run(g1, len);
    pieces.push({ kind: 'fence', pts: P0, angle: ang, seed: sd }, { kind: 'fence', pts: P1, angle: ang, seed: sd + 1 });
    pieces.push({ kind: 'gateposts', pts: [P0[P0.length - 1], P1[0]], angle: ang, seed: sd + 2 });
    const mu = (A[0] + B[0]) / 2, mw = (A[1] + B[1]) / 2, l = Math.hypot(mu, mw) || 1;
    gateOut = W2(mu + mu / l * 2.2, mw + mw / l * 2.2); gateIn = W2(mu - mu / l * 1.6, mw - mw / l * 1.6);
  });
  return { rect: R, pieces, gate: gateOut, gateIn, inside };
}
