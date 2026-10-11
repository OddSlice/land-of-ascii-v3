// Records scripted walks as video, with time running (the time of day and
// the animation clock): 20 s on the lab's lake shore and from each stress
// camera, and two minutes in the generated world from the spawn along the
// road (`world-road`, the default seed or --seed). The videos go to
// shots/walks/, which is kept out of git.
//
//   node tools/walk.mjs [--only lake,forest,stress-lake,ridge,world-road] [--threads 8] [--density 4] [--headed]
//                       [--look tree=B,cloud=B,meadow=2,shallows=blue] [--suffix name] [--seed N]
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
    await page.evaluate(async ({ cam, hour }) => {
      await window.lab.ready;
      if (cam !== undefined) window.lab.camera(cam);
      if (hour !== undefined) window.lab.setHour(hour);
      await window.lab.whenIdle();
      window.lab.unfreeze();
      window.lab.runClock(true);
    }, { cam: w.cam, hour: w.hour });
    const s0 = await page.evaluate(() => window.lab.state().presented);
    const t0 = Date.now();
    if (w.road) await followRoad(page, w.road);
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
