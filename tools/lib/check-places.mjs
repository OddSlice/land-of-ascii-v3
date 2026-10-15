// The world check's fort and villages (tools/world-check.mjs): walked
// through under the player's rules with the kit's exact collision.
import { SCALE } from '../../src/world/scale.js';
import { groundAt } from '../../src/world/objects.js';
import { hash2 } from '../../src/world/noise.js';
import { Player } from '../../src/app/player.js';
import { solidAt, bodyBlocked } from '../../src/world/kit.js';
import { inPoly, polyDist } from '../../src/world/gen/fort.js';

export function fortChecks(w) {
  const f = w.sites.fort, K = SCALE.kit, out = { placed: !!(w.kit && w.kit.np && f && f.towers), towers: f.towers.length, stairs: f.stairs.length };
  const NN = w.NN, T = w.terrain;
  // the road into the gate
  const rd = w.roads.find((r) => r.to === 'fort');
  const g = f.gate, o = g.out, across = [-o[1], o[0]];
  let inPassage = false;
  for (let q = 0; q < rd.n; q++) {
    const dx = rd.x[q] - g.x, dz = rd.z[q] - g.z, a = Math.abs(dx * across[0] + dz * across[1]), t = Math.abs(dx * o[0] + dz * o[1]);
    if (a < K.gate.width / 2 - 0.6 && t < K.gate.depth / 2) inPassage = true;
  }
  const endInYard = inPoly(f.yard, rd.x[0], rd.z[0]);
  const surf = { ground: T.levels[0].H, N: w.N, NN };
  // from the yard out along the road to 30 m past the gate's mouth: the
  // grade over 4 m (as the roads are measured) and the biggest rise between
  // points a metre apart (a step would show there)
  let worstStep = 0, worstRise = 0;
  for (let q = 0; q + 4 < rd.n; q++) {
    const dfront = Math.hypot(rd.x[q] - f.front.x, rd.z[q] - f.front.z);
    if (dfront > 30 && !inPoly(f.yard, rd.x[q], rd.z[q]) && q > 30) break;
    let run = 0;
    for (let u = q; u < q + 4; u++) run += Math.hypot(rd.x[u + 1] - rd.x[u], rd.z[u + 1] - rd.z[u]);
    worstStep = Math.max(worstStep, Math.abs(groundAt(surf, rd.x[q + 4], rd.z[q + 4]) - groundAt(surf, rd.x[q], rd.z[q])) / Math.max(1e-6, run));
    worstRise = Math.max(worstRise, Math.abs(groundAt(surf, rd.x[q + 1], rd.z[q + 1]) - groundAt(surf, rd.x[q], rd.z[q])));
  }
  out.road = { inPassage, endInYard, worstStep: +worstStep.toFixed(3), worstRise: +worstRise.toFixed(3), ok: inPassage && endInYard && worstStep <= SCALE.road.maxSlope && worstRise <= 0.2 };
  // trees
  const cleared = w.fortDesc.cleared[0];
  out.treesIn = w.objects.trees.filter((t) => inPoly(cleared, t.x, t.z)).length;
  // the walker: states on a 0.5 m lattice, with the feet's height
  const p = new Player(w, { rules: 'world' });
  const STEP = 0.6, HEAD = 1.8, R = 0.3, sub = 0.25;
  const b = w.kit.box, x0 = b.x0 - 18, z0 = b.z0 - 18, x1 = b.x1 + 18, z1 = b.z1 + 18;
  const key = (ix, iz, ft) => `${ix},${iz},${Math.round(ft * 8)}`;
  const states = new Map(), list = [];
  const addState = (ix, iz, ft) => { const k = key(ix, iz, ft); if (states.has(k)) return states.get(k); const id = list.length; states.set(k, id); list.push({ ix, iz, ft, nb: [] }); return id; };
  // one move of up to 0.5 m: true and where it ends, or false if blocked
  const move = (x, z, ft, dx, dz, dist) => {
    const n = Math.max(1, Math.ceil(dist / sub - 1e-9)), h = dist / n;
    for (let s = 0; s < n; s++) {
      const nx = x + dx * h, nz = z + dz * h;
      const gg = p.supportAt(nx, nz, ft), rise = gg - ft;
      const onGround = gg <= groundAt(T, nx, nz) + 1e-3;
      if (onGround ? rise > SCALE.climb * h + 1e-3 : rise > STEP) return null;
      // (a step down comes to rest on what is under any part of the body,
      // as the player does: off an edge once clear of it)
      const land = gg < ft - 0.05 ? p.landAt(nx, nz, ft) : gg;
      if (p.blocked(nx, nz, Math.max(gg, ft)) || (gg < ft - 0.05 && p.blocked(nx, nz, land))) return null;
      x = nx; z = nz; ft = land;
    }
    return [x, z, ft];
  };
  const start = [f.front.x + o[0] * 6, f.front.z + o[1] * 6];
  const sx = Math.round(start[0] * 2), sz = Math.round(start[1] * 2);
  addState(sx, sz, p.restAt(sx / 2, sz / 2));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let h = 0; h < list.length && list.length < 600000; h++) {
    const st = list[h], x = st.ix / 2, z = st.iz / 2;
    for (const [ddx, ddz] of DIRS) {
      const nx = (st.ix + ddx) / 2, nz = (st.iz + ddz) / 2;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
      const l = Math.hypot(ddx, ddz) / 2;
      const r = move(x, z, st.ft, ddx / 2 / l, ddz / 2 / l, l);
      if (!r) continue;
      st.nb.push(addState(st.ix + ddx, st.iz + ddz, r[2]));
    }
  }
  // which states can get back to the gate's mouth (edges backwards)
  const back = new Uint8Array(list.length), rev = Array.from({ length: list.length }, () => []);
  list.forEach((st, i) => { for (const j of st.nb) rev[j].push(i); });
  const qb = [0]; back[0] = 1;
  for (let h = 0; h < qb.length; h++) for (const i of rev[qb[h]]) if (!back[i]) { back[i] = 1; qb.push(i); }
  // a target is reached if a state within `rad` m and `dy` m of its height is, and gets back out
  const reachedAt = (x, z, y, rad = 0.8, dy = 0.5) => {
    let any = false, outToo = false;
    for (let iz = Math.round((z - rad) * 2); iz <= Math.round((z + rad) * 2); iz++) for (let ix = Math.round((x - rad) * 2); ix <= Math.round((x + rad) * 2); ix++) {
      for (let k = -40; k <= 40; k++) {
        const ft = Math.round(y * 8) / 8 + k / 8;
        if (Math.abs(ft - y) > dy) continue;
        const id = states.get(key(ix, iz, ft));
        if (id === undefined) continue;
        any = true; if (back[id]) outToo = true;
      }
    }
    return { reached: any, out: outToo };
  };
  const targets = [];
  targets.push({ name: 'the yard (inside the gate)', at: [f.inner.x - o[0] * 4, f.inner.z - o[1] * 4], y: f.base });
  f.stairs.forEach((s, i) => targets.push({ name: `stair ${i + 1}, its top`, at: s.top, y: f.base + K.wall.height, rad: 1.0 }));
  // the wall walk: every 4 m along every run of wall (off its ends), on the walk's middle
  f.edges.forEach((e, i) => {
    const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L = Math.hypot(d[0], d[1]);
    const ta = f.towers[i], tb = f.towers[(i + 1) % f.towers.length];
    for (let t = ta.size + 1.2; t <= L - tb.size - 1.2; t += 4) {
      const onLine = [e.a[0] + d[0] / L * t, e.a[1] + d[1] / L * t];
      const at = [onLine[0] - e.out[0] * (K.wall.parapet / 2), onLine[1] - e.out[1] * (K.wall.parapet / 2)];
      if (e.gate && Math.abs(t - L / 2) < K.gate.length / 2 + 0.5) { targets.push({ name: `wall walk, side ${i + 1} at ${t.toFixed(0)} m (over the gate)`, at, y: f.base + K.wall.height, walk: true }); continue; }
      targets.push({ name: `wall walk, side ${i + 1} at ${t.toFixed(0)} m`, at, y: f.base + K.wall.height, walk: true });
    }
  });
  f.towers.forEach((t, i) => {
    targets.push({ name: `tower ${i + 1} (${t.round ? 'round' : 'square'}), inside`, at: [t.x, t.z], y: f.base, rad: 1.6, dy: 0.4 });
    targets.push({ name: `tower ${i + 1}, its top`, at: [t.x, t.z], y: f.base + K.wall.height + K.tower.above, rad: t.size - 1.0, dy: 0.4 });
  });
  targets.push({ name: 'the keep, its hall', at: [f.keep.x, f.keep.z], y: f.base, rad: 2, dy: 0.4 });
  const res = targets.map((t) => ({ name: t.name, ...reachedAt(t.at[0], t.at[1], t.y, t.rad, t.dy) }));
  out.walker = { states: list.length, targets: res.length, reached: res.filter((r) => r.reached).length, out: res.filter((r) => r.reached && r.out).length, failed: res.filter((r) => !r.reached || !r.out).map((r) => `${r.name}${r.reached ? ' (no way back out)' : ''}`) };
  out.walker.ok = out.walker.failed.length === 0;
  // a thousand random walks
  const pool = list.map((st, i) => i).filter((i) => back[i]);
  let through = 0, stuck = 0, inside = 0;
  const wall = [];
  for (let k = 0; k < 1000; k++) {
    const st = list[pool[Math.floor(hash2(k, 1, 4407) * pool.length)]];
    const yaw0 = hash2(k, 2, 4407) * Math.PI * 2;
    p.place(st.ix / 2, st.iz / 2, yaw0, 0, st.ft);
    const keys = { KeyW: true };
    let still = 0, px = p.x, pz = p.z, pf = p.feet, bad = null;
    for (let fr = 0; fr < 180; fr++) {
      if (fr % 30 === 0) { p.yaw = yaw0 + (hash2(k, 10 + fr, 4407) - 0.5) * 2.4; keys.ShiftLeft = hash2(k, 50 + fr, 4407) < 0.3; keys.KeyD = hash2(k, 90 + fr, 4407) < 0.15; }
      p.update(1 / 60, keys);
      // through a wall: anything solid at waist height along the way it moved
      const dl = Math.hypot(p.x - px, p.z - pz), n = Math.ceil(dl / 0.04);
      for (let s = 1; s <= n && !bad; s++) {
        const t = s / n, x = px + (p.x - px) * t, z = pz + (p.z - pz) * t;
        if (solidAt(w.kit, x, Math.max(pf, p.feet) + 1.1, z)) bad = 'through';
      }
      if (!bad && bodyBlocked(w.kit, p.x, p.z, p.feet + STEP + 0.02, p.feet + HEAD - 0.02, R * 0.85)) bad = 'inside';
      if (bad) break;
      if (dl < 0.002) still++; else still = 0;
      if (still >= 45) {
        // stuck: no way at all to step out of where it stands
        let free = false;
        for (let a = 0; a < 16 && !free; a++) { const ang = a * Math.PI / 8; if (move(p.x, p.z, p.feet, Math.cos(ang), Math.sin(ang), 0.25)) free = true; }
        if (!free) bad = 'stuck';
        still = 0;
      }
      px = p.x; pz = p.z; pf = p.feet;
    }
    if (bad === 'through') through++; else if (bad === 'stuck') stuck++; else if (bad === 'inside') inside++;
    if (bad && wall.length < 5) wall.push({ k, bad, x: +p.x.toFixed(2), z: +p.z.toFixed(2), feet: +p.feet.toFixed(2), start: [st.ix / 2, st.iz / 2, +st.ft.toFixed(3), +yaw0.toFixed(4)] });
  }
  out.walks = { attempts: 1000, through, stuck, inside, examples: wall, ok: through === 0 && stuck === 0 && inside === 0 };
  out.ok = out.placed && out.road.ok && out.treesIn === 0 && out.walker.ok && out.walks.ok;
  return out;
}

// ---- 9. The villages (phase 3b) ---------------------------------------------

// One step of the walker (as the player walks: tools mirror its rules), of
// up to `dist` metres: where it ends, or null if blocked.
export function makeMove(w, p) {
  const T = w.terrain, STEP = 0.6, sub = 0.25;
  return (x, z, ft, dx, dz, dist) => {
    const n = Math.max(1, Math.ceil(dist / sub - 1e-9)), h = dist / n;
    for (let s = 0; s < n; s++) {
      const nx = x + dx * h, nz = z + dz * h;
      const gg = p.supportAt(nx, nz, ft), rise = gg - ft;
      const onGround = gg <= groundAt(T, nx, nz) + 1e-3;
      if (onGround ? rise > SCALE.climb * h + 1e-3 : rise > STEP) return null;
      const land = gg < ft - 0.05 ? p.landAt(nx, nz, ft) : gg;
      if (p.blocked(nx, nz, Math.max(gg, ft)) || (gg < ft - 0.05 && p.blocked(nx, nz, land))) return null;
      x = nx; z = nz; ft = land;
    }
    return [x, z, ft];
  };
}

// Walk a line of points (a road, a footpath) a point at a time, from its
// first; a step that is blocked is tried a little to either side. Returns
// the first point it could not pass, or -1.
// (feet on the ground or what stands on it there, not on a roof overhead)
export const groundFeet = (w, p, x, z) => p.supportAt(x, z, groundAt(w.terrain, x, z) + 0.3);
export function walkLine(w, p, move, xs, zs, n) {
  let x = xs[0], z = zs[0], ft = groundFeet(w, p, x, z);
  for (let q = 1; q < n; q++) {
    let done = false;
    for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
      const tx = xs[q], tz = zs[q], dx0 = tx - x, dz0 = tz - z, L0 = Math.hypot(dx0, dz0) || 1;
      const ox = -dz0 / L0 * off, oz = dx0 / L0 * off;
      const ex = tx + ox, ez = tz + oz, dx = ex - x, dz = ez - z, L = Math.hypot(dx, dz);
      if (L < 1e-6) { done = true; break; }
      const r = move(x, z, ft, dx / L, dz / L, L);
      if (r) { [x, z, ft] = r; done = true; break; }
    }
    if (!done) return q;
  }
  return -1;
}


export function villageChecks(w) {
  const T = w.terrain, N = w.N, NN = w.NN, V = SCALE.village;
  const vs = w.sites.villages.map((v) => v.plan);
  const out = { placed: vs.length === 3 && vs.every(Boolean), patterns: vs.map((p) => p && p.pattern) };
  out.distinct = new Set(out.patterns).size === 3;
  out.counts = vs.map((p) => p ? { houses: p.houses.length, enter: p.enter.length, chapel: !!p.chapel, well: !!p.well, barns: p.barns.length, signpost: !!p.signpost, lanterns: p.lanterns.length, fields: (p.fields || []).length, paths: (p.paths || []).length, jetty: !!p.jetty, shelter: !!p.shelter } : null);
  out.kit = out.counts.every((c) => c && c.houses >= 8 && c.houses <= 20 && c.chapel && c.well && c.barns >= 1 && c.barns <= 2 && c.signpost && c.lanterns >= 2);
  const p = new Player(w, { rules: 'world' }), move = makeMove(w, p);
  // ---- by road, across every bridge; along every footpath ----
  const roadFails = [];
  for (const r of w.roads) { const q = walkLine(w, p, move, r.x, r.z, r.n); if (q >= 0) roadFails.push(`${r.to} at ${Math.round(r.x[q])},${Math.round(r.z[q])}`); }
  const pathFails = [];
  let nPaths = 0;
  vs.forEach((v, i) => (v.paths || []).forEach((pa) => { nPaths++; const q = walkLine(w, p, move, pa.x, pa.z, pa.n); if (q >= 0) pathFails.push(`village ${i + 1} to its ${pa.to} at ${Math.round(pa.x[q])},${Math.round(pa.z[q])}`); }));
  out.roadsWalked = { roads: w.roads.length, bridges: (w.sites.bridges || []).length, failed: roadFails };
  out.pathsWalked = { paths: nPaths, failed: pathFails };
  // ---- every building, fence and field: off the roads, the water, the fort and each other ----
  const roadClear = (x, z) => {
    let best = Infinity;
    for (const r of w.roads) for (let q = 0; q < r.n; q += 1) { const d = Math.hypot(r.x[q] - x, r.z[q] - z); if (d < best) best = d; }
    return best - SCALE.road.width / 2;
  };
  const wet = (x, z) => { const i = Math.round(x), k = Math.round(z); return i < 0 || k < 0 || i > N || k > N || T.wWater[k * NN + i] > 127; };
  const fortIn = (x, z) => polyDist(w.sites.fort.poly, x, z) < SCALE.kit.wall.thick / 2 + 2;
  const rectPts = ([x, z, a, hw, hd], step = 1) => { const pts = [], ca = Math.cos(a), sa = Math.sin(a); for (let u = -hw; u <= hw + 1e-6; u += Math.max(0.5, Math.min(step, hw))) for (let v = -hd; v <= hd + 1e-6; v += Math.max(0.5, Math.min(step, hd))) pts.push([x + u * ca - v * sa, z + u * sa + v * ca]); return pts; };
  const inRect = ([x, z, a, hw, hd], px, pz, pad = 0) => { const dx = px - x, dz = pz - z; return Math.abs(dx * Math.cos(a) + dz * Math.sin(a)) <= hw + pad && Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) <= hd + pad; };
  const overlaps = [];
  const allRects = [];
  vs.forEach((v, i) => v.rects.forEach((R, k) => allRects.push({ R, v: i, k, jetty: v.jetty && Math.hypot(R[0] - (v.jetty.a[0] + v.jetty.b[0]) / 2, R[1] - (v.jetty.a[1] + v.jetty.b[1]) / 2) < 1 })));
  for (const A of allRects) {
    for (const [x, z] of rectPts(A.R)) {
      if (!A.jetty && wet(x, z)) { overlaps.push(`village ${A.v + 1}'s building ${A.k + 1} stands in water`); break; }
      if (roadClear(x, z) < 0.2) { overlaps.push(`village ${A.v + 1}'s building ${A.k + 1} stands on a road`); break; }
      if (fortIn(x, z)) { overlaps.push(`village ${A.v + 1}'s building ${A.k + 1} stands in the fort`); break; }
      const other = allRects.find((B) => B !== A && inRect(B.R, x, z, -0.05));
      if (other) { overlaps.push(`village ${A.v + 1}'s building ${A.k + 1} overlaps building ${other.k + 1}`); break; }
    }
  }
  const desc = w.kitDesc || { pieces: [] };
  const bounds = desc.pieces.filter((pc) => pc.kind === 'fence' || pc.kind === 'drystone' || pc.kind === 'gateposts');
  for (const pc of bounds) for (const [x, z] of pc.pts) {
    if (wet(x, z) || roadClear(x, z) < 0.3 || fortIn(x, z) || allRects.some((B) => inRect(B.R, x, z, 0.2))) { overlaps.push(`a ${pc.kind} at ${Math.round(x)},${Math.round(z)} overlaps a road, water, the fort or a building`); break; }
  }
  vs.forEach((v, i) => (v.fields || []).forEach((f, k) => {
    for (const [x, z] of rectPts([f.x, f.z, f.a, f.L, f.W], 3)) {
      if (wet(x, z) || roadClear(x, z) < 0.5 || fortIn(x, z) || allRects.some((B) => inRect(B.R, x, z, 0.5))) { overlaps.push(`village ${i + 1}'s field ${k + 1} overlaps a road, water, the fort or a building at ${Math.round(x)},${Math.round(z)}`); break; }
    }
  }));
  out.overlaps = overlaps;
  // ---- doors: onto firm ground at the sill, not a drop, water or a neighbour's wall ----
  const doors = [];
  vs.forEach((v, i) => v.houses.forEach((h, k) => {
    const ca = Math.cos(h.a), sa = Math.sin(h.a), fx = h.x - (h.d + 1.2) * sa, fz = h.z + (h.d + 1.2) * ca;
    const g = groundAt(T, fx, fz);
    if (wet(fx, fz)) doors.push(`village ${i + 1} house ${k + 1}: door into water`);
    else if (g < h.floor - V.doorDrop - 0.05) doors.push(`village ${i + 1} house ${k + 1}: door onto a drop of ${(h.floor - g).toFixed(2)} m`);
    else if (g > h.floor + 0.1) doors.push(`village ${i + 1} house ${k + 1}: door into a bank ${(g - h.floor).toFixed(2)} m high`);
    else if (allRects.some((B) => inRect(B.R, fx, fz, 0))) doors.push(`village ${i + 1} house ${k + 1}: door into a neighbour's wall`);
  }));
  out.doors = doors;
  // ---- the walker in each village, and a thousand random walks there ----
  out.walkers = vs.map((v, vi) => villageWalker(w, p, move, v, vi));
  out.ok = out.placed && out.distinct && out.kit && !roadFails.length && !pathFails.length && !overlaps.length && !doors.length && out.walkers.every((x) => x.ok);
  return out;
}

// The walker on a 0.5 m lattice over a village (as the fort's): from its
// centre to every house one can enter and back out, into its barns, onto
// its jetty; then a thousand random walks there.
export function villageWalker(w, p, move, v, vi) {
  const T = w.terrain, STEP = 0.6, HEAD = 1.8, R = 0.3;
  const xs = v.rects.flatMap((r) => [r[0]]), zs = v.rects.flatMap((r) => [r[1]]);
  const pad = 14;
  let x0 = Math.min(v.centre.x, ...xs) - pad, x1 = Math.max(v.centre.x, ...xs) + pad, z0 = Math.min(v.centre.z, ...zs) - pad, z1 = Math.max(v.centre.z, ...zs) + pad;
  // (no bigger than 300 m a side round its centre)
  x0 = Math.max(x0, v.centre.x - 150); x1 = Math.min(x1, v.centre.x + 150); z0 = Math.max(z0, v.centre.z - 150); z1 = Math.min(z1, v.centre.z + 150);
  const key = (ix, iz, ft) => `${ix},${iz},${Math.round(ft * 8)}`;
  const states = new Map(), list = [];
  const addState = (ix, iz, ft) => { const k = key(ix, iz, ft); if (states.has(k)) return states.get(k); const id = list.length; states.set(k, id); list.push({ ix, iz, ft, nb: [] }); return id; };
  // start: beside the well (or the centre), where it is clear
  let st0 = null;
  const c0 = v.well ? [v.well.x, v.well.z] : [v.centre.x, v.centre.z];
  for (let t = 0; t < 64 && !st0; t++) {
    const a = t * 0.7, d = t ? 2 + t * 0.25 : 0, x = c0[0] + Math.cos(a) * d, z = c0[1] + Math.sin(a) * d;
    const ft = groundFeet(w, p, x, z);
    if (!p.blocked(x, z, ft) && groundAt({ ground: T.levels[0].H, N: w.N, NN: w.NN }, x, z) - groundAt(T, x, z) < 0.3) st0 = [Math.round(x * 2), Math.round(z * 2), ft];
  }
  if (!st0) return { ok: false, failed: ['no clear place to start'], states: 0, targets: 0, reached: 0, out: 0, walks: null };
  addState(st0[0], st0[1], groundFeet(w, p, st0[0] / 2, st0[1] / 2));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let h = 0; h < list.length && list.length < 900000; h++) {
    const st = list[h], x = st.ix / 2, z = st.iz / 2;
    for (const [ddx, ddz] of DIRS) {
      const nx = (st.ix + ddx) / 2, nz = (st.iz + ddz) / 2;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
      const l = Math.hypot(ddx, ddz) / 2;
      const r = move(x, z, st.ft, ddx / 2 / l, ddz / 2 / l, l);
      if (!r) continue;
      st.nb.push(addState(st.ix + ddx, st.iz + ddz, r[2]));
    }
  }
  const back = new Uint8Array(list.length), rev = Array.from({ length: list.length }, () => []);
  list.forEach((st, i) => { for (const j of st.nb) rev[j].push(i); });
  // (back out: to the start, or a lattice point beside it at its height; a
  // walker coming back by another way lands on it with its feet an eighth
  // of a metre off, which is another state)
  const qb = [];
  list.forEach((st, i) => { if (Math.abs(st.ix - list[0].ix) <= 1 && Math.abs(st.iz - list[0].iz) <= 1 && Math.abs(st.ft - list[0].ft) <= 0.25) { back[i] = 1; qb.push(i); } });
  for (let h = 0; h < qb.length; h++) for (const i of rev[qb[h]]) if (!back[i]) { back[i] = 1; qb.push(i); }
  const reachedAt = (x, z, y, rad = 0.8, dy = 0.5) => {
    let any = false, outToo = false;
    for (let iz = Math.round((z - rad) * 2); iz <= Math.round((z + rad) * 2); iz++) for (let ix = Math.round((x - rad) * 2); ix <= Math.round((x + rad) * 2); ix++) {
      for (let k = -40; k <= 40; k++) {
        const ft = Math.round(y * 8) / 8 + k / 8;
        if (Math.abs(ft - y) > dy) continue;
        const id = states.get(key(ix, iz, ft));
        if (id === undefined) continue;
        any = true; if (back[id]) outToo = true;
      }
    }
    return { reached: any, out: outToo };
  };
  const targets = [];
  v.enter.forEach((h, k) => targets.push({ name: `inside house ${k + 1} one can enter`, at: [h.x, h.z], y: h.floor + 0.02, rad: 0.9, dy: 0.3 }));
  v.barns.forEach((b, k) => targets.push({ name: `inside barn ${k + 1}`, at: [b.x, b.z], y: b.floor + 0.02, rad: 1.2, dy: 0.3 }));
  if (v.jetty) targets.push({ name: 'the jetty\'s end', at: v.jetty.b, y: v.jetty.y, rad: 1.2, dy: 0.3 });
  v.houses.forEach((h, k) => { const ca = Math.cos(h.a), sa = Math.sin(h.a); targets.push({ name: `house ${k + 1}'s door`, at: [h.x - (h.d + 1.2) * sa, h.z + (h.d + 1.2) * ca], y: groundAt(T, h.x - (h.d + 1.2) * sa, h.z + (h.d + 1.2) * ca), rad: 1.0, dy: 0.6 }); });
  const res = targets.map((t) => ({ name: t.name, ...reachedAt(t.at[0], t.at[1], t.y, t.rad, t.dy) }));
  const failed = res.filter((r) => !r.reached || !r.out).map((r) => `${r.name}${r.reached ? ' (no way back out)' : ''}`);
  // a thousand random walks
  const pool = list.map((st, i) => i).filter((i) => back[i]);
  let through = 0, stuck = 0, inside = 0;
  const ex = [];
  for (let k = 0; k < 1000; k++) {
    const st = list[pool[Math.floor(hash2(k, 1, 4409 + vi) * pool.length)]];
    const yaw0 = hash2(k, 2, 4409 + vi) * Math.PI * 2;
    p.place(st.ix / 2, st.iz / 2, yaw0, 0, st.ft);
    const keys = { KeyW: true };
    let still = 0, px = p.x, pz = p.z, pf = p.feet, bad = null;
    for (let fr = 0; fr < 180; fr++) {
      if (fr % 30 === 0) { p.yaw = yaw0 + (hash2(k, 10 + fr, 4409 + vi) - 0.5) * 2.4; keys.ShiftLeft = hash2(k, 50 + fr, 4409 + vi) < 0.3; keys.KeyD = hash2(k, 90 + fr, 4409 + vi) < 0.15; }
      p.update(1 / 60, keys);
      const dl = Math.hypot(p.x - px, p.z - pz), n = Math.ceil(dl / 0.04);
      for (let s2 = 1; s2 <= n && !bad; s2++) {
        const t = s2 / n, x = px + (p.x - px) * t, z = pz + (p.z - pz) * t;
        if (solidAt(w.kit, x, Math.max(pf, p.feet) + 1.1, z)) bad = 'through';
      }
      if (!bad && bodyBlocked(w.kit, p.x, p.z, p.feet + STEP + 0.02, p.feet + HEAD - 0.02, R * 0.85)) bad = 'inside';
      if (bad) break;
      if (dl < 0.002) still++; else still = 0;
      if (still >= 45) {
        let free = false;
        for (let a = 0; a < 16 && !free; a++) { const ang = a * Math.PI / 8; if (move(p.x, p.z, p.feet, Math.cos(ang), Math.sin(ang), 0.25)) free = true; }
        if (!free) bad = 'stuck';
        still = 0;
      }
      px = p.x; pz = p.z; pf = p.feet;
    }
    if (bad === 'through') through++; else if (bad === 'stuck') stuck++; else if (bad === 'inside') inside++;
    if (bad && ex.length < 4) ex.push({ k, bad, x: +p.x.toFixed(2), z: +p.z.toFixed(2), feet: +p.feet.toFixed(2) });
  }
  const walks = { attempts: 1000, through, stuck, inside, examples: ex };
  return { states: list.length, targets: res.length, reached: res.filter((r) => r.reached).length, out: res.filter((r) => r.reached && r.out).length, failed, walks, ok: !failed.length && !through && !stuck && !inside };
}
