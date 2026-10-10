// Trees, bushes and torches, in their own depth-tested pass after the march,
// once for the direct view and once for their reflections in the water.
//
// Culling, after the target game's developer:
// - objects sit in 64 m buckets; a bucket out of the view distance, behind
//   the eye or off this stripe is skipped whole;
// - each remaining object is culled by distance, behind the eye and by its
//   projected screen box, then the survivors are sorted front to back;
// - a coarse depth buffer of 4 x 4-cell tiles holds the farthest thing drawn
//   in each tile; an object whose nearest point is beyond every tile its box
//   covers cannot show anywhere, so it is dropped before any ray is cast. As
//   objects are drawn, the tiles they cover are brought up to date.
// The test is exact (it only drops objects that could not change a cell), so
// the picture is the same with or without it, in any stripe.
//
// No part may get thinner than about two cells on screen (it would blink as
// it falls between rays), so radii have a floor that grows with distance, and
// the conifers' tiered outline melts into a smooth cone once a tier is only a
// couple of rows tall. Reflections use the same floors.
import { MAT } from '../../contract.js';
import { hash2 } from '../../world/noise.js';
import { MAX_RIPPLE } from './water.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const P = [0, 0, 0];
const CS = new Float64Array(24);          // a box's corners in view space
const NEAR = 0.01;
const BUCKET = 64;
const TREE = 0, BUSH = 1, TORCH = 2;

export class ObjectPass {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.hit = { D: 0, nx: 0, ny: 0, nz: 0, mat: 0, f: 0, power: 0 };
    // a conifer's sizes along the current vertical plane (see coniferPlane)
    this.cp = { miss: true, ox: 0, oz: 0, dx: 0, dz: 0, D0: 0, b2: 0, Rmax: 0, Ra: new Float64Array(16), Rb: new Float64Array(16), g: new Float64Array(16) };
    // every object as one list, with its bounds
    const list = [];
    const { trees, bushes, torches } = world.objects;
    // a conifer's ragged tiers can reach past its radius (by up to 18%)
    const reach = (t) => { let r = t.R; for (let k = 2; k < t.tiers.length; k += 4) r = Math.max(r, t.tiers[k] * 1.18); return r; };
    trees.forEach((t) => list.push({ kind: TREE, o: t, x: t.x, z: t.z, R: reach(t), y0: t.base - 0.4, y1: t.top + 0.2 }));
    bushes.forEach((b) => list.push({ kind: BUSH, o: b, x: b.x, z: b.z, R: b.rx, y0: b.base - 0.2, y1: b.base + b.ry * 1.6 }));
    torches.forEach((T, i) => list.push({ kind: TORCH, o: T, x: T.x, z: T.z, R: 0.4, y0: T.base, y1: T.flameY + 0.5, ti: i }));
    this.list = list;
    // buckets
    const nb = Math.ceil(world.N / BUCKET);
    const lists = Array.from({ length: nb * nb }, () => []);
    list.forEach((it, i) => {
      const bx = Math.min(nb - 1, Math.max(0, Math.floor(it.x / BUCKET)));
      const bz = Math.min(nb - 1, Math.max(0, Math.floor(it.z / BUCKET)));
      lists[bz * nb + bx].push(i);
    });
    this.buckets = lists.map((items, b) => {
      let y0 = Infinity, y1 = -Infinity, R = 0;
      for (const i of items) { y0 = Math.min(y0, list[i].y0); y1 = Math.max(y1, list[i].y1); R = Math.max(R, list[i].R); }
      const bx = b % nb, bz = Math.floor(b / nb);
      return { items: Int32Array.from(items), x0: bx * BUCKET - R - 2, x1: (bx + 1) * BUCKET + R + 2, z0: bz * BUCKET - R - 2, z1: (bz + 1) * BUCKET + R + 2, y0, y1 };
    }).filter((bk) => bk.items.length);
    // per-frame scratch
    this.cand = new Int32Array(list.length);
    this.cdist = new Float64Array(list.length);
    this.box = new Int32Array(list.length * 4);
    this.tiles = new Float32Array(64);
    this.bb = [0, 0, 0, 0];
    this.margin = 0;
    this.stats = { buckets: 0, candidates: 0, tested: 0, culled: 0 };
  }

  run(v, rays, m, frame, torches) {
    this.v = v; this.rays = rays; this.m = m; this.t = frame.t; this.torches = torches;
    this.pass(false);
    // reflections, if this stripe sees any water
    // and, per column, the first and last row with water
    let wlo = Infinity, whi = -Infinity;
    const sw = rays.sw;
    if (!this.colLo || this.colLo.length < sw) { this.colLo = new Int32Array(sw * 2); this.colHi = new Int32Array(sw * 2); }
    const colLo = this.colLo, colHi = this.colHi;
    colLo.fill(v.R, 0, sw); colHi.fill(-1, 0, sw);
    for (let ci = 0; ci < rays.cells; ci++) {
      if (rays.rdepth[ci] < 0) continue;
      const W = (rays.rey[ci] + v.ey) / 2;
      if (W < wlo) wlo = W; if (W > whi) whi = W;
      const q = ci % sw, cy = (ci - q) / sw;
      if (cy < colLo[q]) colLo[q] = cy;
      if (cy > colHi[q]) colHi[q] = cy;
    }
    if (wlo <= whi) {
      this.wlo = wlo; this.whi = whi;
      // a ripple can tilt a mirrored ray by up to twice the surface's slope
      this.margin = Math.ceil(2.2 * MAX_RIPPLE / v.rowAngle) + 1;
      this.pass(true);
    }
    this.margin = 0;
  }

  // Screen box of a box of world space, clipped to this stripe; false if
  // none of it shows. Fills this.bb = [cxa, cxb, cya, cyb]. A box reaching
  // behind the eye is cut at a plane just in front of it: the corners in
  // front, and where the edges cross that plane, bound what can show.
  screenBox(x0, x1, y0, y1, z0, z1) {
    const { v, rays } = this;
    let xlo = 1e9, xhi = -1e9, ylo = 1e9, yhi = -1e9, behind = 0;
    for (let c = 0; c < 8; c++) {
      const rx = (c & 1 ? x1 : x0) - v.ex, ry = (c & 2 ? y1 : y0) - v.ey, rz = (c & 4 ? z1 : z0) - v.ez;
      const b = rx * v.syaw + rz * v.cyaw;
      const a = rx * v.cyaw - rz * v.syaw, cz = b * v.cp + ry * v.sp, cy = ry * v.cp - b * v.sp;
      CS[c * 3] = a; CS[c * 3 + 1] = cy; CS[c * 3 + 2] = cz;
      if (cz < NEAR) { behind++; continue; }
      const px = a / cz / v.tx, py = cy / cz / v.ty;
      if (px < xlo) xlo = px; if (px > xhi) xhi = px;
      if (py < ylo) ylo = py; if (py > yhi) yhi = py;
    }
    if (behind === 8) return false;
    if (behind) {
      for (let c = 0; c < 8; c++) {
        for (let bit = 1; bit < 8; bit <<= 1) {
          if (c & bit) continue;
          const d = c | bit, za = CS[c * 3 + 2], zb = CS[d * 3 + 2];
          if ((za < NEAR) === (zb < NEAR)) continue;
          const f = (NEAR - za) / (zb - za);
          const a = CS[c * 3] + (CS[d * 3] - CS[c * 3]) * f, cy = CS[c * 3 + 1] + (CS[d * 3 + 1] - CS[c * 3 + 1]) * f;
          const px = a / NEAR / v.tx, py = cy / NEAR / v.ty;
          if (px < xlo) xlo = px; if (px > xhi) xhi = px;
          if (py < ylo) ylo = py; if (py > yhi) yhi = py;
        }
      }
    }
    const W = v.W, Rr = v.R, c0 = rays.c0, c1 = rays.c1;
    const bb = this.bb;
    bb[0] = Math.max(c0, Math.floor((xlo + 1) / 2 * W - 1.5));
    bb[1] = Math.min(c1 - 1, Math.ceil((xhi + 1) / 2 * W + 0.5));
    const mg = this.margin;
    bb[2] = Math.max(0, Math.floor((1 - yhi) / 2 * Rr - 1.5) - mg);
    bb[3] = Math.min(Rr - 1, Math.ceil((1 - ylo) / 2 * Rr + 0.5) + mg);
    return bb[0] <= bb[1] && bb[2] <= bb[3];
  }

  // The tiles' farthest depth, from the march (direct) or the mirrored rays
  // (a cell with no water counts as covered).
  buildTiles(mirror) {
    const { rays, v } = this;
    const c0 = rays.c0, sw = rays.sw;
    this.tx0 = c0 >> 2;
    this.tw = ((rays.c1 - 1) >> 2) - this.tx0 + 1;
    this.th = (v.R + 3) >> 2;
    const n = this.tw * this.th;
    if (this.tiles.length < n) this.tiles = new Float32Array(n * 2);
    const tiles = this.tiles;
    tiles.fill(0, 0, n);
    const depth = mirror ? rays.rdepth : rays.depth;
    for (let cy = 0; cy < v.R; cy++) {
      const row = (cy >> 2) * this.tw - this.tx0;
      for (let q = 0; q < sw; q++) {
        const d = depth[cy * sw + q];
        const t = row + ((c0 + q) >> 2);
        if (d > tiles[t]) tiles[t] = d;
      }
    }
  }

  // Is every tile under this box no farther than `near`?
  covered(bb, near) {
    const tw = this.tw, tiles = this.tiles;
    for (let ty = bb[2] >> 2; ty <= bb[3] >> 2; ty++) {
      for (let tx = (bb[0] >> 2) - this.tx0; tx <= (bb[1] >> 2) - this.tx0; tx++) {
        if (tiles[ty * tw + tx] > near) return false;
      }
    }
    return true;
  }

  refreshTiles(bb, mirror) {
    const { rays } = this;
    const c0 = rays.c0, c1 = rays.c1, sw = rays.sw, R = this.v.R, tw = this.tw, tiles = this.tiles;
    const depth = mirror ? rays.rdepth : rays.depth;
    for (let ty = bb[2] >> 2; ty <= bb[3] >> 2; ty++) {
      for (let tx = bb[0] >> 2; tx <= bb[1] >> 2; tx++) {
        let m = 0;
        for (let cy = ty * 4; cy < ty * 4 + 4 && cy < R; cy++) {
          for (let cx = Math.max(c0, tx * 4); cx < tx * 4 + 4 && cx < c1; cx++) {
            const d = depth[cy * sw + cx - c0];
            if (d > m) m = d;
          }
        }
        tiles[ty * tw + tx - this.tx0] = m;
      }
    }
  }

  // One pass: gather, cull, sort, then draw front to back.
  pass(mirror) {
    const { v, list, cand, cdist, box } = this;
    const view = this.world.viewDist;
    const st = this.stats;
    if (!mirror) { st.buckets = 0; st.candidates = 0; st.tested = 0; st.culled = 0; }
    // mirrored boxes: heights reflected in the water levels this stripe sees
    const wlo = this.wlo, whi = this.whi;
    let nc = 0;
    for (const bk of this.buckets) {
      const cx = (bk.x0 + bk.x1) / 2, cz = (bk.z0 + bk.z1) / 2, half = (bk.x1 - bk.x0) * 0.7072;
      const bd = Math.hypot(cx - v.ex, cz - v.ez);
      if (bd - half > view) continue;
      // grow the bucket by the widest floor any object in it can get
      const g = v.colAngle * Math.max(bd + half, 0.5);
      const y0 = mirror ? 2 * wlo - bk.y1 : bk.y0, y1 = mirror ? 2 * whi - bk.y0 : bk.y1;
      if (!this.screenBox(bk.x0 - g, bk.x1 + g, y0, y1, bk.z0 - g, bk.z1 + g)) continue;
      if (!mirror) st.buckets++;
      for (let k = 0; k < bk.items.length; k++) {
        const i = bk.items[k], it = list[i];
        const dist = Math.hypot(it.x - v.ex, it.z - v.ez);
        if (dist - it.R > view) continue;
        const RR = it.R + v.colAngle * Math.max(dist, 0.5);
        const oy0 = mirror ? 2 * wlo - it.y1 : it.y0, oy1 = mirror ? 2 * whi - it.y0 : it.y1;
        if (!this.screenBox(it.x - RR, it.x + RR, oy0, oy1, it.z - RR, it.z + RR)) continue;
        cand[nc++] = i; cdist[i] = dist;
        const bb = this.bb;
        box[i * 4] = bb[0]; box[i * 4 + 1] = bb[1]; box[i * 4 + 2] = bb[2]; box[i * 4 + 3] = bb[3];
      }
    }
    if (!nc) return;
    if (!mirror) st.candidates = nc;
    // front to back (ties by index, so every stripe agrees)
    const order = cand.subarray(0, nc);
    order.sort((a, b) => cdist[a] - cdist[b] || a - b);
    this.buildTiles(mirror);
    const bb = [0, 0, 0, 0];
    for (let k = 0; k < nc; k++) {
      const i = order[k], it = list[i], dist = cdist[i];
      const RR = it.R + v.colAngle * Math.max(dist, 0.5);
      bb[0] = box[i * 4]; bb[1] = box[i * 4 + 1]; bb[2] = box[i * 4 + 2]; bb[3] = box[i * 4 + 3];
      if (this.covered(bb, dist - RR)) { if (!mirror) st.culled++; continue; }
      if (!mirror) st.tested++;
      if (this.draw(it, dist, bb, mirror)) this.refreshTiles(bb, mirror);
    }
  }

  // Test every cell of the box against the object; true if any was drawn.
  // Column by column, so a conifer's sizes along a plane are worked out once
  // for all the rows that share it.
  draw(it, dist, bb, mirror) {
    const { v, rays, hit } = this;
    const minR = v.colAngle * Math.max(dist, 0.5);
    // how many rows a conifer tier covers; under ~3 the tiers melt into a cone
    const tierRows = 2.3 / (Math.max(dist, 1) * v.rowAngle);
    const far = smooth(5, 2.2, tierRows);
    // nothing of the object is nearer than this (horizontally)
    const near = dist - (it.R + minR);
    const sw = rays.sw, jlo = rays.jlo, c0 = rays.c0;
    const depth = mirror ? rays.rdepth : rays.depth;
    const o = it.o, tree = it.kind === TREE;
    this.cp.tiersOf = null;
    let drew = false;
    for (let cx = bb[0]; cx <= bb[1]; cx++) {
      let lastP = -1, ya = bb[2], yb = bb[3];
      if (mirror) {
        // only the rows of this column that hold water
        const q = cx - c0;
        if (this.colLo[q] > ya) ya = this.colLo[q];
        if (this.colHi[q] < yb) yb = this.colHi[q];
      }
      for (let cy = ya; cy <= yb; cy++) {
        const ci = cy * sw + (cx - c0);
        const d = depth[ci];
        if (d <= near || (mirror && d < 0)) continue;
        let ey, s, after;
        if (mirror) {
          ey = rays.rey[ci]; s = rays.rsig[ci]; after = rays.rdw[ci];
        } else { ey = v.ey; s = rays.sigma[ci]; after = 0; }
        const p = rays.plane[ci] - jlo;
        const dx = rays.pdx[p], dz = rays.pdz[p];
        let ok;
        if (tree) {
          if (p !== lastP) { this.coniferPlane(o, dx, dz, minR, far); lastP = p; }
          ok = this.coniferRay(o, s, ey);
        } else if (it.kind === BUSH) ok = this.bush(o, dx, dz, s, minR, far, ey);
        else ok = this.torchHit(o, dx, dz, s, minR, this.torches[it.ti].power, ey);
        if (!ok || hit.D <= after) continue;
        if (hit.D >= depth[ci]) continue;
        depth[ci] = hit.D;
        this.shade(ci, dx, dz, s, ey, mirror ? 1 : 0, after);
        drew = true;
      }
    }
    return drew;
  }

  shade(ci, dx, dz, s, ey, slot, after) {
    const { v, m, light, hit } = this;
    const D = hit.D, x = v.ex + dx * D, y = ey + s * D, z = v.ez + dz * D;
    const len = Math.sqrt(1 + s * s);
    const leg = (D - after) * len;
    if (hit.mat === MAT.FLAME) {
      m.write(ci, slot, MAT.FLAME, hit.power * 0.8, 0, 0, 1, 0, leg);
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
    m.write(ci, slot, hit.mat, lam, shadow, cloud, glow, hit.f * 2 - 1, leg);
  }

  // A conifer: a bare trunk under a stack of overlapping cone tiers, each
  // wide at its foot and narrow at its top (a sawtooth outline), with a
  // ragged edge that turns with the angle round the trunk.
  //
  // Everything that depends only on the vertical plane of the ray (how near
  // it passes the trunk, the ragged radii) is worked out once per plane;
  // coniferRay then intersects one ray of that plane.
  coniferPlane(t, dx, dz, minR, far) {
    const { v, cp } = this;
    const ox = v.ex - t.x, oz = v.ez - t.z;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    const Rmax = t.R + minR;
    cp.ox = ox; cp.oz = oz; cp.dx = dx; cp.dz = dz; cp.D0 = D0; cp.b2 = b2; cp.Rmax = Rmax; cp.minR = minR;
    cp.miss = b2 > Rmax * Rmax || D0 + Rmax < 0;
    if (cp.miss) return;
    const jagK = 1 - far;
    // far off the edge is smooth, the same from every side: once per tree
    if (jagK === 0 && cp.tiersOf === t) return;
    cp.tiersOf = jagK === 0 ? t : null;
    // ragged edge: 9 sectors round the trunk, smoothly joined
    let a0 = 0, af = 0;
    if (jagK !== 0) {
      const ax = ox + dx * D0, az = oz + dz * D0;
      const ang = (Math.atan2(az, ax) / (Math.PI * 2) + 0.5) * 9;
      a0 = Math.floor(ang); af = ang - a0;
    }
    const tiers = t.tiers, T = tiers.length / 4;
    for (let k = 0; k < T; k++) {
      const ya = tiers[k * 4], yb = tiers[k * 4 + 1];
      const jag = jagK === 0 ? 1
        : 1 + ((hash2(a0 + k * 13, t.seed, 7) * (1 - af) + hash2(a0 + 1 + k * 13, t.seed, 7) * af) - 0.5) * 0.36 * jagK;
      let Ra = tiers[k * 4 + 2] * jag, Rb = tiers[k * 4 + 3];
      if (k + 1 < T) Rb += (tiers[k * 4 + 6] * 0.92 - Rb) * far;
      Rb *= jag;
      if (Ra < minR) Ra = minR;
      if (Rb < minR * 0.6) Rb = minR * 0.6;
      cp.Ra[k] = Ra; cp.Rb[k] = Rb; cp.g[k] = (Rb - Ra) / (yb - ya);
    }
  }

  coniferRay(t, s, ey) {
    const { hit, cp } = this;
    if (cp.miss) return false;
    const { ox, oz, dx, dz, D0, b2, Rmax } = cp;
    let best = Infinity, bnx = 0, bny = 0, bnz = 0, bf = 0, bmat = 0;
    const tiers = t.tiers, T = tiers.length / 4;
    // quick height test: the ray's height near the trunk
    const yNear = ey + s * (D0 - Rmax), yFar = ey + s * (D0 + Rmax);
    const yMax = Math.max(yNear, yFar), yMin = Math.min(yNear, yFar);
    for (let k = 0; k < T; k++) {
      const ya = tiers[k * 4], yb = tiers[k * 4 + 1];
      // tiers go up the tree: once the ray is under one it is under the rest
      if (yMax < ya) break;
      if (yMin > yb) continue;
      const Ra = cp.Ra[k], g = cp.g[k];
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
    const rt = Math.max(0.24, cp.minR);
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
  }

  // A torch: a wooden post and a flame on top.
  torchHit(T, dx, dz, s, minR, power, ey) {
    const { v, hit } = this;
    hit.power = power;
    const ox = v.ex - T.x, oz = v.ez - T.z;
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
