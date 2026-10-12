// The generated world, from a seed: a generator that yields its progress
// ({ stage, p }) between steps and returns the world, so a worker can report
// it and the page can show a progress line. The same seed always gives the
// same world, byte for byte, on any thread.
//
//  1. the land's shape, first on the 4 m grid to see where the main river
//     runs, so the main lake's hollow can sit on it; then on the 1 m grid
//  2. rain, lakes and rivers (water.js), carved into the 1 m grid
//  3. where forests can grow (plants.js)
//  4. the sites: fort, villages, the spawn (sites.js); the old wall's ground levelled
//  5. roads from the spawn to the fort and each village (roads.js)
//  5b. (phase 3a) the fort, from the building kit (fort.js): planned on its
//     site with its gate toward the road, its ground levelled and banked,
//     the road's last stretch led straight in through the gate
//  6. trees and bushes (cleared from the fort); what the ground is made of;
//     the drawing levels
//  7. the cameras the tools use, found from the data (cameras.js)
// (The search for the roads, and everything before it, are as in phase 2b,
// so the world away from the fort is the same to the byte.)
import { SCALE } from '../scale.js';
import { hash2, smoothstep } from '../noise.js';
import { makeFrame, knolls, shapeLand } from './land.js';
import { CG, KIND, coarsen, flood, accumulate, findLakes, pickRivers, wetFine, distanceTo } from './water.js';
import { forestField, chooseThreshold, plant, copses, fieldAt } from './plants.js';
import { chooseFort, chooseVillages, chooseViewpoints, chooseSpawn, shoreOf, heightAt, brow } from './sites.js';
import { roadGrid, cheapest, roadLine, layRoads, joinRoads, bridgeRoads, rejoinRoads, meetRoads, STEEP } from './roads.js';
import { Ways, villagePatterns, planVillage, planFields, boundField, layFields, planPaths, nearestWater } from './village.js';
import { materials, detail, gullies, shoreLine, shoreSquares } from './ground.js';
import { worldCameras, fortCameras, villageCameras } from './cameras.js';
import { makeLevels, materialCode, weightLevels, farCode } from '../terrain.js';
import { floorField, conifer } from '../objects.js';
import { emptySpans } from '../spans.js';
import { planFort, levelFort, levelApproach, routeIntoFort, windToFort, detourFort, yardWeight, inPoly, polyDist } from './fort.js';
import { KitBuilder, compileKit, raiseOccluders } from '../kit.js';
import { buildStructure } from '../kit-pieces.js';
import { buildClouds, worldCloudList } from '../sky.js';

const SEA = SCALE.sea;
// the weights kept filtered for the coarser levels (see pack.js)
export const FILTERED = ['wWater', 'wRoad', 'wSand', 'wSnow', 'wRock', 'wYard', 'wField'];

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
  // (phase 3a: one the spawn can see)
  const fortSite = chooseFort(ctx, [spawn], globalThis.FORT_SEE_OFF ? null : { x: spawn.x, z: spawn.z, y: H[spawn.z * NN + spawn.x] + SCALE.eye });
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
  // ---- 5b. the fort (phase 3a) ----------------------------------------------------------
  // planned with its gate toward where its road reaches its surroundings;
  // the road's last stretch replaced by one straight in through the gate,
  // cut in at the nearest point of the old road (clear of the fort's
  // surroundings) from which the new stretch keeps clear of the walls and
  // rises or falls no steeper than 8% (the old road beyond it was graded
  // along its own, longer way); else the platform is moved toward the road.
  const fortRoad = roads.findIndex((rd) => rd.to === 'fort');
  const rf = roads[fortRoad];
  let qa = 0;
  while (qa < rf.n - 1 && Math.hypot(rf.x[qa] - fortSite.x, rf.z[qa] - fortSite.z) <= 62) qa++;
  const fortArgs = { H, N, kind, wetDist, site: fortSite, arrive: [rf.x[qa], rf.z[qa]], seed };
  let plan = planFort(fortArgs);
  const oldRoads = roads.slice();
  const GRADE = 0.08;
  const cutsFor = (pl) => {
    const out = [];
    let q = 0;
    while (q < rf.n - 1 && polyDist(pl.poly, rf.x[q], rf.z[q]) < SCALE.kit.wall.thick / 2 + 12) q++;
    for (; q < rf.n - 1 && Math.hypot(rf.x[q] - fortSite.x, rf.z[q] - fortSite.z) <= 180; q += 4) {
      const copy = roads.slice(), r = routeIntoFort(copy, fortRoad, pl, q);
      if (!r.clear) continue;
      out.push({ r, copy });
      if (r.slope <= GRADE) break;
    }
    return out;
  };
  // (phase 3b) first a way that winds up to the gate with the land, clear
  // of the towers, from wherever along the old road it is cheapest
  const wind = (pl) => {
    let qFrom = 0;
    while (qFrom < rf.n - 1 && polyDist(pl.poly, rf.x[qFrom], rf.z[qFrom]) < SCALE.kit.wall.thick / 2 + 22) qFrom++;
    for (const steep of [0.06, 0.075, 0.09, 0.105]) {
      const wd = windToFort(H, N, kind, pl, rf, qFrom, qFrom + 320, steep, 0.078);
      if (!wd) continue;
      const copy = roads.slice(), r = routeIntoFort(copy, fortRoad, pl, wd.q0, wd.path);
      // (never doubling back so close that its two legs' banks would meet)
      const nr = copy[fortRoad];
      let tight = false;
      for (let i = 0; i < Math.min(nr.n, r.m + 20) && !tight; i += 2) for (let k = i + 16; k < Math.min(nr.n, r.m + 20); k += 2) if (Math.hypot(nr.x[i] - nr.x[k], nr.z[i] - nr.z[k]) < 10) { tight = true; break; }
      if (r.clear && r.slope <= GRADE && !tight) return { r, copy };
    }
    return null;
  };
  let pick = wind(plan);
  const cands = pick ? [] : cutsFor(plan);
  if (!pick) pick = cands.find((c) => c.r.slope <= GRADE) || null;
  if (!pick && cands.length) {
    // too steep from every cut: the platform is brought toward the road's
    // height (by up to 2.5 m, and never lower than a metre over water near
    // it), from the nearest cut that this makes gentle enough, else from the
    // one that needs the least (so the old road is kept wherever it can be)
    const over = (c) => Math.abs(c.r.rise) - GRADE * c.r.run;
    const c = cands.find((k) => over(k) <= 2.5) || cands.reduce((a, b) => (over(b) < over(a) ? b : a));
    let wetTop = -Infinity;
    const R = 60, cx = Math.round(fortSite.x), cz = Math.round(fortSite.z);
    for (let z = Math.max(0, cz - R); z <= Math.min(N, cz + R); z++) for (let x = Math.max(0, cx - R); x <= Math.min(N, cx + R); x++) {
      const j = z * NN + x;
      if (kind[j] !== KIND.NONE) wetTop = Math.max(wetTop, level[j]);
    }
    let base = plan.base + Math.sign(c.r.rise) * Math.min(over(c), 2.5);
    base = Math.round(Math.max(base, wetTop + 1) * 10) / 10;
    const moved = planFort({ ...fortArgs, base });
    // (phase 3b: winding up to the moved platform, if it can; else straight)
    const wm = wind(moved);
    if (wm) { plan = moved; pick = wm; } else {
      const copy = roads.slice(), r = routeIntoFort(copy, fortRoad, moved, c.r.q0);
      if (r.clear) { plan = moved; pick = { r, copy }; }
    }
  }
  if (!pick && cands.length) pick = cands.reduce((a, b) => (b.r.slope < a.r.slope ? b : a));
  if (!pick) { const copy = roads.slice(); pick = { r: routeIntoFort(copy, fortRoad, plan, qa), copy }; }
  const route = pick.r;
  roads.splice(0, roads.length, ...pick.copy);
  const reach = Math.round(Math.hypot(rf.x[route.q0] - fortSite.x, rf.z[route.q0] - fortSite.z));
  // (what the fort replaced, for the tools: phase 2b's road ends, every 2 m)
  const replaced = [];
  oldRoads.forEach((rd, o) => {
    if (roads[o] === rd) return;
    const keep = roads[o];
    for (let q = 0; q < rd.n; q += 2) {
      const x = rd.x[q], z = rd.z[q];
      let on = false;
      for (let p = 0; p < keep.n && !on; p += 3) if (Math.abs(keep.x[p] - x) < 1 && Math.abs(keep.z[p] - z) < 1) on = true;
      if (!on) replaced.push([Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    }
  });
  // (phase 3b) no other road through the fort, and two roads that cross meet at one height
  detourFort(roads, plan, fortRoad);
  meetRoads(roads);
  levelFort(H, N, kind, plan);
  levelApproach(H, N, kind, roads[fortRoad], route.m);
  // (phase 3b) bridges where the roads cross rivers
  const bridges = bridgeRoads(N, roads, kind, level, H);
  rejoinRoads(roads);
  // (the ground brought up to each bridge's ramps on gentle banks, as the
  // fort's approach is, so they meet the land without a cliff)
  for (const bg of bridges) {
    const rd = roads[bg.road], a = Math.max(0, bg.q0 - 45), b = Math.min(rd.n - 1, bg.q1 + 45);
    const part = { x: rd.x.slice(a, b + 1), z: rd.z.slice(a, b + 1), y: rd.y.slice(a, b + 1) };
    levelApproach(H, N, kind, part, b - a + 1, 0.4);
  }
  lap('roads');
  yield { stage: STAGES[6], p: 0.66 };
  const roadDist = layRoads(N, H, kind, level, roads);
  // (the ground under each bridge's deck, where the road comes onto it over
  // the bank, pressed well under the deck, so the deck and the road do not
  // cross each other in a ragged line; within a metre of its ends, where the
  // road meets it, the ground is left alone)
  for (const bg of bridges) {
    const half = SCALE.kit.bridge.half - (bg.style === 'stone' ? 0 : 0.3);
    for (let i = 1; i < bg.pts.length; i++) {
      const [x0, z0, y0] = bg.pts[i - 1], [x1, z1, y1] = bg.pts[i], L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 1e-6) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L, lo = i === 1 ? 1 : -0.5, hi = i === bg.pts.length - 1 ? L - 1 : L + 0.5;
      const top = Math.min(y0, y1) - 0.5;
      const xa = Math.floor(Math.min(x0, x1) - half), xb = Math.ceil(Math.max(x0, x1) + half), za = Math.floor(Math.min(z0, z1) - half), zb = Math.ceil(Math.max(z0, z1) + half);
      for (let z = Math.max(0, za); z <= Math.min(N, zb); z++) for (let x = Math.max(0, xa); x <= Math.min(N, xb); x++) {
        const u = (x - x0) * ux + (z - z0) * uz, w = Math.abs(-(x - x0) * uz + (z - z0) * ux);
        if (u >= lo && u <= hi && w <= half - (bg.style === 'stone' ? 0.6 : 1)) { const j = z * (N + 1) + x; if (H[j] > top) H[j] = top; }
      }
    }
  }
  const wRoad = roadDist.wRoad;

  // ---- 5c. the viewpoints (phase 3b: before the villages, whose paths lead to one) --
  const viewpoints = chooseViewpoints(ctx, [fort, ...villages]);
  for (const v of viewpoints) { const b = brow(H, N, kind, v.x, v.z, v.yaw); v.x = b.x; v.z = b.z; v.h = b.h; }

  // ---- 5d. the villages, their fields and footpaths (phase 3b) ------------------------
  const ways = new Ways();
  for (const rd of roads) ways.line(rd.x, rd.z, SCALE.road.width / 2);
  const venv = { H, N, kind, level, wetDist, F, thr, seed, roads, ways, built: [], cleared: [plan.cleared], fields: [], G };
  const { patterns, water } = villagePatterns(villages, venv);
  const vplans = villages.map((v, q) => {
    const pl = planVillage(q, v, patterns[q], water[q], venv);
    for (const R of pl.rects) venv.built.push(R);
    if (pl.rec.signpost) (venv.posts = venv.posts || []).push([pl.rec.signpost.x, pl.rec.signpost.z]);
    return pl;
  });
  const vpieces = vplans.flatMap((pl) => pl.pieces);
  // the fields and their bounds, then the paths
  const blocks = [];
  vplans.forEach((pl, q) => {
    const bl = planFields(q, pl.rec, venv);
    pl.rec.fields = bl.map((b) => ({ x: b.x, z: b.z, a: b.a, L: b.L, W: b.W, main: b.main }));
    pl.gates = [];
    bl.forEach((b, i) => {
      const style = pl.rec.bounds === 'fence' ? (i % 3 === 2 ? 'drystone' : 'fence') : (i % 3 === 2 ? 'fence' : 'drystone');
      const bd = boundField(b, pl.rec, venv, style);
      vpieces.push(...bd.pieces);
      pl.gates.push(...bd.gates);
    });
    blocks.push(...bl);
  });
  // (the fences and walls, as segments, for the paths to keep off)
  venv.fences = vpieces.filter((pc) => pc.kind === 'fence' || pc.kind === 'drystone').flatMap((pc) => pc.pts.slice(1).map((pt, i) => [pc.pts[i][0], pc.pts[i][1], pt[0], pt[1]]));
  const fpaths = [];
  vplans.forEach((pl, q) => {
    const tg = pl.gates.map((g) => [g[0], g[1], 'field']);
    // to the water (the jetty's foot, or the nearest water's edge)
    const w = pl.rec.jetty ? { x: pl.rec.jetty.a[0], z: pl.rec.jetty.a[1] } : water[q] && water[q].d < 240 ? { x: water[q].x - water[q].dir[0] * 4, z: water[q].z - water[q].dir[1] * 4 } : null;
    if (w) tg.push([w.x, w.z, 'water']);
    // to the nearest viewpoint
    let vp = null, vd = Infinity;
    for (const p of viewpoints) { const d = Math.hypot(p.x - pl.rec.centre.x, p.z - pl.rec.centre.z); if (d < vd) { vd = d; vp = p; } }
    if (vp && vd < 900) tg.push([vp.x, vp.z, 'viewpoint']);
    const ps = planPaths(pl.rec, tg, venv);
    pl.rec.paths = ps.map((p) => ({ to: p.to, n: p.n, x: Array.from(p.x, (v) => Math.round(v * 100) / 100), z: Array.from(p.z, (v) => Math.round(v * 100) / 100) }));
    fpaths.push(...ps);
  });
  // the lanes pressed in a little and painted as the roads are; the paths painted only
  const NNw = N + 1;
  const wPath = new Uint8Array(NNw * NNw);
  const paint = (xs, zs, half, press, into = wRoad) => {
    const n = xs.length, ys = new Float32Array(n);
    for (let q = 0; q < n; q++) {
      let sum = 0, w = 0;
      for (let k = Math.max(0, q - 6); k <= Math.min(n - 1, q + 6); k++) { sum += heightAt(H, N, xs[k], zs[k]); w++; }
      ys[q] = sum / w;
    }
    // (each node pressed once, toward its nearest point of the line, and
    // never one the roads have laid)
    const best = new Map();
    for (let q = 0; q < n; q++) {
      const x = xs[q], z = zs[q], R = half + 2;
      for (let k = Math.max(0, Math.floor(z - R)); k <= Math.min(N, Math.ceil(z + R)); k++) for (let i = Math.max(0, Math.floor(x - R)); i <= Math.min(N, Math.ceil(x + R)); i++) {
        const j = k * NNw + i;
        if (kind[j] !== KIND.NONE) continue;
        const r = Math.hypot(i - x, k - z);
        const wv = Math.round(255 * (1 - smoothstep(half - 0.3, half + 0.3, r)));
        if (wv > into[j]) into[j] = wv;
        if (press && r < half + 0.6 && roadDist.dist[j] > SCALE.road.width / 2 + 4.5) { const b = best.get(j); if (!b || r < b[0]) best.set(j, [r, ys[q]]); }
      }
    }
    for (const [j, [, y]] of best) H[j] += (y - 0.06 - H[j]) * 0.6;
  };
  for (const pl of vplans) for (const ln of pl.lanes) paint(ln.xs, ln.zs, SCALE.village.lane / 2, true);
  // (the footpaths have their own weight: they fade with distance, being narrow)
  for (const p of fpaths) paint(Array.from(p.x), Array.from(p.z), SCALE.village.path / 2, false, wPath);
  // lanterns at each bridge's ends
  for (const bg of bridges) {
    const rd = roads[bg.road];
    for (const [q, o] of [[bg.q0, Math.min(rd.n - 1, bg.q0 + 3)], [bg.q1, Math.max(0, bg.q1 - 3)]]) {
      const tx = rd.x[o] - rd.x[q], tz = rd.z[o] - rd.z[q], tl = Math.hypot(tx, tz) || 1;
      const lx = rd.x[q] + tz / tl * (SCALE.road.width / 2 + 0.9), lz = rd.z[q] - tx / tl * (SCALE.road.width / 2 + 0.9);
      if (kind[Math.round(lz) * NNw + Math.round(lx)] !== KIND.NONE) continue;
      vpieces.push({ kind: 'lantern', at: [lx, lz], base: heightAt(H, N, lx, lz), phase: bg.road + q * 0.01 });
    }
    vpieces.push({ kind: 'bridge', style: bg.style, arches: bg.arches, pts: bg.pts, water: bg.water, bed: bg.bed, seed: 5100 + bg.road * 17 + bg.q0 });
  }
  // (phase 3b) the fort's yard worn into a darker trodden way from the gate
  // to the keep's door and to the foot of each stair
  const wWear = new Uint8Array(NNw * NNw);
  {
    const from = [plan.inner.x, plan.inner.z];
    for (const to of [[plan.keep.door.x, plan.keep.door.z], ...plan.stairs.map((st) => st.foot)]) {
      const L = Math.hypot(to[0] - from[0], to[1] - from[1]), n = Math.max(2, Math.ceil(L));
      const xs = [], zs = [];
      // (a gentle bend, as feet wear it)
      const bend = (hash2(Math.round(to[0]), Math.round(to[1]), seed + 9601) - 0.5) * 0.12 * L;
      for (let i = 0; i <= n; i++) { const t = i / n, sb = Math.sin(t * Math.PI) * bend; xs.push(from[0] + (to[0] - from[0]) * t - (to[1] - from[1]) / L * sb); zs.push(from[1] + (to[1] - from[1]) * t + (to[0] - from[0]) / L * sb); }
      paint(xs, zs, 1.3, false, wWear);
    }
  }
  // where nothing may grow: the buildings and round them, the lanes and
  // paths, the fields, the greens
  const bare = new Uint8Array(NNw * NNw);
  const mark = (x0, z0, x1, z1, test) => {
    for (let k = Math.max(0, Math.floor(z0)); k <= Math.min(N, Math.ceil(z1)); k++) for (let i = Math.max(0, Math.floor(x0)); i <= Math.min(N, Math.ceil(x1)); i++) if (test(i, k)) bare[k * NNw + i] = 1;
  };
  const inRect = (R, pad) => (i, k) => { const dx = i - R.x, dz = k - R.z; return Math.abs(dx * R.ca + dz * R.sa) <= R.hw + pad && Math.abs(-dx * R.sa + dz * R.ca) <= R.hd + pad; };
  for (const R of venv.built) { const e = Math.hypot(R.hw, R.hd) + 4; mark(R.x - e, R.z - e, R.x + e, R.z + e, inRect(R, 3)); }
  for (const b of blocks) { const e = Math.hypot(b.L, b.W) + 3; mark(b.x - e, b.z - e, b.x + e, b.z + e, inRect(b, 2)); }
  for (const pl of vplans) {
    for (const ln of pl.lanes) for (let q = 0; q < ln.xs.length; q += 2) mark(ln.xs[q] - 4, ln.zs[q] - 4, ln.xs[q] + 4, ln.zs[q] + 4, (i, k) => Math.hypot(i - ln.xs[q], k - ln.zs[q]) < SCALE.village.lane / 2 + 2.5);
    if (pl.rec.green) { const g = pl.rec.green; mark(g.x - g.r, g.z - g.r, g.x + g.r, g.z + g.r, (i, k) => Math.hypot(i - g.x, k - g.z) < g.r + 1); }
  }
  for (const p of fpaths) for (let q = 0; q < p.n; q += 2) mark(p.x[q] - 3, p.z[q] - 3, p.x[q] + 3, p.z[q] + 3, (i, k) => Math.hypot(i - p.x[q], k - p.z[q]) < SCALE.village.path / 2 + 1.8);

  // ---- 6. trees and bushes ----------------------------------------------------------
  const ground = H;                       // the true ground, for walking
  const terrain = { N, NN, ground };
  const clear = (x, z) => {
    const j = Math.round(z) * NN + Math.round(x);
    if (roadDist.dist[j] < 4.5) return true;
    if (x > wall.x0 - 22 && x < wall.x1 + 22 && z > wall.z0 - 22 && z < wall.z1 + 22) return true;
    return false;
  };
  let { trees, bushes } = plant(terrain, F, thr, seed, clear, wetDist, kind, clumps);
  // (none in the fort or the margin round it, nor (phase 3b) on the
  // villages' bare ground, where trees stand wherever nothing else does;
  // taken out after planting, so every other tree and bush is as it was: a
  // bush's look follows its place in the list)
  const cleared = plan.cleared, bareAt = (x, z) => bare[Math.round(z) * NN + Math.round(x)];
  trees = trees.filter((t) => !inPoly(cleared, t.x, t.z) && !bareAt(t.x, t.z));
  bushes = bushes.filter((b) => !inPoly(cleared, b.x, b.z) && !bareAt(b.x, b.z));
  // (phase 3b) a few trees inside each village, where there is room
  vplans.forEach((pl, q) => {
    const c = pl.rec.centre, want = 2 + Math.floor(3 * hash2(q, 1, seed + 9501));
    let got = 0;
    for (let t = 0; t < 80 && got < want; t++) {
      const a = hash2(q * 97 + t, 2, seed + 9501) * Math.PI * 2, d = 10 + (pl.rec.radius - 6) * hash2(q * 97 + t, 3, seed + 9501);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      const i = Math.round(x), k = Math.round(z);
      if (i < 2 || k < 2 || i > N - 2 || k > N - 2) continue;
      if (kind[k * NN + i] !== KIND.NONE || roadDist.dist[k * NN + i] < 6) continue;
      // clear of the bare ground by its crown
      let ok = true;
      for (let dz = -4; dz <= 4 && ok; dz += 2) for (let dx = -4; dx <= 4; dx += 2) if (bare[(k + dz) * NN + i + dx]) { ok = false; break; }
      if (!ok || trees.some((tr) => Math.hypot(tr.x - x, tr.z - z) < 6)) continue;
      trees.push(conifer(x, z, heightAt(H, N, x, z), (seed * 31 + q * 1000 + t) >>> 0, 0.7, 0.85));
      got++;
    }
  });
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
  // the courtyard's packed earth (phase 3a)
  terrain.wYard = yardWeight(N, plan);
  // (phase 3b) the fields
  const flds = layFields(N, blocks);
  Object.assign(terrain, { wField: flds.wField, fieldKind: flds.fieldKind, fieldId: flds.fieldId, fieldTable: flds.fieldTable, wPath, wWear });
  terrain.wFloor = floorField(terrain, trees);
  terrain.code = materialCode(terrain);
  // (filtered copies for the coarser levels: thin water, roads and sand fade
  // with distance; snow and rock end at a clean line far away)
  for (const k of FILTERED) terrain[`${k}L`] = weightLevels(terrain[k], N);
  terrain.farCode = farCode(terrain, FILTERED);
  // the range's gullies, on the 4 m grid (the far rule)
  terrain.form = gullies(co, acc, gOf);
  // the waterline of the sea and the lakes (the coast's wet band and foam)
  terrain.shore = shoreLine(N, kind);
  terrain.shoreSq = shoreSquares(N, terrain.shore);
  lap('ground');
  yield { stage: STAGES[8], p: 0.9 };
  terrain.levels = makeLevels(surface, N, false);
  // (phase 3a) no spans: the fort is the kit's shapes
  const spans = emptySpans();
  // (phase 3b) the fort, the villages and the bridges, one description
  const kitDesc = { pieces: [...plan.desc.pieces, ...vpieces], yards: plan.desc.yards, cleared: plan.desc.cleared };
  const kb = new KitBuilder();
  buildStructure(kb, kitDesc);
  const kit = compileKit(kb);
  // (phase 3b) the water under a bridge or a jetty: no rain falls on it
  {
    const occ = new Float32Array(cells).fill(-Infinity);
    raiseOccluders(kit, occ, N, NN);
    const roof = new Uint8Array(cells);
    for (let j = 0; j < cells; j++) if (kind[j] !== KIND.NONE && occ[j] > level[j] + 0.2) roof[j] = 1;
    terrain.roof = roof;
  }
  // the fort as the sites record it (the tools walk it)
  const fortSiteOld = fort;
  const fortRec = {
    x: fortSite.x, z: fortSite.z, score: fortSite.score, prom: fortSite.prom, dl: fortSite.dl,
    gate: { x: plan.gate.x, z: plan.gate.z, out: plan.gate.out }, front: plan.front, inner: plan.inner, ground: plan.ground, base: plan.base,
    poly: plan.poly, yard: plan.yard, towers: plan.towers, keep: plan.keep, stairs: plan.stairs, houses: plan.houses, well: plan.well, edges: plan.edges,
    reach, cut: route.q0, replaced, approach: route.wound ? 'wound' : 'straight',
  };
  // (the villages' records, with their plans)
  vplans.forEach((pl, q) => Object.assign(villages[q], { plan: pl.rec }));
  const bridgeRecs = bridges.map((bg) => {
    const [ax, az, ay] = bg.pts[0], [bx, bz] = bg.pts[bg.pts.length - 1];
    return { x: (ax + bx) / 2, z: (az + bz) / 2, y: ay, a: Math.atan2(bz - az, bx - ax), len: Math.hypot(bx - ax, bz - az), style: bg.style, arches: bg.arches, water: bg.water, road: bg.road, width: bg.width };
  });
  const world = {
    kind: 'world', seed, N, NN, center: [N / 2, N / 2], viewDist: SCALE.viewDist, openEdge: true, sea: SEA,
    terrain, spans, kit, fortDesc: plan.desc, kitDesc, objects: { trees, bushes, torches: kit.torches.map((t) => ({ ...t })), water: SEA },
    clouds: buildClouds(0, worldCloudList(seed, N)),
    sites: { fort: fortRec, villages, viewpoints, spawn, bridges: bridgeRecs, lake: { x: lake.x, z: lake.z, level: lake.level, area: lake.area } },
    roads, lakes: lk.lakes, rivers: wet.rivers, shapes: { hills, basins, rises },
    kindMap: kind, levelMap: level,
  };
  world.cameras = worldCameras(world, { F, thr, seaDist, freshDist, shore });
  // (phase 3a) and the fort's four
  world.cameras.push(...fortCameras(world));
  // (phase 3b) and the villages' eight
  world.cameras.push(...villageCameras(world));
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
