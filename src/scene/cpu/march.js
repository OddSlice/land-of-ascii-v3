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
// - Water: a reflected ray stays in its plane, so the cells that see water get
//   a second set of rows in the same plane, marched from the eye mirrored in
//   the water (reflect.js), over the same crossings, which are cached.
//
// Rows are handled in "row sets": the cells of one plane that share an eye,
// sorted by slope. The direct view is one row set; each water level seen in
// the plane gives one mirrored row set, whose rows only start at their water.
import { LOOK } from '../../look.js';
import { LEVELS } from '../../world/terrain.js';
import { SPAN_MERLON, SPAN_ARCH, archY } from '../../world/spans.js';
import { installShading } from './shade.js';
import { installReflection } from './reflect.js';
import { bil } from './sample.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const LOD_Q = 1.4;           // a level's cells span at least this many columns before the next takes over

// The cells of one plane that share an eye height, sorted by slope.
export class RowSet {
  constructor() {
    this.sig = new Float32Array(256); this.ord = new Int32Array(256);
    this.act = null; this.nxt = new Int32Array(257);
    this.off = 0; this.n = 0; this.ey = 0; this.slot = 0;
  }
  reset(n) {
    if (this.nxt.length < n + 1) this.nxt = new Int32Array(n + 64);
    const nxt = this.nxt;
    for (let i = 0; i <= n; i++) nxt[i] = i;
    this.n = n;
  }
  find(r) {
    const nxt = this.nxt;
    let q = r;
    while (nxt[q] !== q) q = nxt[q];
    while (nxt[r] !== q) { const s = nxt[r]; nxt[r] = q; r = s; }
    return q;
  }
}

export class Marcher {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.ev = { d: new Float32Array(1024), o: new Float32Array(1024), c: new Int32Array(1024), a: new Int8Array(1024), n: 0 };
    const t = world.terrain;
    this.maxTop = Math.max(t.maxH, world.spans.box.top) + 0.5;
    this.N = world.N; this.NN = world.NN;
    this.direct = new RowSet();
    // the crossing cache of the current plane
    this.cd = new Float32Array(2048); this.ch = new Float32Array(2048);
    this.cl = new Int8Array(2048); this.cb = new Float32Array(2048);
    this.initReflection();
  }

  // March every plane of a stripe. `hits` is the stripe's HitBuffer.
  run(v, rays, hits, frame, torches) {
    this.v = v; this.rays = rays; this.hits = hits; this.torches = torches; this.t = frame.t;
    if (!this.tg) this.buildTorchGrid(torches);
    this.dEnd = [];
    for (let L = 0; L < LEVELS; L++) this.dEnd.push((1 << L) / (LOD_Q * v.colAngle));
    // merlons sink into the walkway before they get thinner than about two
    // cells across or tall
    const sp = this.world.spans;
    this.merlonFar = Math.min(sp.merlonW / (1.6 * v.colAngle), sp.merlon / (1.6 * v.rowAngle));
    this.reflectCap = Math.min(LOOK.water.reflectCap, this.world.viewDist);
    this.startStripe();
    const rs = this.direct;
    rs.sig = rays.osig; rs.ord = rays.order; rs.act = null; rs.ey = v.ey; rs.slot = 0;
    for (let p = 0; p < rays.np; p++) {
      const start = rays.pstart[p], n = rays.pstart[p + 1] - start;
      if (!n) continue;
      rs.off = start;
      rs.reset(n);
      this.plane(p, rs);
    }
  }

  // ---- the crossings of a plane, cached ------------------------------------

  startPlane(dx, dz) {
    const { v } = this;
    this.dx = dx; this.dz = dz;
    this.nc = 0;               // crossings cached so far
    this.cL = 0;
    this.cEnded = false;
    this.lastOut = -1;
    this.initDDA(0.02);
    this.h0start = this.height(0, v.ex + dx * 0.02, v.ez + dz * 0.02, 0);
  }

  initDDA(d) {
    const { v } = this;
    const levels = this.world.terrain.levels, L = this.cL, dx = this.dx, dz = this.dz;
    const s = levels[L].size;
    const px = (v.ex + dx * d) / s, pz = (v.ez + dz * d) / s;
    this.ix = Math.floor(px); this.iz = Math.floor(pz);
    this.stepX = dx > 0 ? 1 : -1; this.stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx) > 1e-9 ? Math.abs(dx) : 1e-9, adz = Math.abs(dz) > 1e-9 ? Math.abs(dz) : 1e-9;
    this.tDX = s / adx; this.tDZ = s / adz;
    this.tMaxX = d + (dx > 0 ? (this.ix + 1 - px) : (px - this.ix)) * s / adx;
    this.tMaxZ = d + (dz > 0 ? (this.iz + 1 - pz) : (pz - this.iz)) * s / adz;
  }

  // Crossing number i of this plane, computed and cached on first use.
  // False once the plane has left the map (or the view distance).
  crossing(i) {
    while (this.nc <= i) {
      if (this.cEnded) return false;
      let d1;
      if (this.tMaxX < this.tMaxZ) { d1 = this.tMaxX; this.tMaxX += this.tDX; this.ix += this.stepX; }
      else { d1 = this.tMaxZ; this.tMaxZ += this.tDZ; this.iz += this.stepZ; }
      const { v } = this;
      const px = v.ex + this.dx * d1, pz = v.ez + this.dz * d1;
      const N = this.N, L = this.cL;
      const beta = L + 1 < LEVELS ? smooth(this.dEnd[L] * 0.6, this.dEnd[L], d1) : 0;
      if (this.nc >= this.cd.length) this.growCache();
      const k = this.nc++;
      this.cd[k] = d1; this.ch[k] = this.height(L, px, pz, beta); this.cl[k] = L; this.cb[k] = beta;
      if (px < 0 || pz < 0 || px > N || pz > N || d1 > this.world.viewDist) { this.cEnded = true; this.lastOut = k; }
      else if (L + 1 < LEVELS && d1 >= this.dEnd[L]) { this.cL = L + 1; this.initDDA(d1); }
    }
    return true;
  }

  growCache() {
    const n = this.cd.length * 2;
    const grow = (a, T) => { const b = new T(n); b.set(a); return b; };
    this.cd = grow(this.cd, Float32Array); this.ch = grow(this.ch, Float32Array);
    this.cl = grow(this.cl, Int8Array); this.cb = grow(this.cb, Float32Array);
  }

  // Ground (or lake surface) height at a point on level L, blended toward
  // level L+1 by beta.
  height(L, x, z, beta) {
    const lv = this.world.terrain.levels;
    let h = bil(lv[L], x, z);
    if (beta > 0) h += (bil(lv[L + 1], x, z) - h) * beta;
    return h;
  }

  // ---- the direct view of one plane -------------------------------------------

  plane(p, rs) {
    const { rays } = this;
    this.startPlane(rays.pdx[p], rays.pdz[p]);
    this.spanEvents(this.dx, this.dz);
    this.beginReflections();
    const ev = this.ev, sig = rs.sig, off = rs.off, n = rs.n;
    let e = 0, d0 = 0.02, h0 = this.h0start;
    const maxTop = this.maxTop, ey = rs.ey;
    for (let i = 0; this.crossing(i); i++) {
      const d1 = this.cd[i], h1 = this.ch[i], L = this.cl[i], beta = this.cb[i];
      // span cells entered before this crossing come first, splitting the ramp
      while (e < ev.n && ev.d[e] < d1) {
        const ds = ev.d[e];
        if (ds > d0) {
          const hs = h0 + (h1 - h0) * (ds - d0) / (d1 - d0);
          this.ramp(rs, d0, h0, ds, hs, L, beta);
          d0 = ds; h0 = hs;
        }
        this.spanCell(rs, e);
        e++;
      }
      this.ramp(rs, d0, h0, d1, h1, L, beta);
      d0 = d1; h0 = h1;
      const low = rs.find(0);
      if (low >= n) break;
      if (sig[off + low] > (maxTop - ey) / d1) break;
      if (i === this.lastOut) {
        // past the edge of the map: nothing more to hit
        while (e < ev.n) { this.spanCell(rs, e); e++; }
        break;
      }
    }
    this.endReflections();
  }

  // The ground between two crossings is a straight ramp; every unfilled row
  // whose ray passes under its far end meets it inside it. Mirrored rows only
  // count from their water onward (`act`).
  ramp(rs, d0, h0, d1, h1, L, beta, first = 0) {
    const sig = rs.sig, off = rs.off, n = rs.n, act = rs.act;
    const ey = rs.ey;
    const sTop = (h1 - ey) / d1;
    let r = rs.find(first);
    if (r >= n || sig[off + r] > sTop) return;
    const k = (h1 - h0) / (d1 - d0);
    while (r < n) {
      const s = sig[off + r];
      if (s > sTop) break;
      let lo = d0;
      if (act !== null) {
        const a = act[r];
        if (a >= d1) { r = rs.find(r + 1); continue; }
        if (a > lo) lo = a;
      }
      let D = s - k !== 0 ? (h0 - ey - k * d0) / (s - k) : d1;
      if (!(D >= lo)) D = lo; else if (D > d1) D = d1;
      this.ground(rs, r, rs.ord[off + r], D, s, L, beta);
      rs.nxt[r] = r + 1;
      r = rs.find(r + 1);
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
    const idx = world.spans.idx, N = this.N;
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

  spanCell(rs, e) {
    const { v, world } = this;
    const ev = this.ev;
    const din = Math.max(ev.d[e], 0.01), dout = ev.o[e], cell = ev.c[e], axis = ev.a[e];
    const sp = world.spans, s = sp.idx[cell];
    const flags = sp.flags[s];
    const ey = rs.ey, dx = this.dx, dz = this.dz, act = rs.act;
    let y1 = sp.y1[s];
    if (flags & SPAN_MERLON) y1 += sp.merlon * smooth(this.merlonFar, this.merlonFar * 0.75, din);
    let y0in = sp.y0[s], y0out = y0in;
    if (flags & SPAN_ARCH) {
      y0in = archY(v.ex + dx * din, sp.gate);
      y0out = archY(v.ex + dx * dout, sp.gate);
    }
    const lo = Math.min((y0in - ey) / din, (y0out - ey) / dout, (y1 - ey) / dout);
    const hi = Math.max((y1 - ey) / din, (y1 - ey) / dout, (y0out - ey) / dout);
    const sig = rs.sig, off = rs.off, n = rs.n;
    // first row at or above lo
    let a = 0, b = n;
    while (a < b) { const m = (a + b) >> 1; if (sig[off + m] < lo) a = m + 1; else b = m; }
    let r = rs.find(a);
    while (r < n) {
      const s2 = sig[off + r];
      if (s2 > hi) break;
      if (act !== null && act[r] >= dout) { r = rs.find(r + 1); continue; }
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
      if (D >= 0 && act !== null && D < act[r]) D = -1;
      if (D >= 0) {
        this.wall(rs, r, rs.ord[off + r], D, s2, nx, ny, nz, sp.mat[s]);
        rs.nxt[r] = r + 1;
      }
      r = rs.find(r + 1);
    }
  }
}

installShading(Marcher);
installReflection(Marcher);
