// Walking under the player's own rules (phase 4a), for people's routes and
// for the tools: a step from (x, z) with the feet at `ft`, in a direction,
// over a distance, as the player would take it (up nothing steeper than the
// player can climb, up a building's steps, down anything; never through a
// shape), and a short search round what is in the way.
import { SCALE } from '../scale.js';
import { groundAt } from '../objects.js';

const STEP = 0.6, SUB = 0.25;

// (x, z, ft, dx, dz, dist) -> [x, z, ft] at the end, or null if blocked.
export function makeMove(world, p) {
  const T = world.terrain;
  return (x, z, ft, dx, dz, dist) => {
    const n = Math.max(1, Math.ceil(dist / SUB - 1e-9)), h = dist / n;
    for (let s = 0; s < n; s++) {
      const nx = x + dx * h, nz = z + dz * h;
      const gg = p.supportAt(nx, nz, ft), rise = gg - ft;
      const onGround = gg <= groundAt(T, nx, nz) + 1e-3;
      if (onGround ? rise > SCALE.climb * h + 1e-3 : rise > STEP) return null;
      const land = gg < ft - 0.05 ? p.landAt(nx, nz, ft) : gg;
      if (p.blocked(nx, nz, Math.max(gg, ft)) || (gg < ft - 0.05 && p.blocked(nx, nz, land))) return null;
      x = nx; z = nz; ft = land;
    }
    return [x, z, ft];
  };
}

// Where the feet rest on the ground at (x, z), or on what stands on it there
// (not on a roof overhead).
export const groundFeet = (world, p, x, z) => p.supportAt(x, z, groundAt(world.terrain, x, z) + 0.3);

// Walk a line of points from the feet at ft0, every `step` metres: the feet's
// height at each sample, or null where it cannot be walked. Returns
// { x, z, y, n } (Float64Arrays) or null.
export function sampleLine(move, pts, ft0, step = 0.5) {
  const xs = [pts[0][0]], zs = [pts[0][1]], ys = [ft0];
  let x = pts[0][0], z = pts[0][1], ft = ft0;
  for (let i = 1; i < pts.length; i++) {
    const tx = pts[i][0], tz = pts[i][1], L = Math.hypot(tx - x, tz - z);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.ceil(L / step)), dx = (tx - x) / L, dz = (tz - z) / L, h = L / n;
    for (let k = 0; k < n; k++) {
      const r = move(x, z, ft, dx, dz, h);
      if (!r) return null;
      [x, z, ft] = r;
      xs.push(x); zs.push(z); ys.push(ft);
    }
  }
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), y: Float64Array.from(ys), n: xs.length };
}

// As sampleLine, but a stretch that cannot be walked is gone round: a way
// to its end (or a few points on) is found on the lattice and walked
// instead. Returns null only if that fails too.
export function sampleRoute(move, pts, ft0, step = 0.5) {
  const xs = [pts[0][0]], zs = [pts[0][1]], ys = [ft0];
  let x = pts[0][0], z = pts[0][1], ft = ft0;
  const walk = (tx, tz) => {
    const L = Math.hypot(tx - x, tz - z);
    if (L < 1e-6) return true;
    const n = Math.max(1, Math.ceil(L / step)), dx = (tx - x) / L, dz = (tz - z) / L, h = L / n;
    const sx = xs.length;
    let cx = x, cz = z, cf = ft;
    for (let k = 0; k < n; k++) {
      const r = move(cx, cz, cf, dx, dz, h);
      if (!r) { xs.length = sx; zs.length = sx; ys.length = sx; return false; }
      [cx, cz, cf] = r;
      xs.push(cx); zs.push(cz); ys.push(cf);
    }
    x = cx; z = cz; ft = cf;
    return true;
  };
  const mark = [0];                       // the sample each point was reached at
  for (let i = 1; i < pts.length; i++) {
    if (walk(pts[i][0], pts[i][1])) { mark[i] = xs.length - 1; continue; }
    // round it: from here, or from a point or two back, to this point or
    // one of the next few
    let ok = false;
    for (let back = 0; back <= 3 && !ok; back++) {
      const from = i - 1 - back;
      if (from < 0) break;
      if (back > 0) { const m = mark[from]; xs.length = m + 1; zs.length = m + 1; ys.length = m + 1; x = xs[m]; z = zs[m]; ft = ys[m]; }
      for (let j = i; j < Math.min(pts.length, i + 6) && !ok; j++) {
        const way = latticeWay(move, [x, z], pts[j], ft, 10, 6000);
        if (!way) continue;
        const keep = xs.length, kx = x, kz = z, kf = ft;
        ok = true;
        for (let k = 1; k < way.length; k++) if (!walk(way[k][0], way[k][1])) { ok = false; break; }
        if (ok) { for (let q = i; q <= j; q++) mark[q] = xs.length - 1; i = j; }
        else { xs.length = keep; zs.length = keep; ys.length = keep; x = kx; z = kz; ft = kf; }
      }
    }
    if (!ok) return null;
  }
  return { x: Float64Array.from(xs), z: Float64Array.from(zs), y: Float64Array.from(ys), n: xs.length };
}

// A way from a to b on a half-metre lattice by the player's rules, within
// `pad` metres of the box round them, expanding at most `cap` lattice
// points: [[x, z], ...] (b last), or null.
export function latticeWay(move, a, b, ft0, pad = 14, cap = 6000) {
  const s = 0.5, x0 = Math.min(a[0], b[0]) - pad, z0 = Math.min(a[1], b[1]) - pad;
  const nx = Math.ceil((Math.abs(a[0] - b[0]) + 2 * pad) / s) + 1, nz = Math.ceil((Math.abs(a[1] - b[1]) + 2 * pad) / s) + 1;
  const key = (i, k) => k * nx + i;
  const si = Math.round((a[0] - x0) / s), sk = Math.round((a[1] - z0) / s), gi = Math.round((b[0] - x0) / s), gk = Math.round((b[1] - z0) / s);
  const N = nx * nz, dist = new Float64Array(N).fill(Infinity), feet = new Float64Array(N), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  // a binary heap of [f, cell]
  const heap = [];
  const push = (f, c) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const c0 = key(si, sk), goal = key(gi, gk);
  dist[c0] = 0; feet[c0] = ft0; push(Math.hypot(gi - si, gk - sk) * s, c0);
  let expanded = 0;
  while (heap.length && expanded < cap) {
    const [, c] = pop();
    if (done[c]) continue;
    done[c] = 1; expanded++;
    if (c === goal) break;
    const ci = c % nx, ck = (c - ci) / nx, cx = x0 + ci * s, cz = z0 + ck * s;
    for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) {
      if (!di && !dk) continue;
      const i = ci + di, k = ck + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const q = key(i, k);
      if (done[q]) continue;
      const L = Math.hypot(di, dk) * s, nd = dist[c] + L;
      if (nd >= dist[q]) continue;
      const r = move(cx, cz, feet[c], di * s / L, dk * s / L, L);
      if (!r) continue;
      dist[q] = nd; feet[q] = r[2]; prev[q] = c;
      push(nd + Math.hypot(gi - i, gk - k) * s, q);
    }
  }
  if (!done[goal]) return null;
  const out = [];
  for (let c = goal; c >= 0; c = prev[c]) out.push([x0 + (c % nx) * s, z0 + Math.floor(c / nx) * s, feet[c]]);
  out.reverse();
  out[0] = [a[0], a[1], ft0]; out[out.length - 1] = [b[0], b[1], out[out.length - 1][2]];
  // only the turning points: a point is kept where the straight line from
  // the last kept one to the next would not be walkable
  const keep = [out[0]];
  for (let i = 1; i < out.length - 1; i++) {
    const p0 = keep[keep.length - 1], p1 = out[i + 1];
    if (!clearLine(move, p0, p1, p0[2])) keep.push(out[i]);
  }
  keep.push(out[out.length - 1]);
  return keep.map((q) => [q[0], q[1]]);
}

// Can the straight line from a to b be walked from the feet at ft?
export function clearLine(move, a, b, ft) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1e-6) return true;
  return !!move(a[0], a[1], ft, (b[0] - a[0]) / L, (b[1] - a[1]) / L, L);
}
