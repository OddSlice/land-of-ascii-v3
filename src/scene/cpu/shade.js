// What a hit looks like: material, light, shadows, torchlight, detail, and
// the record it is written to. Shared by the direct rays (record R0) and the
// mirrored ones (R1). A direct ray that meets water also writes the surface
// (R0), marches its refracted ray down to the bed (R2) and leaves a mirrored
// row for reflect.js.
import { MAT, MAT_NONE, HIT_STRIDE, REC } from '../../contract.js';
import { TORCH_RANGE } from './light.js';
import { rippleSlope, swellSlope, waterRays } from './water.js';
import { bil2, bil2S, bil2U8, bil1, bilU8, bilD } from './sample.js';
import { vnoise, hash2 } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';
import { LOOK } from '../../look.js';

const MEADOW = LOOK.meadow, FAR = LOOK.far, COAST = LOOK.coast;
const SEA_LEVEL = 20;          // (the generated world's; water at it is the sea)

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
    // something drawn over water (a tree in front of a lake): its mirror and
    // bed are no longer the cell's, and it takes no more reflections
    if (slot === 0 && mat !== MAT.WATER && h[o] === MAT.WATER) { h[o + REC] = MAT_NONE; h[o + 2 * REC] = MAT_NONE; this.rays.rdepth[ci] = -1; }
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

  // `into`: write the hit into this record instead, without marking the cell
  // as met (a skyline's land, for the cell above it); false if it is water.
  ground(rs, r, ci, D, s, L, beta, into = -1) {
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
    if (into < 0) this.setDepth(rs, ci, D);
    // footprint of the cell on the ground, for fading detail that would alias
    const graze = Math.abs(this.dx * nx + s * ny + this.dz * nz) / len;
    const fp = D * len * v.colAngle / Math.max(0.04, graze);
    const N = this.N, NN = this.NN;
    const tk = T.toneK || 1;          // the generated world keeps detail as small integers
    const fine = bilD(T.fine, x, z, N, NN) * tk;
    const jitter = fine * fadeOf(1.5, fp);
    let mat;
    // in the generated world, past the first level water, roads and sand
    // come from their filtered copies at the level being marched, so a thin
    // river or road fades away with distance instead of breaking into dashes
    const thin = L > 0 && T.wWaterL;
    // a square of nothing but grass (or forest floor) needs no weighing
    let code = 0;
    if (T.code && !thin) {
      const u = x < 0 ? 0 : x > N - 1e-6 ? N - 1e-6 : x, w = z < 0 ? 0 : z > N - 1e-6 ? N - 1e-6 : z;
      code = T.code[(w | 0) * N + (u | 0)];
    }
    if (code === 1) mat = MAT.GRASS;
    else if (code === 2) mat = MAT.FLOOR;
    else if ((thin ? this.thinW(T.wWaterL, lv, L, beta, x, z) : bilU8(T.wWater, x, z, N, NN)) > 0.5) mat = MAT.WATER;
    else if (T.wRoad && (thin ? this.thinW(T.wRoadL, lv, L, beta, x, z) : bilU8(T.wRoad, x, z, N, NN)) > 0.5 + 0.22 * jitter) mat = MAT.DIRT;
    else if ((thin ? this.thinW(T.wSandL, lv, L, beta, x, z) : bilU8(T.wSand, x, z, N, NN)) > 0.5 + 0.25 * jitter) mat = MAT.SAND;
    else if (this.weight(T.wSnow, T.wSnowL, lv, L, beta, x, z, D) > 0.5 + 0.3 * jitter) mat = MAT.SNOW;
    else if (this.weight(T.wRock, T.wRockL, lv, L, beta, x, z, D) > 0.5 + 0.3 * jitter) mat = MAT.ROCK;
    else if (T.wFloor && bilU8(T.wFloor, x, z, N, NN) > 0.5 + 0.3 * jitter) mat = MAT.FLOOR;
    else mat = MAT.GRASS;
    // the coast (phase 2a): where sand meets the sea or a lake, a darker wet
    // band in the bed's colours, wherever it covers most of the cell's footprint
    if (mat === MAT.SAND && T.shore) {
      const sd = this.shoreAt(T.shore, x, z);
      const W = y < SEA_LEVEL + 3 ? COAST.wet[0] : COAST.wet[1];
      if (sd < W + fp && this.band(sd, fp, 0, W) > 0.5) mat = MAT.BED;
    }
    const Ld = light.L;
    const shadow = (bil2S(lv[L], light.S[L], x, z) * (1 - beta) + (beta > 0 ? bil2S(lv[L + 1], light.S[L + 1], x, z) * beta : 0)) * light.sK;
    const cloud = light.cloudAt(x, z);
    let lam, tone;
    if (mat === MAT.WATER) {
      if (into >= 0) return false;
      if (rs.slot === 0) { this.water(ci, D, s, x, y, z, shadow, cloud); return true; }
      // a mirrored ray meeting water again is not mirrored twice
      nx = 0; ny = 1; nz = 0;
      lam = Ld[1];
      const c = Math.min(1, Math.abs(s) / len);
      tone = (0.02 + 0.98 * Math.pow(1 - c, 5)) * 2 - 1;
    } else {
      lam = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
      if (lam < 0) lam = 0;
      const patch = bilD(T.tone, x, z, N, NN) * tk;
      if (mat === MAT.ROCK) tone = 0.3 * Math.sin(y * 0.9 + patch * 4) * fadeOf(3, fp) + 0.6 * patch + 0.3 * fine * fadeOf(2, fp);
      else tone = 0.75 * patch * fadeOf(5, fp) + 0.45 * fine * fadeOf(1.8, fp);
      // the far rule: on the range, gullies darken rock and snow (the coarse
      // normals miss them) and rock shows broad strata, both fixed to the land
      if (this.farRule && T.form && (mat === MAT.ROCK || mat === MAT.SNOW)) {
        lam *= 1 - FAR.gully * this.gullyAt(T.form, x, z);
        if (mat === MAT.ROCK) tone += FAR.bands * Math.sin(y * 2 * Math.PI / FAR.strata + 2.5 * vnoise(x / 210, z / 210, SEED + 131)) * fadeOf(FAR.strata / 2, fp) * (1 - smooth(FAR.strata * 0.15, FAR.strata * 0.55, D * v.rowAngle));
      }
      // (judged by the cell's footprint along the view, where rows are tall)
      if (mat === MAT.GRASS && this.meadow > 0) tone += this.mottle(x, z, fp * v.rowAngle / v.colAngle);
    }
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, into >= 0 ? into : rs.slot, mat, lam, shadow, cloud, glow, tone, this.legOf(rs, r, D, len));
    return true;
  },

  // A material weight: the fine one near the eye; under the far rule, past
  // LOOK.far.edgeFrom metres, its filtered copy at the level being marched,
  // so a snow line or a rock band ends at a clean edge instead of breaking
  // into cells (blended over a band, so nothing pops as you walk).
  weight(A, AL, lv, L, beta, x, z, D) {
    const w0 = bilU8(A, x, z, this.N, this.NN);
    if (!this.farRule || !AL || L === 0) return w0;
    const f = smooth(FAR.edgeFrom * 0.7, FAR.edgeFrom * 1.3, D);
    return f > 0 ? w0 + (this.thinW(AL, lv, L, beta, x, z) - w0) * f : w0;
  },

  // The range's gullies (0..1) at a point, from the 4 m grid.
  gullyAt(G, x, z) {
    const n = this.N / 4, nn = n + 1;
    const u = Math.max(0, Math.min(n - 1e-6, x / 4)), w = Math.max(0, Math.min(n - 1e-6, z / 4));
    const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0, c = k0 * nn + i0;
    const a = G[c], b = G[c + 1], d = G[c + nn], e = G[c + nn + 1];
    return (a + (b - a) * fx + (d - a) * fz + (a - b - d + e) * fx * fz) / 127;
  },

  // A weight from its filtered copy at level L, blended toward L+1 by beta.
  thinW(A, lv, L, beta, x, z) {
    let w = bil2U8(lv[L], A[L], x, z);
    if (beta > 0 && L + 1 < lv.length) w += (bil2U8(lv[L + 1], A[L + 1], x, z) - w) * beta;
    return w;
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
    const T = this.world.terrain;
    // (the open sea also has its swell)
    const sea = T.shore && W > SEA_LEVEL - 0.05 && W < SEA_LEVEL + 0.05;
    const g = rippleSlope(x, z, this.t, this.dx, this.dz, fp) + (sea ? swellSlope(x, z, this.t, this.dx, this.dz, fp) : 0);
    const wr = waterRays(s, g);
    const glow = this.glowAt(x, W, z, 0, 1, 0);
    this.write(ci, 0, MAT.WATER, light.L[1], shadow, cloud, glow, wr.F * 2 - 1, D * len);
    const sr = wr.sr, st = wr.st, F = wr.F;
    // where the surface is nearly all mirror the bed cannot show: no bed ray
    if (F < 0.85) this.refract(ci, x, W, z, st);
    // the foam line at the shore of the sea or a lake (phase 2a): in place
    // of the bed's record, keeping the path to it
    if (T.shore) {
      const f = this.foamAt(T.shore, x, z, sea, fp);
      if (f > 0.004) {
        const h = this.hits, o = ci * HIT_STRIDE + 2 * REC;
        const path = h[o] === MAT_NONE ? 0 : (h[o + 6] | (h[o + 7] << 8)) / 10;
        this.write(ci, 2, MAT.FOAM, light.L[1], shadow, cloud, glow, f * 2 - 1, path);
      }
    }
    this.addReflection(ci, sr, D, W);
  },

  // The signed distance (m) to the edge of the sea or a lake at a point:
  // above 0 on land, below in the water (LOOK: shoreLine, in eighths of a metre).
  shoreAt(A, x, z) { return (bilU8(A, x, z, this.N, this.NN) * 255 - 128) / 8; },

  // How much of a footprint fp wide, centred at sd, the band [a, b] covers.
  band(sd, fp, a, b) {
    const h = fp > 0.1 ? fp / 2 : 0.05;
    const lo = Math.max(sd - h, a), hi = Math.min(sd + h, b);
    return hi > lo ? (hi - lo) / (2 * h) : 0;
  },

  // The foam line: a broken line in the water that runs up toward the shore
  // and back (a pure function of position and time), as the share of the
  // cell's footprint it covers, so far off it fades instead of breaking up.
  foamAt(A, x, z, sea, fp) {
    const sd = this.shoreAt(A, x, z);
    const P = sea ? COAST.foam.sea : COAST.foam.lake;
    if (sd > 0.2 || sd < -(P.reach + P.swing + P.width + fp)) return 0;
    const ph = this.t * 2 * Math.PI / P.period + 6.283 * vnoise(x / 70, z / 70, SEED + 151);
    const line = -(P.reach + P.swing * (0.5 + 0.5 * Math.sin(ph)));
    const cov = this.band(sd, fp, line - P.width, line + P.width);
    if (cov <= 0) return 0;
    // broken along its length, the breaks drifting slowly; far off, where a
    // cell spans several breaks, their average
    const br = smooth(0.32, 0.62, vnoise(x / 2.6 + this.t * 0.12, z / 2.6, SEED + 152));
    const k = smooth(1.5, 6, fp);
    return P.strength * cov * (br + (0.5 - br) * k);
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
    const fine = bilD(T.fine, bx, bz, N, NN) * tk;
    const depth = W - by;
    const mat = depth < 1.2 && bilU8(T.wSand, bx, bz, N, NN) > 0.5 + 0.2 * fine ? MAT.SAND : MAT.BED;
    // shadows fall on the surface; the bed under it shares them
    const shadow = light.shadowAt(bx, W, bz);
    const cloud = light.cloudAt(bx, bz);
    const glow = this.glowAt(bx, by, bz, nx, ny, nz);
    const tone = 0.25 * bilD(T.tone, bx, bz, N, NN) * tk + 0.15 * fine;
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
      tone = 0.4 * bilD(this.world.terrain.fine, x, z, this.N, this.NN) * (this.world.terrain.toneK || 1);
    }
    const cloud = light.cloudAt(x, z);
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, rs.slot, mat, lam, shadow, cloud, glow, tone, this.legOf(rs, r, D, len));
  },
};

export function installShading(cls) { Object.assign(cls.prototype, methods); }
