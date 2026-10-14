// (phase 6) The front page's pictures, made by the game itself: the main
// picture (the lake shore at dawn) and four sketches from the default seed,
// each the cells of a frame the game drew (background, glyph, ink), saved
// as data the front page draws once (src/front/front.js) with no game
// loaded. Colours rounded to 5 bits a channel, the cells deflated and kept
// as base64 in src/front/data.json; the share image (og.png, 1200 x 630)
// is drawn by the front page itself from the same data (?og=1).
//
//   node tools/front.mjs            the data (run before npm run build)
//   node tools/front.mjs --og       the share image, from the built front page
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch } from './lib/browser.mjs';
import { serve, openLab, args, ROOT } from './lib/serve.mjs';
import { GLYPHS } from '../src/glyphs.js';

const a = args();
const { server, url } = await serve();
const browser = await launch('chromium');
try {
  if (a.og) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.goto(`${url}/index.html?og=1`);
    await page.waitForFunction(() => window.ogDone === true, null, { timeout: 30000 });
    await page.locator('#og').screenshot({ path: path.join(ROOT, 'og.png') });
    console.log(`og.png: ${(fs.statSync(path.join(ROOT, 'og.png')).size / 1024).toFixed(0)} KB`);
  } else {
    const grab = async (w, h, density, shots) => {
      const lab = await openLab(browser, url, { built: true, scene: 'world', seed: 3, width: w, height: h, dpr: 1, threads: 8, density });
      const out = [];
      for (const [name, hour, words] of shots) {
        const r = await lab.page.evaluate(async ({ name, hour }) => {
          const L = window.lab, i = L.cameras.findIndex((c) => c.name === name);
          if (i < 0) return null;
          L.setHud(false); L.setWeather('fair'); L.camera(i); L.freeze(hour, 0);
          for (let k = 0; k < 4; k++) await L.whenIdle();
          const s = L.state();
          return { cols: s.cols, rows: s.rows, cells: Array.from(L.cells()) };
        }, { name, hour });
        if (!r) throw new Error(`no camera ${name}`);
        // 7 bytes a cell, colours to 5 bits a channel
        const n = r.cols * r.rows, u = new Uint8Array(n * 7);
        for (let c = 0; c < n; c++) {
          const q = c * 8;
          // [background r g b, glyph, ink r g b]
          for (let k = 0; k < 7; k++) u[c * 7 + k] = k === 3 ? r.cells[q + 3] : (r.cells[q + k] & 0xf8) | 4;
        }
        const z = zlib.deflateRawSync(Buffer.from(u), { level: 9 });
        out.push({ name, words, hour, cols: r.cols, rows: r.rows, data: z.toString('base64') });
        console.log(`${name}: ${r.cols} x ${r.rows}, ${(z.length / 1024).toFixed(1)} KB`);
      }
      await lab.ctx.close();
      return out;
    };
    const [hero] = await grab(960, 420, 3, [['main lake shore', 6.5, 'Still Mere at dawn']]);
    const sketches = await grab(520, 260, 2, [
      ['village 2 (green), at midday', 12, 'Elmswick green, at midday'],
      ['the stone bridge from its bank', 9, 'the bridge over the Skell'],
      ['the wall walk over the valley', 18.6, 'the fort\'s wall walk, at dusk'],
      ['village 1 (shore), its centre', 19.3, 'Dunholme, after dark'],
    ]);
    const data = { glyphs: GLYPHS.join(''), hero, sketches };
    fs.writeFileSync(path.join(ROOT, 'src/front/data.json'), JSON.stringify(data));
    console.log(`src/front/data.json: ${(fs.statSync(path.join(ROOT, 'src/front/data.json')).size / 1024).toFixed(0)} KB`);
  }
} finally { await browser.close(); server.close(); }
