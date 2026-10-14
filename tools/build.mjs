// npm run build: bundles src/ into one self-contained play.html at the
// repository root (the game ships as one file; phase 6: index.html is the
// front page, written by hand, see tools/front.mjs). The render worker is bundled
// separately and carried inline as source, started from a blob URL as a
// module worker. The private reference/ images are never included.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const common = { bundle: true, format: 'esm', target: 'es2022', minify: true, write: false, legalComments: 'none' };

const worker = await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src/worker.js')] });
const workerCode = worker.outputFiles[0].text;
// (the version, from package.json, and the day of the build, shown in the
// menu's corner)
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const built = new Date().toISOString().slice(0, 10);
const main = await esbuild.build({
  ...common,
  entryPoints: [path.join(ROOT, 'src/main.js')],
  define: { __WORKER_SOURCE__: JSON.stringify(workerCode), __VERSION__: JSON.stringify(version), __BUILT__: JSON.stringify(built) },
});
const mainCode = main.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const tpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const tag = '<script type="module" src="/src/main.js"></script>';
if (!tpl.includes(tag)) throw new Error('script tag not found in src/index.html');
const html = tpl.replace(tag, () => `<script type="module">\n${mainCode}</script>`);
fs.writeFileSync(path.join(ROOT, 'play.html'), html);
console.log(`play.html ${version} (${built}): ${(html.length / 1024).toFixed(1)} KB (worker ${(workerCode.length / 1024).toFixed(1)} KB)`);

// (phase 6) the front page: src/front/index.html, its script bundled in,
// the pictures' data (tools/front.mjs) and the version written in. Small:
// it never loads the game.
{
  const front = await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src/front/front.js')] });
  const code = front.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const data = fs.readFileSync(path.join(ROOT, 'src/front/data.json'), 'utf8');
  let page = fs.readFileSync(path.join(ROOT, 'src/front/index.html'), 'utf8');
  const ftag = '<script type="module" src="/src/front/front.js"></script>';
  if (!page.includes(ftag) || !page.includes('<!--DATA-->')) throw new Error('front page template has lost its script tag or its data mark');
  page = page.replace(ftag, () => `<script type="module">\n${code}</script>`)
    .replace('<!--DATA-->', () => `<script id="data" type="application/json">${data}</script>`)
    .replace('__VERSION__', version);
  fs.writeFileSync(path.join(ROOT, 'index.html'), page);
  console.log(`index.html (the front page): ${(page.length / 1024).toFixed(1)} KB`);
}
