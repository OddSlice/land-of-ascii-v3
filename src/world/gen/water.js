// Water by hydrology. Rain falls everywhere (more on the range), runs down
// the steepest way, fills the hollows it cannot leave until they spill, and
// leaves the map at the sea. That gives the lakes (the hollows that filled)
// and the rivers (the main streams of the largest catchments that start in
// the mountains). It is worked out on a 4 m grid, then carved into the
// 1 m grid: each river's water steps down in whole metres, its bed taken
// from the land as it was before any carving, so nothing deepens into a
// canyon.
import { MinHeap } from './heap.js';
import { vnoise, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';

export const CG = 4;                    // metres between nodes of the coarse grid
const SEA = SCALE.sea;
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
export const KIND = { NONE: 0, SEA: 1, LAKE: 2, RIVER: 3 };

// The coarse grid: n = N / CG cells a side, n + 1 nodes.
export function coarsen(H, N) {
  const n = N / CG, nn = n + 1, NN = N + 1;
  const Hc = new Float32Array(nn * nn);
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i <= n; i++) {
      let s = 0, w = 0;
      for (let dk = -2; dk <= 2; dk += 2) {
        for (let di = -2; di <= 2; di += 2) {
          const x = Math.min(N, Math.max(0, i * CG + di)), z = Math.min(N, Math.max(0, k * CG + dk));
          const q = (di === 0 ? 2 : 1) * (dk === 0 ? 2 : 1);
          s += H[z * NN + x] * q; w += q;
        }
      }
      Hc[k * nn + i] = s / w;
    }
  }
  return { Hc, n, nn };
}

// Priority flood from the map's edges: F is the land with every hollow
// filled to where it spills, rec[c] the node water at c runs to (-1 at the
// edge), ord the order nodes were reached (lowest first).
export function flood({ Hc, nn }) {
  const cells = nn * nn;
  const F = new Float32Array(cells), rec = new Int32Array(cells).fill(-1), ord = new Int32Array(cells);
  const closed = new Uint8Array(cells);
  const heap = new MinHeap(4 * nn);
  const pit = new Int32Array(cells);
  let ph = 0, pt = 0, no = 0;
  for (let k = 0; k < nn; k++) {
    for (let i = 0; i < nn; i++) {
      if (i !== 0 && k !== 0 && i !== nn - 1 && k !== nn - 1) continue;
      const c = k * nn + i;
      F[c] = Math.max(Hc[c], SEA); closed[c] = 1;
      heap.push(c, F[c]);
    }
  }
  while (ph < pt || heap.size) {
    const c = ph < pt ? pit[ph++] : heap.pop();
    ord[no++] = c;
    const ci = c % nn, ck = (c - ci) / nn;
    for (let q = 0; q < 8; q++) {
      const i = ci + NB[q][0], k = ck + NB[q][1];
      if (i < 0 || k < 0 || i >= nn || k >= nn) continue;
      const m = k * nn + i;
      if (closed[m]) continue;
      closed[m] = 1; rec[m] = c;
      if (Hc[m] <= F[c]) { F[m] = F[c]; pit[pt++] = m; } else { F[m] = Hc[m]; heap.push(m, F[m]); }
    }
  }
  return { F, rec, ord };
}

// Water gathered at every node: its own rain plus everything upstream.
export function accumulate({ rec, ord }, rain) {
  const acc = Float32Array.from(rain);
  for (let q = ord.length - 1; q >= 0; q--) {
    const c = ord[q], r = rec[c];
    if (r >= 0) acc[r] += acc[c];
  }
  return acc;
}

// The filled hollows that hold real water: lakes at least `minArea` square
// metres and `minDepth` deep. id[c] is the lake a coarse node lies in (-1: none).
export function findLakes({ Hc, nn }, { F }, minArea = 1500, minDepth = 0.7) {
  const cells = nn * nn;
  const id = new Int32Array(cells).fill(-1);
  const seen = new Uint8Array(cells);
  const lakes = [];
  const stack = new Int32Array(cells);
  for (let c0 = 0; c0 < cells; c0++) {
    if (seen[c0] || F[c0] - Hc[c0] <= 0.05 || F[c0] <= SEA + 1e-3) continue;
    // one filled hollow: every node in it shares the level it spills at
    const level = F[c0];
    let sp = 0, n = 0, deep = 0, sx = 0, sz = 0, low = c0, edge = nn;
    const members = [];
    stack[sp++] = c0; seen[c0] = 1;
    while (sp) {
      const c = stack[--sp];
      members.push(c);
      n++;
      const d = level - Hc[c];
      if (d > deep) { deep = d; low = c; }
      const ci = c % nn, ck = (c - ci) / nn;
      sx += ci; sz += ck;
      edge = Math.min(edge, ci, ck, nn - 1 - ci, nn - 1 - ck);
      for (let q = 0; q < 8; q++) {
        const i = ci + NB[q][0], k = ck + NB[q][1];
        if (i < 0 || k < 0 || i >= nn || k >= nn) continue;
        const m = k * nn + i;
        if (seen[m] || F[m] - Hc[m] <= 0.05 || Math.abs(F[m] - level) > 1e-4) continue;
        seen[m] = 1; stack[sp++] = m;
      }
    }
    const area = n * CG * CG;
    // (a hollow against the map's edge would run on past it as a stripe of water)
    if (area < minArea || deep < minDepth || edge < 12) continue;
    const L = lakes.length;
    for (const c of members) id[c] = L;
    lakes.push({ level: Math.round(level * 100) / 100, area, deep, x: sx / n * CG, z: sz / n * CG, low: [(low % nn) * CG, Math.floor(low / nn) * CG], cells: n });
  }
  return { id, lakes };
}

// The main streams of the largest catchments that reach the sea and start
// in the mountains (g, from the land's frame, at least `srcG` into the
// range). Each is a list of coarse nodes from its source to its mouth.
export function pickRivers({ Hc, nn }, { F, rec }, acc, gOf, { want = 3, minAcc = 300, srcG = 150, minLen = 800, apart = 300 } = {}) {
  const cells = nn * nn;
  const isSea = (c) => Hc[c] < SEA && F[c] <= SEA + 1e-3;
  // children of every node (compressed rows)
  const start = new Int32Array(cells + 1), kids = new Int32Array(cells);
  for (let c = 0; c < cells; c++) if (rec[c] >= 0) start[rec[c] + 1]++;
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  const fill = start.slice(0, cells);
  for (let c = 0; c < cells; c++) if (rec[c] >= 0) kids[fill[rec[c]]++] = c;
  const mouths = [];
  for (let c = 0; c < cells; c++) if (!isSea(c) && rec[c] >= 0 && isSea(rec[c]) && acc[c] >= minAcc) mouths.push(c);
  mouths.sort((a, b) => acc[b] - acc[a] || a - b);
  const out = [];
  for (const relax of [1, 0.4]) {
    for (const m of mouths) {
      if (out.length >= want) break;
      if (out.some((r) => r.mouth === m)) continue;
      const mx = (m % nn) * CG, mz = Math.floor(m / nn) * CG;
      if (out.some((r) => Math.hypot(r.mx - mx, r.mz - mz) < apart)) continue;
      const path = [m];
      let cur = m;
      for (;;) {
        let best = -1;
        for (let q = start[cur]; q < start[cur + 1]; q++) { const k = kids[q]; if (best < 0 || acc[k] > acc[best]) best = k; }
        if (best < 0 || acc[best] < minAcc) break;
        path.push(best); cur = best;
      }
      if (path.length * CG < minLen) continue;
      const src = path[path.length - 1];
      if (gOf((src % nn) * CG, Math.floor(src / nn) * CG) < srcG * relax) continue;
      // a river must not share its lower course with one already taken
      out.push({ nodes: path.reverse(), mouth: m, mx, mz, acc: acc[m] });
    }
  }
  return out;
}

// ---- the fine grid ------------------------------------------------------------

// Chaikin's corner cutting, twice, then points every metre: the river's
// centre line, with each point's share of the way along the coarse path.
function centreLine(nodes, nn) {
  let P = nodes.map((c, q) => [(c % nn) * CG, Math.floor(c / nn) * CG, q]);
  for (let r = 0; r < 2; r++) {
    const Q = [P[0]];
    for (let q = 0; q + 1 < P.length; q++) {
      const [ax, az, at] = P[q], [bx, bz, bt] = P[q + 1];
      Q.push([0.75 * ax + 0.25 * bx, 0.75 * az + 0.25 * bz, 0.75 * at + 0.25 * bt], [0.25 * ax + 0.75 * bx, 0.25 * az + 0.75 * bz, 0.25 * at + 0.75 * bt]);
    }
    Q.push(P[P.length - 1]);
    P = Q;
  }
  const out = [];
  let carry = 0;
  for (let q = 0; q + 1 < P.length; q++) {
    const [ax, az, at] = P[q], [bx, bz, bt] = P[q + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let u = carry;
    while (u < len) { const f = u / len; out.push([ax + (bx - ax) * f, az + (bz - az) * f, at + (bt - at) * f]); u += 1; }
    carry = u - len;
  }
  return out;
}

function bil(H, N, x, z) {
  const NN = N + 1;
  const u = Math.max(0, Math.min(N - 1e-6, x)), w = Math.max(0, Math.min(N - 1e-6, z));
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0, j = k0 * NN + i0;
  return H[j] + (H[j + 1] - H[j]) * fx + (H[j + NN] - H[j]) * fz + (H[j] - H[j + 1] - H[j + NN] + H[j + NN + 1]) * fx * fz;
}

// Carve the rivers and fill the lakes and the sea on the 1 m grid. H is the
// land before water, changed in place where the rivers cut; returns the
// water surface (`level`, NaN where dry), what kind of water each node is,
// and the rivers as centre lines with their water level per point.
export function wetFine(H, N, coarse, lakeInfo, rivers, accAt, seed) {
  const NN = N + 1, cells = NN * NN;
  const pre = H.slice();                       // the land as it was: rivers are cut against this
  const level = new Float32Array(cells).fill(NaN);
  const kind = new Uint8Array(cells);
  const best = new Float32Array(cells).fill(Infinity), near = new Int32Array(cells).fill(-1);
  const pts = [];                              // every river point: [x, z, W, bed, hw, reach, river]
  const out = [];
  const { nn } = coarse, lakeId = lakeInfo.id, lakes = lakeInfo.lakes;
  const accMax = rivers.reduce((m, r) => Math.max(m, r.acc), 1);
  rivers.forEach((rv, ri) => {
    const line = centreLine(rv.nodes, nn);
    const n = line.length;
    const W = new Float32Array(n), B = new Float32Array(n), HW = new Float32Array(n), lake = new Int32Array(n).fill(-1);
    // per point: how big the river is here, and whether it is crossing a lake
    for (let q = 0; q < n; q++) {
      const [x, z, t] = line[q];
      const c = rv.nodes[Math.min(rv.nodes.length - 1, Math.round(t))];
      lake[q] = lakeId[c];
      const size = smoothstep(0, 1, Math.sqrt(accAt(c) / accMax));
      HW[q] = SCALE.river.minWidth / 2 + (SCALE.river.maxWidth - SCALE.river.minWidth) / 2 * size;
      const shallow = 0.5 + 0.5 * vnoise(q / 70, ri * 17.3, seed + 601);
      B[q] = (0.55 + 1.1 * size) * (0.45 + 0.55 * shallow);      // depth for now
      W[q] = bil(pre, N, x, z) - (0.3 + 0.4 * size);
    }
    // the water only ever goes down: a running minimum from the source, held
    // at a lake's level across it, in whole metres, never under the sea
    let run = Infinity;
    for (let q = 0; q < n; q++) {
      if (lake[q] >= 0) { run = Math.min(run, lakes[lake[q]].level); W[q] = lakes[lake[q]].level; continue; }
      run = Math.min(run, W[q]);
      W[q] = Math.max(SEA, Math.floor(run));
    }
    // and never under the water it runs into
    let down = SEA;
    for (let q = n - 1; q >= 0; q--) {
      if (lake[q] >= 0) { down = lakes[lake[q]].level; continue; }
      if (W[q] < down) W[q] = down;
    }
    const base = pts.length;
    for (let q = 0; q < n; q++) {
      const depth = B[q];
      B[q] = W[q] - depth;
      pts.push([line[q][0], line[q][1], W[q], B[q], HW[q], lake[q], ri]);
    }
    out.push({ x: Float32Array.from(line, (p) => p[0]), z: Float32Array.from(line, (p) => p[1]), level: W, bed: B, hw: HW, lake, base, n });
  });
  // the nearest river point to every node within reach of a channel
  for (let p = 0; p < pts.length; p++) {
    const [x, z, w, bed, hw, lk] = pts[p];
    if (lk >= 0) continue;
    const R = hw + 1.5 + Math.min(30, Math.max(0, (bil(pre, N, x, z) - w) / 0.55));
    const x0 = Math.max(0, Math.floor(x - R)), x1 = Math.min(N, Math.ceil(x + R));
    const z0 = Math.max(0, Math.floor(z - R)), z1 = Math.min(N, Math.ceil(z + R));
    for (let k = z0; k <= z1; k++) {
      for (let i = x0; i <= x1; i++) {
        const r = Math.hypot(i - x, k - z);
        if (r > R) continue;
        const j = k * NN + i;
        if (r < best[j]) { best[j] = r; near[j] = p; }
      }
    }
  }
  // carve: a rounded channel under the water, banks leaning back at about
  // 29 degrees above it, a low lip where the land beside would be lower than the water
  for (let j = 0; j < cells; j++) {
    const p = near[j];
    if (p < 0) continue;
    const [, , w, bed, hw] = pts[p];
    const r = best[j];
    let t;
    if (r < hw) { t = bed + (w - bed) * (r / hw) * (r / hw); level[j] = w; kind[j] = KIND.RIVER; }
    else t = w + (r - hw) * 0.55;
    let g = Math.min(H[j], t);
    if (r >= hw && r < hw + 1.5 && g < w + 0.15) g = w + 0.15;
    H[j] = g;
  }
  // the lakes: fine nodes under the lake's level, joined to its deepest
  // point, within a few metres of the lake's coarse outline
  const inLake = (i, k) => {
    const ci = Math.round(i / CG), ck = Math.round(k / CG);
    for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
      const a = ci + di, b = ck + dk;
      if (a >= 0 && b >= 0 && a < nn && b < nn && lakeId[b * nn + a] >= 0) return lakeId[b * nn + a];
    }
    return -1;
  };
  const stack = new Int32Array(cells);
  lakes.forEach((lk, L) => {
    let sp = 0;
    const s0 = Math.round(lk.low[1]) * NN + Math.round(lk.low[0]);
    if (H[s0] >= lk.level) return;
    stack[sp++] = s0;
    while (sp) {
      const j = stack[--sp];
      if (kind[j] === KIND.LAKE || H[j] >= lk.level) continue;
      const i = j % NN, k = (j - i) / NN;
      if (inLake(i, k) !== L) continue;
      if (!(level[j] >= lk.level)) level[j] = lk.level;
      kind[j] = KIND.LAKE;
      if (i > 0) stack[sp++] = j - 1;
      if (i < N) stack[sp++] = j + 1;
      if (k > 0) stack[sp++] = j - NN;
      if (k < N) stack[sp++] = j + NN;
    }
  });
  // the sea: everything under sea level joined to the map's edge
  let sp = 0;
  for (let i = 0; i <= N; i++) { stack[sp++] = i; stack[sp++] = N * NN + i; stack[sp++] = i * NN; stack[sp++] = i * NN + N; }
  while (sp) {
    const j = stack[--sp];
    if (kind[j] === KIND.SEA || H[j] >= SEA) continue;
    kind[j] = KIND.SEA; level[j] = SEA;
    const i = j % NN, k = (j - i) / NN;
    if (i > 0) stack[sp++] = j - 1;
    if (i < N) stack[sp++] = j + 1;
    if (k > 0) stack[sp++] = j - NN;
    if (k < N) stack[sp++] = j + NN;
  }
  return { level, kind, rivers: out, pre };
}

// Distance in metres (approximately, by a two-pass chamfer) from every node
// to the nearest node where `src` is true, up to 255.
// (`raw`: the distances in tenths of a metre, as Uint16, instead of whole metres)
export function distanceTo(N, src, raw = false) {
  const NN = N + 1, cells = NN * NN;
  const d = new Uint16Array(cells).fill(65535);
  for (let j = 0; j < cells; j++) if (src(j)) d[j] = 0;
  const A = 10, D = 14;
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      let v = d[j];
      if (i > 0 && d[j - 1] + A < v) v = d[j - 1] + A;
      if (k > 0) {
        if (d[j - NN] + A < v) v = d[j - NN] + A;
        if (i > 0 && d[j - NN - 1] + D < v) v = d[j - NN - 1] + D;
        if (i < N && d[j - NN + 1] + D < v) v = d[j - NN + 1] + D;
      }
      d[j] = v;
    }
  }
  for (let k = N; k >= 0; k--) {
    for (let i = N; i >= 0; i--) {
      const j = k * NN + i;
      let v = d[j];
      if (i < N && d[j + 1] + A < v) v = d[j + 1] + A;
      if (k < N) {
        if (d[j + NN] + A < v) v = d[j + NN] + A;
        if (i < N && d[j + NN + 1] + D < v) v = d[j + NN + 1] + D;
        if (i > 0 && d[j + NN - 1] + D < v) v = d[j + NN - 1] + D;
      }
      d[j] = v;
    }
  }
  if (raw) return d;
  const out = new Uint8Array(cells);
  for (let j = 0; j < cells; j++) out[j] = Math.min(255, Math.round(d[j] / A));
  return out;
}
