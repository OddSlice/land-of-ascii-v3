// npm run dev: serves the repository with the modules straight from src/.
// http://localhost:5190/ is the Look Lab (src/index.html); /play.html is
// the last build.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PORT || 5190);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.md': 'text/markdown' };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/src/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    // cross-origin isolated, as on Vercel, so the workers can share memory
    // (NOISO=1 serves without it, as GitHub Pages does)
    const iso = process.env.NOISO ? {} : { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' };
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store', ...iso });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Look Lab: http://localhost:${PORT}/`));
