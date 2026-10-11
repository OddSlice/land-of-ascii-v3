// The generated world, from a seed: a generator that yields its progress
// ({ stage, p }) between steps and returns the world, so a worker can report
// it and the page can show a progress line. The same seed always gives the
// same world, byte for byte, on any thread.
//
//  1. the land's shape, first on the 4 m grid to see where the main river
//     runs, so the main lake's hollow can sit on it; then on the 1 m grid
//  2. rain, lakes and rivers (water.js), carved into the 1 m grid
//  3. where forests can grow (plants.js)
//  4. the sites: fort, villages, the spawn (sites.js); the wall's ground levelled
//  5. roads from the spawn to the fort and each village (roads.js)
//  6. trees and bushes; what the ground is made of; the drawing levels
//  7. the cameras the tools use, found from the data (cameras.js)
import { SCALE } from '../scale.js';
import { hash2, smoothstep } from '../noise.js';
import { makeFrame, knolls, shapeLand } from './land.js';
import { CG, KIND, coarsen, flood, accumulate, findLakes, pickRivers, wetFine, distanceTo } from './water.js';
import { forestField, chooseThreshold, plant, copses, fieldAt } from './plants.js';
import { chooseFort, chooseVillages, chooseViewpoints, chooseSpawn, shoreOf, heightAt, brow } from './sites.js';
import { roadGrid, cheapest, roadLine, layRoads, joinRoads, STEEP } from './roads.js';
import { materials, detail, gullies, shoreLine } from './ground.js';
import { worldCameras } from './cameras.js';
import { makeLevels, materialCode, weightLevels } from '../terrain.js';
import { floorField } from '../objects.js';
import { buildSpans } from '../spans.js';
import { buildClouds, worldCloudList } from '../sky.js';

const SEA = SCALE.sea;
// the weights kept filtered for the coarser levels (see pack.js)
export const FILTERED = ['wWater', 'wRoad', 'wSand', 'wSnow', 'wRock'];

// The seed the page opens on, chosen for its first view (docs/phase1.md);
// ?seed= gives any other.
export const DEFAULT_SEED = 3;

export const STAGES = ['shaping the land', 'running the rain', 'carving rivers', 'growing forests', 'choosing sites', 'finding roads', 'planting trees', 'laying the ground', 'finishing'];

export function* generateWorld(seed) {
  seed = seed >>> 0;
  const t0 = performance.now();
  const N = SCALE.N, NN = N + 1, cells = NN * NN;
  const times = {};
  let tl = t0;
  const lap = (name) => { const t = performance.now(); times[name] = Math.round(t - tl); tl = t; };
  const P = {};
  yield { stage: STAGES[0], p: 0 };
  const frame = makeFrame(seed, N);
  const gOf = (x, z) => frame.at(x, z, P).g;
  const hills = knolls(seed, N, frame);

  // ---- 1. where the main river runs, on the coarse grid -----------------------
  const rainOf = (co) => {
    const rain = new Float32Array(co.nn * co.nn);
    for (let k = 0; k < co.nn; k++) for (let i = 0; i < co.nn; i++) rain[k * co.nn + i] = 1 + 2 * smoothstep(0, 300, gOf(i * CG, k * CG));
    return rain;
  };
  const quick = shapeLand(seed, N, { hills, step: CG });
  const co1 = { Hc: quick.H, n: quick.n, nn: quick.nn };
  const fl1 = flood(co1);
  const acc1 = accumulate(fl1, rainOf(co1));
  const riv1 = pickRivers(co1, fl1, acc1, gOf);
  const { basins, rises } = placeBasins(seed, N, frame, co1, riv1, hills);
  lap('quick');
  yield { stage: STAGES[0], p: 0.04 };

  // ---- the land on the 1 m grid ------------------------------------------------
  const land = shapeLand(seed, N, { hills, basins, rises });
  const H = land.H;
  lap('land');
  yield { stage: STAGES[1], p: 0.4 };

  // ---- 2. rain, lakes, rivers ------------------------------------------------------
  const co = coarsen(H, N);
  const fl = flood(co);
  const acc = accumulate(fl, rainOf(co));
  const lk = findLakes(co, fl);
  const rivers0 = pickRivers(co, fl, acc, gOf);
  lap('hydro');
  yield { stage: STAGES[2], p: 0.45 };
  const wet = wetFine(H, N, co, lk, rivers0, (c) => acc[c], seed);
  const { kind, level } = wet;
  lap('carve');
  // the main lake: the one in the main hollow, or else the largest
  let main = 0;
  lk.lakes.forEach((l, q) => { if (l.area > lk.lakes[main].area) main = q; });
  if (basins.length) {
    const b = basins[0], c = Math.round(b.z / CG) * co.nn + Math.round(b.x / CG);
    if (lk.id[c] >= 0) main = lk.id[c];
  }
  const lake = lk.lakes.length ? { ...lk.lakes[main], id: main } : null;
  if (!lake) throw new Error(`seed ${seed}: no lake formed`);
  const shore = shoreOf(lk.id, co.nn, main);
  // the main lake's water, as up to 64 points spread over it
  const lakeAll = [];
  for (let c = 0; c < lk.id.length; c++) if (lk.id[c] === main) lakeAll.push([(c % co.nn) * CG, Math.floor(c / co.nn) * CG]);
  const lakePts = lakeAll.filter((_, q) => q % Math.max(1, Math.floor(lakeAll.length / 64)) === 0);
  yield { stage: STAGES[3], p: 0.5 };

  // ---- 3. distances to water, and where forests can grow ------------------------
  const seaDist = distanceTo(N, (j) => kind[j] === KIND.SEA);
  const freshDist = distanceTo(N, (j) => kind[j] === KIND.LAKE || kind[j] === KIND.RIVER);
  const wetDist = new Uint8Array(cells);
  for (let j = 0; j < cells; j++) wetDist[j] = Math.min(seaDist[j], freshDist[j]);
  const F = forestField(N, H, kind, wetDist, frame, seed);
  // the copses take their share of the trees; the stands the rest
  let thr = chooseThreshold(F, N, seed);
  const clumps = copses(N, H, kind, wetDist, frame, F, thr, seed);
  thr = chooseThreshold(F, N, seed, SCALE.trees.target - clumps.reduce((a, c) => a + c.n, 0));
  lap('forest field');
  yield { stage: STAGES[4], p: 0.56 };

  // ---- 4. sites ----------------------------------------------------------------------
  const ctx = { H, N, kind, level, wetDist, seaDist, freshDist, frame, F, thr, lake, shore, lakePts, seed, Hc: co.Hc, nn: co.nn };
  // the spawn first (the composed first view matters most), then the fort
  // and villages away from it
  // (a road must be able to leave it at the gentle slope; else the next best)
  const spawns = chooseSpawn(ctx, []);
  if (!spawns.length) throw new Error(`seed ${seed}: no spawn`);
  const G0 = roadGrid(N, H, wet.pre, kind, level, wetDist, F, thr);
  const spawn = spawns.find((s) => leaves(G0, s.x, s.z, 200)) || spawns[0];
  const fortSite = chooseFort(ctx, [spawn]);
  if (!fortSite) throw new Error(`seed ${seed}: no fort site (rejected: ${JSON.stringify(ctx.why)}; lake at ${Math.round(lake.x)}, ${Math.round(lake.z)}, ${lake.area} m2)`);
  // the wall along x, its gate in the middle, the ground levelled round it
  const W = SCALE.wall;
  const wx0 = Math.round(fortSite.x - W.length / 2), wz0 = Math.round(fortSite.z - 1);
  const wall = { x0: wx0, x1: wx0 + W.length, z0: wz0, z1: wz0 + W.thick };
  const wallGround = heightAt(H, N, fortSite.x, fortSite.z + 0.5);
  for (let k = wall.z0 - 20; k <= wall.z1 + 20; k++) {
    for (let i = wall.x0 - 20; i <= wall.x1 + 20; i++) {
      const wz = smoothstep(17, 7, Math.abs(k - (wall.z0 + wall.z1) / 2));
      const wxf = smoothstep(wall.x0 - 16, wall.x0 - 4, i) * smoothstep(wall.x1 + 16, wall.x1 + 4, i);
      const j = k * NN + i;
      if (kind[j] === KIND.NONE) H[j] += (wallGround - H[j]) * wz * wxf;
    }
  }
  const gateX = wx0 + W.length / 2;
  const villages = chooseVillages(ctx, [fortSite, spawn]);
  lap('sites');
  yield { stage: STAGES[5], p: 0.6 };

  // ---- 5. roads ------------------------------------------------------------------------
  const G = roadGrid(N, H, wet.pre, kind, level, wetDist, F, thr);
  // nothing goes through the wall
  for (let k = Math.floor((wall.z0 - 3) / CG); k <= Math.ceil((wall.z1 + 3) / CG); k++) {
    for (let i = Math.floor((wall.x0 - 3) / CG); i <= Math.ceil((wall.x1 + 3) / CG); i++) G.pen[k * G.nn + i] = Infinity;
  }
  const node = (x, z) => Math.round(z / CG) * G.nn + Math.round(x / CG);
  // the gate faces the spawn, where the roads start
  const south = spawn.z < fortSite.z;
  const gateFront = { x: gateX, z: south ? wall.z0 - 14 : wall.z1 + 14 };
  const fort = { ...fortSite, wall, gate: { x: gateX, z: south ? wall.z0 : wall.z1 }, front: gateFront, ground: wallGround };
  const network = new Set([node(spawn.x, spawn.z)]);
  const paths = [];
  const todo = [{ c: node(gateFront.x, gateFront.z), name: 'fort' }, ...villages.map((v, q) => ({ c: node(v.x, v.z), name: `village ${q + 1}` }))];
  while (todo.length) {
    // (where the land allows no gentler way, a steeper one, a step at a time)
    let path = null, used = STEEP;
    for (const steep of [STEEP, 0.09, 0.11, 0.14, 0.2]) if ((path = cheapest(G, network, todo.map((v) => v.c), (used = steep)))) break;
    if (!path) break;
    const hit = todo.findIndex((v) => v.c === path[0]);
    paths.push({ path, to: todo[hit].name, steep: used });
    for (const c of path) network.add(c);
    todo.splice(hit, 1);
  }
  if (todo.length) {
    const c0 = node(spawn.x, spawn.z), ci = c0 % G.nn, ck = Math.floor(c0 / G.nn);
    const around = [];
    for (let dk = -2; dk <= 2; dk++) for (let di = -2; di <= 2; di++) { const c = (ck + dk) * G.nn + ci + di; around.push(`${G.pen[c] === Infinity ? 'X' : G.pen[c].toFixed(0)}:${G.h[c].toFixed(1)}`); }
    throw new Error(`seed ${seed}: no road reaches ${todo.map((v) => v.name).join(', ')} (spawn ${spawn.x},${spawn.z}; round it ${around.join(' ')})`);
  }
  // the roads' heights follow the land (and a ford's water), and meet where they join
  const surfNow = new Float32Array(cells);
  for (let j = 0; j < cells; j++) surfNow[j] = kind[j] !== KIND.NONE ? level[j] : H[j];
  const roads = paths.map((p, q) => ({ ...roadLine(p.path, G.nn, N, surfNow, (j) => kind[j] === KIND.RIVER), id: q, to: p.to, steep: p.steep }));
  joinRoads(roads);
  lap('roads');
  yield { stage: STAGES[6], p: 0.66 };
  const roadDist = layRoads(N, H, kind, level, roads);
  const wRoad = roadDist.wRoad;

  // ---- 6. trees and bushes ----------------------------------------------------------
  const ground = H;                       // the true ground, for walking
  const terrain = { N, NN, ground };
  const clear = (x, z) => {
    const j = Math.round(z) * NN + Math.round(x);
    if (roadDist.dist[j] < 4.5) return true;
    if (x > wall.x0 - 22 && x < wall.x1 + 22 && z > wall.z0 - 22 && z < wall.z1 + 22) return true;
    for (const v of villages) if (Math.hypot(v.x - x, v.z - z) < 60) return true;
    return false;
  };
  const { trees, bushes } = plant(terrain, F, thr, seed, clear, wetDist, kind, clumps);
  lap('plants');
  yield { stage: STAGES[7], p: 0.74 };

  // ---- the ground's materials and the drawn surface -----------------------------------
  const { wSand, wRock, wSnow } = materials(N, H, kind, level, seaDist, freshDist, seed);
  const det = detail(N, seed);
  const surface = new Float32Array(cells);
  const wWater = new Uint8Array(cells);
  let maxH = 0;
  for (let j = 0; j < cells; j++) {
    const wetj = kind[j] !== KIND.NONE;
    surface[j] = wetj ? level[j] : H[j];
    wWater[j] = wetj ? 255 : 0;
    if (surface[j] > maxH) maxH = surface[j];
  }
  Object.assign(terrain, { wWater, wRoad, wSand, wRock, wSnow, tone: det.tone, fine: det.fine, toneK: det.toneK, maxH });
  terrain.wFloor = floorField(terrain, trees);
  terrain.code = materialCode(terrain);
  // (filtered copies for the coarser levels: thin water, roads and sand fade
  // with distance; snow and rock end at a clean line far away)
  for (const k of FILTERED) terrain[`${k}L`] = weightLevels(terrain[k], N);
  // the range's gullies, on the 4 m grid (the far rule)
  terrain.form = gullies(co, acc, gOf);
  // the waterline of the sea and the lakes (the coast's wet band and foam)
  terrain.shore = shoreLine(N, kind);
  lap('ground');
  yield { stage: STAGES[8], p: 0.9 };
  terrain.levels = makeLevels(surface, N, false);
  const spans = buildSpans(N, { ...wall, base: wallGround - 2, top: wallGround + W.height, merlon: 1.5, merlonW: 2, merlonGap: 2 },
    { x0: gateX - W.gate / 2, x1: gateX + W.gate / 2, cx: gateX, r: W.gate / 2, jamb: 2.8, ground: wallGround });
  const viewpoints = chooseViewpoints(ctx, [fort, ...villages]);
  // each viewpoint stands at the brow of its hill, looking its way (phase 2a)
  for (const v of viewpoints) { const b = brow(ground, N, kind, v.x, v.z, v.yaw); v.x = b.x; v.z = b.z; v.h = b.h; }
  const world = {
    kind: 'world', seed, N, NN, center: [N / 2, N / 2], viewDist: SCALE.viewDist, openEdge: true, sea: SEA,
    terrain, spans, objects: { trees, bushes, torches: [], water: SEA },
    clouds: buildClouds(0, worldCloudList(seed, N)),
    sites: { fort, villages, viewpoints, spawn, lake: { x: lake.x, z: lake.z, level: lake.level, area: lake.area } },
    roads, lakes: lk.lakes, rivers: wet.rivers, shapes: { hills, basins, rises },
    kindMap: kind, levelMap: level,
  };
  world.cameras = worldCameras(world, { F, thr, seaDist, freshDist, shore });
  // the first view faces the lake; where the road from the spawn leaves
  // within 70 degrees of that, it aims between the two, so the road leads
  // into the picture
  const r0 = roads[0], e0 = r0.n - 1, back = Math.max(0, e0 - 30);
  const roadYaw = Math.atan2(r0.x[back] - r0.x[e0], r0.z[back] - r0.z[e0]) * 180 / Math.PI;
  const turn = ((roadYaw - spawn.yaw + 540) % 360) - 180;
  if (Math.abs(turn) < 70) spawn.yaw += turn / 2;
  world.start = { x: spawn.x, z: spawn.z, yaw: spawn.yaw, pitch: 0 };
  world.cameras[0].yaw = spawn.yaw;
  lap('finish');
  world.buildMs = performance.now() - t0;
  world.times = times;
  return world;
}

// Can a road leave (x, z) by gentle slopes, to somewhere `far` metres away?
function leaves(G, x, z, far) {
  const { h, pen, nn } = G;
  const s0 = Math.round(z / CG) * nn + Math.round(x / CG);
  const seen = new Uint8Array(nn * nn), q = [s0];
  seen[s0] = 1;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], ci = c % nn, ck = (c - ci) / nn;
    if (Math.hypot(ci * CG - x, ck * CG - z) >= far) return true;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const i = ci + di, kk = ck + dk;
      if (i < 0 || kk < 0 || i >= nn || kk >= nn) continue;
      const m = kk * nn + i;
      if (seen[m] || pen[m] === Infinity) continue;
      if (Math.abs(h[m] - h[c]) / (CG * Math.hypot(di, dk)) > STEEP) continue;
      seen[m] = 1; q.push(m);
    }
  }
  return false;
}

// The main lake's hollow, on the main river where it crosses the middle of
// the lowland, and two or three small hollows elsewhere in the lowland.
function placeBasins(seed, N, frame, co, rivers, hills) {
  const P = {}, out = [], rises = [];
  const { Hc, nn } = co;
  const at = (x, z) => Hc[Math.round(z / CG) * nn + Math.round(x / CG)];
  const ell = (x, z, rx, ry, a, depth, level, flat, rise) => ({ x, z, rx, ry, ca: Math.cos(a), sa: Math.sin(a), depth, level, rise, wob: 0.2, ws: out.length * 5.7, flatK: flat });
  if (rivers.length) {
    const nodes = rivers[0].nodes;
    let pick = -1, bestD = Infinity;
    for (let q = 4; q < nodes.length - 4; q++) {
      const c = nodes[q], x = (c % nn) * CG, z = Math.floor(c / nn) * CG;
      frame.at(x, z, P);
      if (P.c < 380 || P.g > -260) continue;
      const d = Math.abs(P.f - 0.5);
      if (d < bestD) { bestD = d; pick = q; }
    }
    if (pick >= 0) {
      const c = nodes[pick], x = (c % nn) * CG, z = Math.floor(c / nn) * CG;
      const a = nodes[Math.min(nodes.length - 1, pick + 6)], b = nodes[Math.max(0, pick - 6)];
      const ang = Math.atan2(Math.floor(a / nn) - Math.floor(b / nn), (a % nn) - (b % nn));
      const r = 230 + 90 * hash2(1, 1, seed + 551), ry = r * (0.6 + 0.2 * hash2(1, 2, seed + 551));
      out.push(ell(x, z, r, ry, ang, 8, at(x, z), 1.5, 0.02));
      // low rises at the lake's edge, off the river's line, as such valleys
      // often have: one to its side, one below it to the other side, from
      // where one looks up the valley across the water (the fort site and
      // the spawn will want them)
      const side = hash2(1, 3, seed + 551) < 0.5 ? 1 : -1;
      const kr = 115 + 45 * hash2(1, 5, seed + 551), ka = hash2(1, 6, seed + 551) * Math.PI, off = ry + kr * 0.55;
      rises.push({ x: x - Math.sin(ang) * side * off, z: z + Math.cos(ang) * side * off, rx: kr, ry: kr * 0.8, ca: Math.cos(ka), sa: Math.sin(ka), h: 11 + 6 * hash2(1, 7, seed + 551), wob: 0.14, ws: 41.3 });
      const da = ang - side * (0.75 + 0.2 * hash2(1, 8, seed + 551)), dr = 110 + 40 * hash2(1, 10, seed + 551);
      const doff = Math.hypot(r * Math.cos(da - ang), ry * Math.sin(da - ang)) + dr * 0.6;
      rises.push({ x: x + Math.cos(da) * doff, z: z + Math.sin(da) * doff, rx: dr, ry: dr * 0.8, ca: Math.cos(da), sa: Math.sin(da), h: 12 + 6 * hash2(1, 11, seed + 551), wob: 0.14, ws: 17.9 });
    }
  }
  // small hollows
  const want = 2 + Math.floor(2 * hash2(2, 1, seed + 552));
  for (let t = 0; t < 300 && out.length < 1 + want; t++) {
    const x = 250 + (N - 500) * hash2(t, 1, seed + 553), z = 250 + (N - 500) * hash2(t, 2, seed + 553);
    frame.at(x, z, P);
    if (P.c < 250 || P.g > -180) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < b.rx * b.flatK + 160)) continue;
    if (hills.some((h) => Math.hypot(h.x - x, h.z - z) < h.rx + 60) || rises.some((h) => Math.hypot(h.x - x, h.z - z) < h.rx + 60)) continue;
    let nearRiver = false;
    for (const rv of rivers) for (const c of rv.nodes) if (Math.hypot((c % nn) * CG - x, Math.floor(c / nn) * CG - z) < 160) { nearRiver = true; break; }
    if (nearRiver) continue;
    const r = 45 + 50 * hash2(t, 3, seed + 553);
    out.push(ell(x, z, r, r * (0.6 + 0.35 * hash2(t, 4, seed + 553)), hash2(t, 5, seed + 553) * Math.PI, 3 + 1.5 * hash2(t, 6, seed + 553), at(x, z), 2.2, 0.025));
  }
  return { basins: out, rises };
}
