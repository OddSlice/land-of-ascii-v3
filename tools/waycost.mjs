// (phase 5a) The main thread's cost of wayfaring, per frame, in the
// browsers: what you see (the rays over the 16 m squares), the places found,
// the lost things, who you last saw, what you carry, and saving (a change is
// written at most every four seconds, at once for a favour). Measured while
// walking a road in real time for 20 s, then walking and turning for 10 s,
// with the lantern lit, a thing carried and a lost thing waiting, progress
// written to the browser's storage as in play.
//
//   node tools/waycost.mjs [--browser chromium,firefox,webkit] [--built]
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const browsers = String(a.browser || 'chromium,firefox,webkit').split(',');
const { server, url } = await serve();
const rows = [];
try {
  for (const name of browsers) {
    const browser = await launch(name, { headless: name === 'webkit' ? true : a.headed ? false : true });
    try {
      const lab = await openLab(browser, url, { built: !!a.built, scene: 'world' });
      const { page } = lab;
      await page.evaluate(async () => {
        const L = window.lab;
        L.progress.enable({ store: true });
        const F = L.progress.favours();
        L.progress.setFavour(F.find((f) => f.kind === 'carry').id, 2);
        L.progress.setFavour(F.find((f) => f.kind === 'find').id, 2);
        L.progress.setLit(true);
        L.camera(7); L.setWeather('fair');
        await L.whenIdle();
        L.unfreeze(); L.runClock(true, 1 / 3600);
      });
      // (with a control: a fixed piece of arithmetic about as long as
      // wayfaring's usual frame, timed in the same frames, which shows how
      // often the browser and the machine stall any work for 0.2 ms or more)
      const sample = (secs) => page.evaluate((secs) => new Promise((res) => {
        const out = [], ctl = [], t0 = performance.now();
        const step = () => {
          out.push(window.lab.wayMs);
          const c0 = performance.now(); let x = 0; for (let i = 0; i < 4000; i++) x += Math.sqrt(i * 1.5 + x * 1e-9); window.__x = x; ctl.push(performance.now() - c0);
          if (performance.now() - t0 < secs * 1000) requestAnimationFrame(step); else res({ out, ctl });
        };
        requestAnimationFrame(step);
      }), secs);
      const saves0 = await page.evaluate(() => window.lab.progress.saves);
      await page.keyboard.down('KeyW');
      const walk = await sample(20);
      await page.keyboard.down('ArrowLeft');
      const turn = await sample(10);
      await page.keyboard.up('ArrowLeft'); await page.keyboard.up('KeyW');
      const info = await page.evaluate(() => ({ saves: window.lab.progress.saves, saveMs: window.lab.progress.saveMs, stored: (window.lab.progress.stored() || '').length, seen: Math.round(window.lab.progress.journal.data().seen * 1000) / 10 }));
      await lab.check();
      const all = [...walk.out, ...turn.out].filter((x) => typeof x === 'number');
      const ctl = [...walk.ctl, ...turn.ctl];
      const q = (p) => { const s = [...all].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
      rows.push({ name, n: all.length, median: q(0.5), p95: q(0.95), max: q(1), over: all.filter((x) => x >= 0.2).length, ctlMedian: [...ctl].sort((x, y) => x - y)[ctl.length >> 1], ctlOver: ctl.filter((x) => x >= 0.2).length, saves: info.saves - saves0, saveMs: info.saveMs, stored: info.stored, seen: info.seen });
      console.log(name, JSON.stringify(rows[rows.length - 1]));
      await lab.ctx.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); }
console.log('\n| browser | frames | median | 95% of frames under | slowest frame | frames at 0.2 ms or more | the control: median, frames at 0.2 ms or more | saves in 30 s | a save\'s longest step | the record |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.n} | ${r.median.toFixed(3)} ms | ${r.p95.toFixed(3)} ms | ${r.max.toFixed(3)} ms | ${r.over} | ${r.ctlMedian.toFixed(3)} ms, ${r.ctlOver} | ${r.saves} | ${r.saveMs.toFixed(3)} ms | ${r.stored} characters |`);
