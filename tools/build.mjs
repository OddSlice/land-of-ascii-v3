// npm run build: bundles src/ into one self-contained index.html at the
// repository root (the game ships as one file). The render worker is bundled
// separately and carried inline as source, started from a blob URL as a
// module worker. The private reference/ images are never included.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const common = { bundle: true, format: 'esm', target: 'es2022', minify: true, write: false, legalComments: 'none' };

const worker = await esbuild.build({ ...common, entryPoints: [path.join(ROOT, 'src/worker.js')] });
const workerCode = worker.outputFiles[0].text;
const main = await esbuild.build({
  ...common,
  entryPoints: [path.join(ROOT, 'src/main.js')],
  define: { __WORKER_SOURCE__: JSON.stringify(workerCode) },
});
const mainCode = main.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const tpl = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8');
const tag = '<script type="module" src="/src/main.js"></script>';
if (!tpl.includes(tag)) throw new Error('script tag not found in src/index.html');
const html = tpl.replace(tag, () => `<script type="module">\n${mainCode}</script>`);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(`index.html: ${(html.length / 1024).toFixed(1)} KB (worker ${(workerCode.length / 1024).toFixed(1)} KB)`);
