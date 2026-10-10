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
import { TIER } from '../../world/objects.js';
import { LOOK } from '../../look.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const P = [0, 0, 0];
const CS = new Float64Array(24);          // a box's corners in view space
const NEAR = 0.01;
const BUCKET = 64;
const TREE = 0, BUSH = 1, TORCH = 2;
const TA = LOOK.trees.A, TB = LOOK.trees.B, TF = LOOK.trees.trunkFade, TL = LOOK.trees.tierLight;

// How far a treatment's tiers can reach from the trunk: the lean, the shift
// off the axis and the ragged edge at its widest.
function treeReach(t, tiers, jag) {
  let r = t.R;
  for (let k = 0; k < tiers.length; k += TIER) {
    const ym = (tiers[k] + tiers[k + 1]) / 2 - t.base;
    const offx = t.leanX * ym + tiers[k + 4], offz = t.leanZ * ym + tiers[k + 5];
    r = Math.max(r, Math.hypot(offx, offz) + Math.max(tiers[k + 2], tiers[k + 3]) * (1 + jag / 2));
  }
  return r + 0.05;
}

export class ObjectPass {
  constructor(world, light) {
    this.world = world;
    this.light = light;
    this.hit = { D: 0, nx: 0, ny: 0, nz: 0, mat: 0, f: 0, power: 0, cover: 1, tone: 0, lamK: 1, tree: null, tier: 0, hx: 0, hz: 0 };
    // a conifer's sizes along the current vertical plane (see coniferPlane)
    const f16 = () => new Float64Array(16);
    this.cp = { miss: true, ox: 0, oz: 0, dx: 0, dz: 0, D0: 0, b2: 0, Rmax: 0, Ra: f16(), Rb: f16(), g: f16(), yb: f16(), kx: f16(), kz: f16(), kD0: f16(), kb2: f16() };
    // every object as one list, with its bounds
    const list = [];
    const { trees, bushes, torches } = world.objects;
    // a conifer's reach under either treatment (culling allows for both)
    for (const t of trees) { t.reachA = treeReach(t, t.tiers, TA.jag); t.reachB = treeReach(t, t.tiersB, TB.jag); }
    // `grow`: how many cell widths (at the object's distance) its floors can
    // add to its size; a flame's floor is two rows, about four widths
    trees.forEach((t) => list.push({ kind: TREE, o: t, x: t.x, z: t.z, R: Math.max(t.reachA, t.reachB), y0: t.base - 0.4, y1: t.top + 0.2, grow: 1, up: 0 }));
    bushes.forEach((b) => list.push({ kind: BUSH, o: b, x: b.x, z: b.z, R: b.rx, y0: b.base - 0.2, y1: b.base + b.ry * 1.6, grow: 1, up: 0 }));
    torches.forEach((T, i) => list.push({ kind: TORCH, o: T, x: T.x, z: T.z, R: 0.4, y0: T.base, y1: T.flameY + 0.5, ti: i, grow: 2.3, up: 1 }));
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
      let y0 = Infinity, y1 = -Infinity, R = 0, grow = 1, up = 0;
      for (const i of items) {
        const it = list[i];
        y0 = Math.min(y0, it.y0); y1 = Math.max(y1, it.y1); R = Math.max(R, it.R); grow = Math.max(grow, it.grow); up = Math.max(up, it.up);
      }
      const bx = b % nb, bz = Math.floor(b / nb);
      return { items: Int32Array.from(items), x0: bx * BUCKET - R - 2, x1: (bx + 1) * BUCKET + R + 2, z0: bz * BUCKET - R - 2, z1: (bz + 1) * BUCKET + R + 2, y0, y1, grow, up };
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
    this.treat = frame.look && frame.look.tree === 'B' ? 'B' : 'A';
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

  // How far an object reaches from its axis (a conifer, under the treatment in use).
  reachOf(it) { return it.kind === TREE ? (this.treat === 'B' ? it.o.reachB : it.o.reachA) : it.R; }

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
      // grow the bucket by the widest floor any object in it can get (and
      // up and down too, for a flame)
      const g = bk.grow * v.colAngle * Math.max(bd + half, 0.5), gy = bk.up * g;
      const y0 = mirror ? 2 * wlo - bk.y1 - gy : bk.y0 - gy, y1 = mirror ? 2 * whi - bk.y0 + gy : bk.y1 + gy;
      if (!this.screenBox(bk.x0 - g, bk.x1 + g, y0, y1, bk.z0 - g, bk.z1 + g)) continue;
      if (!mirror) st.buckets++;
      for (let k = 0; k < bk.items.length; k++) {
        const i = bk.items[k], it = list[i];
        const dist = Math.hypot(it.x - v.ex, it.z - v.ez);
        if (dist - it.R > view) continue;
        const gr = it.grow * v.colAngle * Math.max(dist, 0.5), RR = this.reachOf(it) + gr, gy = it.up * gr;
        const oy0 = mirror ? 2 * wlo - it.y1 - gy : it.y0 - gy, oy1 = mirror ? 2 * whi - it.y0 + gy : it.y1 + gy;
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
      const RR = this.reachOf(it) + it.grow * v.colAngle * Math.max(dist, 0.5);
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
    const rowH = Math.max(dist, 1) * v.rowAngle;
    const tierRows = (it.kind === TREE ? it.o.tierH : 2.3) / rowH;
    const far = smooth(5, 2.2, tierRows);
    // nothing of the object is nearer than this (horizontally)
    const near = dist - (this.reachOf(it) + it.grow * minR);
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
        const p = rays.plane[ci] - jlo;
        const dx = rays.pdx[p], dz = rays.pdz[p];
        if (tree) {
          if (p !== lastP) { this.coniferPlane(o, dx, dz, minR, far, rowH); lastP = p; }
          // a plane that passes wide of the tree misses it in every row
          if (this.cp.miss) continue;
        }
        let ey, s, after;
        if (mirror) {
          ey = rays.rey[ci]; s = rays.rsig[ci]; after = rays.rdw[ci];
        } else { ey = v.ey; s = rays.sigma[ci]; after = 0; }
        let ok;
        if (tree) {
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
      m.write(ci, slot, MAT.FLAME, hit.power * 0.8, 0, 0, 1, hit.cover * 2 - 1, leg);
      return;
    }
    const L = light.L;
    let lam = hit.nx * L[0] + hit.ny * L[1] + hit.nz * L[2];
    // needles and leaves scatter light a little round the side
    lam = hit.mat === MAT.CONIFER || hit.mat === MAT.BUSH ? Math.max(0, (lam + 0.3) / 1.3) : Math.max(0, lam);
    if (hit.mat === MAT.CONIFER) lam *= (TL[0] + (TL[1] - TL[0]) * hit.f) * hit.lamK;
    else if (hit.mat === MAT.TRUNK) lam *= hit.lamK;
    const shadow = light.shadowAt(x + hit.nx * 0.7, y + 0.15, z + hit.nz * 0.7);
    const cloud = light.cloudAt(x, z);
    const glow = m.glowAt(x, y, z, hit.nx, hit.ny, hit.nz);
    const tone = hit.mat === MAT.CONIFER ? this.foliageTone() : hit.mat === MAT.TRUNK ? hit.tone : hit.f * 2 - 1;
    m.write(ci, slot, hit.mat, lam, shadow, cloud, glow, tone, leg);
  }

  // Foliage tone: the tree's own and the height in its tier; B adds clumps
  // (by tier and sector round it), which melt away with the ragged edge.
  foliageTone() {
    const { hit, cp } = this, t = hit.tree;
    let tone = 0.3 * t.tone + 0.55 * (hit.f * 2 - 1);
    if (cp.B) {
      // smoothly joined between sectors, so a clump has no hard edge
      const as = (Math.atan2(hit.hz, hit.hx) / (Math.PI * 2) + 0.5) * TB.sectors, s0 = Math.floor(as), sf = as - s0;
      const clump = (hash2(hit.tier * 31 + s0, t.seed, 13) * (1 - sf) + hash2(hit.tier * 31 + s0 + 1, t.seed, 13) * sf) * 2 - 1;
      tone = 0.25 * t.tone + 0.45 * (hit.f * 2 - 1) + TB.clump * clump * cp.jagK;
    }
    return tone < -1 ? -1 : tone > 1 ? 1 : tone;
  }

  // A conifer: a bare trunk under a stack of overlapping cone tiers, each
  // wide at its foot and narrow at its top (a sawtooth outline), with a
  // ragged edge that turns with the angle round the trunk. Treatment B also
  // shifts tiers off the axis, cuts some short and notches some.
  //
  // Distance: no part may get thinner than about two cells, except a tip,
  // which tapers to one cell, so a far treeline keeps a jagged top of single
  // tips; under about two rows a tier melts into a smooth cone, and B's
  // gaps, notches and shifts close up before they get under two cells.
  //
  // Everything that depends only on the vertical plane of the ray (how near
  // it passes each tier, the ragged radii) is worked out once per plane;
  // coniferRay then intersects one ray of that plane.
  coniferPlane(t, dx, dz, minR, far, rowH) {
    const { v, cp } = this;
    const B = this.treat === 'B', P = B ? TB : TA;
    const tiers = B ? t.tiersB : t.tiers, T = tiers.length / TIER;
    const ox = v.ex - t.x, oz = v.ez - t.z;
    const D0 = -(ox * dx + oz * dz);
    const b2 = ox * ox + oz * oz - D0 * D0;
    const Rmax = (B ? t.reachB : t.reachA) + minR;
    cp.ox = ox; cp.oz = oz; cp.dx = dx; cp.dz = dz; cp.D0 = D0; cp.b2 = b2; cp.Rmax = Rmax; cp.minR = minR;
    cp.tiers = tiers; cp.T = T; cp.far = far; cp.B = B;
    cp.miss = b2 > Rmax * Rmax || D0 + Rmax < 0;
    if (cp.miss) return;
    // the ragged edge fades once a sector round the trunk is under ~3 cells across
    const jagK = smooth(1.5, 3.5, (Math.PI * 2 * (t.R - 0.4) / P.sectors) / Math.max(minR, 1e-6));
    cp.jagK = jagK;
    // where each tier's axis is: the lean, and B's shift (which closes up with distance)
    const shiftK = 1 - 0.7 * far;
    for (let k = 0; k < T; k++) {
      const q = k * TIER, ym = (tiers[q] + tiers[q + 1]) / 2 - t.base;
      const kx = ox - (t.leanX * ym + tiers[q + 4] * shiftK), kz = oz - (t.leanZ * ym + tiers[q + 5] * shiftK);
      const kD0 = -(kx * dx + kz * dz);
      cp.kx[k] = kx; cp.kz[k] = kz; cp.kD0[k] = kD0; cp.kb2[k] = kx * kx + kz * kz - kD0 * kD0;
    }
    // far off the edge is smooth, the same from every side: radii once per tree
    if (jagK === 0 && cp.tiersOf === t) return;
    cp.tiersOf = jagK === 0 ? t : null;
    // the ragged edge: sectors round the trunk, smoothly joined
    const S = P.sectors;
    let a0 = 0, af = 0, ang = 0;
    if (jagK !== 0) {
      const ax = ox + dx * D0, az = oz + dz * D0;
      ang = (Math.atan2(az, ax) / (Math.PI * 2) + 0.5) * S;
      a0 = Math.floor(ang); af = ang - a0;
    }
    // a notch closes up once it is under about two cells across
    const notchK = B ? smooth(2, 4, 2.2 * Math.PI * 2 * t.R / S / Math.max(minR, 1e-6)) : 0;
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
        if (notchK > 0 && tiers[q + 6] >= 0) {
          let da = Math.abs(ang - tiers[q + 6]);
          if (da > S / 2) da = S - da;
          jag *= 1 - tiers[q + 7] * notchK * (1 - smooth(0.6, 1.6, da));
        }
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
  }

  coniferRay(t, s, ey) {
    const { hit, cp } = this;
    if (cp.miss) return false;
    const { dx, dz, D0, b2, Rmax, tiers, T } = cp;
    let best = Infinity, bnx = 0, bny = 0, bnz = 0, bf = 0, bmat = 0, bk = -1, bhx = 0, bhz = 0;
    // quick height test: the ray's height near the trunk
    const yNear = ey + s * (D0 - Rmax), yFar = ey + s * (D0 + Rmax);
    const yMax = Math.max(yNear, yFar), yMin = Math.min(yNear, yFar);
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
          // darker toward the trunk, so crowns seen from below have depth
          const h2 = hx * hx + hz * hz;
          if (h2 <= Ra * Ra) { best = D; bnx = 0; bny = -1; bnz = 0; bf = 0.3 * Math.sqrt(h2) / Ra; bmat = MAT.CONIFER; bk = k; bhx = hx; bhz = hz; }
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
      hit.lamK = cp.B ? TB.darken : TA.darken;
    }
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
  }
}
