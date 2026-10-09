// Builds the public lookbook for docs/phase0a.md in shots/phase0a/ (the one
// part of shots/ kept in git): one sheet per camera with our frames only (no
// reference footage, which stays private), and close-ups of what the glyphs
// add over flat colour. Run tools/shoot.mjs first.
//   node tools/lookbook.mjs [--built]
import fs from 'node:fs';
import path from 'node:path';
import { launch, workbench, dataURL, writeDataURL } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const SHOTS = path.join(ROOT, 'shots');
const OUT = path.join(SHOTS, 'phase0a');
fs.mkdirSync(OUT, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const times = ['day', 'dusk', 'night'];

const { server, url } = await serve();
const browser = await launch('chromium');
try {
  const lab = await openLab(browser, url, { built: !!a.built });
  const { page } = lab;
  await page.evaluate(() => window.lab.setHud(false));
  const cams = await page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
  const bench = await workbench(browser);

  // one sheet per camera: its own time large, then day, dusk and night
  for (let i = 0; i < cams.length; i++) {
    const c = cams[i];
    const own = (t) => path.join(SHOTS, `${i + 1}-${slug(c.name)}-${t}.png`);
    const jpg = await bench.evaluate(async ({ main, row, title, labels }) => {
      const [M, ...T] = await Promise.all([main, ...row].map(loadImage));
      const W = 1600, pad = 12, top = 30;
      const mh = Math.round(M.height * W / M.width);
      const cw = Math.round((W - 2 * pad) / 3), ch = Math.round(M.height * cw / M.width);
      const c = document.createElement('canvas');
      c.width = W + 2 * pad; c.height = top + mh + pad + ch + 26 + pad;
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.imageSmoothingQuality = 'high';
      g.drawImage(M, pad, top, W, mh);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      T.forEach((im, k) => {
        const x = pad + k * (cw + pad);
        g.drawImage(im, x, top + mh + pad, cw, ch);
        g.fillText(labels[k], x, top + mh + pad + ch + 17);
      });
      return c.toDataURL('image/jpeg', 0.86);
    }, { main: dataURL(own(c.time)), row: times.map((t) => dataURL(own(t))), title: `${i + 1}. ${c.name} (${c.time})`, labels: times });
    writeDataURL(path.join(OUT, `look-${i + 1}-${slug(c.name)}.jpg`), jpg);
  }

  // close-ups at 100%: glyphs on and off, at the top density and the lowest
  const crops = [];
  for (const [density, label] of [[3, 'top density, 7 x 14 px cells'], [0, 'lowest density, 13 x 26 px cells']]) {
    for (const glyphs of [true, false]) {
      await page.evaluate(({ density, glyphs }) => { window.lab.setDensity(density); window.lab.camera(1); window.lab.freeze('day', 0); window.lab.setGlyphs(glyphs); }, { density, glyphs });
      await page.evaluate(() => window.lab.whenIdle());
      await lab.check();
      const buf = await (await page.$('#view')).screenshot();
      crops.push({ src: `data:image/png;base64,${buf.toString('base64')}`, label: `${label}, glyphs ${glyphs ? 'on' : 'off (G)'}` });
    }
  }
  await page.evaluate(() => { window.lab.setGlyphs(true); window.lab.setDensity(3); });
  const jpg = await bench.evaluate(async ({ crops }) => {
    const ims = await Promise.all(crops.map((c) => loadImage(c.src)));
    // the same patch of the meadow camera: tree, grass and sky
    const fx = 0.03, fy = 0.24, fw = 0.22, fh = 0.27;
    const pad = 12, top = 30, w = Math.round(ims[0].width * fw), h = Math.round(ims[0].height * fh);
    const c = document.createElement('canvas');
    c.width = pad + 2 * (w + pad); c.height = top + 2 * (h + 26 + pad);
    const g = c.getContext('2d');
    g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText('What the glyphs add: the same patch at 100%, glyphs on and off', pad, 21);
    g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
    ims.forEach((im, k) => {
      const x = pad + (k % 2) * (w + pad), y = top + Math.floor(k / 2) * (h + 26 + pad);
      g.imageSmoothingEnabled = false;
      g.drawImage(im, im.width * fx, im.height * fy, w, h, x, y, w, h);
      g.fillText(crops[k].label, x, y + h + 17);
    });
    return c.toDataURL('image/jpeg', 0.9);
  }, { crops });
  writeDataURL(path.join(OUT, 'glyphs-on-off.jpg'), jpg);
  console.log(fs.readdirSync(OUT).map((f) => `shots/phase0a/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
} finally {
  await browser.close();
  server.close();
}
