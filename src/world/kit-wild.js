// The wild ground detail as building-kit pieces (phase 4b): boulders,
// outcrops, fallen logs, stumps and reed beds, each from the kit's exact
// shapes (wild shapes in kit.js, drawn by scene/cpu/wild.js), so what is
// drawn is what stops a walker, what one stands on and what casts a shadow.
// Every piece is described as plain data by gen/wild.js (its place, its
// sizes, the ground under it, a seed) and built here; the same description
// gives the same shapes on every thread.
import { PT, PF, TX } from './kit.js';
import { MAT } from '../contract.js';

const hashU = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export const WILD_KINDS = new Set(['boulder', 'outcrop', 'log', 'stump', 'reeds']);

// One stone: an ellipsoid of half sizes rx (along a), rz, standing h above
// `top` (the ground's highest point under it), sunk to `low` (its lowest).
function stone(b, x, z, a, rx, rz, h, top, low, seed, tex) {
  const ry = h * 0.8, cy = top + h - ry;
  b.add({ type: PT.ELL, x, z, a, hx: rx, hz: rz, y0: Math.max(cy - ry, low - 0.3), y1: cy + ry, base: cy, mat: MAT.ROCK, tex, tex2: tex, flags: PF.FADE | PF.WALK, seed });
}

// A boulder: one main stone and up to two smaller ones against it, so its
// outline is uneven.
function boulder(b, p) {
  const [x, z] = p.at, s = p.seed;
  const lumps = p.r < 0.5 ? 0 : 1 + (hashU(s, 1) < 0.5 ? 1 : 0);
  stone(b, x, z, p.a, p.r * (1 + 0.2 * hashU(s, 2)), p.r * (0.75 + 0.2 * hashU(s, 3)), p.h, p.top, p.low, s, TX.BOULDER);
  for (let k = 0; k < lumps; k++) {
    const ang = p.a + (k === 0 ? 1 : -1) * (0.9 + 1.2 * hashU(s, 10 + k)), d = p.r * (0.45 + 0.2 * hashU(s, 12 + k));
    const ox = x + Math.cos(ang) * d, oz = z + Math.sin(ang) * d, f = 0.5 + 0.2 * hashU(s, 14 + k);
    stone(b, ox, oz, ang, p.r * f, p.r * f * 0.8, p.h * (0.55 + 0.25 * hashU(s, 16 + k)), p.top, p.low, s + 1 + k, TX.BOULDER);
  }
}

// An outcrop: three to five flat slabs of bedded rock breaking out of a
// steep slope, set along its contour (a: the contour's direction).
function outcrop(b, p) {
  const [x, z] = p.at, s = p.seed, n = 3 + Math.floor(hashU(s, 1) * 3);
  const ca = Math.cos(p.a), sa = Math.sin(p.a);
  for (let k = 0; k < n; k++) {
    const along = (k - (n - 1) / 2) * p.r * (0.9 + 0.3 * hashU(s, 20 + k)), across = (hashU(s, 30 + k) - 0.5) * p.r * 0.8;
    const ox = x + ca * along - sa * across, oz = z + sa * along + ca * across;
    const rx = p.r * (0.6 + 0.4 * hashU(s, 40 + k)), rz = rx * (0.45 + 0.2 * hashU(s, 50 + k));
    const g = p.ground[k] !== undefined ? p.ground[k] : p.top;
    stone(b, ox, oz, p.a + (hashU(s, 60 + k) - 0.5) * 0.5, rx, rz, p.h * (0.6 + 0.4 * hashU(s, 70 + k)), g, g - 0.6, s + k, TX.STRATA);
  }
}

// A fallen log, lying along a, a quarter sunk into the ground.
function log(b, p) {
  const [x, z] = p.at, r = p.r, cy = p.base + r * 0.75;
  b.add({ type: PT.LOG, x, z, a: p.a, hx: p.len / 2, hz: r, y0: cy - r, y1: cy + r, base: cy, mat: MAT.BARK, mat2: MAT.WOOD, tex: TX.BARK, tex2: TX.RINGS, flags: PF.FADE | PF.WALK, seed: p.seed });
}

// A stump: an upright trunk cut off, its top the wood's rings.
function stump(b, p) {
  const [x, z] = p.at;
  b.add({ type: PT.CYL, x, z, a: 0, hx: p.r, y0: p.low - 0.2, y1: p.top + p.h, mat: MAT.BARK, mat2: MAT.WOOD, tex: TX.BARK, tex2: TX.RINGS, flags: PF.FADE | PF.WALK, seed: p.seed });
}

// A bed of reeds: stems from the water (or the wet bank) to about h above it.
function reeds(b, p) {
  const [x, z] = p.at;
  b.add({ type: PT.REED, x, z, a: 0, hx: p.r, y0: p.base - 0.15, y1: p.base + p.h, mat: MAT.REED, tex: TX.REEDS, tex2: TX.REEDS, flags: PF.FADE | PF.PASS, seed: p.seed });
}

export function buildWildPiece(b, p) {
  switch (p.kind) {
    case 'boulder': return boulder(b, p);
    case 'outcrop': return outcrop(b, p);
    case 'log': return log(b, p);
    case 'stump': return stump(b, p);
    case 'reeds': return reeds(b, p);
  }
  return null;
}
