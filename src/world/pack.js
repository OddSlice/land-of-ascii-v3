// The generated world as plain arrays and a little JSON, so it can be built
// once (in the builder worker, or on the page with ?threads=0) and handed to
// every thread that draws or walks in it. With shared memory the arrays live
// in SharedArrayBuffers that every render worker reads; without it each
// worker gets its own copy. unpackWorld() turns the arrays back into the
// world object the renderer and the page use: views onto the same memory,
// nothing copied.
import { TIER } from './objects.js';
import { buildSpans } from './spans.js';
import { buildClouds, worldCloudList } from './sky.js';
import { LEVELS } from './terrain.js';

const TREE_F = 15;        // numbers per tree in the tree table
const BUSH_F = 6;

// `Shared`: SharedArrayBuffer to put the arrays in shared memory, or null to
// hand over the world's own arrays (they are then transferred, not copied).
export function packWorld(world, Shared = null) {
  const T = world.terrain;
  const arrays = {};
  const put = (name, a) => {
    if (!Shared) { arrays[name] = a; return; }
    const b = new a.constructor(new Shared(a.byteLength));
    b.set(a);
    arrays[name] = b;
  };
  put('ground', T.ground);
  for (let L = 0; L < LEVELS; L++) put(`level${L}`, T.levels[L].H);
  for (const k of ['wWater', 'wRoad', 'wSand', 'wRock', 'wSnow', 'wFloor', 'tone', 'fine', 'code']) put(k, T[k]);
  for (const k of ['wWater', 'wRoad', 'wSand']) for (let L = 1; L < LEVELS; L++) put(`${k}${L}`, T[`${k}L`][L]);
  // trees: a table of numbers, and their tiers (both treatments) in one pool
  const trees = world.objects.trees;
  const tab = new Float64Array(trees.length * TREE_F);
  let pool = 0;
  for (const t of trees) pool += t.tiers.length;
  const tiers = new Float32Array(pool * 2);
  let at = 0;
  trees.forEach((t, q) => {
    tab.set([t.x, t.z, t.base, t.top, t.R, t.trunkTop, t.trunkR, t.tierH, t.leanX, t.leanZ, t.tone, t.bark, t.seed, at, t.tiers.length], q * TREE_F);
    tiers.set(t.tiers, at); tiers.set(t.tiersB, pool + at);
    at += t.tiers.length;
  });
  put('trees', tab); put('tiers', tiers);
  const bushes = world.objects.bushes, btab = new Float64Array(bushes.length * BUSH_F);
  bushes.forEach((b, q) => btab.set([b.x, b.z, b.base, b.rx, b.ry, b.seed], q * BUSH_F));
  put('bushes', btab);
  const sp = world.spans;
  const meta = {
    kind: 'world', seed: world.seed, N: world.N, NN: world.NN, viewDist: world.viewDist, sea: world.sea, center: world.center,
    toneK: T.toneK, maxH: T.maxH, pool,
    wall: { x0: sp.box.x0, x1: sp.box.x1, z0: sp.box.z0, z1: sp.box.z1, base: sp.y0[0], top: sp.y1[0] },
    gate: { ...sp.gate },
    sites: world.sites, cameras: world.cameras, start: world.start,
    roads: world.roads.map((r) => ({ id: r.id, to: r.to, n: r.n, x: Array.from(r.x), z: Array.from(r.z), y: Array.from(r.y) })),
    rivers: world.rivers.map((r) => ({ n: r.n, x: Array.from(r.x), z: Array.from(r.z), level: Array.from(r.level), hw: Array.from(r.hw), lake: Array.from(r.lake) })),
    lakes: world.lakes.map((l) => ({ level: l.level, area: l.area, x: l.x, z: l.z })),
    buildMs: world.buildMs, times: world.times,
  };
  return { meta, arrays };
}

// The buffers to transfer when handing over a packed world without shared memory.
export function transferList(packed) {
  return Object.values(packed.arrays).map((a) => a.buffer).filter((b) => !(typeof SharedArrayBuffer !== 'undefined' && b instanceof SharedArrayBuffer));
}

// Are the packed world's arrays in shared memory?
export function isShared(packed) {
  return typeof SharedArrayBuffer !== 'undefined' && Object.values(packed.arrays).every((a) => a.buffer instanceof SharedArrayBuffer);
}

export function unpackWorld(packed) {
  const { meta: m, arrays: a } = packed;
  const N = m.N, NN = m.NN;
  const levels = [];
  for (let L = 0, n = N; L < LEVELS; L++, n >>= 1) levels.push({ n, size: 1 << L, H: a[`level${L}`], nx: null, nz: null });
  const terrain = {
    N, NN, ground: a.ground, levels, wWater: a.wWater, wRoad: a.wRoad, wSand: a.wSand, wRock: a.wRock, wSnow: a.wSnow,
    wFloor: a.wFloor, tone: a.tone, fine: a.fine, code: a.code, toneK: m.toneK, maxH: m.maxH,
  };
  for (const k of ['wWater', 'wRoad', 'wSand']) { terrain[`${k}L`] = [null]; for (let L = 1; L < LEVELS; L++) terrain[`${k}L`].push(a[`${k}${L}`]); }
  const trees = [], tab = a.trees, tiers = a.tiers;
  for (let q = 0; q < tab.length / TREE_F; q++) {
    const o = q * TREE_F, at = tab[o + 13], n = tab[o + 14];
    trees.push({
      x: tab[o], z: tab[o + 1], base: tab[o + 2], top: tab[o + 3], R: tab[o + 4], trunkTop: tab[o + 5], trunkR: tab[o + 6], tierH: tab[o + 7],
      leanX: tab[o + 8], leanZ: tab[o + 9], tone: tab[o + 10], bark: tab[o + 11], seed: tab[o + 12],
      tiers: tiers.subarray(at, at + n), tiersB: tiers.subarray(m.pool + at, m.pool + at + n),
    });
  }
  const bushes = [], bt = a.bushes;
  for (let q = 0; q < bt.length / BUSH_F; q++) {
    const o = q * BUSH_F;
    bushes.push({ x: bt[o], z: bt[o + 1], base: bt[o + 2], rx: bt[o + 3], ry: bt[o + 4], seed: bt[o + 5] });
  }
  const spans = buildSpans(N, { ...m.wall, merlon: 1.5, merlonW: 2, merlonGap: 2 }, m.gate);
  const f32 = (r, keys) => { const o = { ...r }; for (const k of keys) o[k] = Float32Array.from(r[k]); return o; };
  return {
    kind: 'world', seed: m.seed, N, NN, center: m.center, viewDist: m.viewDist, openEdge: true, sea: m.sea,
    terrain, spans, objects: { trees, bushes, torches: [], water: m.sea },
    clouds: buildClouds(0, worldCloudList(m.seed, N)),
    sites: m.sites, cameras: m.cameras, start: m.start,
    roads: m.roads.map((r) => f32(r, ['x', 'z', 'y'])),
    rivers: m.rivers.map((r) => f32(r, ['x', 'z', 'level', 'hw', 'lake'])),
    lakes: m.lakes, buildMs: m.buildMs, times: m.times,
  };
}

// FNV-1a over every array of a packed world (and its JSON), to check that
// two builds of a seed are the same to the byte.
export function worldHash(packed) {
  let h = 0x811c9dc5;
  const eat = (u8) => { for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 0x01000193); } };
  for (const k of Object.keys(packed.arrays).sort()) { const v = packed.arrays[k]; eat(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)); }
  const { buildMs, times, packMs, ...meta } = packed.meta;
  eat(new TextEncoder().encode(JSON.stringify(meta)));
  return (h >>> 0).toString(16).padStart(8, '0');
}
