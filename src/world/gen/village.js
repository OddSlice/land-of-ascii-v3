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
//
// The fields are laid in fields.js, the footpaths in paths.js, the pastures
// and folds in pastures.js; what is where, for placing, in placing.js.
import { SCALE } from '../scale.js';
import { hash2 } from '../noise.js';
import { KIND } from './water.js';
import { heightAt } from './sites.js';
import { inPoly } from './fort.js';
import { MAT } from '../../contract.js';
import { rect, overlaps, over } from './placing.js';

export { Ways } from './placing.js';
export { planFields, boundField, layFields } from './fields.js';
export { planPaths } from './paths.js';
export { choosePastures, planFold } from './pastures.js';

const K = SCALE.kit, V = SCALE.village;
const TAU = Math.PI * 2;
const ROAD_HALF = SCALE.road.width / 2, LANE_HALF = V.lane / 2;
const WALLS = [MAT.PLASTER, MAT.PLASTER2, MAT.PLASTER3], TIMBERS = [MAT.TIMBER, MAT.TIMBER2, MAT.TIMBER3];

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
