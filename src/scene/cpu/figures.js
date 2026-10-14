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
import { animalParts } from '../../world/animals/shapes.js';
import { AS, A as AN, APOSE, ANEAR_D, AMID_D, SPEC } from '../../world/animals/kinds.js';
import { LOOK } from '../../look.js';
import { P as KP, P_STRIDE, PT, PF, ZONE_OUT, ZONE_YARD, roomBit } from '../../world/kit.js';
import { MAT, MAT_FAINT, HIT_STRIDE, REC, H_SHADOW } from '../../contract.js';
import { torchPower } from './light.js';
import { Plane } from './build.js';
import { LYING, HELD, LANTERN, LANTERN_FLAME_Y, HANDS, LOST, SHAPE_SHIFT } from '../../world/things.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

export const FIG = 4;
const MAXP = 24;                 // parts a figure can have
const FAR = 420;                 // beyond this a figure is not drawn (it has faded)
const AFAR = 320;                // (phase 4b) an animal's

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
    const st = frame.people, sa = frame.animals, you = frame.you, items = this.figItems;
    items.length = 0;
    this.figAnimals = sa || null;
    const n = st ? st.length / FS : 0, na = sa ? sa.length / AS : 0, ny = you ? 2 + (you.lost ? you.lost.length : 0) : 0;
    if (!n && !na && !ny) return;
    const wk = this.world.kit;
    if (!this.figKit || this.figKit.cap < (n + na + ny) * MAXP) {
      const cap = Math.max(256, (n + na + ny) * MAXP);
      this.figKit = { cap, prims: new Float64Array(cap * P_STRIDE), holes: new Float64Array(0), cover: new Float32Array(cap), flame: new Uint8Array(cap), shine: new Uint8Array(cap),
        rooms: wk ? wk.rooms : [], roomBits: wk ? wk.roomBits : [], yards: wk ? wk.yards : [], np: 0 };
    }
    let np = 0;
    for (let i = 0; i < n; i++) {
      const o = i * FS;
      if (st[o + S.POSE] === POSE.HIDDEN) continue;
      const x = st[o + S.X], z = st[o + S.Z], dist = Math.hypot(x - v.ex, z - v.ez);
      if (dist > FAR) continue;
      const k = figureParts(st, o, dist, v.colAngle, v.rowAngle, frame.t, this.figParts, 0);
      if (k) np = this.figItem(v, np, k, i, x, z, dist, st[o + S.ROOM], st[o + S.ID], NEAR_D);
    }
    // (phase 4b) the frame's animals, the same way: frustum first
    const spread = -v.t0;
    for (let i = 0; i < na; i++) {
      const o = i * AS;
      if (sa[o + AN.POSE] === APOSE.HIDDEN) continue;
      const x = sa[o + AN.X], z = sa[o + AN.Z], dx = x - v.ex, dz = z - v.ez, dist = Math.hypot(dx, dz);
      if (dist > AFAR) continue;
      const fwd = dx * v.syaw + dz * v.cyaw, lat = dx * v.cyaw - dz * v.syaw;
      if (fwd < -3 || Math.abs(lat) > spread * Math.max(fwd, 0) + 3) continue;
      const k = animalParts(sa, o, dist, v.colAngle, v.rowAngle, frame.t, this.figParts, 0, v.ex, v.ez);
      if (k) np = this.figItem(v, np, k, 100000 + i, x, z, dist, sa[o + AN.ROOM], 50000 + sa[o + AN.ID], ANEAR_D, true);
    }
    // (phase 5a) what the player carries, and the lost things on the ground
    if (you) np = this.prepareYou(v, frame, you, np);
    this.figKit.np = np;
  },

  // (phase 5a) The player's hands, from the eye of this frame: the lantern,
  // lit, in the right, the thing carried in the left, swaying with the
  // stride; and each lost thing where it lies until it is found. They are
  // drawn as people are (thin parts held at two cells and faded far off).
  prepareYou(v, frame, you, np) {
    const buf = this.figParts, c = frame.cam;
    const push = (parts, X, Z, Y, yaw, k0, g = 1) => {
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let k = k0;
      for (const [u, w, hx, hz, y0, y1, mat, flags] of parts) {
        const q = k * PART;
        buf[q] = X + rx * u * g + fx * w * g; buf[q + 1] = Z + rz * u * g + fz * w * g; buf[q + 2] = -yaw;
        buf[q + 3] = hx * g; buf[q + 4] = hz * g; buf[q + 5] = Y + y0 * g; buf[q + 6] = Y + y1 * g;
        buf[q + 7] = mat; buf[q + 8] = flags || 0; buf[q + 9] = 1;
        k++;
      }
      return k;
    };
    const hand = (side) => {
      const ph = (you.walk || 0) / HANDS.stride * Math.PI * 2;
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      const r = side + HANDS.sway * 0.5 * Math.sin(ph), f = HANDS.fwd;
      return { x: c.x + fx * f + rx * r, z: c.z + fz * f + rz * r, y: c.y - HANDS.down + HANDS.sway * Math.abs(Math.cos(ph)) };
    };
    const room = you.room ?? -1;
    if (you.lantern) {
      const hp = hand(HANDS.right), k = push(LANTERN, hp.x, hp.z, hp.y, c.yaw, 0);
      np = this.figItem(v, np, k, 200000, hp.x, hp.z, HANDS.fwd, room, 70000, NEAR_D);
    }
    if (you.carry && HELD[you.carry]) {
      const hp = hand(HANDS.left), k = push(HELD[you.carry], hp.x, hp.z, hp.y, c.yaw, 0);
      np = this.figItem(v, np, k, 200001, hp.x, hp.z, HANDS.fwd, room, 70001, NEAR_D);
    }
    (you.lost || []).forEach(([x, z, y, shape, yaw], j) => {
      const dist = Math.hypot(x - v.ex, z - v.ez), parts = LYING[shape];
      if (!parts || dist > 160) return;
      // (every part may be held to two cells, and fades far off; phase 5b:
      // a little proud of the ground and a little bigger, and catching
      // the light, a lantern's or the moon's, as a polished thing does)
      const k = push(parts.map((p) => { const q = p.slice(); q[7] = (q[7] || 0) | 1 | 4; return q; }), x, z, y + LOST.lift, yaw, 0, LOST.grow);
      np = this.figItem(v, np, k, 200002 + j, x, z, dist, -1, 70002 + j, NEAR_D);
    });
    return np;
  },

  // One figure's parts (in this.figParts) into the kit's prims, and its item.
  figItem(v, np, k, pi, x, z, dist, room, id, nearD, animal = false) {
    const K = this.figKit, P = K.prims, buf = this.figParts, items = this.figItems;
    const minC = v.colAngle * Math.max(dist, 0.5), minR = v.rowAngle * Math.max(dist, 0.5);
    let reach = 0, y0 = Infinity, y1 = -Infinity, flames = 0;
    let kk = 0;
    for (let j = 0; j < k; j++) {
      const b = j * PART, q = (np + kk) * P_STRIDE;
      let hx = buf[b + 3], hz = buf[b + 4], ya = buf[b + 5], yb = buf[b + 6], cover = buf[b + 9];
      // (flags: 1 thin, 2 a flame, 4 (phase 5b) shining)
      const fl = buf[b + 8], flame = (fl & 2) !== 0, thin = (fl & 1) !== 0;
      if (flame) {
        // held at a column wide and two rows tall, faded by its true share
        const w = hx, h = (yb - ya) / 2, wm = Math.max(w, minC / 2), hm = Math.max(h, minR);
        cover = Math.min(cover, (w * h) / (wm * hm));
        hx = hz = wm; const yc = (ya + yb) / 2; ya = yc - hm; yb = yc + hm;
        flames++;
      } else if (thin) {
        // a small part (a brim, a tool's shaft, a torch's stick, a leg, a
        // wing): held at two rows tall and two columns across (its width
        // across the view), and further off faded by how much of that it
        // really is, so it cannot fall between rows or columns and blink
        const h = (yb - ya) / 2, hm = Math.max(h, minR);
        const vx = buf[b] - v.ex, vz = buf[b + 1] - v.ez, vl = Math.hypot(vx, vz) || 1, px = -vz / vl, pz = vx / vl;
        const ca = Math.cos(buf[b + 2]), sa = Math.sin(buf[b + 2]);
        const across = hx * Math.abs(ca * px + sa * pz) + hz * Math.abs(-sa * px + ca * pz);
        if (hm > h) { const yc = (ya + yb) / 2; ya = yc - hm; yb = yc + hm; }
        // (faded only past the near detail: close by, the parts are whole
        // and a faded one's blend with what lies behind would jump)
        if (animal) {
          // (phase 4b) an animal's thin parts (legs, ears, wings) are held
          // and faded out by distance alone, over the last quarter of the
          // middle step, so turning cannot change them
          // (and held at two columns across the view: widened as a whole)
          if (across < minC) { const f = minC / Math.max(across, 1e-4); hx *= f; hz *= f; }
          cover = Math.min(cover, 1 - smooth(AMID_D * 0.7, AMID_D, dist));
        } else if (dist >= nearD) cover = Math.min(cover, (h / hm) * Math.min(1, across / minC));
        if (cover < 0.06) continue;
      }
      const ang = buf[b + 2];
      // (phase 5b) a thing's part may be another of the kit's shapes
      const ty = (fl >> SHAPE_SHIFT) || PT.BOX;
      P[q + KP.TYPE] = ty; P[q + KP.CX] = buf[b]; P[q + KP.CZ] = buf[b + 1];
      P[q + KP.CA] = Math.cos(ang); P[q + KP.SA] = Math.sin(ang);
      P[q + KP.HX] = hx; P[q + KP.HZ] = ty === PT.CYL ? hx : hz; P[q + KP.Y0] = ya; P[q + KP.Y1] = yb;
      P[q + KP.MAT] = buf[b + 7]; P[q + KP.MAT2] = buf[b + 7];
      P[q + KP.FLAGS] = thin && !flame ? PF.GROW : 0;
      P[q + KP.H0] = 0; P[q + KP.HN] = 0; P[q + KP.ROOM] = room;
      P[q + KP.SEED] = id * 37 + j; P[q + KP.TEX] = 0; P[q + KP.TEX2] = 0; P[q + KP.BASE] = ty === PT.ELL ? (ya + yb) / 2 : ya;
      K.cover[np + kk] = cover; K.flame[np + kk] = flame ? 1 : 0; K.shine[np + kk] = (fl & 4) ? 1 : 0; kk++;
      const dx = buf[b] - x, dz = buf[b + 1] - z, r = Math.sqrt(dx * dx + dz * dz) + Math.max(hx, hz) * 1.42;
      if (r > reach) reach = r;
      if (ya < y0) y0 = ya; if (yb > y1) y1 = yb;
    }
    if (!kk) return np;
    items.push({ kind: FIG, pi, p0: np, np: kk, x, z, R: reach + 0.05, y0: y0 - 0.05, y1: y1 + 0.05, grow: 1.5, up: flames ? 1 : 0, id, dist });
    return np + kk;
  },

  // (phase 4b) The animals' shadows on the ground: each one's footprint
  // moved away from the light by its height over the light's slope (and
  // drawn out that way), soft at its edge, darkening the cast-shadow byte of
  // the ground cells it falls on. A function of the positions and the light
  // alone; faded out with distance, never cut.
  animalShadows() {
    const sa = this.figAnimals, light = this.light;
    if (!sa || !light) return;
    const L = light.L, W = LOOK.animals.shadow;
    const hh = Math.hypot(L[0], L[2]);
    if (L[1] <= 0.02 || hh < 1e-4) return;
    const tanE = L[1] / hh, ax = -L[0] / hh, az = -L[2] / hh;
    const { v, rays, m } = this, H = m.hits, sw = rays.sw, jlo = rays.jlo, c0 = rays.c0, bb = this.bb;
    for (const it of this.figItems) {
      if (it.pi < 100000 || it.pi >= 200000 || it.dist > W.far) continue;
      const o = (it.pi - 100000) * AS, pose = sa[o + AN.POSE];
      if (pose === APOSE.FLY || pose === APOSE.PERCH || pose === APOSE.SWIM || pose === APOSE.HIDDEN) continue;
      const sp = SPEC[sa[o + AN.KIND]], sc = sa[o + AN.SCALE] || 1, y = sa[o + AN.Y], x = sa[o + AN.X], z = sa[o + AN.Z];
      const low = pose === APOSE.LIE || pose === APOSE.SIT;
      const h = sp.back * sc * (low ? 0.55 : 1), half = sp.len * sc / 2 + 0.05, rr = sp.r * sc * 1.05;
      const off = Math.min(h * 0.55 / tanE, 4 * half), k = off / (2 * half);
      const cx = x + ax * off * 0.6, cz = z + az * off * 0.6, R = half + off * 0.6 + rr;
      const fade = W.dark * (1 - smooth(W.far * 0.65, W.far, it.dist)) * (sa[o + AN.ROOM] >= 0 ? 0 : 1);
      if (fade <= 0.01) continue;
      if (!this.screenBox(cx - R, cx + R, y - 0.6, y + 0.4, cz - R, cz + R)) continue;
      const yaw = sa[o + AN.YAW], fx = Math.sin(yaw), fz = Math.cos(yaw), m1 = sa[o + AN.M1], m2 = sa[o + AN.M2];
      for (let ccx = bb[0]; ccx <= bb[1]; ccx++) {
        for (let ccy = bb[2]; ccy <= bb[3]; ccy++) {
          const ci = ccy * sw + (ccx - c0), d = rays.depth[ci];
          if (!(d < 1e9)) continue;
          const ho = ci * HIT_STRIDE, mat = H[ho];
          if (mat === m1 || mat === m2 || mat === MAT.WATER) continue;
          const p = rays.plane[ci] - jlo, X = v.ex + rays.pdx[p] * d, Z = v.ez + rays.pdz[p] * d, Y = v.ey + rays.sigma[ci] * d;
          let qx = X - cx, qz = Z - cz;
          const dist = Math.hypot(X - x, Z - z);
          if (Math.abs(Y - y) > 0.2 + 0.35 * dist) continue;
          // (drawn out away from the light)
          const qa = qx * ax + qz * az, sq = qa * (1 - 1 / (1 + k));
          qx -= ax * sq; qz -= az * sq;
          const u = (qx * fx + qz * fz) / half, w = (qx * fz - qz * fx) / rr, e = Math.sqrt(u * u + w * w);
          if (e >= 1) continue;
          const sh = fade * (1 - smooth(W.soft, 1, e)) * 255;
          if (sh > H[ho + H_SHADOW]) H[ho + H_SHADOW] = sh + 0.5 | 0;
        }
      }
    }
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
  // (phase 5a) the player's lantern, lit: the people's own lantern light,
  // from its flame in the right hand
  const you = frame.you;
  if (you && you.lantern) {
    const c = frame.cam, ph = (you.walk || 0) / HANDS.stride * Math.PI * 2;
    const r = HANDS.right + HANDS.sway * 0.5 * Math.sin(ph), f = HANDS.fwd;
    const x = c.x + Math.sin(c.yaw) * f + Math.cos(c.yaw) * r, z = c.z + Math.cos(c.yaw) * f - Math.sin(c.yaw) * r;
    const y = c.y - HANDS.down + HANDS.sway * Math.abs(Math.cos(ph)) + LANTERN_FLAME_Y;
    const room = you.room ?? -1;
    out.push({ x, y, z, power: torchPower(frame.t + 70000 * 1.7), light: 0.7, mask: room >= 0 && kit ? roomBit(kit, room) : ZONE_OUT | ZONE_YARD });
  }
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
