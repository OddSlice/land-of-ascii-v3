// A render worker (a module worker). It builds the world itself from the
// constant seed, then renders the stripes it is asked for. Any error is sent
// back so the page can show it; nothing falls back silently.
import { buildWorld } from './world/world.js';
import { createStripeRenderer } from './render-stripe.js';

let renderer = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      const world = buildWorld();
      renderer = createStripeRenderer(world);
      self.postMessage({ type: 'ready', id: msg.id, buildMs: world.buildMs });
    } else if (msg.type === 'frame') {
      const { frame, c0, c1 } = msg;
      const r = renderer.render(frame, c0, c1);
      self.postMessage({ type: 'done', id: msg.id, seq: frame.seq, c0, c1, cells: r.cells, march: r.march, resolve: r.resolve }, [r.cells.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err), stack: String(err && err.stack || '') });
  }
};
