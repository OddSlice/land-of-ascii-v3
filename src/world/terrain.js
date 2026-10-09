// The terrain: heights on the grid's nodes, the lake, material weights,
// normals, and coarser copies (levels) for distant marching.
import { fbm, ridged, vnoise, smoothstep } from './noise.js';
import { SEED, N, GROUND, WATER, WALL, ROAD, LAKE, HILL, RIDGE } from './layout.js';

export const NN = N + 1;           // nodes per side
export const LEVELS = 4;           // level L has nodes every 2^L metres

// Normalised distance from the lake's centre: 1 at its edge, wobbly.
export function lakeDist(x, z) {
  const dx = x - LAKE.x, dz = z - LAKE.z;
  const c = Math.cos(LAKE.angle), s = Math.sin(LAKE.angle);
  const u = (dx * c + dz * s) / LAKE.rx, v = (-dx * s + dz * c) / LAKE.rz;
  const d = Math.sqrt(u * u + v * v);
  const a = Math.atan2(v, u);
  return d * (1 + 0.09 * vnoise(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2 + 5, SEED + 7)
    + 0.03 * vnoise(x / 9, z / 9, SEED + 8));
}

export function roadDist(x, z) {
  const P = ROAD.points;
  let best = 1e9;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const ex = bx - ax, ez = bz - az;
    let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t);
    if (d < best) best = d;
  }
  return best;
}

function naturalHeight(x, z) {
  let h = GROUND + 0.5 + 1.5 * fbm(x / 160, z / 160, SEED + 1, 3) + 0.35 * fbm(x / 45, z / 45, SEED + 2, 2);
  // long shallow rises toward the west, east and south rims
  const edge = Math.min(x, N - x, z + 40);
  const rim = smoothstep(115, 0, edge);
  h += 17 * rim * rim * (0.8 + 0.2 * fbm(x / 70, z / 70, SEED + 3, 2));
  // one low rounded hill
  const dh = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
  if (dh < 1) h += HILL.h * 0.5 * (1 + Math.cos(dh * Math.PI));
  // the ridge along the north edge
  const t = smoothstep(RIDGE.z0, RIDGE.z1, z);
  if (t > 0) {
    const crest = 0.72 + 0.2 * fbm(x / 120, 3.3, SEED + 4, 3)
      + 0.22 * Math.exp(-(((x - 214) / 52) ** 2)) + 0.15 * Math.exp(-(((x - 350) / 42) ** 2));
    h += RIDGE.h * Math.pow(t, 1.7) * crest + 11 * t * ridged(x / 38, z / 38, SEED + 5, 3) - 4 * t;
  }
  return h;
}

function shapedHeight(x, z) {
  let h = naturalHeight(x, z);
  // the lake: a beach rising from the waterline, a bowl below it
  const dn = lakeDist(x, z);
  if (dn < 1.45) {
    const target = dn >= 0.97
      ? WATER + 1.3 * (dn - 0.97) / 0.48
      : WATER - LAKE.depth * smoothstep(0.97, 0.4, dn);
    const w = smoothstep(1.45, 1.15, dn);
    h += (target - h) * w;
  }
  // level ground along the wall
  const wz = smoothstep(17, 7, Math.abs(z - (WALL.z0 + WALL.z1) / 2));
  const wx = smoothstep(WALL.x0 - 16, WALL.x0 - 4, x) * smoothstep(WALL.x1 + 16, WALL.x1 + 4, x);
  h += (GROUND - h) * wz * wx;
  // the road sits a little lower than the grass
  const rd = roadDist(x, z);
  h -= 0.12 * (1 - smoothstep(ROAD.half, ROAD.half + 1.2, rd));
  return h;
}

// Tent-filter a level into the next coarser one.
function downsample(src, n) {
  const m = (n >> 1);
  const mm = m + 1, nn = n + 1;
  const out = new Float32Array(mm * mm);
  const at = (i, k) => src[Math.min(n, Math.max(0, k)) * nn + Math.min(n, Math.max(0, i))];
  for (let k = 0; k <= m; k++) {
    for (let i = 0; i <= m; i++) {
      const I = i * 2, K = k * 2;
      let s = 4 * at(I, K);
      s += 2 * (at(I - 1, K) + at(I + 1, K) + at(I, K - 1) + at(I, K + 1));
      s += at(I - 1, K - 1) + at(I + 1, K - 1) + at(I - 1, K + 1) + at(I + 1, K + 1);
      out[k * mm + i] = s / 16;
    }
  }
  return out;
}

function normals(H, n, size) {
  const nn = n + 1;
  const nx = new Float32Array(nn * nn), nz = new Float32Array(nn * nn);
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i <= n; i++) {
      const l = H[k * nn + Math.max(0, i - 1)], r = H[k * nn + Math.min(n, i + 1)];
      const d = H[Math.max(0, k - 1) * nn + i], u = H[Math.min(n, k + 1) * nn + i];
      const sx = (r - l) / ((Math.min(n, i + 1) - Math.max(0, i - 1)) * size);
      const sz = (u - d) / ((Math.min(n, k + 1) - Math.max(0, k - 1)) * size);
      const len = Math.sqrt(sx * sx + sz * sz + 1);
      nx[k * nn + i] = -sx / len;
      nz[k * nn + i] = -sz / len;
    }
  }
  return { nx, nz };
}

export function buildTerrain() {
  const ground = new Float32Array(NN * NN);     // true ground, for walking
  const surface = new Float32Array(NN * NN);    // ground or lake surface, for drawing
  const wWater = new Uint8Array(NN * NN);
  const wRoad = new Uint8Array(NN * NN);
  const wSand = new Uint8Array(NN * NN);
  const wRock = new Uint8Array(NN * NN);
  const wSnow = new Uint8Array(NN * NN);
  const tone = new Float32Array(NN * NN);       // patchy variation, -1..1
  const fine = new Float32Array(NN * NN);       // fine variation and material dither, -1..1

  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      const h = shapedHeight(i, k);
      ground[j] = h;
      const dn = lakeDist(i, k);
      const wet = dn < 1.05 && h < WATER;
      surface[j] = wet ? WATER : h;
      wWater[j] = wet ? 255 : 0;
      tone[j] = fbm(i / 11, k / 11, SEED + 21, 3);
      fine[j] = vnoise(i / 2.1, k / 2.1, SEED + 22) * 0.7 + vnoise(i / 0.9, k / 0.9, SEED + 23) * 0.3;
    }
  }

  const levels = [];
  let H = surface, n = N;
  for (let L = 0; L < LEVELS; L++) {
    const size = 1 << L;
    const { nx, nz } = normals(H, n, size);
    levels.push({ n, size, H, nx, nz });
    if (L + 1 < LEVELS) { H = downsample(H, n); n >>= 1; }
  }

  // material weights from the finished ground
  const { nx, nz } = levels[0];
  let maxH = 0;
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      const j = k * NN + i;
      const h = ground[j];
      if (surface[j] > maxH) maxH = surface[j];
      const ny = Math.sqrt(Math.max(0, 1 - nx[j] * nx[j] - nz[j] * nz[j]));
      const slope = 1 - ny;
      const rd = k < 170 ? roadDist(i, k) : 99;
      wRoad[j] = 255 * (1 - smoothstep(ROAD.half - ROAD.soft / 2, ROAD.half + ROAD.soft / 2, rd));
      const dn = lakeDist(i, k) + 0.04 * fine[j];
      wSand[j] = 255 * (1 - smoothstep(1.1, 1.22, dn)) * (h < WATER + 1.6 ? 1 : 0);
      const high = smoothstep(GROUND + 28, GROUND + 52, h);
      wRock[j] = 255 * Math.min(1, smoothstep(0.24, 0.40, slope) + 0.75 * high);
      const snowLine = h + 7 * tone[j];
      wSnow[j] = 255 * smoothstep(86, 96, snowLine) * (1 - smoothstep(0.42, 0.6, slope));
    }
  }

  return { ground, levels, wWater, wRoad, wSand, wRock, wSnow, tone, fine, maxH };
}
