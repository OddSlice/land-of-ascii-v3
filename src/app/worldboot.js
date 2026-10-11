// Starting the generated world: building it in its own worker (the page
// stays responsive and shows each stage), and, with shared memory, the one
// worker that sweeps cast shadows for every render worker, with the page
// choosing which of its two stores each frame reads.
import { workerURL } from './pool.js';
import { lightKey } from '../scene/cpu/light.js';

// Build the world for `seed` in a worker. Resolves with the packed world
// (in shared memory if `shared`); `onProgress(stage, p)` as it goes.
export function buildInWorker(seed, shared, onProgress) {
  return new Promise((resolve, reject) => {
    const w = new Worker(workerURL(), { type: 'module', name: 'builder' });
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') onProgress(d.stage, d.p);
      else if (d.type === 'built') { w.terminate(); resolve(d.world); }
      else if (d.type === 'error') { w.terminate(); reject(new Error(`builder worker: ${d.message}\n${d.stack}`)); }
    };
    w.onerror = (e) => { e.preventDefault(); w.terminate(); reject(new Error(`builder worker: ${e.message || 'failed to load or crashed'}`)); };
    w.postMessage({ type: 'build', seed, shared });
  });
}

// Cast shadows in shared memory: two stores; while frames read one, the
// shadow worker sweeps the light's newest step into the other, which frames
// then read from. A store is only swept again once no frame in flight reads it.
export class SharedShadows {
  constructor(world, packed, stores, pool, onError) {
    this.N = world.N;
    this.stores = stores;
    this.pool = pool;
    this.front = -1; this.frontKey = null;     // the store frames read, and its light step
    this.pending = null;                       // the sweep under way
    this.sweepMs = 0;
    this.w = new Worker(workerURL(), { type: 'module', name: 'shadows' });
    this.ready = new Promise((res) => { this.readyResolve = res; });
    this.first = new Promise((res) => { this.firstResolve = res; });
    this.w.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'shadowReady') this.readyResolve();
      else if (d.type === 'swept') {
        this.front = d.buf; this.frontKey = d.key; this.pending = null;
        this.sweepMs = d.ms;
        this.firstResolve();
      } else if (d.type === 'error') onError(`shadow worker: ${d.message}\n${d.stack}`);
    };
    this.w.onerror = (e) => { e.preventDefault(); onError(`shadow worker: ${e.message || 'failed to load or crashed'}`); };
    try {
      this.w.postMessage({ type: 'shadowInit', world: packed, shadows: stores });
    } catch (err) {
      onError(`shadow worker: the world could not be shared: ${err && err.message || err}`);
    }
  }

  // Each refresh: start a sweep if the light has moved on and a store is free.
  update(hour, day, night) {
    const k = lightKey(hour, this.N, day, night);
    this.key = k.key;
    if (this.pending || k.key === this.frontKey) return;
    const back = this.front === 0 ? 1 : 0;
    if (this.pool && this.pool.flying.some((f) => f.frame.shadow && f.frame.shadow.buf === back)) return;
    this.pending = { key: k.key, buf: back };
    this.w.postMessage({ type: 'sweep', key: k.key, keyHour: k.keyHour, isSun: k.isSun, day: k.day, night: k.night, buf: back });
  }

  // What a frame reads: the store, and whether it is up to date.
  get frame() { return { buf: this.front, settled: this.frontKey === this.key && !this.pending }; }
}
