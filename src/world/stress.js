// The stress scene: a load like the real game's, to measure the CPU backend
// against. Never used by the default scene (stress=1 or the X key).
//
// 2048 x 2048 one-metre cells from a constant seed: rolling terrain, a
// mountain range along the north and east edges, one large lake, a river that
// runs down from the mountains by steepest descent (in level steps, with
// small falls), about 6,000 conifers in stands with open meadow between,
// about 400 bushes, 20 torches, a wall with a gate, and a 1,500 m view.
//
// It is a generator: each yield reports progress (0..1), so a worker can post
// it and the page can paint a progress line between steps.
import { fbm, ridged, vnoise, hash2, smoothstep } from './noise.js';
import { makeLevels } from './terrain.js';
import { buildSpans } from './spans.js';
import { conifer, groundAt } from './objects.js';
import { buildClouds } from './sky.js';

export const S_SEED = 20261010;
const N = 2048, NN = N + 1;
const BASE = 40;
const LAKE = { x: 720, z: 860, rx: 330, rz: 215, angle: 0.3, level: 34, depth: 7 };
const WALL_G = { x0: 1180, x1: 1420, z0: 1240, z1: 1243 };
const VIEW = 1500;
const FOREST = { cell: 5, edge: 0.45, bushes: 0.355 };

function lakeDist(x, z) {
  const dx = x - LAKE.x, dz = z - LAKE.z;
  const c = Math.cos(LAKE.angle), s = Math.sin(LAKE.angle);
  const u = (dx * c + dz * s) / LAKE.rx, v = (-dx * s + dz * c) / LAKE.rz;
  const d = Math.sqrt(u * u + v * v);
  return d * (1 + 0.08 * vnoise(x / 160, z / 160, S_SEED + 7) + 0.03 * vnoise(x / 23, z / 23, S_SEED + 8));
}

function natural(x, z) {
  let h = BASE + 14 * fbm(x / 700, z / 700, S_SEED + 1, 3) + 5 * fbm(x / 210, z / 210, S_SEED + 2, 2) + 1.1 * fbm(x / 50, z / 50, S_SEED + 3, 2);
  // the range along the north and east edges
  const t = Math.max(smoothstep(430, 60, N - z), smoothstep(430, 60, N - x));
  if (t > 0) {
    const r = ridged(x / 260, z / 260, S_SEED + 4, 4);
    h += Math.pow(t, 1.3) * (90 + 210 * r) * (0.75 + 0.25 * fbm(x / 500, z / 500, S_SEED + 5, 2));
  }
  return h;
}

export function* buildStressWorld({ render = true } = {}) {
  const t0 = performance.now();
  const ground = new Float32Array(NN * NN);
  const surface = new Float32Array(NN * NN);
  // 1. terrain and the lake basin
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      let h = natural(i, k);
      const dn = lakeDist(i, k);
      if (dn < 1.5) {
        const target = dn >= 0.96 ? LAKE.level + 3 * (dn - 0.96) / 0.54 : LAKE.level - LAKE.depth * smoothstep(0.96, 0.7, dn);
        h += (target - h) * smoothstep(1.5, 1.15, dn);
      }
      ground[k * NN + i] = h;
    }
    if ((k & 127) === 0) yield 0.4 * k / N;
  }
  // 2. level ground along the wall
  const wallGround = groundAt({ ground, N, NN }, (WALL_G.x0 + WALL_G.x1) / 2, (WALL_G.z0 + WALL_G.z1) / 2);
  for (let k = WALL_G.z0 - 20; k <= WALL_G.z1 + 20; k++) {
    for (let i = WALL_G.x0 - 20; i <= WALL_G.x1 + 20; i++) {
      const wz = smoothstep(18, 7, Math.abs(k - (WALL_G.z0 + WALL_G.z1) / 2));
      const wx = smoothstep(WALL_G.x0 - 18, WALL_G.x0 - 5, i) * smoothstep(WALL_G.x1 + 18, WALL_G.x1 + 5, i);
      const j = k * NN + i;
      ground[j] += (wallGround - ground[j]) * wz * wx;
    }
  }
  // 3. the river: from a spring high in the range, down the steepest way
  // (4 m strides), through any hollow toward the lake, into the lake
  // A step must go lower than anywhere the river has been; where none does
  // (a hollow), it takes the lowest step within 45 degrees of the lake.
  const path = [];
  let px = 1690, pz = 1700;
  const hAt = (x, z) => ground[Math.round(z) * NN + Math.round(x)];
  let floor = hAt(px, pz);
  for (let n = 0; n < 4000; n++) {
    path.push([px, pz]);
    if (lakeDist(px, pz) < 0.95) break;
    const toLake = Math.atan2(LAKE.z - pz, LAKE.x - px);
    let best = floor - 0.01, bx = 0, bz = 0, near = Infinity, nx0 = 0, nz0 = 0;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2, nx = px + Math.cos(ang) * 4, nz = pz + Math.sin(ang) * 4;
      if (nx < 4 || nz < 4 || nx > N - 4 || nz > N - 4) continue;
      const h = hAt(nx, nz);
      if (h < best) { best = h; bx = Math.cos(ang) * 4; bz = Math.sin(ang) * 4; }
      const off = Math.abs(Math.atan2(Math.sin(ang - toLake), Math.cos(ang - toLake)));
      if (off <= Math.PI / 4 + 1e-6 && h < near) { near = h; nx0 = Math.cos(ang) * 4; nz0 = Math.sin(ang) * 4; }
    }
    if (!bx && !bz) { bx = nx0; bz = nz0; }
    px += bx; pz += bz;
    floor = Math.min(floor, hAt(px, pz));
  }
  // smooth the path, then carve it: a channel ~11 m wide, with banks that
  // lean back where it cuts through a rise, the water in whole-metre steps
  // that only ever go down. Depths are taken from the land as it was before
  // any carving.
  const pre = ground.slice();
  const preAt = (x, z) => pre[Math.round(z) * NN + Math.round(x)];
  const sm = path.map((p, i) => {
    let sx = 0, sz = 0, c = 0;
    for (let q = Math.max(0, i - 3); q <= Math.min(path.length - 1, i + 3); q++) { sx += path[q][0]; sz += path[q][1]; c++; }
    return [sx / c, sz / c];
  });
  const riverLevel = new Float32Array(NN * NN).fill(-1e9);
  let level = Infinity, bedPrev = Infinity;
  for (let i = 0; i + 1 < sm.length; i++) {
    const [ax, az] = sm[i], [bx, bz] = sm[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let s = 0; s < steps; s++) {
      const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
      let bed = Math.min(bedPrev, preAt(x, z) - 2.2);
      if (lakeDist(x, z) < 1.02) bed = Math.min(bed, LAKE.level - 1.5);
      bedPrev = bed;
      level = Math.min(level, Math.floor(bed + 1.6));
      if (lakeDist(x, z) < 1.1) level = Math.max(LAKE.level, Math.min(level, LAKE.level));
      // banks rise at about 35 degrees beyond the channel, as far as needed
      const R = 7 + Math.min(40, Math.max(0, (preAt(x, z) - bed - 3.36) / 0.7));
      const Ri = Math.ceil(R);
      for (let dz = -Ri; dz <= Ri; dz++) {
        for (let dx = -Ri; dx <= Ri; dx++) {
          const ix = Math.round(x) + dx, iz = Math.round(z) + dz;
          if (ix < 0 || iz < 0 || ix > N || iz > N) continue;
          const r = Math.hypot(ix - x, iz - z);
          if (r > R) continue;
          const j = iz * NN + ix;
          const carved = r <= 7 ? bed + 2.4 * (r / 7) * (r / 7) * 1.4 : bed + 3.36 + (r - 7) * 0.7;
          if (carved < ground[j]) ground[j] = carved;
          if (r < 5.2 && level > riverLevel[j]) riverLevel[j] = level;
        }
      }
    }
  }
  yield 0.5;
  // 4. water: the lake and the river
  const wWater = new Uint8Array(NN * NN);
  let maxH = 0;
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      const g = ground[j];
      let w = -1e9;
      if (g < LAKE.level && lakeDist(i, k) < 1.1) w = LAKE.level;
      if (riverLevel[j] > w && riverLevel[j] > g) w = riverLevel[j];
      const wet = w > g + 0.02;
      surface[j] = wet ? w : g;
      wWater[j] = wet ? 255 : 0;
      if (surface[j] > maxH) maxH = surface[j];
    }
  }
  yield 0.55;
  // 5. fields for drawing (skipped where a thread only walks)
  let tone = null, fine = null, wSand = null, wRock = null, wSnow = null, levels;
  if (render) {
    tone = new Float32Array(NN * NN); fine = new Float32Array(NN * NN);
    wSand = new Uint8Array(NN * NN); wRock = new Uint8Array(NN * NN); wSnow = new Uint8Array(NN * NN);
    for (let k = 0; k <= N; k++) {
      for (let i = 0; i <= N; i++) {
        const j = k * NN + i;
        const tn = fbm(i / 11, k / 11, S_SEED + 21, 3);
        const fn = vnoise(i / 2.1, k / 2.1, S_SEED + 22) * 0.7 + vnoise(i / 0.9, k / 0.9, S_SEED + 23) * 0.3;
        tone[j] = tn; fine[j] = fn;
        const h = ground[j];
        const l = ground[k * NN + Math.max(0, i - 1)], r = ground[k * NN + Math.min(N, i + 1)];
        const d = ground[Math.max(0, k - 1) * NN + i], u = ground[Math.min(N, k + 1) * NN + i];
        const sx = (r - l) / 2, sz = (u - d) / 2;
        const slope = 1 - 1 / Math.sqrt(1 + sx * sx + sz * sz);
        const dn = lakeDist(i, k) + 0.03 * fn;
        const nearRiver = riverLevel[j] > -1e8;
        wSand[j] = 255 * Math.max((1 - smoothstep(1.0, 1.06, dn)) * (h < LAKE.level + 1.2 ? 1 : 0), nearRiver && h < riverLevel[j] + 0.8 ? 1 : 0);
        const high = smoothstep(BASE + 120, BASE + 160, h + 8 * tn);
        wRock[j] = 255 * Math.min(1, smoothstep(0.26, 0.42, slope) + high);
        wSnow[j] = 255 * smoothstep(225, 245, h + 10 * tn) * (1 - smoothstep(0.55, 0.75, slope));
      }
      if ((k & 127) === 0) yield 0.55 + 0.3 * k / N;
    }
    levels = makeLevels(surface, N, false);
  } else {
    levels = [{ n: N, size: 1, H: surface, nx: null, nz: null }];
  }
  const terrain = { N, NN, ground, levels, wWater, wRoad: null, wSand, wRock, wSnow, tone, fine, maxH };
  yield 0.9;
  // 6. the wall and its gate
  const spans = buildSpans(N, { ...WALL_G, base: wallGround - 2, top: wallGround + 6, merlon: 1.5, merlonW: 2, merlonGap: 2 },
    { x0: 1298, x1: 1302, cx: 1300, r: 2, jamb: 2.8, ground: wallGround });
  // 7. conifers in close stands (a jittered 5 m lattice) where the forest
  // field is high, thinning out at the stands' ragged edges
  const trees = [];
  const forest = (x, z) => fbm(x / 240, z / 240, S_SEED + 11, 3) + 0.3 * fbm(x / 70, z / 70, S_SEED + 12, 2);
  for (let gz = 2; gz < N / FOREST.cell - 2; gz++) {
    for (let gx = 2; gx < N / FOREST.cell - 2; gx++) {
      const x = (gx + hash2(gx, gz, S_SEED + 31)) * FOREST.cell, z = (gz + hash2(gx, gz, S_SEED + 32)) * FOREST.cell;
      const f = forest(x, z);
      if (f < FOREST.edge) continue;
      if (hash2(gx, gz, S_SEED + 33) > 0.95 * smoothstep(FOREST.edge, FOREST.edge + 0.08, f)) continue;
      const j = Math.round(z) * NN + Math.round(x);
      if (wWater[j] || riverLevel[j] > -1e8 || lakeDist(x, z) < 1.12) continue;
      const h = ground[j];
      if (h > BASE + 150) continue;
      const sl = Math.abs(ground[j + 1] - ground[j - 1]) + Math.abs(ground[j + NN] - ground[j - NN]);
      if (sl > 1.6) continue;
      if (x > WALL_G.x0 - 12 && x < WALL_G.x1 + 12 && z > WALL_G.z0 - 12 && z < WALL_G.z1 + 12) continue;
      trees.push(conifer(x, z, groundAt(terrain, x, z) - 0.3, trees.length + 77, 1 + 0.15 * hash2(gx, gz, S_SEED + 34)));
    }
  }
  // bushes at the stands' edges
  const bushes = [];
  for (let gz = 1; gz < N / 28 - 1; gz++) {
    for (let gx = 1; gx < N / 28 - 1; gx++) {
      const x = gx * 28 + 28 * hash2(gx, gz, S_SEED + 41), z = gz * 28 + 28 * hash2(gx, gz, S_SEED + 42);
      const f = forest(x, z);
      if (f < FOREST.edge - 0.25 || f > FOREST.edge + 0.02 || hash2(gx, gz, S_SEED + 43) > FOREST.bushes) continue;
      const j = Math.round(z) * NN + Math.round(x);
      if (wWater[j] || riverLevel[j] > -1e8 || ground[j] > BASE + 140) continue;
      bushes.push({ x, z, base: groundAt(terrain, x, z), rx: 1.0 + 0.7 * hash2(gx, gz, 1), ry: 0.75 + 0.5 * hash2(gx, gz, 2), seed: bushes.length });
    }
  }
  // 20 torches: at the gate and along the wall, round the lake, down the river
  const torches = [];
  const torch = (x, z, phase) => { const base = groundAt(terrain, x, z); torches.push({ x, z, base, h: 2.1, flameY: base + 2.1 + 0.18, phase }); };
  torch(1296.3, 1237.6, 0); torch(1303.7, 1237.6, 1.3);
  for (let q = 0; q < 4; q++) torch(WALL_G.x0 + 20 + q * 60, WALL_G.z0 - 2.4, 2 + q);
  for (let q = 0; q < 8; q++) {
    const a = q / 8 * Math.PI * 2;
    // walk out from the centre to just past the shore
    let r = 0.9;
    while (lakeDist(LAKE.x + Math.cos(a) * LAKE.rx * r, LAKE.z + Math.sin(a) * LAKE.rz * r) < 1.08) r += 0.01;
    torch(LAKE.x + Math.cos(a) * LAKE.rx * r, LAKE.z + Math.sin(a) * LAKE.rz * r, 7 + q);
  }
  for (let q = 1; q <= 6; q++) {
    const [x, z] = sm[Math.floor(q * sm.length / 7)];
    torch(x + 9, z + 2, 20 + q);
  }
  yield 0.95;
  // fixed cameras: in the densest stand, across the lake, on the highest top
  const cams = stressCameras(terrain, trees);
  return {
    kind: 'stress', N, NN, center: [1024, 1024], viewDist: VIEW,
    terrain, spans, objects: { trees, bushes, torches, water: LAKE.level }, clouds: buildClouds(768),
    cameras: cams, start: { x: cams[1].x, z: cams[1].z, yaw: cams[1].yaw, pitch: 0 },
    river: sm.length, buildMs: performance.now() - t0,
  };
}

function stressCameras(terrain, trees) {
  const { ground } = terrain;
  // densest stand: tree counts on a 32 m grid
  const G = 32, n = N / G, count = new Int32Array(n * n);
  for (const t of trees) count[Math.floor(t.z / G) * n + Math.floor(t.x / G)]++;
  let best = 0, bi = 0;
  for (let i = 0; i < count.length; i++) {
    const gx = i % n, gz = Math.floor(i / n);
    if (gx < 4 || gz < 4 || gx > n - 14 || gz > n - 14) continue;
    let c = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) c += count[(gz + a) * n + gx + b];
    if (c > best) { best = c; bi = i; }
  }
  // within it, the spot farthest from any trunk, so the eye stands in a gap
  // between crowns rather than inside one
  const cx = (bi % n + 0.5) * G, cz = (Math.floor(bi / n) + 0.5) * G;
  const near = trees.filter((t) => Math.abs(t.x - cx) < 40 && Math.abs(t.z - cz) < 40);
  let fx = cx, fz = cz, room = 0;
  for (let z = cz - 16; z <= cz + 16; z += 0.5) {
    for (let x = cx - 16; x <= cx + 16; x += 0.5) {
      let m = Infinity;
      for (const t of near) m = Math.min(m, Math.hypot(t.x - x, t.z - z));
      if (m > room) { room = m; fx = x; fz = z; }
    }
  }
  // the lake's south shore, looking north at the range
  let r = 1.0;
  const a = -Math.PI / 2 + LAKE.angle;
  const sx = (q) => LAKE.x + Math.cos(a) * LAKE.rx * q, sz = (q) => LAKE.z + Math.sin(a) * LAKE.rz * q;
  while (lakeDist(sx(r), sz(r)) < 1.04) r += 0.005;
  // the highest point in the north-east
  let top = 0, tx = 0, tz = 0;
  for (let k = N - 600; k < N - 20; k += 4) {
    for (let i = N - 600; i < N - 20; i += 4) {
      const h = ground[k * (N + 1) + i];
      if (h > top) { top = h; tx = i; tz = k; }
    }
  }
  return [
    { name: 'stress: dense forest', x: fx, z: fz, yaw: 35, pitch: 0, time: 'day' },
    { name: 'stress: across the lake', x: sx(r), z: sz(r), yaw: 8, pitch: -4, time: 'day' },
    { name: 'stress: ridge-top vista', x: tx, z: tz, yaw: 225, pitch: -9, time: 'day' },
  ];
}
