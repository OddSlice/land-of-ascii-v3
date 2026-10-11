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
//   node tools/world-check.mjs [--seeds 1,2,3,4,5] [--points 300] [--road 50] [--out file.json]
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

const a = args();
const seeds = String(a.seeds || `${DEFAULT_SEED},2,3,4,5`).split(',').map(Number);
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
    for (let q = 0; q + 4 < r.n; q++) {
      const y0 = groundAt(surf, r.x[q], r.z[q]), y1 = groundAt(surf, r.x[q + 4], r.z[q + 4]);
      // the gradient along the road (round a hairpin the straight line is shorter)
      let run = 0;
      for (let u = q; u < q + 4; u++) run += Math.hypot(r.x[u + 1] - r.x[u], r.z[u + 1] - r.z[u]);
      const sl = Math.abs(y1 - y0) / Math.max(1e-6, run);
      if (sl > steep) { steep = sl; where = [Math.round(r.x[q]), Math.round(r.z[q])]; }
      deep = Math.max(deep, groundAt(surf, r.x[q], r.z[q]) - groundAt(T, r.x[q], r.z[q]));
    }
  }
  return { steep, deep, where, ok: steep <= SCALE.road.maxSlope && deep <= SCALE.river.ford };
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
  const look = { tree: 'B', cloud: 'B', meadow: 2, shallows: 'blue' };
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
  const look = { tree: 'B', cloud: 'B', meadow: 2, shallows: 'blue' };
  const spots = [{ name: 'spawn', x: w.start.x, z: w.start.z, yaw: w.start.yaw, pitch: 0, range: true },
    ...w.sites.viewpoints.map((v, i) => ({ name: `viewpoint ${i + 1}`, x: v.x, z: v.z, yaw: v.yaw, pitch: -6 }))];
  const out = [];
  for (const sp of spots) {
    const cam = { x: sp.x, z: sp.z, y: groundAt(w.terrain, sp.x, sp.z) + SCALE.eye, yaw: sp.yaw * Math.PI / 180, pitch: sp.pitch * Math.PI / 180 };
    const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 12.5, day: 0, look };
    for (let i = 0; i < 400; i++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    const rec = hits.slice();
    resolveStripe(makePalette(f.hour, 0, 'moon'), hits, cells, cols, rows, 0, f);
    // each cell's ray (the contract's own), to find where it lands
    const ty = Math.tan(f.fovY / 2), tx = ty * f.aspect, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
    const cls = new Int8Array(cols * rows).fill(-1);    // 0 lake, 1 river, 2 forest, 3 road
    const faces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c, o = k * HIT_STRIDE, m = rec[o], d = (rec[o + 6] | (rec[o + 7] << 8)) / 10;
      const X = (2 * (c + 0.5) / cols - 1) * tx, Y = (1 - 2 * (r + 0.5) / rows) * ty;
      const fz = cp - Y * spp, fy = Y * cp + spp, len = Math.hypot(X, fy, fz);
      const hx = cam.x + (X * cy0 + fz * sy0) / len * d, hz = cam.z + (-X * sy0 + fz * cy0) / len * d;
      const j = Math.round(Math.max(0, Math.min(N, hz))) * NN + Math.round(Math.max(0, Math.min(N, hx)));
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
    ['main lake', 'river', 'forest', 'road'].forEach((name, q) => {
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
    res.ok = Object.values(res.features).every((v) => !v || v.ok) && (!sp.range || res.range.ok);
    out.push(res);
  }
  return { spots: out, ok: out.every((s) => s.ok) };
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
  r.ok = r.same && r.reach.sites.every((s) => s.ok) && r.roads.ok && r.rivers.every((v) => v.ok) && r.trees.ok && r.sky.ok && r.far.ok && r.villages === 3 && r.viewpoints === 4;
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
}
const out = a.out || path.join(ROOT, 'shots', 'world-check', `world-check-${seeds.join('-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(results, null, 1));
const pc = (x) => `${(100 * x).toFixed(1)}%`;
console.log('\n| seed | same twice | sites reached | steepest road | rivers downhill to lake/sea | trees in water / on roads | sky median | views under 15% | far readability: weakest step | result |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const steps = r.far.spots.flatMap((s) => [...Object.values(s.features).filter(Boolean).map((v) => v.step), ...(s.range && s.range.step !== undefined ? [s.range.step] : [])]);
  console.log(`| ${r.seed} | ${r.same ? 'yes' : 'NO'} | ${r.reach.sites.filter((s) => s.ok).length} of ${r.reach.sites.length} | ${pc(r.roads.steep)} | ${r.rivers.filter((v) => v.ok).length} of ${r.rivers.length} | ${r.trees.wet} / ${r.trees.road} | ${pc(r.sky.median)} | ${pc(r.sky.low)} | ${r.far.ok ? 'pass' : 'FAIL'}, ${Math.min(...steps)} | ${r.ok ? 'pass' : 'FAIL'} |`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
