// What a hit looks like: material, light, shadows, torchlight, detail, and
// the record it is written to. Shared by the direct rays (record R0) and the
// mirrored ones (R1). A direct ray that meets water also writes the surface
// (R0), marches its refracted ray down to the bed (R2) and leaves a mirrored
// row for reflect.js.
import { MAT, HIT_STRIDE, REC } from '../../contract.js';
import { TORCH_RANGE } from './light.js';
import { rippleSlope, waterRays } from './water.js';
import { bil2, bil1, bilU8 } from './sample.js';
import { vnoise, hash2 } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';
import { LOOK } from '../../look.js';

const MEADOW = LOOK.meadow;

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
// detail of a given size fades as the cell's footprint grows past it
const fadeOf = (size, fp) => 1 - smooth(size * 0.3, size * 1.1, fp);
const NRM = [0, 0];

// Normal of a level without stored normals, from its heights around (x, z).
function normalAt(level, x, z) {
  const e = 0.5 * level.size;
  const sx = (bil2(level, level.H, x + e, z) - bil2(level, level.H, x - e, z)) / (2 * e);
  const sz = (bil2(level, level.H, x, z + e) - bil2(level, level.H, x, z - e)) / (2 * e);
  const len = Math.sqrt(sx * sx + sz * sz + 1);
  NRM[0] = -sx / len; NRM[1] = -sz / len;
  return NRM;
}

const methods = {
  write(ci, slot, mat, light, shadow, cloud, glow, tone, dist) {
    const h = this.hits, o = ci * HIT_STRIDE + slot * REC;
    h[o] = mat;
    h[o + 1] = light <= 0 ? 0 : light >= 1 ? 255 : (light * 255 + 0.5) | 0;
    h[o + 2] = shadow <= 0 ? 0 : shadow >= 1 ? 255 : (shadow * 255 + 0.5) | 0;
    h[o + 3] = cloud <= 0 ? 0 : cloud >= 1 ? 255 : (cloud * 255 + 0.5) | 0;
    h[o + 4] = glow <= 0 ? 0 : glow >= 1 ? 255 : (glow * 255 + 0.5) | 0;
    const tb = 128 + tone * 127;
    h[o + 5] = tb <= 0 ? 0 : tb >= 255 ? 255 : (tb + 0.5) | 0;
    const dd = dist * 10 + 0.5;
    const du = dd >= 65534 ? 65534 : dd | 0;
    h[o + 6] = du & 255; h[o + 7] = du >> 8;
  },

  // Which torches can light each 16 m square of the map (a point off the map
  // uses the nearest square: no torch nearer the point is missed that way).
  buildTorchGrid(ts) {
    const G = 16, n = Math.ceil(this.world.N / G), R = TORCH_RANGE;
    const cells = Array.from({ length: n * n }, () => []);
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        for (let i = 0; i < ts.length; i++) {
          const ddx = Math.max(gx * G - ts[i].x, 0, ts[i].x - (gx + 1) * G);
          const ddz = Math.max(gz * G - ts[i].z, 0, ts[i].z - (gz + 1) * G);
          if (ddx * ddx + ddz * ddz <= R * R) cells[gz * n + gx].push(i);
        }
      }
    }
    this.tg = { G, n, cells: cells.map((c) => Int16Array.from(c)) };
  },

  glowAt(x, y, z, nx, ny, nz) {
    const ts = this.torches, tg = this.tg;
    let gx = Math.floor(x / tg.G), gz = Math.floor(z / tg.G);
    gx = gx < 0 ? 0 : gx >= tg.n ? tg.n - 1 : gx;
    gz = gz < 0 ? 0 : gz >= tg.n ? tg.n - 1 : gz;
    const list = tg.cells[gz * tg.n + gx];
    let sum = 0;
    for (let k = 0; k < list.length; k++) {
      const t = ts[list[k]];
      const lx = t.x - x, ly = t.y - y, lz = t.z - z;
      const d2 = lx * lx + ly * ly + lz * lz;
      if (d2 >= TORCH_RANGE * TORCH_RANGE) continue;
      const d = Math.sqrt(d2);
      const f = 1 - d / TORCH_RANGE;
      const c = d > 1e-6 ? (lx * nx + ly * ny + lz * nz) / d : 1;
      sum += f * f * (0.35 + 0.65 * Math.max(0, c)) * t.power;
    }
    return sum;
  },

  // Distance written for a hit: from the eye for a direct ray, from the water
  // for a mirrored one.
  legOf(rs, r, D, len) { return rs.slot === 0 ? D * len : (D - rs.act[r]) * len; },

  setDepth(rs, ci, D) { if (rs.slot === 0) this.rays.depth[ci] = D; else this.rays.rdepth[ci] = D; },

  ground(rs, r, ci, D, s, L, beta) {
    const { v, world, light } = this;
    const T = world.terrain;
    const x = v.ex + this.dx * D, z = v.ez + this.dz * D, y = rs.ey + s * D;
    const lv = T.levels;
    let nx, nz;
    if (lv[L].nx) {
      nx = bil2(lv[L], lv[L].nx, x, z); nz = bil2(lv[L], lv[L].nz, x, z);
      if (beta > 0) {
        nx += (bil2(lv[L + 1], lv[L + 1].nx, x, z) - nx) * beta;
        nz += (bil2(lv[L + 1], lv[L + 1].nz, x, z) - nz) * beta;
      }
    } else {
      const n0 = normalAt(lv[L], x, z); nx = n0[0]; nz = n0[1];
      if (beta > 0) { const n1 = normalAt(lv[L + 1], x, z); nx += (n1[0] - nx) * beta; nz += (n1[1] - nz) * beta; }
    }
    let ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const len = Math.sqrt(1 + s * s);
    this.setDepth(rs, ci, D);
    // footprint of the cell on the ground, for fading detail that would alias
    const graze = Math.abs(this.dx * nx + s * ny + this.dz * nz) / len;
    const fp = D * len * v.colAngle / Math.max(0.04, graze);
    const N = this.N, NN = this.NN;
    const tk = T.toneK || 1;          // the generated world keeps detail as small integers
    const fine = bil1(T.fine, x, z, N, NN) * tk;
    const jitter = fine * fadeOf(1.5, fp);
    let mat;
    // a square of nothing but grass (or forest floor) needs no weighing
    let code = 0;
    if (T.code) {
      const u = x < 0 ? 0 : x > N - 1e-6 ? N - 1e-6 : x, w = z < 0 ? 0 : z > N - 1e-6 ? N - 1e-6 : z;
      code = T.code[(w | 0) * N + (u | 0)];
    }
    if (code === 1) mat = MAT.GRASS;
    else if (code === 2) mat = MAT.FLOOR;
    else if (bilU8(T.wWater, x, z, N, NN) > 0.5) mat = MAT.WATER;
    else if (T.wRoad && bilU8(T.wRoad, x, z, N, NN) > 0.5 + 0.22 * jitter) mat = MAT.DIRT;
    else if (bilU8(T.wSand, x, z, N, NN) > 0.5 + 0.25 * jitter) mat = MAT.SAND;
    else if (bilU8(T.wSnow, x, z, N, NN) > 0.5 + 0.3 * jitter) mat = MAT.SNOW;
    else if (bilU8(T.wRock, x, z, N, NN) > 0.5 + 0.3 * jitter) mat = MAT.ROCK;
    else if (T.wFloor && bilU8(T.wFloor, x, z, N, NN) > 0.5 + 0.3 * jitter) mat = MAT.FLOOR;
    else mat = MAT.GRASS;
    const Ld = light.L;
    const shadow = (bil2(lv[L], light.S[L], x, z) * (1 - beta) + (beta > 0 ? bil2(lv[L + 1], light.S[L + 1], x, z) * beta : 0)) * light.sK;
    const cloud = light.cloudAt(x, z);
    let lam, tone;
    if (mat === MAT.WATER) {
      if (rs.slot === 0) { this.water(ci, D, s, x, y, z, shadow, cloud); return; }
      // a mirrored ray meeting water again is not mirrored twice
      nx = 0; ny = 1; nz = 0;
      lam = Ld[1];
      const c = Math.min(1, Math.abs(s) / len);
      tone = (0.02 + 0.98 * Math.pow(1 - c, 5)) * 2 - 1;
    } else {
      lam = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
      if (lam < 0) lam = 0;
      const patch = bil1(T.tone, x, z, N, NN) * tk;
      if (mat === MAT.ROCK) tone = 0.3 * Math.sin(y * 0.9 + patch * 4) * fadeOf(3, fp) + 0.6 * patch + 0.3 * fine * fadeOf(2, fp);
      else tone = 0.75 * patch * fadeOf(5, fp) + 0.45 * fine * fadeOf(1.8, fp);
      // (judged by the cell's footprint along the view, where rows are tall)
      if (mat === MAT.GRASS && this.meadow > 0) tone += this.mottle(x, z, fp * v.rowAngle / v.colAngle);
    }
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, rs.slot, mat, lam, shadow, cloud, glow, tone, this.legOf(rs, r, D, len));
  },

  // Meadow mottling (LOOK.meadow): soft patches several metres across and,
  // near the eye, sparse tufts, both fixed to the land and faded out as the
  // cell's footprint grows past them.
  mottle(x, z, fp) {
    const k = this.meadow;
    let t = 0;
    const fPatch = fadeOf(7, fp);
    if (fPatch > 0) t += MEADOW.patch[k] * fPatch * ((vnoise(x / 9.5, z / 7.3, SEED + 121) * 0.7 + vnoise(x / 4.1 + 13, z / 3.6, SEED + 122) * 0.3) * 2 - 1);
    // tufts: small dark clumps with an uneven outline, one in some of the
    // 1.2 m squares
    const fTuft = fadeOf(0.5, fp);
    if (fTuft > 0) {
      const gx = Math.floor(x / 1.2), gz = Math.floor(z / 1.2);
      if (hash2(gx, gz, SEED + 123) < MEADOW.tufts[k]) {
        const cx = (gx + 0.25 + 0.5 * hash2(gx, gz, SEED + 124)) * 1.2, cz = (gz + 0.25 + 0.5 * hash2(gx, gz, SEED + 125)) * 1.2;
        const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz);
        const r = (0.13 + 0.12 * hash2(gx, gz, SEED + 126)) * (1 + 0.35 * (vnoise(Math.atan2(dz, dx) * 1.3 + gx * 7.1, gz * 3.3, SEED + 127) - 0.5));
        if (d < r) t -= fTuft * 1.5 * Math.min(1, 2 * (1 - d / r));
      }
    }
    return t;
  },

  // A direct ray meets water at (x, W, z): the surface (R0), the bed through
  // the water (R2), and a mirrored row for the reflection (R1).
  water(ci, D, s, x, W, z, shadow, cloud) {
    const { v, light } = this;
    const len = Math.sqrt(1 + s * s);
    // the cell's footprint along the ray on a level surface: ripples shorter
    // than this would alias, so they are faded out and far water lies calm
    const graze = Math.max(0.006, -s / len);
    const fp = D * len * v.rowAngle / graze;
    const g = rippleSlope(x, z, this.t, this.dx, this.dz, fp);
    const wr = waterRays(s, g);
    const glow = this.glowAt(x, W, z, 0, 1, 0);
    this.write(ci, 0, MAT.WATER, light.L[1], shadow, cloud, glow, wr.F * 2 - 1, D * len);
    const sr = wr.sr, st = wr.st, F = wr.F;
    // where the surface is nearly all mirror the bed cannot show: no bed ray
    if (F < 0.85) this.refract(ci, x, W, z, st);
    this.addReflection(ci, sr, D, W);
  },

  // Walk the refracted ray down to the bed and light the bed where it lands.
  refract(ci, x, W, z, st) {
    const { world, light } = this;
    const T = world.terrain, N = this.N, NN = this.NN;
    const dx = this.dx, dz = this.dz;
    const step = 0.5 / -st;                    // half a metre down per step; the bed is smooth
    let pu = 0, pd = W - bil1(T.ground, x, z, N, NN);   // height of the ray above the bed
    let u = 0, hit = false;
    for (let k = 1; k <= 32; k++) {
      u = k * step;
      const d = W + st * u - bil1(T.ground, x + dx * u, z + dz * u, N, NN);
      if (d <= 0) { u = pu + (u - pu) * (pd / (pd - d)); hit = true; break; }
      pu = u; pd = d;
    }
    if (!hit) u = pu;
    const bx = x + dx * u, bz = z + dz * u, by = W + st * u;
    const e = 0.5;
    const sx = (bil1(T.ground, bx + e, bz, N, NN) - bil1(T.ground, bx - e, bz, N, NN)) / (2 * e);
    const sz = (bil1(T.ground, bx, bz + e, N, NN) - bil1(T.ground, bx, bz - e, N, NN)) / (2 * e);
    const nl = Math.sqrt(sx * sx + sz * sz + 1);
    const nx = -sx / nl, ny = 1 / nl, nz = -sz / nl;
    const Ld = light.L;
    let lam = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
    if (lam < 0) lam = 0;
    const tk = T.toneK || 1;
    const fine = bil1(T.fine, bx, bz, N, NN) * tk;
    const depth = W - by;
    const mat = depth < 1.2 && bilU8(T.wSand, bx, bz, N, NN) > 0.5 + 0.2 * fine ? MAT.SAND : MAT.BED;
    // shadows fall on the surface; the bed under it shares them
    const shadow = light.shadowAt(bx, W, bz);
    const cloud = light.cloudAt(bx, bz);
    const glow = this.glowAt(bx, by, bz, nx, ny, nz);
    const tone = 0.25 * bil1(T.tone, bx, bz, N, NN) * tk + 0.15 * fine;
    this.write(ci, 2, mat, lam, shadow, cloud, glow, tone, u * Math.sqrt(1 + st * st));
  },

  wall(rs, r, ci, D, s, nx, ny, nz, mat) {
    const { v, light } = this;
    const x = v.ex + this.dx * D, z = v.ez + this.dz * D, y = rs.ey + s * D;
    const len = Math.sqrt(1 + s * s);
    this.setDepth(rs, ci, D);
    const Ld = light.L;
    let lam = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
    if (lam < 0) lam = 0;
    const shadow = light.shadowAt(x + nx * 0.55, y + ny * 0.55 + 0.05, z + nz * 0.55);
    // masonry: courses 0.55 m high, blocks 1.1 m long, offset every course;
    // joints and block-to-block variation fade before they get thinner than two cells
    const graze = Math.abs(this.dx * nx + s * ny + this.dz * nz) / len;
    const fp = D * len * v.colAngle / Math.max(0.05, graze);
    let tone = 0;
    if (ny === 0) {
      const u = nx !== 0 ? z : x;
      const cy = (y - this.world.spans.gate.ground + 2) / 0.55;
      const row = Math.floor(cy);
      const cu = (u + (row & 1) * 0.55) / 1.1;
      const col = Math.floor(cu);
      const ju = Math.min(cu - col, 1 - (cu - col)) * 1.1, jy = Math.min(cy - row, 1 - (cy - row)) * 0.55;
      const jw = 0.05 + fp * 0.8;
      const joint = (ju < jw || jy < jw) ? 1 : 0;
      const block = ((Math.imul(row * 73856093 ^ col * 19349663, 0x9e3779b1) >>> 0) / 4294967296) * 2 - 1;
      const kJoint = 1 - smooth(0.035, 0.09, fp), kBlock = 1 - smooth(0.06, 0.2, fp);
      tone = -0.9 * joint * kJoint + 0.35 * block * kBlock;
    } else {
      tone = 0.4 * bil1(this.world.terrain.fine, x, z, this.N, this.NN) * (this.world.terrain.toneK || 1);
    }
    const cloud = light.cloudAt(x, z);
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, rs.slot, mat, lam, shadow, cloud, glow, tone, this.legOf(rs, r, D, len));
  },
};

export function installShading(cls) { Object.assign(cls.prototype, methods); }
