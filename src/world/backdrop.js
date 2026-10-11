// The backdrop (phase 2a): the range going on past the north and east edges
// of the generated world, out to several kilometres, as receding ridgelines.
// Never walkable and never part of the height grid. Each ridgeline is a
// profile of heights along a line that runs at a set distance outside the
// map's north and east edges and rounds the north-east corner on an arc, so
// its face turns smoothly. Built once per world from the seed and the map's
// own edge heights (the first ridgeline always stands above them, so the
// map's mountains run on into it with no gap); the sky pass draws whatever a
// ray that met nothing on the map meets on it, lit by the same sun.
import { SCALE } from './scale.js';
import { ridged, fbm, smoothstep } from './noise.js';

const SEA = SCALE.sea;

// Where on a ridgeline's line arc length u lies, the way out from the map
// there (w) and the way u runs (a): into out = [x, z, wx, wz, ax, az].
export function lineAt(B, D, u, out) {
  const N = B.N, a0 = N - B.west, arc = D * Math.PI / 2;
  if (u <= a0) { out[0] = B.west + u; out[1] = N + D; out[2] = 0; out[3] = 1; out[4] = 1; out[5] = 0; }
  else if (u <= a0 + arc) {
    const ang = Math.PI / 2 - (u - a0) / D, c = Math.cos(ang), s = Math.sin(ang);
    out[0] = N + D * c; out[1] = N + D * s; out[2] = c; out[3] = s; out[4] = s; out[5] = -c;
  } else { out[0] = N + D; out[1] = N - (u - a0 - arc); out[2] = 1; out[3] = 0; out[4] = 0; out[5] = -1; }
  return out;
}

// Where a ray from (ex, ez) going (dx, dz) (a unit horizontal direction)
// leaves the map's side of ridgeline D: its horizontal distance t and arc
// length u, into out = [t, u]; t = Infinity where it never does.
export function crossLine(B, D, ex, ez, dx, dz, out) {
  const N = B.N, a0 = N - B.west, arc = D * Math.PI / 2;
  let t = Infinity, u = 0;
  if (dz > 1e-9) {
    const tn = (N + D - ez) / dz, x = ex + dx * tn;
    if (tn > 0 && x <= N && x >= B.west) { t = tn; u = x - B.west; }
  }
  if (dx > 1e-9) {
    const te = (N + D - ex) / dx, z = ez + dz * te;
    if (te > 0 && te < t && z <= N && z >= B.south) { t = te; u = a0 + arc + (N - z); }
  }
  // the arc round the corner: where the ray leaves the circle of radius D about (N, N)
  const ox = ex - N, oz = ez - N, b = ox * dx + oz * dz, c = ox * ox + oz * oz - D * D, disc = b * b - c;
  if (disc > 0) {
    const ta = -b + Math.sqrt(disc);
    const x = ox + dx * ta, z = oz + dz * ta;
    if (ta > 0 && ta < t && x >= 0 && z >= 0) { t = ta; u = a0 + D * (Math.PI / 2 - Math.atan2(z, x)); }
  }
  out[0] = t; out[1] = u;
  return out;
}

// The ridgelines of a world. `edge(x, z)`: the map's own height at a point
// on its edge (the march runs those heights on past the edge as far as the
// first ridgeline).
export function buildBackdrop(seed, N, edge) {
  const C = SCALE.backdrop;
  const B = { N, west: C.west, south: C.south, step: C.step, layers: [] };
  const P = [0, 0, 0, 0, 0, 0];
  C.layers.forEach((L, k) => {
    const D = L.dist, len = (N - B.west) + D * Math.PI / 2 + (N - B.south);
    const n = Math.ceil(len / B.step) + 1;
    const h = new Float32Array(n);
    // how mountainous the map's own edge is beside each point of the line
    // (its height, smoothed along the line over C.reach metres): the
    // ridgelines stand where the map's range meets its edge, and fall away
    // where its edge is coast (and out past its corners, over the sea)
    const eRaw = new Float32Array(n), eS = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      lineAt(B, D, i * B.step, P);
      const inside = P[0] >= 0 && P[0] <= N + D && P[1] >= 0 && P[1] <= N + D;
      eRaw[i] = inside ? edge(Math.max(0, Math.min(N, P[0])), Math.max(0, Math.min(N, P[1]))) - SEA : -16;
    }
    const w = Math.round(C.reach / B.step);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += eRaw[j]; c++; }
      eS[i] = s / c;
    }
    // (the first ridgeline: where it stands at all, the march stops at it;
    // elsewhere the map's edge runs on past it as far as the view goes)
    const stop = k === 0 ? new Uint8Array(n) : null;
    for (let i = 0; i < n; i++) {
      const u = i * B.step;
      lineAt(B, D, u, P);
      const x = P[0], z = P[1];
      // peaks and saddles along the line, from the seed
      const r = ridged(u / L.wave, k * 13.7 + 3.1, (seed | 0) + 951 + k, 3);
      const det = ridged(u / (L.wave / 3.3), k * 7.9 + 1.3, (seed | 0) + 961 + k, 2);
      // (sharper peaks over broad saddles)
      const shape = Math.pow(Math.max(0, Math.min(1, 0.72 * r + 0.28 * det + 0.12 * fbm(u / 900, k * 5.3, (seed | 0) + 971, 2))), 1.4);
      let hh = L.low + (L.high - L.low) * shape;
      const along = P[3] === 1 && P[2] === 0 ? x : P[2] === 1 && P[3] === 0 ? z : N;
      const mf = smoothstep(C.mount[0], C.mount[1], eS[i]);
      hh *= mf;
      // the first ridgeline: where it stands above the map's own edge (which
      // the march runs on past the edge), the march stops at it; where it is
      // lower the edge runs on and hides it. Where they meet both are the
      // same height, so there is never a gap or a step.
      if (k === 0) stop[i] = hh > eRaw[i] && hh > 1 ? 1 : 0;
      h[i] = SEA + Math.max(-2, hh);
    }
    // the slope along the line, for the faces' lateral lean: at the crest
    // from the line itself, and further down from the line smoothed ever
    // more widely (C.lean.windows metres), so a sharp crest spreads into
    // broad flanks below it, as real spurs do, instead of running straight down
    const dh = [];
    for (const win of C.windows) {
      const hw = Math.max(1, Math.round(win / B.step / 2)), sm = new Float32Array(n), d = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let s = 0, c = 0;
        for (let j = Math.max(0, i - hw); j <= Math.min(n - 1, i + hw); j++) { s += h[j]; c++; }
        sm[i] = s / c;
      }
      for (let i = 0; i < n; i++) d[i] = (sm[Math.min(n - 1, i + 1)] - sm[Math.max(0, i - 1)]) / (2 * B.step);
      dh.push(d);
    }
    B.layers.push({ D, n, h, dh, stop, snow: L.snow, tree: L.tree });
  });
  return B;
}

// The backdrop of a generated world, built once and kept on it.
export function backdropOf(world) {
  if (!world.backdrop) {
    const T = world.terrain, H = T.levels[0].H, NN = world.NN;
    world.backdrop = buildBackdrop(world.seed, world.N, (x, z) => H[Math.round(z) * NN + Math.round(x)]);
  }
  return world.backdrop;
}

// Does the march stop at a point (x, z) past the north or east edge? Only
// past the first ridgeline, and only where that ridgeline stands.
export function stopsAt(B, x, z) {
  const N = B.N, L0 = B.layers[0], D = L0.D, a0 = N - B.west;
  const ox = x > N ? x - N : 0, oz = z > N ? z - N : 0;
  if ((ox > 0 && oz > 0 ? Math.sqrt(ox * ox + oz * oz) : ox + oz) <= D) return false;
  let u;
  if (ox === 0) u = x - B.west;
  else if (oz === 0) u = a0 + D * Math.PI / 2 + (N - z);
  else u = a0 + D * (Math.PI / 2 - Math.atan2(oz, ox));
  const i = Math.round(u / B.step);
  return i >= 0 && i < L0.n && L0.stop[i] === 1;
}

// A ridgeline's height at arc length u.
export function profileAt(Ly, step, u, out) {
  const f = Math.max(0, Math.min(Ly.n - 1.001, u / step)), i = f | 0, a = f - i;
  out[0] = Ly.h[i] + (Ly.h[i + 1] - Ly.h[i]) * a;
  return out;
}

// The face's lean along the line at arc length u, `depth` metres below the
// crest: the slope of the line smoothed over a window that widens with depth.
export function leanAt(Ly, step, u, depth) {
  const W = SCALE.backdrop.windows, nW = W.length;
  let lv = Math.log(Math.max(1, depth) / W[0]) / Math.log(W[1] / W[0]);
  lv = lv < 0 ? 0 : lv > nW - 1 ? nW - 1 : lv;
  const l0 = lv | 0, l1 = Math.min(nW - 1, l0 + 1), t = lv - l0;
  const f = Math.max(0, Math.min(Ly.n - 1.001, u / step)), i = f | 0, a = f - i;
  const A = Ly.dh[l0], B2 = Ly.dh[l1];
  const v0 = A[i] + (A[i + 1] - A[i]) * a, v1 = B2[i] + (B2[i + 1] - B2[i]) * a;
  return v0 + (v1 - v0) * t;
}
