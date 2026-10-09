// The column march: one walk per vertical plane through the height grid,
// front to back, answering every cell of that plane at once.
//
// - The ground is sampled where the ray crosses the lines of the grid (of the
//   current level), never at fixed distances from the eye, so samples are
//   fixed to the land and do not slide as you walk. Between crossings the
//   ground is a straight ramp, and each cell's ray is intersected with that
//   ramp exactly, so hillsides are continuous.
// - Far away the march steps over coarser levels (2, 4, 8 m), blending each
//   level into the next before it takes over, so nothing pops.
// - Spans (the wall) are walked cell by cell on the fine grid wherever the
//   plane crosses them, with their front faces, tops and undersides, so the
//   gate's opening shows what is beyond it.
// - A plane keeps a "next unfilled cell" table instead of one horizon, so
//   anything seen through an opening is still found.
import { MAT, HIT_STRIDE } from '../../contract.js';
import { NN, LEVELS } from '../../world/terrain.js';
import { N, WALL, GATE, GROUND } from '../../world/layout.js';
import { SPAN_MERLON, SPAN_ARCH, archY } from '../../world/spans.js';
import { TORCH_RANGE } from './light.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const LOD_Q = 1.4;           // a level's cells span at least this many columns before the next takes over

export class Marcher {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.nxt = new Int32Array(1024);
    this.ev = { d: new Float32Array(1024), o: new Float32Array(1024), c: new Int32Array(1024), a: new Int8Array(1024), n: 0 };
    const t = world.terrain;
    this.maxTop = Math.max(t.maxH, world.spans.box.top) + 0.5;
  }

  // March every plane of a stripe. `hits` is the stripe's HitBuffer.
  run(v, rays, hits, frame, torch) {
    this.v = v; this.rays = rays; this.hits = hits; this.torch = torch;
    this.dEnd = [];
    for (let L = 0; L < LEVELS; L++) this.dEnd.push((1 << L) / (LOD_Q * v.colAngle));
    // merlons fade to the walkway before they get thinner than two columns
    this.merlonFar = 1 / (2.2 * v.colAngle);
    for (let p = 0; p < rays.np; p++) {
      const start = rays.pstart[p], n = rays.pstart[p + 1] - start;
      if (n) this.plane(p, start, n);
    }
  }

  find(r) {
    const nxt = this.nxt;
    let q = r;
    while (nxt[q] !== q) q = nxt[q];
    while (nxt[r] !== q) { const s = nxt[r]; nxt[r] = q; r = s; }
    return q;
  }

  plane(p, start, n) {
    const { v, rays, world } = this;
    const dx = rays.pdx[p], dz = rays.pdz[p];
    const ex = v.ex, ey = v.ey, ez = v.ez;
    const sig = rays.osig, ord = rays.order;
    if (this.nxt.length < n + 1) this.nxt = new Int32Array(n + 64);
    const nxt = this.nxt;
    for (let i = 0; i <= n; i++) nxt[i] = i;
    this.start = start; this.n = n; this.dx = dx; this.dz = dz;

    this.spanEvents(dx, dz);
    const ev = this.ev;
    let e = 0;

    const levels = world.terrain.levels;
    let L = 0;
    let d0 = 0.02;
    let h0 = this.height(0, ex + dx * d0, ez + dz * d0, 0);
    // DDA state for level L
    let s, ix, iz, stepX, stepZ, tMaxX, tMaxZ, tDX, tDZ;
    const init = (d) => {
      s = levels[L].size;
      const px = (ex + dx * d) / s, pz = (ez + dz * d) / s;
      ix = Math.floor(px); iz = Math.floor(pz);
      stepX = dx > 0 ? 1 : -1; stepZ = dz > 0 ? 1 : -1;
      const adx = Math.abs(dx) > 1e-9 ? Math.abs(dx) : 1e-9, adz = Math.abs(dz) > 1e-9 ? Math.abs(dz) : 1e-9;
      tDX = s / adx; tDZ = s / adz;
      tMaxX = d + (dx > 0 ? (ix + 1 - px) : (px - ix)) * s / adx;
      tMaxZ = d + (dz > 0 ? (iz + 1 - pz) : (pz - iz)) * s / adz;
    };
    init(d0);
    const maxTop = this.maxTop;

    for (let guard = 0; guard < 4000; guard++) {
      let d1;
      if (tMaxX < tMaxZ) { d1 = tMaxX; tMaxX += tDX; ix += stepX; }
      else { d1 = tMaxZ; tMaxZ += tDZ; iz += stepZ; }
      const px = ex + dx * d1, pz = ez + dz * d1;
      const out = px < 0 || pz < 0 || px > N || pz > N;
      const beta = L + 1 < LEVELS ? smooth(this.dEnd[L] * 0.6, this.dEnd[L], d1) : 0;
      const h1 = this.height(L, px, pz, beta);
      // span cells entered before this crossing come first, splitting the ramp
      while (e < ev.n && ev.d[e] < d1) {
        const ds = ev.d[e];
        if (ds > d0) {
          const hs = h0 + (h1 - h0) * (ds - d0) / (d1 - d0);
          this.ramp(d0, h0, ds, hs, L, beta);
          d0 = ds; h0 = hs;
        }
        this.spanCell(e);
        e++;
      }
      this.ramp(d0, h0, d1, h1, L, beta);
      d0 = d1; h0 = h1;
      const low = this.find(0);
      if (low >= n) return;
      if (sig[start + low] > (maxTop - ey) / d1) return;
      if (out) {
        // past the edge of the map: nothing more to hit
        while (e < ev.n) { this.spanCell(e); e++; }
        return;
      }
      if (L + 1 < LEVELS && d1 >= this.dEnd[L]) { L++; init(d1); }
    }
  }

  // Ground (or lake surface) height at a point on level L, blended toward
  // level L+1 by beta.
  height(L, x, z, beta) {
    const lv = this.world.terrain.levels;
    let h = bil(lv[L], x, z);
    if (beta > 0) h += (bil(lv[L + 1], x, z) - h) * beta;
    return h;
  }

  // The ground between two crossings is a straight ramp; every unfilled cell
  // whose ray passes under its far end meets it inside it.
  ramp(d0, h0, d1, h1, L, beta) {
    const { v, rays } = this;
    const sig = rays.osig, start = this.start, n = this.n;
    const ey = v.ey;
    const sTop = (h1 - ey) / d1;
    let r = this.find(0);
    if (r >= n || sig[start + r] > sTop) return;
    const k = (h1 - h0) / (d1 - d0);
    while (r < n) {
      const s = sig[start + r];
      if (s > sTop) break;
      let D = s - k !== 0 ? (h0 - ey - k * d0) / (s - k) : d1;
      if (!(D >= d0)) D = d0; else if (D > d1) D = d1;
      this.ground(rays.order[start + r], D, s, L, beta);
      this.nxt[r] = r + 1;
      r = this.find(r + 1);
    }
  }

  // Fine-grid cells of the wall crossed by this plane, in order.
  spanEvents(dx, dz) {
    const { v, world } = this;
    const ev = this.ev;
    ev.n = 0;
    const b = world.spans.box;
    const ex = v.ex, ez = v.ez;
    let tmin = 0, tmax = 1e9, axis = -1;
    if (Math.abs(dx) < 1e-9) { if (ex < b.x0 || ex > b.x1) return; }
    else {
      let a = (b.x0 - ex) / dx, c = (b.x1 - ex) / dx;
      if (a > c) { const t = a; a = c; c = t; }
      if (a > tmin) { tmin = a; axis = 0; }
      if (c < tmax) tmax = c;
    }
    if (Math.abs(dz) < 1e-9) { if (ez < b.z0 || ez > b.z1) return; }
    else {
      let a = (b.z0 - ez) / dz, c = (b.z1 - ez) / dz;
      if (a > c) { const t = a; a = c; c = t; }
      if (a > tmin) { tmin = a; axis = 1; }
      if (c < tmax) tmax = c;
    }
    if (tmin >= tmax) return;
    const idx = world.spans.idx;
    let d = tmin;
    const px = ex + dx * (d + 1e-6), pz = ez + dz * (d + 1e-6);
    let ix = Math.floor(px), iz = Math.floor(pz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.max(1e-9, Math.abs(dx)), adz = Math.max(1e-9, Math.abs(dz));
    let tMaxX = (dx > 0 ? ix + 1 - (ex + dx * d) : (ex + dx * d) - ix) / adx + d;
    let tMaxZ = (dz > 0 ? iz + 1 - (ez + dz * d) : (ez + dz * d) - iz) / adz + d;
    while (d < tmax && ev.n < 1024) {
      const next = Math.min(tMaxX, tMaxZ, tmax);
      if (ix >= 0 && iz >= 0 && ix < N && iz < N) {
        const c = iz * N + ix;
        if (idx[c] >= 0) {
          ev.d[ev.n] = d; ev.o[ev.n] = next; ev.c[ev.n] = c; ev.a[ev.n] = axis; ev.n++;
        }
      }
      if (tMaxX < tMaxZ) { d = tMaxX; tMaxX += 1 / adx; ix += stepX; axis = 0; }
      else { d = tMaxZ; tMaxZ += 1 / adz; iz += stepZ; axis = 1; }
    }
  }

  spanCell(e) {
    const { v, rays, world } = this;
    const ev = this.ev;
    const din = Math.max(ev.d[e], 0.01), dout = ev.o[e], cell = ev.c[e], axis = ev.a[e];
    const sp = world.spans, s = sp.idx[cell];
    const flags = sp.flags[s];
    const ey = v.ey, dx = this.dx, dz = this.dz;
    let y1 = sp.y1[s];
    if (flags & SPAN_MERLON) y1 += WALL.merlon * smooth(this.merlonFar, this.merlonFar * 0.75, din);
    let y0in = sp.y0[s], y0out = y0in;
    if (flags & SPAN_ARCH) {
      y0in = archY(v.ex + dx * din, GROUND);
      y0out = archY(v.ex + dx * dout, GROUND);
    }
    const lo = Math.min((y0in - ey) / din, (y0out - ey) / dout, (y1 - ey) / dout);
    const hi = Math.max((y1 - ey) / din, (y1 - ey) / dout, (y0out - ey) / dout);
    const sig = rays.osig, start = this.start, n = this.n;
    // first row at or above lo
    let a = 0, b = n;
    while (a < b) { const m = (a + b) >> 1; if (sig[start + m] < lo) a = m + 1; else b = m; }
    let r = this.find(a);
    while (r < n) {
      const s2 = sig[start + r];
      if (s2 > hi) break;
      const yin = ey + s2 * din, yout = ey + s2 * dout;
      let D = -1, nx = 0, ny = 0, nz = 0;
      if (axis >= 0 && yin >= y0in && yin <= y1) {
        D = din;
        if (axis === 0) nx = dx > 0 ? -1 : 1; else nz = dz > 0 ? -1 : 1;
      } else if (yin > y1 && yout <= y1 && s2 < 0) {
        D = (y1 - ey) / s2; ny = 1;
      } else if (yin < y0in && yout >= y0out) {
        const k = (y0out - y0in) / (dout - din);
        D = s2 - k !== 0 ? (y0in - ey - k * din) / (s2 - k) : din;
        if (!(D >= din)) D = din; else if (D > dout) D = dout;
        ny = -1;
      }
      if (D >= 0) {
        this.wall(rays.order[start + r], D, s2, nx, ny, nz, sp.mat[s]);
        this.nxt[r] = r + 1;
      }
      r = this.find(r + 1);
    }
  }

  // ---- shading -------------------------------------------------------------

  write(ci, mat, light, shadow, cloud, glow, tone, dist) {
    const h = this.hits, o = ci * HIT_STRIDE;
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
  }

  glowAt(x, y, z, nx, ny, nz) {
    const t = this.torch;
    const lx = t.x - x, ly = t.y - y, lz = t.z - z;
    const d2 = lx * lx + ly * ly + lz * lz;
    if (d2 >= TORCH_RANGE * TORCH_RANGE) return 0;
    const d = Math.sqrt(d2);
    const f = 1 - d / TORCH_RANGE;
    const c = d > 1e-6 ? (lx * nx + ly * ny + lz * nz) / d : 1;
    return f * f * (0.35 + 0.65 * Math.max(0, c)) * t.power;
  }

  ground(ci, D, s, L, beta) {
    const { v, world, light } = this;
    const T = world.terrain;
    const x = v.ex + this.dx * D, z = v.ez + this.dz * D, y = v.ey + s * D;
    const lv = T.levels;
    let nx = bil2(lv[L], lv[L].nx, x, z), nz = bil2(lv[L], lv[L].nz, x, z);
    if (beta > 0) {
      nx += (bil2(lv[L + 1], lv[L + 1].nx, x, z) - nx) * beta;
      nz += (bil2(lv[L + 1], lv[L + 1].nz, x, z) - nz) * beta;
    }
    let ny = Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz));
    const len = Math.sqrt(1 + s * s);
    this.depthOf(ci, D);
    // footprint of the cell on the ground, for fading detail that would alias
    const graze = Math.abs(this.dx * nx + s * ny + this.dz * nz) / len;
    const fp = D * len * v.colAngle / Math.max(0.04, graze);
    const fade = (size) => 1 - smooth(size * 0.3, size * 1.1, fp);
    const fine = bil1(T.fine, x, z);
    const jitter = fine * fade(1.5);
    let mat;
    if (bilU8(T.wWater, x, z) > 0.5) mat = MAT.WATER;
    else if (bilU8(T.wRoad, x, z) > 0.5 + 0.22 * jitter) mat = MAT.DIRT;
    else if (bilU8(T.wSand, x, z) > 0.5 + 0.25 * jitter) mat = MAT.SAND;
    else if (bilU8(T.wSnow, x, z) > 0.5 + 0.3 * jitter) mat = MAT.SNOW;
    else if (bilU8(T.wRock, x, z) > 0.5 + 0.3 * jitter) mat = MAT.ROCK;
    else mat = MAT.GRASS;
    const Ld = light.L;
    let lam, tone;
    if (mat === MAT.WATER) {
      nx = 0; ny = 1; nz = 0;
      lam = Ld[1];
      // Fresnel: how much of the sky the surface shows at this angle
      const c = Math.min(1, Math.abs(s) / len);
      const f = 0.02 + 0.98 * Math.pow(1 - c, 5);
      tone = f * 2 - 1;
    } else {
      lam = nx * Ld[0] + ny * Ld[1] + nz * Ld[2];
      if (lam < 0) lam = 0;
      const patch = bil1(T.tone, x, z);
      if (mat === MAT.ROCK) tone = 0.7 * Math.sin(y * 1.4 + patch * 3) * fade(2) + 0.4 * patch;
      else tone = 0.75 * patch * fade(5) + 0.45 * fine * fade(1.8);
    }
    const shadow = bil2(lv[L], this.light.S[L], x, z) * (1 - beta) + (beta > 0 ? bil2(lv[L + 1], this.light.S[L + 1], x, z) * beta : 0);
    const cloud = light.cloudAt(x, z);
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, mat, lam, shadow, cloud, glow, tone, D * len);
  }

  wall(ci, D, s, nx, ny, nz, mat) {
    const { v, light } = this;
    const x = v.ex + this.dx * D, z = v.ez + this.dz * D, y = v.ey + s * D;
    const len = Math.sqrt(1 + s * s);
    this.depthOf(ci, D);
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
      const cy = (y - GROUND + 2) / 0.55;
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
      tone = 0.4 * bil1(this.world.terrain.fine, x, z);
    }
    const cloud = light.cloudAt(x, z);
    const glow = this.glowAt(x, y, z, nx, ny, nz);
    this.write(ci, mat, lam, shadow, cloud, glow, tone, D * len);
  }

  depthOf(ci, D) { this.rays.depth[ci] = D; }
}

// ---- bilinear sampling on the node grids ---------------------------------------

function bil(level, x, z) { return bil2(level, level.H, x, z); }

function bil2(level, arr, x, z) {
  const n = level.n, nn = n + 1, s = level.size;
  let u = x / s, w = z / s;
  if (u < 0) u = 0; else if (u > n - 1e-6) u = n - 1e-6;
  if (w < 0) w = 0; else if (w > n - 1e-6) w = n - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * nn + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + nn], d = arr[j + nn + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function bil1(arr, x, z) {
  let u = x, w = z;
  if (u < 0) u = 0; else if (u > N - 1e-6) u = N - 1e-6;
  if (w < 0) w = 0; else if (w > N - 1e-6) w = N - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * NN + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + NN], d = arr[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function bilU8(arr, x, z) { return bil1(arr, x, z) / 255; }
