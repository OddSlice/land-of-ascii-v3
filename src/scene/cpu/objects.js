// Trees, bushes and the torch, in their own depth-tested pass after the
// march. Each object's screen box is found by projecting its bounds; every
// cell inside it intersects its own ray with the object's shape and keeps the
// hit if it is nearer than what the march found.
//
// No part may get thinner than about two cells on screen (it would blink
// between frames as it falls between rays), so radii have a floor that grows
// with distance, and the conifers' tiered outline melts into a smooth cone
// once a tier is only a couple of rows tall.
import { MAT } from '../../contract.js';
import { project } from './view.js';
import { hash2 } from '../../world/noise.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const P = [0, 0, 0];

export class ObjectPass {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.hit = { D: 0, nx: 0, ny: 0, nz: 0, mat: 0, f: 0 };
  }

  run(v, rays, m, frame, torch) {
    this.v = v; this.rays = rays; this.m = m; this.t = frame.t; this.torch = torch;
    const { trees, bushes } = this.world.objects;
    for (const t of trees) this.object(t, t.R, t.base - 0.4, t.top + 0.2, (ci, dx, dz, s, minR, far) => this.conifer(t, dx, dz, s, minR, far));
    for (const b of bushes) this.object(b, b.rx, b.base - 0.2, b.base + b.ry * 1.6, (ci, dx, dz, s, minR, far) => this.bush(b, dx, dz, s, minR, far));
    const T = this.world.objects.torch;
    this.object(T, 0.4, T.base, T.flameY + 0.5, (ci, dx, dz, s, minR) => this.torchHit(T, dx, dz, s, minR));
  }

  // Find the object's cells and test each.
  object(o, R, y0, y1, test) {
    const { v, rays } = this;
    const dist = Math.hypot(o.x - v.ex, o.z - v.ez);
    const minR = v.colAngle * Math.max(dist, 0.5);
    const RR = R + minR;
    // screen box from the bounding box's corners
    let xlo = 1e9, xhi = -1e9, ylo = 1e9, yhi = -1e9, behind = 0;
    for (let c = 0; c < 8; c++) {
      project(v, o.x + (c & 1 ? RR : -RR), c & 2 ? y1 : y0, o.z + (c & 4 ? RR : -RR), P);
      if (P[2] < 0.05) { behind++; continue; }
      if (P[0] < xlo) xlo = P[0]; if (P[0] > xhi) xhi = P[0];
      if (P[1] < ylo) ylo = P[1]; if (P[1] > yhi) yhi = P[1];
    }
    if (behind === 8) return;
    const W = v.W, Rr = v.R, c0 = rays.c0, c1 = rays.c1;
    let cxa, cxb, cya, cyb;
    if (behind) { cxa = c0; cxb = c1 - 1; cya = 0; cyb = Rr - 1; }
    else {
      cxa = Math.max(c0, Math.floor((xlo + 1) / 2 * W - 1.5));
      cxb = Math.min(c1 - 1, Math.ceil((xhi + 1) / 2 * W + 0.5));
      cya = Math.max(0, Math.floor((1 - yhi) / 2 * Rr - 1.5));
      cyb = Math.min(Rr - 1, Math.ceil((1 - ylo) / 2 * Rr + 0.5));
    }
    if (cxa > cxb || cya > cyb) return;
    // how many rows a conifer tier covers; under ~3 the tiers melt into a cone
    const tierRows = 2.3 / (Math.max(dist, 1) * v.rowAngle);
    const far = smooth(5, 2.2, tierRows);
    const sw = rays.sw, jlo = rays.jlo;
    const hit = this.hit;
    for (let cy = cya; cy <= cyb; cy++) {
      for (let cx = cxa; cx <= cxb; cx++) {
        const ci = cy * sw + (cx - c0);
        const p = rays.plane[ci] - jlo;
        const dx = rays.pdx[p], dz = rays.pdz[p], s = rays.sigma[ci];
        if (!test(ci, dx, dz, s, minR, far)) continue;
        if (hit.D >= rays.depth[ci]) continue;
        rays.depth[ci] = hit.D;
        this.shade(ci, dx, dz, s);
      }
    }
  }

  shade(ci, dx, dz, s) {
    const { v, m, light, hit } = this;
    const D = hit.D, x = v.ex + dx * D, y = v.ey + s * D, z = v.ez + dz * D;
    const len = Math.sqrt(1 + s * s);
    if (hit.mat === MAT.FLAME) {
      m.write(ci, MAT.FLAME, this.torch.power * 0.8, 0, 0, 1, 0, D * len);
      return;
    }
    const L = light.L;
    let lam = hit.nx * L[0] + hit.ny * L[1] + hit.nz * L[2];
    // needles and leaves scatter light a little round the side
    lam = hit.mat === MAT.CONIFER || hit.mat === MAT.BUSH ? Math.max(0, (lam + 0.3) / 1.3) : Math.max(0, lam);
    if (hit.mat === MAT.CONIFER) lam *= 0.5 + 0.5 * hit.f;
    const shadow = light.shadowAt(x + hit.nx * 0.7, y + 0.15, z + hit.nz * 0.7);
    const cloud = light.cloudAt(x, z);
    const glow = m.glowAt(x, y, z, hit.nx, hit.ny, hit.nz);
    m.write(ci, hit.mat, lam, shadow, cloud, glow, hit.f * 2 - 1, D * len);
  }

  // A conifer: a bare trunk under a stack of overlapping cone tiers, each
  // wide at its foot and narrow at its top (a sawtooth outline), with a
  // ragged edge that turns with the angle round the trunk.
  conifer(t, dx, dz, s, minR, far) {
    const { v, hit } = this;
    const ox = v.ex - t.x, oz = v.ez - t.z, ey = v.ey;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    const Rmax = t.R + minR;
    if (b2 > Rmax * Rmax || D0 + Rmax < 0) return false;
    // ragged edge: 9 sectors round the trunk, smoothly joined
    const ax = ox + dx * D0, az = oz + dz * D0;
    const ang = (Math.atan2(az, ax) / (Math.PI * 2) + 0.5) * 9;
    const a0 = Math.floor(ang), af = ang - a0;
    let best = Infinity, bnx = 0, bny = 0, bnz = 0, bf = 0, bmat = 0;
    const tiers = t.tiers, T = tiers.length / 4;
    const jagK = 1 - far;
    for (let k = 0; k < T; k++) {
      const ya = tiers[k * 4], yb = tiers[k * 4 + 1];
      // quick height test: the ray's height near the trunk
      const yNear = ey + s * (D0 - Rmax), yFar = ey + s * (D0 + Rmax);
      if (Math.max(yNear, yFar) < ya || Math.min(yNear, yFar) > yb) continue;
      const jg = hash2(a0 + k * 13, t.seed, 7) * (1 - af) + hash2(a0 + 1 + k * 13, t.seed, 7) * af;
      const jag = 1 + (jg - 0.5) * 0.36 * jagK;
      let Ra = tiers[k * 4 + 2] * jag, Rb = tiers[k * 4 + 3];
      if (k + 1 < T) Rb += (tiers[k * 4 + 6] * 0.92 - Rb) * far;
      Rb *= jag;
      if (Ra < minR) Ra = minR;
      if (Rb < minR * 0.6) Rb = minR * 0.6;
      const g = (Rb - Ra) / (yb - ya);
      // R(D) = r0 + r1 D along the ray
      const r0 = Ra + g * (ey - ya), r1 = g * s;
      const A = 1 - r1 * r1, B = D0 + r0 * r1, C = D0 * D0 + b2 - r0 * r0;
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
          const hx = ox + dx * D, hz = oz + dz * D;
          const rho = Math.sqrt(hx * hx + hz * hz) || 1;
          const nl = Math.sqrt(1 + g * g);
          bnx = hx / rho / nl; bnz = hz / rho / nl; bny = -g / nl;
          bf = (y - ya) / (yb - ya);
          bmat = MAT.CONIFER;
          break;
        }
      }
      // the tier's flat underside, seen from below
      if (s > 0) {
        const D = (ya - ey) / s;
        if (D > 0.05 && D < best) {
          const hx = ox + dx * D, hz = oz + dz * D;
          if (hx * hx + hz * hz <= Ra * Ra) { best = D; bnx = 0; bny = -1; bnz = 0; bf = 0; bmat = MAT.CONIFER; }
        }
      }
    }
    // trunk
    const rt = Math.max(0.24, minR);
    if (b2 < rt * rt) {
      const D = D0 - Math.sqrt(rt * rt - b2);
      const y = ey + s * D;
      if (D > 0.05 && D < best && y >= t.base - 0.4 && y <= t.trunkTop) {
        best = D;
        const hx = ox + dx * D, hz = oz + dz * D, rho = Math.sqrt(hx * hx + hz * hz) || 1;
        bnx = hx / rho; bny = 0; bnz = hz / rho; bf = 0.5; bmat = MAT.TRUNK;
      }
    }
    if (best === Infinity) return false;
    hit.D = best; hit.nx = bnx; hit.ny = bny; hit.nz = bnz; hit.f = bf; hit.mat = bmat;
    return true;
  }

  // A bush: a squat ellipsoid with a lumpy outline.
  bush(b, dx, dz, s, minR, far) {
    const { v, hit } = this;
    const rx = Math.max(b.rx, minR), ry = Math.max(b.ry, minR);
    const cy = b.base + ry * 0.55;
    const ox = (v.ex - b.x) / rx, oy = (v.ey - cy) / ry, oz = (v.ez - b.z) / rx;
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
    const y = v.ey + s * D;
    if (y < b.base - 0.1) return false;
    const px = ox + ddx * D, py = oy + ddy * D, pz = oz + ddz * D;
    let nx = px / rx, ny = py / ry, nz = pz / rx;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    hit.D = D; hit.nx = nx / nl; hit.ny = ny / nl; hit.nz = nz / nl; hit.mat = MAT.BUSH;
    hit.f = Math.min(1, Math.max(0, (y - b.base) / (ry * 1.4)));
    return true;
  }

  // The torch: a wooden post and a flame on top.
  torchHit(T, dx, dz, s, minR) {
    const { v, hit } = this;
    const ox = v.ex - T.x, oz = v.ez - T.z, ey = v.ey;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    let best = Infinity;
    // flame
    const fr = Math.max(0.17, minR) * (1 + 0.1 * Math.sin(this.t * 11.3));
    {
      const fy = T.flameY;
      const oy = ey - fy;
      const A = 1 + s * s, B = -D0 + oy * s, C = ox * ox + oz * oz + oy * oy - fr * fr;
      // |o + D d|^2 = fr^2 with d = (dx, s, dz)
      const disc = B * B - A * C;
      if (disc >= 0) {
        const D = (-B - Math.sqrt(disc)) / A;
        if (D > 0.05) { best = D; hit.mat = MAT.FLAME; hit.nx = 0; hit.ny = 1; hit.nz = 0; hit.f = 1; }
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
  }
}
