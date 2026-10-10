// How smoothly the view turns. Holds the right arrow (a steady 1.7 radians
// a second) in a real, visible browser window and checks, frame by frame,
// that the view moved on by as much as the time the frame was on screen
// (in whole display refreshes): a frame shown late makes the view stall,
// and the next jump to catch up, which is what "the camera skips while
// turning" feels like. A jump is more than 1.4 times, a stall less than
// 0.65 times.
//
//   node tools/smooth.mjs [--browser chromium,firefox] [--seconds 6] [--root DIR] [--built]
//
// --root measures another build's folder (for example a copy of an earlier
// phase) instead of this one. Each view waits three seconds after loading
// first, so start-up is not counted. WebKit is left out by default: its
// visible test window is throttled after a minute.
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const browsers = String(a.browser || 'chromium,firefox').split(',');
const seconds = Number(a.seconds || 6);
const VIEWS = [
  { label: 'lab, road to the wall', cam: 0 },
  { label: 'lab, lake shore', cam: 2 },
  { label: 'lab, lake shore, clock running', cam: 2, clock: true },
  { label: 'stress, across the lake', cam: 1, stress: true },
];
const TURN = 1.7;                      // radians a second, the arrow keys' rate (app/input.js)

const { server, url } = await serve(a.root || ROOT);
const rows = [];
try {
  for (const name of browsers) {
    const browser = await launch(name, { headless: false });
    for (const v of VIEWS) {
      const lab = await openLab(browser, url, { built: !!a.built, stress: !!v.stress });
      const { page } = lab;
      await page.bringToFront();
      await page.evaluate(({ cam, clock }) => { window.lab.setHud(false); window.lab.camera(cam); if (clock) window.lab.runClock(true); }, v);
      await page.evaluate(() => window.lab.whenIdle());
      await page.waitForTimeout(3000);
      const n = Math.round(seconds * 120);
      const timings = page.evaluate((n) => window.lab.timings(n), n);
      await page.keyboard.down('ArrowRight');
      const t = await timings;
      await page.keyboard.up('ArrowRight');
      await lab.check();
      if (t[0].yaw === undefined) throw new Error('this build does not report the camera per frame (lab.timings)');
      // the display's refresh (as the page measures it; an older build
      // without that, from the shortest usual gap between frames), and how
      // many refreshes each frame was on screen (requestAnimationFrame's
      // times wobble by a few milliseconds, the display does not)
      const st = await page.evaluate(() => window.lab.state());
      const gaps = t.slice(1).map((x, i) => x.at - t[i].at).sort((p, q) => p - q);
      const R = st.refresh || gaps[Math.floor(gaps.length * 0.1)];
      let jumps = 0, stalls = 0;
      for (let i = 2; i < t.length; i++) {
        const shown = R * Math.max(1, Math.round((t[i].at - t[i - 1].at) / R)), moved = t[i].yaw - t[i - 1].yaw;
        const r = moved / (TURN * shown / 1000);
        if (r > 1.4) jumps++; else if (r < 0.65) stalls++;
      }
      const fps = 1000 * (t.length - 1) / (t[t.length - 1].at - t[0].at);
      const row = { browser: name, view: v.label, fps: +fps.toFixed(0), jumps: +(100 * jumps / (t.length - 2)).toFixed(1), stalls: +(100 * stalls / (t.length - 2)).toFixed(1), pace: st.pace, lag: st.lag };
      rows.push(row);
      console.log(JSON.stringify(row));
      await lab.ctx.close();
    }
    await browser.close();
  }
} finally {
  server.close();
}
console.log('\n| browser | view | frames shown a second | view jumps ahead | view stalls | pacing at the end |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.browser} | ${r.view} | ${r.fps} | ${r.jumps}% | ${r.stalls}% | ${r.pace ? `every ${r.pace}, lag ${r.lag}` : '–'} |`);
