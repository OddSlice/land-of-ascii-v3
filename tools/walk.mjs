// Records scripted walks as video, with time running (the time of day and
// the animation clock): 20 s on the lab's lake shore and from each stress
// camera, and two minutes in the generated world from the spawn along the
// road (`world-road`, the default seed or --seed). The videos go to
// shots/walks/, which is kept out of git.
//
//   node tools/walk.mjs [--only lake,forest,stress-lake,ridge,world-road,world-fort,world-village,world-green-day,world-fort-night,world-flock-day,world-dawn-deer] [--threads 8] [--density 4] [--headed]
//                       [--look cloud=B,meadow=2,shallows=blue] [--suffix name] [--seed N]
//
// Keys are held as a player would: WASD to walk and strafe, the arrows to
// turn. Along the road, W is held and the arrows steer toward the road 15 m
// ahead, as a player would.
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, parseLook, ROOT } from './lib/serve.mjs';

const a = args();
const OUT = path.join(ROOT, 'shots', 'walks');
fs.mkdirSync(OUT, { recursive: true });

// [keys held, seconds]; each walk adds up to 20 s. The arrows turn about
// 100 degrees a second.
const WALKS = [
  { name: 'lake', stress: false, cam: 2, script: [[['KeyD'], 3], [['KeyA'], 6], [['KeyD'], 3], [['ArrowRight'], 0.6], [['ArrowLeft'], 1.2], [['ArrowRight'], 0.6], [['KeyS'], 2], [['KeyW'], 3.6]] },
  { name: 'forest', stress: true, cam: 0, script: [[['KeyW'], 8], [['KeyW', 'ArrowLeft'], 1], [['KeyW'], 9], [['ArrowRight'], 2]] },
  { name: 'stress-lake', stress: true, cam: 1, script: [[['KeyD'], 8], [['ArrowLeft'], 0.6], [['KeyA'], 8], [['ArrowRight'], 0.6], [['KeyS'], 2.8]] },
  { name: 'ridge', stress: true, cam: 2, script: [[['KeyW'], 6], [['ArrowLeft'], 1], [['KeyW'], 6], [['ArrowRight'], 2], [['KeyS'], 5]] },
  { name: 'world-road', world: true, road: 120 },
  // phase 2a: the same walk from 17:33, dusk into night (the clock runs a
  // game hour a minute), and a minute's slow pan (150 degrees) from the
  // ridge-top vista at the brow of its hill
  { name: 'world-dusk', world: true, road: 120, hour: 17.55 },
  { name: 'world-pan', world: true, cam: 6, pan: 60, panDeg: 150 },
  // phase 2b: three minutes along the road on day 227 of seed 3, from 06:12
  // in the dawn mist, through a fair spell, the cloud building and an hour of
  // rain, to the clearing after it, the clock running an hour every 27 s
  { name: 'world-weather', world: true, road: 180, hour: 6.2, day: 227, rate: 1 / 27 },
  // phase 3a: from the spawn along the roads to the fort (running), in
  // through the gate's passage, across the courtyard, up a stair and along
  // the wall walk, then looking out over the valley; from 17:30, the clock
  // running an hour every four minutes, so dusk falls on the way and the
  // torches are lit inside (seed 3's road to the gate is 1.4 km, so the walk
  // takes about three and a half minutes)
  { name: 'world-fort', world: true, fort: true, hour: 17.5, rate: 1 / 240 },
  // phase 3b: four minutes at dusk, from the fort's gate down its new road to
  // the nearest village by road, through it, and out onto its jetty (or the
  // nearest bridge), then a slow look round; from 17:40, the clock running
  // an hour every four minutes, so the lanterns and windows light on the way
  { name: 'world-village', world: true, village: true, hour: 17.67, rate: 1 / 240, secs: 240 },
  // phase 4a: five minutes on the green from the green's own camera, from
  // 04:30 before dawn to 21:30 after dark (the clock running 17 hours in
  // five minutes): people coming out at dawn, the day's work and talk, the
  // lanterns carried home at dusk, the windows lit and then dark
  { name: 'world-green-day', world: true, camName: 'at midday', hour: 4.5, rate: 17 / 300, hold: 300 },
  // and two minutes through the fort at night, in real time from 23:00: in
  // at the gate past its guard, across the courtyard, up a stair and along
  // the wall walk past the watch with their torches, back, and a look round
  { name: 'world-fort-night', world: true, fort: true, night: true, hour: 23.0, rate: 1 / 3600, secs: 120 },
  // phase 4b: five minutes following the first flock through its day in
  // fast time, from 05:30 in its fold, out behind its shepherd, grazing,
  // and back in at dusk, to 20:30 (the clock running 15 hours in five
  // minutes), the camera a little above and 14 m off the flock's middle
  { name: 'world-flock-day', world: true, flock: 0, hour: 5.5, rate: 15 / 300, secs: 300 },
  // and three minutes on foot at dawn from the village nearest a deer
  // group's forest edge, across the meadow toward the deer grazing there,
  // the clock running an hour in the three minutes; they lift their heads,
  // then run for the trees
  { name: 'world-dawn-deer', world: true, deer: true, hour: 5.85, rate: 1 / 180, secs: 180 },
];
const DEFAULT = ['lake', 'forest', 'stress-lake', 'ridge'];
const only = a.only ? a.only.split(',') : null;
const width = 1440, height = 900;

const { server, url } = await serve();
const browser = await launch('chromium', { headless: !a.headed });
try {
  for (const w of WALKS) {
    if (only ? !only.includes(w.name) : !DEFAULT.includes(w.name)) continue;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width, height } } });
    // (no menu, hint or start card in the video, phase 2b)
    await ctx.addInitScript(() => { self.LAND_QUIET = true; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const q = new URLSearchParams();
    if (a.threads) q.set('threads', String(a.threads));
    if (a.density) q.set('density', String(a.density));
    for (const [k, v] of Object.entries(parseLook(a.look) || {})) q.set(k, v);
    if (w.stress) q.set('stress', '1');
    else if (w.world) { if (a.seed) q.set('seed', String(a.seed)); } else q.set('lab', '1');
    await page.goto(`${url}/?${q}`);
    await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
    await page.evaluate(async ({ cam, camName, hour, day, rate }) => {
      await window.lab.ready;
      if (camName !== undefined) cam = window.lab.cameras.findIndex((c) => c.name.includes(camName));
      if (cam !== undefined) window.lab.camera(cam);
      if (day !== undefined) window.lab.setDay(day);
      if (hour !== undefined) window.lab.setHour(hour);
      await window.lab.whenIdle();
      window.lab.unfreeze();
      window.lab.runClock(true, rate);
    }, { cam: w.cam, camName: w.camName, hour: w.hour, day: w.day, rate: w.rate });
    const s0 = await page.evaluate(() => window.lab.state().presented);
    const t0 = Date.now();
    if (w.road) await followRoad(page, w.road);
    else if (w.fort) await walkFort(page, a.seed, w.night ? w.secs : 0);
    else if (w.hold) await page.waitForTimeout(w.hold * 1000);
    else if (w.village) await walkVillage(page, a.seed, w.secs);
    else if (w.flock !== undefined) await followFlock(page, w.flock, w.secs);
    else if (w.deer) await walkToDeer(page, a.seed, w.secs);
    else if (w.pan) {
      // turn at a steady rate, one step each display refresh
      await page.evaluate(({ secs, deg }) => new Promise((res) => {
        const t0 = performance.now(), y0 = window.lab.state().yaw - deg / 2;
        const step = () => {
          const t = (performance.now() - t0) / 1000;
          window.lab.face(y0 + deg * Math.min(1, t / secs));
          if (t < secs) requestAnimationFrame(step); else res();
        };
        step();
      }), { secs: w.pan, deg: w.panDeg });
    } else for (const [keys, secs] of w.script) {
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(secs * 1000);
      for (const k of keys) await page.keyboard.up(k);
    }
    const s1 = await page.evaluate(() => ({ ...window.lab.state(), errors: window.lab.errors }));
    const secs = (Date.now() - t0) / 1000;
    const video = page.video();
    await ctx.close();
    const file = path.join(OUT, `${w.name}${a.suffix ? `-${a.suffix}` : ''}.webm`);
    await video.saveAs(file);
    await video.delete();
    if (errors.length || s1.errors.length) throw new Error(`${w.name}: page errors\n${[...errors, ...s1.errors].join('\n')}`);
    console.log(`${w.name}: ${secs.toFixed(1)} s, ${((s1.presented - s0) / secs).toFixed(1)} frames a second presented, ends at x ${s1.x.toFixed(1)} z ${s1.z.toFixed(1)}, ${String(Math.floor(s1.hour)).padStart(2, '0')}:${String(Math.floor((s1.hour % 1) * 60)).padStart(2, '0')} -> ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
  }
} finally {
  await browser.close();
  server.close();
}

// Walk the road that starts at the spawn for `secs` seconds: W held, the
// arrows steering toward the point 15 m ahead along it (back the other way
// at its end).
async function followRoad(page, secs) {
  const line = await page.evaluate(() => {
    const L = window.lab, s = L.state(), roads = L.world.roads;
    let best = null;
    for (const r of roads) for (const e of [0, r.x.length - 1]) {
      const d = Math.hypot(r.x[e] - s.x, r.z[e] - s.z);
      if (!best || d < best.d) best = { d, r, e };
    }
    const xs = best.e === 0 ? best.r.x : [...best.r.x].reverse(), zs = best.e === 0 ? best.r.z : [...best.r.z].reverse();
    return { x: [...xs, ...[...xs].reverse()], z: [...zs, ...[...zs].reverse()] };
  });
  let at = 0, held = null;
  await page.keyboard.down('KeyW');
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const st = await page.evaluate(() => window.lab.state());
    // the nearest point a little ahead of where we were, then 15 m on
    let bestD = Infinity;
    for (let q = at; q < Math.min(line.x.length, at + 60); q++) {
      const d = Math.hypot(line.x[q] - st.x, line.z[q] - st.z);
      if (d < bestD) { bestD = d; at = q; }
    }
    const t = Math.min(line.x.length - 1, at + 15);
    const want = Math.atan2(line.x[t] - st.x, line.z[t] - st.z) * 180 / Math.PI;
    const diff = ((want - st.yaw + 540) % 360) - 180;
    const key = Math.abs(diff) < 3 ? null : diff > 0 ? 'ArrowRight' : 'ArrowLeft';
    if (key !== held) { if (held) await page.keyboard.up(held); if (key) await page.keyboard.down(key); held = key; }
    await page.waitForTimeout(60);
  }
  if (held) await page.keyboard.up(held);
  await page.keyboard.up('KeyW');
}

// (phase 3a) The fort walk: the road route from the spawn to the gate's
// mouth (worked out in Node from the same world), then the fort's own
// waypoints. The heading is turned toward a point a little ahead each
// frame (at most 180 degrees a second, as a mouse would), W held, Shift too
// along the road but its last 40 m.
// (`night`: the seconds to fill, starting 40 m out on its road instead of at
// the spawn, walking, and back along the wall walk after it)
async function walkFort(page, seed, night = 0) {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const g = generateWorld(seed !== undefined ? Number(seed) : DEFAULT_SEED); let r; while (!(r = g.next()).done);
  const w = unpackWorld(packWorld(r.value)), f = w.sites.fort, s = w.start;
  // the road graph: every road point, joined along its road and to points of
  // other roads within 2 m; the shortest way from the spawn to the gate
  const P = [];
  for (const rd of w.roads) { const b = P.length; for (let q = 0; q < rd.n; q++) P.push({ x: rd.x[q], z: rd.z[q], nb: [] }); for (let q = 1; q < rd.n; q++) { P[b + q].nb.push(b + q - 1); P[b + q - 1].nb.push(b + q); } }
  const cell = new Map(), key = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
  P.forEach((p, i) => { const k = key(p.x, p.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
  P.forEach((p, i) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of cell.get(`${Math.floor(p.x / 2) + dx},${Math.floor(p.z / 2) + dz}`) || []) if (j !== i && Math.hypot(P[j].x - p.x, P[j].z - p.z) < 2) p.nb.push(j); });
  const near = (x, z) => P.reduce((bi, p, i) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(P[bi].x - x, P[bi].z - z) ? i : bi), 0);
  const si = near(s.x, s.z), gi = near(f.front.x, f.front.z);
  const dist = new Float64Array(P.length).fill(Infinity), prev = new Int32Array(P.length).fill(-1), done = new Uint8Array(P.length);
  dist[si] = 0;
  for (;;) {
    let i = -1; for (let k = 0; k < P.length; k++) if (!done[k] && dist[k] < Infinity && (i < 0 || dist[k] < dist[i])) i = k;
    if (i < 0 || i === gi) break;
    done[i] = 1;
    for (const j of P[i].nb) { const d = dist[i] + Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z); if (d < dist[j]) { dist[j] = d; prev[j] = i; } }
  }
  const road = []; for (let i = gi; i >= 0; i = prev[i]) road.push([P[i].x, P[i].z]); road.reverse();
  // inside: through the passage to the yard, to the first stair's foot (from
  // behind it), up it, and along the walk to 7 m short of the next tower
  const o = f.gate.out, st = f.stairs[0], sd = [st.top[0] - st.foot[0], st.top[1] - st.foot[1]], sl = Math.hypot(sd[0], sd[1]);
  const u = [sd[0] / sl, sd[1] / sl];
  const e = f.edges[st.edge], ed = [e.b[0] - e.a[0], e.b[1] - e.a[1]], el = Math.hypot(ed[0], ed[1]);
  const along = (u[0] * ed[0] + u[1] * ed[1]) > 0 ? 1 : -1, end = along > 0 ? e.b : e.a;
  // the walk's middle line: 0.3 m in from the wall's, beside the stair's top
  const ex = ed[0] / el, ez = ed[1] / el, tq = (st.top[0] - e.a[0]) * ex + (st.top[1] - e.a[1]) * ez;
  const W0 = [e.a[0] + ex * tq - e.out[0] * 0.3, e.a[1] + ez * tq - e.out[1] * 0.3];
  const left = Math.hypot(end[0] - W0[0], end[1] - W0[1]) - 7;
  const inside = [[f.front.x, f.front.z], [f.inner.x, f.inner.z], [f.inner.x - o[0] * 6, f.inner.z - o[1] * 6],
    [st.foot[0] - u[0] * 4, st.foot[1] - u[1] * 4], [st.foot[0], st.foot[1]], [st.top[0], st.top[1]]];
  inside.push(W0); for (let d = 4; d < left; d += 4) inside.push([W0[0] + ex * along * d, W0[1] + ez * along * d]);
  // (running, but walking its last 40 m: the bend into the gate is sharp)
  let cut = road.length - 1, acc = 0;
  while (cut > 0 && acc < 40) { acc += Math.hypot(road[cut][0] - road[cut - 1][0], road[cut][1] - road[cut - 1][1]); cut--; }
  const t0 = Date.now();
  if (night) {
    const [x0, z0] = road[cut], [x1, z1] = road[Math.min(road.length - 1, cut + 3)];
    await page.evaluate(({ x, z, yaw }) => { window.lab.setCamera({ x, z, yaw, pitch: 0 }); }, { x: x0, z: z0, yaw: Math.atan2(x1 - x0, z1 - z0) * 180 / Math.PI });
    await page.keyboard.down('KeyW');
  } else {
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ShiftLeft');
    await follow(page, road.slice(0, cut + 1), 4, 260);
    await page.keyboard.up('ShiftLeft');
  }
  // (at night the stages are capped so the whole walk fits its time: the
  // watch on the wall walk can hold a walker up)
  await follow(page, road.slice(cut), 2.5, night ? 20 : 60);
  await follow(page, inside, 1.5, night ? 55 : 120);
  if (night) await follow(page, [...inside].reverse().slice(0, inside.length - 5), 1.5, 30);
  await page.keyboard.up('KeyW');
  if (night) {
    // a slow look round the courtyard from the wall walk till the time is up
    const left = Math.max(5, night - (Date.now() - t0) / 1000);
    await page.evaluate(({ secs }) => new Promise((res) => {
      const L = window.lab, y0 = L.state().yaw, t1 = performance.now();
      const step = () => { const t = (performance.now() - t1) / 1000; L.face(y0 + 120 * Math.min(1, t / secs)); if (t < secs) requestAnimationFrame(step); else res(); };
      step();
    }), { secs: left });
    return;
  }
  // look out over the parapet, slowly, for the last seconds
  await page.evaluate(({ out }) => new Promise((res) => {
    const L = window.lab, y0 = L.state().yaw, y1 = Math.atan2(out[0], out[1]) * 180 / Math.PI, t0 = performance.now();
    const diff = ((y1 - y0 + 540) % 360) - 180;
    const step = () => { const t = Math.min(1, (performance.now() - t0) / 9000); L.face(y0 + diff * t * t * (3 - 2 * t)); if (t < 1) requestAnimationFrame(step); else setTimeout(res, 6000); };
    step();
  }), { out: e.out });
}
// Walk along points (filled in a metre apart): each frame the heading turns
// toward the point `ahead` metres on from the walker's place along them (at
// most 180 degrees a second), that place only ever moving forward; done
// within 1.2 m of the last point, or after `secs` seconds.
// (phase 3b) The road graph of a world: every road point, joined along its
// road and to points of other roads within 2 m; and the shortest way along
// it between two places.
function roadGraph(w) {
  const P = [];
  for (const rd of w.roads) { const b = P.length; for (let q = 0; q < rd.n; q++) P.push({ x: rd.x[q], z: rd.z[q], nb: [] }); for (let q = 1; q < rd.n; q++) { P[b + q].nb.push(b + q - 1); P[b + q - 1].nb.push(b + q); } }
  const cell = new Map(), key = (x, z) => `${Math.floor(x / 2)},${Math.floor(z / 2)}`;
  P.forEach((p, i) => { const k = key(p.x, p.z); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); });
  P.forEach((p, i) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of cell.get(`${Math.floor(p.x / 2) + dx},${Math.floor(p.z / 2) + dz}`) || []) if (j !== i && Math.hypot(P[j].x - p.x, P[j].z - p.z) < 2) p.nb.push(j); });
  const near = (x, z) => P.reduce((bi, p, i) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(P[bi].x - x, P[bi].z - z) ? i : bi), 0);
  const way = (x0, z0, x1, z1) => {
    const si = near(x0, z0), gi = near(x1, z1);
    const dist = new Float64Array(P.length).fill(Infinity), prev = new Int32Array(P.length).fill(-1), done = new Uint8Array(P.length);
    dist[si] = 0;
    for (;;) {
      let i = -1; for (let k = 0; k < P.length; k++) if (!done[k] && dist[k] < Infinity && (i < 0 || dist[k] < dist[i])) i = k;
      if (i < 0 || i === gi) break;
      done[i] = 1;
      for (const j of P[i].nb) { const d = dist[i] + Math.hypot(P[j].x - P[i].x, P[j].z - P[i].z); if (d < dist[j]) { dist[j] = d; prev[j] = i; } }
    }
    const pts = []; for (let i = gi; i >= 0; i = prev[i]) pts.push([P[i].x, P[i].z]);
    return { pts: pts.reverse(), length: dist[gi] };
  };
  return { way };
}

// (phase 3b) From the fort's gate down its road to the nearest village by
// road, along its road or street to its centre, then out onto its jetty by
// its footpath to the water (a village without one: on to the nearest
// bridge), and a slow look round to fill the time.
async function walkVillage(page, seed, secs) {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const g = generateWorld(seed !== undefined ? Number(seed) : DEFAULT_SEED); let r; while (!(r = g.next()).done);
  const w = unpackWorld(packWorld(r.value)), f = w.sites.fort, G = roadGraph(w), o = f.gate.out;
  const x0 = f.front.x + o[0] * 3, z0 = f.front.z + o[1] * 3;
  const ways = w.sites.villages.map((v) => ({ v, ...G.way(x0, z0, v.plan.centre.x, v.plan.centre.z) })).sort((A, B) => A.length - B.length);
  const { v, pts: road } = ways[0], p = v.plan;
  let last;
  if (p.jetty) {
    const pa = (p.paths || []).find((q) => q.to === 'water');
    // (the footpath, from its end at the centre to its end at the water)
    const fp = pa ? pa.x.map((x, i) => [x, pa.z[i]]) : [];
    const d = (q) => Math.hypot(q[0] - p.centre.x, q[1] - p.centre.z);
    if (fp.length && d(fp[0]) > d(fp[fp.length - 1])) fp.reverse();
    last = [...fp, p.jetty.a, p.jetty.b];
  } else {
    const b = (w.sites.bridges || []).map((b) => ({ b, ...G.way(p.centre.x, p.centre.z, b.x, b.z) })).sort((A, B) => A.length - B.length)[0];
    last = b ? b.pts : [];
  }
  // (from the road's end to the start of that last stretch: a way round the
  // houses on a half-metre grid, by the game's own collision)
  const { Player } = await import('../src/app/player.js');
  const { groundAt } = await import('../src/world/objects.js');
  const pl = new Player(w, { rules: 'world' });
  const A = road[road.length - 1], B = last[0] || [p.centre.x, p.centre.z];
  const between = (() => {
    const s2 = 0.5, x0 = Math.min(A[0], B[0]) - 30, z0 = Math.min(A[1], B[1]) - 30, nx = Math.ceil((Math.abs(A[0] - B[0]) + 60) / s2), nz = Math.ceil((Math.abs(A[1] - B[1]) + 60) / s2);
    const free = (i, k) => { const x = x0 + i * s2, z = z0 + k * s2; return !pl.blocked(x, z, groundAt(w.terrain, x, z) + 0.05); };
    const key = (i, k) => k * nx + i, start = [Math.round((A[0] - x0) / s2), Math.round((A[1] - z0) / s2)], goal = [Math.round((B[0] - x0) / s2), Math.round((B[1] - z0) / s2)];
    const dist = new Float64Array(nx * nz).fill(Infinity), prev = new Int32Array(nx * nz).fill(-1), seen = new Uint8Array(nx * nz), ok = new Int8Array(nx * nz).fill(-1);
    const open = [[0, key(...start)]]; dist[key(...start)] = 0;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, c] = open.shift(); if (seen[c]) continue; seen[c] = 1;
      if (c === key(...goal)) break;
      const ci = c % nx, ck = (c - ci) / nx;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const i = ci + di, k = ck + dk; if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
        const q = key(i, k); if (ok[q] < 0) ok[q] = free(i, k) ? 1 : 0; if (!ok[q]) continue;
        const nd = dist[c] + Math.hypot(di, dk) * s2;
        if (nd < dist[q]) { dist[q] = nd; prev[q] = c; open.push([nd + Math.hypot(i - goal[0], k - goal[1]) * s2, q]); }
      }
    }
    const out = []; for (let c = key(...goal); c >= 0; c = prev[c]) out.push([x0 + (c % nx) * s2, z0 + Math.floor(c / nx) * s2]);
    return out.length > 1 ? out.reverse().filter((q, i, a) => i % 4 === 0 || i === a.length - 1) : [];
  })();
  last = [...between, ...last];
  console.log(`world-village: village ${p.q + 1} (${p.pattern}), ${Math.round(ways[0].length)} m by road from the gate, then ${p.jetty ? 'its jetty' : 'the nearest bridge'}`);
  await page.evaluate(({ x, z, yaw }) => window.lab.setCamera({ x, z, yaw }), { x: x0, z: z0, yaw: Math.atan2(o[0], o[1]) * 180 / Math.PI });
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  const at = async (what) => { const st = await page.evaluate(() => window.lab.state()); console.log(`  ${what}: x ${st.x.toFixed(1)} z ${st.z.toFixed(1)} after ${((Date.now() - t0) / 1000).toFixed(0)} s`); };
  await follow(page, road, 4, 200);
  await at('at the village');
  await follow(page, last, 2, 90);
  await at(p.jetty ? 'on the jetty' : 'on the bridge');
  await page.keyboard.up('KeyW');
  // a slow look round, out over the water, for whatever time is left
  const left = Math.max(10, secs - (Date.now() - t0) / 1000);
  await page.evaluate(({ secs }) => new Promise((res) => {
    const L = window.lab, y0 = L.state().yaw, t0 = performance.now();
    const step = () => { const t = Math.min(1, (performance.now() - t0) / (secs * 1000)); L.face(y0 + 300 * t * t * (3 - 2 * t)); if (t < 1) requestAnimationFrame(step); else res(); };
    step();
  }), { secs: left });
}

async function follow(page, pts0, ahead, secs) {
  const pts = [pts0[0]];
  for (let i = 1; i < pts0.length; i++) {
    const a = pts0[i - 1], b = pts0[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  await page.evaluate(({ pts, ahead, secs }) => new Promise((res) => {
    const L = window.lab, t0 = performance.now();
    let at = 0, last = t0;
    const step = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const st = L.state(), dd = (q) => Math.hypot(pts[q][0] - st.x, pts[q][1] - st.z);
      while (at + 1 < pts.length && (dd(at + 1) <= dd(at) || dd(at) < 1.2)) at++;
      let t = at, acc = 0;
      while (t + 1 < pts.length && acc < ahead) { acc += Math.hypot(pts[t + 1][0] - pts[t][0], pts[t + 1][1] - pts[t][1]); t++; }
      const want = Math.atan2(pts[t][0] - st.x, pts[t][1] - st.z) * 180 / Math.PI, diff = ((want - st.yaw + 540) % 360) - 180;
      L.face(st.yaw + Math.max(-180 * dt, Math.min(180 * dt, diff)));
      if (dd(pts.length - 1) < 1.2 || (now - t0) / 1000 > secs) res(); else requestAnimationFrame(step);
    };
    step();
  }), { pts, ahead, secs });
}

// (phase 4b) Follow group g for `secs` seconds: the camera 4 m up and 14 m
// off the flock's middle, from the side away from its fold's gate at the
// start, eased toward where it should be each frame and always facing it.
async function followFlock(page, g, secs) {
  await page.evaluate(({ g, secs }) => new Promise((res) => {
    const L = window.lab, t0 = performance.now();
    let cx = null, cz = null, cy = null, last = t0, side = null;
    const step = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const w = L.animals.where(g);
      if (w && w.y !== null) {
        if (side === null) side = Math.atan2(w.x, w.z) + 2.4;
        const tx = w.x + Math.sin(side) * 14, tz = w.z + Math.cos(side) * 14, ty = w.y + 1.7 + 4;
        if (cx === null) { cx = tx; cz = tz; cy = ty; }
        const k = 1 - Math.exp(-dt * 0.8);
        cx += (tx - cx) * k; cz += (tz - cz) * k; cy += (ty - cy) * k;
        const d = Math.hypot(w.x - cx, w.z - cz);
        L.setCamera({ x: cx, z: cz, y: cy, yaw: Math.atan2(w.x - cx, w.z - cz) * 180 / Math.PI, pitch: Math.atan2(w.y + 0.5 - cy, d) * 180 / Math.PI });
      }
      if ((now - t0) / 1000 > secs) res(); else requestAnimationFrame(step);
    };
    step();
  }), { g, secs });
}

// (phase 4b) From the village nearest a deer group's forest edge, on foot
// across the meadow toward it (a way round what is in the way on a
// half-metre grid, by the game's own collision), stopping 8 m short of the
// edge, then a slow look along it.
async function walkToDeer(page, seed, secs) {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const { buildPeople } = await import('../src/world/people/people.js');
  const { buildAnimals } = await import('../src/world/animals/build.js');
  const { groundAt } = await import('../src/world/objects.js');
  const gen = generateWorld(seed !== undefined ? Number(seed) : DEFAULT_SEED); let r; while (!(r = gen.next()).done);
  const w = unpackWorld(packWorld(r.value)), P = buildPeople(w), An = buildAnimals(w, P), pl = P.p;
  // (the pair whose straight distance is within what three minutes' walk allows)
  let best = null;
  for (const g of An.groups.filter((q) => q.type === 'deer')) for (const v of w.sites.villages) {
    const d = Math.hypot(g.edge[0] - v.plan.centre.x, g.edge[1] - v.plan.centre.z);
    if (d < 520 && (!best || d < best.d)) best = { g, v, d };
  }
  if (!best) throw new Error('world-dawn-deer: no deer group near a village');
  const { g, v } = best, A = [v.plan.centre.x, v.plan.centre.z];
  const ux = g.edge[0] - A[0], uz = g.edge[1] - A[1], L0 = Math.hypot(ux, uz), B = [g.edge[0] - ux / L0 * 8, g.edge[1] - uz / L0 * 8];
  const s2 = 1, x0 = Math.min(A[0], B[0]) - 40, z0 = Math.min(A[1], B[1]) - 40, nx = Math.ceil((Math.abs(A[0] - B[0]) + 80) / s2), nz = Math.ceil((Math.abs(A[1] - B[1]) + 80) / s2);
  const free = (i, k) => { const x = x0 + i * s2, z = z0 + k * s2; return !pl.blocked(x, z, pl.supportAt(x, z, groundAt(w.terrain, x, z) + 0.3)) && w.terrain.wWater[Math.round(z) * w.NN + Math.round(x)] < 128; };
  const key = (i, k) => k * nx + i, start = [Math.round((A[0] - x0) / s2), Math.round((A[1] - z0) / s2)], goal = [Math.round((B[0] - x0) / s2), Math.round((B[1] - z0) / s2)];
  const dist = new Float64Array(nx * nz).fill(Infinity), prev = new Int32Array(nx * nz).fill(-1), seen = new Uint8Array(nx * nz), ok = new Int8Array(nx * nz).fill(-1);
  const open = [[0, key(...start)]]; dist[key(...start)] = 0;
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, c] = open.splice(bi, 1)[0]; if (seen[c]) continue; seen[c] = 1;
    if (c === key(...goal)) break;
    const ci = c % nx, ck = (c - ci) / nx;
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const i = ci + di, k = ck + dk; if (i < 0 || k < 0 || i >= nx || k >= nz) continue;
      const q = key(i, k); if (ok[q] < 0) ok[q] = free(i, k) ? 1 : 0; if (!ok[q]) continue;
      const nd = dist[c] + Math.hypot(di, dk) * s2;
      if (nd < dist[q]) { dist[q] = nd; prev[q] = c; open.push([nd + Math.hypot(i - goal[0], k - goal[1]) * s2, q]); }
    }
  }
  const way = []; for (let c = key(...goal); c >= 0; c = prev[c]) way.push([x0 + (c % nx) * s2, z0 + Math.floor(c / nx) * s2]);
  way.reverse();
  console.log(`world-dawn-deer: from village ${v.q + 1}'s centre to deer group ${g.id}'s forest edge, ${Math.round(best.d)} m straight, ${way.length} m of way`);
  await page.evaluate(({ x, z, yaw }) => window.lab.setCamera({ x, z, yaw }), { x: A[0], z: A[1], yaw: Math.atan2(ux, uz) * 180 / Math.PI });
  const t0 = Date.now();
  await page.keyboard.down('KeyW');
  await follow(page, way.filter((q, i, arr) => i % 3 === 0 || i === arr.length - 1), 4, secs - 25);
  await page.keyboard.up('KeyW');
  const left = Math.max(10, secs - (Date.now() - t0) / 1000);
  await page.evaluate(({ secs }) => new Promise((res) => {
    const L = window.lab, y0 = L.state().yaw, t0 = performance.now();
    const step = () => { const t = Math.min(1, (performance.now() - t0) / (secs * 1000)); L.face(y0 - 50 + 100 * t * t * (3 - 2 * t)); if (t < 1) requestAnimationFrame(step); else res(); };
    step();
  }), { secs: left });
}
