// What the remaining rays see: the sky gradient, cumulus clouds, the sun or
// moon disc, and stars. Clouds are clusters of puffs cut flat underneath;
// their edges are stippled with a scattered threshold so they break up into cells
// the way the reference footage does. Stars are projected from fixed
// directions onto the cell they fall in, so they never blink as you turn.
import { MAT, HIT_STRIDE, REC } from '../../contract.js';
import { LOOK } from '../../look.js';
import { clusterAt } from '../../world/sky.js';
import { hash2, vnoise } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';
import { project } from './view.js';
import { makePalette } from '../../resolve.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// Fixed star directions on the upper hemisphere, brightest few rarest.
const STARS = (() => {
  const out = [];
  for (let i = 0; i < 900; i++) {
    const u = hash2(i, 1, SEED + 71), w = hash2(i, 2, SEED + 71);
    const y = 0.04 + 0.96 * u;                 // sin of the elevation
    const a = w * Math.PI * 2, c = Math.sqrt(1 - y * y);
    const b = Math.pow(hash2(i, 3, SEED + 71), 3);
    out.push([Math.cos(a) * c, y, Math.sin(a) * c, b]);
  }
  return out;
})();

export class SkyPass {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.cl = [];
  }

  // Cloud positions and shapes for this frame (the same in every stripe):
  // the treatment's puffs, and for banks the time of day's flattening.
  prepare(frame) {
    const t = frame.t, B = !!(frame.look && frame.look.cloud === 'B');
    const k = makePalette(frame.hour).k;
    this.treat = B ? LOOK.clouds.B : LOOK.clouds.A;
    this.flat = B ? k.cloudFlat : 1; this.stretch = B ? k.cloudStretch : 1;
    this.streaky = B;
    this.cl = [];
    for (const c of this.world.clouds.clusters) {
      const [x, z, fade] = clusterAt(c, t, this.world.center[0]);
      if (fade <= 0.01) continue;
      const main = c.puffs[0][3];
      // each puff's centre, radii (scaled by the fade and the time of day)
      // and turn, worked out once per frame: 9 numbers a puff
      const src = B ? c.puffsB : c.puffs;
      const pp = new Float64Array(src.length * 9);
      src.forEach((pf, k) => {
        const a = pf[3] * fade * this.stretch, b = pf[4] * fade * this.flat, w = pf[5] * fade;
        pp.set([x + pf[0], c.base + pf[2] * this.flat, z + pf[1], a, b, w, Math.cos(pf[6]), Math.sin(pf[6]), a === b && b === w ? 1 : 0], k * 9);
      });
      this.cl.push({ x, z, fade, base: c.base, main, cy: c.base + main * 0.3, reach: (B ? c.reachB : c.reach) * fade + 40, pp, n: src.length, seed: c.seed });
    }
  }

  run(v, rays, m, frame) {
    const hits = m.hits;
    const light = this.light;
    const sun = light.sun, moon = light.moon;
    const sunR = Math.max(1.7 * Math.PI / 180, 1.2 * v.colAngle);
    const moonR = Math.max(1.5 * Math.PI / 180, 1.2 * v.colAngle);
    const cosSun = Math.cos(sunR), cosMoon = Math.cos(moonR);
    const sw = rays.sw, jlo = rays.jlo, c0 = rays.c0;
    const Lc = light.isSun ? sun : moon;
    for (let ci = 0; ci < rays.cells; ci++) {
      if (rays.depth[ci] !== Infinity) continue;
      const p = rays.plane[ci] - jlo;
      const s = rays.sigma[ci];
      const inv = 1 / Math.sqrt(1 + s * s);
      const dx = rays.pdx[p] * inv, dy = s * inv, dz = rays.pdz[p] * inv;
      const cx = c0 + ci % sw, cy = (ci / sw) | 0;
      const o = ci * HIT_STRIDE;
      // clouds
      if (dy > 0.01 && this.cloud(v, v.ey, dx, dy, dz, cx, cy, Lc, m, ci, 0)) continue;
      this.skyRecord(hits, o, dx, dy, dz, cosSun, cosMoon);
    }
    this.stars(v, rays, hits);
    // what mirrored rays that met nothing see: the sky above the water, and
    // the sun or moon in a broken glitter path
    const G = LOOK.water.glitter, D2R = Math.PI / 180;
    const tick = Math.floor(frame.t * G.rate);
    for (let ci = 0; ci < rays.cells; ci++) {
      if (rays.rdepth[ci] !== Infinity) continue;
      const p = rays.plane[ci] - jlo;
      const s = rays.rsig[ci];
      const inv = 1 / Math.sqrt(1 + s * s);
      const dx = rays.pdx[p] * inv, dy = s * inv, dz = rays.pdz[p] * inv;
      const cx = c0 + ci % sw, cy = (ci / sw) | 0;
      const o = ci * HIT_STRIDE + REC;
      if (dy > 0.01 && this.cloud(v, rays.rey[ci], dx, dy, dz, cx, cy, Lc, m, ci, 1)) continue;
      this.skyRecord(hits, o, dx, dy, dz, cosSun, cosMoon);
      if (hits[o] !== MAT.SKY) continue;
      // the glitter: near the light's direction, narrow across and long in
      // height, broken up by a sparkle fixed to the water and the clock
      const Lg = sun[1] > -0.02 ? sun : moon[1] > -0.02 ? moon : null;
      if (!Lg) continue;
      const hl = Math.hypot(Lg[0], Lg[2]) || 1;
      const across = Math.abs(Math.atan2(dx * Lg[2] - dz * Lg[0], (dx * Lg[0] + dz * Lg[2]) / hl * hl) );
      const up = Math.asin(Math.max(-1, Math.min(1, dy))) - Math.asin(Math.max(-1, Math.min(1, Lg[1])));
      const aw = across / (G.width * D2R), al = Math.abs(up) / (G.length * D2R);
      if (aw >= 1 || al >= 1) continue;
      const pr = (1 - aw * aw) * (1 - al) * G.density;
      const wx = v.ex + rays.pdx[p] * rays.rdw[ci], wz = v.ez + rays.pdz[p] * rays.rdw[ci];
      if (hash2(Math.floor(wx * 1.7), Math.floor(wz * 1.7) * 7919 + tick, SEED + 99) >= pr) continue;
      hits[o] = Lg === sun ? MAT.SUN : MAT.MOON;
      hits[o + 1] = (255 * Math.min(1, 0.55 + pr) + 0.5) | 0;
    }
    this.mirroredStars(v, rays, hits);
  }

  // A sky record: the gradient, or the sun or moon if the ray meets its disc.
  skyRecord(hits, o, dx, dy, dz, cosSun, cosMoon) {
    const sun = this.light.sun, moon = this.light.moon;
    const ds = dx * sun[0] + dy * sun[1] + dz * sun[2];
    const dm = dx * moon[0] + dy * moon[1] + dz * moon[2];
    let mat = MAT.SKY, lit = dy > 0 ? dy : 0;
    if (ds > cosSun && sun[1] > -0.02) { mat = MAT.SUN; lit = 1; }
    else if (dm > cosMoon && moon[1] > -0.02) { mat = MAT.MOON; lit = 1; }
    hits[o] = mat;
    hits[o + 1] = (lit * 255 + 0.5) | 0;
    hits[o + 2] = 0; hits[o + 3] = 0; hits[o + 4] = 0;
    // closeness to the sun, as an angle: 255 at the sun, 0 opposite
    const ang = Math.acos(Math.max(-1, Math.min(1, ds)));
    hits[o + 5] = (255 * (1 - ang / Math.PI) + 0.5) | 0;
    hits[o + 6] = 255; hits[o + 7] = 255;
  }

  // The nearest cloud along a ray, if any. Puffs are ellipsoids (spheres for
  // cumulus), cut flat at the cloud's base; the edge is a lumpy band a few
  // cells wide that dissolves into the sky behind, with streaks along a bank.
  cloud(v, ey, dx, dy, dz, cx, cy, Lc, m, ci, slot) {
    const ex = v.ex, ez = v.ez, P = this.treat, F = this.flat, streak = P.streak;
    const jitter = hash2(cx, cy, SEED + 83) - 0.5;
    let best = Infinity, bl = 0, bdist = 0, bcover = 0;
    for (const c of this.cl) {
      // this cloud's nearest puff, and how solid its other puffs are behind it
      let cBest = Infinity, cBl = 0, cCover = 0, behind = 0;
      // bounding sphere of the cluster
      const ox = c.x - ex, oy = c.cy - ey, oz = c.z - ez;
      const tca = ox * dx + oy * dy + oz * dz;
      if (tca < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > c.reach * c.reach) continue;
      const pp = c.pp;
      for (let k = 0; k < c.n; k++) {
        const q9 = k * 9;
        const px = pp[q9], py = pp[q9 + 1], pz = pp[q9 + 2], a = pp[q9 + 3], b = pp[q9 + 4], w = pp[q9 + 5];
        const ca = pp[q9 + 6], sa = pp[q9 + 7];
        // the ray in the puff's own frame, where it is a unit sphere (a
        // sphere needs no turning)
        const rx = ex - px, ry = ey - py, rz = ez - pz;
        // quick miss: the ray passes wide of the puff's largest radius
        const tq = rx * dx + ry * dy + rz * dz, big = a > w ? (a > b ? a : b) : (w > b ? w : b);
        if (rx * rx + ry * ry + rz * rz - tq * tq > big * big || tq > 0) continue;
        let lox, loy, loz, ldx, ldy, ldz;
        if (pp[q9 + 8]) { lox = rx / a; loy = ry / a; loz = rz / a; ldx = dx / a; ldy = dy / a; ldz = dz / a; } else {
          lox = (ca * rx + sa * rz) / a; loy = ry / b; loz = (-sa * rx + ca * rz) / w;
          ldx = (ca * dx + sa * dz) / a; ldy = dy / b; ldz = (-sa * dx + ca * dz) / w;
        }
        const A = ldx * ldx + ldy * ldy + ldz * ldz;
        const Bq = lox * ldx + loy * ldy + loz * ldz;
        const C = lox * lox + loy * loy + loz * loz - 1;
        const disc = Bq * Bq - A * C;
        if (disc <= 0) continue;
        let t0 = (-Bq - Math.sqrt(disc)) / A;
        if (t0 <= 0) continue;
        let underside = false;
        let eps = disc / A;                      // 1 at the middle of the puff, 0 at its rim
        // cut flat at the cluster's base
        if (ey + t0 * dy < c.base) {
          const tb = (c.base - ey) / dy;
          const qx = lox + ldx * tb, qy = loy + ldy * tb, qz = loz + ldz * tb;
          const q2 = qx * qx + qy * qy + qz * qz;
          if (q2 >= 1) continue;
          t0 = tb; underside = true;
          eps = 1 - q2;
        }
        // a lumpy edge a few cells wide, dissolving into the sky
        const rad = Math.cbrt(a * b * w);
        const edgeW = Math.min(0.6, Math.max(0.08, P.edge * v.colAngle * t0 / rad));
        const hx = lox + ldx * t0, hy = loy + ldy * t0, hz = loz + ldz * t0;
        let lumps = vnoise(hx * 3.1 + hz * 1.7 + c.seed * 7.3 + k, hy * 3.1 - hz * 2.3, SEED + 81) * 0.6
          + vnoise(hx * 6.1 - hz * 2.9, hy * 6.1 + hz * 4.3 + k * 3, SEED + 82) * 0.2;
        // a bank's edge breaks into streaks along it: noise slow along the
        // band and quick across it, fixed to the cloud
        if (streak > 0) lumps += streak * (vnoise(hx * 1.1 + c.seed * 3.1 + k, hy * 4.2 + hz * 3.4, SEED + 84) - 0.15);
        const cover = (eps + lumps * Math.min(0.45, 2.2 * edgeW)) / edgeW + jitter * 0.35;
        if (cover < 0.15) continue;
        // a puff's dissolving edge in front of another puff's body is not a
        // hole: remember how solid the cloud behind is
        if (t0 >= cBest) { if (cover > behind) behind = cover; continue; }
        if (cCover > behind) behind = cCover;
        cBest = t0;
        cCover = cover > 1 ? 1 : cover;
        // bright tops, grey undersides, the sunny side lit: the normal is
        // the puff's, turned back out of its frame
        let nx, ny, nz;
        if (underside) { nx = 0; ny = -1; nz = 0; } else {
          const gx = hx / a, gy = hy / b, gz = hz / w;
          nx = ca * gx - sa * gz; ny = gy; nz = sa * gx + ca * gz;
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nx /= nl; ny /= nl; nz /= nl;
        }
        const up = ny * 0.5 + 0.5;
        const sunny = Math.max(0, nx * Lc[0] + ny * Lc[1] + nz * Lc[2]);
        const height = Math.min(1, Math.max(0, (ey + dy * t0 - c.base) / (c.main * 1.1 * F)));
        // a soft turn from the lit body to the grey underside, which is
        // lighter at its rim than in its middle
        const body = smooth(P.body[0], P.body[1], up);
        const under = underside ? P.under[0] + (P.under[1] - P.under[0]) * eps : 0;
        cBl = Math.min(1, Math.max(0, (0.18 + 0.62 * body + 0.3 * sunny) * (0.7 + 0.3 * height) - under));
      }
      // a puff's dissolving edge in front of the cloud's own body is not a hole
      if (cBest < best) { best = cBest; bdist = cBest; bl = cBl; bcover = Math.min(1, Math.max(cCover, behind)); }
    }
    if (best === Infinity) return false;
    // the sky behind the cloud, for its dissolving edge
    const sun = this.light.sun;
    const ang = Math.acos(Math.max(-1, Math.min(1, dx * sun[0] + dy * sun[1] + dz * sun[2])));
    m.write(ci, slot, MAT.CLOUD, bl, dy, 1 - ang / Math.PI, 0, bcover * 2 - 1, Math.min(6500, bdist));
    return true;
  }

  stars(v, rays, hits) {
    const P = [0, 0, 0];
    const W = v.W, R = v.R, c0 = rays.c0, c1 = rays.c1, sw = rays.sw;
    for (const [x, y, z, b] of STARS) {
      project(v, v.ex + x * 1000, v.ey + y * 1000, v.ez + z * 1000, P);
      if (P[2] <= 0) continue;
      const cx = Math.floor((P[0] + 1) / 2 * W), cy = Math.floor((1 - P[1]) / 2 * R);
      if (cx < c0 || cx >= c1 || cy < 0 || cy >= R) continue;
      const o = (cy * sw + (cx - c0)) * HIT_STRIDE;
      if (hits[o] !== MAT.SKY) continue;
      hits[o] = MAT.STAR;
      hits[o + 5] = (255 * (0.25 + 0.75 * b) * smooth(0.02, 0.15, y) + 0.5) | 0;
    }
  }

  // Stars in the water: each star's mirror image lands where a ray would look
  // down at it; it shows if that cell's mirrored ray sees open sky.
  mirroredStars(v, rays, hits) {
    const P = [0, 0, 0];
    const W = v.W, R = v.R, c0 = rays.c0, c1 = rays.c1, sw = rays.sw;
    for (const [x, y, z, b] of STARS) {
      project(v, v.ex + x * 1000, v.ey - y * 1000, v.ez + z * 1000, P);
      if (P[2] <= 0) continue;
      const cx = Math.floor((P[0] + 1) / 2 * W), cy = Math.floor((1 - P[1]) / 2 * R);
      if (cx < c0 || cx >= c1 || cy < 0 || cy >= R) continue;
      const o = (cy * sw + (cx - c0)) * HIT_STRIDE + REC;
      if (hits[o] !== MAT.SKY) continue;
      hits[o] = MAT.STAR;
      hits[o + 5] = (255 * (0.25 + 0.75 * b) * smooth(0.02, 0.15, y) * 0.8 + 0.5) | 0;
    }
  }
}
