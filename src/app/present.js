// Showing a frame (src/main.js asks for them and decides which is shown,
// src/app/pace.js when): the stripes the workers sent, each uploaded into
// the presenter's cell texture and kept whole for the tools and sketches,
// or the frame made on the page (?threads=0), or the overhead map with its
// drawn layer; and the timings every shown frame adds to (the statistics,
// lab.timings, the benchmark).
import { CELL_STRIDE } from '../contract.js';
import { LOOK } from '../look.js';

// the page's state (src/main.js), read live
let app = null;
export function initPresent(a) { app = a; }

let lastPresent = 0;

// march and resolve are each the slowest stripe's; worker is the slowest
// stripe's march + resolve together
function presented(seq, march, resolve, drawMs, latency, settled, sweepMs, worker, yaw, trip = 0, total = worker) {
  app.light.settled = settled;
  if (sweepMs > app.light.sweepMs) app.light.sweepMs = sweepMs;
  const now = performance.now();
  const interval = lastPresent ? now - lastPresent : 0;
  lastPresent = now;
  if (interval > 0) app.timing.fps += (1000 / interval - app.timing.fps) * 0.1;
  app.timing.march += (march - app.timing.march) * 0.2;
  app.timing.resolve += (resolve - app.timing.resolve) * 0.2;
  app.timing.draw += (drawMs - app.timing.draw) * 0.2;
  app.state.presented = seq;
  // `at`: when it was shown; `yaw`: the camera it was drawn from
  for (const c of app.collectors) c.push({ interval, march, resolve, draw: drawMs, latency, worker, total, at: app.refreshAt, yaw, trip, every: app.pacer.every, lag: app.pacer.lag, dropped: app.pacer.dropped || 0, tag: app.shownTag, tick: app.pacer.tick });
  // (with the clock running the light keeps moving, so shadows are always
  // catching up a little: then a frame is enough)
  const caughtUp = settled || app.state.running;
  for (let i = app.waiters.length - 1; i >= 0; i--) {
    if (seq >= app.waiters[i].seq && caughtUp) { const w = app.waiters.splice(i, 1)[0]; requestAnimationFrame(() => requestAnimationFrame(w.resolve)); }
  }
}
export function renderLocal() {
  const f = app.makeFrame();
  const r = app.local.render(f, 0, f.cols);
  const t0 = performance.now();
  app.full = r.cells;
  app.presenter.upload(0, f.cols, r.cells);
  app.presenter.draw();
  presented(f.seq, r.march, r.resolve, performance.now() - t0, 0, r.settled, r.sweepMs, r.march + r.resolve, f.cam.yaw);
}

export function presentPool(res) {
  if (res.frame.cols !== app.grid.cols || res.frame.rows !== app.grid.rows) return;   // stale size
  const t0 = performance.now();
  let march = 0, resolve = 0, worker = 0, total = 0, settled = true, sweepMs = 0;
  const rows = app.grid.rows;
  for (const p of res.parts) {
    app.presenter.upload(p.c0, p.c1, p.cells);
    march = Math.max(march, p.march);
    resolve = Math.max(resolve, p.resolve);
    worker = Math.max(worker, p.march + p.resolve);
    total += p.march + p.resolve;
    settled = settled && p.settled;
    sweepMs = Math.max(sweepMs, p.sweepMs);
    // keep a whole copy for lab.cellHash()
    const sw = p.c1 - p.c0;
    for (let y = 0; y < rows; y++) app.full.set(p.cells.subarray(y * sw * CELL_STRIDE, (y + 1) * sw * CELL_STRIDE), (y * app.grid.cols + p.c0) * CELL_STRIDE);
  }
  app.presenter.draw();
  presented(res.seq, march, resolve, performance.now() - t0, performance.now() - res.sent, settled, sweepMs, worker, res.frame.cam.yaw, res.ready - res.sent, total);
}
// M: the overhead map, drawn in the same cells, instead of the view
export function presentMap() {
  const fog = app.way && app.way.on ? app.way.fog() : null;
  const cells = app.map.render(app.grid.cols, app.grid.rows, app.player, fog, { marks: !app.mapOver });
  app.full = cells;
  app.presenter.upload(0, app.grid.cols, cells);
  app.presenter.draw();
  if (app.mapOver) {
    const aspect = app.grid.cols / (2 * app.grid.rows), hfov = 2 * Math.atan(Math.tan(LOOK.fovY * app.DEG / 2) * aspect);
    app.mapOver.update(app.map.geometry(), app.$('view').getBoundingClientRect(), { x: app.player.x, z: app.player.z, yaw: app.player.yaw, hfov }, fog);
  }
}
