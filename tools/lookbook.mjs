// Builds the public lookbooks (the parts of shots/ kept in git), from our own
// frames only (no reference footage, which stays private). Run
// tools/shoot.mjs first.
//   node tools/lookbook.mjs [--built]              docs/phase0a.md: one sheet per camera, and
//                                                  what the glyphs add over flat colour (shots/phase0a/)
//   node tools/lookbook.mjs --phase 0b [--built] [--density 4]   docs/phase0b.md: the lake at day, dusk and night,
//                                                  and the stress scene's cameras (shots/phase0b/)
import fs from 'node:fs';
import path from 'node:path';
import { launch, workbench, dataURL, writeDataURL } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const SHOTS = path.join(ROOT, 'shots');
const PHASE = a.phase === '0b' ? '0b' : '0a';
const OUT = path.join(SHOTS, `phase${PHASE}`);
fs.mkdirSync(OUT, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const times = ['day', 'dusk', 'night'];

const { server, url } = await serve();
const browser = await launch('chromium');
try {
  const lab = await openLab(browser, url, { built: !!a.built, density: a.density });
  const { page } = lab;
  await page.evaluate(() => window.lab.setHud(false));
  const cams = await page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
  const bench = await workbench(browser);

  // a sheet: one frame large, then a row of three
  const sheet = (main, row, title, labels) => bench.evaluate(async ({ main, row, title, labels }) => {
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
  }, { main, row, title, labels });

  // one sheet per camera (phase 0b: the two lake cameras): its own time
  // large, then day, dusk and night
  for (let i = 0; i < cams.length; i++) {
    if (PHASE === '0b' && i !== 2 && i !== 5) continue;
    const c = cams[i];
    const own = (t) => path.join(SHOTS, `${i + 1}-${slug(c.name)}-${t}.png`);
    const jpg = await sheet(dataURL(own(c.time)), times.map((t) => dataURL(own(t))), `${i + 1}. ${c.name} (${c.time})`, times);
    writeDataURL(path.join(OUT, `look-${i + 1}-${slug(c.name)}.jpg`), jpg);
  }

  if (PHASE === '0b') {
    // the stress scene: the lake large, then its three cameras by day
    await lab.ctx.close();
    const st = await openLab(browser, url, { built: !!a.built, stress: true, density: a.density });
    await st.page.evaluate(() => window.lab.setHud(false));
    const names = await st.page.evaluate(() => window.lab.cameras.map((c) => c.name));
    const grab = async (cam, t) => {
      await st.page.evaluate(({ cam, t }) => {
        if (typeof cam === 'number') window.lab.camera(cam); else window.lab.setCamera(cam);
        window.lab.freeze(t, typeof cam === 'number' ? 0 : 3);
      }, { cam, t });
      await st.page.evaluate(() => window.lab.whenIdle());
      await st.check();
      const buf = await (await st.page.$('#view')).screenshot();
      return `data:image/png;base64,${buf.toString('base64')}`;
    };
    const row = [];
    for (let k = 0; k < 3; k++) row.push(await grab(k, 'day'));
    const short = names.map((n) => n.replace(/^stress: /, ''));
    writeDataURL(path.join(OUT, 'stress-cameras.jpg'), await sheet(row[1], row, 'Stress scene: 2048 x 2048 m, 1,500 m view, its three cameras by day', short));
    // a torch on the south shore and its reflection, from just above the water
    const torch = await grab({ x: 720, z: 690, y: 35.8, yaw: 180, pitch: -4 }, 'night');
    const lake = [await grab(1, 'day'), await grab(1, 'dusk'), await grab(1, 'night')];
    writeDataURL(path.join(OUT, 'stress-lake.jpg'), await sheet(torch, lake, `Stress scene at night: a lakeside torch and its reflection; below, ${short[1]}`, times));
  } else {
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
  }
  console.log(fs.readdirSync(OUT).map((f) => `shots/phase${PHASE}/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
} finally {
  await browser.close();
  server.close();
}
