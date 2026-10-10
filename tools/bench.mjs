// Frame timings through the debug handle with a fixed camera and every clock
// frozen (no mouse look: headless browsers report very low frame rates with
// it), for the lab's six cameras and the stress scene's three, at densities 3
// and 4, with 8 and with 4 render workers. Chromium and Firefox run in a real,
// visible window, so the GPU and the display's frame clock are the real ones;
// WebKit runs headless (its visible window is throttled after about a minute).
// The page is served cross-origin isolated so Firefox and WebKit give
// fine-grained timers.
//
//   node tools/bench.mjs [--browser chromium,firefox,webkit] [--threads 8,4] [--density 3,4]
//                        [--scene lab|stress|both|world] [--seed N] [--frames 240] [--built] [--out file.json]
//                        [--look tree=B,cloud=B,meadow=2,shallows=blue] [--root DIR]
//
// --look sets the look candidates for every run; --root measures another
// build's folder (for example a copy of an earlier phase) instead of this one.
//
// "worker" is the slowest stripe's march + resolve in a frame; "verdict" is
// that plus the main thread's draw, per frame (the phase 0b decision rule).
// For the generated world it also records how long the world took to build
// (in its worker, until the arrays were back on the page), how long until
// the first frame, and the memory: what the browser reports for the page and
// its workers where it can (Chromium), and the resident memory of the test
// browser's processes as the system sees them.
//
// Before timing anything, close every other copy of the game (browser tabs,
// the Claude app's browser pane) and check the machine is idle.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, parseLook, ROOT } from './lib/serve.mjs';

const a = args();
const browsers = (a.browser || 'chromium,firefox,webkit').split(',');
const threadCounts = String(a.threads || '8,4').split(',').map(Number);
const densities = String(a.density || '3,4').split(',').map(Number);
const frames = Number(a.frames || 240);
const scenes = { lab: ['lab'], stress: ['stress'], both: ['lab', 'stress'], world: ['world'] }[a.scene || 'both'];

// Resident memory of the test browser's processes (Playwright's builds only).
function browserRSS() {
  const rows = execSync('ps -axo rss=,command=').toString().split('\n').filter((l) => l.includes('ms-playwright'));
  const kb = rows.map((l) => parseInt(l.trim(), 10) || 0);
  return { totalMB: Math.round(kb.reduce((p, q) => p + q, 0) / 1024), largestMB: Math.round(Math.max(0, ...kb) / 1024), processes: kb.length };
}
const TOP_CELLS = 52480;
const look = parseLook(a.look);

// What else is busy right now (the harness's own browsers are not up yet).
const busy = execSync('ps -Ao %cpu,comm -r | head -8').toString().trim().split('\n').slice(1)
  .map((l) => l.trim()).filter((l) => parseFloat(l) > 15);
console.log(`busy processes before the run (>15% CPU): ${busy.length ? `\n  ${busy.join('\n  ')}` : 'none'}`);

const med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pct = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const r2 = (x) => +x.toFixed(2);

const { server, url } = await serve(a.root || ROOT);
const rows = [];
try {
  for (const name of browsers) {
    const browser = await launch(name, { headless: name === 'webkit' });
    for (const threads of threadCounts) {
      for (const scene of scenes) {
        const stress = scene === 'stress';
        const t0 = Date.now();
        const lab = await openLab(browser, url, { built: !!a.built, threads, scene, look, seed: a.seed });
        const readyMs = Date.now() - t0;
        const { page } = lab;
        await page.evaluate(() => window.lab.setHud(false));
        const ncams = await page.evaluate(() => window.lab.cameras.length);
        const world = await page.evaluate(() => ({ buildMs: window.lab.world.buildMs, sweepMs: window.lab.world.sweepMs }));
        if (scene === 'world') {
          await page.evaluate(() => window.lab.whenIdle());
          const mem = await page.evaluate(() => window.lab.memory().catch((e) => ({ error: String(e) })));
          const rss = browserRSS();
          const st = await page.evaluate(() => ({ shared: window.lab.shared, threads: window.lab.threads, times: window.lab.world.times }));
          // the browser counts shared memory again for every thread that reads
          // it: counted once, the page and its workers hold `memOnce`
          const once = mem && mem.bytes ? Math.round((mem.bytes - (mem.holders - 1) * mem.shared) / 1e6) : null;
          Object.assign(world, { readyMs, rss, mem: mem && mem.bytes ? Math.round(mem.bytes / 1e6) : (mem && mem.error) || null, memShared: mem && mem.shared ? Math.round(mem.shared / 1e6) : null, memOnce: once, shared: st.shared, genTimes: st.times });
          console.log(`${name}: world built in ${Math.round(world.buildMs)} ms, first frame after ${readyMs} ms (page load included), shared ${st.shared}, memory reported ${world.mem} MB (shared ${world.memShared} MB, counted once ${once} MB), browser processes ${rss.totalMB} MB in ${rss.processes} (largest ${rss.largestMB} MB)`);
        }
        for (const d of densities) {
          for (let cam = 0; cam < ncams; cam++) {
            // keep the window in front: macOS throttles a covered window's frames
            await page.bringToFront();
            await page.evaluate(({ d, cam }) => { window.lab.setDensity(d - 1); window.lab.camera(cam); window.lab.freeze(window.lab.cameras[cam].time, 0); }, { d, cam });
            await page.evaluate(() => window.lab.whenIdle());
            await page.evaluate(() => window.lab.timings(60));            // warm up, and let the stripes settle
            const t = await page.evaluate((n) => window.lab.timings(n), frames);
            await lab.check();
            const st = await page.evaluate(() => ({ ...window.lab.state(), visible: document.visibilityState }));
            if (st.visible !== 'visible') console.log(`warning: page was ${st.visible} while timing`);
            if (!st.isolated) console.log('warning: page not cross-origin isolated: timers are coarse');
            if (d === 4 && st.cells !== TOP_CELLS) console.log(`warning: top density gave ${st.cells} cells, not ${TOP_CELLS} (device pixel ratio ${st.dpr})`);
            const iv = t.map((x) => x.interval).filter((x) => x > 0);
            const row = {
              browser: name, threads, scene, density: d, cells: st.cells, grid: `${st.cols}x${st.rows}`,
              cam, camName: st.camName,
              fps: +(1000 / med(iv)).toFixed(1), p95ms: r2(pct(iv, 0.95)),
              march: r2(med(t.map((x) => x.march))), resolve: r2(med(t.map((x) => x.resolve))),
              worker: r2(med(t.map((x) => x.worker))), draw: r2(med(t.map((x) => x.draw))),
              verdict: r2(med(t.map((x) => x.worker + x.draw))),
              isolated: st.isolated, dpr: st.dpr, look: st.look || null, root: a.root || 'this build',
              ...(stress || scene === 'world' ? world : {}),
            };
            rows.push(row);
            console.log(JSON.stringify(row));
          }
        }
        await lab.ctx.close();
      }
    }
    await browser.close();
  }
} finally {
  server.close();
}
const out = a.out || path.join(ROOT, 'shots', 'bench', `bench-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`\nraw rows: ${out}`);
console.log('\n| browser | workers | scene | density | camera | fps (median) | frame p95 ms | march ms | resolve ms | slowest worker ms | draw ms | worker + draw ms |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.browser} | ${r.threads} | ${r.scene} | ${r.density} | ${r.cam + 1} ${r.camName} | ${r.fps} | ${r.p95ms} | ${r.march} | ${r.resolve} | ${r.worker} | ${r.draw} | ${r.verdict} |`);
}
