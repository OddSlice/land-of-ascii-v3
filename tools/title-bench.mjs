// (phase 6) The title screen's own frame time: the flyover running behind
// the panel (four spots, 20 s each, the clock, the weather and the people
// alive), its frames timed as tools/bench.mjs times a fixed camera's (the
// workers and the draw, the frame rate), in each engine, at density 3 and
// the given workers, for each spot.
//
//   node tools/title-bench.mjs [--browsers chromium,firefox,webkit] [--threads 8]
import { launch } from './lib/browser.mjs';
import { serve, args } from './lib/serve.mjs';

const a = args();
const browsers = String(a.browsers || 'chromium,firefox,webkit').split(','), threads = Number(a.threads || 8);
const { server, url } = await serve();
const q = (s, p) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
try {
  for (const name of browsers) {
    const browser = await launch(name);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(`${url}/play.html?density=3&threads=${threads}`);
    await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 300000 });
    await page.waitForFunction(() => window.lab.titleState().shown, null, { timeout: 20000 });
    const spots = [];
    for (let k = 0; k < 4; k++) {
      // (from 2 s into a spot to 18 s: the cross-fade's frames are the spot's arriving)
      const r = await page.evaluate(async () => {
        const L = window.lab, cam = L.state().camName;
        await new Promise((res) => setTimeout(res, 2000));
        const t = await L.timings(600);
        return { cam, t };
      }).catch(() => null);
      if (!r) break;
      spots.push(r);
      await page.waitForFunction((cam) => window.lab.state().camName !== cam, r.cam, { timeout: 30000 }).catch(() => {});
    }
    for (const s of spots) {
      const f = s.t;
      const work = f.map((x) => x.worker + x.draw).sort((x, y) => x - y), iv = f.map((x) => x.interval).filter((x) => x > 0);
      const fps = iv.length ? 1000 / (iv.reduce((x, y) => x + y, 0) / iv.length) : 0;
      console.log(`${name.padEnd(8)} ${s.cam.padEnd(40)} ${f.length} frames, ${fps.toFixed(0)} fps, workers and draw: median ${q(work, 0.5).toFixed(2)} ms, 95% ${q(work, 0.95).toFixed(2)} ms`);
    }
    await browser.close();
  }
} finally { server.close(); }
