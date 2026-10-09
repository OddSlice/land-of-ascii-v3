// Frame timings at each density, through the debug handle with a fixed
// camera and every clock frozen (no mouse look: headless browsers report very
// low frame rates with it). Runs a real, visible browser window by default so
// the GPU and the display's frame clock are the real ones.
//
//   node tools/bench.mjs [--browser chromium,firefox,webkit] [--cams 0,1] [--frames 300]
//                        [--headless] [--built] [--threads N]
//
// Before timing anything, close every other copy of the game (browser tabs,
// the Claude app's browser pane) and check the machine is idle.
import { execSync } from 'node:child_process';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const browsers = (a.browser || 'chromium,firefox,webkit').split(',');
const cams = (a.cams || '0,1').split(',').map(Number);
const frames = Number(a.frames || 300);

// What else is busy right now (the harness's own browsers are not up yet).
const busy = execSync('ps -Ao %cpu,comm -r | head -8').toString().trim().split('\n').slice(1)
  .map((l) => l.trim()).filter((l) => parseFloat(l) > 15);
console.log(`busy processes before the run (>15% CPU): ${busy.length ? `\n  ${busy.join('\n  ')}` : 'none'}`);

const med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const pct = (xs, p) => { const s = [...xs].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const { server, url } = await serve();
const rows = [];
try {
  for (const name of browsers) {
    const browser = await launch(name, { headless: !!a.headless });
    const lab = await openLab(browser, url, { built: !!a.built, threads: a.threads });
    const { page } = lab;
    await page.evaluate(() => window.lab.setHud(false));
    for (let d = 0; d < 4; d++) {
      for (const cam of cams) {
        await page.evaluate(({ d, cam }) => { window.lab.setDensity(d); window.lab.camera(cam); window.lab.freeze(window.lab.cameras[cam].time, 0); }, { d, cam });
        await page.evaluate(() => window.lab.whenIdle());
        await page.evaluate(() => window.lab.timings(60));            // warm up
        const t = await page.evaluate((n) => window.lab.timings(n), frames);
        await lab.check();
        const st = await page.evaluate(() => window.lab.state());
        const iv = t.map((x) => x.interval).filter((x) => x > 0);
        const row = {
          browser: name, density: d + 1, cells: st.cells, grid: `${st.cols}x${st.rows}`, cam,
          fps: +(1000 / med(iv)).toFixed(1), p95ms: +pct(iv, 0.95).toFixed(1),
          frameMs: +med(iv).toFixed(2),
          march: +med(t.map((x) => x.march)).toFixed(2),
          resolve: +med(t.map((x) => x.resolve)).toFixed(2),
          draw: +med(t.map((x) => x.draw)).toFixed(2),
          threads: st.threads,
        };
        rows.push(row);
        console.log(JSON.stringify(row));
      }
    }
    await browser.close();
  }
} finally {
  server.close();
}
console.log('\n| browser | density | cells | camera | fps (median) | frame p95 ms | march ms | resolve ms | draw ms |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.browser} | ${r.density} | ${r.cells.toLocaleString('en-US')} | ${r.cam + 1} | ${r.fps} | ${r.p95ms} | ${r.march} | ${r.resolve} | ${r.draw} |`);
