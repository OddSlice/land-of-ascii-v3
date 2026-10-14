// (phase 6) The front page's own cost: the main thread's busy time while it
// sits idle for ten seconds after loading (the pictures drawn once, nothing
// after), as a share of one core; and that it never loads the game: every
// request it makes, by name.
//
//   node tools/front-check.mjs
import { launch } from './lib/browser.mjs';
import { serve } from './lib/serve.mjs';

const { server, url } = await serve();
const browser = await launch('chromium');
try {
  for (const [w, h] of [[1280, 720], [375, 812]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const reqs = [];
    page.on('request', (r) => reqs.push(new URL(r.url()).pathname));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await page.goto(`${url}/index.html`);
    await page.waitForTimeout(2000);
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await page.waitForTimeout(10000);
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const busy = m1.TaskDuration - m0.TaskDuration, wall = m1.Timestamp - m0.Timestamp;
    console.log(`${w} x ${h}: idle, the main thread busy ${(busy * 1000).toFixed(1)} ms in ${wall.toFixed(1)} s = ${(100 * busy / wall).toFixed(3)}% of a core; requests: ${[...new Set(reqs)].join(', ')}`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
