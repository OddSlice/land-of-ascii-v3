// One stripe of a frame, start to finish: the scene backend fills a
// HitBuffer, resolve turns it into a CellBuffer. Workers run this; so does the
// main thread with ?threads=0, so both give the same bytes.
import { createCpuBackend } from './scene/cpu/backend.js';
import { makePalette, resolveStripe } from './resolve.js';
import { weatherParams, mistFloorOf } from './weather.js';
import { HIT_STRIDE, CELL_STRIDE } from './contract.js';

export function createStripeRenderer(world, opts) {
  const backend = createCpuBackend(world, opts);
  let hits = new Uint8Array(0);
  const env = { mist: null };
  return {
    backend: backend.name,
    render(frame, c0, c1) {
      const sw = c1 - c0, n = sw * frame.rows;
      if (hits.length < n * HIT_STRIDE) hits = new Uint8Array(n * HIT_STRIDE);
      const t0 = performance.now();
      backend.render(frame, c0, c1, hits);
      const t1 = performance.now();
      const cells = new Uint8Array(n * CELL_STRIDE);
      // (the mist's floor is built the first time there is mist)
      if (!env.mist && world.terrain && weatherParams(frame.weather).mist > 0) env.mist = mistFloorOf(world);
      resolveStripe(makePalette(frame.hour, frame.day || 0, frame.weather), hits, cells, sw, frame.rows, c0, frame, env);
      const t2 = performance.now();
      return { cells, march: t1 - t0, resolve: t2 - t1, settled: backend.settled, sweepMs: backend.sweepMs };
    },
  };
}
