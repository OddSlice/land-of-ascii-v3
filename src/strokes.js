// What the resolve step draws over the hits (src/resolve.js): rain streaks
// and far birds' marks, each projected into the cells of the stripe being
// resolved, in front of what the cell's ray hit.
import { LOOK } from './look.js';
import { HIT_STRIDE } from './contract.js';
import { RAIN_GLYPHS, BIRD_GLYPHS } from './glyphs.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const RAIN = LOOK.weather.rain;
const hash01 = (i, k, n) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(k | 0, 668265263) ^ Math.imul(n + 0x3c6ef372, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// the stripe's streaks and marks, per cell: the rain's strength (0: none)
// and glyph; a mark's strength, glyph, material and distance (grown as needed)
export const strokes = {
  rainS: new Float32Array(0), rainG: new Uint8Array(0),
  markS: new Float32Array(0), markG: new Uint8Array(0), markM: new Uint8Array(0), markD: new Float32Array(0),
};

// Rain (phase 2b, LOOK.weather.rain): the streaks round the eye, fixed to
// the world and falling with the clock, projected into the cells of this
// stripe (each stripe projects them all and keeps its own columns, so a cell
// never depends on its stripe). A streak shows only in front of what the
// cell's ray hit; where several cross a cell the strongest wins.
export function rainStreaks(frame, P, hits, c0, sw, rows) {
  const n = sw * rows;
  let { rainS, rainG } = strokes;
  if (rainS.length < n) { rainS = strokes.rainS = new Float32Array(n); rainG = strokes.rainG = new Uint8Array(n); }
  rainS.fill(0, 0, n);
  const cam = frame.cam, W = frame.cols, R = rows;
  const ty = Math.tan(frame.fovY / 2), tx = ty * frame.aspect;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const ex = cam.x, ey = cam.y, ez = cam.z, t = frame.t;
  const V = RAIN.speed, sx = P.wind[0] / V, sz = P.wind[1] / V;
  const reach = RAIN.reach, g = RAIN.spacing, per = RAIN.period, len = RAIN.length;
  const strength = RAIN.strength * P.rain;
  // a column's drops fall along a slanted line fixed to the world, which at
  // height y stands at (u - sx y, w - sz y) for the column's (u, w)
  const ue = ex + sx * ey, we = ez + sz * ey;
  const i0 = Math.floor((ue - reach) / g), i1 = Math.ceil((ue + reach) / g);
  const k0 = Math.floor((we - reach) / g), k1 = Math.ceil((we + reach) / g);
  const ylo = ey - 6, yhi = ey + 12;
  // the streak's length along its fall
  const vl = Math.sqrt(sx * sx + 1 + sz * sz), lx = sx / vl * len, ly = len / vl, lz = sz / vl * len;
  const proj = (x, y, z, out) => {
    const rx = x - ex, ry = y - ey, rz = z - ez;
    const a = rx * cy - rz * sy, b = rx * sy + rz * cy;
    const cz = b * cp + ry * sp, cyv = ry * cp - b * sp;
    out[0] = (a / cz / tx + 1) / 2 * W; out[1] = (1 - cyv / cz / ty) / 2 * R; out[2] = cz;
  };
  const A = [0, 0, 0], B = [0, 0, 0];
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const u = (i + 0.1 + 0.8 * hash01(i, k, 1)) * g, w = (k + 0.1 + 0.8 * hash01(i, k, 2)) * g;
      // (the drop falls at V; its heads are `per` apart along the column)
      const ph = hash01(i, k, 3) * per + V * t;
      const q0 = Math.ceil((ylo + ph) / per), q1 = Math.floor((yhi + ph) / per);
      for (let q = q0; q <= q1; q++) {
        const y = q * per - ph, x = u - sx * y, z = w - sz * y;
        const dx = x - ex, dy = y - ey, dz = z - ez, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < RAIN.near || d > reach) continue;
        const st = strength * smooth(RAIN.near, RAIN.near * 1.8, d) * (1 - smooth(reach * 0.55, reach, d));
        if (st <= 0.01) continue;
        // the head and the tail above it, back along its fall
        proj(x, y, z, A); proj(x + lx, y + ly, z + lz, B);
        if (A[2] < 0.3 || B[2] < 0.3) continue;
        const dX = A[0] - B[0], dY = A[1] - B[1];
        // (on screen a row is two columns' width tall)
        const lean = dY > 1e-6 ? dX / (2 * dY) : 0;
        const gl = lean > 0.3 ? RAIN_GLYPHS[2] : lean < -0.3 ? RAIN_GLYPHS[1] : RAIN_GLYPHS[0];
        const steps = Math.ceil(Math.max(Math.abs(dX), Math.abs(dY))) + 1;
        for (let m = 0; m < steps; m++) {
          const f = steps > 1 ? m / (steps - 1) : 0.5;
          const X = Math.floor(B[0] + dX * f), Y = Math.floor(B[1] + dY * f);
          if (X < c0 || X >= c0 + sw || Y < 0 || Y >= R) continue;
          const ci = Y * sw + (X - c0);
          if (st <= rainS[ci]) continue;
          // only in front of what the cell's ray hit
          const o = ci * HIT_STRIDE, hd = hits[o + 6] | (hits[o + 7] << 8);
          if (hd !== 65535 && d >= hd / 10) continue;
          rainS[ci] = st; rainG[ci] = gl;
        }
      }
    }
  }
}
// (phase 4b) Birds far off: each a mark (frame.marks: x, y, z, material,
// wings 0 up / 1 level / 2 down, strength; six numbers each), projected into
// the cells of this stripe as the rain is, in front of what the cell's ray
// hit; where two fall in one cell the nearer wins.
export function birdMarks(frame, hits, c0, sw, rows) {
  const n = sw * rows, mk = frame.marks;
  let { markS, markG, markM, markD } = strokes;
  if (markS.length < n) {
    markS = strokes.markS = new Float32Array(n); markG = strokes.markG = new Uint8Array(n);
    markM = strokes.markM = new Uint8Array(n); markD = strokes.markD = new Float32Array(n);
  }
  markS.fill(0, 0, n);
  const cam = frame.cam, W = frame.cols, R = rows;
  const ty = Math.tan(frame.fovY / 2), tx = ty * frame.aspect;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const far = LOOK.animals.marks.far;
  for (let k = 0; k < mk.length; k += 6) {
    const rx = mk[k] - cam.x, ry = mk[k + 1] - cam.y, rz = mk[k + 2] - cam.z;
    const a = rx * cy - rz * sy, b = rx * sy + rz * cy;
    const cz = b * cp + ry * sp, cyv = ry * cp - b * sp;
    if (cz < 0.5) continue;
    const X = Math.floor((a / cz / tx + 1) / 2 * W), Y = Math.floor((1 - cyv / cz / ty) / 2 * R);
    if (X < c0 || X >= c0 + sw || Y < 0 || Y >= R) continue;
    const d = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const st = mk[k + 5] * (1 - smooth(far * 0.6, far, d));
    if (st <= 0.02) continue;
    const ci = Y * sw + (X - c0), o = ci * HIT_STRIDE, hd = hits[o + 6] | (hits[o + 7] << 8);
    if (hd !== 65535 && d >= hd / 10) continue;
    if (markS[ci] > 0 && d >= markD[ci]) continue;
    markS[ci] = st; markG[ci] = BIRD_GLYPHS[mk[k + 4]]; markM[ci] = mk[k + 3]; markD[ci] = d;
  }
}
