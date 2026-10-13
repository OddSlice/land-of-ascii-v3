// A quick look (phase 4b work): shoot named cameras of a scene, frozen.
//   node tools/peek.mjs --scene yard --match "animals" --out <dir> [--hour 14] [--extra k=v,k=v]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const out = a.out; fs.mkdirSync(out, { recursive: true });
const extra = a.extra ? Object.fromEntries(String(a.extra).split(',').map((kv) => kv.split('='))) : null;
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
try {
  const lab = await openLab(browser, url, { scene: a.scene || 'yard', seed: a.seed, extra, threads: a.threads, width: +(a.w || 1280), height: +(a.h || 800), dpr: 1 });
  const { page } = lab;
  await page.evaluate(() => window.lab.setHud(false));
  const names = await page.evaluate(() => window.lab.cameras ? window.lab.cameras.map((c) => c.name) : []);
  const re = new RegExp(a.match || '.', 'i');
  const hour = a.hour !== undefined ? +a.hour : 14;
  for (let i = 0; i < names.length; i++) {
    if (!re.test(names[i])) continue;
    await page.evaluate(async ({ i, hour }) => { window.lab.setWeather('fair'); window.lab.camera(i); window.lab.freeze(hour, 0, 0); await window.lab.whenIdle(); }, { i, hour });
    await lab.check();
    const f = path.join(out, `${String(i).padStart(2, '0')}-${names[i].toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
    await (await page.$('#view')).screenshot({ path: f });
    console.log(f);
  }
  // (--groups 0,5,9 --dist 12: the camera by those animal groups)
  if (a.groups !== undefined) {
    const list = await page.evaluate(() => window.lab.animals.groups());
    for (const g of String(a.groups).split(',').map(Number)) {
      await page.evaluate(async ({ g, hour, dist }) => { window.lab.setWeather('fair'); window.lab.freeze(hour, 0, 0); window.lab.animals.goTo(g, dist); await window.lab.whenIdle(); }, { g, hour, dist: +(a.dist || 12) });
      await lab.check();
      const f = path.join(out, `g${g}-${list[g].type}-${hour}-${a.dist || 12}m.png`);
      await (await page.$('#view')).screenshot({ path: f });
      console.log(f);
    }
  }
  if (a.eval) console.log(JSON.stringify(await page.evaluate(a.eval)));
} finally { await browser.close(); server.close(); }
