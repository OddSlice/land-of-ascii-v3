// The terrain: heights on the grid's nodes, the lake, material weights,
// normals, and coarser copies (levels) for distant marching.
import { fbm, ridged, vnoise, smoothstep } from './noise.js';
import { SEED, N, GROUND, WATER, WALL, ROAD, LAKE, HILL, RIDGE } from './layout.js';

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
  let h = GROUND + 0.5 + 1.5 * fbm(x / 160, z / 160, SEED + 1, 3) + 0.9 * fbm(x / 55, z / 55, SEED + 2, 2) + 0.25 * fbm(x / 18, z / 18, SEED + 9, 2);
  // long shallow rises toward the west, east and south rims
  const edge = Math.min(x, N - x, z + 40);
  const rim = smoothstep(115, 0, edge);
  h += 17 * rim * rim * (0.8 + 0.2 * fbm(x / 70, z / 70, SEED + 3, 2));
  // one low rounded hill
  const dh = Math.hypot(x - HILL.x, z - HILL.z) / HILL.r;
  if (dh < 1) h += HILL.h * 0.5 * (1 + Math.cos(dh * Math.PI));
  // the ridge along the north edge: a rising massif and a few peaks on it,
  // carved by ridged noise into ribs and gullies
  const t = smoothstep(RIDGE.z0, RIDGE.z1, z);
  const foot = smoothstep(RIDGE.z0 - 70, RIDGE.z0 + 50, z);
  if (foot > 0) {
    let peak = 0;
    for (const [px, pz, ph, pr] of RIDGE.peaks) {
      const u = Math.hypot(x - px, (z - pz) * 1.1) / pr;
      if (u < 3.5) peak = Math.max(peak, ph * Math.exp(-1.5 * u));
    }
    peak *= foot;
    const rib = ridged(x / 30, z / 36, SEED + 5, 4);
    h += RIDGE.base * Math.pow(t, 1.3) * (0.75 + 0.25 * fbm(x / 80, 7.7, SEED + 4, 3));
    h += peak * (0.85 + 0.15 * fbm(x / 26, z / 26, SEED + 6, 2)) + foot * t * (7 + peak * 0.3) * (rib - 0.35);
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
      : WATER - LAKE.depth * smoothstep(0.97, 0.72, dn);
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
export function downsample(src, n) {
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

export function normals(H, n, size) {
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

// The drawn surface at every level, with normals (levels without normals get
// them computed where a ray lands).
export function makeLevels(surface, N0, withNormals = true) {
  const levels = [];
  let H = surface, n = N0;
  for (let L = 0; L < LEVELS; L++) {
    const size = 1 << L;
    const nrm = withNormals ? normals(H, n, size) : { nx: null, nz: null };
    levels.push({ n, size, H, nx: nrm.nx, nz: nrm.nz });
    if (L + 1 < LEVELS) { H = downsample(H, n); n >>= 1; }
  }
  return levels;
}

export function buildTerrain() {
  const NN = N + 1;
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

  const levels = makeLevels(surface, N);

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
      const dn = lakeDist(i, k) + 0.03 * fine[j] + 0.02 * tone[j];
      wSand[j] = 255 * (1 - smoothstep(1.01, 1.06, dn)) * (h < WATER + 1.0 ? 1 : 0);
      const high = smoothstep(GROUND + 26, GROUND + 44, h + 6 * tone[j]);
      wRock[j] = 255 * Math.min(1, smoothstep(0.26, 0.42, slope) + high);
      const snowLine = h + 6 * tone[j];
      wSnow[j] = 255 * smoothstep(80, 90, snowLine) * (1 - smoothstep(0.55, 0.75, slope));
    }
  }

  return { N, NN, ground, levels, wWater, wRoad, wSand, wRock, wSnow, tone, fine, maxH };
}
