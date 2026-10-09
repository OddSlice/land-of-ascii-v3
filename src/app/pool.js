// The render workers. The picture is split into vertical stripes of columns,
// one per worker; each worker renders only its own columns and never reads
// another's. A worker error stops rendering and is shown on screen.

/* global __WORKER_SOURCE__ */
function workerURL() {
  // The built single-file page carries the worker's bundled source inline.
  if (typeof __WORKER_SOURCE__ !== 'undefined') {
    return URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' }));
  }
  return new URL('../worker.js', import.meta.url);
}

export class Pool {
  constructor(count, onError) {
    this.count = count;
    this.onError = onError;
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
      w.postMessage({ type: 'init', id: i });
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
    if (d.type === 'ready') {
      if (++this.ready === this.count) this.readyResolve();
    } else if (d.type === 'done') {
      if (!this.inflight || d.seq !== this.inflight.seq) return;
      this.inflight.parts[i] = d;
      if (--this.pending === 0) {
        this.results = this.inflight;
        this.inflight = null;
      }
    } else if (d.type === 'error') {
      this.fail(`render worker ${i}: ${d.message}\n${d.stack}`);
    }
  }

  get busy() { return !!this.inflight; }

  stripes(cols) {
    const out = [];
    for (let i = 0; i < this.count; i++) out.push([Math.floor(i * cols / this.count), Math.floor((i + 1) * cols / this.count)]);
    return out;
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
