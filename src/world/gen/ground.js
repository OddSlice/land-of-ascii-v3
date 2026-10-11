// What the ground is made of, from a small set the art bible covers: meadow
// (the default), forest floor under the stands, sand on beaches and shores,
// rock on steep and high ground, snow on the tops, the dirt roads, and the
// beds of lakes and rivers (seen through the water). Also the fixed detail
// fields every material's tone is built from.
import { fbm, vnoise, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';
import { KIND, distanceTo } from './water.js';

const SEA = SCALE.sea;

// Sand, rock and snow weights (0..255) for every node.
export function materials(N, H, kind, level, seaDist, freshDist, seed) {
  const NN = N + 1, cells = NN * NN;
  const wSand = new Uint8Array(cells), wRock = new Uint8Array(cells), wSnow = new Uint8Array(cells);
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      const h = H[j];
      const l = H[k * NN + Math.max(0, i - 1)], r = H[k * NN + Math.min(N, i + 1)];
      const d = H[Math.max(0, k - 1) * NN + i], u = H[Math.min(N, k + 1) * NN + i];
      const sx = (r - l) / 2, sz = (u - d) / 2;
      const slope = Math.hypot(sx, sz);
      const n1 = fbm(i / 37, k / 37, seed + 901, 2);
      // beaches: low, gentle ground by the sea (narrow, phase 2a); a narrow
      // strip round lakes and along rivers; and the shallow beds next to them
      let sand = 0;
      if (seaDist[j] <= SCALE.beach + 8 * n1 && h < SEA + 2.2 + 0.8 * n1 && slope < 0.3) sand = 1;
      if (freshDist[j] <= 2.5 + 1.5 * n1 && slope < 0.35 && kind[j] !== KIND.RIVER) sand = 1;
      if (kind[j] === KIND.LAKE && level[j] - h < 1.0) sand = 1;
      wSand[j] = sand * 255;
      // rock: steep faces, and bare ground high in the range
      const high = smoothstep(SEA + 175, SEA + 225, h + 20 * n1) * smoothstep(0.22, 0.4, slope);
      wRock[j] = 255 * Math.min(1, smoothstep(0.62, 0.95, slope + 0.08 * n1) + high);
      // snow on the tops, not on the steepest faces
      wSnow[j] = 255 * smoothstep(SCALE.range.snow - 8, SCALE.range.snow + 8, SEA + (h - SEA) + 14 * n1) * (1 - smoothstep(0.9, 1.25, slope));
    }
  }
  return { wSand, wRock, wSnow };
}

// The waterline (phase 2a): every node's distance to the edge of the sea or
// a lake, in eighths of a metre about 128 (above on land, below in the
// water), out to 16 m either way; rivers keep 255 (no shore). The march
// draws the wet band and the foam line from it.
export function shoreLine(N, kind) {
  const NN = N + 1, cells = NN * NN;
  const toWater = distanceTo(N, (j) => kind[j] === KIND.SEA || kind[j] === KIND.LAKE, true);
  const toLand = distanceTo(N, (j) => kind[j] === KIND.NONE, true);
  const out = new Uint8Array(cells);
  for (let j = 0; j < cells; j++) {
    const k = kind[j];
    // (the chamfer distance runs from node to node: half a metre to the line between)
    if (k === KIND.SEA || k === KIND.LAKE) out[j] = Math.max(0, Math.round(128 - (toLand[j] / 10 - 0.5) * 8));
    else if (k === KIND.NONE) out[j] = Math.min(254, Math.round(128 + (toWater[j] / 10 - 0.5) * 8));
    else out[j] = 255;
  }
  return out;
}

// Gullies on the range (phase 2a, the far rule): where rain gathers on steep
// ground past the range front, from the flow accumulation on the 4 m grid,
// widened into bands 10 to 20 m across so they still read from the valley.
// 0..127 on the 4 m grid (Int8); the march darkens rock and snow by it.
export function gullies(co, acc, gOf) {
  const { Hc, n, nn } = co, CGm = 4;
  let v = new Float32Array(nn * nn);
  const lo = Math.log(30), hi = Math.log(600);
  for (let k = 1; k < n; k++) {
    for (let i = 1; i < n; i++) {
      const c = k * nn + i;
      const sx = (Hc[c + 1] - Hc[c - 1]) / (2 * CGm), sz = (Hc[c + nn] - Hc[c - nn]) / (2 * CGm);
      const slope = Math.hypot(sx, sz);
      const inRange = smoothstep(0, 140, gOf(i * CGm, k * CGm));
      if (inRange <= 0) continue;
      v[c] = smoothstep(lo, hi, Math.log(Math.max(1, acc[c]))) * smoothstep(0.18, 0.5, slope) * inRange;
    }
  }
  // widen: two passes of a 5 x 5 box, then lift what is left of a line
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(nn * nn);
    for (let k = 0; k <= n; k++) for (let i = 0; i <= n; i++) {
      let s = 0, w = 0;
      for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) {
        const kk = k + dk, ii = i + di;
        if (kk < 0 || ii < 0 || kk > n || ii > n) continue;
        s += v[kk * nn + ii]; w++;
      }
      out[k * nn + i] = s / w;
    }
    v = out;
  }
  const g = new Int8Array(nn * nn);
  for (let c = 0; c < nn * nn; c++) g[c] = Math.round(127 * Math.min(1, v[c] * 3.2));
  return g;
}

// The fixed detail every material's tone is built from: patches about 11 m
// across, and a fine grain. Kept as small integers (-127..127): `toneK`
// scales them back.
export function detail(N, seed) {
  const NN = N + 1, cells = NN * NN;
  const tone = new Int8Array(cells), fine = new Int8Array(cells);
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      tone[j] = Math.round(127 * Math.max(-1, Math.min(1, fbm(i / 11, k / 11, seed + 21, 3))));
      fine[j] = Math.round(127 * Math.max(-1, Math.min(1, vnoise(i / 2.1, k / 2.1, seed + 22) * 0.7 + vnoise(i / 0.9, k / 0.9, seed + 23) * 0.3)));
    }
  }
  return { tone, fine, toneK: 1 / 127 };
}
