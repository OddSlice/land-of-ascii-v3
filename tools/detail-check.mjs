// (phase 6) The detail level chosen on a first visit, on this machine and
// on Chromium slowed down (the DevTools CPU throttle, 1x, 2x, 4x and 6x:
// the page and its workers run that many times slower): what each chose,
// and what each level measured. A first visit each time (a fresh profile);
// ?autodetail=1 because a tool's browser is otherwise left alone.
//
//   node tools/detail-check.mjs [--rates 1,2,4,6]
import { launch } from './lib/browser.mjs';
import { serve, args } from './lib/serve.mjs';
import { openVisitor } from './lib/game.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/serve.mjs';

const a = args();
const rates = String(a.rates || '1,2,4,6').split(',').map(Number);
const { server, url } = await serve();
const browser = await launch('chromium');
const out = [];
try {
  for (const rate of rates) {
    const { ctx, page } = await openVisitor(browser, url, { width: 1280, height: 720, query: `?autodetail=1${a.threads ? `&threads=${a.threads}` : ''}`, timeout: 300000,
      before: async (pg, c) => { const cdp = await c.newCDPSession(pg); await cdp.send('Emulation.setCPUThrottlingRate', { rate }); } });
    await page.waitForFunction(() => window.lab.autoDetail, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ ...window.lab.autoDetail, note: window.lab.titleState().note, kept: JSON.parse(localStorage.getItem('land-of-ascii-v3.display')) }));
    out.push({ rate, ...r });
    console.log(`CPU ${rate}x slower: chose ${r.chosen}; measured ${r.tried.map((t) => `${t.level} ${t.p90} ms`).join(', ')}; kept: density ${r.kept.density}, auto ${r.kept.auto}`);
    console.log(`  "${r.note}"`);
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
fs.mkdirSync(path.join(ROOT, 'shots', 'phase6'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'shots', 'phase6', 'detail-check.json'), JSON.stringify(out, null, 1));
