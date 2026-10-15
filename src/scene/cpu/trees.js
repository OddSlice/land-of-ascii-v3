// Trees, bushes and torches in the object pass (src/scene/cpu/objects.js
// culls and sorts them; this draws one): a conifer worked out once per
// vertical plane and then met by each ray of it, a bush, a torch's flame.
import { MAT } from '../../contract.js';
import { hash2 } from '../../world/noise.js';
import { TIER } from '../../world/objects.js';
import { LOOK } from '../../look.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const TT = LOOK.trees, TF = TT.trunkFade;

const methods = {
  // Foliage tone: the tree's own and the height in its tier.
  foliageTone() {
    const t = this.hit.tree;
    const tone = 0.3 * t.tone + 0.55 * (this.hit.f * 2 - 1);
    return tone < -1 ? -1 : tone > 1 ? 1 : tone;
  },

  // A conifer: a bare trunk under a stack of overlapping cone tiers, each
  // wide at its foot and narrow at its top (a sawtooth outline), with a
  // ragged edge that turns with the angle round the trunk (the tidy tiers:
  // after phase 3a the only treatment).
  //
  // Distance: no part may get thinner than about two cells, except a tip,
  // which tapers to one cell, so a far treeline keeps a jagged top of single
  // tips; under about two rows a tier melts into a smooth cone.
  //
  // Everything that depends only on the vertical plane of the ray (how near
  // it passes each tier, the ragged radii) is worked out once per plane;
  // coniferRay then intersects one ray of that plane.
  coniferPlane(t, dx, dz, minR, far, rowH) {
    const { v, cp } = this;
    const P = TT;
    const tiers = t.tiers, T = tiers.length / TIER;
    const ox = v.ex - t.x, oz = v.ez - t.z;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    const Rmax = t.reach + minR;
    cp.ox = ox; cp.oz = oz; cp.dx = dx; cp.dz = dz; cp.D0 = D0; cp.b2 = b2; cp.Rmax = Rmax; cp.minR = minR;
    cp.tiers = tiers; cp.T = T; cp.far = far;
    cp.miss = b2 > Rmax * Rmax || D0 + Rmax < 0;
    if (cp.miss) return;
    // the ragged edge fades once a sector round the trunk is under ~3 cells across
    const jagK = smooth(1.5, 3.5, (Math.PI * 2 * (t.R - 0.4) / P.sectors) / Math.max(minR, 1e-6));
    cp.jagK = jagK;
    // where each tier's axis is: the lean (and a tier's own shift, none in
    // the tidy tiers, which would close up with distance)
    const shiftK = 1 - 0.7 * far;
    for (let k = 0; k < T; k++) {
      const q = k * TIER, ym = (tiers[q] + tiers[q + 1]) / 2 - t.base;
      const kx = ox - (t.leanX * ym + tiers[q + 4] * shiftK), kz = oz - (t.leanZ * ym + tiers[q + 5] * shiftK);
      const kD0 = -(kx * dx + kz * dz);
      cp.kx[k] = kx; cp.kz[k] = kz; cp.kD0[k] = kD0; cp.kb2[k] = kx * kx + kz * kz - kD0 * kD0;
    }
    // far off the edge is smooth, the same from every side: radii once per tree
    if (jagK === 0 && cp.tiersOf === t) { this.planeHeights(t); return; }
    cp.tiersOf = jagK === 0 ? t : null;
    // the ragged edge: sectors round the trunk, smoothly joined
    const S = P.sectors;
    let a0 = 0, af = 0, ang = 0;
    if (jagK !== 0) {
      const ax = ox + dx * D0, az = oz + dz * D0;
      ang = (Math.atan2(az, ax) / (Math.PI * 2) + 0.5) * S;
      a0 = Math.floor(ang); af = ang - a0;
    }
    const top = t.top;
    for (let k = 0; k < T; k++) {
      const q = k * TIER;
      const ya = tiers[q], ybFull = tiers[q + 1];
      // a tier cut short: the gap above it closes once it is under ~2.5 rows
      const yb = tiers[q + 8] + (ybFull - tiers[q + 8]) * (1 - smooth(2, 3.5, (ybFull - tiers[q + 8]) / rowH));
      let jag = 1;
      if (jagK !== 0) {
        const jg = hash2(a0 + k * 13, t.seed, 7) * (1 - af) + hash2(a0 + 1 + k * 13, t.seed, 7) * af;
        jag = 1 + (jg - 0.5) * P.jag * jagK;
      }
      let Ra = tiers[q + 2] * jag, Rb = tiers[q + 3];
      if (k + 1 < T) Rb += (tiers[q + TIER + 2] * 0.92 - Rb) * far;
      Rb *= jag;
      // floors: two cells wide, tapering to one at the tip; below the tip the
      // crown also swells by up to a cell, so a gap between two crowns
      // closes before it is thin enough to blink
      const ta = Math.min(1, Math.max(0, (top - ya) / (8 * minR) - 1)), tb = Math.min(1, Math.max(0, (top - yb) / (8 * minR) - 1));
      Ra += minR * ta; Rb += minR * tb;
      const fa = minR * Math.min(1, 0.5 + (top - ya) / (8 * minR)), fb = minR * Math.min(1, 0.5 + (top - yb) / (8 * minR));
      if (Ra < fa) Ra = fa;
      if (Rb < fb) Rb = fb;
      cp.Ra[k] = Ra; cp.Rb[k] = Rb; cp.yb[k] = yb; cp.g[k] = (Rb - Ra) / (yb - ya);
    }
    this.planeHeights(t);
  },

  // The heights this plane can meet the tree at: tiers that reach out as
  // far as the plane passes from their axis, and the trunk if the plane
  // passes through it. A ray that stays above or below them misses.
  planeHeights(t) {
    const cp = this.cp, tiers = cp.tiers;
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < cp.T; k++) {
      const R = cp.Ra[k] > cp.Rb[k] ? cp.Ra[k] : cp.Rb[k];
      if (R * R < cp.kb2[k]) continue;
      if (tiers[k * TIER] < lo) lo = tiers[k * TIER];
      if (cp.yb[k] > hi) hi = cp.yb[k];
    }
    const rt = Math.max(t.trunkR, cp.minR);
    if (cp.b2 < rt * rt) { if (t.base - 0.4 < lo) lo = t.base - 0.4; if (t.trunkTop > hi) hi = t.trunkTop; }
    cp.yLo = lo; cp.yHi = hi;
    if (lo > hi) cp.miss = true;
  },

  coniferRay(t, s, ey) {
    const { hit, cp } = this;
    if (cp.miss) return false;
    const { dx, dz, D0, b2, Rmax, tiers, T } = cp;
    let best = Infinity, bnx = 0, bny = 0, bnz = 0, bf = 0, bmat = 0, bk = -1, bhx = 0, bhz = 0;
    // quick height test: the ray's height near the trunk
    const yNear = ey + s * (D0 - Rmax), yFar = ey + s * (D0 + Rmax);
    const yMax = Math.max(yNear, yFar), yMin = Math.min(yNear, yFar);
    if (yMax < cp.yLo || yMin > cp.yHi) return false;
    for (let k = 0; k < T; k++) {
      const ya = tiers[k * TIER], yb = cp.yb[k];
      // tiers go up the tree: once the ray is under one it is under the rest
      if (yMax < ya) break;
      if (yMin > yb) continue;
      const Ra = cp.Ra[k], g = cp.g[k];
      const kx = cp.kx[k], kz = cp.kz[k], kD0 = cp.kD0[k], kb2 = cp.kb2[k];
      // R(D) = r0 + r1 D along the ray
      const r0 = Ra + g * (ey - ya), r1 = g * s;
      const A = 1 - r1 * r1, B = kD0 + r0 * r1, C = kD0 * kD0 + kb2 - r0 * r0;
      const disc = B * B - A * C;
      if (disc >= 0 && Math.abs(A) > 1e-6) {
        const q = Math.sqrt(disc);
        const ra = (B - q) / A, rb = (B + q) / A;
        const lo = ra < rb ? ra : rb, hi = ra < rb ? rb : ra;
        for (let w = 0; w < 2; w++) {
          const D = w ? hi : lo;
          if (D <= 0.05 || D >= best) continue;
          const y = ey + s * D;
          if (y < ya || y > yb) continue;
          if (r0 + r1 * D < 0) continue;
          best = D;
          const hx = kx + dx * D, hz = kz + dz * D;
          const rho = Math.sqrt(hx * hx + hz * hz) || 1;
          const nl = Math.sqrt(1 + g * g);
          bnx = hx / rho / nl; bnz = hz / rho / nl; bny = -g / nl;
          bf = (y - ya) / (yb - ya);
          bmat = MAT.CONIFER; bk = k; bhx = hx; bhz = hz;
          break;
        }
      }
      // the tier's flat underside, seen from below
      if (s > 0) {
        const D = (ya - ey) / s;
        if (D > 0.05 && D < best) {
          const hx = kx + dx * D, hz = kz + dz * D;
          if (hx * hx + hz * hz <= Ra * Ra) { best = D; bnx = 0; bny = -1; bnz = 0; bf = 0; bmat = MAT.CONIFER; bk = k; bhx = hx; bhz = hz; }
        }
      }
    }
    // trunk
    const rt = Math.max(t.trunkR, cp.minR);
    const ox = cp.ox, oz = cp.oz;
    if (b2 < rt * rt) {
      const D = D0 - Math.sqrt(rt * rt - b2);
      const y = ey + s * D;
      if (D > 0.05 && D < best && y >= t.base - 0.4 && y <= t.trunkTop) {
        best = D;
        const hx = ox + dx * D, hz = oz + dz * D, rho = Math.sqrt(hx * hx + hz * hz) || 1;
        bnx = hx / rho; bny = 0; bnz = hz / rho; bmat = MAT.TRUNK;
        // bark: the tree's own tone, a little darker toward the foot; a far
        // trunk held wider than it is darkens (hit.lamK)
        bf = 0.5;
        hit.lamK = TF + (1 - TF) * Math.min(1, t.trunkR / rt);
        hit.tone = 0.7 * t.bark + 0.3 * (2 * Math.min(1, (y - t.base) / (t.trunkTop - t.base)) - 1);
      }
    }
    if (best === Infinity) return false;
    if (bmat === MAT.CONIFER) {
      // where on the tree, for its tone (worked out in shade, only if drawn)
      hit.tree = t; hit.tier = bk; hit.hx = bhx; hit.hz = bhz;
      hit.lamK = TT.darken;
    }
    hit.D = best; hit.nx = bnx; hit.ny = bny; hit.nz = bnz; hit.f = bf; hit.mat = bmat;
    return true;
  },

  // A bush: a squat ellipsoid with a lumpy outline.
  bush(b, dx, dz, s, minR, far, ey) {
    const { v, hit } = this;
    const rx = Math.max(b.rx, minR), ry = Math.max(b.ry, minR);
    // the lumps reach out to 1.15 rx
    const hx = v.ex - b.x, hz = v.ez - b.z, hd = hx * dx + hz * dz, wide = 1.151 * rx;
    if (hx * hx + hz * hz - hd * hd > wide * wide) return false;
    const cy = b.base + ry * 0.55;
    const ox = (v.ex - b.x) / rx, oy = (ey - cy) / ry, oz = (v.ez - b.z) / rx;
    const ddx = dx / rx, ddy = s / ry, ddz = dz / rx;
    // lumps by angle round the middle
    const D0 = -(ox * ddx + oz * ddz) / (ddx * ddx + ddz * ddz);
    const ang = (Math.atan2(oz + ddz * D0, ox + ddx * D0) / (Math.PI * 2) + 0.5) * 7;
    const a0 = Math.floor(ang), af = ang - a0;
    const lump = 1 + ((hash2(a0, b.seed, 9) * (1 - af) + hash2(a0 + 1, b.seed, 9) * af) - 0.5) * 0.3 * (1 - far);
    const A = ddx * ddx + ddy * ddy + ddz * ddz;
    const B = ox * ddx + oy * ddy + oz * ddz;
    const C = ox * ox + oy * oy + oz * oz - lump * lump;
    const disc = B * B - A * C;
    if (disc < 0) return false;
    const D = (-B - Math.sqrt(disc)) / A;
    if (D <= 0.05) return false;
    const y = ey + s * D;
    if (y < b.base - 0.1) return false;
    const px = ox + ddx * D, py = oy + ddy * D, pz = oz + ddz * D;
    let nx = px / rx, ny = py / ry, nz = pz / rx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    hit.D = D; hit.nx = nx / nl; hit.ny = ny / nl; hit.nz = nz / nl; hit.mat = MAT.BUSH;
    hit.f = Math.min(1, Math.max(0, (y - b.base) / (ry * 1.4)));
    return true;
  },

  // A torch: a wooden post and a flame on top.
  torchHit(T, dx, dz, s, minR, power, ey) {
    const { v, hit } = this;
    hit.power = power;
    const ox = v.ex - T.x, oz = v.ez - T.z;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    let best = Infinity;
    // flame: at least two rows tall, so it cannot fall between them; when
    // that is bigger than the flame really is, `cover` says how much of it is
    // flame, and resolve fades it toward what is behind
    const fl = 1 + 0.1 * Math.sin(this.t * 11.3);
    const fr = Math.max(0.17, 2 * minR) * fl;
    const size = 0.17 * fl / fr;
    {
      const fy = T.flameY;
      const oy = ey - fy;
      const A = 1 + s * s, B = -D0 + oy * s, C = ox * ox + oz * oz + oy * oy - fr * fr;
      // |o + D d|^2 = fr^2 with d = (dx, s, dz)
      const disc = B * B - A * C;
      if (disc >= 0) {
        const D = (-B - Math.sqrt(disc)) / A;
        if (D > 0.05) {
          best = D; hit.mat = MAT.FLAME; hit.nx = 0; hit.ny = 1; hit.nz = 0; hit.f = 1;
          // the core stays bright and the rim fades: by how near the ray
          // passes to the flame's centre (0 at the centre, 1 at the rim)
          const b = Math.sqrt(Math.max(0, 1 - disc / (A * fr * fr)));
          hit.cover = size + (1 - size) * (1 - b) * (1 - b);
        }
      }
    }
    const rp = Math.max(0.065, minR);
    if (b2 < rp * rp) {
      const D = D0 - Math.sqrt(rp * rp - b2);
      const y = ey + s * D;
      if (D > 0.05 && D < best && y >= T.base && y <= T.base + T.h) {
        best = D;
        const hx = ox + dx * D, hz = oz + dz * D, rho = Math.sqrt(hx * hx + hz * hz) || 1;
        hit.mat = MAT.WOOD; hit.nx = hx / rho; hit.ny = 0; hit.nz = hz / rho; hit.f = 0.5;
      }
    }
    if (best === Infinity) return false;
    hit.D = best;
    return true;
  },
};

export function installTrees(cls) { Object.assign(cls.prototype, methods); }
