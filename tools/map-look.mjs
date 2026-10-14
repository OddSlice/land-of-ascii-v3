// (0.5.5) The map (M) as a player sees it, with its drawn layer (the page's
// names, compass, legend and you: the tools' quiet pages leave it out, so
// this one opens the game as a visitor would): just arrived at the spawn,
// and after walking the roads from the spawn to Dunholme, on to the fort and
// back to the Elmswick road (a metre a frame, progress on, nothing kept), at
// 1280 x 720 and 1024 x 640. To shots/map/<tag>-<state>-<size>.png.
//
//   node tools/map-look.mjs [--tag after] [--seed 3] [--sizes 1280x720,1024x640]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld } from '../src/world/pack.js';

const a = args();
const seed = Number(a.seed || DEFAULT_SEED), tag = String(a.tag || 'after');
const sizes = String(a.sizes || '1280x720,1024x640').split(',').map((s) => s.split('x').map(Number));
const OUT = path.join(ROOT, 'shots', 'map');
fs.mkdirSync(OUT, { recursive: true });
const gen = generateWorld(seed); let r; while (!(r = gen.next()).done);
const W = unpackWorld(packWorld(r.value));
// the walk: every road but the last, end to end, a point a metre
const pts = [];
for (const rd of W.roads.slice(0, 3)) for (let k = 0; k < rd.n; k++) pts.push([rd.x[k], rd.z[k]]);
const { server, url } = await serve(a.root ? path.resolve(String(a.root)) : ROOT);
const browser = await launch('chromium');
try {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/play.html?seed=${seed}`);
    await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
    await page.evaluate(async () => { await window.lab.ready; await window.lab.whenIdle(); });
    await page.evaluate(() => window.lab.titlePlay()); await page.waitForTimeout(300);   // (phase 6: past the title screen)
    await page.evaluate(async () => { const L = window.lab; L.setHud(false); L.progress.enable({ store: false }); L.progress.clear(); L.freeze(11, 0, 0); L.setWeather('fair'); await L.whenIdle(); });
    const shot = async (state) => {
      await page.evaluate(async () => { window.lab.setMap(true); await new Promise((r2) => setTimeout(r2, 900)); });
      const f = path.join(OUT, `${tag}-${state}-${w}x${h}.png`);
      await page.screenshot({ path: f });
      console.log(path.relative(ROOT, f));
      await page.evaluate(() => window.lab.setMap(false));
    };
    await shot('arrived');
    await page.evaluate(async (pts) => {
      const L = window.lab;
      // (two frames a point: the sight of places is checked a frame at a time)
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x, z] = pts[k], [x2, z2] = pts[k + 1];
        if (Math.hypot(x2 - x, z2 - z) > 30) continue;
        L.setCamera({ x, z, yaw: Math.atan2(x2 - x, z2 - z) * 180 / Math.PI, pitch: 0 });
        await new Promise((r2) => requestAnimationFrame(r2)); await new Promise((r2) => requestAnimationFrame(r2));
      }
    }, pts);
    await shot('walked');
    if (errors.length) throw new Error(errors.join('\n'));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
