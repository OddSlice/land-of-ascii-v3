// Sites the generator chooses and records for later phases: a fort site on a
// rise near the main lake, three village sites on flat ground near water,
// four viewpoints on high ground with long views, and the spawn, composed as
// a first view: on a road, on a low rise, facing the main lake with forest to
// one side and the range beyond. All of it is found from the data, so the
// same code works on any seed.
import { SCALE } from '../scale.js';
import { CG, KIND } from './water.js';
import { fieldAt } from './plants.js';
import { hash2, smoothstep } from '../noise.js';

const SEA = SCALE.sea;
const TAU = Math.PI * 2;

export function heightAt(H, N, x, z) {
  const NN = N + 1;
  const u = Math.max(0, Math.min(N - 1e-6, x)), w = Math.max(0, Math.min(N - 1e-6, z));
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0, j = k0 * NN + i0;
  return H[j] + (H[j + 1] - H[j]) * fx + (H[j + NN] - H[j]) * fz + (H[j] - H[j + 1] - H[j + NN] + H[j + NN + 1]) * fx * fz;
}

// Mean height on rings between r0 and r1 round a point.
function ringMean(H, N, x, z, r0, r1) {
  let s = 0, n = 0;
  for (let r = r0; r <= r1 + 1e-6; r += (r1 - r0) / 2 || 1) {
    for (let a = 0; a < 16; a++) { s += heightAt(H, N, x + Math.cos(a / 16 * TAU) * r, z + Math.sin(a / 16 * TAU) * r); n++; }
  }
  return s / n;
}

// Is the straight line between two points clear of the ground?
export function clearLine(H, N, x0, z0, y0, x1, z1, y1) {
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(2, Math.ceil(d / 6));
  for (let q = 1; q < steps; q++) {
    const f = q / steps;
    if (heightAt(H, N, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f) > y0 + (y1 - y0) * f - 0.2) return false;
  }
  return true;
}

// Lake shore points: coarse nodes of a lake next to a node that is not.
export function shoreOf(lakeId, nn, L) {
  const out = [];
  for (let k = 1; k < nn - 1; k++) for (let i = 1; i < nn - 1; i++) {
    const c = k * nn + i;
    if (lakeId[c] !== L) continue;
    if (lakeId[c - 1] !== L || lakeId[c + 1] !== L || lakeId[c - nn] !== L || lakeId[c + nn] !== L) out.push([i * CG, k * CG]);
  }
  return out;
}

const range = (H, N, x, z, rx, rz) => {
  let lo = Infinity, hi = -Infinity;
  for (let dz = -rz; dz <= rz; dz += Math.max(1, rz / 2)) for (let dx = -rx; dx <= rx; dx += Math.max(1, rx / 4)) {
    const h = heightAt(H, N, x + dx, z + dz); if (h < lo) lo = h; if (h > hi) hi = h;
  }
  return hi - lo;
};

// The fort site: on a rise 100-450 m from the main lake, where the wall
// (along x) can stand with modest levelling, with the lake in view.
export function chooseFort(ctx, avoid) {
  const { H, N, kind, wetDist, frame, F, thr, lake, shore } = ctx;
  const NN = N + 1, P = {}, W = SCALE.wall.length / 2;
  const why = { wet: 0, dist: 0, frame: 0, forest: 0, prom: 0, spread: 0 };
  ctx.why = why;
  const pick = shore.filter((_, q) => q % Math.max(1, Math.floor(shore.length / 24)) === 0);
  const lx = Math.round(lake.x / 8) * 8, lz = Math.round(lake.z / 8) * 8;
  // if the land has no such rise, the rules loosen a step at a time
  const STEPS = [{ prom: 2.5, far: 450, spread: 7, g: -120 }, { prom: 1, far: 600, spread: 9, g: -60 }, { prom: -Infinity, far: 800, spread: 12, g: 0 }];
  for (const st of STEPS) {
    let best = null;
    for (let z = Math.max(80, lz - st.far - 150); z <= Math.min(N - 80, lz + st.far + 150); z += 8) {
      for (let x = Math.max(104, lx - st.far - 150); x <= Math.min(N - 104, lx + st.far + 150); x += 8) {
        const j = z * NN + x;
        if (kind[j] !== KIND.NONE || wetDist[j] < 25) { why.wet++; continue; }
        if (avoid.some((v) => Math.hypot(v.x - x, v.z - z) < 220)) continue;
        let dl = Infinity;
        for (const [sx, sz] of shore) { const d = Math.hypot(sx - x, sz - z); if (d < dl) dl = d; }
        if (dl < 100 || dl > st.far) { why.dist++; continue; }
        frame.at(x, z, P);
        if (P.g > st.g || P.c < 150) { why.frame++; continue; }
        const f = fieldAt(F, x, z);
        if (f === f && f > thr - 0.05) { why.forest++; continue; }
        const h = H[j];
        const prom = h - ringMean(H, N, x, z, 60, 160);
        if (prom < st.prom) { why.prom++; continue; }
        const spread = range(H, N, x, z, W + 6, 12);
        if (spread > st.spread) { why.spread++; continue; }
        let seen = 0;
        for (const [sx, sz] of pick) if (clearLine(H, N, x, z, h + 7, sx, sz, lake.level + 0.3)) seen++;
        const score = Math.min(prom, 10) + 6 * seen / pick.length - Math.abs(dl - 220) / 60 - 0.4 * spread;
        if (!best || score > best.score) best = { x, z, score, prom, dl };
      }
    }
    if (best) return best;
  }
  return null;
}

// Three village sites: flat ground 25-160 m from a lake or river, out of
// the forest, well apart from each other and the fort. If the land does not
// give three, the rules loosen a step at a time (rougher ground, farther
// from fresh water or by the sea, closer together).
export function chooseVillages(ctx, avoid) {
  const { H, N, kind, freshDist, seaDist, frame, F, thr, seed } = ctx;
  const NN = N + 1, P = {};
  const out = [];
  const STEPS = [{ spread: 2.2, fresh: 160, sea: false, apart: 450 }, { spread: 3.5, fresh: 250, sea: true, apart: 450 }, { spread: 5, fresh: 255, sea: true, apart: 350 }];
  for (const st of STEPS) {
    if (out.length >= 3) break;
    const cands = [];
    for (let z = 80; z <= N - 80; z += 8) {
      for (let x = 80; x <= N - 80; x += 8) {
        const j = z * NN + x;
        if (kind[j] !== KIND.NONE) continue;
        const fd = freshDist[j], sd = seaDist[j];
        const near = (fd >= 25 && fd <= st.fresh) || (st.sea && sd >= 40 && sd <= 150);
        if (!near) continue;
        frame.at(x, z, P);
        if (P.g > -80 || P.c < 120) continue;
        const f = fieldAt(F, x, z);
        if (f === f && f > thr - 0.04) continue;
        const spread = range(H, N, x, z, 40, 40);
        if (spread > st.spread) continue;
        const d = Math.min(fd, st.sea ? sd : 255);
        cands.push({ x, z, score: st.spread - spread + 1 - Math.abs(d - 70) / 120 + 0.3 * hash2(x, z, seed + 801), spread, water: d });
      }
    }
    cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
    for (const c of cands) {
      if (out.length >= 3) break;
      if (avoid.some((v) => Math.hypot(c.x - v.x, c.z - v.z) < 350)) continue;
      if (out.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < st.apart)) continue;
      out.push(c);
    }
  }
  return out;
}

// How far one can see from (x, z) at eye height, in each of 16 directions,
// before the ground rises above the eye's level (up to the view distance).
function views(Hc, nn, x, z, eye) {
  const out = new Float32Array(16);
  for (let a = 0; a < 16; a++) {
    const dx = Math.cos(a / 16 * TAU), dz = Math.sin(a / 16 * TAU);
    let d = 16;
    for (; d < SCALE.viewDist; d += 16) {
      const i = Math.round((x + dx * d) / CG), k = Math.round((z + dz * d) / CG);
      if (i < 0 || k < 0 || i >= nn || k >= nn) { d = SCALE.viewDist; break; }
      if (Hc[k * nn + i] > eye) break;
    }
    out[a] = Math.min(d, SCALE.viewDist);
  }
  return out;
}

// Four viewpoints: high ground, out of the snow, with long views.
export function chooseViewpoints(ctx, avoid) {
  const { H, N, kind, Hc, nn } = ctx;
  const NN = N + 1;
  const cands = [];
  for (let z = 64; z <= N - 64; z += 16) {
    for (let x = 64; x <= N - 64; x += 16) {
      const j = z * NN + x;
      if (kind[j] !== KIND.NONE) continue;
      const h = H[j];
      if (h > SEA + 230 || h < SEA + 15) continue;
      const sx = (H[j + 2] - H[j - 2]) / 4, sz = (H[j + 2 * NN] - H[j - 2 * NN]) / 4;
      if (Math.hypot(sx, sz) > 0.45) continue;
      const prom = h - ringMean(H, N, x, z, 120, 320);
      if (prom < 6) continue;
      const v = views(Hc, nn, x, z, h + SCALE.eye);
      let open = 0;
      for (let a = 0; a < 16; a++) open += v[a] / SCALE.viewDist;
      // look the way that sees farthest, leaning toward the middle of the map
      let yaw = 0, bestA = -Infinity;
      for (let a = 0; a < 16; a++) {
        const dx = Math.cos(a / 16 * TAU), dz = Math.sin(a / 16 * TAU);
        const toMid = (dx * (N / 2 - x) + dz * (N / 2 - z)) / (Math.hypot(N / 2 - x, N / 2 - z) || 1);
        const s = v[a] + 400 * toMid;
        if (s > bestA) { bestA = s; yaw = Math.atan2(dx, dz); }
      }
      cands.push({ x, z, h, score: open + prom / 12, open, prom, yaw: yaw * 180 / Math.PI });
    }
  }
  cands.sort((a, b) => b.score - a.score || a.x - b.x || a.z - b.z);
  const out = [];
  for (const c of cands) {
    if (out.length >= 4) break;
    if (out.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < 450)) continue;
    if (avoid.some((v) => Math.hypot(v.x - c.x, v.z - c.z) < 200)) continue;
    out.push(c);
  }
  return out;
}

// The brow of a hill (phase 2a): near (x0, z0), on dry, walkable ground no
// more than `drop` metres lower, the spot where the ground falls away
// soonest in the direction `yawDeg` looks (the steepest the ground ahead
// rises to, as seen from the eye there, is the least), so the hill's own
// slope does not fill the view. Returns { x, z, h, ahead } (ahead: that
// steepest rise, as a slope).
export function brow(H, N, kind, x0, z0, yawDeg, reach = 90, drop = 18) {
  const NN = N + 1, a = yawDeg * Math.PI / 180, dx = Math.sin(a), dz = Math.cos(a);
  const h0 = heightAt(H, N, x0, z0);
  let best = null;
  for (let r = 0; r <= reach; r += 6) {
    for (let q = 0; q < (r ? 16 : 1); q++) {
      const x = x0 + r * Math.cos(q * Math.PI / 8), z = z0 + r * Math.sin(q * Math.PI / 8);
      if (x < 8 || z < 8 || x > N - 8 || z > N - 8 || kind[Math.round(z) * NN + Math.round(x)] !== KIND.NONE) continue;
      const h = heightAt(H, N, x, z);
      if (h < h0 - drop) continue;
      const sl = Math.hypot(heightAt(H, N, x + 2, z) - heightAt(H, N, x - 2, z), heightAt(H, N, x, z + 2) - heightAt(H, N, x, z - 2)) / 4;
      if (sl > 0.6) continue;
      const eye = h + SCALE.eye;
      let ahead = -Infinity;
      for (let t = 6; t <= 320; t += 6) {
        const s = (heightAt(H, N, x + dx * t, z + dz * t) - eye) / t;
        if (s > ahead) ahead = s;
      }
      // (falling away matters most; then staying high and near the hilltop)
      const score = -ahead * 100 + (h - h0) * 0.04 - r * 0.01;
      if (!best || score > best.score) best = { x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2, h, ahead, score };
    }
  }
  return best || { x: x0, z: z0, h: h0, ahead: 0 };
}

// Is the line between two points clear of the ground and of the forest
// (where the forest field is past the threshold, trees count as 15 m tall)?
function clearView(ctx, x0, z0, y0, x1, z1, y1) {
  const { H, N, F, thr } = ctx;
  const d = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(2, Math.ceil(d / 8));
  for (let q = 1; q < steps; q++) {
    const f = q / steps, x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, y = y0 + (y1 - y0) * f;
    const g = heightAt(H, N, x, z);
    if (g > y - 0.2) return false;
    if (q > 1 && g + 15 > y) { const ff = fieldAt(F, x, z); if (ff === ff && ff > thr) return false; }
  }
  return true;
}

// Spawn candidates, best first: the points near the main lake that give the
// best first view.
// It stands a little above its surroundings, out of the trees, with the
// lake in front, seen as a sheet of water and not a sliver, the land rising
// toward the range beyond it, and a stand of forest off to one side. The
// roads then start from it.
export function chooseSpawn(ctx, avoid) {
  // if the land gives no such view, the rules loosen a step at a time:
  // lower, farther from the lake, not facing the range, any ground at all
  for (const st of [{ up: 3, far: 650, nv: 4, range: true, prom: 0.5, g: -150 }, { up: 1, far: 900, nv: 2, range: false, prom: -Infinity, g: -60 },
    { up: -Infinity, far: 1400, nv: 1, range: false, prom: -Infinity, g: Infinity }]) {
    const out = spawnsWith(ctx, avoid, st);
    if (out.length) return out;
  }
  return [];
}

function spawnsWith(ctx, avoid, st) {
  const { H, N, kind, wetDist, frame, F, thr, lake, lakePts } = ctx;
  const NN = N + 1, P = {};
  const ROW = 2 * Math.tan(Math.PI / 6) / 112;     // a row's angle at the default density
  const all = [];
  const lx = Math.round(lake.x / 16) * 16, lz = Math.round(lake.z / 16) * 16;
  for (let z = Math.max(64, lz - 800); z <= Math.min(N - 64, lz + 800); z += 16) {
    for (let x = Math.max(64, lx - 800); x <= Math.min(N - 64, lx + 800); x += 16) {
      const j = z * NN + x;
      if (kind[j] !== KIND.NONE || wetDist[j] < 30) continue;
      const h = H[j], eye = h + SCALE.eye;
      if (eye - lake.level < st.up) continue;
      if (Math.hypot(H[j + 3] - H[j - 3], H[j + 3 * NN] - H[j - 3 * NN]) / 6 > 0.12) continue;
      if (avoid.some((v) => Math.hypot(v.x - x, v.z - z) < 120)) continue;
      const f0 = fieldAt(F, x, z);
      if (f0 === f0 && f0 > thr - 0.05) continue;
      frame.at(x, z, P);
      if (P.g > st.g || P.c < 150) continue;
      let near = Infinity;
      for (const [px, pz] of lakePts) near = Math.min(near, Math.hypot(px - x, pz - z));
      if (near < 100 || near > st.far) continue;
      // the lake as seen from here: its visible points' angles below the
      // horizon and to either side
      let aMin = Infinity, aMax = -Infinity, sx = 0, sz = 0, nv = 0;
      for (const [px, pz] of lakePts) {
        if (!clearView(ctx, x, z, eye, px, pz, lake.level + 0.2)) continue;
        const d = Math.hypot(px - x, pz - z), a = (eye - lake.level) / d;
        if (a < aMin) aMin = a; if (a > aMax) aMax = a;
        sx += (px - x) / d; sz += (pz - z) / d; nv++;
      }
      if (nv < st.nv) continue;
      const fl = Math.hypot(sx, sz), fx = sx / fl, fz = sz / fl;
      let wide = 0;
      for (const [px, pz] of lakePts) {
        const d = Math.hypot(px - x, pz - z), c = ((px - x) * fx + (pz - z) * fz) / d;
        if (c > 0.6) wide = Math.max(wide, Math.acos(Math.min(1, c)));
      }
      const rows = (aMax - aMin) / ROW;
      // the range beyond: looking this way, the mountains rise within view
      let toRange = 0;
      for (let d = 100; d <= 2000; d += 50) {
        const px = x + fx * d, pz = z + fz * d;
        if (px < 0 || pz < 0 || px > N || pz > N) break;
        if (frame.at(px, pz, P).g > 150) { toRange = 1 - d / 2600; break; }
      }
      if (toRange <= 0 && st.range) continue;
      // a low rise
      const prom = h - ringMean(H, N, x, z, 40, 120);
      if (prom < st.prom) continue;
      // forest to one side and not ahead
      const sector = (a0, a1, r0, r1) => {
        let n = 0, t = 0;
        for (let a = a0; a <= a1; a += 10) for (let r = r0; r <= r1; r += 30) {
          const ang = Math.atan2(fx, fz) + a * Math.PI / 180;
          const f = fieldAt(F, x + Math.sin(ang) * r, z + Math.cos(ang) * r);
          t++; if (f === f && f > thr) n++;
        }
        return n / t;
      };
      const side = Math.max(sector(-80, -30, 50, 260), sector(30, 80, 50, 260));
      const ahead = sector(-20, 20, 30, 260);
      // what the water mirrors: the ground beyond the lake, seen from the
      // lake's middle, should stay low, or the lake shows the far shore's
      // grass and not the sky, and reads as meadow
      let mid = 0;
      for (const [px, pz] of lakePts) mid += Math.hypot(px - x, pz - z);
      mid /= lakePts.length;
      let refl = 0;
      const mx = x + fx * mid, mz = z + fz * mid;
      for (let d = 60; d <= 450; d += 20) refl = Math.max(refl, (heightAt(H, N, mx + fx * d, mz + fz * d) - lake.level) / d);
      // (a low rise: a few metres, not a hilltop)
      const score = 1.5 * Math.min(rows, 10) + 8 * Math.min(1, wide / 0.6) + Math.min(prom, 6) - 0.8 * Math.max(0, prom - 9) + 4 * Math.min(1, toRange) + 6 * Math.min(1, side * 3) - 10 * ahead
        - 12 * smoothstep(0.015, 0.06, refl);
      all.push({ x, z, yaw: Math.atan2(fx, fz) * 180 / Math.PI, score, rows, wide, prom, side, ahead, toRange, refl });
    }
  }
  // the best, and the next best a little apart from each other
  all.sort((p, q) => q.score - p.score || p.x - q.x || p.z - q.z);
  const out = [];
  for (const c of all) {
    if (out.length >= 10) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 48)) continue;
    out.push(c);
  }
  return out;
}
