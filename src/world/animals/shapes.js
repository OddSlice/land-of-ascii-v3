// An animal's figure (phase 4b): a few exact shapes in the building kit's
// system (upright boxes turned to face its way), worked out from its state
// for one frame, the same in every thread. The same records as a person's
// parts (src/world/people/figure.js, PART numbers each).
//
// Distance (art bible section 6), as people:
// - near (under ANEAR_D): every part: legs, a head, a neck, ears, a tail,
//   wings; the thin ones (legs, ears, a bird's wings) held at two rows and
//   two columns by the render pass, and faded past the near distance;
// - middle (to AMID_D): the legs as one box, the head with the body;
// - far: a two-cell silhouette in the coat's colour, held at a column and a
//   row while its true size is at least that, then faded by its true share,
//   so a far flock is a pale cluster, not sparkle.
// A bird in the air narrower than two columns (its span, `marked`) is not
// drawn as shapes at all: it is a mark of its own glyph family (resolve.js),
// and a far flock thins by count.
import { AS, A, APOSE, KIND, SPEC, ANEAR_D, AMID_D } from './kinds.js';
import { LOOK } from '../../look.js';
import { MAT } from '../../contract.js';
import { PART } from '../people/figure.js';

// Is the bird at o, `dist` metres off (across the ground), a mark now? The
// same test on the main thread (which makes the marks) and in the workers
// (which draw the rest), from the frame's column angle.
export function marked(st, o, dist, colAngle) {
  if (st[o + A.POSE] !== APOSE.FLY) return false;
  const sp = SPEC[st[o + A.KIND]];
  return (sp.span || 0.5) * (st[o + A.SCALE] || 1) < 2 * colAngle * Math.max(dist, 0.5);
}
const TAU = Math.PI * 2;
// (all four legs apart only this near; further, left and right as one)
const LEGS_APART = 8;

export function animalParts(st, o, dist, colAngle, rowAngle, t, out, at, ex = NaN, ez = NaN) {
  const pose = st[o + A.POSE];
  if (pose === APOSE.HIDDEN) return 0;
  const kind = st[o + A.KIND];
  if (marked(st, o, dist, colAngle)) return 0;
  const s = st[o + A.SCALE] || 1, yaw = st[o + A.YAW], Y = st[o + A.Y];
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), a = -yaw;
  const X = st[o + A.X], Z = st[o + A.Z], M1 = st[o + A.M1], M2 = st[o + A.M2];
  const ph = st[o + A.PHASE] * TAU, head = st[o + A.HEAD];
  let n = 0;
  const box = (u, w, hx, hz, y0, y1, mat, flags = 0, cover = 1, ang = a) => {
    const q = at + n * PART;
    out[q] = X + rx * u + fx * w; out[q + 1] = Z + rz * u + fz * w; out[q + 2] = ang;
    out[q + 3] = hx; out[q + 4] = hz; out[q + 5] = Y + y0; out[q + 6] = Y + y1;
    out[q + 7] = mat; out[q + 8] = flags; out[q + 9] = cover;
    n++;
  };
  const minC = colAngle * Math.max(dist, 0.5), minR = rowAngle * Math.max(dist, 0.5);
  const near = dist < ANEAR_D, far = dist >= AMID_D;
  const sp = SPEC[kind];
  // the far silhouette: the body only, held at two columns wide and a row
  // tall, faded by its true share of that
  if (far && pose !== APOSE.FLY) {
    const lie = pose === APOSE.LIE || pose === APOSE.SIT || pose === APOSE.SWIM || pose === APOSE.PERCH;
    const h = (lie ? sp.back * 0.55 : sp.back) * s, base = lie ? 0 : sp.back * 0.4 * s;
    // (its width across the view: its length turned toward you, its girth)
    const rel = Number.isNaN(ex) ? Math.PI / 2 : Math.atan2(X - ex, Z - ez) - yaw;
    const across = sp.len * 0.5 * s * Math.abs(Math.sin(rel)) + sp.r * s * Math.abs(Math.cos(rel));
    const wH = Math.max(across, minC), hH = Math.max(h - base, minR);
    let cover = Math.min(1, (across * (h - base)) / (wH * hH));
    if (cover < LOOK.animals.fadeMin) return 0;
    // (phase 5b) a perched crow or small bird far off: drawn at the size it
    // has at the middle distance, and less faded, a dark mark rather than a
    // pale speck (it went unnoticed)
    if (kind === KIND.CROW || kind === KIND.FINCH) cover = Math.min(1, cover * (1 + LOOK.animals.grow) * (1 + LOOK.animals.grow));
    box(0, 0, wH, wH, base, base + hH, M1, 0, cover);
    return n;
  }
  const swing = pose === APOSE.WALK ? Math.sin(ph) : pose === APOSE.RUN ? Math.sin(ph) * 1.6 : 0;
  // four legs at (+-lu, +-lw), hx thick, lh long: all four apart within
  // LEGS_APART; further, each pair (front, back) as one thin part, held at
  // two columns (left and right legs a column or two apart would open and
  // close a gap as the view turns)
  const legs = (lu, lw, hx, lh, mat) => {
    const lr = dist < LEGS_APART;
    for (const su of lr ? [1, -1] : [0]) for (const sw of [1, -1]) {
      const k = (su || 1) * sw > 0 ? 1 : -1;
      box(su * lu * s, sw * lw * s + k * swing * lh * (lr ? 0.22 : 0.15), (lr ? hx : lu + hx) * s, hx * s, lr ? 0 : 0.08 * lh, lh * s, mat, 1);
    }
  };
  switch (kind) {
    case KIND.SHEEP: {
      if (pose === APOSE.LIE) { box(0, 0, 0.27 * s, 0.45 * s, 0, 0.42 * s, M1); box(0, 0.48 * s, 0.09 * s, 0.12 * s, 0.18 * s, 0.4 * s, M2); break; }
      legs(0.13, 0.3, 0.045, 0.46, M2);
      box(0, 0, 0.25 * s, 0.45 * s, 0.42 * s, 0.86 * s, M1);
      if (head > 0.5 || pose === APOSE.WALK || pose === APOSE.RUN) box(0, 0.52 * s, 0.09 * s, 0.13 * s, 0.62 * s, 0.82 * s, M2);
      else box(0, 0.56 * s, 0.09 * s, 0.14 * s, 0.16 * s, 0.42 * s, M2);
      break;
    }
    case KIND.COW: {
      if (pose === APOSE.LIE) { box(0, 0, 0.38 * s, 0.9 * s, 0, 0.75 * s, M1); box(0, 1.0 * s, 0.13 * s, 0.22 * s, 0.3 * s, 0.65 * s, M1); break; }
      legs(0.22, 0.68, 0.07, 0.72, M1);
      box(0, 0, 0.34 * s, 0.9 * s, 0.68 * s, 1.38 * s, M1);
      if (head > 0.5 || pose === APOSE.WALK) box(0, 1.05 * s, 0.13 * s, 0.22 * s, 0.95 * s, 1.3 * s, M1);
      else box(0, 1.12 * s, 0.13 * s, 0.22 * s, 0.15 * s, 0.55 * s, M1);
      if (near) box(0, 1.25 * s, 0.1 * s, 0.07 * s, pose === APOSE.GRAZE && head < 0.5 ? 0.15 * s : 0.95 * s, pose === APOSE.GRAZE && head < 0.5 ? 0.33 * s : 1.12 * s, M2);
      break;
    }
    case KIND.HEN: {
      const peck = pose === APOSE.PECK;
      if (near) box(0, 0, 0.025 * s, 0.025 * s, 0, 0.14 * s, M2, 1);
      box(0, 0, 0.1 * s, 0.16 * s, 0.13 * s, 0.32 * s, M1);
      box(0, peck ? 0.2 * s : 0.15 * s, 0.045 * s, 0.06 * s, peck ? 0.06 * s : 0.29 * s, peck ? 0.17 * s : 0.4 * s, M1);
      box(0, -0.15 * s, 0.05 * s, 0.05 * s, 0.26 * s, 0.4 * s, M1);
      break;
    }
    case KIND.DOG: {
      if (pose === APOSE.LIE) { box(0, 0, 0.14 * s, 0.38 * s, 0, 0.3 * s, M1); box(0, 0.42 * s, 0.08 * s, 0.13 * s, 0.05 * s, 0.25 * s, M1); box(0, 0.56 * s, 0.045 * s, 0.06 * s, 0.06 * s, 0.17 * s, M2); break; }
      if (pose === APOSE.SIT) {
        box(0, -0.12 * s, 0.13 * s, 0.2 * s, 0, 0.32 * s, M1); box(0, 0.08 * s, 0.11 * s, 0.13 * s, 0.25 * s, 0.6 * s, M1);
        box(0, 0.2 * s, 0.08 * s, 0.12 * s, 0.55 * s, 0.75 * s, M1); box(0, 0.33 * s, 0.045 * s, 0.06 * s, 0.58 * s, 0.67 * s, M2);
        if (near) box(0, 0.08 * s, 0.07 * s, 0.03 * s, 0, 0.28 * s, M1, 1);
        break;
      }
      legs(0.08, 0.26, 0.035, 0.32, M1);
      box(0, 0, 0.12 * s, 0.38 * s, 0.3 * s, 0.58 * s, M1);
      box(0, 0.46 * s, 0.085 * s, 0.13 * s, 0.44 * s, 0.66 * s, M1);
      box(0, 0.6 * s, 0.045 * s, 0.06 * s, 0.47 * s, 0.56 * s, M2);
      if (near) box(0, -0.45 * s, 0.03 * s, 0.1 * s, 0.5 * s + 0.04 * Math.sin(t * 9), 0.6 * s + 0.04 * Math.sin(t * 9), M1, 1);
      break;
    }
    case KIND.DEER: {
      if (pose === APOSE.LIE) {
        box(0, 0, 0.2 * s, 0.55 * s, 0, 0.55 * s, M1);
        box(0, 0.45 * s, 0.07 * s, 0.09 * s, 0.45 * s, 0.95 * s, M1); box(0, 0.56 * s, 0.07 * s, 0.14 * s, 0.85 * s, 1.0 * s, M1);
        break;
      }
      legs(0.11, 0.4, 0.035, 0.8, M1);
      box(0, 0, 0.17 * s, 0.55 * s, 0.78 * s, 1.18 * s, M1);
      box(0, -0.56 * s, 0.12 * s, 0.025 * s, 0.86 * s, 1.1 * s, M2);
      if (head > 0.5 || pose === APOSE.RUN || pose === APOSE.WALK) { box(0, 0.5 * s, 0.07 * s, 0.09 * s, 1.05 * s, 1.45 * s, M1); box(0, 0.62 * s, 0.07 * s, 0.15 * s, 1.38 * s, 1.56 * s, M1); }
      else { box(0, 0.62 * s, 0.07 * s, 0.16 * s, 0.5 * s, 1.0 * s, M1); box(0, 0.8 * s, 0.07 * s, 0.13 * s, 0.15 * s, 0.45 * s, M1); }
      if (near && (head > 0.5 || pose !== APOSE.GRAZE)) { box(0.05 * s, 0.56 * s, 0.015 * s, 0.03 * s, 1.52 * s, 1.66 * s, M1, 1); box(-0.05 * s, 0.56 * s, 0.015 * s, 0.03 * s, 1.52 * s, 1.66 * s, M1, 1); }
      break;
    }
    case KIND.HARE: {
      if (pose === APOSE.RUN) { box(0, 0, 0.08 * s, 0.24 * s, 0.1 * s, 0.27 * s, M1); box(0, 0.27 * s, 0.05 * s, 0.07 * s, 0.18 * s, 0.3 * s, M1); break; }
      box(0, 0, 0.09 * s, 0.15 * s, 0.04 * s, 0.3 * s, M1);
      box(0, 0.15 * s, 0.05 * s, 0.07 * s, 0.24 * s, 0.36 * s, M1);
      if (near) { const up = head > 0.5 ? 0.5 : 0.44; box(0.025 * s, 0.12 * s, 0.012 * s, 0.03 * s, 0.34 * s, up * s, M1, 1); box(-0.025 * s, 0.12 * s, 0.012 * s, 0.03 * s, 0.34 * s, up * s, M1, 1); }
      break;
    }
    case KIND.DUCK: {
      if (pose === APOSE.SIT) { box(0, 0, 0.11 * s, 0.19 * s, 0, 0.17 * s, M1); box(0, 0.06 * s, 0.05 * s, 0.06 * s, 0.12 * s, 0.22 * s, M2); break; }
      box(0, 0, 0.1 * s, 0.2 * s, 0, 0.16 * s, M1);
      box(0, 0.18 * s, 0.045 * s, 0.06 * s, 0.13 * s, 0.24 * s, M2);
      box(0, -0.21 * s, 0.05 * s, 0.03 * s, 0.08 * s, 0.16 * s, M1);
      if (near) box(0, 0.25 * s, 0.02 * s, 0.035 * s, 0.16 * s, 0.19 * s, MAT.OCHRE, 1);
      if (pose === APOSE.WALK && near) box(0, 0, 0.03 * s, 0.03 * s, 0, 0.06 * s, MAT.OCHRE, 1);
      break;
    }
    case KIND.GULL: case KIND.CROW: case KIND.FINCH: case KIND.KITE: {
      let k = kind === KIND.GULL ? 1 : kind === KIND.CROW ? 0.9 : kind === KIND.FINCH ? 0.35 : 1.6;
      // (phase 5b) a crow or a small bird bigger toward the middle distance
      let grow = 1;
      if (kind === KIND.CROW || kind === KIND.FINCH) { const g = Math.max(0, Math.min(1, (dist - ANEAR_D * 0.7) / (AMID_D - ANEAR_D * 0.7))); grow = 1 + LOOK.animals.grow * g * g * (3 - 2 * g); k *= grow; }
      if (pose === APOSE.PERCH) {
        if (near) box(0, 0, 0.02 * k, 0.02 * k, 0, 0.1 * k, kind === KIND.GULL ? MAT.OCHRE : M2, 1);
        // (phase 5b: a crow's or a small bird's body past the near distance
        // is held at two rows and two columns, as thin parts are)
        box(0, 0, 0.08 * k * s, 0.18 * k * s, 0.1 * k * s, 0.3 * k * s, M1, grow > 1 && !near ? 1 : 0);
        if (near) { box(0.075 * k * s, -0.06 * k * s, 0.02 * k * s, 0.15 * k * s, 0.18 * k * s, 0.3 * k * s, M2, 1); box(-0.075 * k * s, -0.06 * k * s, 0.02 * k * s, 0.15 * k * s, 0.18 * k * s, 0.3 * k * s, M2, 1); }
        box(0, 0.17 * k * s, 0.045 * k * s, 0.06 * k * s, 0.27 * k * s, 0.37 * k * s, M1);
        break;
      }
      // in the air: a body and two wings beating (thin: the render pass
      // holds them at two rows and fades them)
      const span = (sp.span || 1) * s * grow, e = Math.sin(ph), lift = 0.14 * k * e;
      box(0, 0, 0.07 * k * s, 0.2 * k * s, -0.05 * k, 0.05 * k, M1);
      for (const sg of [-1, 1]) box(sg * (0.07 * k * s + span / 4), 0, span / 4, 0.1 * k * s, lift - 0.015, lift + 0.015, M1, 1);
      break;
    }
  }
  return n;
}

// The frame's bird marks: every bird in the air that is a mark now, as six
// numbers (x, y, z, material, wings 0 up / 1 level / 2 down, strength). A
// flock far off keeps `keep` of its birds, fewer with distance (its later
// ones go first, the last kept fading), so it thins by count, not flicker.
export function birdMarks(st, n, groupOf, cam, colAngle, out) {
  const M = LOOK.animals.marks;
  // each flock's distance (its flying birds' middle) and size
  const gd = new Map();
  for (let i = 0; i < n; i++) {
    const o = i * AS;
    if (st[o + A.POSE] !== APOSE.FLY) continue;
    const g = groupOf(i), e = gd.get(g) || { x: 0, z: 0, k: 0 };
    e.x += st[o + A.X]; e.z += st[o + A.Z]; e.k++; gd.set(g, e);
  }
  let k = 0;
  for (let i = 0; i < n; i++) {
    const o = i * AS;
    const dist = Math.hypot(st[o + A.X] - cam.x, st[o + A.Z] - cam.z);
    if (!marked(st, o, dist, colAngle)) continue;
    const e = gd.get(groupOf(i)), gdist = Math.hypot(e.x / e.k - cam.x, e.z / e.k - cam.z);
    const keep = Math.max(M.least, e.k * Math.min(1, M.near / Math.max(1, gdist)));
    const s = Math.min(1, Math.max(0, keep - st[o + A.SPARE]));
    if (s <= 0) continue;
    const w = Math.sin(st[o + A.PHASE] * TAU) * (st[o + A.WING] || 1);
    out[k++] = st[o + A.X]; out[k++] = st[o + A.Y]; out[k++] = st[o + A.Z]; out[k++] = st[o + A.M1];
    out[k++] = w > 0.35 ? 0 : w < -0.35 ? 2 : 1; out[k++] = s;
  }
  return k;
}
