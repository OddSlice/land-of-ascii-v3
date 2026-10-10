// Where the conifers grow, in stands with clear edges and wide open meadow
// between them: a slow field of "forest-ness" from noise, raised on
// north-facing slopes, on valley sides and on the range's lower slopes, cut
// to a threshold chosen so the world holds about the target number of trees.
// Inside a stand trees stand on a jittered 5 m lattice; toward the edge they
// thin out, and past it a few stand alone. Bushes grow at stand edges and
// along water.
import { fbm, hash2, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';
import { CG, KIND } from './water.js';
import { conifer, groundAt } from '../objects.js';

const SEA = SCALE.sea;
const CELL = SCALE.trees.spacing;

// The field on the 4 m grid (NaN where nothing can grow at all).
export function forestField(N, H, kind, wetDist, frame, seed, rivers) {
  const n = N / CG, nn = n + 1, NN = N + 1;
  const ff = new Float32Array(nn * nn);
  const P = {};
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i <= n; i++) {
      const x = i * CG, z = k * CG, j = z * NN + x;
      const c = k * nn + i;
      const h = H[j];
      const xl = Math.max(0, x - 2), xr = Math.min(N, x + 2), zd = Math.max(0, z - 2), zu = Math.min(N, z + 2);
      const sx = (H[z * NN + xr] - H[z * NN + xl]) / (xr - xl), sz = (H[zu * NN + x] - H[zd * NN + x]) / (zu - zd);
      const slope = Math.hypot(sx, sz);
      frame.at(x, z, P);
      const treeline = SEA + 215 + 30 * fbm(x / 300, z / 300, seed + 701, 2);
      if (kind[j] !== KIND.NONE || wetDist[j] < 4 || slope > 0.62 || h > treeline || P.c < 45) { ff[c] = NaN; continue; }
      let f = 0.5 + 0.5 * fbm(x / 300, z / 300, seed + 702, 3) + 0.17 * fbm(x / 85, z / 85, seed + 703, 2);
      // north-facing slopes (the ground falls toward +z) hold more trees
      const north = slope > 1e-4 ? Math.max(0, -sz / slope) : 0;
      f += 0.22 * smoothstep(0.03, 0.16, slope) * north;
      // valley sides: sloping ground near a river
      if (wetDist[j] < 160) f += 0.12 * smoothstep(0.035, 0.12, slope) * smoothstep(160, 40, wetDist[j]);
      // the range's lower slopes hold the most, thinning toward the
      // treeline; the open lowland holds less, so its meadows stay wide
      f += 0.34 * smoothstep(0, 160, P.g) * smoothstep(treeline, treeline - 50, h);
      f -= 0.14 * smoothstep(-60, -260, P.g);
      ff[c] = f;
    }
  }
  return { ff, n, nn };
}

export function fieldAt(F, x, z) {
  const { ff, n, nn } = F;
  const u = Math.max(0, Math.min(n - 1e-6, x / CG)), w = Math.max(0, Math.min(n - 1e-6, z / CG));
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0, c = k0 * nn + i0;
  const a = ff[c], b = ff[c + 1], d = ff[c + nn], e = ff[c + nn + 1];
  // where any corner cannot grow, nothing grows
  if (a !== a || b !== b || d !== d || e !== e) return NaN;
  return a + (b - a) * fx + (d - a) * fz + (a - b - d + e) * fx * fz;
}

// Does a tree grow at lattice point (gx, gz) with field f, for threshold thr?
function grows(gx, gz, f, thr, seed) {
  const h = hash2(gx, gz, seed + 711);
  if (f >= thr) return h < 0.95 * smoothstep(thr, thr + 0.07, f);
  // a few stand alone just past the edge
  return h < 0.03 * smoothstep(thr - 0.2, thr, f);
}

function latticePoint(gx, gz, seed) {
  return [(gx + 0.15 + 0.7 * hash2(gx, gz, seed + 712)) * CELL, (gz + 0.15 + 0.7 * hash2(gx, gz, seed + 713)) * CELL];
}

// The threshold that gives about `target` trees.
export function chooseThreshold(F, N, seed, target = SCALE.trees.target) {
  const m = Math.floor(N / CELL), fs = new Float32Array(m * m);
  for (let gz = 0; gz < m; gz++) for (let gx = 0; gx < m; gx++) {
    const [x, z] = latticePoint(gx, gz, seed);
    fs[gz * m + gx] = fieldAt(F, x, z);
  }
  let lo = 0, hi = 2;
  for (let it = 0; it < 24; it++) {
    const thr = (lo + hi) / 2;
    let count = 0;
    for (let gz = 0; gz < m; gz++) for (let gx = 0; gx < m; gx++) {
      const f = fs[gz * m + gx];
      if (f === f && grows(gx, gz, f, thr, seed)) count++;
    }
    if (count > target) lo = thr; else hi = thr;
  }
  return (lo + hi) / 2;
}

// The trees and bushes. `clear(x, z)` is true where nothing may stand (roads,
// sites, the wall).
export function plant(terrain, F, thr, seed, clear, wetDist, kind) {
  const N = terrain.N, NN = terrain.NN, m = Math.floor(N / CELL);
  const trees = [];
  for (let gz = 1; gz < m - 1; gz++) {
    for (let gx = 1; gx < m - 1; gx++) {
      const [x, z] = latticePoint(gx, gz, seed);
      const f = fieldAt(F, x, z);
      if (!(f === f) || !grows(gx, gz, f, thr, seed)) continue;
      const j = Math.round(z) * NN + Math.round(x);
      if (kind[j] !== KIND.NONE || wetDist[j] < 3 || clear(x, z)) continue;
      // deep in a stand, crowns grow narrower, so a closed canopy keeps gaps
      const narrow = 1 - 0.3 * smoothstep(thr, thr + 0.15, f);
      trees.push(conifer(x, z, groundAt(terrain, x, z) - 0.3, seed * 7 + gz * m + gx, 1 + 0.15 * hash2(gx, gz, seed + 714), narrow));
    }
  }
  // bushes: at stand edges, and along the water
  const bushes = [];
  const B = 14, mb = Math.floor(N / B);
  for (let gz = 1; gz < mb - 1; gz++) {
    for (let gx = 1; gx < mb - 1; gx++) {
      const x = (gx + hash2(gx, gz, seed + 721)) * B, z = (gz + hash2(gx, gz, seed + 722)) * B;
      const j = Math.round(z) * NN + Math.round(x);
      if (kind[j] !== KIND.NONE || clear(x, z)) continue;
      const f = fieldAt(F, x, z);
      const edge = f === f && f > thr - 0.14 && f < thr + 0.02;
      const shore = wetDist[j] >= 2 && wetDist[j] <= 9;
      const p = (edge ? 0.3 : 0) + (shore ? 0.22 : 0);
      if (!p || hash2(gx, gz, seed + 723) > p) continue;
      if (terrain.ground[j] > SEA + 170) continue;
      const r = (q) => hash2(gx * 7 + q, gz, seed + 724);
      bushes.push({ x, z, base: groundAt(terrain, x, z), rx: 1.0 + 0.7 * r(1), ry: 0.75 + 0.5 * r(2), seed: bushes.length });
    }
  }
  return { trees, bushes };
}
