// What the remaining rays see: the sky gradient, cumulus clouds, the sun or
// moon disc, and stars. Clouds are clusters of puffs cut flat underneath;
// their edges are dithered by an ordered pattern so they break up into cells
// the way the reference footage does. Stars are projected from fixed
// directions onto the cell they fall in, so they never blink as you turn.
import { MAT, HIT_STRIDE } from '../../contract.js';
import { clusterAt } from '../../world/sky.js';
import { hash2, vnoise } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';
import { project } from './view.js';

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

  // Cloud positions for this frame (the same in every stripe).
  prepare(t) {
    this.cl = [];
    for (const c of this.world.clouds.clusters) {
      const [x, z, fade] = clusterAt(c, t);
      if (fade <= 0.01) continue;
      const main = c.puffs[0][3];
      this.cl.push({ x, z, fade, base: c.base, main, cy: c.base + main * 0.3, reach: c.reach * fade + 40, puffs: c.puffs, seed: c.seed });
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
      if (dy > 0.01 && this.cloud(v, dx, dy, dz, cx, cy, Lc, m, ci)) continue;
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
    this.stars(v, rays, hits);
  }

  cloud(v, dx, dy, dz, cx, cy, Lc, m, ci) {
    const ex = v.ex, ey = v.ey, ez = v.ez;
    const dither = BAYER[(cy & 3) * 4 + (cx & 3)];
    let best = Infinity, bl = 0, bdist = 0;
    for (const c of this.cl) {
      // bounding sphere of the cluster
      const ox = c.x - ex, oy = c.cy - ey, oz = c.z - ez;
      const tca = ox * dx + oy * dy + oz * dz;
      if (tca < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > c.reach * c.reach) continue;
      for (let k = 0; k < c.puffs.length; k++) {
        const pf = c.puffs[k];
        const r = pf[3] * c.fade;
        const px = c.x + pf[0], py = c.base + pf[2], pz = c.z + pf[1];
        const qx = px - ex, qy = py - ey, qz = pz - ez;
        const t = qx * dx + qy * dy + qz * dz;
        if (t <= 0) continue;
        const b2 = qx * qx + qy * qy + qz * qz - t * t;
        if (b2 >= r * r) continue;
        let t0 = t - Math.sqrt(r * r - b2);
        let underside = false;
        let eps = 1 - b2 / (r * r);
        // cut flat at the cluster's base
        if (ey + t0 * dy < c.base) {
          const tb = (c.base - ey) / dy;
          const hx = ex + dx * tb - px, hz = ez + dz * tb - pz, hy = c.base - py;
          const q2 = hx * hx + hy * hy + hz * hz;
          if (q2 >= r * r) continue;
          t0 = tb; underside = true;
          eps = 1 - q2 / (r * r);
        }
        if (t0 >= best) continue;
        // dithered, lumpy edge a couple of cells wide
        const edgeW = Math.min(0.6, Math.max(0.05, 7 * v.colAngle * t0 / r));
        const hx = (ex + dx * t0 - px) / r, hy = (ey + dy * t0 - py) / r, hz = (ez + dz * t0 - pz) / r;
        const lumps = vnoise(hx * 3.1 + hz * 1.7 + c.seed * 7.3 + k, hy * 3.1 - hz * 2.3, SEED + 81) * 0.5
          + vnoise(hx * 7.3 - hz * 3.1, hy * 7.3 + hz * 5.9 + k * 3, SEED + 82) * 0.25;
        const cover = (eps + lumps * Math.min(0.5, 2.5 * edgeW)) / edgeW;
        if (cover < dither) continue;
        best = t0;
        bdist = t0;
        // bright tops, grey undersides, the sunny side lit
        let nx, ny, nz;
        if (underside) { nx = 0; ny = -1; nz = 0; } else { nx = hx; ny = hy; nz = hz; }
        const up = ny * 0.5 + 0.5;
        const sunny = Math.max(0, nx * Lc[0] + ny * Lc[1] + nz * Lc[2]);
        const height = Math.min(1, Math.max(0, (ey + dy * t0 - c.base) / (c.main * 1.1)));
        bl = Math.min(1, Math.max(0, (0.12 + 0.5 * up + 0.38 * sunny) * (0.55 + 0.45 * height) - (underside ? 0.12 : 0)));
      }
    }
    if (best === Infinity) return false;
    m.write(ci, MAT.CLOUD, bl, 0, 0, 0, 0, Math.min(6500, bdist));
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
}
