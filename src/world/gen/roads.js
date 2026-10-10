// Dirt roads between the recorded sites, found by a least-cost path search on
// the 4 m grid that charges heavily for slope, so roads wind along valleys
// and contour round hills instead of running straight. Lakes and the sea
// cannot be crossed; a river only at a shallow ford. The roads are then
// smoothed, given a gentle height profile along their length, and pressed
// into the ground across their width so they never tilt on a side slope.
import { MinHeap } from './heap.js';
import { SCALE } from '../scale.js';
import { CG, KIND } from './water.js';
import { smoothstep } from '../noise.js';

const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
export const STEEP = 0.075;                    // a 4 m step steeper than this is refused (the smoothed road runs a little steeper)

// Per coarse node: its height, and what it costs to stand there (Infinity
// where no road may go). Near water the land is judged as it was before the
// rivers cut it (`pre`): the road regrades a river's banks down to its ford.
export function roadGrid(N, H, pre, kind, level, wetDist, F, thr) {
  const n = N / CG, nn = n + 1, NN = N + 1;
  const h = new Float32Array(nn * nn), pen = new Float32Array(nn * nn);
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i <= n; i++) {
      const j = k * CG * NN + i * CG, c = k * nn + i;
      h[c] = wetDist[j] < 10 ? pre[j] : H[j];
      let p = 1;
      const kd = kind[j];
      if (kd === KIND.SEA || kd === KIND.LAKE) p = Infinity;
      else if (kd === KIND.RIVER) {
        // a ford: crossed rather than run along, where the river is no deeper
        // than the chest (its bed is then raised to wading depth across the
        // road), and never where it steps down to its next level
        p = level[j] - H[j] <= SCALE.chest ? 60 : Infinity;
        const x = i * CG, z = k * CG;
        for (let dz = -6; dz <= 6 && p !== Infinity; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
          const xx = x + dx, zz = z + dz;
          if (xx < 0 || zz < 0 || xx > N || zz > N) continue;
          const m = zz * NN + xx;
          if (kind[m] === KIND.RIVER && Math.abs(level[m] - level[j]) > 0.05) { p = Infinity; break; }
        }
      }
      // keep off the water's edge, except to cross
      else if (wetDist[j] < 5) p = 12;
      const f = F.ff[c];
      if (f === f) p += 1.2 * smoothstep(thr - 0.1, thr + 0.1, f);
      if (i === 0 || k === 0 || i === n || k === n) p = Infinity;
      pen[c] = p;
    }
  }
  return { h, pen, n, nn };
}

// From every node of `from` (cost 0), the cheapest way to any node of `to`,
// with no 4 m step steeper than `steep`. Returns the path (coarse nodes,
// from the `to` end back to the network), or null.
export function cheapest(G, from, to, steep = STEEP) {
  const { h, pen, nn } = G, cells = nn * nn;
  const dist = new Float64Array(cells).fill(Infinity), prev = new Int32Array(cells).fill(-1);
  const goal = new Uint8Array(cells);
  for (const c of to) goal[c] = 1;
  const heap = new MinHeap(4096);
  for (const c of from) { dist[c] = 0; heap.push(c, 0); }
  while (heap.size) {
    const d = heap.topKey(), c = heap.pop();
    if (d > dist[c]) continue;
    if (goal[c]) {
      const path = [c];
      let q = c;
      while (prev[q] >= 0) { q = prev[q]; path.push(q); }
      return path;
    }
    const ci = c % nn, ck = (c - ci) / nn;
    for (let q = 0; q < 8; q++) {
      const i = ci + NB[q][0], k = ck + NB[q][1];
      if (i < 0 || k < 0 || i >= nn || k >= nn) continue;
      const m = k * nn + i;
      const p = pen[m];
      if (p === Infinity) continue;
      const len = NB[q][2] * CG, s = Math.abs(h[m] - h[c]) / len;
      if (s > steep) continue;
      const nd = d + len * (p + 450 * s * s);
      if (nd < dist[m]) { dist[m] = nd; prev[m] = c; heap.push(m, nd); }
    }
  }
  return null;
}

// A road as points every metre: smoothed, with its height along the way.
// `H` is the surface (the water's level where it crosses a ford); `wet(j)`
// is true where a node is water.
export function roadLine(path, nn, N, H, wet = () => false) {
  const NN = N + 1;
  let P = path.map((c) => [(c % nn) * CG, Math.floor(c / nn) * CG]);
  // a moving average takes out the grid's stair steps, then corners are cut
  const avg = P.map((p, q) => {
    let sx = 0, sz = 0, w = 0;
    for (let r = Math.max(0, q - 3); r <= Math.min(P.length - 1, q + 3); r++) { const k = 4 - Math.abs(r - q); sx += P[r][0] * k; sz += P[r][1] * k; w += k; }
    return [sx / w, sz / w];
  });
  avg[0] = P[0]; avg[avg.length - 1] = P[P.length - 1];
  P = avg;
  for (let r = 0; r < 2; r++) {
    const Q = [P[0]];
    for (let q = 0; q + 1 < P.length; q++) {
      const [ax, az] = P[q], [bx, bz] = P[q + 1];
      Q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz]);
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  const xs = [], zs = [];
  let carry = 0;
  for (let q = 0; q + 1 < P.length; q++) {
    const [ax, az] = P[q], [bx, bz] = P[q + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let u = carry;
    while (u < len) { const f = u / len; xs.push(ax + (bx - ax) * f); zs.push(az + (bz - az) * f); u += 1; }
    carry = u - len;
  }
  xs.push(P[P.length - 1][0]); zs.push(P[P.length - 1][1]);
  const n = xs.length;
  const g = new Float32Array(n);
  for (let q = 0; q < n; q++) g[q] = H[Math.round(zs[q]) * NN + Math.round(xs[q])];
  // the height along the road: the ground averaged over 12 m either way,
  // then held to the road's steepest
  const y = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    let s = 0, w = 0;
    for (let r = Math.max(0, q - 12); r <= Math.min(n - 1, q + 12); r++) { const k = 13 - Math.abs(r - q); s += g[r] * k; w += k; }
    y[q] = s / w;
  }
  // through a ford the road runs just under the water, and comes down to it
  // (and up out of it) no steeper than the road's steepest
  const low = new Float32Array(n).fill(Infinity);
  for (let q = 0; q < n; q++) if (wet(Math.round(zs[q]) * NN + Math.round(xs[q]))) low[q] = g[q] - 0.1;
  settle(y, low, g);
  return { x: Float32Array.from(xs), z: Float32Array.from(zs), y, n, low, g };
}

const LIM = SCALE.road.maxSlope * 0.8;      // (a margin: the ground under the road follows it to within a little)

// Hold a height profile (a point a metre) to the road's steepest, then bring
// it down to every cap (`low`, the fords) by lowering only: the ground either
// side of a ford comes down to it in a ramp no steeper than the road's
// steepest. Last, the road never cuts or banks more than CUT metres into the
// land (`g`): where the land is steeper than a road should be (only where
// the search had to allow it), the road is steeper, not a trench.
const CUT = 1.5;
export function settle(y, low, g) {
  const n = y.length;
  for (let pass = 0; pass < 2; pass++) {
    for (let q = 1; q < n; q++) y[q] = Math.min(y[q - 1] + LIM, Math.max(y[q - 1] - LIM, y[q]));
    for (let q = n - 2; q >= 0; q--) y[q] = Math.min(y[q + 1] + LIM, Math.max(y[q + 1] - LIM, y[q]));
  }
  for (let q = 0; q < n; q++) if (y[q] > low[q]) y[q] = low[q];
  for (let q = 1; q < n; q++) if (y[q] > y[q - 1] + LIM) y[q] = y[q - 1] + LIM;
  for (let q = n - 2; q >= 0; q--) if (y[q] > y[q + 1] + LIM) y[q] = y[q + 1] + LIM;
  for (let q = 0; q < n; q++) y[q] = Math.min(Math.min(low[q], g[q] + CUT), Math.max(g[q] - CUT, y[q]));
}

// Where a road joins one laid before it, it meets it at that road's height:
// its last 40 m are eased onto it.
export function joinRoads(roads) {
  for (let r = 1; r < roads.length; r++) {
    const rd = roads[r], e = rd.n - 1;
    let best = Infinity, yj = rd.y[e];
    for (let o = 0; o < r; o++) {
      const ro = roads[o];
      for (let q = 0; q < ro.n; q++) {
        const d = Math.hypot(ro.x[q] - rd.x[e], ro.z[q] - rd.z[e]);
        if (d < best) { best = d; yj = ro.y[q]; }
      }
    }
    // (over a stretch long enough to stay within the road's steepest)
    const dy = yj - rd.y[e];
    const L = Math.min(e, Math.max(40, Math.ceil(Math.abs(dy) / (0.5 * SCALE.road.maxSlope))));
    for (let q = e - L; q <= e; q++) rd.y[q] += dy * smoothstep(e - L, e, q);
    settle(rd.y, rd.low, rd.g);
  }
}

// Press the roads into the ground (H, in place) and paint them (wRoad). Water
// nodes keep their bed: a road crosses a river through the ford.
export function layRoads(N, H, kind, level, roads) {
  const NN = N + 1, cells = NN * NN, half = SCALE.road.width / 2, R = half + 4.5;
  const best = new Float32Array(cells).fill(Infinity), near = new Int32Array(cells).fill(-1);
  const all = [];
  roads.forEach((rd, ri) => {
    for (let q = 0; q < rd.n; q++) {
      const p = all.length;
      all.push([rd.x[q], rd.z[q], rd.y[q]]);
      const x = rd.x[q], z = rd.z[q];
      for (let k = Math.max(0, Math.floor(z - R)); k <= Math.min(N, Math.ceil(z + R)); k++) {
        for (let i = Math.max(0, Math.floor(x - R)); i <= Math.min(N, Math.ceil(x + R)); i++) {
          const r = Math.hypot(i - x, k - z);
          if (r > R) continue;
          const j = k * NN + i;
          if (r < best[j]) { best[j] = r; near[j] = p; }
        }
      }
    }
  });
  const wRoad = new Uint8Array(cells);
  for (let j = 0; j < cells; j++) {
    const p = near[j];
    if (p < 0) continue;
    const r = best[j];
    wRoad[j] = Math.round(255 * (1 - smoothstep(half - 0.35, half + 0.35, r)));
    if (kind[j] !== KIND.NONE) {
      // a ford: the river's bed rises to wading depth across the road
      if (kind[j] === KIND.RIVER && r < half + 2.5) H[j] = Math.max(H[j], level[j] - SCALE.river.ford * 0.7);
      continue;
    }
    const w = r <= half + 0.6 ? 1 : smoothstep(R, half + 0.6, r);
    // the road's bed sits a little under the grass
    const y = all[p][2] - (r <= half ? 0.1 : 0);
    H[j] += (y - H[j]) * w;
  }
  // where the road has cut its bank below a ford's water, the water comes in
  for (let pass = 0; pass < 3; pass++) {
    for (let j = NN; j < cells - NN; j++) {
      if (near[j] < 0 || kind[j] !== KIND.NONE) continue;
      for (const q of [j - 1, j + 1, j - NN, j + NN]) {
        if (kind[q] === KIND.RIVER && level[q] > H[j] + 0.02) { kind[j] = KIND.RIVER; level[j] = level[q]; break; }
      }
    }
  }
  return { wRoad, dist: best };
}
