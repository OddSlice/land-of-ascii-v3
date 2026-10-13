// The wild ground detail's shapes (phase 4b), drawn with the building kit's:
// a boulder or a stone of an outcrop (an ellipsoid, PT.ELL), a fallen log (a
// cylinder lying along u, PT.LOG) and a bed of reeds (PT.REED). Stumps are
// the kit's upright cylinders.
//
// Distance (art bible section 6): each is held at least two cells across and
// two rows tall, and faded by how much of that it really is (`kp.cover`), as
// a person's far silhouette is; under about 6% it is not drawn. A reed bed's
// ragged top of stems melts into an even top once the stems' heights differ
// by less than about two rows or a stem is narrower than a few columns.
//
// Reeds part round a walker: within about a metre and a half of the eye
// (horizontally) they bend down, a pure function of where the eye is, so a
// frozen clock and a fixed eye give the same picture.
import { PT, PF, P } from '../../world/kit.js';
import { LOOK } from '../../look.js';

const NEAR = 0.05;
const BIG = 1e30;
const W = LOOK.wild;
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const hashU = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const methods = {
  // The plane through the eye against wild shape q (kp: its Plane).
  wildPlane(kp, q, S, minR, rowH) {
    const t = kp.type, hx = S[q + P.HX], hz = S[q + P.HZ], base = S[q + P.BASE], y0 = S[q + P.Y0], y1 = S[q + P.Y1];
    const fade = (S[q + P.FLAGS] & PF.FADE) !== 0;
    const u0 = kp.u0, w0 = kp.w0, du = kp.du, dw = kp.dw;
    let cover = 1;
    if (t === PT.ELL) {
      const ry = y1 - base, rm = (hx + hz) / 2;
      let k = 1, ryh = ry;
      if (fade) {
        const rmh = Math.max(rm, minR);
        k = rmh / rm; ryh = Math.max(ry, rowH);
        cover = (rm / rmh) * (ry / ryh);
        if (cover < W.fadeMin) { kp.miss = true; return; }
      }
      const ex = hx * k, ez = hz * k;
      const a = (du / ex) * (du / ex) + (dw / ez) * (dw / ez), b = u0 * du / (ex * ex) + w0 * dw / (ez * ez), c = (u0 / ex) * (u0 / ex) + (w0 / ez) * (w0 / ez) - 1;
      const disc = b * b - a * c;
      if (disc < 0 || a < 1e-12) { kp.miss = true; return; }
      const sq = Math.sqrt(disc);
      kp.tA = (-b - sq) / a; kp.tB = (-b + sq) / a; kp.fA = 4;
      kp.ex = ex; kp.ez = ez; kp.ery = ryh; kp.cy = base;
      kp.y0 = Math.max(y0, base - ryh); kp.y1 = base + ryh;
    } else if (t === PT.LOG) {
      let L = hx, r = hz;
      if (fade) {
        const rh = Math.max(r, rowH), Lh = Math.max(L, minR);
        cover = (r / rh) * (L / Lh);
        if (cover < W.fadeMin) { kp.miss = true; return; }
        r = rh; L = Lh;
      }
      // the footprint: |u| <= L, |w| <= r
      let a = -BIG, b = BIG;
      for (const [q0, dq, h] of [[u0, du, L], [w0, dw, r]]) {
        if (dq > -1e-12 && dq < 1e-12) { if (q0 < -h || q0 > h) { kp.miss = true; return; } continue; }
        let ta = (-h - q0) / dq, tb = (h - q0) / dq;
        if (ta > tb) { const x = ta; ta = tb; tb = x; }
        if (ta > a) a = ta;
        if (tb < b) b = tb;
      }
      if (a > b) { kp.miss = true; return; }
      kp.tA = a; kp.tB = b; kp.fA = 4;
      kp.ex = L; kp.ez = r; kp.cy = base;
      kp.y0 = base - r; kp.y1 = base + r;
    } else {
      // a reed bed
      let R = hx, h = y1 - y0;
      if (fade) {
        const Rh = Math.max(R, minR), hh = Math.max(h, 2 * rowH);
        cover = (R / Rh) * (h / hh);
        if (cover < W.fadeMin) { kp.miss = true; return; }
        R = Rh; h = hh;
      }
      const b = u0 * du + w0 * dw, c = u0 * u0 + w0 * w0 - R * R, a = du * du + dw * dw;
      const disc = b * b - a * c;
      if (disc < 0 || a < 1e-12) { kp.miss = true; return; }
      const sq = Math.sqrt(disc);
      kp.tA = (-b - sq) / a; kp.tB = (-b + sq) / a; kp.fA = 4;
      kp.ex = R; kp.cy = y0; kp.ery = h;
      // the stems' ragged top, while their difference is a couple of rows
      // and each wave of it a few columns across (narrower, each cell would
      // land on a height of its own and the top would sparkle as you move)
      kp.jag = W.reed.jag * smooth(1.5, 3, W.reed.jag * h / rowH) * smooth(2.5, 5, W.reed.wave / minR);
      // a walker near: the bed parts round the eye
      const ox = this.v.ex - S[q + P.CX], oz = this.v.ez - S[q + P.CZ];
      kp.part = ox * ox + oz * oz < (R + W.reed.part[1] + 0.2) * (R + W.reed.part[1] + 0.2);
      kp.y0 = y0; kp.y1 = y0 + h;
    }
    if (kp.tB < NEAR) { kp.miss = true; return; }
    kp.miss = false;
    kp.cover = cover;
    kp.yTop = kp.y1;
    kp.nh = 0; kp.cren = false;
    const v = this.v, yLo = kp.y0, yHi = kp.y1, ta = Math.max(kp.tA, NEAR), tb = kp.tB;
    kp.sLo = yLo < v.ey ? (yLo - v.ey) / ta : (yLo - v.ey) / tb;
    kp.sHi = yHi > v.ey ? (yHi - v.ey) / ta : (yHi - v.ey) / tb;
  },

  // One ray of the plane: true if it meets the shape, with this.hit filled.
  wildRay(s, ey, tmin) {
    const kp = this.kp, S = this.kit.prims, q = kp.q, hit = this.hit, t = kp.type;
    const u0 = kp.u0, w0 = kp.w0, du = kp.du, dw = kp.dw, ca = kp.ca, sa = kp.sa;
    let D, nx, ny, nz, kind = 0, mat = S[q + P.MAT];
    if (t === PT.ELL) {
      const ex = kp.ex, ez = kp.ez, ry = kp.ery, cy = kp.cy, oy = ey - kp.cy;
      const A = (du / ex) * (du / ex) + (dw / ez) * (dw / ez) + (s / ry) * (s / ry);
      const B = u0 * du / (ex * ex) + w0 * dw / (ez * ez) + oy * s / (ry * ry);
      const C = (u0 / ex) * (u0 / ex) + (w0 / ez) * (w0 / ez) + (oy / ry) * (oy / ry) - 1;
      const disc = B * B - A * C;
      if (disc < 0) return false;
      const sq = Math.sqrt(disc), t1 = (-B - sq) / A, t2 = (-B + sq) / A;
      if (t2 < tmin) return false;
      D = t1 >= tmin ? t1 : tmin;
      const y = ey + s * D;
      if (y < kp.y0) return false;
      if (D === tmin && t1 < tmin) { nx = -kp.dx; ny = 0; nz = -kp.dz; }
      else {
        const gu = (u0 + du * D) / (ex * ex), gw = (w0 + dw * D) / (ez * ez), gy = (y - cy) / (ry * ry);
        nx = gu * ca - gw * sa; nz = gu * sa + gw * ca; ny = gy;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= l; ny /= l; nz /= l;
      }
      kind = ny > 0.55 ? 1 : 0;
    } else if (t === PT.LOG) {
      const L = kp.ex, r = kp.ez, oy = ey - kp.cy;
      // along the axis: the ends
      let ua, ub, fa = -1;
      if (du > -1e-12 && du < 1e-12) { if (u0 < -L || u0 > L) return false; ua = -BIG; ub = BIG; }
      else { ua = (-L - u0) / du; ub = (L - u0) / du; fa = 0; if (ua > ub) { const x = ua; ua = ub; ub = x; fa = 1; } }
      // round it: (w, y) within r of the axis
      const A = dw * dw + s * s, B = w0 * dw + oy * s, C = w0 * w0 + oy * oy - r * r;
      let ca2, cb2;
      if (A < 1e-12) { if (C > 0) return false; ca2 = -BIG; cb2 = BIG; }
      else { const disc = B * B - A * C; if (disc < 0) return false; const sq = Math.sqrt(disc); ca2 = (-B - sq) / A; cb2 = (-B + sq) / A; }
      const a = Math.max(ua, ca2), b = Math.min(ub, cb2);
      if (a > b || b < tmin) return false;
      D = a >= tmin ? a : tmin;
      if (D === tmin && a < tmin) { nx = -kp.dx; ny = 0; nz = -kp.dz; }
      else if (ua >= ca2) {
        // a cut end
        const sg = fa === 0 ? -1 : 1;
        nx = sg * ca; nz = sg * sa; ny = 0; kind = 1; mat = S[q + P.MAT2];
      } else {
        const w = w0 + dw * D, y = oy + s * D;
        nx = -w * sa / r; nz = w * ca / r; ny = y / r;
      }
    } else {
      // reeds: the round side, up to the ragged top; over it, the top
      const R = kp.ex, y0 = kp.cy, h = kp.ery;
      const cx = S[q + P.CX], cz = S[q + P.CZ], seed = S[q + P.SEED], vx = this.v.ex, vz = this.v.ez;
      const P2 = W.reed.part;
      const topAt = (x, z, side) => {
        let k = 1;
        if (kp.jag > 0) {
          // the stems' height by where round the bed they stand, the same on
          // the side and on top (two patterns would disagree at the rim, and
          // a ray there would take one, then the other)
          // (eased from one sector's height to the next, so the top's edge
          // has no steps for a moving eye to catch)
          const ang = (Math.atan2(z - cz, x - cx) + Math.PI) * R / W.reed.wave, i = Math.floor(ang), f = ang - i, e = f * f * (3 - 2 * f);
          const nS = Math.max(1, Math.round(2 * Math.PI * R / W.reed.wave)), a0 = hashU(((i % nS) + nS) % nS, seed), a1 = hashU((((i + 1) % nS) + nS) % nS, seed);
          k = 1 - kp.jag * (a0 + (a1 - a0) * e);
        }
        if (kp.part) { const d = Math.hypot(x - vx, z - vz); k *= P2[2] + (1 - P2[2]) * smooth(P2[0], P2[1], d); }
        return y0 + h * k;
      };
      let tA = kp.tA, entered = true;
      if (tA < tmin) { tA = tmin; entered = false; }
      if (tA > kp.tB) return false;
      if (!entered && tmin <= NEAR && ey < y0 + h) {
        // (the eye in the bed, below its top: the stems round you are parted
        // away, and what shows is the bed's far side, from inside, past the
        // parting; the top only from above it)
        const tE = kp.tB;
        if (tE <= P2[1]) return false;
        const xE = this.v.ex + kp.dx * tE, zE = this.v.ez + kp.dz * tE, yE = ey + s * tE;
        if (yE < y0 || yE > topAt(xE, zE, true)) return false;
        const l = Math.hypot(xE - cx, zE - cz) || 1;
        hit.D = tE; hit.nx = -(xE - cx) / l; hit.ny = 0; hit.nz = -(zE - cz) / l; hit.kind = 0; hit.room = S[q + P.ROOM]; hit.rev = 0; hit.revO = 0;
        hit.mat = mat; hit.cover = kp.cover; hit.prim = q;
        return true;
      }
      const xA = this.v.ex + kp.dx * tA, zA = this.v.ez + kp.dz * tA, yA = ey + s * tA;
      if (entered && yA >= y0 && yA <= topAt(xA, zA, true)) {
        D = tA;
        const l = Math.hypot(xA - cx, zA - cz) || 1;
        nx = (xA - cx) / l; nz = (zA - cz) / l; ny = 0;
      } else if (s < -1e-12 && yA > y0) {
        // down onto the top inside: twice, so a parted top is met where it is
        let tt = (topAt(xA, zA, false) - ey) / s;
        for (let k = 0; k < 2; k++) {
          const x = this.v.ex + kp.dx * tt, z = this.v.ez + kp.dz * tt;
          tt = (topAt(x, z, false) - ey) / s;
        }
        if (tt < tA || tt > kp.tB) return false;
        D = tt; nx = 0; ny = 1; nz = 0; kind = 1;
      } else return false;
    }
    hit.D = D; hit.nx = nx; hit.ny = ny; hit.nz = nz; hit.kind = kind; hit.room = S[q + P.ROOM]; hit.rev = 0; hit.revO = 0;
    hit.mat = mat; hit.cover = kp.cover; hit.prim = q;
    return true;
  },
};

export function installWild(cls) { Object.assign(cls.prototype, methods); }
