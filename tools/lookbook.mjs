// The regression lookbook: the fixed cameras of every scene (nine in the Look
// Lab, three in the stress scene, the generated world's for the default seed
// with the people's and the animals' cameras, the building yard's) at day,
// dusk and night with every clock frozen and the weather held at fair,
// compared cell for cell with the set saved in tools/regress/. It reports
// the share of cells that changed in each frame, so a change can show it did
// not disturb the picture by accident; tools/regress-why.mjs shows where and
// why a frame changed.
//
//   node tools/lookbook.mjs --regress [--save] [--built] [--scenes lab,stress,world,yard]
//                           [--weather fair] [--people off] [--gen off] [--density 3]
//
// --save replaces the saved set. --people off: no people; --gen off: no wild
// ground detail and no animals (phase 4a's world).
//
// (Until phase 6.1 this tool also made each phase record's pictures, with
// --phase 0a to 4b; those pictures are kept in shots/, and the code in git.)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';
import { openLab, view } from './lib/game.mjs';

const a = args();
if (!a.regress) { console.log('usage: node tools/lookbook.mjs --regress [--save] [--built] [--scenes lab,stress,world,yard]'); process.exit(1); }
await regress();
process.exit(process.exitCode || 0);

async function regress() {
  const DIR = path.join(ROOT, 'tools', 'regress');
  const times = ['day', 'dusk', 'night'];
  const density = Number(a.density || 3);
  const { server, url } = await serve();
  const browser = await launch('chromium');
  const frames = [];
  // (phase 3a: and the building yard)
  const scenes = String(a.scenes || 'lab,stress,world,yard').split(',');
  const weather = String(a.weather || 'fair');
  try {
    for (const scene of scenes) {
      // (phase 4b: --gen off: no wild ground detail and no animals, phase 4a's world)
      const lab = await openLab(browser, url, { built: !!a.built, scene, density, threads: 8, extra: a.gen === 'off' ? { wild: 0, animals: 0 } : null });
      const { page } = lab;
      const cams = await page.evaluate(() => window.lab.cameras.map((c) => c.name));
      for (let i = 0; i < cams.length; i++) {
        for (const t of times) {
          // (phase 4a: people on, or off with --people off; phase 2b: the
          // weather held at fair, the look before weather)
          await page.evaluate((people) => { if (window.lab.people) window.lab.people.set(people); }, a.people !== 'off');
          await view(page, { camera: i, hour: t, weather });
          const cells = await page.evaluate(() => { const st = window.lab.state(); return { cols: st.cols, rows: st.rows, data: Array.from(window.lab.cells()) }; });
          await lab.check();
          frames.push({ name: `${scene} ${i + 1} ${cams[i]} (${t})`, cols: cells.cols, rows: cells.rows, data: Uint8Array.from(cells.data) });
        }
      }
      await lab.ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (a.save) {
    fs.mkdirSync(DIR, { recursive: true });
    let off = 0;
    const index = frames.map((f) => { const e = { name: f.name, cols: f.cols, rows: f.rows, offset: off, length: f.data.length }; off += f.data.length; return e; });
    const all = Buffer.concat(frames.map((f) => Buffer.from(f.data)));
    fs.writeFileSync(path.join(DIR, 'cells.bin.gz'), zlib.gzipSync(all, { level: 9 }));
    fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ saved: new Date().toISOString(), density, frames: index }, null, 1));
    console.log(`saved ${frames.length} frames to tools/regress/ (${(fs.statSync(path.join(DIR, 'cells.bin.gz')).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const saved = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'cells.bin.gz')));
  console.log(`compared with the set saved ${index.saved} (density ${index.density})\n`);
  console.log('| frame | cells changed | visibly changed (glyph, or a colour step over 6 levels) |');
  console.log('|---|---|---|');
  let worst = 0; let compared = 0, same = 0;
  for (const f of frames) {
    const e = index.frames.find((x) => x.name === f.name);
    if (!e || e.cols !== f.cols || e.rows !== f.rows) { console.log(`| ${f.name} | not comparable (no saved frame of this size) | |`); process.exitCode = 1; continue; }
    const old = saved.subarray(e.offset, e.offset + e.length);
    let ch = 0, vis = 0;
    for (let k = 0; k < f.data.length; k += 8) {
      let diff = false, far = f.data[k + 3] !== old[k + 3];
      for (let c = 0; c < 8; c++) if (f.data[k + c] !== old[k + c]) diff = true;
      for (const c of [0, 1, 2, 4, 5, 6]) if (Math.abs(f.data[k + c] - old[k + c]) > 6) far = true;
      if (diff) ch++;
      if (diff && far) vis++;
    }
    const n = f.data.length / 8;
    worst = Math.max(worst, ch / n);
    compared++; if (!ch) same++;
    console.log(`| ${f.name} | ${(100 * ch / n).toFixed(2)}%${ch ? ` (${ch} cells)` : ''} | ${(100 * vis / n).toFixed(2)}%${vis ? ` (${vis} cells)` : ''} |`);
  }
  console.log(`\nlargest change: ${(100 * worst).toFixed(2)}% of a frame's cells; ${same} of ${compared} comparable frames identical cell for cell`);
}
