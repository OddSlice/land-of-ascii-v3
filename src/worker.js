// The page's module workers, one script with three roles:
// - render: builds (or receives) the world, then renders the stripes it is
//   asked for;
// - build: generates a world from a seed, reporting each stage, and hands it
//   back as arrays (in shared memory when the page can share it);
// - shadow: with shared memory, sweeps cast shadows into a shared store for
//   every render worker, instead of each sweeping its own.
// Any error is sent back so the page can show it; nothing falls back silently.
import { buildWorld } from './world/world.js';
import { buildStressWorld } from './world/stress.js';
import { buildYard } from './world/yard.js';
import { generateWorld } from './world/gen/world.js';
import { packWorld, unpackWorld, transferList, isShared } from './world/pack.js';
import { Light } from './scene/cpu/light.js';
import { createStripeRenderer } from './render-stripe.js';

let renderer = null;
let shadow = null;

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      let world, opts = {};
      if (msg.scene === 'stress') {
        // the big scene is built in steps; the first worker reports progress
        const gen = buildStressWorld();
        let r;
        while (!(r = gen.next()).done) if (msg.id === 0) self.postMessage({ type: 'progress', id: msg.id, p: r.value });
        world = r.value;
      } else if (msg.scene === 'world') {
        if (msg.shared && (!isShared(msg.world) || !msg.shadows.V.every((v) => v.buffer instanceof SharedArrayBuffer))) {
          throw new Error('the world was sent as shared memory but arrived as a copy');
        }
        world = unpackWorld(msg.world);
        if (msg.shared) opts = { shared: msg.shadows };
      } else if (msg.scene === 'yard') world = buildYard();
      else world = buildWorld();
      renderer = createStripeRenderer(world, opts);
      self.postMessage({ type: 'ready', id: msg.id, buildMs: world.buildMs });
    } else if (msg.type === 'frame') {
      const { frame, c0, c1 } = msg;
      const r = renderer.render(frame, c0, c1);
      self.postMessage({ type: 'done', id: msg.id, seq: frame.seq, c0, c1, cells: r.cells, march: r.march, resolve: r.resolve,
        settled: r.settled, sweepMs: r.sweepMs }, [r.cells.buffer]);
    } else if (msg.type === 'build') {
      const gen = generateWorld(msg.seed);
      let r;
      while (!(r = gen.next()).done) self.postMessage({ type: 'progress', stage: r.value.stage, p: r.value.p });
      const t0 = performance.now();
      const packed = packWorld(r.value, msg.shared ? SharedArrayBuffer : null);
      packed.meta.packMs = performance.now() - t0;
      self.postMessage({ type: 'built', world: packed }, msg.shared ? [] : transferList(packed));
    } else if (msg.type === 'shadowInit') {
      if (!isShared(msg.world)) throw new Error('the shadow worker needs the world in shared memory');
      const world = unpackWorld(msg.world);
      // one Light per shared store, each sweeping into its own arrays, from
      // the same occluders
      const first = new Light(world, { store: { V: msg.shadows.V[0], S: msg.shadows.S[0] } });
      shadow = [first, new Light(world, { store: { V: msg.shadows.V[1], S: msg.shadows.S[1] }, occ: first.occ })];
      self.postMessage({ type: 'shadowReady' });
    } else if (msg.type === 'sweep') {
      const ms = shadow[msg.buf].sweepNow(msg.keyHour, msg.isSun, msg.day, msg.night);
      self.postMessage({ type: 'swept', key: msg.key, buf: msg.buf, ms });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, role: msg.type, message: String(err && err.message || err), stack: String(err && err.stack || '') });
  }
};
