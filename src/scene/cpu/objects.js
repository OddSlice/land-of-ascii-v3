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
import { weatherParams } from '../../weather.js';
import { MAT } from '../../contract.js';
import { MAX_RIPPLE, RING_TILT, MAX_SWELL } from './water.js';
import { TIER } from '../../world/objects.js';
import { LOOK } from '../../look.js';
import { installTrees } from './trees.js';
import { installBuildings } from './build.js';
import { installFigures, FIG } from './figures.js';
import { installWild } from './wild.js';
import { PT, PF, P as KP, P_STRIDE, reachOf } from '../../world/kit.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const CS = new Float64Array(24);          // a box's corners in view space
const NEAR = 0.01;
const BUCKET = 64;
const TREE = 0, BUSH = 1, TORCH = 2, PRIM = 3;
const TT = LOOK.trees, TL = TT.tierLight;

// How far a conifer's tiers can reach from the trunk: the lean and the
// ragged edge at its widest.
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
    // a conifer's reach
    for (const t of trees) t.reach = treeReach(t, t.tiers, TT.jag);
    // `grow`: how many cell widths (at the object's distance) its floors can
    // add to its size; a flame's floor is two rows, about four widths
    trees.forEach((t) => list.push({ kind: TREE, o: t, x: t.x, z: t.z, R: t.reach, y0: t.base - 0.4, y1: t.top + 0.2, grow: 1, up: 0 }));
    bushes.forEach((b) => list.push({ kind: BUSH, o: b, x: b.x, z: b.z, R: b.rx, y0: b.base - 0.2, y1: b.base + b.ry * 1.6, grow: 1, up: 0 }));
    torches.forEach((T, i) => list.push({ kind: TORCH, o: T, x: T.x, z: T.z, R: 0.4, y0: T.base, y1: T.flameY + 0.5, ti: i, grow: 2.3, up: 1 }));
    // (phase 3a) the building kit's shapes, each an object of its own
    this.kit = world.kit || null;
    if (this.kit) {
      const S = this.kit.prims;
      for (let i = 0; i < this.kit.np; i++) {
        const q = i * P_STRIDE, t = S[q + KP.TYPE], pane = t === PT.PANE;
        list.push({ kind: PRIM, o: q, x: S[q + KP.CX], z: S[q + KP.CZ], R: reachOf(S, q) + 0.05, y0: S[q + KP.Y0] - 0.05, y1: S[q + KP.Y1] + 0.05,
          grow: pane ? 2.3 : (S[q + KP.FLAGS] & (PF.GROW | PF.HOLD | PF.FADE) ? 1.5 : 0), up: pane || S[q + KP.FLAGS] & (PF.HOLD | PF.FADE) ? 1 : 0 });
      }
    }
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
    // (phase 4a: room after the list for the frame's figures)
    this.cand = new Int32Array(list.length + 1024);
    this.cdist = new Float64Array(list.length + 1024);
    this.box = new Int32Array((list.length + 1024) * 4);
    this.initFigures();
    this.tiles = new Float32Array(64);
    this.bb = [0, 0, 0, 0];
    this.margin = 0;
    // (the generated world only: the lab and the stress scene keep every reflection)
    this.objCap = world.openEdge ? LOOK.water.objectsCap : Infinity;
    this.objFar = world.openEdge ? LOOK.water.objectsFar : world.viewDist;
    this.stats = { buckets: 0, candidates: 0, tested: 0, culled: 0 };
    this.only = -1; this.skip = -1;
  }

  // (phase 3a) The building kit's shapes, drawn before the march, so it
  // marches no ground behind them (their direct view; their reflections come
  // with everything else in run()).
  buildings(v, rays, m, frame, torches) {
    if (!this.kit) return;
    this.setup(v, rays, m, frame, torches);
    this.only = PRIM;
    this.pass(false);
    this.only = -1;
  }

  setup(v, rays, m, frame, torches) {
    this.v = v; this.rays = rays; this.m = m; this.t = frame.t; this.torches = torches;
    this.litG = frame.lit || null;
    // (under rain trees are mirrored only in nearer water, phase 2b)
    const wp = weatherParams(frame.weather);
    const mk = wp.rain > 0 ? 1 - (1 - LOOK.weather.rain.mirror.objects) * wp.rain : 1;
    this.objCap = this.world.openEdge ? LOOK.water.objectsCap * mk : Infinity;
    this.objFar = this.world.openEdge ? LOOK.water.objectsFar * mk : this.world.viewDist;
    this.wp = wp;
  }

  run(v, rays, m, frame, torches) {
    this.setup(v, rays, m, frame, torches);
    this.prepareFigures(v, frame);
    const wp = this.wp;
    // (the buildings' direct view was drawn before the march)
    this.skip = this.kit ? PRIM : -1;
    this.pass(false);
    this.skip = -1;
    // (phase 4b) the animals' shadows on what is now drawn
    this.animalShadows();
    // reflections, if this stripe sees water within reach of them (objects
    // are mirrored only in water nearer than LOOK.water.objectsCap): one pass
    // for each group of water levels (a lake and a far mountain tarn would
    // otherwise stretch every mirrored box between them), at most three,
    // each over only its own cells, and per column only the rows that hold them
    const sw = rays.sw, cap = this.objCap;
    if (!this.colLo || this.colLo.length < sw) { this.colLo = new Int32Array(sw * 2); this.colHi = new Int32Array(sw * 2); }
    if (!this.wl || this.wl.length < rays.cells) this.wl = new Float64Array(rays.cells * 2);
    let nw = 0;
    for (let ci = 0; ci < rays.cells; ci++) if (rays.rdepth[ci] >= 0 && rays.rdw[ci] < cap) this.wl[nw++] = (rays.rey[ci] + v.ey) / 2;
    if (nw) {
      const lv = this.wl.subarray(0, nw).sort();
      // groups: levels within 3 m of the next; then the closest neighbours
      // merged until there are at most three
      const groups = [];
      for (let a = 0; a < nw;) {
        let b = a;
        while (b + 1 < nw && lv[b + 1] - lv[b] < 3) b++;
        groups.push([lv[a], lv[b]]);
        a = b + 1;
      }
      while (groups.length > 3) {
        let k = 0;
        for (let g = 1; g + 1 < groups.length; g++) if (groups[g + 1][0] - groups[g][1] < groups[k + 1][0] - groups[k][1]) k = g;
        groups.splice(k, 2, [groups[k][0], groups[k + 1][1]]);
      }
      for (const [lo, hi] of groups) {
        // a ripple can tilt a mirrored ray by up to twice the surface's
        // slope; so can the swell, on the sea, and (phase 2b) rain's rings,
        // as far as they are let tilt it
        const sea = this.world.sea !== undefined && lo <= this.world.sea + 0.05 && hi >= this.world.sea - 0.05;
        const tilt = MAX_RIPPLE + (sea ? MAX_SWELL * wp.swell : 0) + (wp.rain > 0 ? RING_TILT : 0);
        this.margin = Math.ceil(2.2 * tilt / v.rowAngle) + 1;
        const colLo = this.colLo, colHi = this.colHi;
        colLo.fill(v.R, 0, sw); colHi.fill(-1, 0, sw);
        for (let ci = 0; ci < rays.cells; ci++) {
          if (rays.rdepth[ci] < 0 || rays.rdw[ci] >= cap) continue;
          const W = (rays.rey[ci] + v.ey) / 2;
          if (W < lo || W > hi) continue;
          const q = ci % sw, cy = (ci - q) / sw;
          if (cy < colLo[q]) colLo[q] = cy;
          if (cy > colHi[q]) colHi[q] = cy;
        }
        this.wlo = lo; this.whi = hi;
        this.pass(true);
      }
    }
    this.margin = 0;
  }

  // How far an object reaches from its axis.
  reachOf(it) { return it.R; }

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
        if (!mirror && (it.kind === this.skip || (this.only >= 0 && it.kind !== this.only))) continue;
        const dist = Math.hypot(it.x - v.ex, it.z - v.ez);
        if (dist - it.R > (mirror ? this.objFar : view)) continue;
        const gr = it.grow * v.colAngle * Math.max(dist, 0.5), RR = this.reachOf(it) + gr, gy = it.up * gr;
        const oy0 = mirror ? 2 * wlo - it.y1 - gy : it.y0 - gy, oy1 = mirror ? 2 * whi - it.y0 + gy : it.y1 + gy;
        if (!this.screenBox(it.x - RR, it.x + RR, oy0, oy1, it.z - RR, it.z + RR)) continue;
        cand[nc++] = i; cdist[i] = dist;
        const bb = this.bb;
        box[i * 4] = bb[0]; box[i * 4 + 1] = bb[1]; box[i * 4 + 2] = bb[2]; box[i * 4 + 3] = bb[3];
      }
    }
    // (phase 4a) the frame's figures, after the list
    const L = list.length, figs = this.figItems;
    for (let j = 0; j < figs.length && j < 1024; j++) {
      const it = figs[j];
      if (!mirror && this.only >= 0) break;
      const dist = it.dist;
      if (dist - it.R > (mirror ? this.objFar : view)) continue;
      const gr = it.grow * v.colAngle * Math.max(dist, 0.5), RR = it.R + gr, gy = it.up * gr;
      const oy0 = mirror ? 2 * wlo - it.y1 - gy : it.y0 - gy, oy1 = mirror ? 2 * whi - it.y0 + gy : it.y1 + gy;
      if (!this.screenBox(it.x - RR, it.x + RR, oy0, oy1, it.z - RR, it.z + RR)) continue;
      const i = L + j;
      cand[nc++] = i; cdist[i] = dist;
      const bb = this.bb;
      box[i * 4] = bb[0]; box[i * 4 + 1] = bb[1]; box[i * 4 + 2] = bb[2]; box[i * 4 + 3] = bb[3];
    }
    if (!nc) return;
    if (!mirror) st.candidates = nc;
    // front to back (ties by index, so every stripe agrees)
    const order = cand.subarray(0, nc);
    order.sort((a, b) => cdist[a] - cdist[b] || a - b);
    this.buildTiles(mirror);
    const bb = [0, 0, 0, 0];
    for (let k = 0; k < nc; k++) {
      const i = order[k], it = i < L ? list[i] : figs[i - L], dist = cdist[i];
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
    if (it.kind === FIG) return this.drawFigure(it, dist, bb, mirror);
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
    const o = it.o, tree = it.kind === TREE, prim = it.kind === PRIM;
    this.cp.tiersOf = null;
    if (prim) this.primDist = dist;
    let drew = false;
    for (let cx = bb[0]; cx <= bb[1]; cx++) {
      let lastP = -1, ya = bb[2], yb = bb[3];
      // (a shape: in a column of one plane, only the rows its footprint's
      // crossing can reach, found by the rows' slopes, which fall down the column)
      if (prim && !mirror) {
        const q = cx - c0, pa = rays.plane[ya * sw + q], pb = rays.plane[yb * sw + q];
        if (pa === pb) {
          const p = pa - jlo;
          this.primPlane(it, rays.pdx[p], rays.pdz[p], minR, rowH);
          if (this.kp.miss) continue;
          lastP = p;
          const sg = rays.sigma, sHi = this.kp.sHi, sLo = this.kp.sLo;
          let lo = ya, hi = yb;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (sg[mid * sw + q] > sHi) lo = mid + 1; else hi = mid; }
          ya = lo; lo = ya; hi = yb;
          while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (sg[mid * sw + q] < sLo) hi = mid - 1; else lo = mid; }
          yb = lo;
        }
      }
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
        // (a mirrored cell is drawn in the pass of its own water level only)
        if (mirror) { const W = (rays.rey[ci] + v.ey) / 2; if (W < this.wlo || W > this.whi || rays.rdw[ci] >= this.objCap) continue; }
        const p = rays.plane[ci] - jlo;
        const dx = rays.pdx[p], dz = rays.pdz[p];
        if (tree) {
          if (p !== lastP) { this.coniferPlane(o, dx, dz, minR, far, rowH); lastP = p; }
          // a plane that passes wide of the tree misses it in every row
          if (this.cp.miss) continue;
        } else if (prim) {
          if (p !== lastP) { this.primPlane(it, dx, dz, minR, rowH); lastP = p; }
          if (this.kp.miss || d <= this.kp.tA) continue;
        }
        let ey, s, after;
        if (mirror) {
          ey = rays.rey[ci]; s = rays.rsig[ci]; after = rays.rdw[ci];
        } else { ey = v.ey; s = rays.sigma[ci]; after = 0; }
        let ok;
        if (tree) {
          ok = this.coniferRay(o, s, ey);
        } else if (prim) ok = this.primRay(s, ey, after);
        else if (it.kind === BUSH) ok = this.bush(o, dx, dz, s, minR, far, ey);
        else ok = this.torchHit(o, dx, dz, s, minR, this.torches[it.ti].power, ey);
        if (!ok || hit.D <= after) continue;
        if (hit.D >= depth[ci]) continue;
        depth[ci] = hit.D;
        if (prim) this.primShade(ci, dx, dz, s, ey, mirror ? 1 : 0, after);
        else this.shade(ci, dx, dz, s, ey, mirror ? 1 : 0, after);
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
    const glow = m.glowAt(x, y, z, hit.nx, hit.ny, hit.nz, m.zoneOf(x, z));
    const tone = hit.mat === MAT.CONIFER ? this.foliageTone() : hit.mat === MAT.TRUNK ? hit.tone : hit.f * 2 - 1;
    m.write(ci, slot, hit.mat, lam, shadow, cloud, glow, tone, leg);
  }

}

installTrees(ObjectPass);
installBuildings(ObjectPass);
installWild(ObjectPass);
installFigures(ObjectPass);
