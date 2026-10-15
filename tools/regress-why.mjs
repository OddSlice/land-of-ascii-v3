// (phase 5b) Why a regression frame changed: the same fixed camera, frozen
// clock and weather as the regression lookbook (tools/lookbook.mjs
// --regress), rendered by an old build and by this one; every cell that
// differs is marked, and the regions round them cropped and enlarged side
// by side (old, new) on one sheet per scene, so each change can be named.
// To shots/phase5b/why-<scene>.png, and a list of the changed regions.
//
//   node tools/regress-why.mjs --old DIR [--scenes world,yard] [--only 1,2,5] [--time day] [--any] [--cells]
import fs from 'node:fs';
import path from 'node:path';
import { launch, workbench } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const OLD = path.resolve(String(a.old));
const scenes = String(a.scenes || 'world').split(','), t = String(a.time || 'day');
const only = a.only ? String(a.only).split(',').map(Number) : null;
const OUT = path.join(ROOT, 'shots', 'phase5b');
const grab = async (browser, root, scene) => {
  const { server, url } = await serve(root);
  const lab = await openLab(browser, url, { built: true, scene, density: 3, threads: 8 });
  const cams = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
  const out = [];
  for (let i = 0; i < cams.length; i++) {
    if (only && !only.includes(i + 1)) continue;
    const r = await lab.page.evaluate(async ({ i, t }) => {
      const L = window.lab;
      if (L.people) L.people.set(true);
      L.setWeather('fair');
      L.camera(i); L.freeze(t, 0);
      await L.whenIdle();
      const st = L.state();
      return { cols: st.cols, rows: st.rows, data: Array.from(L.cells()) };
    }, { i, t });
    const shot = await lab.page.locator('#view').screenshot();
    out.push({ i, name: cams[i], ...r, png: `data:image/png;base64,${shot.toString('base64')}` });
  }
  await lab.ctx.close(); server.close();
  return out;
};
const browser = await launch('chromium');
try {
  for (const scene of scenes) {
    const before = await grab(browser, OLD, scene), after = await grab(browser, ROOT, scene);
    const wb = await workbench(browser);
    const lines = [];
    const tiles = [];
    for (let k = 0; k < after.length; k++) {
      const A = before[k], B = after[k], n = A.cols * A.rows;
      const changed = [];
      for (let c = 0; c < n; c++) {
        const q = c * 8;
        // (--any: every byte that differs; else what shows: a glyph, or a colour step over 6 levels)
        if (a.any ? A.data.slice(q, q + 8).some((v, k) => v !== B.data[q + k]) : A.data[q + 3] !== B.data[q + 3] || Math.max(Math.abs(A.data[q] - B.data[q]), Math.abs(A.data[q + 1] - B.data[q + 1]), Math.abs(A.data[q + 2] - B.data[q + 2])) > 6) changed.push(c);
      }
      if (!changed.length) { lines.push(`${scene} ${B.i + 1} ${B.name}: no change`); continue; }
      // the changed cells' bounding box, padded
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const c of changed) { const x = c % A.cols, y = (c / A.cols) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      lines.push(`${scene} ${B.i + 1} ${B.name}: ${changed.length} cells, columns ${x0}-${x1}, rows ${y0}-${y1} of ${A.cols} x ${A.rows}`);
      if (a.cells) for (const c of changed.slice(0, 12)) { const q = c * 8; lines.push(`   ${c % A.cols},${(c / A.cols) | 0}: ${A.data.slice(q, q + 8).join(',')} -> ${B.data.slice(q, q + 8).join(',')}`); }
      tiles.push({ label: `${scene} ${B.i + 1} ${B.name} (${changed.length})`, a: A.png, b: B.png, box: [x0, y0, x1, y1], cols: A.cols, rows: A.rows, cells: changed.slice(0, 4000) });
    }
    console.log(lines.join('\n'));
    if (!tiles.length) continue;
    // the sheet: per frame, the region round the changes, old and new, the changed cells outlined
    const png = await wb.evaluate(async (tiles) => {
      const W = 1200, rowH = 300, c = document.createElement('canvas'); c.width = W; c.height = tiles.length * (rowH + 22);
      const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height);
      const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
      for (let k = 0; k < tiles.length; k++) {
        const T = tiles[k], ia = await load(T.a), ib = await load(T.b);
        const cw = ia.width / T.cols, ch = ia.height / T.rows;
        let [x0, y0, x1, y1] = T.box; const pad = 6;
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(T.cols - 1, x1 + pad); y1 = Math.min(T.rows - 1, y1 + pad);
        const sw = (x1 - x0 + 1) * cw, sh = (y1 - y0 + 1) * ch, sc = Math.min((W / 2 - 10) / sw, rowH / sh, 6);
        const oy = k * (rowH + 22) + 20;
        g.fillStyle = '#ddd'; g.font = '13px monospace'; g.fillText(T.label, 6, oy - 5);
        for (const [im, ox] of [[ia, 0], [ib, W / 2]]) {
          g.imageSmoothingEnabled = false;
          g.drawImage(im, x0 * cw, y0 * ch, sw, sh, ox, oy, sw * sc, sh * sc);
          if (ox) { g.strokeStyle = 'rgba(255,60,60,0.9)'; g.lineWidth = 1; for (const cc of T.cells) { const x = cc % T.cols, y = (cc / T.cols) | 0; if (x < x0 || x > x1 || y < y0 || y > y1) continue; g.strokeRect(ox + (x - x0) * cw * sc, oy + (y - y0) * ch * sc, cw * sc, ch * sc); } }
        }
      }
      return c.toDataURL('image/png');
    }, tiles);
    const f = path.join(OUT, `why-${scene}.png`);
    fs.writeFileSync(f, Buffer.from(png.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT, `why-${scene}.txt`), lines.join('\n') + '\n');
    console.log(`shots/phase5b/why-${scene}.png`);
  }
} finally { await browser.close(); }
