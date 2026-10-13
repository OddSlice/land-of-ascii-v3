// People (phase 4a), drawn in the object pass with the trees, depth tested
// and mirrored in the water like them. Each frame the frame's people (their
// states, worked out once on the main thread, see src/app/people.js) become
// a few exact shapes each (src/world/people/figure.js), drawn by the
// building kit's own code: one object per figure, every part tested in each
// cell its box covers, the nearest kept.
//
// - A far figure held at its least drawn size covers only part of a cell:
//   its cells carry MAT_FAINT in R2 with that share, and resolve blends them
//   with what is behind, as a faint flame's.
// - A flame (a lantern's, a torch's) is held at two rows and a column and
//   faded by its true share of that, as the fixed torches are.
// - The lights people carry are moving point lights (Marcher.setMovers):
//   they light only surfaces near them, never start the shadow sweep, and
//   leave the fixed lights as they were.
import { figureParts, lightOf, FS, S, PART, POSE, NEAR_D } from '../../world/people/figure.js';
import { P as KP, P_STRIDE, PT, PF, ZONE_OUT, ZONE_YARD, roomBit } from '../../world/kit.js';
import { MAT, MAT_FAINT, HIT_STRIDE, REC } from '../../contract.js';
import { torchPower } from './light.js';
import { Plane } from './build.js';

export const FIG = 4;
const MAXP = 24;                 // parts a figure can have
const FAR = 420;                 // beyond this a figure is not drawn (it has faded)

const methods = {
  initFigures() {
    this.figKit = null;
    this.figItems = [];
    this.figParts = new Float64Array(MAXP * PART);
    this.figPlanes = Array.from({ length: MAXP }, () => new Plane());
    this.figBest = { D: 0, nx: 0, ny: 0, nz: 0, kind: 0, room: -1, mat: 0, cover: 1, prim: 0, rev: 0, revO: 0, k: 0 };
    this.figIt = { o: 0 };
  },

  // The frame's figures as shapes: the same in every worker.
  prepareFigures(v, frame) {
    const st = frame.people, items = this.figItems;
    items.length = 0;
    if (!st || !st.length) return;
    const n = st.length / FS, wk = this.world.kit;
    if (!this.figKit || this.figKit.cap < n * MAXP) {
      const cap = Math.max(256, n * MAXP);
      this.figKit = { cap, prims: new Float64Array(cap * P_STRIDE), holes: new Float64Array(0), cover: new Float32Array(cap), flame: new Uint8Array(cap),
        rooms: wk ? wk.rooms : [], roomBits: wk ? wk.roomBits : [], yards: wk ? wk.yards : [], np: 0 };
    }
    const K = this.figKit, P = K.prims, buf = this.figParts;
    let np = 0;
    for (let i = 0; i < n; i++) {
      const o = i * FS;
      if (st[o + S.POSE] === POSE.HIDDEN) continue;
      const x = st[o + S.X], z = st[o + S.Z], dist = Math.hypot(x - v.ex, z - v.ez);
      if (dist > FAR) continue;
      const k = figureParts(st, o, dist, v.colAngle, v.rowAngle, frame.t, buf, 0);
      if (!k) continue;
      const minC = v.colAngle * Math.max(dist, 0.5), minR = v.rowAngle * Math.max(dist, 0.5);
      let reach = 0, y0 = Infinity, y1 = -Infinity, flames = 0;
      let kk = 0;
      for (let j = 0; j < k; j++) {
        const b = j * PART, q = (np + kk) * P_STRIDE;
        let hx = buf[b + 3], hz = buf[b + 4], ya = buf[b + 5], yb = buf[b + 6], cover = buf[b + 9];
        const flame = buf[b + 8] === 2;
        if (flame) {
          // held at a column wide and two rows tall, faded by its true share
          const w = hx, h = (yb - ya) / 2, wm = Math.max(w, minC / 2), hm = Math.max(h, minR);
          cover = Math.min(cover, (w * h) / (wm * hm));
          hx = hz = wm; const yc = (ya + yb) / 2; ya = yc - hm; yb = yc + hm;
          flames++;
        } else if (buf[b + 8] === 1) {
          // a small part (a brim, a tool's shaft, a torch's stick): held at
          // two rows tall and two columns across (its width across the view),
          // and further off faded by how much of that it really is, so it
          // cannot fall between rows or columns and blink
          const h = (yb - ya) / 2, hm = Math.max(h, minR);
          const vx = buf[b] - v.ex, vz = buf[b + 1] - v.ez, vl = Math.hypot(vx, vz) || 1, px = -vz / vl, pz = vx / vl;
          const ca = Math.cos(buf[b + 2]), sa = Math.sin(buf[b + 2]);
          const across = hx * Math.abs(ca * px + sa * pz) + hz * Math.abs(-sa * px + ca * pz);
          if (hm > h) { const yc = (ya + yb) / 2; ya = yc - hm; yb = yc + hm; }
          // (faded only past the near detail: close by, the parts are whole
          // and a faded one's blend with what lies behind would jump)
          if (dist >= NEAR_D) cover = Math.min(cover, (h / hm) * Math.min(1, across / minC));
          if (cover < 0.06) continue;
        }
        const ang = buf[b + 2];
        P[q + KP.TYPE] = PT.BOX; P[q + KP.CX] = buf[b]; P[q + KP.CZ] = buf[b + 1];
        P[q + KP.CA] = Math.cos(ang); P[q + KP.SA] = Math.sin(ang);
        P[q + KP.HX] = hx; P[q + KP.HZ] = hz; P[q + KP.Y0] = ya; P[q + KP.Y1] = yb;
        P[q + KP.MAT] = buf[b + 7]; P[q + KP.MAT2] = buf[b + 7];
        P[q + KP.FLAGS] = buf[b + 8] === 1 ? PF.GROW : 0;
        P[q + KP.H0] = 0; P[q + KP.HN] = 0; P[q + KP.ROOM] = st[o + S.ROOM];
        P[q + KP.SEED] = st[o + S.ID] * 37 + j; P[q + KP.TEX] = 0; P[q + KP.TEX2] = 0; P[q + KP.BASE] = ya;
        K.cover[np + kk] = cover; K.flame[np + kk] = flame ? 1 : 0; kk++;
        const dx = buf[b] - x, dz = buf[b + 1] - z, r = Math.sqrt(dx * dx + dz * dz) + Math.max(hx, hz) * 1.42;
        if (r > reach) reach = r;
        if (ya < y0) y0 = ya; if (yb > y1) y1 = yb;
      }
      if (!kk) continue;
      items.push({ kind: FIG, pi: i, p0: np, np: kk, x, z, R: reach + 0.05, y0: y0 - 0.05, y1: y1 + 0.05, grow: 1.5, up: flames ? 1 : 0, id: st[o + S.ID], dist });
      np += kk;
    }
    K.np = np;
  },

  // Test every cell of a figure's box against its parts; true if any was drawn.
  drawFigure(it, dist, bb, mirror) {
    const { v, rays, hit, m } = this;
    const sw = rays.sw, jlo = rays.jlo, c0 = rays.c0;
    const depth = mirror ? rays.rdepth : rays.depth;
    const minR = v.colAngle * Math.max(dist, 0.5), rowH = Math.max(dist, 1) * v.rowAngle;
    const near = dist - (it.R + it.grow * minR);
    const K0 = this.kit, kp0 = this.kp, K = this.figKit, planes = this.figPlanes, best = this.figBest, fit = this.figIt;
    this.kit = K; this.primDist = dist;
    let drew = false, lastP = -1, any = false;
    for (let cx = bb[0]; cx <= bb[1]; cx++) {
      let ya = bb[2], yb = bb[3];
      if (mirror) {
        const q = cx - c0;
        if (this.colLo[q] > ya) ya = this.colLo[q];
        if (this.colHi[q] < yb) yb = this.colHi[q];
      }
      for (let cy = ya; cy <= yb; cy++) {
        const ci = cy * sw + (cx - c0);
        const d = depth[ci];
        if (d <= near || (mirror && d < 0)) continue;
        if (mirror) { const W = (rays.rey[ci] + v.ey) / 2; if (W < this.wlo || W > this.whi || rays.rdw[ci] >= this.objCap) continue; }
        const p = rays.plane[ci] - jlo, dx = rays.pdx[p], dz = rays.pdz[p];
        if (p !== lastP) {
          any = false;
          for (let k = 0; k < it.np; k++) {
            fit.o = (it.p0 + k) * P_STRIDE; this.kp = planes[k];
            this.primPlane(fit, dx, dz, minR, rowH);
            if (!planes[k].miss) any = true;
          }
          lastP = p;
        }
        if (!any) continue;
        let ey, s, after;
        if (mirror) { ey = rays.rey[ci]; s = rays.rsig[ci]; after = rays.rdw[ci]; } else { ey = v.ey; s = rays.sigma[ci]; after = 0; }
        let bD = Infinity, bk = -1;
        for (let k = 0; k < it.np; k++) {
          const kp = planes[k];
          if (kp.miss || d <= kp.tA) continue;
          this.kp = kp;
          if (!this.primRay(s, ey, after) || hit.D <= after || hit.D >= bD) continue;
          bD = hit.D; bk = k;
          best.D = hit.D; best.nx = hit.nx; best.ny = hit.ny; best.nz = hit.nz; best.kind = hit.kind; best.room = hit.room;
          best.mat = hit.mat; best.cover = hit.cover; best.prim = hit.prim; best.rev = hit.rev; best.revO = hit.revO;
        }
        if (bk < 0 || bD >= d) continue;
        depth[ci] = bD;
        hit.D = best.D; hit.nx = best.nx; hit.ny = best.ny; hit.nz = best.nz; hit.kind = best.kind; hit.room = best.room;
        hit.mat = best.mat; hit.cover = best.cover; hit.prim = best.prim; hit.rev = 0; hit.revO = 0;
        const pj = it.p0 + bk, cover = K.cover[pj], slot = mirror ? 1 : 0;
        if (K.flame[pj]) {
          const len = Math.sqrt(1 + s * s);
          m.write(ci, slot, MAT.FLAME, torchPower(this.t + it.id * 1.7) * 0.8, 0, 0, 1, cover * 2 - 1, (bD - after) * len);
        } else {
          this.primShade(ci, dx, dz, s, ey, slot, after);
          if (cover < 1 && slot === 0) {
            const o = ci * HIT_STRIDE + 2 * REC;
            m.hits[o] = MAT_FAINT; m.hits[o + 1] = (cover * 255 + 0.5) | 0;
          }
        }
        drew = true;
      }
    }
    this.kit = K0; this.kp = kp0;
    return drew;
  },
};

export function installFigures(cls) { Object.assign(cls.prototype, methods); }

// The moving lights of a frame's people: where each flame is, how bright,
// and which zones it lights (outdoors, the yard; or the room it is in).
export function moversOf(frame, kit) {
  const st = frame.people, out = [];
  if (!st || !st.length) return out;
  for (let i = 0, n = st.length / FS; i < n; i++) {
    const o = i * FS, L = lightOf(st, o);
    if (!L) continue;
    const room = st[o + S.ROOM];
    const mask = room >= 0 && kit ? roomBit(kit, room) : ZONE_OUT | ZONE_YARD;
    out.push({ x: L.x, y: L.y, z: L.z, power: torchPower(frame.t + st[o + S.ID] * 1.7), light: L.torch ? 0.9 : 0.7, mask });
  }
  return out;
}
