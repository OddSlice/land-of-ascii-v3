// Cuts the study thumbnails out of the reference contact sheets into
// reference/thumbs/ (private, gitignored like the rest of reference/).
// Usage: node tools/refs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launch, workbench, dataURL, writeDataURL } from './lib/browser.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const REF = path.join(ROOT, 'reference');
const sheets = fs.readdirSync(REF).filter((f) => /^0[1-6].*\.jpg$/.test(f)).sort();

const browser = await launch('chromium');
const page = await workbench(browser);
const index = [];
for (const sheet of sheets) {
  const boxes = await page.evaluate(async (src) => {
    const im = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const g = c.getContext('2d');
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const lum = (x, y) => { const i = (y * W + x) * 4; return d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; };
    // Background is a flat dark grey; a column belongs to a thumbnail when
    // enough of its middle rows differ from that grey.
    const bg = lum(2, Math.floor(H / 2));
    const y0 = Math.floor(H * 0.2), y1 = Math.floor(H * 0.8);
    const isImg = (x) => { let n = 0; for (let y = y0; y < y1; y++) if (Math.abs(lum(x, y) - bg) > 6) n++; return n > (y1 - y0) * 0.5; };
    const cols = [];
    let start = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && isImg(x);
      if (on && start < 0) start = x;
      if (!on && start >= 0) { if (x - start > 60) cols.push([start, x]); start = -1; }
    }
    // Vertical extent: rows where the thumbnail's middle column differs from the background.
    return cols.map(([a, b]) => {
      const mid = [a + 5, (a + b) >> 1, b - 5];
      const rowOn = (y) => mid.some((x) => Math.abs(lum(x, y) - bg) > 6);
      let top = 0; while (top < H && !rowOn(top)) top++;
      // skip the title line: the first long run of image rows
      let t = top, best = [0, 0];
      while (t < H) {
        while (t < H && !rowOn(t)) t++;
        let s = t; while (t < H && rowOn(t)) t++;
        if (t - s > best[1] - best[0]) best = [s, t];
      }
      return { x: a, y: best[0], w: b - a, h: best[1] - best[0] };
    });
  }, dataURL(path.join(REF, sheet)));
  // Dark frames fool the row test; every thumbnail on a sheet shares one height.
  const med = (k) => boxes.map((b) => b[k]).sort((a, b) => a - b)[boxes.length >> 1];
  const my = med('y'), mh = med('h');
  for (let i = 0; i < boxes.length; i++) {
    const b = { ...boxes[i], y: my, h: mh };
    const url = await page.evaluate(async ({ src, b }) => {
      const im = await loadImage(src);
      const c = document.createElement('canvas');
      c.width = b.w; c.height = b.h;
      c.getContext('2d').drawImage(im, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      return c.toDataURL('image/png');
    }, { src: dataURL(path.join(REF, sheet)), b });
    const name = `${sheet.slice(0, 2)}-${i + 1}.png`;
    writeDataURL(path.join(REF, 'thumbs', name), url);
    index.push({ sheet, i: i + 1, ...b, file: `thumbs/${name}` });
  }
}
fs.writeFileSync(path.join(REF, 'thumbs', 'index.json'), JSON.stringify(index, null, 1));
console.log(index.map((b) => `${b.file} ${b.w}x${b.h} @${b.x},${b.y}`).join('\n'));
await browser.close();
