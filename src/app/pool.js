// The render workers. The picture is split into vertical stripes of columns,
// one per worker; each worker renders only its own columns and never reads
// another's. A worker error stops rendering and is shown on screen.
//
// Stripes start equal; after each frame their edges move toward an equal
// share of the work, judged from the last frame's time per column, so the
// slowest worker is not left with all the water or all the forest. Nothing
// in a cell depends on where the edges fall.

/* global __WORKER_SOURCE__ */
// The built single-file page carries the worker's bundled source inline.
const INLINE = typeof __WORKER_SOURCE__ !== 'undefined' ? __WORKER_SOURCE__ : null;

function workerURL() {
  // Opened as a local file, Chromium refuses module workers from blob URLs,
  // so there the source goes in a data URL (still a module worker).
  if (INLINE) {
    if (location.protocol === 'file:') return `data:text/javascript;charset=utf-8,${encodeURIComponent(INLINE)}`;
    return URL.createObjectURL(new Blob([INLINE], { type: 'text/javascript' }));
  }
  return new URL('../worker.js', import.meta.url);
}

export class Pool {
  constructor(count, onError, { scene = 'default', onProgress = () => {} } = {}) {
    this.count = count;
    this.onError = onError;
    this.onProgress = onProgress;
    this.buildMs = 0;
    this.workers = [];
    this.ready = 0;
    this.pending = 0;
    this.results = null;
    this.failed = false;
    const url = workerURL();
    for (let i = 0; i < count; i++) {
      const w = new Worker(url, { type: 'module', name: `render-${i}` });
      w.onmessage = (e) => this.message(i, e.data);
      w.onerror = (e) => { e.preventDefault(); this.fail(`render worker ${i}: ${e.message || 'failed to load or crashed'} ${e.filename ? `(${e.filename}:${e.lineno})` : ''}`); };
      w.onmessageerror = () => this.fail(`render worker ${i}: a message could not be read`);
      w.postMessage({ type: 'init', id: i, scene });
      this.workers.push(w);
    }
    this.whenReady = new Promise((res) => { this.readyResolve = res; });
  }

  fail(msg) {
    if (this.failed) return;
    this.failed = true;
    for (const w of this.workers) w.terminate();
    this.onError(msg);
  }

  message(i, d) {
    if (this.failed) return;
    if (d.type === 'progress') {
      this.onProgress(d.p);
    } else if (d.type === 'ready') {
      this.buildMs = Math.max(this.buildMs, d.buildMs);
      if (++this.ready === this.count) this.readyResolve();
    } else if (d.type === 'done') {
      if (!this.inflight || d.seq !== this.inflight.seq) return;
      this.inflight.parts[i] = d;
      if (--this.pending === 0) {
        this.results = this.inflight;
        this.inflight = null;
        this.balance(this.results.parts);
      }
    } else if (d.type === 'error') {
      this.fail(`render worker ${i}: ${d.message}\n${d.stack}`);
    }
  }

  get busy() { return !!this.inflight; }

  stripes(cols) {
    const n = this.count;
    if (!this.edges || this.edges[n] !== cols) {
      this.edges = new Int32Array(n + 1);
      for (let i = 0; i <= n; i++) this.edges[i] = Math.floor(i * cols / n);
    }
    const out = [];
    for (let i = 0; i < n; i++) out.push([this.edges[i], this.edges[i + 1]]);
    return out;
  }

  // Move the edges halfway toward equal shares of the last frame's work.
  balance(parts) {
    const n = this.count, e = this.edges;
    if (!e || n < 2) return;
    const cols = e[n];
    for (const p of parts) if (p.c1 > cols) return;      // a frame of another size
    const per = new Float64Array(cols);
    let total = 0;
    for (const p of parts) {
      const t = Math.max(0.05, p.march + p.resolve);
      for (let c = p.c0; c < p.c1; c++) per[c] = t / (p.c1 - p.c0);
      total += t;
    }
    const next = new Int32Array(n + 1);
    next[n] = cols;
    let acc = 0, c = 0;
    for (let i = 1; i < n; i++) {
      const goal = total * i / n;
      while (c < cols && acc + per[c] <= goal) acc += per[c++];
      next[i] = Math.round((e[i] + c) / 2);
    }
    // at least two columns each
    for (let i = 1; i < n; i++) next[i] = Math.max(next[i], next[i - 1] + 2);
    for (let i = n - 1; i >= 1; i--) next[i] = Math.min(next[i], next[i + 1] - 2);
    this.edges = next;
  }

  submit(frame) {
    const st = this.stripes(frame.cols);
    this.inflight = { seq: frame.seq, frame, parts: new Array(this.count), sent: performance.now() };
    this.pending = this.count;
    for (let i = 0; i < this.count; i++) {
      const [c0, c1] = st[i];
      this.workers[i].postMessage({ type: 'frame', id: i, frame, c0, c1 });
    }
  }

  take() {
    const r = this.results;
    this.results = null;
    return r;
  }
}
