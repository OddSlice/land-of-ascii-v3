// The wild ground detail (phase 4b), placed by habitat from the seed:
// - boulders, singly and in loose fields below rocky slopes and along the
//   rivers, and a few alone in the meadow;
// - outcrops of bedded rock breaking through steep meadow;
// - fallen logs and stumps inside the forests and at their edges;
// - beds of reeds along slow water and lake margins;
// - drifts of flowers in the meadow, in three muted tones that follow
//   moisture and aspect (ground weights, not shapes).
// Everything keeps off the roads, footpaths, fields, greens, yards,
// villages, the fort, bridges and jetties, and clear of tree trunks and of
// each other, sparse enough that the meadow stays open. The pieces are
// building-kit pieces (kit-wild.js); the flowers are two arrays the ground
// is drawn from (shade.js).
import { SCALE } from '../scale.js';
import { hash2, vnoise } from '../noise.js';
import { KIND } from './water.js';
import { heightAt } from './sites.js';
import { fieldAt } from './plants.js';
import { inPoly } from './fort.js';

const W = SCALE.wild;

export function placeWild(env) {
  const { N, H, kind, level, freshDist, F, thr, trees, roadDist, wPath, wField, bare, cleared, wYard, wRock, wSand, seed, avoid } = env;
  const NN = N + 1;
  const r = (a, b, k) => hash2(a, b, seed + 7700 + k);
  const gAt = (x, z) => heightAt(H, N, x, z);
  const idx = (x, z) => Math.round(z) * NN + Math.round(x);
  const slopeAt = (x, z) => Math.hypot(gAt(x + 1, z) - gAt(x - 1, z), gAt(x, z + 1) - gAt(x, z - 1)) / 2;
  const forest = (x, z) => fieldAt(F, x, z) - thr;
  // trunks in 8 m squares
  const TB = 8, tn = Math.ceil((N + 1) / TB), tcell = Array.from({ length: tn * tn }, () => []);
  for (const t of trees) { const a = Math.min(tn - 1, Math.floor(t.x / TB)), b = Math.min(tn - 1, Math.floor(t.z / TB)); tcell[b * tn + a].push(t); }
  const nearTrunk = (x, z, d) => {
    const a0 = Math.floor((x - d) / TB), a1 = Math.floor((x + d) / TB), b0 = Math.floor((z - d) / TB), b1 = Math.floor((z + d) / TB);
    for (let b = Math.max(0, b0); b <= Math.min(tn - 1, b1); b++) for (let a = Math.max(0, a0); a <= Math.min(tn - 1, a1); a++) {
      for (const t of tcell[b * tn + a]) if (Math.hypot(t.x - x, t.z - z) < d + 0.35) return true;
    }
    return false;
  };
  // what has been placed, in 8 m squares (to keep pieces apart)
  const placed = new Map();
  const key = (a, b) => a * 65536 + b;
  const crowded = (x, z, rad, gap) => {
    const a0 = Math.floor((x - rad - 8) / 8), a1 = Math.floor((x + rad + 8) / 8), b0 = Math.floor((z - rad - 8) / 8), b1 = Math.floor((z + rad + 8) / 8);
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const l = placed.get(key(a, b));
      if (l) for (const [px, pz, pr] of l) if (Math.hypot(px - x, pz - z) < pr + rad + gap) return true;
    }
    return false;
  };
  const mark = (x, z, rad) => { const k = key(Math.floor(x / 8), Math.floor(z / 8)); if (!placed.has(k)) placed.set(k, []); placed.get(k).push([x, z, rad]); };
  // land a piece may stand on: dry, off every way, field, village, yard
  const clear = (x, z, rad, wet = false) => {
    const pad = rad + W.clear;
    if (x < pad + 2 || z < pad + 2 || x > N - pad - 2 || z > N - pad - 2) return false;
    for (const [dx, dz] of [[0, 0], [pad, 0], [-pad, 0], [0, pad], [0, -pad], [pad * 0.7, pad * 0.7], [-pad * 0.7, pad * 0.7], [pad * 0.7, -pad * 0.7], [-pad * 0.7, -pad * 0.7]]) {
      const j = idx(x + dx, z + dz);
      if (!wet && kind[j] !== KIND.NONE) return false;
      if (wPath[j] || wField[j] || bare[j] || (wYard && wYard[j])) return false;
      if (roadDist[j] < SCALE.road.width / 2 + 1) return false;
    }
    if (roadDist[idx(x, z)] < SCALE.road.width / 2 + rad + W.roadClear) return false;
    if (inPoly(cleared, x, z)) return false;
    for (const A of avoid) if (Math.hypot(A[0] - x, A[1] - z) < A[2] + rad) return false;
    return true;
  };
  const pieces = [];
  let sn = 0;

  // ---- boulders -----------------------------------------------------------------------
  // by the habitat: below rock (a steep, rocky slope higher up within 30 m),
  // along a river (within 2.5-10 m of its water), else the open meadow; in
  // loose fields where a slow noise says so
  const B = W.boulder, G = B.grid;
  const rockAbove = (x, z, g) => {
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      for (const d of [8, 16, 26]) {
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (px < 1 || pz < 1 || px > N - 1 || pz > N - 1) continue;
        const j = idx(px, pz);
        if (wRock[j] > 150 && H[j] > g + 3) return true;
      }
    }
    return false;
  };
  const riverNear = (x, z) => {
    const j = idx(x, z);
    if (freshDist[j] < 2.5 || freshDist[j] > 10) return false;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, px = x + Math.cos(a) * (freshDist[j] + 1.5), pz = z + Math.sin(a) * (freshDist[j] + 1.5); if (px > 0 && pz > 0 && px < N && pz < N && kind[idx(px, pz)] === KIND.RIVER) return true; }
    return false;
  };
  for (let gz = 2; gz * G < N - 2; gz++) for (let gx = 2; gx * G < N - 2; gx++) {
    const x = (gx + r(gx, gz, 1)) * G, z = (gz + r(gx, gz, 2)) * G;
    const j = idx(x, z);
    if (kind[j] !== KIND.NONE || wRock[j] > 90 || (wSand && wSand[j] > 160)) continue;
    const g = H[j], sl = slopeAt(x, z);
    if (sl > B.steep) continue;
    const field = vnoise(x / B.cluster, z / B.cluster, seed + 7711);
    let p = B.lone;
    let hab = 'meadow';
    if (field > B.fieldAt && rockAbove(x, z, g)) { p = B.belowRock; hab = 'rock'; }
    else if (field > B.fieldAt - 0.1 && riverNear(x, z)) { p = B.river; hab = 'river'; }
    if (forest(x, z) > 0.02) p *= 0.35;
    if (r(gx, gz, 3) >= p) continue;
    // the size: small, medium, large (large where rock is above)
    const c = r(gx, gz, 4), big = hab === 'rock' ? 0.18 : 0.06;
    const [rr, hh] = c < big ? [B.large, B.largeH] : c < big + 0.35 ? [B.medium, B.mediumH] : [B.small, B.smallH];
    const rad = rr[0] + (rr[1] - rr[0]) * r(gx, gz, 5), h = hh[0] + (hh[1] - hh[0]) * r(gx, gz, 6);
    if (!clear(x, z, rad) || nearTrunk(x, z, rad + 0.8) || crowded(x, z, rad * 1.5, B.gap)) continue;
    // the ground's highest and lowest under it
    let top = -Infinity, low = Infinity;
    for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) { const y = gAt(x + dx, z + dz); if (y > top) top = y; if (y < low) low = y; }
    if (top - low > Math.max(0.35, h * 0.6)) continue;
    pieces.push({ kind: 'boulder', at: [x, z], a: r(gx, gz, 7) * Math.PI * 2, r: rad, h, top: (top + low) / 2, low, seed: 8000 + sn++, hab });
    mark(x, z, rad * 1.5);
  }

  // ---- outcrops -----------------------------------------------------------------------
  const O = W.outcrop;
  for (let gz = 1; gz * O.grid < N - 2; gz++) for (let gx = 1; gx * O.grid < N - 2; gx++) {
    const x = (gx + r(gx, gz, 11)) * O.grid, z = (gz + r(gx, gz, 12)) * O.grid;
    const j = idx(x, z);
    if (kind[j] !== KIND.NONE || wRock[j] > 90 || forest(x, z) > -0.02) continue;
    const sl = slopeAt(x, z);
    if (sl < O.slope[0] || sl > O.slope[1]) continue;
    if (r(gx, gz, 13) >= O.chance * (0.5 + vnoise(x / 90, z / 90, seed + 7712))) continue;
    const rad = O.r[0] + (O.r[1] - O.r[0]) * r(gx, gz, 14), h = O.h[0] + (O.h[1] - O.h[0]) * r(gx, gz, 15);
    if (!clear(x, z, rad * 2.2) || nearTrunk(x, z, rad * 2.2) || crowded(x, z, rad * 2.2, 2)) continue;
    // along the contour
    const gx2 = gAt(x + 1, z) - gAt(x - 1, z), gz2 = gAt(x, z + 1) - gAt(x, z - 1), a = Math.atan2(gz2, gx2) + Math.PI / 2;
    const ground = [];
    for (let k = 0; k < 5; k++) { const al = (k - 2) * rad; ground.push(gAt(x + Math.cos(a) * al, z + Math.sin(a) * al)); }
    pieces.push({ kind: 'outcrop', at: [x, z], a, r: rad, h, top: gAt(x, z), ground, seed: 8600 + sn++ });
    mark(x, z, rad * 2.2);
  }

  // ---- logs and stumps ------------------------------------------------------------------
  const L = W.log, S = W.stump;
  for (let gz = 1; gz * L.grid < N - 2; gz++) for (let gx = 1; gx * L.grid < N - 2; gx++) {
    const x = (gx + r(gx, gz, 21)) * L.grid, z = (gz + r(gx, gz, 22)) * L.grid;
    const f = forest(x, z);
    if (f < L.edge) continue;
    const j = idx(x, z);
    if (kind[j] !== KIND.NONE || wRock[j] > 120) continue;
    const c = r(gx, gz, 23);
    if (c < L.chance) {
      const len = L.len[0] + (L.len[1] - L.len[0]) * r(gx, gz, 24), rad = L.r[0] + (L.r[1] - L.r[0]) * r(gx, gz, 25);
      // along the contour, so it lies level
      const sx = gAt(x + 1, z) - gAt(x - 1, z), sz = gAt(x, z + 1) - gAt(x, z - 1);
      const a = (Math.hypot(sx, sz) > 0.02 ? Math.atan2(sz, sx) + Math.PI / 2 : r(gx, gz, 26) * Math.PI) + (r(gx, gz, 27) - 0.5) * 0.4;
      const ca = Math.cos(a), sa = Math.sin(a);
      let ok = clear(x, z, len / 2) && !crowded(x, z, len / 2, 1.5);
      const ys = [];
      for (let k = -2; k <= 2 && ok; k++) {
        const px = x + ca * len / 4 * k, pz = z + sa * len / 4 * k;
        if (nearTrunk(px, pz, rad + 0.5) || kind[idx(px, pz)] !== KIND.NONE) ok = false;
        ys.push(gAt(px, pz));
      }
      if (!ok || Math.max(...ys) - Math.min(...ys) > L.level) continue;
      pieces.push({ kind: 'log', at: [x, z], a, len, r: rad, base: ys.reduce((p, y) => p + y, 0) / ys.length - 0.04, seed: 9000 + sn++ });
      mark(x, z, len / 2);
    } else if (c < L.chance + S.chance) {
      const rad = S.r[0] + (S.r[1] - S.r[0]) * r(gx, gz, 28), h = S.h[0] + (S.h[1] - S.h[0]) * r(gx, gz, 29);
      if (!clear(x, z, rad) || nearTrunk(x, z, rad + 0.9) || crowded(x, z, rad, 1.5)) continue;
      let top = -Infinity, low = Infinity;
      for (const [dx, dz] of [[0, 0], [rad, 0], [-rad, 0], [0, rad], [0, -rad]]) { const y = gAt(x + dx, z + dz); if (y > top) top = y; if (y < low) low = y; }
      pieces.push({ kind: 'stump', at: [x, z], r: rad, h, top, low, seed: 9400 + sn++ });
      mark(x, z, rad);
    }
  }

  // ---- reed beds ------------------------------------------------------------------------
  // in shallow, slow water by its edge: a lake's, or a river's where its
  // level barely falls; in beds of two to four rounds where a noise says so
  const R = W.reeds;
  const slow = (x, z) => {
    const j = idx(x, z);
    if (kind[j] === KIND.LAKE) return true;
    if (kind[j] !== KIND.RIVER) return false;
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) { const k = idx(x + dx, z + dz); if (kind[k] !== KIND.RIVER) continue; lo = Math.min(lo, level[k]); hi = Math.max(hi, level[k]); }
    return hi - lo < R.slow;
  };
  for (let gz = 1; gz * R.grid < N - 2; gz++) for (let gx = 1; gx * R.grid < N - 2; gx++) {
    const x = (gx + r(gx, gz, 31)) * R.grid, z = (gz + r(gx, gz, 32)) * R.grid;
    const j = idx(x, z);
    if (kind[j] !== KIND.LAKE && kind[j] !== KIND.RIVER) continue;
    const depth = level[j] - H[j];
    if (depth < R.depth[0] || depth > R.depth[1]) continue;
    // by the edge: land within a few metres
    let shore = false;
    for (let k = 0; k < 8 && !shore; k++) { const a = k * Math.PI / 4, px = x + Math.cos(a) * R.edge, pz = z + Math.sin(a) * R.edge; if (kind[idx(px, pz)] === KIND.NONE) shore = true; }
    if (!shore || !slow(x, z)) continue;
    if (vnoise(x / R.cluster, z / R.cluster, seed + 7713) < R.at || r(gx, gz, 33) > R.chance) continue;
    const n = 2 + Math.floor(r(gx, gz, 34) * 3), base = level[j];
    for (let k = 0; k < n; k++) {
      const a = r(gx, gz, 40 + k) * Math.PI * 2, d = k === 0 ? 0 : R.r[1] * (0.8 + 0.5 * r(gx, gz, 50 + k));
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, pj = idx(px, pz);
      const rad = R.r[0] + (R.r[1] - R.r[0]) * r(gx, gz, 60 + k), h = R.h[0] + (R.h[1] - R.h[0]) * r(gx, gz, 70 + k);
      // its middle in the shallow water or on the wet edge
      if (kind[pj] === KIND.NONE ? H[pj] > base + 0.3 : level[pj] - H[pj] > R.depth[1]) continue;
      if (!clear(px, pz, rad, true) || crowded(px, pz, rad, 0.2)) continue;
      pieces.push({ kind: 'reeds', at: [px, pz], r: rad, h, base, seed: 9800 + sn++ });
      mark(px, pz, rad);
    }
  }

  // ---- flowers ------------------------------------------------------------------------
  // weights (0..255) and kinds (1 yellow on the drier, sunnier slopes; 2
  // lilac in the damp; 3 pale on the flat), worked out on a 2 m grid and
  // filled in between
  const FL = W.flowers, C2 = 2, cn = Math.floor(N / C2) + 1;
  const cw = new Float32Array(cn * cn), ck = new Uint8Array(cn * cn);
  const sun = FL.aspect;
  for (let k = 0; k < cn; k++) for (let i = 0; i < cn; i++) {
    const x = i * C2, z = k * C2, j = Math.min(N, z) * NN + Math.min(N, x);
    if (kind[j] !== KIND.NONE || wRock[j] > 40 || (wSand && wSand[j] > 40) || wField[j] || wPath[j] || bare[j] || (wYard && wYard[j]) || roadDist[j] < SCALE.road.width / 2 + 2) continue;
    const fo = forest(x, z);
    if (fo > -0.02) continue;
    const d = vnoise(x / FL.drift, z / FL.drift, seed + 7714) * 0.75 + vnoise(x / (FL.drift * 0.37), z / (FL.drift * 0.37), seed + 7715) * 0.25;
    // (thinning out toward the forest's edge and the roads, never cut off)
    const m = smoothstep(FL.at, FL.at + FL.soft, d) * smoothstep(-0.02, -0.1, fo) * smoothstep(SCALE.road.width / 2 + 2, SCALE.road.width / 2 + 8, roadDist[j]);
    if (m <= 0) continue;
    const gx2 = (gAt(x + 2, z) - gAt(x - 2, z)) / 4, gz2 = (gAt(x, z + 2) - gAt(x, z - 2)) / 4;
    const wet = freshDist[j] < FL.wet;
    const facing = -(gx2 * sun[0] + gz2 * sun[1]);
    const hollow = gAt(x, z) < (gAt(x + 12, z) + gAt(x - 12, z) + gAt(x, z + 12) + gAt(x, z - 12)) / 4 - FL.hollow;
    ck[k * cn + i] = wet || hollow ? 2 : facing > FL.sunny ? 1 : 3;
    cw[k * cn + i] = m;
  }
  const wFlower = new Uint8Array(NN * NN), flowerKind = new Uint8Array(NN * NN);
  let flowerCells = 0;
  for (let z = 0; z <= N; z++) {
    const k0 = Math.min(cn - 2, Math.floor(z / C2)), fz = z / C2 - k0;
    for (let x = 0; x <= N; x++) {
      const i0 = Math.min(cn - 2, Math.floor(x / C2)), fx = x / C2 - i0;
      const a = cw[k0 * cn + i0], b = cw[k0 * cn + i0 + 1], c = cw[(k0 + 1) * cn + i0], dd = cw[(k0 + 1) * cn + i0 + 1];
      const w = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + dd * fx) * fz;
      if (w <= 0.02) continue;
      const j = z * NN + x;
      // (the kind of the nearest corner with flowers)
      const nk = ck[(k0 + (fz > 0.5 ? 1 : 0)) * cn + i0 + (fx > 0.5 ? 1 : 0)] || ck[k0 * cn + i0] || ck[k0 * cn + i0 + 1] || ck[(k0 + 1) * cn + i0] || ck[(k0 + 1) * cn + i0 + 1];
      if (!nk || kind[j] !== KIND.NONE || wField[j] || wPath[j] || bare[j]) continue;
      wFlower[j] = Math.round(255 * Math.min(1, w)); flowerKind[j] = nk;
      if (w > 0.5) flowerCells++;
    }
  }
  return { pieces, wFlower, flowerKind, flowerCells };
}

const smoothstep = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
