// Records a 20 s scripted walk as video, with time running (the time of day
// and the animation clock), for the lab's lake shore and each stress camera.
// The videos go to shots/walks/, which is kept out of git.
//
//   node tools/walk.mjs [--only lake,forest,stress-lake,ridge] [--threads 8] [--density 4] [--headed]
//                       [--look tree=B,cloud=B,meadow=2,shallows=blue] [--suffix name]
//
// Keys are held as a player would: WASD to walk and strafe, the arrows to turn.
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
];
const only = a.only ? a.only.split(',') : null;
const width = 1440, height = 900;

const { server, url } = await serve();
const browser = await launch('chromium', { headless: !a.headed });
try {
  for (const w of WALKS) {
    if (only && !only.includes(w.name)) continue;
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: { width, height } } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const q = new URLSearchParams();
    if (a.threads) q.set('threads', String(a.threads));
    if (a.density) q.set('density', String(a.density));
    for (const [k, v] of Object.entries(parseLook(a.look) || {})) q.set(k, v);
    if (w.stress) q.set('stress', '1');
    await page.goto(`${url}/?${q}`);
    await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
    await page.evaluate(async (cam) => {
      await window.lab.ready;
      window.lab.camera(cam);
      await window.lab.whenIdle();
      window.lab.unfreeze();
      window.lab.runClock(true);
    }, w.cam);
    const s0 = await page.evaluate(() => window.lab.state().presented);
    const t0 = Date.now();
    for (const [keys, secs] of w.script) {
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
