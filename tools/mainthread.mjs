// (phase 4b) The main thread's update of people and animals together, per
// frame, in the browsers: everyone's state, the animals' states, the
// meetings, the bodies near you and the far birds' marks (lab.mainMs). With
// the clock running through a busy morning beside the first flock (it leaves
// its fold), then on its pasture at midday, then by its fold at dusk (it
// comes back in): the median, the 95th percentile and the slowest frame.
//
//   node tools/mainthread.mjs [--browser chromium,firefox,webkit] [--seed N] [--secs 20] [--built]
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const browsers = String(a.browser || 'chromium,firefox,webkit').split(',');
const secs = Number(a.secs || 20);
const { server, url } = await serve();
const rows = [];
try {
  for (const name of browsers) {
    const browser = await launch(name, { headless: name === 'webkit' ? true : a.headed ? false : true });
    try {
      const lab = await openLab(browser, url, { built: !!a.built, scene: 'world', seed: a.seed });
      const { page } = lab;
      const all = [];
      for (const [label, hour, rate] of [['the morning: the flock leaving its fold', 6.0, 1 / 60], ['midday on the pasture', 12.0, 1 / 3600], ['dusk: the flock coming in', 17.8, 1 / 60]]) {
        const ms = await page.evaluate(async ({ hour, rate, secs }) => {
          const L = window.lab;
          L.setWeather('fair');
          const g = L.animals.groups().find((q) => q.type === 'flock');
          L.setHour(hour);
          L.animals.goTo(g.id, 14);
          await L.whenIdle();
          L.unfreeze(); L.runClock(true, rate);
          const out = [];
          let last = -1;
          await new Promise((res) => {
            const t0 = performance.now();
            const step = () => { const s = L.state().presented; if (s !== last && L.mainMs !== undefined) { out.push(L.mainMs); last = s; } if (performance.now() - t0 < secs * 1000) requestAnimationFrame(step); else res(); };
            step();
          });
          L.runClock(false);
          return out;
        }, { hour, rate, secs });
        await lab.check();
        all.push(...ms);
        const q = (p) => { const s = [...ms].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
        console.log(`${name}, ${label}: ${ms.length} frames, median ${q(0.5).toFixed(3)} ms, 95% under ${q(0.95).toFixed(3)} ms, slowest ${q(1).toFixed(3)} ms`);
      }
      const q = (p) => { const s = [...all].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
      rows.push({ name, n: all.length, median: q(0.5), p95: q(0.95), max: q(1), over: all.filter((x) => x >= 1).length });
      await lab.ctx.close();
    } finally { await browser.close(); }
  }
} finally { server.close(); }
console.log('\n| browser | frames | median | 95% of frames under | slowest frame | frames at 1 ms or more |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} | ${r.n} | ${r.median.toFixed(3)} ms | ${r.p95.toFixed(3)} ms | ${r.max.toFixed(3)} ms | ${r.over} |`);
