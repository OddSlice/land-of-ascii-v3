// A person's figure (phase 4a): a few exact shapes in the building kit's
// system (upright boxes, turned about the vertical), worked out from the
// person's state for one frame. The same state always gives the same shapes,
// in every thread.
//
// A state is FS numbers (see S): where the person stands, which way they
// face and look, their pose and the phase of their walk, what they carry,
// the room they are in, and the materials of their clothes, hair and skin.
//
// Detail by distance (horizontal, from the eye), so no part gets thinner
// than about two cells and nothing blinks out:
// - near (under NEAR_D): legs, arms, hands, feet, head, hair or a hat, and
//   the tool or light the role carries;
// - middle (to MID_D): the legs as one box, the arms in the body, the head
//   and its hat or hair, the tool held at two cells;
// - far: a two-cell silhouette, the body in its clothes' colour and the head
//   in its hat's or skin's, held at one column and a row each while its true
//   size is at least that, then faded by how much of that it really is
//   (`cover`), as a torch's flame is.
import { MAT } from '../../contract.js';
import { PT } from '../kit.js';

// (0.5.5) a part's shape, in its flags' high bits (as a carried thing's)
const ELL = PT.ELL << 4, CYL = PT.CYL << 4;

export const FS = 18;
export const S = {
  X: 0, Z: 1, FEET: 2, YAW: 3, HEAD: 4, POSE: 5, PHASE: 6, LIGHT: 7, ROOM: 8,
  TOP: 9, BOTTOM: 10, HAT: 11, SKIN: 12, HATK: 13, TOOL: 14, SCALE: 15, AUX: 16, ID: 17,
};
export const POSE = { STAND: 0, WALK: 1, WORK: 2, FISH: 3, SIT: 4, SLEEP: 5, SWEEP: 6, HIDDEN: 7 };
export const HATK = { BARE: 0, HAT: 1, HOOD: 2, HELMET: 3, CAP: 4 };
export const TOOL = { NONE: 0, HOE: 1, ROD: 2, SPEAR: 3, BROOM: 4, STAFF: 5, PACK: 6 };
export const LIGHT = { NONE: 0, LANTERN: 1, TORCH: 2 };

export const NEAR_D = 14, MID_D = 40;
// a person's sizes (metres, before the person's own scale): see docs/scale.md
export const FIG = {
  height: 1.72, shoulder: 0.21, chest: 0.12, hip: 0.86, head: [0.1, 0.11, 0.24],
  leg: 0.075, arm: 0.055, stride: 0.22, radius: 0.28,
};

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// The parts of a figure, pushed to `out` as flat records of PART numbers:
// x, z, angle, hx, hz, y0, y1, mat, flags (1: may grow to a cell, 2: a
// flame), cover (0..1). Returns how many were pushed.
export const PART = 10;
export function figureParts(st, o, dist, colAngle, rowAngle, t, out, at) {
  const pose = st[o + S.POSE];
  if (pose === POSE.HIDDEN) return 0;
  const s = st[o + S.SCALE] || 1, yaw = st[o + S.YAW], feet = st[o + S.FEET];
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), a = -yaw;
  const X = st[o + S.X], Z = st[o + S.Z];
  const top = st[o + S.TOP], bottom = st[o + S.BOTTOM], hatM = st[o + S.HAT], skin = st[o + S.SKIN];
  const hatK = st[o + S.HATK], tool = st[o + S.TOOL], light = st[o + S.LIGHT], aux = st[o + S.AUX];
  let n = 0;
  // one box: centred u across (right), w along (forward) from the feet point
  const box = (u, w, hx, hz, y0, y1, mat, flags = 1, cover = 1, ang = a) => {
    const q = at + n * PART;
    out[q] = X + rx * u + fx * w; out[q + 1] = Z + rz * u + fz * w; out[q + 2] = ang;
    out[q + 3] = hx; out[q + 4] = hz; out[q + 5] = feet + y0; out[q + 6] = feet + y1;
    out[q + 7] = mat; out[q + 8] = flags; out[q + 9] = cover;
    n++;
  };
  const minC = colAngle * Math.max(dist, 0.5), minR = rowAngle * Math.max(dist, 0.5);
  const headM = hatK === HATK.BARE ? MAT.HAIR : hatM;
  const H = FIG.height * s;

  // ---- far: a two-cell silhouette ----
  if (dist >= MID_D && pose !== POSE.SLEEP) {
    const sit = pose === POSE.SIT, bodyTop = (sit ? 0.45 + 0.6 : 1.45) * s, headTop = sit ? bodyTop + 0.3 * s : H;
    const w = 2 * FIG.shoulder * s, hb = bodyTop, hh = headTop - bodyTop;
    // held at a column wide and a row each; faded by its true share of that
    const wH = Math.max(w, minC), hbH = Math.max(hb, minR), hhH = Math.max(hh, minR);
    const cover = Math.min(1, (w * (hb + hh)) / (wH * (hbH + hhH)));
    if (cover < 0.06) return 0;
    const yb = sit ? aux : 0;
    box(0, 0, wH / 2, Math.max(FIG.chest * s, minC / 2), yb, yb + hbH, top, 0, cover);
    box(0, 0, Math.max(FIG.head[0] * s, minC / 2), Math.max(FIG.head[1] * s, minC / 2), yb + hbH, yb + hbH + hhH, headM === MAT.HAIR ? skin : headM, 0, cover);
    if (light && cover > 0.3) flame(0.34 * s, 0.1, 0.86 * s, light, 1);
    return n;
  }
  const near = dist < NEAR_D;

  // ---- lying asleep (on the bed the state names: aux is its top) ----
  if (pose === POSE.SLEEP) {
    // along the person's facing (the bed's length), the head at the back end
    const b = aux;
    box(0, 0.12, 0.24 * s, 0.62 * s, b, b + 0.2 * s, top);        // under the blanket
    box(0, -0.66 * s, FIG.head[0] * s, FIG.head[2] * s / 2, b, b + 0.21 * s, skin);
    box(0, -0.78 * s, FIG.head[0] * s + 0.01, 0.05, b + 0.02, b + 0.22 * s, MAT.HAIR);
    return n;
  }

  // ---- the legs and the body ----
  const ph = st[o + S.PHASE] * TAU;
  let swing = 0, bob = 0;
  if (pose === POSE.WALK) { swing = Math.sin(ph); bob = 0.025 * Math.abs(Math.cos(ph)); }
  const A = FIG.stride * s;
  const sit = pose === POSE.SIT, seat = sit ? aux : 0;
  const hip = (sit ? seat + 0.14 : FIG.hip * s - (pose === POSE.WORK ? 0.06 : 0)) + bob;
  const chestTop = hip + 0.58 * s;
  if (near) {
    // (the gap between the legs closes as it gets under two columns, as a
    // notch in a crown does: each leg widens inward over half of it)
    const gap = 2 * 0.09 * s - 2 * FIG.leg * s * 0.87, shut = gap * (1 - smooth(1, 2, gap / minC)) / 2;
    for (const side of [-1, 1]) {
      const lw = (pose === POSE.WALK ? side * swing * A : 0) + (pose === POSE.WORK ? side * 0.08 : 0);
      const u = side * (0.09 * s - shut / 2);
      if (sit) {
        // thighs forward along the seat, shins down to the floor
        box(u, 0.21 * s, FIG.leg * s, 0.21 * s, seat, seat + 0.15 * s, bottom);
        box(u, 0.42 * s, FIG.leg * s * 0.9, 0.07 * s, 0.06, seat + 0.02, bottom);
        box(u, 0.47 * s, 0.06 * s, 0.11 * s, 0, 0.08, MAT.LEATHER);
      } else {
        const lift = pose === POSE.WALK ? Math.max(0, side * Math.cos(ph)) * 0.05 : 0;
        // (likewise a boot: under about a row and a half, the leg runs down)
        const boot = 0.08 >= 1.5 * minR;
        // (0.5.5: the boot's toe reaches forward of the leg, so the feet say
        // which way someone faces)
        if (boot) box(u, lw + 0.045 * s, 0.06 * s, 0.13 * s, lift, lift + 0.08, MAT.LEATHER);
        // (0.5.5: round legs, as cylinders)
        box(u, lw * 0.9, FIG.leg * s * 0.87 + shut / 2, 0.07 * s, lift + (boot ? 0.06 : 0), hip * 0.53, bottom, 1);
        box(u, lw * 0.45, FIG.leg * s + shut / 2, 0.085 * s, hip * 0.51, hip + 0.02, bottom, 1);
      }
    }
  } else if (sit) {
    box(0, 0.21 * s, 0.16 * s, 0.21 * s, seat, seat + 0.15 * s, bottom, 1);
    box(0, 0.42 * s, 0.15 * s, 0.07 * s, 0, seat + 0.02, bottom, 1);
  } else {
    // the legs as one box, a little longer along the stride while walking
    box(0, 0, 0.16 * s, 0.09 * s + Math.abs(swing) * A * 0.6, 0, hip + 0.02, bottom, 1);
  }
  // the body: a tunic to the hip, or a little below it
  const tunic = top !== bottom;
  box(0, 0, (near ? FIG.shoulder : FIG.shoulder + 0.05) * s, FIG.chest * s, hip - (tunic ? 0.1 * s : 0), chestTop, top, 1);
  // (0.5.5) the front: a belt with its buckle, and the tunic's neck opening,
  // drawn at their true size (flag 0) only while each is at least a row
  // and a half tall, so none is stretched to two rows or blinks at one
  if (near && !sit && 0.07 * s >= 1.5 * minR) {
    box(0, 0, FIG.shoulder * s + 0.006, FIG.chest * s + 0.006, hip + 0.01 * s, hip + 0.08 * s, MAT.LEATHER, 0);
    if (0.06 * s >= 2 * minC) box(0, FIG.chest * s + 0.008, 0.03 * s, 0.006, hip + 0.015 * s, hip + 0.075 * s, MAT.IRON, 0);
  }
  if (near && 0.1 * s >= 1.5 * minR && 0.064 * s >= 2 * minC) box(0, FIG.chest * s + 0.004, 0.032 * s, 0.005, chestTop - 0.1 * s, chestTop + 0.004, skin, 0);

  // ---- arms and hands ----
  // (forward reach and height by pose; a swing opposite the legs walking)
  let reach = 0, raise = 0;
  if (pose === POSE.WORK) { reach = 0.22; raise = 0.04 + 0.08 * Math.max(0, Math.sin(t * 2.1 + st[o + S.ID])); }
  else if (pose === POSE.FISH) { reach = 0.24; raise = 0.16; }
  else if (pose === POSE.SWEEP) { reach = 0.2; raise = 0.02; }
  else if (sit) { reach = 0.2; raise = -0.02; }
  if (near) {
    for (const side of [-1, 1]) {
      const u = side * (FIG.shoulder + FIG.arm) * s, sw = pose === POSE.WALK ? -side * swing * A * 0.6 : 0;
      const holding = light && side === 1 && pose !== POSE.FISH;
      const fw = sw + reach * s + (holding ? 0.06 : 0), up = raise * s + (holding ? 0.1 : 0);
      // (a hand under about a row and a half is the sleeve's end: a speck of
      // skin one column wide would blink as one walks past)
      const hand = 0.1 * s >= 1.5 * minR;
      // (phase 5b) an arm hanging still is one sleeve, shoulder to cuff, the
      // forearm as wide and deep as the upper arm: the elbow's step of a few
      // millimetres caught the cells along a sleeve's edge as one walked past
      if (fw === 0 && up === 0) box(u, 0, FIG.arm * s, 0.06 * s, chestTop - (hand ? 0.6 : 0.7) * s, chestTop, top, 1);
      else {
        box(u, fw * 0.4, FIG.arm * s, 0.06 * s, chestTop - 0.3 * s, chestTop, top, 1);
        box(u, fw, FIG.arm * s, 0.06 * s, chestTop - (hand ? 0.6 : 0.7) * s + up, chestTop - 0.28 * s + up, top, 1);
      }
      if (hand) box(u, fw + 0.01, 0.045 * s, 0.045 * s, chestTop - 0.7 * s + up, chestTop - 0.6 * s + up, skin);
    }
  }

  // ---- head, hair, hat ----
  // (0.5.5) Near, a round head on a neck, the hair over its crown and down
  // its back, so a face shows only from the front, and the eyes when near
  // enough to be two cells; in the middle distance a box head with the hair
  // behind it. Either way the back of the head is hair (or a hood or a hat),
  // the front a face.
  const hy = chestTop + 0.03 * s, ha = a - st[o + S.HEAD], ht = hy + FIG.head[2] * s;
  // (a part placed in the head's own frame, as it turns: u across, w along its look)
  const hh = st[o + S.HEAD], hc = Math.cos(hh), hs = Math.sin(hh);
  const hbox = (u, w, hx, hz, y0, y1, mat, flags) => box(u * hc + w * hs, w * hc - u * hs, hx, hz, y0, y1, mat, flags, 1, ha);
  if (near) {
    hbox(0, 0, 0.048 * s, 0.048 * s, chestTop - 0.03 * s, hy + 0.05 * s, skin, 1);               // the neck
    hbox(0, 0.004, FIG.head[0] * s, FIG.head[1] * s, hy, ht, skin, 1 | ELL);                      // the head
    // the eyes: two dark marks, when each is at least two and a half cells
    if (0.022 * s >= 2.5 * minC && 0.02 * s >= 2 * minR) {
      for (const side of [-1, 1]) hbox(side * 0.038 * s, 0.1 * s, 0.011 * s, 0.009, hy + 0.125 * s, hy + 0.145 * s, MAT.CHARCOAL, 0);
    }
  } else {
    // (the middle distance: the head down into the body, solid: held whole
    // at a row, never faded; flag 8)
    hbox(0, 0, FIG.head[0] * s, FIG.head[1] * s, chestTop - 0.02 * s, ht, skin, 8);
  }
  if (hatK === HATK.HOOD) {
    // round the head's sides and back, a hair proud of it, open at the face
    if (near) hbox(0, -(0.03 * s), FIG.head[0] * s + 0.004, FIG.head[1] * s + 0.005, hy - 0.02 * s, ht + 0.012, hatM, 1 | ELL);
    else hbox(0, -0.007, FIG.head[0] * s + 0.004, 0.113 * s + 0.002, hy, ht + 0.004, hatM, 8);
    if (near) hbox(0, -(0.07 * s), 0.11 * s, 0.05 * s, chestTop - 0.06 * s, hy + 0.08 * s, hatM, 1);    // falling on the shoulders behind
  } else {
    // the hair: over the crown and down the back of the head (under a hat too)
    if (near) {
      // (as wide as the head, so their outlines meet at the sides: a hair
      // wider, and a strip of it blinked beside the face as one walked past)
      hbox(0, -(0.022 * s), FIG.head[0] * s, FIG.head[1] * s + 0.004, hy + 0.06 * s, ht + 0.014, MAT.HAIR, 1 | ELL);
      hbox(0, -(0.065 * s), 0.085 * s, 0.05 * s, hy + 0.01 * s, hy + 0.17 * s, MAT.HAIR, 1);
    } else hbox(0, -(0.035 * s), 0.105 * s, 0.08 * s, hy + 0.06 * s, ht + 0.012, MAT.HAIR, 8);
    if (hatK === HATK.HAT) {
      // a round brim and a crown (cylinders near, boxes further off)
      // (further off, one solid box: brim and crown)
      if (near) {
        hbox(0, 0, 0.17 * s, 0.17 * s, ht - 0.03, ht, hatM, 1 | CYL);
        hbox(0, 0, 0.1 * s, 0.1 * s, ht - 0.01, ht + 0.09 * s, hatM, 1 | CYL);
      } else hbox(0, 0, 0.15 * s, 0.15 * s, ht - 0.03, ht + 0.09 * s, hatM, 8);
    } else if (hatK === HATK.HELMET) hbox(0, 0, 0.115 * s, 0.12 * s, ht - 0.1 * s, ht + 0.04, MAT.IRON, near ? 1 | ELL : 8);
    else if (hatK === HATK.CAP) hbox(0, -0.01, 0.106 * s, 0.116 * s, ht - 0.07 * s, ht + 0.02, hatM, near ? 1 | ELL : 8);
  }

  // ---- what they carry ----
  // (0.5.5: a tool's shaft fades out between 15 and 21 m: held at two
  // columns further off it was a tall pale ghost beside the figure)
  const hu = (FIG.shoulder + FIG.arm) * s, hand = chestTop - 0.65 * s, kept = 1 - smooth(15, 21, dist);
  if ((tool === TOOL.HOE || tool === TOOL.STAFF || tool === TOOL.SPEAR || tool === TOOL.BROOM) && kept > 0.06) {
    const fw = pose === POSE.WORK ? 0.42 : pose === POSE.SWEEP ? 0.3 : 0.14;
    const len = tool === TOOL.SPEAR ? 2.3 : tool === TOOL.STAFF ? 1.75 : 1.45;
    const yb = pose === POSE.WORK || pose === POSE.SWEEP ? 0.02 : (tool === TOOL.SPEAR ? 0.02 : 0.05);
    box(hu + 0.03, fw, 0.022, 0.022, yb, yb + len, MAT.TIMBER, 1, kept);
    if (tool === TOOL.SPEAR) box(hu + 0.03, fw, 0.03, 0.03, yb + len, yb + len + 0.22, MAT.IRON, 1, kept);
    if (tool === TOOL.HOE) box(hu + 0.03, fw + 0.08, 0.07, 0.1, yb, yb + 0.05, MAT.IRON, 1, kept);
    if (tool === TOOL.BROOM) box(hu + 0.03, fw, 0.12, 0.05, yb, yb + 0.28, MAT.OCHRE, 1, kept);
  } else if (tool === TOOL.ROD && pose === POSE.FISH && kept > 0.06) {
    // a rod held out over the water, rising in short steps
    for (let k = 0; k < 4; k++) box(0.12, 0.45 + k * 0.5, 0.02, 0.26, hand + 0.25 + k * 0.28, hand + 0.3 + k * 0.28, MAT.TIMBER, 1, kept);
  } else if (tool === TOOL.PACK) box(0, -0.2 * s, 0.17 * s, 0.1 * s, chestTop - 0.45 * s, chestTop - 0.05 * s, MAT.LEATHER, 1);
  if (light) flame(hu + 0.08, 0.12, hand + (light === LIGHT.TORCH ? 0.55 : 0.08), light, near ? 1 : 0);
  return n;

  // a lantern (a small iron cage round its flame) or a torch (a stick and
  // its flame), held at the right hand
  function flame(u, w, y, kind, detail) {
    if (kind === LIGHT.TORCH) {
      if (detail) box(u, w, 0.025, 0.025, y - 0.55, y, MAT.TIMBER, 1);
      box(u, w, 0.05, 0.05, y, y + 0.14, MAT.FLAME, 2);
    } else {
      if (detail) {
        box(u, w, 0.065, 0.065, y - 0.03, y, MAT.IRON, 1);
        box(u, w, 0.065, 0.065, y + 0.14, y + 0.17, MAT.IRON, 1);
      }
      box(u, w, 0.045, 0.045, y, y + 0.14, MAT.FLAME, 2);
    }
  }
}

// The light a person carries, as a moving point light: where its flame is.
// Returns null when they carry none.
export function lightOf(st, o) {
  const light = st[o + S.LIGHT];
  if (!light || st[o + S.POSE] === POSE.HIDDEN) return null;
  const s = st[o + S.SCALE] || 1, yaw = st[o + S.YAW];
  const hu = (FIG.shoulder + FIG.arm) * s + 0.08;
  const sit = st[o + S.POSE] === POSE.SIT;
  const hip = sit ? st[o + S.AUX] + 0.14 : FIG.hip * s;
  const y = st[o + S.FEET] + hip + 0.58 * s - 0.65 * s + (light === LIGHT.TORCH ? 0.62 : 0.15);
  return { x: st[o + S.X] + Math.cos(yaw) * hu + Math.sin(yaw) * 0.12, y, z: st[o + S.Z] - Math.sin(yaw) * hu + Math.cos(yaw) * 0.12, torch: light === LIGHT.TORCH };
}
