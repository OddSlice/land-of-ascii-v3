// Scene backend A: the CPU column march. It fills a HitBuffer (src/contract.js)
// for a stripe of columns. The same code runs in each worker and, with
// ?threads=0, on the main thread.
import { makeView, StripeRays } from './view.js';
import { Light, torchPower } from './light.js';
import { Marcher } from './march.js';
import { ObjectPass } from './objects.js';
import { SkyPass } from './sky.js';
import { HIT_STRIDE, REC, MAT_NONE } from '../../contract.js';
import { ruleOf } from '../../look.js';
import { backdropOf } from '../../world/backdrop.js';

export function createCpuBackend(world, opts = {}) {
  // the generated world's backdrop: built once, the same in every thread
  if (world.openEdge) backdropOf(world);
  const light = new Light(world, opts);
  const rays = new StripeRays();
  const marcher = new Marcher(world, light);
  const objects = new ObjectPass(world, light);
  const sky = new SkyPass(world, light);

  return {
    name: 'cpu-march',
    // false while cast shadows are still catching up with the light
    get settled() { return !light.pending; },
    // the time one whole shadow sweep took (the first, done at once)
    get sweepMs() { return light.sweepMs; },
    get cull() { return objects.stats; },
    // Fill `hits` (HIT_STRIDE bytes per cell, row-major over columns c0..c1-1)
    // for one frame.
    render(frame, c0, c1, hits) {
      const v = makeView(frame);
      light.update(frame.hour, frame.t, frame.shadow, frame.day || 0, ruleOf(frame.look, 'night'));
      rays.build(v, c0, c1);
      if (hits.length < rays.cells * HIT_STRIDE) throw new Error('hit buffer too small');
      // nothing met yet (so a record says only what this frame found), and no
      // reflected or refracted hit until a water cell fills them
      for (let i = 0, o = 0; i < rays.cells; i++, o += HIT_STRIDE) { hits[o] = MAT_NONE; hits[o + REC] = MAT_NONE; hits[o + 2 * REC] = MAT_NONE; }
      const torches = world.objects.torches.map((T) => ({ x: T.x, y: T.flameY, z: T.z, power: torchPower(frame.t + T.phase) }));
      marcher.run(v, rays, hits, frame, torches);
      objects.run(v, rays, marcher, frame, torches);
      sky.prepare(frame);
      sky.run(v, rays, marcher, frame);
    },
  };
}
