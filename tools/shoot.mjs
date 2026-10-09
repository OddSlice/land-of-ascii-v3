// Shoots the five fixed cameras at day, dusk and night with every clock
// frozen, into shots/, and builds one sheet per camera that puts the frame
// beside its reference thumbnail (reference/thumbs/, private).
//
//   node tools/shoot.mjs                 all cameras, all times, sheets
//   node tools/shoot.mjs --cams 0,3 --times night --no-sheets
//   node tools/shoot.mjs --built         shoot the built index.html instead of src/
//   options: --threads N, --density 1..4, --browser chromium|firefox|webkit, --out dir,
//            --cam x,z,yaw,pitch --time day --name test  (a free camera)
import fs from 'node:fs';
import path from 'node:path';
import { launch, dataURL, writeDataURL, workbench } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const out = path.join(ROOT, a.out || 'shots');
fs.mkdirSync(out, { recursive: true });
const times = (a.times || 'day,dusk,night').split(',');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
let failed = false;
try {
  const lab = await openLab(browser, url, { built: !!a.built, threads: a.threads, density: a.density });
  const { page } = lab;
  await page.evaluate(() => window.lab.setHud(false));
  const cams = await page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, ref: c.ref, refLabel: c.refLabel, time: c.time })));
  const shots = [];
  const shoot = async (file) => {
    await page.evaluate(() => window.lab.whenIdle());
    await lab.check();
    const el = await page.$('#view');
    await el.screenshot({ path: file });
    shots.push(file);
  };
  if (a.cam) {
    const [x, z, yaw, pitch, y] = a.cam.split(',').map(Number);
    for (const t of times) {
      await page.evaluate(({ x, z, yaw, pitch, y, t }) => { window.lab.setCamera({ x, z, yaw, pitch, y: isNaN(y) ? undefined : y }); window.lab.freeze(t, 0); }, { x, z, yaw, pitch, y, t });
      await shoot(path.join(out, `${a.name || 'free'}-${t}.png`));
    }
  } else {
    const list = a.cams ? String(a.cams).split(',').map(Number) : cams.map((_, i) => i);
    for (const i of list) {
      for (const t of times) {
        await page.evaluate(({ i, t }) => { window.lab.camera(i); window.lab.freeze(t, 0); }, { i, t });
        await shoot(path.join(out, `${i + 1}-${slug(cams[i].name)}-${t}.png`));
      }
    }
    if (!a['no-sheets']) {
      const bench = await workbench(browser);
      for (const i of list) {
        const c = cams[i];
        const refFile = path.join(ROOT, 'reference', 'thumbs', c.ref);
        const own = (t) => path.join(out, `${i + 1}-${slug(c.name)}-${t}.png`);
        if (!times.includes(c.time) || !fs.existsSync(refFile)) continue;
        const png = await bench.evaluate(async ({ ref, main, row, title, labels }) => {
          const [R, M, ...T] = await Promise.all([ref, main, ...row].map(loadImage));
          const H = 660, pad = 14, top = 34;
          const rw = Math.round(R.width * H / R.height);
          const mw = Math.round(M.width * H / M.height);
          const th = Math.round((H - pad) / 2);
          const tw = Math.round(M.width * th / M.height);
          const W = pad + rw + pad + rw + pad + mw + pad;
          const rowH = Math.round(((W - pad) / T.length - pad) * M.height / M.width);
          const c = document.createElement('canvas');
          c.width = W; c.height = top + H + pad + 22 + rowH + 22 + pad;
          const g = c.getContext('2d');
          g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
          g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace';
          g.fillText(title, pad, 22);
          g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
          // the reference, our frame cropped to the reference's shape, our whole frame
          g.imageSmoothingQuality = 'high';
          g.drawImage(R, pad, top, rw, H);
          const cropW = M.height * R.width / R.height;
          g.drawImage(M, (M.width - cropW) / 2, 0, cropW, M.height, pad * 2 + rw, top, rw, H);
          g.drawImage(M, pad * 3 + rw * 2, top, mw, H);
          g.fillText(labels[0], pad, top + H + 16);
          g.fillText(labels[1], pad * 2 + rw, top + H + 16);
          g.fillText(labels[2], pad * 3 + rw * 2, top + H + 16);
          // the three times of day
          const y2 = top + H + pad + 22;
          const cw = Math.round((W - pad) / T.length - pad);
          T.forEach((im, k) => {
            g.drawImage(im, pad + k * (cw + pad), y2, cw, rowH);
            g.fillText(labels[3 + k], pad + k * (cw + pad), y2 + rowH + 16);
          });
          return c.toDataURL('image/png');
        }, {
          ref: dataURL(refFile), main: dataURL(own(c.time)), row: times.map((t) => dataURL(own(t))),
          title: `${i + 1}. ${c.name}`,
          labels: [`reference: ${c.refLabel}`, `Look Lab, ${c.time}, same shape`, `Look Lab, ${c.time}, whole frame`, ...times.map((t) => `Look Lab, ${t}`)],
        });
        const file = path.join(out, `sheet-${i + 1}-${slug(c.name)}.png`);
        writeDataURL(file, png);
        shots.push(file);
      }
    }
  }
  console.log(shots.map((s) => path.relative(ROOT, s)).join('\n'));
} catch (err) {
  console.error(err.message);
  failed = true;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
