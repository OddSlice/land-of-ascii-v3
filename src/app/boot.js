// Starting a scene (src/main.js): the generated world built once, in its
// own worker (or on the page with ?threads=0), then handed to the render
// workers, with shared memory where the page has it (one copy for every
// worker, and cast shadows from one shadow worker into two shared stores);
// or the Look Lab, the stress scene or the building yard, whose workers
// build their own copy of the scene and so start first. A progress line
// says how far it has got.
import { buildWorld } from '../world/world.js';
import { buildStressWorld } from '../world/stress.js';
import { buildYard } from '../world/yard.js';
import { generateWorld } from '../world/gen/world.js';
import { packWorld, unpackWorld } from '../world/pack.js';
import { shadowStore } from '../scene/cpu/light.js';
import { buildInWorker, SharedShadows } from './worldboot.js';
import { Pool } from './pool.js';

// `o`: { WORLD, STRESS, YARD, THREADS, SHARED, SEED, GEN, fail }.
// Resolves with { world, pool, packed, shadows, shadowStores, buildMs,
// worldProgress } (the last for the page's own later stages).
export async function startScene(o) {
  const { WORLD, STRESS, YARD, THREADS, SHARED, SEED, GEN, fail } = o;
  const $ = (id) => document.getElementById(id);
  // The lab and the stress scene: workers build their own copy of the world,
  // so they start first. In the stress scene the page builds one too, in steps
  // with a progress line (only what walking needs, unless it also renders with
  // ?threads=0). The generated world is built once, in its own worker (or on
  // the page with ?threads=0), then handed to the render workers.
  let pool = null, packed = null, shadows = null, shadowStores = null, buildMs = 0;
  const progress = { page: 0, workers: THREADS ? 0 : 1 };
  function showProgress() {
    const p = Math.min(progress.page, progress.workers);
    $('progress').style.display = 'block';
    $('progress').textContent = `building the stress scene … ${Math.floor(p * 100)}%`;
  }
  function worldProgress(stage, p) {
    $('progress').style.display = 'block';
    $('progress').textContent = `building the world (seed ${SEED}) · ${stage} … ${Math.floor(p * 100)}%`;
  }
  if (THREADS > 0 && !WORLD) {
    pool = new Pool(THREADS, fail, {
      scene: STRESS ? 'stress' : YARD ? 'yard' : 'default',
      init: YARD ? { gen: GEN } : {},
      onProgress: (p) => { progress.workers = p; showProgress(); },
    });
    if (STRESS) pool.whenReady.then(() => { progress.workers = 1; });
  }
  const nextTask = () => new Promise((resolve) => { const ch = new MessageChannel(); ch.port1.onmessage = resolve; ch.port2.postMessage(0); });
  async function makeWorld() {
    if (WORLD) {
      const t0 = performance.now();
      if (THREADS === 0) {
        // all on the page, in steps, so the progress line still paints
        const gen = generateWorld(SEED, GEN);
        let r;
        while (!(r = gen.next()).done) { worldProgress(r.value.stage, r.value.p); await nextTask(); }
        packed = packWorld(r.value, null);
      } else {
        packed = await buildInWorker(SEED, SHARED, worldProgress, GEN);
      }
      buildMs = performance.now() - t0;
      const w = unpackWorld(packed);
      worldProgress('starting the workers', 0.96);
      if (THREADS > 0) {
        // with shared memory every worker reads the one world, and cast
        // shadows come from one shadow worker into two shared stores; without
        // it each worker gets its own copy and sweeps its own shadows
        const stores = SHARED ? { V: [], S: [] } : null;
        if (SHARED) for (let b = 0; b < 2; b++) { const st = shadowStore(w, SharedArrayBuffer); stores.V.push(st.V); stores.S.push(st.S); }
        shadowStores = stores;
        pool = new Pool(THREADS, fail, { scene: 'world', init: { world: packed, shared: SHARED, shadows: stores } });
        if (SHARED) shadows = new SharedShadows(w, packed, stores, pool, fail);
      }
      return w;
    }
    if (YARD) return buildYard(GEN);
    if (!STRESS) return buildWorld();
    const gen = buildStressWorld({ render: THREADS === 0 });
    let r;
    while (!(r = gen.next()).done) { progress.page = r.value; showProgress(); await nextTask(); }
    progress.page = 1;
    return r.value;
  }
  const world = await makeWorld();
  return { world, pool, packed, shadows, shadowStores, buildMs, worldProgress };
}
