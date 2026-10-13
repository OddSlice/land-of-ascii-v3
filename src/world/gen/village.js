// The villages (phase 3b): each of the three village sites filled with a
// place composed from the site, not stamped. Every village gets one of three
// patterns, each from the site that suits it best:
// - 'shore': houses along a lane by the water, facing it, and a jetty;
// - 'green': houses gathered round a small green with the well and a
//   market shelter on it;
// - 'street': houses strung along its road, both sides, the street running
//   on a little past where the road ends.
// Within a pattern the seed varies the number of houses (8 to 20), their
// kinds, sizes, angles and setbacks, the roofs and tints, and which few can
// be entered. Every village has one chapel, one well, one or two barns at
// its edge, lanterns at its centre (and at its jetty), lit windows in most
// houses, and a signpost where its road meets the main road.
//
// A house sits on the ground as it is, on a footing of rough stone that
// takes up the slope: where the ground falls more than SCALE.kit.footing.rise
// across it, or its door would open onto a drop or into a bank, it moves
// along its frontage or is dropped, never forced.
//
// Around each village lie fields: blocks of strips (crop, stubble, fallow)
// running along the contour, bounded here and there by a fence or a
// dry-stone wall with a gate gap; narrow footpaths lead from the village to
// its fields, to the water and to the nearest viewpoint.
import { SCALE } from '../scale.js';
import { hash2 } from '../noise.js';
import { KIND, CG } from './water.js';
import { heightAt } from './sites.js';
import { inPoly } from './fort.js';
import { MinHeap } from './heap.js';
import { MAT } from '../../contract.js';

const K = SCALE.kit, V = SCALE.village;
const TAU = Math.PI * 2;
const ROAD_HALF = SCALE.road.width / 2, LANE_HALF = V.lane / 2, PATH_HALF = V.path / 2;
const WALLS = [MAT.PLASTER, MAT.PLASTER2, MAT.PLASTER3], TIMBERS = [MAT.TIMBER, MAT.TIMBER2, MAT.TIMBER3];

// ---- what is where: roads, lanes, paths and buildings, for placing --------------

// Points along roads, lanes and paths (each with its half width), in 8 m
// cells, so "is this near a way?" is quick.
export class Ways {
  constructor() { this.cells = new Map(); }
  add(x, z, half) {
    const k = Math.floor(x / 8) * 4096 + Math.floor(z / 8);
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push(x, z, half);
  }
  line(xs, zs, half, step = 1) { for (let q = 0; q < xs.length; q += step) this.add(xs[q], zs[q], half); }
  // the least clearance from (x, z) to the edge of any way (negative: on it)
  clear(x, z, reach = 12) {
    let best = Infinity;
    const r = Math.ceil(reach / 8);
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = cx - r; i <= cx + r; i++) for (let k = cz - r; k <= cz + r; k++) {
      const c = this.cells.get(i * 4096 + k);
      if (!c) continue;
      for (let o = 0; o < c.length; o += 3) {
        const d = Math.hypot(c[o] - x, c[o + 1] - z) - c[o + 2];
        if (d < best) best = d;
      }
    }
    return best;
  }
}

// A turned rectangle: centre, angle, half sizes.
const rect = (x, z, a, hw, hd) => ({ x, z, a, hw, hd, ca: Math.cos(a), sa: Math.sin(a) });
// Do two turned rectangles come within `gap` of each other? (separating axes)
function overlaps(A, B, gap) {
  for (const R of [A, B]) {
    for (const [ux, uz] of [[R.ca, R.sa], [-R.sa, R.ca]]) {
      const proj = (Q) => {
        const c = Q.x * ux + Q.z * uz;
        const e = Q.hw * Math.abs(Q.ca * ux + Q.sa * uz) + Q.hd * Math.abs(-Q.sa * ux + Q.ca * uz);
        return [c - e, c + e];
      };
      const [a0, a1] = proj(A), [b0, b1] = proj(B);
      if (a1 + gap < b0 || b1 + gap < a0) return false;
    }
  }
  return true;
}
// Points over a rectangle (and `pad` past it), every `step` metres.
function* over(R, pad = 0, step = 1) {
  const nu = Math.max(1, Math.ceil(2 * (R.hw + pad) / step)), nw = Math.max(1, Math.ceil(2 * (R.hd + pad) / step));
  for (let i = 0; i <= nu; i++) for (let k = 0; k <= nw; k++) {
    const u = -R.hw - pad + 2 * (R.hw + pad) * i / nu, w = -R.hd - pad + 2 * (R.hd + pad) * k / nw;
    yield [R.x + u * R.ca - w * R.sa, R.z + u * R.sa + w * R.ca];
  }
}

// ---- choosing each village's pattern ---------------------------------------------

// The nearest water to (x, z) within `reach` metres: the point, its kind and
// level, and the way to it.
export function nearestWater(env, x, z, reach = 220) {
  const { kind, level, N } = env, NN = N + 1;
  let best = null;
  for (let d = 2; d <= reach && !best; d += 2) {
    const n = Math.max(12, Math.round(TAU * d / 3));
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, px = Math.round(x + Math.cos(a) * d), pz = Math.round(z + Math.sin(a) * d);
      if (px < 1 || pz < 1 || px >= N || pz >= N) continue;
      const j = pz * NN + px;
      if (kind[j] !== KIND.NONE) { best = { x: px, z: pz, d, kind: kind[j], level: level[j], dir: [Math.cos(a), Math.sin(a)] }; break; }
    }
  }
  return best;
}

// One pattern each: the shore village is the one nearest open water (a lake,
// the sea, or a river wide enough for a jetty), the green the flattest of
// the others, the street the last.
export function villagePatterns(sites, env) {
  const n = sites.length, out = new Array(n).fill('street');
  const water = sites.map((v) => nearestWater(env, v.x, v.z));
  const order = sites.map((v, q) => q).sort((a, b) => (water[a] ? water[a].d : 1e9) - (water[b] ? water[b].d : 1e9) || a - b);
  const shore = order[0];
  out[shore] = 'shore';
  const rest = sites.map((v, q) => q).filter((q) => q !== shore).sort((a, b) => sites[a].spread - sites[b].spread || a - b);
  if (rest.length) out[rest[0]] = 'green';
  return { patterns: out, water };
}

// ---- one village -----------------------------------------------------------------

// Plan village q at site v with `pattern`. `env`: { H, N, kind, level,
// wetDist, F, thr, seed, roads, ways, built (rectangles of every building
// placed so far, the fort's included), cleared (polygons nothing may enter) }.
// Returns the pieces of its description, its lanes, its houses and the
// points the tools and the cameras need.
export function planVillage(q, v, pattern, water, env) {
  const { H, N, kind, seed } = env, NN = N + 1;
  const r = (k) => hash2(q * 977 + k, 31, seed + 9001);
  const gAt = (x, z) => heightAt(H, N, x, z);
  const wetAt = (x, z) => { const i = Math.round(x), k = Math.round(z); return i < 0 || k < 0 || i > N || k > N || kind[k * NN + i] !== KIND.NONE; };
  const pieces = [], lanes = [], houses = [], rects = [];
  const rec = { q, pattern, x: v.x, z: v.z, houses: [], enter: [], lanterns: [], chapel: null, well: null, barns: [], jetty: null, shelter: null, signpost: null, green: null };

  // ---- character: the roofs, the tints, fences or walls -----------------------
  const thatchShare = [0.75, 0.3, 0.5][Math.floor(r(1) * 3)];
  const wallW = [r(2), r(3), r(4)], timberW = [r(5), r(6), r(7)];
  const pick = (ws, t) => { const s = ws.reduce((a, b) => a + b, 0); let acc = 0; for (let i = 0; i < ws.length; i++) { acc += ws[i] / s; if (t < acc) return i; } return ws.length - 1; };
  rec.bounds = r(8) < 0.5 ? 'fence' : 'drystone';

  // ---- the road into it and its centre --------------------------------------------
  const rd = env.roads.find((x) => x.to === `village ${q + 1}`);
  // its last stretch, from the site outward
  const stretch = (from, len) => { const xs = [], zs = []; for (let k = from; k < Math.min(rd.n, from + len); k++) { xs.push(rd.x[k]); zs.push(rd.z[k]); } return { xs, zs }; };
  let C = [v.x, v.z];

  // A lane: points every metre from (x0, z0) along `dir` (radians) for up to
  // `len` metres, stopping at water, steep ground or another way.
  const laneFrom = (x0, z0, dir, len, keepOff = true) => {
    const xs = [], zs = [];
    let x = x0, z = z0, g0 = gAt(x0, z0);
    for (let k = 0; k <= len; k++) {
      if (wetAt(x, z) || env.wetDist[Math.round(z) * NN + Math.round(x)] < 4) break;
      const g = gAt(x, z);
      if (k > 0 && Math.abs(g - g0) > 0.16) break;
      if (keepOff && k > 6 && env.ways.clear(x, z, 10) < LANE_HALF + 0.5) break;
      if (env.cleared.some((p) => inPoly(p, x, z))) break;
      xs.push(x); zs.push(z); g0 = g;
      x += Math.cos(dir); z += Math.sin(dir);
    }
    return { xs, zs };
  };

  // frontages: polylines houses face, each { xs, zs, half (the way's half width), sides }
  const fronts = [];
  if (pattern === 'street') {
    const s = stretch(0, 160);
    fronts.push({ ...s, half: ROAD_HALF, sides: [1, -1] });
    // on past the road's end, as a lane
    const dx = rd.x[0] - rd.x[Math.min(rd.n - 1, 8)], dz = rd.z[0] - rd.z[Math.min(rd.n - 1, 8)];
    const ln = laneFrom(rd.x[0] + dx / 8, rd.z[0] + dz / 8, Math.atan2(dz, dx), 40 + 30 * r(9));
    if (ln.xs.length > 10) { lanes.push(ln); fronts.push({ ...ln, half: LANE_HALF, sides: [1, -1] }); }
    // the centre: on the street, a third of the way out from its end
    const mid = Math.min(s.xs.length - 1, 30);
    C = [s.xs[mid], s.zs[mid]];
  } else if (pattern === 'green') {
    // the green round the road's end; houses round it face its middle
    const Rg = V.green[0] + (V.green[1] - V.green[0]) * r(10);
    rec.green = { x: v.x, z: v.z, r: Rg };
    const ring = { xs: [], zs: [], half: 0, sides: [-1], ring: true };
    const n = Math.round(TAU * (Rg + 2));
    for (let k = 0; k < n; k++) { const a = k / n * TAU; ring.xs.push(v.x + Math.cos(a) * (Rg + 2)); ring.zs.push(v.z + Math.sin(a) * (Rg + 2)); }
    fronts.push(ring);
    // and a lane out of the green on the far side from the road, for more houses
    const ra = Math.atan2(rd.z[Math.min(rd.n - 1, 25)] - v.z, rd.x[Math.min(rd.n - 1, 25)] - v.x);
    const la = ra + Math.PI + (r(11) - 0.5) * 1.2;
    const ln = laneFrom(v.x + Math.cos(la) * Rg, v.z + Math.sin(la) * Rg, la, 50 + 30 * r(12));
    if (ln.xs.length > 12) { lanes.push(ln); fronts.push({ ...ln, half: LANE_HALF, sides: [1, -1] }); }
    // the road's own last stretch, outside the green
    const s = stretch(Math.ceil(Rg + 3), 70);
    fronts.push({ ...s, half: ROAD_HALF, sides: [1, -1] });
  } else {
    // the shore: a lane along the water at about V.shoreBack metres from it,
    // reached from the road's end by a short lane down to it
    const w = water;
    const nx = w.dir[0], nz = w.dir[1];
    const P0 = [w.x - nx * V.shoreBack, w.z - nz * V.shoreBack];
    const tdir = Math.atan2(nx, -nz);
    const a1 = laneFrom(P0[0], P0[1], tdir, 45 + 25 * r(13), false), a2 = laneFrom(P0[0], P0[1], tdir + Math.PI, 45 + 25 * r(14), false);
    const xs = [...a2.xs.slice(1).reverse(), ...a1.xs], zs = [...a2.zs.slice(1).reverse(), ...a1.zs];
    if (xs.length > 12) {
      const ln = { xs, zs };
      lanes.push(ln);
      // houses face the water: on the landward side, and on the water side where there is room
      fronts.push({ xs, zs, half: LANE_HALF, sides: [1, -1], face: [nx, nz] });
      C = P0;
    }
    // the lane from the road's end down to the shore lane
    const dl = Math.hypot(P0[0] - v.x, P0[1] - v.z);
    if (dl > 6) {
      const conn = laneFrom(v.x, v.z, Math.atan2(P0[1] - v.z, P0[0] - v.x), dl, false);
      if (conn.xs.length > 4) { lanes.push(conn); fronts.push({ ...conn, half: LANE_HALF, sides: [1, -1] }); }
    }
    const s = stretch(0, 80);
    fronts.push({ ...s, half: ROAD_HALF, sides: [1, -1] });
    rec.shoreFace = [nx, nz];
  }
  rec.centre = { x: C[0], z: C[1], y: gAt(C[0], C[1]) };
  // the lanes are ways too
  for (const ln of lanes) env.ways.line(ln.xs, ln.zs, LANE_HALF);
  // (the green keeps houses off it, but its well, shelter and benches stand on it)
  const offGreen = (x, z, pad) => !rec.green || Math.hypot(x - rec.green.x, z - rec.green.z) > rec.green.r + pad;

  // ---- can a building stand here? ------------------------------------------------
  const F = K.footing;
  // where a building of half sizes hw, hd (front +w) at (x, z) turned a would
  // stand: its floor and the lowest ground under it, or null
  const fit = (x, z, a, hw, hd, over = 0.5) => {
    const R = rect(x, z, a, hw, hd);
    let lo = Infinity, hi = -Infinity;
    for (const [px, pz] of over_(R, 0.3)) {
      if (wetAt(px, pz)) return null;
      const g = gAt(px, pz);
      if (g < lo) lo = g; if (g > hi) hi = g;
    }
    if (hi - lo > F.rise) return null;
    // clear of the ways, the fort, other buildings (a lane between to walk and see the sky)
    for (const [px, pz] of over_(R, over + 0.4, 2)) {
      if (env.ways.clear(px, pz, 14) < 0.6 || !offGreen(px, pz, 0.6)) return null;
      if (env.cleared.some((p) => inPoly(p, px, pz))) return null;
    }
    for (const B of env.built) if (overlaps(R, B, V.gap)) return null;
    for (const B of rects) if (overlaps(R, B, V.gap)) return null;
    const floor = hi + F.above;
    // the door: firm ground in front of it, no drop and no bank
    const ca = Math.cos(a), sa = Math.sin(a);
    const fx = x - (hd + 1.2) * sa, fz = z + (hd + 1.2) * ca;
    if (wetAt(fx, fz)) return null;
    const gf = gAt(fx, fz);
    if (gf < floor - V.doorDrop || gf > floor + 0.05) return null;
    return { floor, low: lo, R };
  };
  const over_ = over;

  // the kinds of house and their sizes
  const sizeOf = (kind, t1, t2) => {
    const S = kind === 'hall' ? K.hall : kind === 'barn' ? K.barn : kind === 'chapel' ? K.chapel : K.cottage;
    return [S.w[0] + (S.w[1] - S.w[0]) * t1, S.d[0] + (S.d[1] - S.d[0]) * t2];
  };

  // Try to put a building along a frontage near arc length `at` (both ways
  // up to `slide` metres), on `side`: returns the placement or null.
  const along = (fr, at, side, kind, hw, hd, setback, jitter, slide = 4) => {
    const n = fr.xs.length;
    for (let s = 0; s <= slide; s += 1) for (const sg of s ? [1, -1] : [1]) {
      const i = Math.round(at + sg * s);
      if (i < 2 || i > n - 3) continue;
      const tx = fr.xs[i + 2] - fr.xs[i - 2], tz = fr.zs[i + 2] - fr.zs[i - 2], tl = Math.hypot(tx, tz) || 1;
      // the normal on this side
      let nx = -tz / tl * side, nz = tx / tl * side;
      if (fr.ring) { nx = fr.xs[i] - rec.green.x; nz = fr.zs[i] - rec.green.z; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
      const off = fr.half + setback + hd;
      const x = fr.xs[i] + nx * off, z = fr.zs[i] + nz * off;
      // facing the way (its front, +w, toward it), a little off square
      let fxd = -nx, fzd = -nz;
      if (fr.face && kind !== 'barn') { fxd = fr.face[0]; fzd = fr.face[1]; if ((fxd * -nx + fzd * -nz) < -0.2) continue; }
      const a = Math.atan2(-fxd, fzd) + jitter;
      const f = fit(x, z, a, hw, hd);
      if (f) return { x, z, a, ...f, i };
    }
    return null;
  };

  const add = (kind, pl, extra = {}) => {
    rects.push(pl.R);
    const pc = { kind, at: [pl.x, pl.z], angle: pl.a, floor: pl.floor, low: pl.low, w: pl.R.hw, d: pl.R.hd, seed: 3000 + q * 400 + rects.length * 7, ...extra };
    pieces.push(pc);
    return pc;
  };

  // ---- the chapel first, at the best place near the centre -------------------------
  const target = 8 + Math.floor(13 * r(20));
  const near = (fr) => { let b = 0, bd = Infinity; fr.xs.forEach((x, i) => { const d = Math.hypot(x - C[0], fr.zs[i] - C[1]); if (d < bd) { bd = d; b = i; } }); return b; };
  {
    const tower = r(21) < 0.5;
    const [hw, hd] = sizeOf('chapel', r(22), r(23));
    let pl = null;
    for (const fr of fronts) {
      const i0 = near(fr);
      for (let t = 0; t < 40 && !pl; t += 3) for (const side of fr.sides) {
        // (a chapel turns its front gable, with the door, to the way)
        pl = pl || alongChapel(fr, i0 + (t % 2 ? t : -t), side, hw, hd, tower);
        if (pl) break;
      }
      if (pl) break;
    }
    if (pl) { rec.chapel = add('chapel', pl, { tower, lit: true, w: hw, d: hd }); }
  }
  // (a chapel: its door on its +u end faces the way; its frame is turned so)
  function alongChapel(fr, at, side, hw, hd, tower) {
    const n = fr.xs.length, i = Math.round(at);
    if (i < 2 || i > n - 3) return null;
    const tx = fr.xs[i + 2] - fr.xs[i - 2], tz = fr.zs[i + 2] - fr.zs[i - 2], tl = Math.hypot(tx, tz) || 1;
    let nx = -tz / tl * side, nz = tx / tl * side;
    if (fr.ring) { nx = fr.xs[i] - rec.green.x; nz = fr.zs[i] - rec.green.z; const l = Math.hypot(nx, nz); nx /= l; nz /= l; }
    const len = hw + (tower ? 2 * K.chapel.tower : 0);
    const off = fr.half + 3 + len;
    const x = fr.xs[i] + nx * off, z = fr.zs[i] + nz * off;
    // its +u toward the way
    const a = Math.atan2(-nz, -nx);
    // the whole of it, tower included, as one rectangle shifted toward the tower
    const sh = tower ? K.chapel.tower : 0;
    const cx = x + Math.cos(a) * sh, cz = z + Math.sin(a) * sh;
    const f = fit(cx, cz, a, hw + sh, hd);
    if (!f) return null;
    // (fit looked for its door on local +w; the chapel's is on +u: check that ground too)
    const dx = x + Math.cos(a) * (len + 1.4), dz = z + Math.sin(a) * (len + 1.4);
    if (wetAt(dx, dz) || Math.abs(gAt(dx, dz) - f.floor) > V.doorDrop) return null;
    return { x, z, a, floor: f.floor, low: f.low, R: f.R };
  }

  // ---- the houses ----------------------------------------------------------------
  // candidate places along every frontage, every few metres on each side,
  // tried nearest the centre first
  const slots = [];
  fronts.forEach((fr, fi) => {
    const step = 9;
    for (let i = 4; i < fr.xs.length - 4; i += step) for (const side of fr.sides) {
      const d = Math.hypot(fr.xs[i] - C[0], fr.zs[i] - C[1]);
      slots.push({ fi, i: i + (hash2(i, fi * 7 + side + 3, seed + q * 31) - 0.5) * 3, side, d });
    }
  });
  slots.sort((a, b) => a.d - b.d || a.fi - b.fi || a.i - b.i || a.side - b.side);
  let k = 0;
  for (const sl of slots) {
    if (houses.length >= target) break;
    k++;
    const t = hash2(k, 40, seed + q * 131);
    const kind = t < 0.3 ? 'hall' : 'cottage';
    const [hw, hd] = sizeOf(kind, hash2(k, 41, seed + q * 131), hash2(k, 42, seed + q * 131));
    const setback = V.setback[0] + (V.setback[1] - V.setback[0]) * hash2(k, 43, seed + q * 131);
    const jitter = (hash2(k, 44, seed + q * 131) - 0.5) * 2 * V.turn;
    const pl = along(fronts[sl.fi], sl.i, sl.side, kind, hw, hd, setback, jitter, 3);
    if (!pl) continue;
    const thatch = hash2(k, 45, seed + q * 131) < thatchShare;
    const pc = add(kind, pl, {
      roof: thatch ? 'thatch' : 'shingle', walls: WALLS[pick(wallW, hash2(k, 46, seed + q * 131))], timber: TIMBERS[pick(timberW, hash2(k, 47, seed + q * 131))],
      lit: hash2(k, 48, seed + q * 131) < V.lit, chimney: hash2(k, 49, seed + q * 131) < 0.7, hearthSide: hash2(k, 50, seed + q * 131) < 0.5 ? 1 : -1, d0: sl.d,
    });
    houses.push(pc);
  }
  // the few one can enter: the ones nearest the centre, two to four
  const nEnter = 2 + Math.floor(3 * r(30));
  houses.slice().sort((a, b) => a.d0 - b.d0).slice(0, nEnter).forEach((h) => { h.enter = true; h.lit = true; });

  // ---- the well, the market shelter, the barns ------------------------------------------
  const free = (x, z, rad) => {
    const R = rect(x, z, 0, rad, rad);
    if (wetAt(x, z)) return false;
    if (env.ways.clear(x, z, rad + 8) < rad + 0.8) return false;
    for (const B of rects) if (overlaps(R, B, 1.5)) return false;
    for (const B of env.built) if (overlaps(R, B, 1.5)) return false;
    let lo = Infinity, hi = -Infinity;
    for (const [px, pz] of over(R, 0, 1)) { if (wetAt(px, pz)) return false; const g = gAt(px, pz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    return hi - lo < 0.5;
  };
  const spot = (x0, z0, rad, tries = 60, kk = 60) => {
    for (let t = 0; t < tries; t++) {
      const a = hash2(t, kk, seed + q * 17) * TAU, d = t === 0 ? 0 : 2 + t * 0.6;
      const x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
      if (free(x, z, rad)) return [x, z];
    }
    return null;
  };
  const wellAt = rec.green ? spot(rec.green.x + rec.green.r * 0.35, rec.green.z, 1.6, 40, 61) : spot(C[0], C[1], 1.6, 80, 62);
  if (wellAt) {
    const base = gAt(wellAt[0], wellAt[1]);
    pieces.push({ kind: 'well', at: wellAt, angle: r(63) * Math.PI, base, seed: 3100 + q });
    rects.push(rect(wellAt[0], wellAt[1], 0, 1.3, 1.3));
    rec.well = { x: wellAt[0], z: wellAt[1], y: base };
  }
  if (rec.green) {
    const sa = hash2(q, 64, seed) * TAU, sx = rec.green.x + Math.cos(sa) * rec.green.r * 0.4, sz = rec.green.z + Math.sin(sa) * rec.green.r * 0.4;
    const at = spot(sx, sz, 3.3, 40, 65);
    if (at) {
      const [hw, hd] = [K.shelter.w[0] + (K.shelter.w[1] - K.shelter.w[0]) * r(66), K.shelter.d[0] + 0.3 * r(67)];
      const a = Math.atan2(at[1] - rec.green.z, at[0] - rec.green.x) + Math.PI / 2;
      const base = gAt(at[0], at[1]);
      pieces.push({ kind: 'shelter', at, angle: a, base, w: hw, d: hd, roof: r(68) < thatchShare ? 'thatch' : 'shingle', seed: 3150 + q });
      rects.push(rect(at[0], at[1], a, hw + 0.4, hd + 0.4));
      rec.shelter = { x: at[0], z: at[1], y: base };
    }
  }
  // barns: one or two at the far ends of the frontages
  const nBarn = 1 + (r(70) < 0.5 ? 1 : 0);
  const ends = [];
  fronts.forEach((fr, fi) => { for (const i of [fr.xs.length - 6, 5]) if (i > 4 && i < fr.xs.length - 4) for (const side of fr.sides) ends.push({ fi, i, side, d: -Math.hypot(fr.xs[i] - C[0], fr.zs[i] - C[1]) }); });
  ends.sort((a, b) => a.d - b.d || a.fi - b.fi || a.i - b.i || a.side - b.side);
  // (and, failing those, anywhere along the frontages, furthest out first)
  fronts.forEach((fr, fi) => { for (let i = 6; i < fr.xs.length - 6; i += 5) for (const side of fr.sides) ends.push({ fi, i, side, d: 1e6 - Math.hypot(fr.xs[i] - C[0], fr.zs[i] - C[1]), late: true }); });
  for (const e of ends) {
    if (rec.barns.length >= nBarn || (e.late && rec.barns.length)) break;
    const [hw, hd] = sizeOf('barn', r(71 + rec.barns.length), r(73 + rec.barns.length));
    const pl = along(fronts[e.fi], e.i, e.side, 'barn', hw, hd, 3 + 3 * r(75), (r(76) - 0.5) * 0.3, 14);
    if (!pl) continue;
    const pc = add('barn', pl, { roof: r(77 + rec.barns.length) < thatchShare ? 'thatch' : 'shingle', timber: TIMBERS[1 + (rec.barns.length % 2)] });
    rec.barns.push(pc);
    // a haystack beside it
    const ca = Math.cos(pl.a), sa = Math.sin(pl.a);
    for (const sgn of [1, -1]) {
      const hx = pl.x + ca * sgn * (pl.R.hw + 3), hz = pl.z + sa * sgn * (pl.R.hw + 3);
      const HR = rect(hx, hz, pl.a, 2.0, 1.5);
      if (free(hx, hz, 2.0) && !rects.some((B) => overlaps(HR, B, 1.0)) && !env.built.some((B) => overlaps(HR, B, 1.0))) { pieces.push({ kind: 'haystack', at: [hx, hz], angle: pl.a, base: gAt(hx, hz), seed: 3200 + q * 3 + rec.barns.length }); rects.push(HR); break; }
    }
  }

  // (still none: a barn out behind the houses, facing the centre)
  for (let t = 0; t < 120 && !rec.barns.length; t++) {
    const [hw, hd] = sizeOf('barn', r(71), r(73));
    const far = Math.max(...houses.map((h) => Math.hypot(h.at[0] - C[0], h.at[1] - C[1])), 20);
    const a0 = hash2(t, 85, seed + q * 19) * TAU, d = far + 6 + 30 * hash2(t, 86, seed + q * 19);
    const x = C[0] + Math.cos(a0) * d, z = C[1] + Math.sin(a0) * d;
    const a = Math.atan2(-(C[0] - x), C[1] - z);
    const f = fit(x, z, a, hw, hd);
    if (!f) continue;
    rec.barns.push(add('barn', { x, z, a, ...f }, { roof: r(77) < thatchShare ? 'thatch' : 'shingle', timber: TIMBERS[1] }));
  }

  // ---- the jetty (the shore village) -------------------------------------------------
  // from the shore out into the water, along the way to it; slid along the
  // shore if need be until its foot is clear of every building
  if (pattern === 'shore' && water) {
    const nx = water.dir[0], nz = water.dir[1], tx = -nz, tz = nx;
    for (const slide of [0, 3, -3, 6, -6, 9, -9, 12, -12]) {
      let sx = water.x + tx * slide, sz = water.z + tz * slide;
      if (!wetAt(sx, sz)) continue;
      for (let s2 = 0; s2 < 20 && wetAt(sx, sz); s2++) { sx -= nx; sz -= nz; }
      let len = 0;
      for (let s2 = 1; s2 <= V.jetty[1]; s2++) { if (!wetAt(sx + nx * s2, sz + nz * s2)) break; len = s2; }
      if (len < V.jetty[0]) continue;
      const L = Math.min(len - 1, V.jetty[0] + (V.jetty[1] - V.jetty[0]) * r(80));
      const a0 = [sx - nx * 1.5, sz - nz * 1.5], b = [sx + nx * L, sz + nz * L];
      const JR = rect((a0[0] + b[0]) / 2, (a0[1] + b[1]) / 2, Math.atan2(nz, nx), (L + 1.5) / 2, K.jetty.width + 0.3);
      if (rects.some((B) => overlaps(JR, B, 1.0)) || env.built.some((B) => overlaps(JR, B, 1.0))) continue;
      // the bed under it: the deepest point along it
      let bed = Infinity;
      for (let s2 = 0; s2 <= L; s2 += 1) bed = Math.min(bed, gAt(sx + nx * s2, sz + nz * s2));
      const y = water.level + K.jetty.above;
      pieces.push({ kind: 'jetty', a: a0, b, y, bed, seed: 3300 + q });
      rec.jetty = { a: a0, b, y };
      rects.push(JR);
      const ex = b[0] - nx * 0.6 - nz * 0.55, ez = b[1] - nz * 0.6 + nx * 0.55;
      pieces.push({ kind: 'lantern', at: [ex, ez], base: y, phase: 4.1 + q });
      rec.lanterns.push([ex, ez, y]);
      break;
    }
  }

  // ---- lanterns at the centre, and a bench or two ---------------------------------------
  for (let t = 0; t < 2; t++) {
    // (looking further out if the centre is crowded: every village has two)
    const at = spot(C[0] + (t ? -4 : 4), C[1] + (t ? 3 : -3), 0.6, 30, 90 + t) || spot(C[0], C[1], 0.6, 60, 92 + t);
    if (!at) continue;
    const base = gAt(at[0], at[1]);
    pieces.push({ kind: 'lantern', at, base, phase: q * 2.3 + t });
    rects.push(rect(at[0], at[1], 0, 0.5, 0.5));
    rec.lanterns.push([at[0], at[1], base]);
  }
  for (let t = 0; t < 1 + (r(95) < 0.5 ? 1 : 0); t++) {
    const at = spot(C[0] + (t ? 6 : -6), C[1] + (t ? -5 : 5), 1.0, 30, 96 + t);
    if (!at) continue;
    const a = Math.atan2(C[1] - at[1], C[0] - at[0]) - Math.PI / 2;
    const BR = rect(at[0], at[1], a, 0.9, 0.4);
    if (rects.some((B) => overlaps(BR, B, 1.0)) || env.built.some((B) => overlaps(BR, B, 1.0))) continue;
    pieces.push({ kind: 'bench', at, angle: a, base: gAt(at[0], at[1]), seed: 3400 + q * 2 + t });
    rects.push(BR);
    // (phase 4a: where people sit)
    (rec.benches || (rec.benches = [])).push({ x: at[0], z: at[1], a, base: gAt(at[0], at[1]) });
  }

  // ---- the signpost where its road meets the main road -----------------------------------
  {
    const e = rd.n - 1, b = Math.max(0, e - 6);
    const tx = rd.x[e] - rd.x[b], tz = rd.z[e] - rd.z[b], tl = Math.hypot(tx, tz) || 1;
    // beside the junction, on the village road's side, 3.5 m back from it
    for (const sgn of [1, -1]) {
      const sx = rd.x[Math.max(0, e - 5)] - tz / tl * sgn * (ROAD_HALF + 1.2), sz = rd.z[Math.max(0, e - 5)] + tx / tl * sgn * (ROAD_HALF + 1.2);
      if (wetAt(sx, sz) || env.ways.clear(sx, sz, 8) < 0.4) continue;
      const toVillage = Math.atan2(-tz, -tx);
      // the main road's two ways at the junction
      const arms = [toVillage];
      const main = env.roads.find((o) => o !== rd && o.n && minDist(o, rd.x[e], rd.z[e]) < 6);
      if (main) {
        const m = nearestIndex(main, rd.x[e], rd.z[e]), m0 = Math.max(0, m - 8), m1 = Math.min(main.n - 1, m + 8);
        arms.push(Math.atan2(main.z[m1] - main.z[m], main.x[m1] - main.x[m]), Math.atan2(main.z[m0] - main.z[m], main.x[m0] - main.x[m]));
      }
      const base = gAt(sx, sz);
      pieces.push({ kind: 'signpost', at: [sx, sz], base, arms, seed: 3500 + q });
      rec.signpost = { x: sx, z: sz, y: base };
      break;
    }
  }

  // (phase 4a) each house's windows a light group, so they can be lit
  // while someone inside is awake (people/people.js uses the same numbers)
  houses.forEach((h, k) => { h.group = 1 + q * 32 + k; });
  rec.houses = houses.map((h) => ({ kind: h.kind, x: h.at[0], z: h.at[1], a: h.angle, w: h.w, d: h.d, floor: h.floor, enter: !!h.enter, lit: !!h.lit }));
  rec.enter = houses.filter((h) => h.enter).map((h) => {
    const ca = Math.cos(h.angle), sa = Math.sin(h.angle);
    return { x: h.at[0], z: h.at[1], a: h.angle, floor: h.floor, door: [h.at[0] - (h.d + 1.2) * sa, h.at[1] + (h.d + 1.2) * ca], w: h.w, d: h.d, kind: h.kind, side: h.hearthSide || 1 };
  });
  rec.chapel = rec.chapel ? { x: rec.chapel.at[0], z: rec.chapel.at[1], a: rec.chapel.angle, w: rec.chapel.w, d: rec.chapel.d, tower: rec.chapel.tower, floor: rec.chapel.floor } : null;
  rec.barns = rec.barns.map((b) => ({ x: b.at[0], z: b.at[1], a: b.angle, w: b.w, d: b.d, floor: b.floor }));
  rec.rects = rects.map((R) => [R.x, R.z, R.a, R.hw, R.hd]);
  rec.lanes = lanes.map((l) => ({ n: l.xs.length, x: l.xs.map((v) => Math.round(v * 100) / 100), z: l.zs.map((v) => Math.round(v * 100) / 100) }));
  // how far it reaches from its centre
  rec.radius = Math.max(20, ...rects.map((R) => Math.hypot(R.x - C[0], R.z - C[1]) + Math.max(R.hw, R.hd)));
  return { pieces, lanes, rects, rec };
}

function minDist(rd, x, z) { let b = Infinity; for (let q = 0; q < rd.n; q += 2) b = Math.min(b, Math.hypot(rd.x[q] - x, rd.z[q] - z)); return b; }
function nearestIndex(rd, x, z) { let b = 0, bd = Infinity; for (let q = 0; q < rd.n; q++) { const d = Math.hypot(rd.x[q] - x, rd.z[q] - z); if (d < bd) { bd = d; b = q; } } return b; }

// ---- the fields --------------------------------------------------------------------

// Blocks of strips round a village: each a rectangle turned along the lie of
// the land (its length along the contour), cut across into strips of crop,
// stubble and fallow; on gentle open ground, off the ways, the water, the
// stands and every building. Returns the blocks; `bounds` puts a fence or a
// wall along one or two of each block's sides, with a gate gap.
// (phase 4b) `more`: { have, want, tries, size, slopeK } asks for further
// blocks beside those already laid (`have`), for a village with too few to
// graze one: more candidates, smaller, on a little steeper ground.
export function planFields(q, rec, env, more = null) {
  const { H, N, kind, wetDist, F, thr, seed } = env, NN = N + 1;
  const r = (k) => hash2(q * 613 + k, 77, seed + 9301);
  const gAt = (x, z) => heightAt(H, N, x, z);
  const want = more ? more.want : V.fields[0] + Math.floor((V.fields[1] - V.fields[0] + 1) * r(1));
  const blocks = more ? more.have.slice() : [];
  const size = more ? more.size : 1, slope = V.fieldSlope * (more ? more.slopeK : 1), tries = more ? more.tries : 160;
  const C = [rec.centre.x, rec.centre.z];
  // just past the houses (the barns may stand further out)
  const ds = rec.houses.map((h) => Math.hypot(h.x - C[0], h.z - C[1])).sort((a, b) => a - b);
  const houseR = (ds.length ? ds[Math.floor(ds.length * 0.85)] : 30) + 12;
  // candidates: round the village first, then beside a block already laid
  // (fields lie side by side along the contour)
  const cands = [];
  // (asking for more: beside the blocks already laid first)
  if (more) for (const b of more.have) for (const side of [1, -1]) cands.push({ t: 5000 + b.id * 2 + (side > 0 ? 0 : 1), beside: { ...b, side } });
  for (let t = 0; t < tries; t++) cands.push({ t: more ? 1000 + t : t, beside: null });
  for (let ci = 0; ci < cands.length && blocks.length < want; ci++) {
    const { t, beside } = cands[ci];
    const L = (V.fieldL[0] + (V.fieldL[1] - V.fieldL[0]) * hash2(t, 4, seed + q * 41)) * size;
    const W = (V.fieldW[0] + (V.fieldW[1] - V.fieldW[0]) * hash2(t, 5, seed + q * 41)) * size;
    let cx, cz, ang;
    if (beside) {
      ang = beside.a;
      const off = beside.L + L + 5;
      cx = beside.x + beside.ca * off * beside.side; cz = beside.z + beside.sa * off * beside.side;
    } else {
      const a = hash2(t, 3, seed + q * 41) * TAU, ring = houseR + W + 4 + 70 * hash2(t, 2, seed + q * 41) * hash2(t, 8, seed + q * 41);
      cx = C[0] + Math.cos(a) * ring; cz = C[1] + Math.sin(a) * ring;
      // along the contour: across the slope here
      const e = 6, gx = (gAt(cx + e, cz) - gAt(cx - e, cz)) / (2 * e), gz = (gAt(cx, cz + e) - gAt(cx, cz - e)) / (2 * e);
      ang = Math.hypot(gx, gz) > 1e-4 ? Math.atan2(gz, gx) + Math.PI / 2 : a + Math.PI / 2;
    }
    if (cx < 60 || cz < 60 || cx > N - 60 || cz > N - 60) continue;
    const R = rect(cx, cz, ang, L, W);
    let ok = true;
    for (const [px, pz] of over(R, 2, 4)) {
      const i = Math.round(px), k = Math.round(pz);
      if (i < 1 || k < 1 || i >= N || k >= N) { ok = false; break; }
      const j = k * NN + i;
      if (kind[j] !== KIND.NONE || wetDist[j] < 6) { ok = false; break; }
      const f = fieldOf(F, px, pz);
      if (f === f && f > thr - 0.06) { ok = false; break; }
      // gentle ground only
      const sx = (gAt(px + 2, pz) - gAt(px - 2, pz)) / 4, sz = (gAt(px, pz + 2) - gAt(px, pz - 2)) / 4;
      if (Math.hypot(sx, sz) > slope) { ok = false; break; }
      if (env.ways.clear(px, pz, 12) < 3) { ok = false; break; }
      if (env.cleared.some((p) => inPoly(p, px, pz))) { ok = false; break; }
    }
    if (!ok) continue;
    if (env.built.some((B) => overlaps(R, B, 5))) continue;
    if (env.fields.some((B) => overlaps(R, B, 4))) continue;
    // the strips: across the block (along w), each V.strip wide
    const strips = [];
    let w0 = -W;
    let s = 0;
    while (w0 < W - 1) {
      const sw = Math.min(W - w0, V.strip[0] + (V.strip[1] - V.strip[0]) * hash2(t * 31 + s, 6, seed + q * 41));
      const kt = hash2(t * 31 + s, 7, seed + q * 41);
      strips.push({ w0, w1: w0 + sw, kind: kt < 0.45 ? 1 : kt < 0.75 ? 2 : 3 });
      w0 += sw; s++;
    }
    // (a last sliver joins the strip before it)
    if (strips.length > 1 && strips[strips.length - 1].w1 - strips[strips.length - 1].w0 < V.strip[0] * 0.6) { const l = strips.pop(); strips[strips.length - 1].w1 = l.w1; }
    const count = [0, 0, 0, 0];
    for (const st of strips) count[st.kind] += st.w1 - st.w0;
    const main = count.indexOf(Math.max(count[1], count[2], count[3]));
    const blk = { ...R, L, W, strips, main, id: env.fields.length, village: q };
    blocks.push(blk);
    env.fields.push(R);
    // try its neighbours along the contour next
    for (const side of [1, -1]) cands.splice(ci + 1, 0, { t: t * 7 + 1000 + (side > 0 ? 1 : 2), beside: { ...blk, side } });
  }
  return blocks;
}
function fieldOf(F, x, z) {
  const i = Math.round(x / CG), k = Math.round(z / CG), nn = F.nn || Math.round(Math.sqrt(F.ff.length));
  if (i < 0 || k < 0 || i >= nn || k >= nn) return NaN;
  return F.ff[k * nn + i];
}

// The fences and walls round a block: along the one or two sides nearest
// the village, each with a gate gap in its middle (its post points, as the
// pieces want them). Returns { pieces, gates: [[x, z]] }.
// (phase 4b) `all`: fenced on every side (a pasture, so its flock or herd
// stays in), with its one gate still on the side nearest the village.
export function boundField(blk, rec, env, style, all = false) {
  const { H, N, seed } = env;
  const gAt = (x, z) => heightAt(H, N, x, z);
  const pieces = [], gates = [];
  const sides = [];
  // the four sides: [u0, w0] -> [u1, w1], with the outward normal
  const L = blk.L + 1, W = blk.W + 1;
  for (const [a, b, n] of [[[-L, W], [L, W], [0, 1]], [[L, -W], [-L, -W], [0, -1]], [[L, W], [L, -W], [1, 0]], [[-L, -W], [-L, W], [-1, 0]]]) {
    const mx = (a[0] + b[0]) / 2, mw = (a[1] + b[1]) / 2;
    const X = blk.x + mx * blk.ca - mw * blk.sa, Z = blk.z + mx * blk.sa + mw * blk.ca;
    sides.push({ a, b, d: Math.hypot(X - rec.centre.x, Z - rec.centre.z) });
  }
  sides.sort((p, q) => p.d - q.d);
  const n = all ? 4 : 1 + (hash2(blk.id, 9, seed + 77) < 0.5 ? 1 : 0);
  const step = style === 'fence' ? K.fence.span : K.drystone.piece;
  sides.slice(0, n).forEach((sd, si) => {
    const toW = (u, w) => [blk.x + u * blk.ca - w * blk.sa, blk.z + u * blk.sa + w * blk.ca];
    const len = Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1]);
    const gap = K.fence.gate;
    const run = (t0, t1) => {
      const pts = [];
      const m = Math.max(1, Math.round((t1 - t0) / step));
      for (let i = 0; i <= m; i++) {
        const t = t0 + (t1 - t0) * i / m;
        const u = sd.a[0] + (sd.b[0] - sd.a[0]) * t / len, w = sd.a[1] + (sd.b[1] - sd.a[1]) * t / len;
        const [x, z] = toW(u, w);
        pts.push([x, z, gAt(x, z)]);
      }
      return pts;
    };
    const ang = Math.atan2(sd.b[1] - sd.a[1], sd.b[0] - sd.a[0]) + blk.a;
    // (a pasture's other sides have a gap at the middle too, so two
    // pastures side by side never close each other's gate; only the first
    // is its gate for people)
    const g0 = len / 2 - gap / 2, g1 = len / 2 + gap / 2;
    if (all && si > 0) {
      pieces.push({ kind: style, pts: run(0, g0), angle: ang, seed: 3600 + blk.id * 8 + si * 2 });
      pieces.push({ kind: style, pts: run(g1, len), angle: ang, seed: 3601 + blk.id * 8 + si * 2 });
      return;
    }
    const A = run(0, g0), B = run(g1, len);
    pieces.push({ kind: style, pts: A, angle: ang, seed: 3600 + blk.id * 8 + si * 2 });
    pieces.push({ kind: style, pts: B, angle: ang, seed: 3601 + blk.id * 8 + si * 2 });
    if (style === 'fence') pieces.push({ kind: 'gateposts', pts: [A[A.length - 1], B[0]], angle: ang, seed: 3650 + blk.id });
    // the gate gap, a little outside
    const gu = (sd.a[0] + sd.b[0]) / 2, gw = (sd.a[1] + sd.b[1]) / 2;
    const out = Math.hypot(gu, gw) || 1;
    gates.push(toW(gu + gu / out * 2.5, gw + gw / out * 2.5));
  });
  return { pieces, gates };
}

// The fields into the ground's arrays: wField (how much of a node is
// field, 0..255) and fieldKind (1 crop, 2 stubble, 3 fallow), and the
// blocks' table for the furrows (their angle, their main kind).
export function layFields(N, blocks) {
  const NN = N + 1, wField = new Uint8Array(NN * NN), fieldKind = new Uint8Array(NN * NN), fieldId = new Uint8Array(NN * NN);
  for (const b of blocks) {
    const R = Math.hypot(b.L, b.W) + 2;
    for (let z = Math.max(0, Math.floor(b.z - R)); z <= Math.min(N, Math.ceil(b.z + R)); z++) {
      for (let x = Math.max(0, Math.floor(b.x - R)); x <= Math.min(N, Math.ceil(b.x + R)); x++) {
        const dx = x - b.x, dz = z - b.z, u = dx * b.ca + dz * b.sa, w = -dx * b.sa + dz * b.ca;
        const e = Math.min(b.L - Math.abs(u), b.W - Math.abs(w));
        if (e < -0.6) continue;
        const cov = Math.max(0, Math.min(1, (e + 0.6) / 1.2));
        const j = z * NN + x, v = Math.round(255 * cov);
        if (v <= wField[j]) continue;
        wField[j] = v;
        const st = b.strips.find((s) => w >= s.w0 && w < s.w1) || (w < 0 ? b.strips[0] : b.strips[b.strips.length - 1]);
        fieldKind[j] = st.kind;
        fieldId[j] = b.id + 1;
      }
    }
  }
  // per block: cos, sin of its angle (the furrows run along u), its main kind
  const table = new Float32Array(Math.max(1, blocks.length) * 4);
  blocks.forEach((b) => { table[b.id * 4] = b.ca; table[b.id * 4 + 1] = b.sa; table[b.id * 4 + 2] = b.main; table[b.id * 4 + 3] = (b.strips.length ? 2 * b.W / b.strips.length : 8); });
  return { wField, fieldKind, fieldId, fieldTable: table };
}

// ---- footpaths ---------------------------------------------------------------------

// A footpath from the village's centre to each target, found as the roads
// are but narrow and on a finer (2 m) grid round the village and its
// targets: steeper ground allowed, a shallow river forded, other water
// refused, and every building, fence, wall and the fort kept clear by a
// margin wide enough that a straight step between two clear points cannot
// clip one. Each path leaves from the centre or from a path laid before it,
// nearest targets first. Returns lines of points a metre apart.
const PG = 2, PATH_CLEAR = 1.9;
export function planPaths(rec, targets, env) {
  const { H, N, kind, level } = env, NN = N + 1;
  const C = [rec.centre.x, rec.centre.z];
  const tg = targets.filter((t) => Math.hypot(t[0] - C[0], t[1] - C[1]) < 700);
  if (!tg.length) return [];
  let x0 = C[0], x1 = C[0], z0 = C[1], z1 = C[1];
  for (const t of tg) { x0 = Math.min(x0, t[0]); x1 = Math.max(x1, t[0]); z0 = Math.min(z0, t[1]); z1 = Math.max(z1, t[1]); }
  x0 = Math.max(2, Math.floor((x0 - 40) / PG) * PG); z0 = Math.max(2, Math.floor((z0 - 40) / PG) * PG);
  x1 = Math.min(N - 2, x1 + 40); z1 = Math.min(N - 2, z1 + 40);
  const nx = Math.floor((x1 - x0) / PG) + 1, nz = Math.floor((z1 - z0) / PG) + 1, cells = nx * nz;
  const h = new Float32Array(cells), pen = new Float32Array(cells).fill(1);
  const X = (c) => x0 + (c % nx) * PG, Z = (c) => z0 + Math.floor(c / nx) * PG;
  for (let c = 0; c < cells; c++) {
    const x = X(c), z = Z(c), j = Math.round(z) * NN + Math.round(x);
    h[c] = kind[j] === KIND.NONE ? H[j] : level[j];
    if (kind[j] === KIND.RIVER) pen[c] = level[j] - H[j] <= SCALE.river.ford ? 6 : Infinity;
    else if (kind[j] !== KIND.NONE) pen[c] = Infinity;
    else if (env.cleared.some((pl) => inPoly(pl, x, z))) pen[c] = Infinity;
  }
  const block = (bx0, bz0, bx1, bz1, test) => {
    for (let k = Math.max(0, Math.floor((bz0 - z0) / PG)); k <= Math.min(nz - 1, Math.ceil((bz1 - z0) / PG)); k++)
      for (let i = Math.max(0, Math.floor((bx0 - x0) / PG)); i <= Math.min(nx - 1, Math.ceil((bx1 - x0) / PG)); i++) {
        const c = k * nx + i;
        if (pen[c] !== Infinity && test(x0 + i * PG, z0 + k * PG)) pen[c] = Infinity;
      }
  };
  const inR = (B, pad) => (x, z) => { const dx = x - B.x, dz = z - B.z; return Math.abs(dx * B.ca + dz * B.sa) < B.hw + pad && Math.abs(-dx * B.sa + dz * B.ca) < B.hd + pad; };
  const near = (f, pad) => (x, z) => { const ex = f[2] - f[0], ez = f[3] - f[1], L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - f[0]) * ex + (z - f[1]) * ez) / L2)); return Math.hypot(x - f[0] - ex * t, z - f[1] - ez * t) < pad; };
  for (const B of env.built) { const e = Math.hypot(B.hw, B.hd) + PATH_CLEAR; block(B.x - e, B.z - e, B.x + e, B.z + e, inR(B, PATH_CLEAR)); }
  for (const B of env.fields) { const e = Math.hypot(B.hw, B.hd) + PATH_CLEAR; block(B.x - e, B.z - e, B.x + e, B.z + e, inR(B, 0.5)); }
  // (a signpost's arms reach out over the ground: kept clear of by its reach)
  for (const [x, z] of env.posts || []) block(x - 3, z - 3, x + 3, z + 3, (px, pz) => Math.hypot(px - x, pz - z) < 0.9 + PATH_CLEAR);
  for (const f of env.fences || []) block(Math.min(f[0], f[2]) - 2, Math.min(f[1], f[3]) - 2, Math.max(f[0], f[2]) + 2, Math.max(f[1], f[3]) + 2, near(f, PATH_CLEAR));
  const free = (c) => c >= 0 && c < cells && pen[c] !== Infinity;
  // the nearest clear node to a point
  const nodeNear = (x, z, reach = 12) => {
    const i0 = Math.round((x - x0) / PG), k0 = Math.round((z - z0) / PG);
    let best = -1, bd = Infinity;
    const r = Math.ceil(reach / PG);
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, k = k0 + dk;
      if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const c = k * nx + i, d = Math.hypot(di, dk);
      if (free(c) && d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const c0 = nodeNear(C[0], C[1], 16);
  if (c0 < 0) return [];
  const net = new Set([c0]);
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const out = [];
  const order = tg.slice().sort((a, b) => Math.hypot(a[0] - C[0], a[1] - C[1]) - Math.hypot(b[0] - C[0], b[1] - C[1]));
  for (const t of order) {
    const c1 = nodeNear(t[0], t[1], 8);
    if (c1 < 0 || net.has(c1)) continue;
    let path = null;
    for (const steep of [0.14, 0.2, 0.28]) {
      const dist = new Float64Array(cells).fill(Infinity), prev = new Int32Array(cells).fill(-1);
      const heap = new MinHeap(4096);
      for (const c of net) { dist[c] = 0; heap.push(c, 0); }
      let hit = false;
      while (heap.size) {
        const d = heap.topKey(), c = heap.pop();
        if (d > dist[c]) continue;
        if (c === c1) { hit = true; break; }
        const ci = c % nx, ck = (c - ci) / nx;
        for (const [di, dk] of NB) {
          const i = ci + di, k = ck + dk;
          if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
          const m = k * nx + i;
          if (!free(m)) continue;
          // (a diagonal step only where both its sides are clear)
          if (di && dk && (!free(ck * nx + i) || !free(k * nx + ci))) continue;
          const L = PG * Math.hypot(di, dk), sl = Math.abs(h[m] - h[c]) / L;
          if (sl > steep) continue;
          const nd = d + L * (pen[m] + 200 * sl * sl);
          if (nd < dist[m]) { dist[m] = nd; prev[m] = c; heap.push(m, nd); }
        }
      }
      if (hit) { path = []; for (let c = c1; c >= 0; c = prev[c]) path.push(c); break; }
    }
    if (!path || path.length < 3) continue;
    for (const c of path) net.add(c);
    // the nodes' points, smoothed where the smoothed point is still clear,
    // then a point a metre
    const P = path.map((c) => [X(c), Z(c)]);
    const clearAt = (x, z) => { const c = nodeNear(x, z, 0.1); return c >= 0 && Math.hypot(X(c) - x, Z(c) - z) < PG; };
    let Q = P.map((p) => p.slice());
    for (let pass = 0; pass < 3; pass++) {
      const R2 = Q.map((p) => p.slice());
      for (let q = 1; q < Q.length - 1; q++) {
        const mx = (Q[q - 1][0] + 2 * Q[q][0] + Q[q + 1][0]) / 4, mz = (Q[q - 1][1] + 2 * Q[q][1] + Q[q + 1][1]) / 4;
        if (clearAt(mx, mz) && clearPt(mx, mz)) R2[q] = [mx, mz];
      }
      Q = R2;
    }
    const xs = [], zs = [];
    for (let q = 0; q + 1 < Q.length; q++) {
      const [ax, az] = Q[q], [bx, bz] = Q[q + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L));
      for (let s = 0; s < n; s++) { xs.push(ax + (bx - ax) * s / n); zs.push(az + (bz - az) * s / n); }
    }
    xs.push(Q[Q.length - 1][0]); zs.push(Q[Q.length - 1][1]);
    out.push({ to: t[2], n: xs.length, x: Float32Array.from(xs), z: Float32Array.from(zs) });
  }
  return out;
  // (a smoothed point must keep its distance from every building and fence too)
  function clearPt(x, z) {
    for (const B of env.built) if (inR(B, PATH_CLEAR - 0.6)(x, z)) return false;
    for (const f of env.fences || []) if (near(f, PATH_CLEAR - 0.6)(x, z)) return false;
    return true;
  }
}

// ---- pastures and folds (phase 4b) ----------------------------------------------------

// Which of a village's field blocks become pasture (all grass, fenced all
// round): one, or two in a village of more than a dozen houses, nearest its
// barn (or its centre); and, at a village by water, a field for its cattle,
// the block nearest the water. Marks the blocks; returns their ids.
export function choosePastures(q, rec, blocks, water, cattle) {
  if (blocks.length < 2) return { sheep: [], cattle: null };
  const A = rec.barns[0] ? [rec.barns[0].x, rec.barns[0].z] : [rec.centre.x, rec.centre.z];
  const byNear = blocks.slice().sort((a, b) => Math.hypot(a.x - A[0], a.z - A[1]) - Math.hypot(b.x - A[0], b.z - A[1]) || a.id - b.id);
  const want = Math.min(blocks.length - 1, rec.houses.length > 12 ? 2 : 1);
  const sheep = byNear.slice(0, want);
  let cow = null;
  if (cattle && water && blocks.length - want >= 2) {
    const rest = blocks.filter((b) => !sheep.includes(b));
    cow = rest.sort((a, b) => Math.hypot(a.x - water.x, a.z - water.z) - Math.hypot(b.x - water.x, b.z - water.z) || a.id - b.id)[0];
  }
  for (const b of [...sheep, ...(cow ? [cow] : [])]) { b.pasture = b === cow ? 'cattle' : 'sheep'; b.main = 4; for (const st of b.strips) st.kind = 4; }
  return { sheep: sheep.map((b) => b.id), cattle: cow ? cow.id : null };
}

// A fold for a flock: a small square of fence pieces beside a barn (or, if
// there is no room, in the pasture's corner by its gate), its gate facing
// the pasture's. Returns { rect, pieces, gate (outside), inside } or null.
export function planFold(q, k, rec, pas, gate, env) {
  const { H, N, kind, seed } = env, NN = N + 1;
  const F = SCALE.animals.fold, gAt = (x, z) => heightAt(H, N, x, z);
  const wetAt = (x, z) => { const i = Math.round(x), kk = Math.round(z); return i < 0 || kk < 0 || i > N || kk > N || kind[kk * NN + i] !== KIND.NONE; };
  const tryAt = (x, z, a) => {
    const R = rect(x, z, a, F.hw, F.hd);
    if (env.ways.clear(x, z, 16) < Math.hypot(F.hw, F.hd) + 1.5) return null;
    for (const B of env.built) if (overlaps(R, B, 2)) return null;
    for (const B of env.fields) if (overlaps(R, B, 1.5)) return null;
    let lo = Infinity, hi = -Infinity;
    for (const [px, pz] of over(R, 0, 1)) { if (wetAt(px, pz)) return null; const g = gAt(px, pz); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    return hi - lo < F.fall ? R : null;
  };
  let R = null;
  const anchors = rec.barns.length ? rec.barns.map((b) => [b.x, b.z, b.a, Math.hypot(b.w, b.d)]) : [];
  anchors.push([gate[0], gate[1], pas.a, 2]);
  outer: for (const [ax, az, aa, ar] of anchors) {
    for (const d of [ar + F.hw + 3, ar + F.hw + 6, ar + F.hw + 9]) {
      for (let t = 0; t < 12; t++) {
        const ang = aa + t * Math.PI / 6 + hash2(q * 7 + k, t, seed + 9611) * 0.3;
        R = tryAt(ax + Math.cos(ang) * d, az + Math.sin(ang) * d, aa);
        if (R) break outer;
      }
    }
  }
  // (no room: the pasture's corner nearest its gate, inside it)
  let inside = false;
  if (!R) {
    const L = pas.L - F.hw - 1.5, W = pas.W - F.hd - 1.5;
    let best = null;
    for (const [su, sw] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = pas.x + su * L * pas.ca - sw * W * pas.sa, z = pas.z + su * L * pas.sa + sw * W * pas.ca;
      const d = Math.hypot(x - gate[0], z - gate[1]);
      if (!best || d < best[0]) best = [d, x, z];
    }
    R = rect(best[1], best[2], pas.a, F.hw, F.hd); inside = true;
  }
  // the four sides; the gate on the one facing the pasture's gate
  const to = inside ? [pas.x, pas.z] : gate;
  const sides = [[[-1, 1], [1, 1], [0, 1]], [[1, -1], [-1, -1], [0, -1]], [[1, 1], [1, -1], [1, 0]], [[-1, -1], [-1, 1], [-1, 0]]];
  const W2 = (u, w) => [R.x + u * R.ca - w * R.sa, R.z + u * R.sa + w * R.ca];
  let gs = 0, bd = -Infinity;
  sides.forEach(([, , n], i) => { const [ox, oz] = W2(n[0] * F.hw, n[1] * F.hd); const dd = ((to[0] - R.x) * (ox - R.x) + (to[1] - R.z) * (oz - R.z)) / (Math.hypot(ox - R.x, oz - R.z) || 1); if (dd > bd) { bd = dd; gs = i; } });
  const pieces = [];
  let gateOut = null, gateIn = null;
  sides.forEach(([a, b, n], i) => {
    const A = [a[0] * F.hw, a[1] * F.hd], B = [b[0] * F.hw, b[1] * F.hd], len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const run = (t0, t1) => {
      const pts = [], m = Math.max(1, Math.round((t1 - t0) / K.fence.span));
      for (let j = 0; j <= m; j++) { const t = t0 + (t1 - t0) * j / m, u = A[0] + (B[0] - A[0]) * t / len, w = A[1] + (B[1] - A[1]) * t / len, [x, z] = W2(u, w); pts.push([x, z, gAt(x, z)]); }
      return pts;
    };
    const ang = Math.atan2(B[1] - A[1], B[0] - A[0]) + R.a, sd = 3700 + q * 40 + k * 10 + i * 2;
    if (i !== gs) { pieces.push({ kind: 'fence', pts: run(0, len), angle: ang, seed: sd }); return; }
    const g0 = len / 2 - F.gate / 2, g1 = len / 2 + F.gate / 2, P0 = run(0, g0), P1 = run(g1, len);
    pieces.push({ kind: 'fence', pts: P0, angle: ang, seed: sd }, { kind: 'fence', pts: P1, angle: ang, seed: sd + 1 });
    pieces.push({ kind: 'gateposts', pts: [P0[P0.length - 1], P1[0]], angle: ang, seed: sd + 2 });
    const mu = (A[0] + B[0]) / 2, mw = (A[1] + B[1]) / 2, l = Math.hypot(mu, mw) || 1;
    gateOut = W2(mu + mu / l * 2.2, mw + mw / l * 2.2); gateIn = W2(mu - mu / l * 1.6, mw - mw / l * 1.6);
  });
  return { rect: R, pieces, gate: gateOut, gateIn, inside };
}
