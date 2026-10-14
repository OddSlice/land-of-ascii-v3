// A throwaway static server over the repository (or another build's folder,
// for comparisons) for the tools.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg' };

// `isolated: false` serves without the cross-origin isolation headers, as
// GitHub Pages does (the generated world then falls back to copies).
export function serve(root = ROOT, { isolated = true } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/src/index.html';
      let file = path.join(root, p);
      // (phase 6: the game moved to play.html; an older build's copy has only index.html)
      if (p === '/play.html' && !fs.existsSync(file)) file = path.join(root, 'index.html');
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        // cross-origin isolation, so Firefox and WebKit give fine-grained timers
        const iso = isolated ? { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' } : {};
        res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...iso });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

// "cloud=B,meadow=1" -> { cloud: 'B', meadow: '1' }
export function parseLook(s) {
  return s ? Object.fromEntries(String(s).split(',').filter(Boolean).map((kv) => kv.split('='))) : null;
}

export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

// Open the game in a page and wait until it is running. Fails on any page
// error or worker failure. `scene`: 'lab' (the default, for the tools written
// before the generated world), 'stress' (or stress: true) or 'world' (with
// `seed`), or (phase 3a) 'yard', the building yard.
// `quiet` (the default): the menu, the hint and the start card (phase 2b) are
// suppressed from the first frame, so no picture or measurement changes
// because of them; builds without them ignore it.
export async function openLab(browser, base, { built = false, threads, density, stress = false, scene, seed, look = null, width = 1440, height = 900, dpr = 2, extra = null, quiet = true, context = {} } = {}) {
  scene = scene || (stress ? 'stress' : 'lab');
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, ...context });
  if (quiet) await ctx.addInitScript(() => { self.LAND_QUIET = true; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const q = new URLSearchParams();
  if (threads !== undefined) q.set('threads', String(threads));
  if (density !== undefined) q.set('density', String(density));
  if (scene === 'stress') q.set('stress', '1');
  if (scene === 'lab') q.set('lab', '1');
  if (scene === 'yard') q.set('yard', '1');
  if (scene === 'world' && seed !== undefined) q.set('seed', String(seed));
  if (extra) for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  // the look candidates (a build without them ignores these)
  if (look) for (const [k, v] of Object.entries(look)) q.set(k, String(v));
  const url = `${base}/${built ? 'play.html' : ''}${q.toString() ? `?${q}` : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: scene === 'lab' ? 30000 : 180000 });
  await page.evaluate(() => window.lab.ready);
  const check = async () => {
    const labErrors = await page.evaluate(() => window.lab.errors);
    const all = [...errors, ...labErrors];
    if (all.length) throw new Error(`page errors:\n${all.join('\n')}`);
  };
  return { ctx, page, check, url };
}
