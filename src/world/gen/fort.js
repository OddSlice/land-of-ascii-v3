// The fort (phase 3a), built from the kit (src/world/kit-pieces.js) by rules
// that fit it to its site rather than stamping one plan:
// - a courtyard closed by curtain walls between four to six towers, square
//   and round mixed, its shape, size and proportions from the seed;
// - its gate in the side facing where the road arrives, so the road runs
//   straight on through the passage into the yard;
// - the keep against the far wall, one or two timber houses and a well in
//   the yard, stone stairs up to the wall walk in two or three places,
//   torches at the gate, in the passage, in the yard and on the walk, lit
//   windows in the keep and the towers;
// - the ground: the courtyard and the walls' feet levelled to one height
//   (the median of the ground there, so as little is moved as possible),
//   gentle earth banks round it where it cuts or fills, and an approach
//   graded no steeper than the roads' limit from the road to the gate;
// - trees cleared from the fort and a margin round it.
// Everything is a pure function of the seed and the land.
import { hash2, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';
import { KIND } from './water.js';
import { ZONE_OUT, ZONE_YARD } from '../kit.js';
import { towerInside } from '../kit-pieces.js';
import { MinHeap } from './heap.js';

const K = SCALE.kit, W = K.wall;
const TAU = Math.PI * 2;

// ---- small geometry ---------------------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const len = (a) => Math.hypot(a[0], a[1]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
  return len(sub(p, lerp2(a, b, t)));
}
// distance from a point to a polygon's outline (0 inside... see `signed`)
export function polyDist(poly, x, z) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist([x, z], poly[i], poly[(i + 1) % poly.length]));
  return inPoly(poly, x, z) ? -d : d;
}
// a convex polygon (counter-clockwise or not) moved out by d (in, if d < 0)
export function offsetPoly(poly, d) {
  const n = poly.length, c = poly.reduce((s, p) => add(s, p), [0, 0]).map((v) => v / n);
  const lines = poly.map((p, i) => {
    const q = poly[(i + 1) % n], e = norm(sub(q, p));
    let nrm = [e[1], -e[0]];
    const mid = lerp2(p, q, 0.5);
    if ((mid[0] - c[0]) * nrm[0] + (mid[1] - c[1]) * nrm[1] < 0) nrm = mul(nrm, -1);
    return { p: add(p, mul(nrm, d)), e };
  });
  return lines.map((L, i) => {
    const M = lines[(i + n - 1) % n];
    // intersect M (point M.p, dir M.e) with L
    const den = M.e[0] * L.e[1] - M.e[1] * L.e[0];
    if (Math.abs(den) < 1e-9) return L.p;
    const t = ((L.p[0] - M.p[0]) * L.e[1] - (L.p[1] - M.p[1]) * L.e[0]) / den;
    return add(M.p, mul(M.e, t));
  });
}

// ---- the plan ------------------------------------------------------------------------

// `site`: the fort site (its centre); `arrive`: where the road reaches the
// fort's surroundings ([x, z]), and its heading there (unit, toward the
// fort); `H`, `kind`: the land; `base`: the platform's height, if not the
// ground's median under it.
export function planFort({ H, N, kind, wetDist, site, arrive, seed, base: given }) {
  const NN = N + 1, r = (q) => hash2(q, 17, seed + 3301);
  const C = [site.x, site.z];
  const gd = Math.atan2(arrive[1] - C[1], arrive[0] - C[0]);
  // the shape: n towers round an ellipse, the gate side straddling the road's way in
  let n = 4 + Math.floor(r(1) * 2.999);
  let R0 = 25 + 9 * r(2);
  const aspect = 1 + 0.32 * r(3), axis = r(4) * Math.PI;
  // (no water under the fort, its banks or a few metres round: every node
  // of the land's distance to water, over a circle round the plan)
  const wetNear = (R) => {
    for (let k = -R; k <= R; k += 1) for (let i = -R; i <= R; i += 1) {
      if (i * i + k * k > R * R) continue;
      const x = Math.round(C[0] + i), z = Math.round(C[1] + k);
      if (x < 2 || z < 2 || x > N - 2 || z > N - 2) return true;
      const j = z * NN + x;
      if (kind[j] !== KIND.NONE || (wetDist && wetDist[j] < 3)) return true;
    }
    return false;
  };
  let poly;
  for (let tries = 0; tries < 12; tries++) {
    poly = [];
    for (let k = 0; k < n; k++) {
      const gateSide = k === 0 || k === n - 1;
      const jit = (r(10 + k) - 0.5) * (gateSide ? 0.06 : 0.3) * TAU / n;
      const th = gd + (k + 0.5) * TAU / n + jit;
      const ca = Math.cos(th - axis), sa = Math.sin(th - axis);
      const ell = 1 / Math.sqrt((ca / aspect) ** 2 + sa * sa);
      const rr = R0 * ell * (0.94 + 0.12 * r(20 + k)) / Math.sqrt(aspect);
      poly.push([C[0] + Math.cos(th) * rr, C[1] + Math.sin(th) * rr]);
    }
    const edges = poly.map((p, i) => len(sub(poly[(i + 1) % n], p)));
    const reach = Math.max(...poly.map((p) => len(sub(p, C))));
    // the gate side long enough for the gate, every side for a wall and a stair
    const wet = wetNear(Math.ceil(reach + 14));
    if (edges[n - 1] >= 27 && Math.min(...edges) >= 21 && !wet) break;
    if (wet) R0 = Math.max(17, R0 * 0.88);
    else R0 *= 1.07;
    if (tries === 8 && n > 4) n--;
  }
  const edges = poly.map((p, i) => ({ a: p, b: poly[(i + 1) % n], i }));
  // which way is out from each side
  for (const e of edges) {
    const d = norm(sub(e.b, e.a)), mid = lerp2(e.a, e.b, 0.5);
    let out = [d[1], -d[0]];
    if ((mid[0] - C[0]) * out[0] + (mid[1] - C[1]) * out[1] < 0) out = mul(out, -1);
    e.d = d; e.out = out; e.mid = mid; e.L = len(sub(e.b, e.a));
    // the kit's `out`: +1 if outside lies to the left of a -> b (local +w)
    e.side = (-d[1]) * out[0] + d[0] * out[1] > 0 ? 1 : -1;
  }
  const gateEdge = edges[n - 1];
  // the platform: the median ground under the courtyard and the walls
  const foot = offsetPoly(poly, W.thick / 2 + 1);
  const hs = [];
  const bx0 = Math.floor(Math.min(...foot.map((p) => p[0]))), bx1 = Math.ceil(Math.max(...foot.map((p) => p[0])));
  const bz0 = Math.floor(Math.min(...foot.map((p) => p[1]))), bz1 = Math.ceil(Math.max(...foot.map((p) => p[1])));
  for (let z = bz0; z <= bz1; z += 2) for (let x = bx0; x <= bx1; x += 2) if (inPoly(foot, x, z)) hs.push(H[z * NN + x]);
  hs.sort((p, q) => p - q);
  const median = Math.round(hs[Math.floor(hs.length / 2)] * 10) / 10, base = given ?? median;

  const pieces = [];
  // towers at the corners, square and round mixed (at least one of each)
  const round = poly.map((_, k) => r(40 + k) < 0.5);
  if (round.every(Boolean)) round[Math.floor(r(48) * n)] = false;
  if (!round.some(Boolean)) round[Math.floor(r(49) * n)] = true;
  const towers = poly.map((p, k) => {
    const prev = poly[(k + n - 1) % n], next = poly[(k + 1) % n];
    const size = round[k] ? K.tower.round[0] + (K.tower.round[1] - K.tower.round[0]) * r(50 + k) : K.tower.square[0] + (K.tower.square[1] - K.tower.square[0]) * r(60 + k);
    const inward = Math.atan2(C[1] - p[1], C[0] - p[0]);
    const walls = [Math.atan2(prev[1] - p[1], prev[0] - p[0]), Math.atan2(next[1] - p[1], next[0] - p[0])];
    return { at: p, size, round: round[k], inward, walls };
  });
  // (phase 3b: the first square tower's ground floor furnished; phase 5b:
  // every tower's, as the houses are)
  // (the first square tower's furniture where it always was; the others'
  // added late, src/world/kit.js)
  const furnished = towers.findIndex((t) => !t.round);
  towers.forEach((t, k) => pieces.push({ kind: 'tower', shape: t.round ? 'round' : 'square', at: t.at, size: t.size, base, inward: t.inward, walls: t.walls, seed: 2000 + k * 37, furnish: k === furnished ? true : 'late' }));
  // the curtain walls, from tower to tower: each runs on to the towers'
  // middles, with the towers' insides cut out of it, so it meets a tower
  // cleanly at any angle
  const G = K.gate;
  const gateAt = gateEdge.mid, gateAngle = Math.atan2(gateEdge.d[1], gateEdge.d[0]);
  const insides = towers.map((t) => towerInside({ shape: t.round ? 'round' : 'square', at: t.at, size: t.size, base, inward: t.inward, walls: t.walls }));
  // (round towers: the walls stop at the tower's face, their ends' corners
  // just inside it, so they keep clear of its door)
  const endAt = (t) => (t.round ? Math.sqrt(Math.max(0, t.size * t.size - (W.thick / 2) ** 2)) - 0.08 : 0);
  for (const e of edges) {
    const ia = insides[e.i], ib = insides[(e.i + 1) % n];
    const A = add(e.a, mul(e.d, endAt(towers[e.i]))), B = sub(e.b, mul(e.d, endAt(towers[(e.i + 1) % n])));
    if (e === gateEdge) {
      const ga = sub(gateAt, mul(e.d, G.length / 2 - 0.3)), gb = add(gateAt, mul(e.d, G.length / 2 - 0.3));
      pieces.push({ kind: 'wall', a: A, b: ga, base, out: e.side, seed: 3000 + e.i * 11, cuts: [ia] });
      pieces.push({ kind: 'wall', a: gb, b: B, base, out: e.side, seed: 3005 + e.i * 11, cuts: [ib] });
    } else pieces.push({ kind: 'wall', a: A, b: B, base, out: e.side, seed: 3000 + e.i * 11, cuts: [ia, ib] });
  }
  pieces.push({ kind: 'gate', at: gateAt, angle: gateAngle, base, out: gateEdge.side, seed: 3500 });
  const gOut = gateEdge.out;
  const gateFront = add(gateAt, mul(gOut, G.depth / 2 + 1.5));
  const gateIn = sub(gateAt, mul(gOut, G.depth / 2 + 1.5));
  // the keep, against the side opposite the gate
  let far = edges[0], fd = -Infinity;
  for (const e of edges) { if (e === gateEdge) continue; const d = -(e.out[0] * gOut[0] + e.out[1] * gOut[1]) + 0.002 * e.L; if (d > fd) { fd = d; far = e; } }
  const kd = K.keep.d[0] + (K.keep.d[1] - K.keep.d[0]) * r(70);
  let kw = K.keep.w[0] + (K.keep.w[1] - K.keep.w[0]) * r(71);
  kw = Math.min(kw, (far.L - towers[far.i].size - towers[(far.i + 1) % n].size - 3) / 2);
  const keepAt = sub(far.mid, mul(far.out, W.thick / 2 - 0.6 + kd));
  const keepAngle = Math.atan2(-far.out[1], -far.out[0]);
  pieces.push({ kind: 'keep', at: keepAt, angle: keepAngle, base, w: kw, d: kd, seed: 4000 });
  const keepDoor = sub(keepAt, mul(far.out, kd + 2));
  // what the yard must keep clear: the way from the gate to the keep's door
  const taken = [];       // [x, z, radius] of what stands in the yard
  const clearOfWay = (p, rad) => segDist(p, gateIn, keepDoor) > rad + 3.2;
  const free = (p, rad) => taken.every(([x, z, q]) => Math.hypot(x - p[0], z - p[1]) > q + rad + 1.5)
    && towers.every((t) => len(sub(t.at, p)) > t.size + rad + 2);
  taken.push([keepAt[0], keepAt[1], Math.hypot(kd, kw)]);
  // stone stairs up to the walk: two or three, along the inner faces of the
  // longest free sides, rising along them
  const S = K.stair, stairN = Math.ceil(W.height / S.rise), stairL = stairN * S.run;
  const stairs = [];
  const want = 2 + (r(80) < 0.4 ? 1 : 0);
  const order = edges.slice().sort((p, q) => (q.L - (q === gateEdge ? 12 : 0) - (q === far ? 2 * kw : 0)) - (p.L - (p === gateEdge ? 12 : 0) - (p === far ? 2 * kw : 0)));
  for (const e of order) {
    if (stairs.length >= want) break;
    const ta = towers[e.i], tb = towers[(e.i + 1) % n];
    const inn = mul(e.out, -1), off = W.thick / 2 + S.width / 2;
    // free stretches of this side: between the towers, off the gate and the keep
    const lo = ta.size + 1.8, hi = e.L - tb.size - 1.8;
    const blocks = [];
    if (e === gateEdge) blocks.push([e.L / 2 - G.length / 2 - 2.5, e.L / 2 + G.length / 2 + 2.5]);
    if (e === far) blocks.push([e.L / 2 - kw - 1.5, e.L / 2 + kw + 1.5]);
    const spans = [[lo, hi]];
    for (const [b0, b1] of blocks) for (let s = spans.length - 1; s >= 0; s--) {
      const [s0, s1] = spans[s];
      if (b1 <= s0 || b0 >= s1) continue;
      spans.splice(s, 1, ...[[s0, b0], [b1, s1]].filter(([x0, x1]) => x1 > x0));
    }
    const fit = spans.filter(([s0, s1]) => s1 - s0 >= stairL + 2.5);
    if (!fit.length) continue;
    const [s0, s1] = fit[Math.floor(r(90 + e.i) * fit.length)];
    // rise toward one end or the other
    const up = r(95 + e.i) < 0.5;
    const t0 = up ? s0 + 1.2 : s1 - 1.2;
    const footP = add(add(e.a, mul(e.d, t0)), mul(inn, off));
    const ang = Math.atan2(e.d[1], e.d[0]) + (up ? 0 : Math.PI);
    const mid = add(footP, mul([Math.cos(ang), Math.sin(ang)], stairL / 2));
    if (!clearOfWay(mid, stairL / 2) || !free(mid, 1)) continue;
    pieces.push({ kind: 'stair', at: footP, angle: ang, base, seed: 5000 + stairs.length });
    stairs.push({ foot: sub(footP, mul([Math.cos(ang), Math.sin(ang)], 1.0)), top: add(footP, mul([Math.cos(ang), Math.sin(ang)], stairL - 0.3)), edge: e.i });
    taken.push([mid[0], mid[1], stairL / 2]);
  }
  // timber houses: one or two, along the inner faces of sides left free
  const houses = [];
  const nh = 1 + (r(100) < 0.55 ? 1 : 0);
  for (const e of order.slice().reverse()) {
    if (houses.length >= nh) break;
    if (e === gateEdge) continue;
    const hw = K.house.w[0] + (K.house.w[1] - K.house.w[0]) * r(110 + e.i), hd = K.house.d[0] + (K.house.d[1] - K.house.d[0]) * r(120 + e.i);
    const inn = mul(e.out, -1);
    for (const f of [0.5, 0.3, 0.7, 0.2, 0.8]) {
      const p = add(add(e.a, mul(e.d, e.L * f)), mul(inn, W.thick / 2 + hd + K.house.overhang + 1.4));
      if (e === far && Math.abs(e.L * f - e.L / 2) < kw + hw + 2) continue;
      if (!free(p, Math.hypot(hw, hd)) || !clearOfWay(p, Math.hypot(hw, hd)) || !inPoly(poly, p[0], p[1])) continue;
      // its door toward the yard (local +w)
      const ang = Math.atan2(e.d[1], e.d[0]) + (inn[0] * -e.d[1] + inn[1] * e.d[0] > 0 ? 0 : Math.PI);
      pieces.push({ kind: 'house', at: p, angle: ang, base, w: hw, d: hd, seed: 6000 + houses.length * 13 });
      houses.push({ at: p, door: add(p, mul(inn, hd + 1.6)) });
      taken.push([p[0], p[1], Math.hypot(hw, hd)]);
      break;
    }
  }
  // the well: somewhere in the yard, off the way, clear of everything
  const yard = offsetPoly(poly, -(W.thick / 2));
  let well = null;
  for (let t = 0; t < 400 && !well; t++) {
    const p = [C[0] + (r(200 + t) - 0.5) * 2 * R0, C[1] + (r(600 + t) - 0.5) * 2 * R0];
    if (!inPoly(yard, p[0], p[1]) || polyDist(yard, p[0], p[1]) > -6) continue;
    if (!clearOfWay(p, 2.5) || !free(p, 2.5)) continue;
    well = p;
  }
  if (well) { pieces.push({ kind: 'well', at: well, angle: r(5) * Math.PI, base, seed: 7000 }); taken.push([well[0], well[1], 1.5]); }
  // torches on posts in the yard, beside the way
  const torches = [];
  for (const f of [0.3, 0.7]) {
    const p = lerp2(gateIn, keepDoor, f), side = norm([-(keepDoor[1] - gateIn[1]), keepDoor[0] - gateIn[0]]);
    const q = add(p, mul(side, f < 0.5 ? 3.4 : -3.4));
    if (free(q, 0.3)) { pieces.push({ kind: 'torch', at: q, base, mount: 'post', mask: ZONE_YARD, phase: f * 7 }); torches.push(q); }
  }
  if (well) {
    const q = add(well, [2.2, 0.8]);
    pieces.push({ kind: 'torch', at: q, base, mount: 'post', mask: ZONE_YARD, phase: 3.3 });
  }
  // torches on the wall walk: one on each run of wall, on the parapet's inner face
  for (const e of edges) {
    if (e.L < 18) continue;
    const t = e === gateEdge ? e.L * 0.25 : e.L * 0.5;
    const onLine = add(e.a, mul(e.d, t));
    const face = add(onLine, mul(e.out, W.thick / 2 - W.parapet));
    pieces.push({ kind: 'torch', mount: 'bracket', at: face, normal: mul(e.out, -1), y: base + W.height + 1.45, mask: ZONE_OUT | ZONE_YARD, phase: e.i * 1.7 });
  }
  // the yard, for torchlight, and what trees must keep out of
  const cleared = offsetPoly(poly, 24 + W.thick / 2);
  return {
    desc: { pieces, yards: [yard], cleared: [cleared] },
    centre: C, poly, yard, cleared, base, ground: median, n, towers: towers.map((t) => ({ x: t.at[0], z: t.at[1], size: t.size, round: t.round })),
    gate: { x: gateAt[0], z: gateAt[1], out: gOut, angle: gateAngle }, front: { x: gateFront[0], z: gateFront[1] }, inner: { x: gateIn[0], z: gateIn[1] },
    keep: { x: keepAt[0], z: keepAt[1], door: { x: keepDoor[0], z: keepDoor[1] } },
    stairs, houses, well: well ? { x: well[0], z: well[1] } : null, edges: edges.map((e) => ({ a: e.a, b: e.b, out: e.out, side: e.side, gate: e === gateEdge })),
  };
}

// Level the land for the fort: the courtyard and the walls' feet to the
// platform's height; outside, gentle banks back to the land, as wide as the
// height they make up needs (rising or falling 1 in `slope`); water stays.
export function levelFort(H, N, kind, plan, slope = 0.42) {
  const NN = N + 1, foot = offsetPoly(plan.poly, W.thick / 2 + 1.5), base = plan.base;
  const pad = 40;
  const xs = foot.map((p) => p[0]), zs = foot.map((p) => p[1]);
  for (let z = Math.max(1, Math.floor(Math.min(...zs) - pad)); z <= Math.min(N - 1, Math.ceil(Math.max(...zs) + pad)); z++) {
    for (let x = Math.max(1, Math.floor(Math.min(...xs) - pad)); x <= Math.min(N - 1, Math.ceil(Math.max(...xs) + pad)); x++) {
      const j = z * NN + x;
      const d = polyDist(foot, x, z);
      // (a last resort, should a little water lie under the fort: filled)
      if (kind[j] !== KIND.NONE) { if (d <= 0) { kind[j] = KIND.NONE; H[j] = base; } continue; }
      const dh = base - H[j];
      if (d <= 0) { H[j] = base; continue; }
      const wdt = Math.abs(dh) / slope + 2;
      if (d >= wdt) continue;
      H[j] += dh * smoothstep(wdt, 0, d);
    }
  }
}

// The packed earth of the courtyard and the towers' floors: 255 inside the
// yard's inner faces, fading over a metre at the walls' feet (which hide it).
export function yardWeight(N, plan) {
  const NN = N + 1, w = new Uint8Array(NN * NN), yard = plan.yard;
  const xs = yard.map((p) => p[0]), zs = yard.map((p) => p[1]);
  for (let z = Math.max(0, Math.floor(Math.min(...zs) - 2)); z <= Math.min(N, Math.ceil(Math.max(...zs) + 2)); z++) {
    for (let x = Math.max(0, Math.floor(Math.min(...xs) - 2)); x <= Math.min(N, Math.ceil(Math.max(...xs) + 2)); x++) {
      const d = polyDist(yard, x, z);
      if (d > 1) continue;
      w[z * NN + x] = Math.round(255 * smoothstep(1, -1, d));
    }
  }
  // and the towers' floors (a circle round each, past a square one's
  // inner corners)
  for (const t of plan.towers) {
    const R = t.size + 0.3;
    for (let z = Math.max(0, Math.floor(t.z - R - 1)); z <= Math.min(N, Math.ceil(t.z + R + 1)); z++) {
      for (let x = Math.max(0, Math.floor(t.x - R - 1)); x <= Math.min(N, Math.ceil(t.x + R + 1)); x++) {
        const d = Math.hypot(x - t.x, z - t.z) - R;
        if (d > 1) continue;
        const j = z * NN + x;
        w[j] = Math.max(w[j], Math.round(255 * smoothstep(1, -1, d)));
      }
    }
  }
  return w;
}

// The road into the fort: the old road's end within the fort's surroundings
// is replaced by a curve from where it reaches them (tangent to it) to the
// gate's mouth, straight on through the passage into the yard, its height
// graded from the road's to the platform's; other roads that ended there
// are brought to its new start. `roads[k]` is the fort's road (its index 0
// at the fort), cut at `q0`; returns the new stretch's length, its grade
// and whether it keeps clear of the walls.
// (phase 3b) A way up to the gate that winds with the land: the cheapest
// path on a 2 m grid from the gate's front out to the old road, refusing
// steps steeper than `steep` and charging heavily for slope (so it contours
// round a rise rather than climbing it straight), kept clear of the walls
// and of every tower by the tower's size and a margin. Returns { q0, path }
// (path: points from the old road's point q0 to the gate's front), or null.
// (`grade`: a road point is reached only by a way long enough to climb or
// fall from it to the platform no steeper than this)
export function windToFort(H, N, kind, plan, rd, qFrom, qTo, steep = 0.065, grade = 0.075) {
  const NN = N + 1, S = 3;
  const front = [plan.front.x, plan.front.z], o = plan.gate.out;
  const big = Math.max(...plan.towers.map((t) => t.size)) + SCALE.road.width / 2 + 3;
  const keep = offsetPoly(plan.poly, big);
  const R = 240, x0 = Math.max(2, Math.floor((front[0] - R) / S) * S), z0 = Math.max(2, Math.floor((front[1] - R) / S) * S);
  const n = Math.floor((2 * R) / S) + 1, cells = n * n;
  const hAt = new Float32Array(cells), pen = new Float32Array(cells);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const x = x0 + i * S, z = z0 + k * S, c = k * n + i;
    if (x >= N - 1 || z >= N - 1) { pen[c] = Infinity; continue; }
    const j = Math.round(z) * NN + Math.round(x);
    hAt[c] = H[j];
    let p = kind[j] !== KIND.NONE ? Infinity : 1;
    // clear of the fort: only the straight run out of the gate comes near it
    const t = (x - front[0]) * o[0] + (z - front[1]) * o[1], across = Math.abs(-(x - front[0]) * o[1] + (z - front[1]) * o[0]);
    const corridor = t > -2 && t < 10 && across < 4;
    const pd = polyDist(keep, x, z);
    if (!corridor && pd < 0) p = Infinity;
    // and kept a little off the margin round it
    else if (!corridor) p += 4 * smoothstep(12, 0, pd);
    pen[c] = p;
  }
  const node = (x, z) => { const i = Math.round((x - x0) / S), k = Math.round((z - z0) / S); return i < 0 || k < 0 || i >= n || k >= n ? -1 : k * n + i; };
  // the goal: the old road's points from qFrom to qTo
  const goal = new Map();
  for (let q = qFrom; q <= Math.min(qTo, rd.n - 1); q++) { const c = node(rd.x[q], rd.z[q]); if (c >= 0 && pen[c] !== Infinity && !goal.has(c)) goal.set(c, q); }
  // states: a cell and the heading it was entered by (eight of them), so a
  // turn costs by how sharp it is and the way keeps long legs and real bends
  const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const TURN = [0, 4, 30, 160, Infinity];
  const outDir = Math.round(Math.atan2(o[1], o[0]) / (Math.PI / 4));
  const d0 = ((outDir % 8) + 8) % 8;
  const start = node(front[0] + o[0] * 9, front[1] + o[1] * 9);
  if (start < 0 || !goal.size) return null;
  const NS = cells * 8;
  const dist = new Float64Array(NS).fill(Infinity), prev = new Int32Array(NS).fill(-1), glen = new Float32Array(NS);
  const heap = new MinHeap(8192);
  const s0 = start * 8 + d0;
  dist[s0] = 0; glen[s0] = 9; heap.push(s0, 0);
  let hit = -1;
  while (heap.size) {
    const d = heap.topKey(), st = heap.pop();
    if (d > dist[st]) continue;
    const c = st >> 3, dir = st & 7;
    if (goal.has(c) && Math.abs(rd.y[goal.get(c)] - plan.base) <= grade * glen[st]) { hit = st; break; }
    const ci = c % n, ck = (c - ci) / n;
    for (let nd = 0; nd < 8; nd++) {
      let turn = Math.abs(nd - dir); if (turn > 4) turn = 8 - turn;
      const tc = TURN[turn];
      if (tc === Infinity) continue;
      const [di, dk] = DIRS[nd], i = ci + di, k = ck + dk;
      if (i < 0 || k < 0 || i >= n || k >= n) continue;
      const m = k * n + i, p = pen[m];
      if (p === Infinity) continue;
      const L = S * Math.hypot(di, dk), sl = Math.abs(hAt[m] - hAt[c]) / L;
      // (near the gate the ground is graded to the road anyway: steeper
      // allowed there, at its cost)
      if (sl > (glen[st] < 26 ? 0.3 : steep)) continue;
      const ms = m * 8 + nd, cost = d + L * (p + 900 * sl * sl) + tc;
      if (cost < dist[ms]) { dist[ms] = cost; prev[ms] = st; glen[ms] = glen[st] + L; heap.push(ms, cost); }
    }
  }
  if (hit < 0) return null;
  // from the road's point to the gate's front
  const path = [];
  for (let st = hit; st >= 0; st = prev[st]) { const c = st >> 3; path.push([x0 + (c % n) * S, z0 + Math.floor(c / n) * S]); }
  path.push(front);
  return { q0: goal.get(hit >> 3), path };
}

// Smooth a path (a moving average, then corners cut), keeping its ends.
function smoothPath(P) {
  let Q = P.map((p, q) => {
    let sx = 0, sz = 0, w = 0;
    for (let r = Math.max(0, q - 3); r <= Math.min(P.length - 1, q + 3); r++) { const k = 4 - Math.abs(r - q); sx += P[r][0] * k; sz += P[r][1] * k; w += k; }
    return [sx / w, sz / w];
  });
  Q[0] = P[0]; Q[Q.length - 1] = P[P.length - 1];
  for (let r = 0; r < 2; r++) {
    const T = [Q[0]];
    for (let q = 0; q + 1 < Q.length; q++) T.push(lerp2(Q[q], Q[q + 1], 0.25), lerp2(Q[q], Q[q + 1], 0.75));
    T.push(Q[Q.length - 1]);
    Q = T;
  }
  return Q;
}

// (`way`, phase 3b: the winding path from windToFort, used instead of the
// curve straight in)
export function routeIntoFort(roads, k, plan, q0, way = null) {
  const rd = roads[k];
  // other roads ending on the stretch to be replaced end at the cut instead
  const front = [plan.front.x, plan.front.z], inner = [plan.inner.x, plan.inner.z];
  const P = [rd.x[q0], rd.z[q0]], y0 = rd.y[q0];
  const dir = norm([rd.x[q0] - rd.x[Math.min(rd.n - 1, q0 + 6)], rd.z[q0] - rd.z[Math.min(rd.n - 1, q0 + 6)]]);
  const L = len(sub(front, P));
  let pts = [];
  if (way) {
    // the old road's own last few metres before the cut lead into it, so it
    // leaves the old road on its line, without a kink
    const lead = [];
    for (let q = Math.min(rd.n - 1, q0 + 10); q > q0; q--) lead.push([rd.x[q], rd.z[q]]);
    const sm = smoothPath([...lead, ...way]);
    // (from the cut on: drop the lead-in again)
    let from = 0, bd = Infinity;
    for (let i = 0; i < sm.length; i++) { const d = len(sub(sm[i], P)); if (d < bd) { bd = d; from = i; } }
    pts = sm.slice(from);
    pts[0] = P;
  } else {
    const B1 = add(P, mul(dir, L / 3)), B2 = add(front, mul(plan.gate.out, L / 3));
    const steps = Math.max(2, Math.ceil(L * 1.2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, u = 1 - t;
      pts.push([u * u * u * P[0] + 3 * u * u * t * B1[0] + 3 * u * t * t * B2[0] + t * t * t * front[0], u * u * u * P[1] + 3 * u * u * t * B1[1] + 3 * u * t * t * B2[1] + t * t * t * front[1]]);
    }
  }
  // (keeping clear of the walls until it turns in to the gate)
  const foot = offsetPoly(plan.poly, W.thick / 2 + 4);
  let clear = true;
  for (const p of pts) if (len(sub(p, front)) > 9 && polyDist(foot, p[0], p[1]) < 2) { clear = false; break; }
  // then straight through the passage, 5 m into the yard
  const deep = add(inner, mul(plan.gate.out, -5));
  const tail = Math.ceil(len(sub(deep, front)));
  for (let s = 1; s <= tail; s++) pts.push(lerp2(front, deep, s / tail));
  // resample at 1 m from the yard's end (index 0 is the fort's end) to the cut
  const line = pts.slice().reverse();
  const xs = [line[0][0]], zs = [line[0][1]];
  let need = 1;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1], l = len(sub(b, a));
    let u = need;
    while (u <= l) { const f = u / l; xs.push(a[0] + (b[0] - a[0]) * f); zs.push(a[1] + (b[1] - a[1]) * f); u += 1; }
    need = u - l;
  }
  // heights: the platform through the gate, then graded evenly to the road's
  // (the length along the way, not the count of points)
  const m = xs.length, y = new Float32Array(m);
  const dFront = (i) => len(sub([xs[i], zs[i]], front));
  let iFront = 0;
  for (let i = 0; i < m; i++) if (dFront(i) < dFront(iFront)) iFront = i;
  for (let i = 0; i < m; i++) y[i] = i <= iFront ? plan.base : plan.base + (y0 - plan.base) * (i - iFront) / (m - iFront);
  // join the old road beyond the cut (dropping the joining point itself,
  // and filling the gap so the points stay about a metre apart)
  const gx = [], gz = [], gy = [];
  if (q0 + 1 < rd.n) {
    const lx = xs[m - 1], lz = zs[m - 1], ly = y[m - 1], k = Math.round(Math.hypot(rd.x[q0 + 1] - lx, rd.z[q0 + 1] - lz));
    for (let i = 1; i < k; i++) { const f = i / k; gx.push(lx + (rd.x[q0 + 1] - lx) * f); gz.push(lz + (rd.z[q0 + 1] - lz) * f); gy.push(ly + (rd.y[q0 + 1] - ly) * f); }
  }
  const nx = [...xs, ...gx, ...Array.from(rd.x).slice(q0 + 1)], nz = [...zs, ...gz, ...Array.from(rd.z).slice(q0 + 1)];
  const ny = [...y, ...gy, ...Array.from(rd.y).slice(q0 + 1)];
  const out = { id: rd.id, to: rd.to, steep: rd.steep, x: Float32Array.from(nx), z: Float32Array.from(nz), y: Float32Array.from(ny), n: nx.length, cut: m };
  roads[k] = out;
  // other roads that joined the stretch now gone: brought to the nearest
  // point of the new road whose line to them keeps clear of the fort (they
  // give up whatever of them lay within the fort's surroundings)
  const clearOf = (a, b) => { for (let s = 0; s <= 1; s += 0.05) { const p = lerp2(a, b, s); if (polyDist(foot, p[0], p[1]) < 2) return false; } return true; };
  const gone = [];
  for (let q = 0; q < q0; q++) gone.push([rd.x[q], rd.z[q]]);
  for (let o = 0; o < roads.length; o++) {
    if (o === k) continue;
    const ro = roads[o], e = ro.n - 1;
    if (!gone.some(([gx, gz]) => Math.hypot(gx - ro.x[e], gz - ro.z[e]) < 3)) continue;
    let qe = e;
    while (qe > 0 && polyDist(plan.cleared, ro.x[qe], ro.z[qe]) < 6) qe--;
    const from = [ro.x[qe], ro.z[qe]];
    let best = -1, bd = Infinity;
    for (let i = iFront + 6; i < out.n; i++) {
      const to = [out.x[i], out.z[i]], d = len(sub(to, from));
      if (d < bd && clearOf(from, to)) { bd = d; best = i; }
    }
    if (best < 0) best = m - 1;
    const to = [out.x[best], out.z[best]], yt = out.y[best], seg = Math.max(1, Math.ceil(len(sub(to, from))));
    const ax = Array.from(ro.x).slice(0, qe + 1), az = Array.from(ro.z).slice(0, qe + 1), ay = Array.from(ro.y).slice(0, qe + 1);
    for (let s = 1; s <= seg; s++) { const p = lerp2(from, to, s / seg); ax.push(p[0]); az.push(p[1]); ay.push(ro.y[qe] + (yt - ro.y[qe]) * s / seg); }
    roads[o] = { id: ro.id, to: ro.to, steep: ro.steep, x: Float32Array.from(ax), z: Float32Array.from(az), y: Float32Array.from(ay), n: ax.length };
  }
  const run = Math.max(1, m - iFront);
  return { q0, rise: y0 - plan.base, run, slope: Math.abs(y0 - plan.base) / run, m, clear, wound: !!way };
}

// The ground along the new approach, before the road is pressed into it:
// brought to the road's height across a band as wide as the height it makes
// up needs (1 in `slope`), so the road meets the gate on gentle banks, not a
// causeway. `rd`: the fort's road; `m`: its new stretch's length.
export function levelApproach(H, N, kind, rd, m, slope = 0.38) {
  const NN = N + 1, half = SCALE.road.width / 2;
  const best = new Map();
  for (let q = 0; q < m; q++) {
    const x = rd.x[q], z = rd.z[q], yq = rd.y[q];
    const R = 18;
    for (let k = Math.max(1, Math.floor(z - R)); k <= Math.min(N - 1, Math.ceil(z + R)); k++) {
      for (let i = Math.max(1, Math.floor(x - R)); i <= Math.min(N - 1, Math.ceil(x + R)); i++) {
        const d = Math.hypot(i - x, k - z), j = k * NN + i;
        const b = best.get(j);
        if (!b || d < b[0]) best.set(j, [d, yq]);
      }
    }
  }
  for (const [j, [d, yq]] of best) {
    if (kind[j] !== KIND.NONE) continue;
    const dh = yq - H[j], wdt = half + 1 + Math.abs(dh) / slope;
    if (d >= wdt) continue;
    H[j] += dh * (d <= half + 1 ? 1 : smoothstep(wdt, half + 1, d));
  }
}

// (phase 3b) A road that runs through where the fort now stands (its search
// was made before the fort was planned) goes round it instead: from where it
// enters a ring clear of the walls and towers to where it leaves it, along
// the ring the shorter way, heights eased between. (A road that ends there is
// routeIntoFort's to bring to the new road.)
export function detourFort(roads, plan, skip) {
  const big = Math.max(...plan.towers.map((t) => t.size)) + W.thick / 2 + 8;
  const ring = offsetPoly(plan.poly, big), zone = offsetPoly(plan.poly, big - 2);
  roads.forEach((rd, k) => {
    if (k === skip) return;
    let qa = -1, qb = -1;
    for (let q = 0; q < rd.n; q++) if (inPoly(zone, rd.x[q], rd.z[q])) { if (qa < 0) qa = q; qb = q; }
    if (qa <= 0 || qb >= rd.n - 1) return;
    const A = [rd.x[qa - 1], rd.z[qa - 1]], B = [rd.x[qb + 1], rd.z[qb + 1]];
    // the ring as a closed line, densely
    const pts = [];
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length], L = len(sub(q, p)); for (let s = 0; s < L; s += 1) pts.push(lerp2(p, q, s / L)); }
    const nearest = (P) => { let b = 0, bd = Infinity; pts.forEach((p, i) => { const d = len(sub(p, P)); if (d < bd) { bd = d; b = i; } }); return b; };
    const ia = nearest(A), ib = nearest(B), n = pts.length;
    const fwd = (ib - ia + n) % n, back = (ia - ib + n) % n;
    const way = [A];
    if (fwd <= back) for (let s = 0; s <= fwd; s++) way.push(pts[(ia + s) % n]);
    else for (let s = 0; s <= back; s++) way.push(pts[(ia - s + n) % n]);
    way.push(B);
    const sm = smoothPath(way);
    // a point a metre
    const xs = [], zs = [];
    for (let i = 0; i + 1 < sm.length; i++) { const L = len(sub(sm[i + 1], sm[i])), m = Math.max(1, Math.round(L)); for (let s = 0; s < m; s++) { const p = lerp2(sm[i], sm[i + 1], s / m); xs.push(p[0]); zs.push(p[1]); } }
    const y0 = rd.y[qa - 1], y1 = rd.y[qb + 1], m = xs.length;
    const ys = xs.map((_, i) => y0 + (y1 - y0) * i / Math.max(1, m - 1));
    const nx = [...Array.from(rd.x).slice(0, qa - 1), ...xs, ...Array.from(rd.x).slice(qb + 2)];
    const nz = [...Array.from(rd.z).slice(0, qa - 1), ...zs, ...Array.from(rd.z).slice(qb + 2)];
    const ny = [...Array.from(rd.y).slice(0, qa - 1), ...ys, ...Array.from(rd.y).slice(qb + 2)];
    roads[k] = { ...rd, x: Float32Array.from(nx), z: Float32Array.from(nz), y: Float32Array.from(ny), n: nx.length, low: undefined, g: undefined };
  });
}
