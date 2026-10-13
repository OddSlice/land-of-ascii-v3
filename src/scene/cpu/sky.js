// What the remaining rays see: the sky gradient, cumulus clouds, the sun or
// moon disc, and stars. Clouds are clusters of puffs cut flat underneath;
// their edges are stippled with a scattered threshold so they break up into cells
// the way the reference footage does. Stars are projected from fixed
// directions onto the cell they fall in, so they never blink as you turn.
import { MAT, MAT_NONE, HIT_STRIDE, REC } from '../../contract.js';
import { lineAt, crossLine, profileAt, leanWindow, leanBlend } from '../../world/backdrop.js';
import { SCALE } from '../../world/scale.js';
import { LOOK, ruleOf } from '../../look.js';
import { clusterAt, cloudAmount } from '../../world/sky.js';
import { weatherParams } from '../../weather.js';
import { hash2, vnoise, fbm } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';
import { project } from './view.js';
import { waterRays, swellSlope } from './water.js';
import { bil2, bilU8 } from './sample.js';
import { makePalette } from '../../resolve.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const EDGE_MIN = LOOK.clouds.edgeMin;

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
    // the generated world's sea runs on past the edge of the map and past the
    // view distance, so it meets the sky at the horizon, not in a line
    this.seaLevel = world.openEdge && world.sea !== undefined ? world.sea : null;
    // the generated world's backdrop (built by the backend), drawn under the far rule
    this.bd = world.openEdge && world.backdrop ? world.backdrop : null;
    this.X = [0, 0]; this.Pr = [0, 0]; this.Pl = [0, 0, 0, 0, 0, 0];
  }

  // For each plane of the stripe, where its line leaves the map's side of
  // each ridgeline: distance, arc length, the ridgeline's height and slope
  // there; and the plane's skyline on the backdrop as seen from the eye.
  backdropPlanes(v, rays) {
    const bd = this.bd, np = rays.np, K = bd.layers.length;
    if (!this.bT || this.bT.length < np * K) {
      const n = (np + 64) * K;
      this.bT = new Float64Array(n); this.bU = new Float64Array(n); this.bH = new Float64Array(n);
      // (and what shading needs that depends only on where the plane meets
      // the ridgeline: the way out and along, the snow and tree lines, the
      // face's lean at each smoothing window)
      this.bP = new Float64Array(n * 4); this.bLine = new Float64Array(n); this.bTree = new Float64Array(n); this.bLean = new Float64Array(n * 4);
      this.bTop = new Float64Array(np + 64); this.bTopK = new Int8Array(np + 64);
    }
    const X = this.X, Pr = this.Pr;
    for (let p = 0; p < np; p++) {
      let top = -Infinity, tk = 0;
      for (let k = 0; k < K; k++) {
        const q = p * K + k, Ly = bd.layers[k];
        crossLine(bd, Ly.D, v.ex, v.ez, rays.pdx[p], rays.pdz[p], X);
        this.bT[q] = X[0]; this.bU[q] = X[1];
        if (X[0] === Infinity) continue;
        profileAt(Ly, bd.step, X[1], Pr);
        this.bH[q] = Pr[0];
        if (Pr[0] <= SCALE.sea + 3) continue;
        const u = X[1], P = lineAt(bd, Ly.D, u, this.Pl);
        this.bP[q * 4] = P[2]; this.bP[q * 4 + 1] = P[3]; this.bP[q * 4 + 2] = P[4]; this.bP[q * 4 + 3] = P[5];
        this.bLine[q] = SCALE.sea + Ly.snow + 45 * fbm(u / 700, k * 3.1, SEED + 142, 2);
        this.bTree[q] = SCALE.sea + Ly.tree + 30 * vnoise(u / 500, k * 3.3, SEED + 144);
        for (let wi = 0; wi < 4; wi++) this.bLean[q * 4 + wi] = leanWindow(Ly, bd.step, u, wi);
        const st = (Pr[0] - v.ey) / X[0];
        if (st > top) { top = st; tk = k; }
      }
      this.bTop[p] = top; this.bTopK[p] = tk;
    }
  }

  // The first ridgeline a ray of slope s from height ey meets in plane p (-1: none).
  // (where a ridgeline has fallen to the sea it is not there: the sea is)
  backdropHit(p, s, ey) {
    const K = this.bd.layers.length, low = SCALE.sea + 3;
    for (let k = 0, q = p * K; k < K; k++, q++) {
      const t = this.bT[q], h = this.bH[q];
      if (t < Infinity && h > low && ey + s * t < h) return k;
    }
    return -1;
  }

  // A ray of slope s from height ey meets ridgeline k of plane p: its rock,
  // snow, or wooded lower slopes, lit by the sun or moon through the face's
  // own lean (it faces the map, leaning back, turned by the line's peaks and
  // saddles), its gullies dark and its rock in broad strata.
  backdropShade(m, ci, slot, p, k, s, ey, dist, rowAngle) {
    const bd = this.bd, K = bd.layers.length, q = p * K + k, Ly = bd.layers[k];
    const t = this.bT[q], u = this.bU[q], H = this.bH[q], y = ey + s * t;
    const FAR = LOOK.far, C = SCALE.backdrop;
    const g = smooth(0.6, 0.88, vnoise(u / 75, y / 320, SEED + 141 + k));
    // snow caps the peaks: above the line, the more of a peak the taller it
    // stands over it, so the snow line follows the peaks instead of cutting
    // them all at one height; it runs down the gullies
    const line = this.bLine[q];
    const snowY = line + Math.max(0, H - line) * C.cap - 40 * g;
    // (strata finer than a couple of rows fade, as on the map's own range)
    const strata = 1 - smooth(FAR.strata * 0.15, FAR.strata * 0.55, dist * rowAngle);
    let mat, tone;
    if (y > snowY) { mat = MAT.SNOW; tone = 0.25 * (vnoise(u / 60, y / 40, SEED + 143) * 2 - 1); }
    else if (y < this.bTree[q]) {
      const wood = vnoise(u / 90, y / 60, SEED + 145) > 0.42;
      mat = wood ? MAT.CONIFER : MAT.GRASS;
      tone = 0.6 * (vnoise(u / 25, y / 30, SEED + 146) * 2 - 1);
    } else { mat = MAT.ROCK; tone = FAR.bands * strata * Math.sin(y * 2 * Math.PI / FAR.strata + 2.5 * vnoise(u / 400, k * 2.7, SEED + 147)); }
    // the face's normal: leaning back from the map at C.face, turned along
    // the line by the ridgeline's slope near the crest
    const lean = C.lean * leanBlend(this.bLean, q * 4, H - y), q4 = q * 4, P = this.bP;
    let nx = -lean * P[q4 + 2] - C.face * P[q4], nz = -lean * P[q4 + 3] - C.face * P[q4 + 1], ny = 1;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl;
    const L = this.light.L;
    let lam = nx * L[0] + ny * L[1] + nz * L[2];
    if (mat === MAT.CONIFER || mat === MAT.GRASS) lam = Math.max(0, (lam + 0.2) / 1.2);
    else lam = Math.max(0, lam) * (1 - FAR.gully * g);
    m.write(ci, slot, mat, lam, 0, 0, 0, tone, dist);
  }

  // A ray that met nothing within the view distance and comes down to sea
  // level over open sea (past the map's edge, the edge's sea runs on): a
  // calm water surface whose mirror is the sky, filled in by run() below.
  farSea(v, rays, m, ci, p, s) {
    const sea = this.seaLevel, T = this.world.terrain, N = this.world.N, NN = this.world.NN;
    if (v.ey <= sea) return false;
    const D = (v.ey - sea) / -s;
    const x = v.ex + rays.pdx[p] * D, z = v.ez + rays.pdz[p] * D;
    if (bilU8(T.wWater, x, z, N, NN) < 0.5 || Math.abs(bil2(T.levels[0], T.levels[0].H, x, z) - sea) > 0.05) return false;
    // (with the swell, faded by the cell's footprint, in the generated world)
    const len = Math.sqrt(1 + s * s), fp = D * len * v.rowAngle / Math.max(0.006, -s / len);
    const wr = waterRays(s, T.shore ? swellSlope(x, z, this.t, rays.pdx[p], rays.pdz[p], fp) * this.swellK : 0);
    m.write(ci, 0, MAT.WATER, this.light.L[1], 0, this.light.cloudAt(x, z), 0, wr.F * 2 - 1, D * len);
    rays.rsig[ci] = wr.sr; rays.rdw[ci] = D; rays.rey[ci] = 2 * sea - v.ey; rays.rdepth[ci] = Infinity;
    return true;
  }

  // Cloud positions and shapes for this frame (the same in every stripe):
  // the treatment's puffs, and for banks the time of day's flattening.
  prepare(frame) {
    const t = frame.t, B = !!(frame.look && frame.look.cloud === 'B');
    const pal = makePalette(frame.hour, frame.day || 0, ruleOf(frame.look, 'night'), frame.weather), k = pal.k;
    this.illum = pal.night === 'p1' ? 1 : pal.illum;
    this.farRule = ruleOf(frame.look, 'air') === 'aerial';
    this.t = frame.t;
    this.treat = B ? LOOK.clouds.B : LOOK.clouds.A;
    // the weather (phase 2b): how many clouds, how big, how flat and long,
    // how low, how far drifted; how much of the sun, moon and stars shows
    const P = weatherParams(frame.weather);
    this.flat = (B ? k.cloudFlat : 1) * P.flat; this.stretch = (B ? k.cloudStretch : 1) * P.stretch;
    this.disc = smooth(0.25, 0.9, P.sun);
    this.starK = P.stars; this.swellK = P.swell;
    // (under rain, how far a reflection looks for clouds)
    this.mirrorMax = P.rain > 0 ? LOOK.weather.rain.mirror.clouds / P.rain : Infinity;
    this.streaky = B;
    this.cl = [];
    for (const c of this.world.clouds.clusters) {
      const [x, z, fade0] = clusterAt(c, t, this.world.center[0], P.drift);
      const amt = cloudAmount(c.rank, P.clouds) * P.size;
      const fade = fade0 * amt;
      if (fade <= 0.01) continue;
      const main = c.puffs[0][3], base = c.base * P.low;
      // each puff's centre, radii (scaled by the fade and the time of day)
      // and turn, worked out once per frame: 9 numbers a puff
      const src = B ? c.puffsB : c.puffs;
      const pp = new Float64Array(src.length * 9);
      src.forEach((pf, k) => {
        const a = pf[3] * fade * this.stretch, b = pf[4] * fade * this.flat, w = pf[5] * fade;
        pp.set([x + pf[0], base + pf[2] * this.flat, z + pf[1], a, b, w, Math.cos(pf[6]), Math.sin(pf[6]), a === b && b === w ? 1 : 0], k * 9);
      });
      // (puffs grown, stretched or lowered by the weather: bound them as they
      // are this frame, round the cluster's middle)
      const R = B ? c.reachB : c.reach;
      let reach;
      if (P.fair) reach = R * fade + 40;
      else {
        reach = 0;
        const cyy = base + main * 0.3;
        for (let k = 0; k < src.length; k++) {
          const q9 = k * 9, a = pp[q9 + 3], b = pp[q9 + 4], w = pp[q9 + 5], big = a > w ? (a > b ? a : b) : (w > b ? w : b);
          const d = Math.hypot(pp[q9] - x, pp[q9 + 1] - cyy, pp[q9 + 2] - z) + big;
          if (d > reach) reach = d;
        }
        reach += 40;
      }
      // how far any of its puffs reaches from its middle across the ground
      let hreach = 0;
      for (let k = 0; k < src.length; k++) {
        const q9 = k * 9, a = pp[q9 + 3], w = pp[q9 + 5];
        const d = Math.hypot(pp[q9] - x, pp[q9 + 2] - z) + (a > w ? a : w);
        if (d > hreach) hreach = d;
      }
      this.cl.push({ x, z, fade, base, main, cy: base + main * 0.3, reach, hreach, pp, n: src.length, seed: c.seed });
    }
  }

  run(v, rays, m, frame) {
    const hits = m.hits;
    const useBd = !!(this.bd && this.farRule);
    if (useBd) this.backdropPlanes(v, rays);
    const K = this.bd ? this.bd.layers.length : 0;
    const light = this.light;
    const sun = light.sun, moon = light.moon;
    const sunR = Math.max(1.7 * Math.PI / 180, 1.2 * v.colAngle);
    const moonR = Math.max(1.5 * Math.PI / 180, 1.2 * v.colAngle);
    const cosSun = Math.cos(sunR), cosMoon = Math.cos(moonR);
    const sw = rays.sw, jlo = rays.jlo, c0 = rays.c0;
    const Lc = light.isSun ? sun : moon;
    // for each plane, the clouds it can meet at all, and of each the puffs:
    // those whose bounding sphere (a puff's: its largest radius) comes within
    // reach of the plane's line, a metre to spare, so nothing a ray's own
    // test would keep is dropped
    const np = rays.np, cl = this.cl, ncl = cl.length;
    let npf = 0;
    for (const c of cl) npf += c.n;
    if (!this.plS || this.plS.length < np + 1) this.plS = new Int32Array(np + 64);
    if (!this.plI || this.plI.length < np * ncl) { this.plI = new Int16Array(Math.max(64, (np + 64) * ncl)); this.plPS = new Int32Array(this.plI.length); this.plPN = new Int16Array(this.plI.length); this.plL = new Float64Array(this.plI.length); this.plH = new Float64Array(this.plI.length); }
    if (!this.plP || this.plP.length < np * npf) this.plP = new Int16Array(Math.max(64, (np + 64) * npf));
    let at = 0, ap = 0;
    for (let p = 0; p < np; p++) {
      this.plS[p] = at;
      const pdx = rays.pdx[p], pdz = rays.pdz[p];
      for (let k = 0; k < ncl; k++) {
        const c = cl[k], lat = (c.x - v.ex) * pdz - (c.z - v.ez) * pdx;
        if (lat > c.reach + 1 || lat < -c.reach - 1) continue;
        const p0 = ap, pp = c.pp;
        for (let u = 0; u < c.n; u++) {
          const q9 = u * 9, a = pp[q9 + 3], b = pp[q9 + 4], w = pp[q9 + 5];
          const big = a > w ? (a > b ? a : b) : (w > b ? w : b);
          const pl = (pp[q9] - v.ex) * pdz - (pp[q9 + 2] - v.ez) * pdx;
          if (pl <= big + 1 && pl >= -big - 1) this.plP[ap++] = u;
        }
        if (ap === p0) continue;
        // (phase 2b) the nearest any of its puffs can be along the plane: no
        // ray of the plane can meet it nearer, so once a ray has met a cloud
        // nearer than that, this one and those after it are passed over
        const along = (c.x - v.ex) * pdx + (c.z - v.ez) * pdz, lb = along - c.reach;
        // kept sorted by that, nearest first (the lists are short), with the
        // furthest any of its puffs reaches along the plane
        let q = at;
        while (q > this.plS[p] && this.plL[q - 1] > lb) { this.plI[q] = this.plI[q - 1]; this.plPS[q] = this.plPS[q - 1]; this.plPN[q] = this.plPN[q - 1]; this.plL[q] = this.plL[q - 1]; this.plH[q] = this.plH[q - 1]; q--; }
        this.plI[q] = k; this.plPS[q] = p0; this.plPN[q] = ap - p0; this.plL[q] = lb; this.plH[q] = along + c.hreach; at++;
      }
    }
    this.plS[np] = at;
    for (let ci = 0; ci < rays.cells; ci++) {
      if (rays.depth[ci] !== Infinity) continue;
      const p = rays.plane[ci] - jlo;
      const s = rays.sigma[ci];
      const inv = 1 / Math.sqrt(1 + s * s);
      const dx = rays.pdx[p] * inv, dy = s * inv, dz = rays.pdz[p] * inv;
      const cx = c0 + ci % sw, cy = (ci / sw) | 0;
      const o = ci * HIT_STRIDE;
      // the backdrop (the far rule): the first ridgeline the ray meets
      const bk = useBd ? this.backdropHit(p, s, v.ey) : -1;
      const bDist = bk >= 0 ? this.bT[p * K + bk] / inv : Infinity;
      // the open sea, beyond the view distance (generated world only)
      if (bk < 0 && dy < 0 && this.seaLevel !== null && this.farSea(v, rays, m, ci, p, s)) { hits[o + 2 * REC] = MAT_NONE; continue; }
      // a skyline just below the ray (the map's, from the march, or the
      // backdrop's) covers part of the cell: how much, and how far it is
      let fc = rays.fringe[ci], fBd = false, fDist = fc > 0 ? (hits[o + 2 * REC + 6] | (hits[o + 2 * REC + 7] << 8)) / 10 : Infinity;
      if (useBd && bk < 0) {
        const st = this.bTop[p], sb = rays.sigB[ci];
        if (st > sb && st < s) {
          const c2 = (st - sb) / (s - sb);
          if (c2 > fc) { fc = c2; fBd = true; fDist = this.bT[p * K + this.bTopK[p]] * Math.sqrt(1 + st * st); }
        }
      }
      // what the ray meets: a cloud, a ridgeline, or the sky
      const cd = dy > 0.01 ? this.cloud(v, v.ey, dx, dy, dz, cx, cy, Lc, m, ci, 0, p) : Infinity;
      let behind = cd;
      if (bk >= 0 && bDist < cd) { this.backdropShade(m, ci, 0, p, bk, s, v.ey, bDist, v.rowAngle); behind = bDist; }
      else if (cd === Infinity) this.skyRecord(hits, o, dx, dy, dz, cosSun, cosMoon);
      // the skyline in front: what the ray meets moves behind (R1), with the
      // share the land covers; the land at the skyline takes the cell
      if (fc > 0 && fDist < behind) {
        if (fBd) { const st = this.bTop[p]; this.backdropShade(m, ci, 2, p, this.bTopK[p], st, v.ey, fDist, v.rowAngle); }
        for (let b = 0; b < REC; b++) { hits[o + REC + b] = hits[o + b]; hits[o + b] = hits[o + 2 * REC + b]; }
        hits[o + REC + 4] = Math.round(fc >= 1 ? 255 : fc * 255);
      }
      hits[o + 2 * REC] = MAT_NONE;
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
      const ey = rays.rey[ci];
      const bk = useBd ? this.backdropHit(p, s, ey) : -1;
      const bDist = bk >= 0 ? this.bT[p * K + bk] / inv : Infinity;
      const cd = dy > 0.01 ? this.cloud(v, ey, dx, dy, dz, cx, cy, Lc, m, ci, 1, p, this.mirrorMax) : Infinity;
      // (a ridgeline in the water: its leg is from the water on)
      if (bk >= 0 && bDist < cd) { this.backdropShade(m, ci, 1, p, bk, s, ey, bDist - rays.rdw[ci] / inv, v.rowAngle); continue; }
      if (cd < Infinity) continue;
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
      const pr = (1 - aw * aw) * (1 - al) * G.density * (Lg === sun ? 1 : this.illum) * this.disc;
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
    // (under cloud the discs fade into the sky behind them, phase 2b)
    // (resolve fades them by the palette's `disc`)
    const disc = this.disc;
    if (ds > cosSun && sun[1] > -0.02 && disc > 0.02) { mat = MAT.SUN; lit = 1; }
    else if (dm > cosMoon && moon[1] > -0.02 && this.illum >= LOOK.moon.showAt && disc > 0.02) {
      // (the moon as bright as its lit share; a new moon is not drawn)
      mat = MAT.MOON; lit = this.illum >= 1 ? 1 : LOOK.moon.disc + (1 - LOOK.moon.disc) * this.illum;
    }
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
  // `far`: no cloud is looked for that lies wholly beyond this (a reflection under rain).
  cloud(v, ey, dx, dy, dz, cx, cy, Lc, m, ci, slot, p, far = Infinity) {
    const ex = v.ex, ez = v.ez, P = this.treat, F = this.flat, streak = P.streak;
    const jitter = hash2(cx, cy, SEED + 83) - 0.5;
    let best = Infinity, bl = 0, bdist = 0, bcover = 0;
    const plI = this.plI, plP = this.plP, cl = this.cl, plL = this.plL, plH = this.plH;
    const hs = Math.sqrt(dx * dx + dz * dz);
    for (let q = this.plS[p], qe = this.plS[p + 1]; q < qe; q++) {
      // (a nearer cloud already met: this one and the rest lie beyond it)
      if (plL[q] >= best || plL[q] >= far) break;
      const c = cl[plI[q]];
      // (phase 2b) a cloud is cut flat at its base: a ray still under it
      // past the cloud's far side cannot meet it
      if ((c.base - ey) * hs > plH[q] * dy) continue;
      // this cloud's nearest puff, and how solid its other puffs are behind it
      let cBest = Infinity, cBl = 0, cCover = 0, behind = 0;
      // bounding sphere of the cluster
      const ox = c.x - ex, oy = c.cy - ey, oz = c.z - ez;
      const tca = ox * dx + oy * dy + oz * dz;
      if (tca < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
      if (d2 > c.reach * c.reach) continue;
      const pp = c.pp;
      for (let u = this.plPS[q], ue = u + this.plPN[q]; u < ue; u++) {
        const k = plP[u], q9 = k * 9;
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
        let edgeW = Math.min(0.6, Math.max(0.08, P.edge * v.colAngle * t0 / rad));
        // (phase 2b) at least LOOK.clouds.edgeMin rows deep across the puff's
        // smallest radius; a puff too small for that fades as a whole
        const small = a < b ? (a < w ? a : w) : (b < w ? b : w);
        const need = EDGE_MIN * v.rowAngle * t0 / small;
        let whole = 1;
        if (need > edgeW) { if (need > 0.6) { whole = 0.6 / need; edgeW = 0.6; } else edgeW = need; }
        const hx = lox + ldx * t0, hy = loy + ldy * t0, hz = loz + ldz * t0;
        // (phase 4a) the lumps' noise lies between -0.8 - 1.15 streak and
        // 0.8 + 0.85 streak, and the cover rises with it: where even the
        // least lumps make it whole (deep inside a puff), or the most leave
        // it under the cut (well outside), the noise is not needed, and every
        // use of the cover past 1 is clamped to 1, so the result is the same
        const fl = Math.min(0.45, 2.2 * edgeW), jt = jitter * 0.35;
        if (((eps + (0.8 + 0.85 * streak) * fl) / edgeW + jt) * whole < 0.15) continue;
        let cover;
        if (((eps + (-0.8 - 1.15 * streak) * fl) / edgeW + jt) * whole >= 1) cover = 1;
        else {
          let lumps = vnoise(hx * 3.1 + hz * 1.7 + c.seed * 7.3 + k, hy * 3.1 - hz * 2.3, SEED + 81) * 0.6
            + vnoise(hx * 6.1 - hz * 2.9, hy * 6.1 + hz * 4.3 + k * 3, SEED + 82) * 0.2;
          // a bank's edge breaks into streaks along it: noise slow along the
          // band and quick across it, fixed to the cloud
          if (streak > 0) lumps += streak * (vnoise(hx * 1.1 + c.seed * 3.1 + k, hy * 4.2 + hz * 3.4, SEED + 84) - 0.15);
          cover = ((eps + lumps * fl) / edgeW + jt) * whole;
          if (cover < 0.15) continue;
        }
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
    if (best === Infinity) return Infinity;
    // the sky behind the cloud, for its dissolving edge
    const sun = this.light.sun;
    const ang = Math.acos(Math.max(-1, Math.min(1, dx * sun[0] + dy * sun[1] + dz * sun[2])));
    m.write(ci, slot, MAT.CLOUD, bl, dy, 1 - ang / Math.PI, 0, bcover * 2 - 1, Math.min(6500, bdist));
    return bdist;
  }

  stars(v, rays, hits) {
    const P = [0, 0, 0];
    const W = v.W, R = v.R, c0 = rays.c0, c1 = rays.c1, sw = rays.sw;
    for (let si = 0; si < STARS.length; si++) {
      const st = STARS[si], x = st[0], y = st[1], z = st[2], b = st[3];
      project(v, v.ex + x * 1000, v.ey + y * 1000, v.ez + z * 1000, P);
      if (P[2] <= 0) continue;
      const cx = Math.floor((P[0] + 1) / 2 * W), cy = Math.floor((1 - P[1]) / 2 * R);
      if (cx < c0 || cx >= c1 || cy < 0 || cy >= R) continue;
      const o = (cy * sw + (cx - c0)) * HIT_STRIDE;
      if (hits[o] !== MAT.SKY) continue;
      hits[o] = MAT.STAR;
      // (the sky's closeness to the sun moves to [3], phase 2b)
      hits[o + 3] = hits[o + 5];
      hits[o + 5] = (255 * (0.25 + 0.75 * b) * smooth(0.02, 0.15, y) * this.starK + 0.5) | 0;
    }
  }

  // Stars in the water: each star's mirror image lands where a ray would look
  // down at it; it shows if that cell's mirrored ray sees open sky.
  mirroredStars(v, rays, hits) {
    const P = [0, 0, 0];
    const W = v.W, R = v.R, c0 = rays.c0, c1 = rays.c1, sw = rays.sw;
    for (let si = 0; si < STARS.length; si++) {
      const st = STARS[si], x = st[0], y = st[1], z = st[2], b = st[3];
      project(v, v.ex + x * 1000, v.ey - y * 1000, v.ez + z * 1000, P);
      if (P[2] <= 0) continue;
      const cx = Math.floor((P[0] + 1) / 2 * W), cy = Math.floor((1 - P[1]) / 2 * R);
      if (cx < c0 || cx >= c1 || cy < 0 || cy >= R) continue;
      const o = (cy * sw + (cx - c0)) * HIT_STRIDE + REC;
      if (hits[o] !== MAT.SKY) continue;
      hits[o] = MAT.STAR;
      hits[o + 3] = hits[o + 5];
      hits[o + 5] = (255 * (0.25 + 0.75 * b) * smooth(0.02, 0.15, y) * 0.8 * this.starK + 0.5) | 0;
    }
  }
}
