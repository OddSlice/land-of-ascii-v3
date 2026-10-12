// Checks generated worlds, in Node (no browser): for each seed,
//  1. the same seed gives byte-identical world arrays (built twice);
//  2. every recorded site can be reached on foot from the spawn under the
//     walking rules (up nothing steeper than 45 degrees, down anything, since
//     falling does no harm; through water no deeper than the chest);
//  3. no road is steeper than its limit (measured along it, over 4 m), nor
//     runs through water deeper than a ford;
//  4. every river runs downhill (its water never rises) to a lake or the sea;
//  5. no tree stands in water or on a road;
//  6. the sky test: the camera at eye level at 300 random walkable lowland
//     points and 50 points along the roads, looking level in four
//     directions; the share of each frame that is sky (or cloud, sun, moon,
//     stars) must have a median of at least 35% with fewer than one view in
//     ten under 15%. Frames are 360 x 112 cells (the default density at
//     1440 x 900), the vertical field of view 60 degrees, at 14:00 with every
//     clock frozen, the settled look, rendered by the real CPU backend.
//  7. far readability (phase 2a): from the spawn and from each of the four
//     viewpoints, looking their way at 14:00, the main lake, a river, a
//     forest (conifers over 150 m away) and a road that are in view must each
//     differ from the cells round them by a visible step in the resolved
//     colours (a mean background more than 6 levels apart in some channel,
//     the flicker tool's visible step), and from the spawn the range's lit
//     and shaded faces must differ by one too: within one material (rock,
//     snow or meadow over 800 m away), the quarter of its cells the most
//     light reaches against the quarter the least does.
//
//  8. (phase 3a) the fort: it is placed and its road enters its gate (the
//     road's end lies in the yard, a road point lies in the gate's passage,
//     and the ground along the road from 30 m out to the yard rises or falls
//     no more than the roads' limit between points a metre apart: no step);
//     a walker under the walking rules and the building kit's exact
//     collision (the game's own Player) can go from the gate's mouth
//     through the passage, across the yard, up each stone stair, along the
//     whole wall walk (points every 4 m on every run of wall), into each
//     tower and up to its top, into the keep's hall, and from each of those
//     back out of the gate; a thousand random walking attempts from places
//     in and round the fort (3 s each, turning now and then) never pass
//     through a wall, never get stuck and never leave the walker inside
//     solid stone; no tree stands in the fort or the margin round it.
//  9. (phase 3a) far readability also counts the fort: from the spawn,
//     turned toward it, it must differ from the cells round it by a visible step.
// 10. (phase 3b) the villages: all three placed, each a different pattern,
//     with 8 to 20 houses, a chapel, a well, one or two barns, a signpost and
//     at least two lanterns; every road walked end to end (across every
//     bridge) and every footpath; no building, fence or field over a road,
//     water, the fort or another; no door onto a drop, into water or into a
//     neighbour; a walker reaches every house one can enter, every barn, the
//     jetty's end and every door from the well and gets back out; a thousand
//     random walks in each village never pass through a wall, get stuck or
//     end inside anything; and from its viewpoint each village differs from
//     its surroundings by a visible step by day and shows at least two lit
//     cells at night.
//
//   node tools/world-check.mjs [--seeds 1,2,3,4,5] [--points 300] [--road 50] [--out file.json]
//   node tools/world-check.mjs --fort-only --sweep 60 [--from 1000]   (phase 3a) the fort's
//         checks (8) alone on sixty random seeds
import fs from 'node:fs';
import path from 'node:path';
import { args, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld, worldHash } from '../src/world/pack.js';
import { makeFrame } from '../src/world/gen/land.js';
import { createCpuBackend } from '../src/scene/cpu/backend.js';
import { HIT_STRIDE, CELL_STRIDE, MAT, MAT_NAMES } from '../src/contract.js';
import { resolveStripe, makePalette } from '../src/resolve.js';
import { KIND } from '../src/world/gen/water.js';
import { LOOK } from '../src/look.js';
import { SCALE } from '../src/world/scale.js';
import { groundAt } from '../src/world/objects.js';
import { spanAt } from '../src/world/spans.js';
import { hash2 } from '../src/world/noise.js';
import { Player } from '../src/app/player.js';
import { solidAt, bodyBlocked, PF, P as KP, P_STRIDE } from '../src/world/kit.js';
import { inPoly, polyDist } from '../src/world/gen/fort.js';

const a = args();
// (the default seed and four others: 3, 1, 2, 4, 5)
const seeds = String(a.seeds || [DEFAULT_SEED, ...[1, 2, 3, 4, 5].filter((s) => s !== DEFAULT_SEED)].slice(0, 5).join(',')).split(',').map(Number);
const nPts = Number(a.points || 300), nRoad = Number(a.road || 50);

function build(seed) {
  const g = generateWorld(seed);
  let r;
  while (!(r = g.next()).done);
  return r.value;
}

// 2. Reachable nodes from the spawn on the 1 m grid.
function reach(w) {
  const N = w.N, NN = w.NN, G = w.terrain.ground, S = w.terrain.levels[0].H, sp = w.spans;
  const ok = new Uint8Array(NN * NN);
  for (let j = 0; j < NN * NN; j++) {
    const i = j % NN, k = (j - i) / NN;
    if (i < 1 || k < 1 || i > N - 1 || k > N - 1) continue;
    if (S[j] - G[j] > SCALE.chest) continue;
    const s = spanAt(sp, i, k);
    // the wall blocks; its gate does not
    if (s >= 0 && !(sp.flags[s] & 2)) continue;
    ok[j] = 1;
  }
  const seen = new Uint8Array(NN * NN), q = new Int32Array(NN * NN);
  const s0 = Math.round(w.start.z) * NN + Math.round(w.start.x);
  let h = 0, t = 0;
  if (ok[s0]) { seen[s0] = 1; q[t++] = s0; }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (h < t) {
    const j = q[h++];
    for (const [dx, dz, d] of nb) {
      const m = j + dz * NN + dx;
      if (seen[m] || !ok[m]) continue;
      if (G[m] - G[j] > SCALE.climb * d) continue;   // too steep to walk up
      seen[m] = 1; q[t++] = m;
    }
  }
  const at = (x, z) => {
    // a site counts if any node within 3 m of it is reached
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (seen[(Math.round(z) + dz) * NN + Math.round(x) + dx]) return true;
    return false;
  };
  const s = w.sites;
  const list = [['fort (gate)', s.fort.front], ...s.villages.map((v, i) => [`village ${i + 1}`, v]), ...s.viewpoints.map((v, i) => [`viewpoint ${i + 1}`, v])];
  return { reached: t, sites: list.map(([name, p]) => ({ name, ok: at(p.x, p.z) })) };
}

// 3. Roads: steepest over 4 m along the centre line, deepest water crossed.
function roads(w) {
  const T = w.terrain, surf = { ground: T.levels[0].H, N: w.N, NN: w.NN };
  let steep = 0, deep = 0, where = null;
  for (const r of w.roads) {
    // (phase 3b: over a bridge, the bridge's road is what is walked)
    const on = (q) => onBridge(w, r.x[q], r.z[q]);
    for (let q = 0; q + 4 < r.n; q++) {
      // (a bridge's deck is laid where the road's bed is, 0.1 m under its line)
      const y0 = on(q) ? r.y[q] - 0.1 : groundAt(surf, r.x[q], r.z[q]), y1 = on(q + 4) ? r.y[q + 4] - 0.1 : groundAt(surf, r.x[q + 4], r.z[q + 4]);
      // the gradient along the road (round a hairpin the straight line is shorter)
      let run = 0;
      for (let u = q; u < q + 4; u++) run += Math.hypot(r.x[u + 1] - r.x[u], r.z[u + 1] - r.z[u]);
      const sl = Math.abs(y1 - y0) / Math.max(1e-6, run);
      if (sl > steep) { steep = sl; where = [Math.round(r.x[q]), Math.round(r.z[q])]; }
      if (!on(q)) deep = Math.max(deep, groundAt(surf, r.x[q], r.z[q]) - groundAt(T, r.x[q], r.z[q]));
    }
  }
  return { steep, deep, where, ok: steep <= SCALE.road.maxSlope && deep <= SCALE.river.ford };
}

// (phase 3b) Is (x, z) on one of the world's bridges?
function onBridge(w, x, z) {
  for (const b of w.sites.bridges || []) {
    const dx = x - b.x, dz = z - b.z, u = dx * Math.cos(b.a) + dz * Math.sin(b.a), v = -dx * Math.sin(b.a) + dz * Math.cos(b.a);
    if (Math.abs(u) <= b.len / 2 + 0.5 && Math.abs(v) <= 3) return true;
  }
  return false;
}

// 4. Rivers: the water never rises downstream, and the river ends in a lake or the sea.
function rivers(w) {
  const out = [];
  for (const r of w.rivers) {
    let rises = 0;
    for (let q = 0; q + 1 < r.n; q++) if (r.level[q + 1] > r.level[q] + 1e-4) rises++;
    const e = r.n - 1;
    const end = Math.abs(r.level[e] - SCALE.sea) < 1e-3 ? 'sea' : r.lake[e] >= 0 ? 'lake' : 'neither';
    out.push({ n: r.n, rises, end, ok: rises === 0 && end !== 'neither' });
  }
  return out;
}

// 5. Trees: none in water, none on a road.
function trees(w) {
  const T = w.terrain, NN = w.NN;
  let wet = 0, road = 0;
  for (const t of w.objects.trees) {
    const j = Math.round(t.z) * NN + Math.round(t.x);
    if (T.wWater[j] > 0 || T.levels[0].H[j] > T.ground[j] + 1e-3) wet++;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (T.wRoad[j + dz * NN + dx] > 0) { road++; dz = dx = 2; }
  }
  return { count: w.objects.trees.length, wet, road, ok: wet === 0 && road === 0 };
}

// 6. The sky test.
function sky(w, seed) {
  const N = w.N, NN = w.NN, G = w.terrain.ground, frame = makeFrame(seed, N), P = {};
  const be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE);
  const look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  const render = (x, z, yawDeg) => {
    const cam = { x, z, y: groundAt(w.terrain, x, z) + SCALE.eye, yaw: yawDeg * Math.PI / 180, pitch: 0 };
    const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 12.5, look };
    for (let i = 0; i < 400; i++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    let n = 0;
    for (let c = 0; c < cols * rows; c++) if (hits[c * HIT_STRIDE] <= MAT.STAR) n++;
    return n / (cols * rows);
  };
  const pts = [];
  for (let t = 0; pts.length < nPts && t < 200000; t++) {
    const x = 20 + (N - 40) * hash2(t, 1, seed + 991), z = 20 + (N - 40) * hash2(t, 2, seed + 991);
    const j = Math.round(z) * NN + Math.round(x);
    if (w.terrain.wWater[j]) continue;
    frame.at(x, z, P);
    if (P.g > 0 || P.c < 0) continue;
    if (Math.hypot(G[j + 1] - G[j - 1], G[j + NN] - G[j - NN]) / 2 > SCALE.climb) continue;
    pts.push({ x, z, kind: 'lowland', yaw: 360 * hash2(t, 3, seed + 991) });
  }
  const total = w.roads.reduce((s, r) => s + r.n, 0);
  for (let q = 0; q < nRoad; q++) {
    let d = Math.floor((q + 0.5) / nRoad * total);
    for (const r of w.roads) { if (d < r.n) { pts.push({ x: r.x[d], z: r.z[d], kind: 'road', yaw: 360 * hash2(q, 4, seed + 991) }); break; } d -= r.n; }
  }
  const shares = [];
  for (const p of pts) for (let k = 0; k < 4; k++) shares.push({ s: render(p.x, p.z, p.yaw + 90 * k), kind: p.kind });
  const sorted = shares.map((v) => v.s).sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)];
  const low = sorted.filter((v) => v < 0.15).length / sorted.length;
  const roadMed = shares.filter((v) => v.kind === 'road').map((v) => v.s).sort((p, q) => p - q);
  return { views: sorted.length, median, low, p10: sorted[Math.floor(sorted.length * 0.1)], roadMedian: roadMed[Math.floor(roadMed.length / 2)], ok: median >= 0.35 && low < 0.1 };
}

// 7. Far readability.
const STEP = 6;
function farRead(w, gw) {
  const N = w.N, NN = w.NN, kind = gw.kindMap, level = gw.levelMap, lake = gw.sites.lake;
  const be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE), cells = new Uint8Array(cols * rows * CELL_STRIDE);
  const look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  // (phase 3a) and from the spawn turned toward the fort, aimed a little
  // over its yard, which must read: its stone, timber, plaster, roofs and
  // windows against the cells round them
  const fort = w.sites.fort, fy = groundAt(w.terrain, w.start.x, w.start.z) + SCALE.eye, fd = Math.hypot(fort.x - w.start.x, fort.z - w.start.z);
  const spots = [{ name: 'spawn', x: w.start.x, z: w.start.z, yaw: w.start.yaw, pitch: 0, range: true },
    { name: 'spawn, toward the fort', x: w.start.x, z: w.start.z, yaw: Math.atan2(fort.x - w.start.x, fort.z - w.start.z) * 180 / Math.PI, pitch: Math.atan2(fort.base + 4 - fy, fd) * 180 / Math.PI, fort: true },
    ...w.sites.viewpoints.map((v, i) => ({ name: `viewpoint ${i + 1}`, x: v.x, z: v.z, yaw: v.yaw, pitch: -6 }))];
  const fortFoot = (x, z) => polyDist(fort.poly, x, z) < 8;
  const KITMAT = new Set([MAT.STONE, MAT.MASONRY, MAT.TIMBER, MAT.PLASTER, MAT.ROOF, MAT.WINDOW]);
  const out = [];
  for (const sp of spots) {
    const cam = { x: sp.x, z: sp.z, y: groundAt(w.terrain, sp.x, sp.z) + SCALE.eye, yaw: sp.yaw * Math.PI / 180, pitch: sp.pitch * Math.PI / 180 };
    const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 12.5, day: 0, look };
    for (let i = 0; i < 400; i++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    const rec = hits.slice();
    resolveStripe(makePalette(f.hour, 0, 'moon'), hits, cells, cols, rows, 0, f);
    // each cell's ray (the contract's own), to find where it lands
    const ty = Math.tan(f.fovY / 2), tx = ty * f.aspect, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
    const cls = new Int8Array(cols * rows).fill(-1);    // 0 lake, 1 river, 2 forest, 3 road, 4 the fort
    const faces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c, o = k * HIT_STRIDE, m = rec[o], d = (rec[o + 6] | (rec[o + 7] << 8)) / 10;
      const X = (2 * (c + 0.5) / cols - 1) * tx, Y = (1 - 2 * (r + 0.5) / rows) * ty;
      const fz = cp - Y * spp, fy = Y * cp + spp, len = Math.hypot(X, fy, fz);
      const hx = cam.x + (X * cy0 + fz * sy0) / len * d, hz = cam.z + (-X * sy0 + fz * cy0) / len * d;
      const j = Math.round(Math.max(0, Math.min(N, hz))) * NN + Math.round(Math.max(0, Math.min(N, hx)));
      if (sp.fort) { if (KITMAT.has(m) && fortFoot(hx, hz)) cls[k] = 4; continue; }
      if (m === MAT.WATER && d < 6500) {
        if (kind[j] === KIND.LAKE && Math.abs(level[j] - lake.level) < 0.3) cls[k] = 0;
        else if (kind[j] === KIND.RIVER) cls[k] = 1;
      } else if ((m === MAT.CONIFER || m === MAT.TRUNK) && d > 150) cls[k] = 2;
      else if (m === MAT.DIRT) cls[k] = 3;
      if (sp.range && d > 800 && d < 6500 && (m === MAT.ROCK || m === MAT.SNOW || m === MAT.GRASS)) faces.push([m, k, rec[o + 1] * (1 - rec[o + 2] / 255)]);
    }
    const mean = (list) => { const s = [0, 0, 0]; for (const k of list) for (let q = 0; q < 3; q++) s[q] += cells[k * CELL_STRIDE + q]; return s.map((v) => v / list.length); };
    const step = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const res = { name: sp.name, features: {} };
    ['main lake', 'river', 'forest', 'road', 'fort'].forEach((name, q) => {
      if ((q === 4) !== !!sp.fort) return;
      const inside = [], round = [];
      for (let k = 0; k < cols * rows; k++) if (cls[k] === q) inside.push(k);
      if (inside.length < 6) { res.features[name] = null; return; }
      const seen = new Uint8Array(cols * rows);
      for (const k of inside) {
        const c = k % cols, r = (k - c) / cols;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const kk = rr * cols + cc;
          if (seen[kk] || cls[kk] === q || rec[kk * HIT_STRIDE] <= MAT.STAR || rec[kk * HIT_STRIDE] === MAT.CLOUD) continue;
          seen[kk] = 1; round.push(kk);
        }
      }
      if (round.length < 6) { res.features[name] = null; return; }
      const s = step(mean(inside), mean(round));
      res.features[name] = { cells: inside.length, step: +s.toFixed(1), ok: s > STEP };
    });
    if (sp.range) {
      // lit against shaded, within one material (snow against rock would say nothing)
      let best = null;
      for (const m of [MAT.ROCK, MAT.SNOW, MAT.GRASS]) {
        const list = faces.filter((v) => v[0] === m).sort((p, q) => p[2] - q[2] || p[1] - q[1]);
        if (list.length < 24) continue;
        const qn = Math.floor(list.length / 4);
        const b = list.slice(0, qn).map((v) => v[1]), a = list.slice(list.length - qn).map((v) => v[1]);
        const s = step(mean(a), mean(b));
        if (!best || s > best.step) best = { material: MAT_NAMES[m], lit: a.length, shaded: b.length, step: +s.toFixed(1), ok: s > STEP };
      }
      res.range = best || { ok: false, note: 'range faces not in view' };
    }
    // (the fort must be there to read; the others only where they are seen)
    res.ok = Object.values(res.features).every((v) => !v || v.ok) && (!sp.range || res.range.ok) && (!sp.fort || !!res.features.fort);
    out.push(res);
  }
  return { spots: out, ok: out.every((s) => s.ok) };
}

// 7b. (phase 3b) Each village must read clearly from at least one viewpoint
// (its buildings against the cells round them, as the far features), and
// from that same viewpoint its lights must show at night.
function villageRead(w) {
  const N = w.N, NN = w.NN, be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE), cells = new Uint8Array(cols * rows * CELL_STRIDE);
  const look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  const out = [];
  w.sites.villages.forEach((v, vi) => {
    const p = v.plan, c = p.centre, R = p.radius + 6;
    let best = null;
    for (const [i, vp] of w.sites.viewpoints.entries()) {
      const ey = groundAt(w.terrain, vp.x, vp.z) + SCALE.eye, d = Math.hypot(c.x - vp.x, c.z - vp.z);
      if (d > 1400) continue;
      const cam = { x: vp.x, z: vp.z, y: ey, yaw: Math.atan2(c.x - vp.x, c.z - vp.z), pitch: Math.atan2(c.y + 3 - ey, d) };
      const shot = (hour) => {
        const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour, t: 12.5, day: 0, look };
        for (let k = 0; k < 400; k++) { be.render(f, 0, cols, hits); if (be.settled) break; }
        const rec = hits.slice();
        resolveStripe(makePalette(hour, 0, 'moon'), hits, cells, cols, rows, 0, f);
        const ty = Math.tan(f.fovY / 2), tx = ty * f.aspect, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
        const inV = new Uint8Array(cols * rows);
        for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
          const k = r * cols + cc, o = k * HIT_STRIDE, dd = (rec[o + 6] | (rec[o + 7] << 8)) / 10;
          const X = (2 * (cc + 0.5) / cols - 1) * tx, Y = (1 - 2 * (r + 0.5) / rows) * ty;
          const fz = cp - Y * spp, fy = Y * cp + spp, len = Math.hypot(X, fy, fz);
          const hx = cam.x + (X * cy0 + fz * sy0) / len * dd, hz = cam.z + (-X * sy0 + fz * cy0) / len * dd;
          if (Math.hypot(hx - c.x, hz - c.z) <= R) inV[k] = 1;
        }
        return { rec, cells: cells.slice(), inV };
      };
      const day = shot(LOOK.hours.day);
      const inside = [], round = [];
      for (let k = 0; k < cols * rows; k++) if (day.inV[k] && KITMAT_V.has(day.rec[k * HIT_STRIDE])) inside.push(k);
      if (inside.length < 6) continue;
      const seen = new Uint8Array(cols * rows), isIn = new Uint8Array(cols * rows);
      for (const k of inside) isIn[k] = 1;
      for (const k of inside) {
        const cc = k % cols, r = (k - cc) / cols;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, c2 = cc + dc;
          if (rr < 0 || c2 < 0 || rr >= rows || c2 >= cols) continue;
          const kk = rr * cols + c2;
          if (seen[kk] || isIn[kk] || day.rec[kk * HIT_STRIDE] <= MAT.STAR || day.rec[kk * HIT_STRIDE] === MAT.CLOUD) continue;
          seen[kk] = 1; round.push(kk);
        }
      }
      if (round.length < 6) continue;
      const mean = (list) => { const sm = [0, 0, 0]; for (const k of list) for (let q = 0; q < 3; q++) sm[q] += day.cells[k * CELL_STRIDE + q]; return sm.map((x) => x / list.length); };
      const A = mean(inside), B = mean(round), step = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
      const night = shot(LOOK.hours.night);
      let lights = 0;
      for (let k = 0; k < cols * rows; k++) { const m = night.rec[k * HIT_STRIDE]; if (night.inV[k] && (m === MAT.WINDOW || m === MAT.FLAME)) lights++; }
      const res = { viewpoint: i + 1, dist: Math.round(d), cells: inside.length, step: +step.toFixed(1), lights, ok: step > STEP && lights >= 2 };
      if (!best || (res.ok && !best.ok) || (res.ok === best.ok && res.step > best.step)) best = res;
    }
    out.push({ village: vi + 1, pattern: p.pattern, ...(best || { ok: false, note: 'seen from no viewpoint' }) });
  });
  return { villages: out, ok: out.every((x) => x.ok) };
}

// 8. The fort.
function fortChecks(w) {
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
function makeMove(w, p) {
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
const groundFeet = (w, p, x, z) => p.supportAt(x, z, groundAt(w.terrain, x, z) + 0.3);
function walkLine(w, p, move, xs, zs, n) {
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

const KITMAT_V = new Set([MAT.STONE, MAT.MASONRY, MAT.TIMBER, MAT.TIMBER2, MAT.TIMBER3, MAT.PLASTER, MAT.PLASTER2, MAT.PLASTER3, MAT.ROOF, MAT.THATCH, MAT.WINDOW]);

function villageChecks(w) {
  const T = w.terrain, N = w.N, NN = w.NN, K = SCALE.kit, V = SCALE.village;
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
function villageWalker(w, p, move, v, vi) {
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

function printVillages(seed, vc) {
  console.log(`  villages: ${vc.ok ? 'ok' : 'FAIL'}, patterns ${vc.patterns.join(', ')}${vc.distinct ? '' : ' (NOT ALL DIFFERENT)'}; ${vc.counts.map((c, i) => c ? `village ${i + 1}: ${c.houses} houses (${c.enter} to enter), ${c.barns} barns, chapel ${c.chapel ? 'yes' : 'NO'}, well ${c.well ? 'yes' : 'NO'}, signpost ${c.signpost ? 'yes' : 'NO'}, ${c.lanterns} lanterns, ${c.fields} fields, ${c.paths} paths${c.jetty ? ', a jetty' : ''}${c.shelter ? ', a market shelter' : ''}` : 'NONE').join('; ')}`);
  console.log(`  by road: ${vc.roadsWalked.roads} roads walked, ${vc.roadsWalked.bridges} bridges${vc.roadsWalked.failed.length ? `; FAILED at ${vc.roadsWalked.failed.join('; ')}` : ', all passable'}; footpaths ${vc.pathsWalked.paths}${vc.pathsWalked.failed.length ? `; FAILED: ${vc.pathsWalked.failed.join('; ')}` : ', all passable'}`);
  console.log(`  overlaps ${vc.overlaps.length ? vc.overlaps.slice(0, 6).join('; ') : 'none'}; doors ${vc.doors.length ? vc.doors.slice(0, 6).join('; ') : 'all onto firm ground'}`);
  vc.walkers.forEach((wk, i) => console.log(`  village ${i + 1} walker: ${wk.reached} of ${wk.targets} places reached, ${wk.out} with a way back out (${wk.states} states)${wk.failed.length ? `; FAILED: ${wk.failed.slice(0, 6).join('; ')}` : ''}; random walks through a wall ${wk.walks ? wk.walks.through : '-'}, stuck ${wk.walks ? wk.walks.stuck : '-'}, inside ${wk.walks ? wk.walks.inside : '-'}${wk.walks && wk.walks.examples.length ? ` e.g. ${JSON.stringify(wk.walks.examples)}` : ''}`));
}

function printFort(seed, ft) {
  console.log(`  fort: ${ft.ok ? 'ok' : 'FAIL'}, ${ft.towers} towers, ${ft.stairs} stairs; road in the gate's passage ${ft.road.inPassage}, ending in the yard ${ft.road.endInYard}, steepest near the gate ${(100 * ft.road.worstStep).toFixed(1)}% over 4 m, biggest rise in a metre ${ft.road.worstRise.toFixed(2)} m; trees in the fort or its margin ${ft.treesIn}`);
  console.log(`  walker: ${ft.walker.reached} of ${ft.walker.targets} places reached, ${ft.walker.out} of them with a way back out (${ft.walker.states} states)${ft.walker.failed.length ? `; FAILED: ${ft.walker.failed.join('; ')}` : ''}`);
  console.log(`  random walks: ${ft.walks.attempts}, through a wall ${ft.walks.through}, stuck ${ft.walks.stuck}, inside stone ${ft.walks.inside}${ft.walks.examples.length ? ` e.g. ${JSON.stringify(ft.walks.examples)}` : ''}`);
}

if (a['fort-only']) {
  const n = Number(a.sweep || 60), from = Number(a.from || 1000);
  const list = a.seeds ? seeds : Array.from({ length: n }, (_, i) => from + i * 7919 % 100000);
  const rows = [];
  for (const seed of list) {
    let ft, vc, err = null;
    try { const w = unpackWorld(packWorld(build(seed))); ft = fortChecks(w); vc = villageChecks(w); } catch (e) { err = String(e.stack || e); }
    rows.push({ seed, ft, vc, err, approach: null });
    if (err) console.log(`seed ${seed}: FAIL ${err}`); else {
      console.log(`seed ${seed}: ${ft.ok && vc.ok ? 'PASS' : 'FAIL'}${ft.ok ? '' : ' (the fort)'}${vc.ok ? '' : ' (the villages)'}`);
      if (!ft.ok || a.detail) printFort(seed, ft);
      if (!vc.ok || a.detail) printVillages(seed, vc);
    }
  }
  const okN = rows.filter((r) => r.ft && r.ft.ok && r.vc && r.vc.ok).length;
  console.log(`\n${okN} of ${rows.length} seeds pass the fort's and the villages' checks`);
  const V = rows.filter((r) => r.vc);
  const sum = (f) => V.reduce((s2, r) => s2 + f(r), 0);
  console.log(`villages: all three placed, each a different pattern, on ${V.filter((r) => r.vc.placed && r.vc.distinct).length} of ${V.length}; houses ${Math.min(...V.flatMap((r) => r.vc.counts.map((c) => c.houses)))} to ${Math.max(...V.flatMap((r) => r.vc.counts.map((c) => c.houses)))}; roads walked ${sum((r) => r.vc.roadsWalked.roads)} (${sum((r) => r.vc.roadsWalked.failed.length)} blocked), bridges ${sum((r) => r.vc.roadsWalked.bridges)}, footpaths ${sum((r) => r.vc.pathsWalked.paths)} (${sum((r) => r.vc.pathsWalked.failed.length)} blocked); overlaps ${sum((r) => r.vc.overlaps.length)}, bad doors ${sum((r) => r.vc.doors.length)}`);
  console.log(`village walkers: places reached and back out ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + x.out, 0))} of ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + x.targets, 0))}; random walks through a wall ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.through : 0), 0))}, stuck ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.stuck : 0), 0))}, inside ${sum((r) => r.vc.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.inside : 0), 0))} (of ${V.length * 3000})`);
  console.log(`walker places reached and back out: ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walker.out, 0)} of ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walker.targets, 0)}; random walks through a wall ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.through, 0)}, stuck ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.stuck, 0)}, inside stone ${rows.filter((r) => r.ft).reduce((s, r) => s + r.ft.walks.inside, 0)} (of ${rows.filter((r) => r.ft).length * 1000})`);
  fs.mkdirSync(path.join(ROOT, 'shots', 'world-check'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', 'world-check', `fort-sweep-${list.length}.json`), JSON.stringify(rows, null, 1));
  process.exit(okN === rows.length ? 0 : 1);
}

const results = [];
for (const seed of seeds) {
  const t0 = performance.now();
  const w1 = build(seed);
  const buildMs = performance.now() - t0;
  const h1 = worldHash(packWorld(w1)), h2 = worldHash(packWorld(build(seed)));
  const w = unpackWorld(packWorld(w1));
  const r = {
    seed, buildMs: Math.round(buildMs), hash: h1, same: h1 === h2,
    reach: reach(w), roads: roads(w), rivers: rivers(w), trees: trees(w),
    lakes: w.lakes.length, mainLake: w.sites.lake.area, villages: w.sites.villages.length, viewpoints: w.sites.viewpoints.length,
  };
  r.sky = sky(w, seed);
  r.far = farRead(w, w1);
  r.vread = villageRead(w);
  // (phase 3a) the fort's checks (8); (phase 3b) the villages' (9)
  r.fort = fortChecks(w);
  r.vil = villageChecks(w);
  r.ok = r.same && r.reach.sites.every((s) => s.ok) && r.roads.ok && r.rivers.every((v) => v.ok) && r.trees.ok && r.sky.ok && r.far.ok && r.villages === 3 && r.viewpoints === 4 && r.fort.ok && r.vil.ok && r.vread.ok;
  results.push(r);
  const pc = (x) => `${(100 * x).toFixed(1)}%`;
  console.log(`seed ${seed}: ${r.ok ? 'PASS' : 'FAIL'}  build ${r.buildMs} ms, hash ${h1} ${r.same ? '(same twice)' : `!= ${h2}`}`);
  console.log(`  reach: ${r.reach.sites.map((s) => `${s.name} ${s.ok ? 'ok' : 'NOT REACHED'}`).join(', ')}`);
  console.log(`  roads: steepest ${pc(r.roads.steep)} (limit ${pc(SCALE.road.maxSlope)}) at ${r.roads.where}, deepest water ${r.roads.deep.toFixed(2)} m (ford ${SCALE.river.ford} m)`);
  console.log(`  rivers: ${r.rivers.map((v) => `${v.n} m to the ${v.end}${v.rises ? `, rises ${v.rises}x` : ''}`).join('; ')}`);
  console.log(`  trees: ${r.trees.count}, in water ${r.trees.wet}, on a road ${r.trees.road}; lakes ${r.lakes} (main ${r.mainLake} m2), villages ${r.villages}, viewpoints ${r.viewpoints}`);
  console.log(`  sky: median ${pc(r.sky.median)}, under 15% ${pc(r.sky.low)}, 10th percentile ${pc(r.sky.p10)}, road views median ${pc(r.sky.roadMedian)} (${r.sky.views} views)`);
  for (const s of r.far.spots) {
    const fs2 = Object.entries(s.features).map(([k, v]) => `${k} ${v ? `${v.step}${v.ok ? '' : ' TOO FAINT'}` : 'not in view'}`).join(', ');
    console.log(`  far, from the ${s.name}: ${fs2}${s.range ? `; range lit/shaded ${s.range.step !== undefined ? `${s.range.step} (${s.range.material})` : s.range.note}${s.range.ok ? '' : ' TOO FAINT'}` : ''}`);
  }
  printFort(seed, r.fort);
  printVillages(seed, r.vil);
  console.log(`  villages from the viewpoints: ${r.vread.villages.map((x) => x.viewpoint ? `village ${x.village} (${x.pattern}) from viewpoint ${x.viewpoint}, ${x.dist} m: step ${x.step}${x.step > STEP ? '' : ' TOO FAINT'}, ${x.lights} light cells at night${x.lights >= 2 ? '' : ' (TOO FEW)'}` : `village ${x.village}: ${x.note}`).join('; ')}`);
}
const out = a.out || path.join(ROOT, 'shots', 'world-check', `world-check-${seeds.join('-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 1));
const pc = (x) => `${(100 * x).toFixed(1)}%`;
console.log('\n| seed | same twice | sites reached | steepest road | rivers downhill to lake/sea | trees in water / on roads | sky median | views under 15% | far readability: weakest step | the fort | the villages | villages from a viewpoint (step, lights) | result |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const steps = r.far.spots.flatMap((s) => [...Object.values(s.features).filter(Boolean).map((v) => v.step), ...(s.range && s.range.step !== undefined ? [s.range.step] : [])]);
  console.log(`| ${r.seed} | ${r.same ? 'yes' : 'NO'} | ${r.reach.sites.filter((s) => s.ok).length} of ${r.reach.sites.length} | ${pc(r.roads.steep)} | ${r.rivers.filter((v) => v.ok).length} of ${r.rivers.length} | ${r.trees.wet} / ${r.trees.road} | ${pc(r.sky.median)} | ${pc(r.sky.low)} | ${r.far.ok ? 'pass' : 'FAIL'}, ${Math.min(...steps)} | ${r.fort.ok ? 'pass' : 'FAIL'}: ${r.fort.walker.out} of ${r.fort.walker.targets} places, walks ${r.fort.walks.through + r.fort.walks.stuck + r.fort.walks.inside} bad | ${r.vil.ok ? 'pass' : 'FAIL'}: ${r.vil.walkers.reduce((s2, x) => s2 + x.out, 0)} of ${r.vil.walkers.reduce((s2, x) => s2 + x.targets, 0)} places, walks ${r.vil.walkers.reduce((s2, x) => s2 + (x.walks ? x.walks.through + x.walks.stuck + x.walks.inside : 0), 0)} bad | ${r.vread.villages.map((x) => (x.viewpoint ? `${x.step}, ${x.lights}` : 'none')).join('; ')} | ${r.ok ? 'pass' : 'FAIL'} |`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
