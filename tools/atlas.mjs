// Writes the glyph atlas at a few cell sizes, enlarged, and reports whether
// the font's shade blocks were usable or drawn by hand.
//   node tools/atlas.mjs [--browser chromium|firefox|webkit]
import path from 'node:path';
import { launch, workbench, writeDataURL } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
try {
  const lab = await openLab(browser, url, { dpr: 1 });
  const bench = await workbench(browser);
  for (const cw of [4, 5, 7, 13]) {
    const r = await lab.page.evaluate((cw) => window.lab.atlasPNG(cw), cw);
    console.log(`cell ${cw}x${cw * 2}: font ${r.fontPx.toFixed(1)}px  shades ${r.report.map((x) => `${x.glyph} ${x.font ? 'font' : 'hand-drawn'} (ink ${x.mean}, blur ${x.blurry})`).join(', ')}`);
    const big = await bench.evaluate(async ({ src, k }) => {
      const im = await loadImage(src);
      const c = document.createElement('canvas');
      c.width = im.width * k; c.height = im.height * k;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    }, { src: r.url, k: Math.max(2, Math.round(48 / cw)) });
    writeDataURL(path.join(ROOT, 'shots', `atlas-${a.browser || 'chromium'}-${cw}x${cw * 2}.png`), big);
  }
} finally {
  await browser.close();
  server.close();
}
