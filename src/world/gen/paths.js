// Footpaths (phase 3b; src/world/gen/village.js): from a village's centre
// to its fields, its water and the nearest viewpoint.
import { SCALE } from '../scale.js';
import { KIND } from './water.js';
import { inPoly } from './fort.js';
import { MinHeap } from './heap.js';

// A footpath from the village's centre to each target, found as the roads
// are but narrow and on a finer (2 m) grid round the village and its
// targets: steeper ground allowed, a shallow river forded, other water
// refused, and every building, fence, wall and the fort kept clear by a
// margin wide enough that a straight step between two clear points cannot
// clip one. Each path leaves from the centre or from a path laid before it,
// nearest targets first. Returns lines of points a metre apart.
const PG = 2, PATH_CLEAR = 1.9;
export function planPaths(rec, targets, env) {
  const { H, N, kind, level } = env, NN = N + 1;
  const C = [rec.centre.x, rec.centre.z];
  const tg = targets.filter((t) => Math.hypot(t[0] - C[0], t[1] - C[1]) < 700);
  if (!tg.length) return [];
  let x0 = C[0], x1 = C[0], z0 = C[1], z1 = C[1];
  for (const t of tg) { x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]); z0 = Math.min(z0, t[1]); z1 = Math.max(z1, t[1]); }
  x0 = Math.max(2, Math.floor((x0 - 40) / PG) * PG); z0 = Math.max(2, Math.floor((z0 - 40) / PG) * PG);
  x1 = Math.min(N - 2, x1 + 40); z1 = Math.min(N - 2, z1 + 40);
  const nx = Math.floor((x1 - x0) / PG) + 1, nz = Math.floor((z1 - z0) / PG) + 1, cells = nx * nz;
  const h = new Float32Array(cells), pen = new Float32Array(cells).fill(1);
  const X = (c) => x0 + (c % nx) * PG, Z = (c) => z0 + Math.floor(c / nx) * PG;
  for (let c = 0; c < cells; c++) {
    const x = X(c), z = Z(c), j = Math.round(z) * NN + Math.round(x);
    h[c] = kind[j] === KIND.NONE ? H[j] : level[j];
    if (kind[j] === KIND.RIVER) pen[c] = level[j] - H[j] <= SCALE.river.ford ? 6 : Infinity;
    else if (kind[j] !== KIND.NONE) pen[c] = Infinity;
    else if (env.cleared.some((pl) => inPoly(pl, x, z))) pen[c] = Infinity;
  }
  const block = (bx0, bz0, bx1, bz1, test) => {
    for (let k = Math.max(0, Math.floor((bz0 - z0) / PG)); k <= Math.min(nz - 1, Math.ceil((bz1 - z0) / PG)); k++)
      for (let i = Math.max(0, Math.floor((bx0 - x0) / PG)); i <= Math.min(nx - 1, Math.ceil((bx1 - x0) / PG)); i++) {
        const c = k * nx + i;
        if (pen[c] !== Infinity && test(x0 + i * PG, z0 + k * PG)) pen[c] = Infinity;
      }
  };
  const inR = (B, pad) => (x, z) => { const dx = x - B.x, dz = z - B.z; return Math.abs(dx * B.ca + dz * B.sa) < B.hw + pad && Math.abs(-dx * B.sa + dz * B.ca) < B.hd + pad; };
  const near = (f, pad) => (x, z) => { const ex = f[2] - f[0], ez = f[3] - f[1], L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - f[0]) * ex + (z - f[1]) * ez) / L2)); return Math.hypot(x - f[0] - ex * t, z - f[1] - ez * t) < pad; };
  for (const B of env.built) { const e = Math.hypot(B.hw, B.hd) + PATH_CLEAR; block(B.x - e, B.z - e, B.x + e, B.z + e, inR(B, PATH_CLEAR)); }
  for (const B of env.fields) { const e = Math.hypot(B.hw, B.hd) + PATH_CLEAR; block(B.x - e, B.z - e, B.x + e, B.z + e, inR(B, 0.5)); }
  // (a signpost's arms reach out over the ground: kept clear of by its reach)
  for (const [x, z] of env.posts || []) block(x - 3, z - 3, x + 3, z + 3, (px, pz) => Math.hypot(px - x, pz - z) < 0.9 + PATH_CLEAR);
  for (const f of env.fences || []) block(Math.min(f[0], f[2]) - 2, Math.min(f[1], f[3]) - 2, Math.max(f[0], f[2]) + 2, Math.max(f[1], f[3]) + 2, near(f, PATH_CLEAR));
  const free = (c) => c >= 0 && c < cells && pen[c] !== Infinity;
  // the nearest clear node to a point
  const nodeNear = (x, z, reach = 12) => {
    const i0 = Math.round((x - x0) / PG), k0 = Math.round((z - z0) / PG);
    let best = -1, bd = Infinity;
    const r = Math.ceil(reach / PG);
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, k = k0 + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const c = k * nx + i, d = Math.hypot(di, dk);
      if (free(c) && d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const c0 = nodeNear(C[0], C[1], 16);
  if (c0 < 0) return [];
  const net = new Set([c0]);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const out = [];
  const order = tg.slice().sort((a, b) => Math.hypot(a[0] - C[0], a[1] - C[1]) - Math.hypot(b[0] - C[0], b[1] - C[1]));
  for (const t of order) {
    const c1 = nodeNear(t[0], t[1], 8);
    if (c1 < 0 || net.has(c1)) continue;
    let path = null;
    for (const steep of [0.14, 0.2, 0.28]) {
      const dist = new Float64Array(cells).fill(Infinity), prev = new Int32Array(cells).fill(-1);
      const heap = new MinHeap(4096);
      for (const c of net) { dist[c] = 0; heap.push(c, 0); }
      let hit = false;
      while (heap.size) {
        const d = heap.topKey(), c = heap.pop();
        if (d > dist[c]) continue;
        if (c === c1) { hit = true; break; }
        const ci = c % nx, ck = (c - ci) / nx;
        for (const [di, dk] of NB) {
          const i = ci + di, k = ck + dk;
          if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
          const m = k * nx + i;
          if (!free(m)) continue;
          // (a diagonal step only where both its sides are clear)
          if (di && dk && (!free(ck * nx + i) || !free(k * nx + ci))) continue;
          const L = PG * Math.hypot(di, dk), sl = Math.abs(h[m] - h[c]) / L;
          if (sl > steep) continue;
          const nd = d + L * (pen[m] + 200 * sl * sl);
          if (nd < dist[m]) { dist[m] = nd; prev[m] = c; heap.push(m, nd); }
        }
      }
      if (hit) { path = []; for (let c = c1; c >= 0; c = prev[c]) path.push(c); break; }
    }
    if (!path || path.length < 3) continue;
    for (const c of path) net.add(c);
    // the nodes' points, smoothed where the smoothed point is still clear,
    // then a point a metre
    const P = path.map((c) => [X(c), Z(c)]);
    const clearAt = (x, z) => { const c = nodeNear(x, z, 0.1); return c >= 0 && Math.hypot(X(c) - x, Z(c) - z) < PG; };
    let Q = P.map((p) => p.slice());
    for (let pass = 0; pass < 3; pass++) {
      const R2 = Q.map((p) => p.slice());
      for (let q = 1; q < Q.length - 1; q++) {
        const mx = (Q[q - 1][0] + 2 * Q[q][0] + Q[q + 1][0]) / 4, mz = (Q[q - 1][1] + 2 * Q[q][1] + Q[q + 1][1]) / 4;
        if (clearAt(mx, mz) && clearPt(mx, mz)) R2[q] = [mx, mz];
      }
      Q = R2;
    }
    const xs = [], zs = [];
    for (let q = 0; q + 1 < Q.length; q++) {
      const [ax, az] = Q[q], [bx, bz] = Q[q + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L));
      for (let s = 0; s < n; s++) { xs.push(ax + (bx - ax) * s / n); zs.push(az + (bz - az) * s / n); }
    }
    xs.push(Q[Q.length - 1][0]); zs.push(Q[Q.length - 1][1]);
    out.push({ to: t[2], n: xs.length, x: Float32Array.from(xs), z: Float32Array.from(zs) });
  }
  return out;
  // (a smoothed point must keep its distance from every building and fence too)
  function clearPt(x, z) {
    for (const B of env.built) if (inR(B, PATH_CLEAR - 0.6)(x, z)) return false;
    for (const f of env.fences || []) if (near(f, PATH_CLEAR - 0.6)(x, z)) return false;
    return true;
  }
}
