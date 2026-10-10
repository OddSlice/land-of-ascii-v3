// What the ground is made of, from a small set the art bible covers: meadow
// (the default), forest floor under the stands, sand on beaches and shores,
// rock on steep and high ground, snow on the tops, the dirt roads, and the
// beds of lakes and rivers (seen through the water). Also the fixed detail
// fields every material's tone is built from.
import { fbm, vnoise, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';
import { KIND } from './water.js';

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
      // beaches: low, gentle ground by the sea; a narrow strip round lakes and
      // along rivers; and the shallow beds next to them
      let sand = 0;
      if (seaDist[j] <= 34 + 10 * n1 && h < SEA + 2.6 + n1 && slope < 0.3) sand = 1;
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
