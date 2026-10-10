// Reflections. A ray reflected off a level surface stays in its vertical
// plane, so the cells of a plane that see water get mirrored rows: rays from
// the eye mirrored in that water (at height 2W - eye), with the reflected
// slope, which only start at their own water. They are marched over the same
// cached crossings and wall cells as the direct rays, and extend the march
// only where they need to, up to a cap.
//
// Rows of one water level form a group. Within a group, rows join a min-heap
// (by slope) as the march passes their water, and leave it as they hit
// something, so each crossing touches only the rows that can be filled.
import { SPAN_MERLON, SPAN_ARCH, archY } from '../../world/spans.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

const methods = {
  initReflection() {
    // the plane's water hits, as they come
    this.rCap = 512;
    this.rci = new Int32Array(512); this.rsg = new Float32Array(512);
    this.rdw = new Float32Array(512); this.rw = new Float32Array(512);
    this.rord = new Int32Array(512);
    // one group at a time: rows sorted by activation, a heap by slope
    this.ms = { sig: new Float32Array(512), ci: new Int32Array(512), act: new Float32Array(512), done: new Uint8Array(512), ey: 0, slot: 1, n: 0 };
    this.heap = new Int32Array(512);
    this.minAfter = new Float32Array(513);
  },

  startStripe() {},

  beginReflections() { this.nr = 0; },

  addReflection(ci, sr, dw, Wat) {
    // the level a row is grouped by, to the centimetre: every stripe derives
    // the same mirrored eye from it, whichever rows it holds
    const W = Math.round(Wat * 100) / 100;
    if (this.nr >= this.rCap) {
      const n = this.rCap * 2, g = (a, T) => { const b = new T(n); b.set(a); return b; };
      this.rci = g(this.rci, Int32Array); this.rsg = g(this.rsg, Float32Array);
      this.rdw = g(this.rdw, Float32Array); this.rw = g(this.rw, Float32Array);
      this.rord = new Int32Array(n); this.rCap = n;
    }
    // All rows of a level share the mirrored eye; a ripple-tilted row's line
    // from it crosses the water a little before or after its own water point,
    // so it starts where that line comes up through the surface (never under it).
    const start = Math.max(dw, (this.v.ey - W) / sr);
    const k = this.nr++;
    this.rci[k] = ci; this.rsg[k] = sr; this.rdw[k] = start; this.rw[k] = W;
    const rays = this.rays;
    rays.rsig[ci] = sr; rays.rdw[ci] = start; rays.rey[ci] = 2 * W - this.v.ey; rays.rdepth[ci] = Infinity;
  },

  endReflections() {
    const nr = this.nr;
    if (!nr) return;
    // group by water level (to the centimetre), then march each group
    const ord = this.rord, rw = this.rw;
    for (let i = 0; i < nr; i++) ord[i] = i;
    const key = (i) => Math.round(rw[i] * 100);
    // insertion sort by (level, activation distance): lists are short and nearly sorted
    const rdw = this.rdw;
    for (let a = 1; a < nr; a++) {
      const x = ord[a], kx = key(x), dx = rdw[x];
      let b = a - 1;
      while (b >= 0 && (key(ord[b]) > kx || (key(ord[b]) === kx && rdw[ord[b]] > dx))) { ord[b + 1] = ord[b]; b--; }
      ord[b + 1] = x;
    }
    let g0 = 0;
    while (g0 < nr) {
      let g1 = g0 + 1;
      while (g1 < nr && key(ord[g1]) === key(ord[g0])) g1++;
      this.mirrorGroup(g0, g1);
      g0 = g1;
    }
  },

  // March one group of mirrored rows (one water level), rows ord[g0..g1).
  mirrorGroup(g0, g1) {
    const { v } = this;
    const ms = this.ms, n = g1 - g0;
    if (ms.sig.length < n) {
      ms.sig = new Float32Array(n * 2); ms.ci = new Int32Array(n * 2); ms.act = new Float32Array(n * 2);
      ms.done = new Uint8Array(n * 2); this.heap = new Int32Array(n * 2); this.minAfter = new Float32Array(n * 2 + 1);
    }
    for (let k = 0; k < n; k++) {
      const i = this.rord[g0 + k];
      ms.sig[k] = this.rsg[i]; ms.ci[k] = this.rci[i]; ms.act[k] = this.rdw[i]; ms.done[k] = 0;
    }
    ms.n = n;
    ms.ey = 2 * this.rw[this.rord[g0]] - v.ey;
    // the lowest slope among rows not yet joined, for the stop test
    this.minAfter[n] = Infinity;
    for (let k = n - 1; k >= 0; k--) this.minAfter[k] = Math.min(this.minAfter[k + 1], ms.sig[k]);
    this.hn = 0;
    let next = 0;                  // next row to join, by activation
    let left = n;                  // rows not yet hit
    const ey = ms.ey, maxTop = this.maxTop, cap = this.reflectCap, ev = this.ev;
    // start at the crossing before the first water
    const first = ms.act[0];
    let i = 0;
    while (this.crossing(i) && this.cd[i] <= first) i++;
    let d0, h0;
    if (i === 0) { d0 = 0.02; h0 = this.h0start; } else { d0 = this.cd[i - 1]; h0 = this.ch[i - 1]; }
    let e = 0;
    while (e < ev.n && ev.o[e] <= first) e++;
    for (; left > 0 && this.crossing(i); i++) {
      const d1 = this.cd[i], h1 = this.ch[i], L = this.cl[i], beta = this.cb[i];
      while (e < ev.n && ev.d[e] < d1) {
        const ds = ev.d[e];
        if (ds > d0) {
          const hs = h0 + (h1 - h0) * (ds - d0) / (d1 - d0);
          next = this.join(next, ds);
          left -= this.mirrorRamp(d0, h0, ds, hs, L, beta);
          d0 = ds; h0 = hs;
        }
        next = this.join(next, ev.o[e]);
        left -= this.mirrorSpan(e);
        e++;
      }
      next = this.join(next, d1);
      left -= this.mirrorRamp(d0, h0, d1, h1, L, beta);
      d0 = d1; h0 = h1;
      // stop once nothing left can reach any height there is
      const bound = (maxTop - ey) / d1;
      const lowest = Math.min(this.hn ? ms.sig[this.heap[0]] : Infinity, this.minAfter[next]);
      if (lowest > bound || d1 > cap || i === this.lastOut) break;
    }
  },

  // Rows whose water lies before distance d join the heap.
  join(next, d) {
    const ms = this.ms;
    while (next < ms.n && ms.act[next] < d) { this.heapPush(next); next++; }
    return next;
  },

  heapPush(r) {
    const h = this.heap, sig = this.ms.sig;
    let i = this.hn++;
    h[i] = r;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (sig[h[p]] <= sig[h[i]]) break;
      const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
    }
  },

  heapPop() {
    const h = this.heap, sig = this.ms.sig;
    const top = h[0];
    const last = h[--this.hn];
    let i = 0;
    const n = this.hn;
    if (n > 0) {
      h[0] = last;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < n && sig[h[a]] < sig[h[m]]) m = a;
        if (b < n && sig[h[b]] < sig[h[m]]) m = b;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  },

  // A ramp of ground for the mirrored rows in the heap. Returns rows filled.
  mirrorRamp(d0, h0, d1, h1, L, beta) {
    const ms = this.ms, sig = ms.sig, ey = ms.ey;
    const sTop = (h1 - ey) / d1;
    const k = (h1 - h0) / (d1 - d0);
    let filled = 0;
    while (this.hn > 0) {
      const r = this.heap[0];
      if (ms.done[r]) { this.heapPop(); continue; }
      const s = sig[r];
      if (s > sTop) break;
      this.heapPop();
      const lo = ms.act[r] > d0 ? ms.act[r] : d0;
      let D = s - k !== 0 ? (h0 - ey - k * d0) / (s - k) : d1;
      if (!(D >= lo)) D = lo; else if (D > d1) D = d1;
      this.ground(ms, r, ms.ci[r], D, s, L, beta);
      ms.done[r] = 1;
      filled++;
    }
    return filled;
  },

  // A wall cell for the mirrored rows in the heap.
  mirrorSpan(e) {
    const { v, world } = this;
    const ev = this.ev, ms = this.ms;
    const din = Math.max(ev.d[e], 0.01), dout = ev.o[e], s = ev.c[e], axis = ev.a[e];
    const sp = world.spans;
    const flags = sp.flags[s];
    const ey = ms.ey, dx = this.dx, dz = this.dz;
    let y1 = sp.y1[s];
    if (flags & SPAN_MERLON) y1 += sp.merlon * smooth(this.merlonFar, this.merlonFar * 0.75, din);
    let y0in = sp.y0[s], y0out = y0in;
    if (flags & SPAN_ARCH) {
      y0in = archY(v.ex + dx * din, sp.gate);
      y0out = archY(v.ex + dx * dout, sp.gate);
    }
    let filled = 0;
    for (let q = 0; q < this.hn; q++) {
      const r = this.heap[q];
      if (ms.done[r] || ms.act[r] >= dout) continue;
      const s2 = ms.sig[r];
      const yin = ey + s2 * din, yout = ey + s2 * dout;
      let D = -1, nx = 0, ny = 0, nz = 0;
      if (axis >= 0 && yin >= y0in && yin <= y1) {
        D = din;
        if (axis === 0) nx = dx > 0 ? -1 : 1; else nz = dz > 0 ? -1 : 1;
      } else if (yin < y0in && yout >= y0out) {
        const k = (y0out - y0in) / (dout - din);
        D = s2 - k !== 0 ? (y0in - ey - k * din) / (s2 - k) : din;
        if (!(D >= din)) D = din; else if (D > dout) D = dout;
        ny = -1;
      }
      if (D >= 0 && D < ms.act[r]) D = -1;
      if (D >= 0) {
        this.wall(ms, r, ms.ci[r], D, s2, nx, ny, nz, sp.mat[s]);
        ms.done[r] = 1;
        filled++;
      }
    }
    return filled;
  },
};

export function installReflection(cls) { Object.assign(cls.prototype, methods); }
