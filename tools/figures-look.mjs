// (0.5.5) How people read from the front and the back: the building yard's
// row of eight (?yard=1: standing, walking, hoeing, fishing, sweeping, a
// guard, a traveller, a bare head), at midday, from in front and behind at
// 4, 9 and 24 m, and the last of them from the side at 3 m, on one sheet.
// Any build can be shot the same way (--root: a copy of an old build). To
// shots/figures/<tag>.png.
//
//   node tools/figures-look.mjs --tag after [--root DIR]
import fs from 'node:fs';
import path from 'node:path';
import { launch, workbench } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';
import { yardPeopleCameras } from '../src/world/yard.js';

const a = args();
const tag = String(a.tag || 'after');
const OUT = path.join(ROOT, 'shots', 'figures');
fs.mkdirSync(OUT, { recursive: true });
const near = yardPeopleCameras()[0], cx = near.x, cz = near.z - 9;   // (the row's middle)
const D = 180 / Math.PI;
const views = [
  ['front, 4 m (the middle four)', cx, cz + 4, 0, -4],
  ['back, 4 m', cx, cz - 4, 0, -4],
  ['front, 9 m', cx, cz + 9, 0, -3],
  ['back, 9 m', cx, cz - 9, 0, -3],
  ['front, 24 m', cx, cz + 24, 0, -1],
  ['back, 24 m', cx, cz - 24, 0, -1],
  ['the last, from its side, 3 m', cx + 7 + 3, cz, 7, -4],
];
const { server, url } = await serve(a.root ? path.resolve(String(a.root)) : ROOT);
const browser = await launch('chromium');
try {
  const lab = await openLab(browser, url, { built: true, scene: 'yard', width: 1280, height: 720, dpr: 1, density: 3, threads: 8 });
  const { page } = lab;
  await page.evaluate(() => { const L = window.lab; L.setHud(false); L.freeze(12, 0, 0); });
  const tiles = [];
  for (const [label, x, z, tx, pitch] of views) {
    await page.evaluate(async ({ x, z, yaw, pitch }) => {
      const L = window.lab;
      L.setCamera({ x, z, yaw, pitch });
      for (let k = 0; k < 3; k++) await Promise.race([L.whenIdle(), new Promise((r) => setTimeout(r, 4000))]);
    }, { x, z, yaw: Math.atan2(cx + tx - x, cz - z) * D, pitch });
    const d = Math.hypot(x - cx - tx, z - cz), w = d < 5 ? 1100 : d < 12 ? 760 : 320, h = Math.round(w * 0.5);
    const png = await page.screenshot({ clip: { x: 640 - w / 2, y: 360 - h * 0.5, width: w, height: h } });
    tiles.push({ label, src: `data:image/png;base64,${png.toString('base64')}` });
  }
  const wb = await workbench(browser);
  const sheet = await wb.evaluate(async ({ tiles, title }) => {
    const W = 620, H = 310, c = document.createElement('canvas'); c.width = W * 2 + 30; c.height = (H + 26) * Math.ceil(tiles.length / 2) + 40;
    const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#ddd'; g.font = '14px monospace'; g.fillText(title, 10, 22);
    const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
    for (let k = 0; k < tiles.length; k++) {
      const im = await load(tiles[k].src), x = 10 + (k % 2) * (W + 10), y = 36 + Math.floor(k / 2) * (H + 26);
      const sc = Math.min(W / im.width, H / im.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(im, x + (W - im.width * sc) / 2, y + 18, im.width * sc, im.height * sc);
      g.fillStyle = '#aaa'; g.font = '12px monospace'; g.fillText(tiles[k].label, x, y + 12);
    }
    return c.toDataURL('image/png');
  }, { tiles, title: `${tag}: the yard's people at midday` });
  const f = path.join(OUT, `${tag}.png`);
  fs.writeFileSync(f, Buffer.from(sheet.split(',')[1], 'base64'));
  console.log(path.relative(ROOT, f));
  await lab.check();
} finally { await browser.close(); server.close(); }
