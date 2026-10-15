// The building kit's shapes in the object pass (phase 3a): each shape is an
// object of its own, culled and sorted with the trees, and drawn exactly:
// the ray of every cell is intersected with the shape and its openings.
//
// As with the conifers, everything that depends only on the vertical plane
// of a ray (where the plane crosses the shape's footprint and each opening's)
// is worked out once per plane (primPlane); primRay then intersects one ray
// of that plane, with only the heights left to test. A plane's footprint
// crossing also bounds the rows that can meet the shape, so a shape costs
// what it covers on screen, not its whole screen box.
//
// Distance (art bible section 6, buildings):
// - a thin shape (a wall end-on, a post, a bracket) is held at least two
//   cells across (PF.GROW), as trunks are;
// - merlons sink into the parapet before they get thinner than about two
//   cells across or tall, as the lab's wall's do;
// - an opening narrower than about two cells (a door, a window, the gate
//   far off) closes (H.CLOSE), as a notch in a conifer does;
// - a stair's steps melt into an even slope once a step is under about
//   three rows tall;
// - a window's light is held at two rows, faded by how much of that it
//   really is, as a flame is;
// - the masonry's course joints darken a cell by how much of it they
//   cover, and fade once a course is under two and a half rows; the joints
//   between blocks, timber framing, shingle courses and paving fade with a
//   cell's footprint before they can blink (in primShade);
// - a reveal (an opening's or a merlon's side) under about two and a half
//   cells wide takes the light of the face it is cut into.
//
// How a shape's surface looks once met (its material, light, joints and
// grain) is in build-shade.js.
import { MAT } from '../../contract.js';
import { LOOK } from '../../look.js';
import { PT, HT, PF, P, H, H_STRIDE, HOLD_MIN, inMerlon } from '../../world/kit.js';
import { shading } from './build-shade.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const NEAR = 0.05;
const MAXH = 24;
const BIG = 1e30;
// local normals of a box's four sides: -u, +u, -w, +w
const FU = [-1, 1, 0, 0], FW = [0, 0, -1, 1];

// The crossing of a line (start q0, step dq per unit of D) with the slab
// -h..h: [a, b] and the faces it enters and leaves by (lo: face 0, hi: 1).
function slab(q0, dq, h, out, fLo, fHi) {
  if (dq > -1e-12 && dq < 1e-12) {
    if (q0 < -h || q0 > h) { out[0] = BIG; out[1] = -BIG; return; }
    out[0] = -BIG; out[1] = BIG; out[2] = -1; out[3] = -1; return;
  }
  let a = (-h - q0) / dq, b = (h - q0) / dq, fa = fLo, fb = fHi;
  if (a > b) { const t = a; a = b; b = t; fa = fHi; fb = fLo; }
  out[0] = a; out[1] = b; out[2] = fa; out[3] = fb;
}
const SA = [0, 0, 0, 0], SB = [0, 0, 0, 0];

export class Plane {
  constructor() {
    this.miss = true;
    this.hu0 = new Float64Array(MAXH); this.hw0 = new Float64Array(MAXH); this.hdu = new Float64Array(MAXH); this.hdw = new Float64Array(MAXH);
    this.ha = new Float64Array(MAXH); this.hb = new Float64Array(MAXH); this.hfb = new Int8Array(MAXH);
    this.on = new Uint8Array(MAXH);
    // per row
    this.ra = new Float64Array(MAXH); this.rb = new Float64Array(MAXH);
    this.rnx = new Float64Array(MAXH); this.rny = new Float64Array(MAXH); this.rnz = new Float64Array(MAXH);
    this.rf = new Int8Array(MAXH);           // the face a row's ray leaves an opening by
  }
}

const methods = {
  // The vertical plane through the eye along (dx, dz), against shape it.
  primPlane(it, dx, dz, minR, rowH) {
    const K = this.kit, S = K.prims, Hs = K.holes, q = it.o, v = this.v;
    const kp = this.kp || (this.kp = new Plane());
    kp.q = q;
    const t = S[q + P.TYPE], ca = S[q + P.CA], sa = S[q + P.SA];
    const ox = v.ex - S[q + P.CX], oz = v.ez - S[q + P.CZ];
    const u0 = ox * ca + oz * sa, w0 = -ox * sa + oz * ca, du = dx * ca + dz * sa, dw = -dx * sa + dz * ca;
    kp.u0 = u0; kp.w0 = w0; kp.du = du; kp.dw = dw; kp.ca = ca; kp.sa = sa; kp.dx = dx; kp.dz = dz;
    kp.type = t;
    // (phase 4b) the wild detail's shapes (wild.js)
    if (t >= PT.ELL) { this.wildPlane(kp, q, S, minR, rowH); return; }
    const fl = S[q + P.FLAGS], grow = (fl & (PF.GROW | PF.HOLD)) !== 0;
    let hx = S[q + P.HX], hz = S[q + P.HZ];
    kp.y0 = S[q + P.Y0]; kp.y1 = S[q + P.Y1];
    if (fl & PF.HOLD) {
      // (phase 3b) a thin part: held at two cells and two rows while it is
      // at least HOLD_MIN of that, else gone
      const th = hx < hz ? hx : hz, ht = kp.y1 - kp.y0;
      if (th < HOLD_MIN * minR || ht < HOLD_MIN * 2 * rowH) { kp.miss = true; return; }
      if (ht < 2 * rowH) { const yc = (kp.y0 + kp.y1) / 2; kp.y0 = yc - rowH; kp.y1 = yc + rowH; }
    }
    if (grow) { if (hx < minR) hx = minR; if (hz < minR) hz = minR; }
    // (phase 4b) small wild detail (a stump): held at two cells across and
    // two rows tall, faded by its true share of that
    kp.cover = 1;
    if (fl & PF.FADE) {
      const ht = kp.y1 - kp.y0, hm = Math.max(hx, minR), hh = Math.max(ht, 2 * rowH);
      kp.cover = (hx / hm) * (ht / hh);
      if (kp.cover < LOOK.wild.fadeMin) { kp.miss = true; return; }
      if (hh > ht) kp.y1 = kp.y0 + hh;
      hz = hz * hm / hx; hx = hm;
    }
    if (t === PT.PANE) {
      // a window's light: at least two cells wide and two rows tall, faded
      // by how much of that it really is
      const w = hx, h = (kp.y1 - kp.y0) / 2, wm = Math.max(w, minR), hm = Math.max(h, rowH);
      kp.cover = (w * h) / (wm * hm);
      hx = wm; const yc = (kp.y0 + kp.y1) / 2; kp.y0 = yc - hm; kp.y1 = yc + hm;
      if (hz < 0.6 * minR) hz = 0.6 * minR;
    }
    kp.hx = hx; kp.hz = hz;
    if (t === PT.CYL) {
      const b = u0 * du + w0 * dw, c = u0 * u0 + w0 * w0 - hx * hx, disc = b * b - c;
      if (disc < 0) { kp.miss = true; return; }
      const sq = Math.sqrt(disc);
      kp.tA = -b - sq; kp.tB = -b + sq; kp.fA = 4;
    } else {
      slab(u0, du, hx, SA, 0, 1); slab(w0, dw, hz, SB, 2, 3);
      let a = SA[0], fa = SA[2];
      if (SB[0] > a) { a = SB[0]; fa = SB[2]; }
      const b = Math.min(SA[1], SB[1]);
      if (a > b) { kp.miss = true; return; }
      kp.tA = a; kp.tB = b; kp.fA = fa;
    }
    if (kp.tB < NEAR) { kp.miss = true; return; }
    kp.miss = false;
    // crenels: merlons sink into the parapet before they, or the gaps
    // between them, get thinner than about two cells across or tall (up
    // while at least two and a half, gone at two)
    kp.cren = false; kp.yTop = kp.y1;
    if (S[q + P.FLAGS] & PF.CRENEL) {
      const mh = S[q + P.MH], per = S[q + P.PER], mw = S[q + P.MW];
      const across = (t === PT.CYL ? 2 * Math.PI * hx / per : per) * Math.min(mw, 1 - mw);
      const dist = this.primDist;
      const far = Math.min(across / (2 * this.v.colAngle), mh / (2 * this.v.rowAngle));
      let f = smooth(far, far * 0.8, dist);
      // (a merlon sinking keeps at least two rows, or is gone)
      if (mh * f < 2 * dist * this.v.rowAngle) f = 0;
      kp.yC = kp.y1 - mh;
      if (f < 0.02) kp.yTop = kp.yC;
      // seen along a straight parapet the gaps hide behind the merlons'
      // depth: under about two cells of gap showing, it is drawn whole, a band
      // at the merlons' height
      else if (t !== PT.CYL && per * (1 - mw) * Math.abs(dw) - 2 * S[q + P.HZ] * Math.abs(du) < 2 * minR) kp.yTop = kp.yC + mh * f;
      else { kp.cren = true; kp.yTop = kp.yC + mh * f; }
    }
    if (t === PT.STAIR) {
      const rise = S[q + P.RISE], run = S[q + P.RUN];
      kp.rise = rise; kp.run = run; kp.n = Math.round(2 * S[q + P.HX] / run);
      // the steps melt into an even slope under about three rows a step
      kp.stepK = smooth(2, 3.5, rise / rowH);
    }
    // the openings
    const h0 = S[q + P.H0], hn = Math.min(MAXH, S[q + P.HN]);
    kp.h0 = h0; kp.nh = hn;
    for (let k = 0; k < hn; k++) {
      const o = (h0 + k) * H_STRIDE, ht = Hs[o + H.TYPE];
      const hca = Hs[o + H.CA], hsa = Hs[o + H.SA], hhx = Hs[o + H.HX], hhz = Hs[o + H.HZ];
      // an opening narrower or lower than about two cells closes, and so
      // does one seen so far aside that less than about two cells of it
      // show past the depth of its wall (the room beyond would be a sliver)
      const da = dx * hca + dz * hsa, db = -dx * hsa + dz * hca;
      if (Hs[o + H.CLOSE] && (hhx < minR || Hs[o + H.Y1] - Hs[o + H.Y0] < 2 * rowH
        || hhx * Math.abs(db) - Hs[o + H.DEPTH] / 2 * Math.abs(da) < minR)) { kp.on[k] = 0; continue; }
      const hx0 = v.ex - Hs[o + H.CX], hz0 = v.ez - Hs[o + H.CZ];
      const a0 = hx0 * hca + hz0 * hsa, b0 = -hx0 * hsa + hz0 * hca;
      kp.hu0[k] = a0; kp.hw0[k] = b0; kp.hdu[k] = da; kp.hdw[k] = db;
      if (ht === HT.CYL) {
        const b = a0 * da + b0 * db, c = a0 * a0 + b0 * b0 - hhx * hhx, disc = b * b - c;
        if (disc < 0) { kp.on[k] = 0; continue; }
        const sq = Math.sqrt(disc);
        kp.ha[k] = -b - sq; kp.hb[k] = -b + sq; kp.hfb[k] = 4;
      } else if (ht === HT.ARCH) {
        // through its depth (w); across (u) is tested per row with its arch
        slab(b0, db, hhz, SB, 2, 3);
        if (SB[0] > SB[1]) { kp.on[k] = 0; continue; }
        kp.ha[k] = SB[0]; kp.hb[k] = SB[1]; kp.hfb[k] = SB[3];
      } else {
        slab(a0, da, hhx, SA, 0, 1); slab(b0, db, hhz, SB, 2, 3);
        let a = SA[0], b = SA[1], fb = SA[3];
        if (SB[0] > a) a = SB[0];
        if (SB[1] < b) { b = SB[1]; fb = SB[3]; }
        if (a > b) { kp.on[k] = 0; continue; }
        kp.ha[k] = a; kp.hb[k] = b; kp.hfb[k] = fb;
      }
      if (kp.hb[k] < NEAR) { kp.on[k] = 0; continue; }
      kp.on[k] = 1;
    }
    // the slopes a ray of this plane can meet the shape at (for culling rows)
    const yLo = kp.y0, yHi = kp.yTop, ta = Math.max(kp.tA, NEAR), tb = kp.tB;
    kp.sLo = yLo < v.ey ? (yLo - v.ey) / ta : (yLo - v.ey) / tb;
    kp.sHi = yHi > v.ey ? (yHi - v.ey) / ta : (yHi - v.ey) / tb;
  },

  // One ray of the plane (slope s from height ey; nothing before `after`):
  // true if it meets the shape, with this.hit filled.
  primRay(s, ey, after) {
    const kp = this.kp;
    if (kp.miss) return false;
    const K = this.kit, S = K.prims, Hs = K.holes, q = kp.q, hit = this.hit;
    const tmin = after > NEAR ? after : NEAR;
    if (kp.type >= PT.ELL) return this.wildRay(s, ey, tmin);
    // the vertical extent
    const y0 = kp.y0, yTop = kp.yTop;
    let va, vb, vf;
    if (s > 1e-12) { va = (y0 - ey) / s; vb = (yTop - ey) / s; vf = 5; }
    else if (s < -1e-12) { va = (yTop - ey) / s; vb = (y0 - ey) / s; vf = 6; }
    else { if (ey < y0 || ey > yTop) return false; va = -BIG; vb = BIG; vf = -1; }
    let t0, face;
    if (kp.tA >= va) { t0 = kp.tA; face = kp.fA; } else { t0 = va; face = vf; }
    const t1 = kp.tB < vb ? kp.tB : vb;
    if (t0 > t1 || t1 < tmin) return false;
    const type = kp.type;
    if (type === PT.PRISM) return this.prismRay(s, ey, t0, t1, face, tmin);
    if (type === PT.STAIR) return this.stairRay(s, ey, t0, t1, face, tmin);
    // the openings' crossings for this row
    const nh = kp.nh;
    for (let k = 0; k < nh; k++) {
      if (!kp.on[k]) { kp.ra[k] = BIG; kp.rb[k] = -BIG; continue; }
      const o = (kp.h0 + k) * H_STRIDE, hy0 = Hs[o + H.Y0], hy1 = Hs[o + H.Y1];
      let a = kp.ha[k], b = kp.hb[k], fb = kp.hfb[k];
      const ht = Hs[o + H.TYPE];
      if (ht === HT.ARCH) {
        // across: the opening is the box below the spring and the half
        // circle above it, one convex shape
        const r = Hs[o + H.R], ys = hy1 - r, cu0 = kp.hu0[k], cdu = kp.hdu[k];
        // the box part: |u| <= r, hy0 <= y <= ys
        slab(cu0, cdu, r, SA, 0, 1);
        let ba, bb, bfb;
        if (s > 1e-12) { ba = (hy0 - ey) / s; bb = (ys - ey) / s; bfb = 7; }
        else if (s < -1e-12) { ba = (ys - ey) / s; bb = (hy0 - ey) / s; bfb = 6; }
        else if (ey >= hy0 && ey <= ys) { ba = -BIG; bb = BIG; bfb = -1; } else { ba = BIG; bb = -BIG; bfb = -1; }
        let la = SA[0], lb = SA[1], lfb = SA[3];
        if (ba > la) la = ba;
        if (bb < lb) { lb = bb; lfb = bfb; }
        // the half circle: u^2 + (y - ys)^2 <= r^2, y >= ys
        const A = cdu * cdu + s * s, B = cu0 * cdu + (ey - ys) * s, C = cu0 * cu0 + (ey - ys) * (ey - ys) - r * r;
        const disc = B * B - A * C;
        let ca = BIG, cb = -BIG, cfb = 8;
        if (disc >= 0 && A > 1e-12) {
          const sq = Math.sqrt(disc);
          ca = (-B - sq) / A; cb = (-B + sq) / A;
          // only the upper half
          if (s > 1e-12) { const tsp = (ys - ey) / s; if (tsp > ca) ca = tsp; }
          else if (s < -1e-12) { const tsp = (ys - ey) / s; if (tsp < cb) { cb = tsp; cfb = 7; } }
          else if (ey < ys) { ca = BIG; cb = -BIG; }
        }
        // their union (one convex shape, so one interval)
        let ua, ub, ufb;
        if (la <= lb && ca <= cb) { ua = la <= ca ? la : ca; if (lb >= cb) { ub = lb; ufb = lfb; } else { ub = cb; ufb = cfb; } }
        else if (la <= lb) { ua = la; ub = lb; ufb = lfb; }
        else if (ca <= cb) { ua = ca; ub = cb; ufb = cfb; }
        else { kp.ra[k] = BIG; kp.rb[k] = -BIG; continue; }
        if (ua > a) a = ua;
        if (ub < b) { b = ub; fb = ufb; }
        if (a > b) { kp.ra[k] = BIG; kp.rb[k] = -BIG; continue; }
        kp.ra[k] = a; kp.rb[k] = b;
        // the surface met on leaving the opening (facing back into it)
        this.holeNormal(k, fb, b, s, ey, o, r, ys);
      } else {
        let ya, yb, yfb;
        if (s > 1e-12) { ya = (hy0 - ey) / s; yb = (hy1 - ey) / s; yfb = 7; }
        else if (s < -1e-12) { ya = (hy1 - ey) / s; yb = (hy0 - ey) / s; yfb = 6; }
        else if (ey >= hy0 && ey <= hy1) { ya = -BIG; yb = BIG; yfb = -1; } else { kp.ra[k] = BIG; kp.rb[k] = -BIG; continue; }
        if (ya > a) a = ya;
        if (yb < b) { b = yb; fb = yfb; }
        if (a > b) { kp.ra[k] = BIG; kp.rb[k] = -BIG; continue; }
        kp.ra[k] = a; kp.rb[k] = b;
        this.holeNormal(k, fb, b, s, ey, o, 0, 0);
      }
    }
    // the first point of the solid at or after tmin: past any crenel gap
    // and out of any opening it starts in
    let t = t0 > tmin ? t0 : tmin;
    let nx = 0, ny = 0, nz = 0, room = S[q + P.ROOM];
    if (t === t0) this.faceNormal(face, t);
    else face = -2;
    nx = this.nx; ny = this.ny; nz = this.nz;
    let kind = face === 5 ? 2 : face === 6 ? 1 : 0;
    // (a reveal met: 1 an opening's side, 2 a merlon's side; for the shading)
    let rev = 0, revO = 0;
    for (let guard = 0; guard < 2 * MAXH + 8; guard++) {
      if (t > t1) return false;
      let moved = false;
      if (kp.cren) {
        const Y = ey + s * t;
        if (Y > kp.yC + 1e-7) {
          const u = kp.u0 + kp.du * t, w = kp.w0 + kp.dw * t;
          if (!inMerlon(S, q, u, w)) {
            // in a gap: on to where the ray drops onto the gap's floor or
            // enters the next merlon
            let tn = t1 + 1, which = 0;
            if (s < -1e-12) { const tf = (kp.yC - ey) / s; if (tf >= t && tf < tn) { tn = tf; which = 1; } }
            const tm = this.nextMerlon(t, q);
            if (tm >= t && tm < tn) { tn = tm; which = 2; }
            if (tn > t1) return false;
            t = tn; moved = true;
            if (which === 1) { nx = 0; ny = 1; nz = 0; kind = 1; rev = 0; } else { nx = this.mnx; ny = 0; nz = this.mnz; kind = 0; rev = 2; }
            room = S[q + P.ROOM];
          }
        }
      }
      for (let k = 0; k < nh; k++) {
        if (kp.ra[k] <= t && t < kp.rb[k]) {
          t = kp.rb[k]; moved = true;
          nx = kp.rnx[k]; ny = kp.rny[k]; nz = kp.rnz[k];
          kind = ny > 0.5 ? 1 : ny < -0.5 ? 2 : 0;
          rev = kp.rf[k] === 0 || kp.rf[k] === 1 ? 1 : 0; revO = (kp.h0 + k) * H_STRIDE;
          room = Hs[(kp.h0 + k) * H_STRIDE + H.ROOM];
          if (room < 0) room = S[q + P.ROOM];
          break;
        }
      }
      if (!moved) break;
    }
    if (t > t1 || t >= BIG) return false;
    if (face === -2 && t === tmin && t !== t0) {
      // the ray starts inside the solid (the eye in a wall): face the eye
      nx = -kp.dx; ny = 0; nz = -kp.dz; kind = 0;
    }
    hit.D = t; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.kind = kind; hit.room = room; hit.rev = rev; hit.revO = revO;
    hit.mat = type === PT.PANE ? MAT.WINDOW : S[q + P.MAT];
    hit.cover = type === PT.PANE || (S[q + P.FLAGS] & PF.FADE) ? kp.cover : 1;
    hit.prim = q;
    return true;
  },

  // The world normal of a shape's face: 0..3 its sides, 4 its round side,
  // 5 its underside, 6 its top.
  faceNormal(face, t) {
    const kp = this.kp;
    if (face >= 0 && face < 4) { const nu = FU[face], nw = FW[face]; this.nx = nu * kp.ca - nw * kp.sa; this.nz = nu * kp.sa + nw * kp.ca; this.ny = 0; }
    else if (face === 4) {
      const u = kp.u0 + kp.du * t, w = kp.w0 + kp.dw * t, l = Math.sqrt(u * u + w * w) || 1;
      this.nx = (u * kp.ca - w * kp.sa) / l; this.nz = (u * kp.sa + w * kp.ca) / l; this.ny = 0;
    } else if (face === 5) { this.nx = 0; this.ny = -1; this.nz = 0; }
    else if (face === 6) { this.nx = 0; this.ny = 1; this.nz = 0; }
    else { this.nx = -kp.dx; this.ny = 0; this.nz = -kp.dz; }
  },

  // The surface met where a ray leaves opening k by face f at D = b: it
  // faces back into the opening. 0..3 the opening's sides, 4 a round
  // opening's wall, 5 never, 6 its floor, 7 its ceiling (or an arch's
  // spring line), 8 an arch's curve.
  holeNormal(k, f, b, s, ey, o, r, ys) {
    const kp = this.kp, Hs = this.kit.holes, hca = Hs[o + H.CA], hsa = Hs[o + H.SA];
    let nx = 0, ny = 0, nz = 0;
    if (f >= 0 && f < 4) { const nu = -FU[f], nw = -FW[f]; nx = nu * hca - nw * hsa; nz = nu * hsa + nw * hca; }
    else if (f === 4) {
      const u = kp.hu0[k] + kp.hdu[k] * b, w = kp.hw0[k] + kp.hdw[k] * b, l = Math.sqrt(u * u + w * w) || 1;
      nx = -(u * hca - w * hsa) / l; nz = -(u * hsa + w * hca) / l;
    } else if (f === 6) ny = 1;
    else if (f === 7) ny = -1;
    else if (f === 8) {
      const u = kp.hu0[k] + kp.hdu[k] * b, y = ey + s * b - ys, l = Math.sqrt(u * u + y * y) || 1;
      nx = -(u / l) * hca; nz = -(u / l) * hsa; ny = -y / l;
    } else { nx = -kp.dx; nz = -kp.dz; }
    kp.rnx[k] = nx; kp.rny[k] = ny; kp.rnz[k] = nz; kp.rf[k] = f;
  },

  // Where a ray in a crenel gap at D = t enters the next merlon along its
  // way (with this.mnx, mnz the merlon's side facing it), or BIG.
  nextMerlon(t, q) {
    const kp = this.kp, S = this.kit.prims, per = S[q + P.PER], mw = S[q + P.MW], ph = S[q + P.PH];
    if (kp.type === PT.CYL) {
      const u = kp.u0 + kp.du * t, w = kp.w0 + kp.dw * t;
      const turn = u * kp.dw - w * kp.du;          // >0: the angle grows along the ray
      const f = (Math.atan2(w, u) / (2 * Math.PI) + 0.5) * per + ph;
      const fl = Math.floor(f);
      const fb = turn > 0 ? fl + 1 : fl + mw;
      const th = ((fb - ph) / per - 0.5) * 2 * Math.PI, c = Math.cos(th), sn = Math.sin(th);
      const den = kp.du * sn - kp.dw * c;
      if (den > -1e-12 && den < 1e-12) return BIG;
      const tb = (kp.w0 * c - kp.u0 * sn) / den;
      if (tb < t || (kp.u0 + kp.du * tb) * c + (kp.w0 + kp.dw * tb) * sn < 0) return BIG;
      // the merlon's side, facing the way the ray comes from
      const nu = turn > 0 ? sn : -sn, nw = turn > 0 ? -c : c;
      this.mnx = nu * kp.ca - nw * kp.sa; this.mnz = nu * kp.sa + nw * kp.ca;
      return tb;
    }
    if (kp.du > -1e-12 && kp.du < 1e-12) return BIG;
    const u = kp.u0 + kp.du * t, f = (u + ph) / per, fl = Math.floor(f);
    const ub = (kp.du > 0 ? fl + 1 : fl + mw) * per - ph;
    const tb = (ub - kp.u0) / kp.du;
    const nu = kp.du > 0 ? -1 : 1;
    this.mnx = nu * kp.ca; this.mnz = nu * kp.sa;
    return tb < t ? BIG : tb;
  },

  // A gable roof: solid from its eaves (y0) up to its two slopes.
  prismRay(s, ey, t0, t1, face, tmin) {
    const kp = this.kp, S = this.kit.prims, q = kp.q, hit = this.hit;
    const y0 = kp.y0, y1 = kp.y1, k = (y1 - y0) / kp.hz;
    const ta = t0 > tmin ? t0 : tmin;
    // the ridge splits the crossing where w changes sign
    let split = BIG;
    if (kp.dw > 1e-12 || kp.dw < -1e-12) split = -kp.w0 / kp.dw;
    const segs = split > ta && split < t1 ? [ta, split, split, t1] : [ta, t1];
    for (let g = 0; g < segs.length; g += 2) {
      const a = segs[g], b = segs[g + 1], mid = (a + b) / 2;
      const sg = kp.w0 + kp.dw * mid >= 0 ? 1 : -1;
      // Y >= y0:  (ey - y0) + s t >= 0;  Y <= roof: (ey - y1 + k sg w0) + (s + k sg dw) t <= 0
      let lo = a, hi = b, lf = g === 0 && a === t0 ? face : -2;
      const c1 = ey - y0;
      if (s > 1e-12) { const r = -c1 / s; if (r > lo) { lo = r; lf = 5; } }
      else if (s < -1e-12) { const r = -c1 / s; if (r < hi) hi = r; }
      else if (c1 < 0) continue;
      const c2 = ey - y1 + k * sg * kp.w0, d2 = s + k * sg * kp.dw;
      if (d2 > 1e-12) { const r = -c2 / d2; if (r < hi) hi = r; }
      else if (d2 < -1e-12) { const r = -c2 / d2; if (r > lo) { lo = r; lf = 9; } }
      else if (c2 > 0) continue;
      if (lo > hi) continue;
      // the normal where it enters
      let nx, ny, nz, mat = S[q + P.MAT2], kind = 0;
      if (lf === 9 || (lf >= 2 && lf <= 3)) {
        // a slope: up and out from the ridge
        const l = Math.sqrt(1 + k * k), nw = sg * k / l;
        nx = -nw * kp.sa; nz = nw * kp.ca; ny = 1 / l; mat = S[q + P.MAT]; kind = 1;
      } else if (lf === 5) { nx = 0; ny = -1; nz = 0; kind = 2; }
      else if (lf >= 0 && lf < 2) { this.faceNormal(lf, lo); nx = this.nx; ny = 0; nz = this.nz; }
      else { nx = -kp.dx; ny = 0; nz = -kp.dz; }
      hit.D = lo; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.kind = kind; hit.room = S[q + P.ROOM]; hit.rev = 0;
      hit.mat = mat; hit.cover = 1; hit.prim = q;
      return true;
    }
    return false;
  },

  // A flight of steps rising along u, solid beneath; far off the steps melt
  // into an even slope (kp.stepK).
  stairRay(s, ey, t0, t1, face, tmin) {
    const kp = this.kp, S = this.kit.prims, q = kp.q, hit = this.hit;
    const y0 = S[q + P.BASE], rise = kp.rise, run = kp.run, n = kp.n, hx = S[q + P.HX], a = kp.stepK;
    const B = (1 - a) * rise / run;
    const ramp0 = (1 - a) * (y0 + (hx / run + 0.5) * rise);
    const topA = (kk) => ramp0 + a * (y0 + (kk + 1) * rise);        // top = topA(k) + B u
    let t = t0 > tmin ? t0 : tmin;
    let nx = 0, ny = 0, nz = 0, kind = 0;
    const entered = t === t0;
    if (entered) { this.faceNormal(face, t); nx = this.nx; ny = this.ny; nz = this.nz; kind = face === 6 ? 1 : face === 5 ? 2 : 0; }
    else { nx = -kp.dx; nz = -kp.dz; }
    const du = kp.du;
    let u = kp.u0 + du * t;
    let k = Math.floor((u + hx) / run);
    if (k < 0) k = 0; else if (k > n - 1) k = n - 1;
    for (let guard = 0; guard <= n + 1; guard++) {
      // the end of this step along the ray
      let te = t1;
      if (du > 1e-12) { const ub = -hx + (k + 1) * run; const tt = (ub - kp.u0) / du; if (tt < te) te = tt; }
      else if (du < -1e-12) { const ub = -hx + k * run; const tt = (ub - kp.u0) / du; if (tt < te) te = tt; }
      const A = topA(k);
      // g(t) = Y - top: (ey - A - B u0) + (s - B du) t
      const g0 = ey - A - B * kp.u0, g1 = s - B * du;
      const gs = g0 + g1 * t;
      if (gs <= 1e-9) {
        hit.D = t; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.kind = kind; hit.room = S[q + P.ROOM]; hit.mat = S[q + P.MAT]; hit.cover = 1; hit.prim = q; hit.rev = 0;
        return true;
      }
      if (g1 < -1e-12) {
        const tr = -g0 / g1;
        if (tr <= te) {
          const l = Math.sqrt(1 + B * B);
          const nu = -B / l;
          hit.D = tr; hit.nx = nu * kp.ca; hit.ny = 1 / l; hit.nz = nu * kp.sa; hit.kind = 1; hit.room = S[q + P.ROOM]; hit.mat = S[q + P.MAT]; hit.cover = 1; hit.prim = q; hit.rev = 0;
          return true;
        }
      }
      if (te >= t1) return false;
      t = te;
      // into the next step: a riser if it is higher
      if (du > 0) { k++; nx = -kp.ca; nz = -kp.sa; ny = 0; kind = 0; }
      else { k--; nx = kp.ca; nz = kp.sa; ny = 0; kind = 0; }
      if (k < 0 || k > n - 1) return false;
    }
    return false;
  },
};

export function installBuildings(cls) { Object.assign(cls.prototype, methods, shading); }
