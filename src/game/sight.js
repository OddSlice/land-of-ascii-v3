// What stands in the way of sight (phase 5b), for finding places and for
// what the map counts as seen: on a 2 m grid, the crowns of the trees (from
// where the crown starts to its top, narrowing to the tip) and the tops of
// the buildings and walls (from the ground up). The ground itself is tested
// apart, from the terrain. Worked out once a world, from the world's own
// records, and kept with it; nothing here changes the world.
import { raiseOccluders } from '../world/kit.js';

export const SIGHT_STEP = 2;        // metres between the grid's nodes
const NONE = -32768;                // (heights in decimetres)
const LOW_SHAPE = 1.6;              // shapes lower than this over the ground (stones, logs) hide nothing

const cache = new WeakMap();

// { step, n (nodes a side), top, low: Int16Array (decimetres) }: at a node,
// sight is blocked between low and top.
export function sightGrid(world) {
  let g = cache.get(world);
  if (g) return g;
  const step = SIGHT_STEP, n = Math.floor(world.N / step) + 1;
  const top = new Int16Array(n * n).fill(NONE), low = new Int16Array(n * n).fill(NONE);
  // the buildings and walls: solid from the ground to their top
  const kit = world.kit;
  if (kit && kit.np) {
    const occ = new Float32Array(n * n).fill(-Infinity);
    raiseOccluders(kit, occ, n - 1, n, step);
    const T = world.terrain, NN = T.NN, G = T.ground;
    for (let gz = 0; gz < n; gz++) for (let gx = 0; gx < n; gx++) {
      const j = gz * n + gx, y = occ[j];
      if (y === -Infinity) continue;
      const gy = G[Math.min(world.N, gz * step) * NN + Math.min(world.N, gx * step)];
      if (y - gy < LOW_SHAPE) continue;
      top[j] = Math.round(y * 10); low[j] = -32767;
    }
  }
  // the trees: the crown, a cone from where it starts to the tip
  for (const t of world.objects.trees) {
    const R = t.R, c0 = t.trunkTop, h = t.top;
    for (let gz = Math.max(0, Math.ceil((t.z - R) / step)); gz <= Math.min(n - 1, Math.floor((t.z + R) / step)); gz++) {
      for (let gx = Math.max(0, Math.ceil((t.x - R) / step)); gx <= Math.min(n - 1, Math.floor((t.x + R) / step)); gx++) {
        const d = Math.hypot(gx * step - t.x, gz * step - t.z);
        if (d >= R) continue;
        const j = gz * n + gx, hi = Math.round((h - (h - c0) * d / R) * 10), lo = Math.round(c0 * 10);
        if (hi > top[j]) top[j] = hi;
        if (low[j] === NONE || lo < low[j]) low[j] = lo;
      }
    }
  }
  g = { step, n, top, low };
  cache.set(world, g);
  return g;
}

// Is sight blocked at (x, y, z) by a crown or a building?
export function blockedAt(g, x, y, z) {
  const gx = Math.round(x / g.step), gz = Math.round(z / g.step);
  if (gx < 0 || gz < 0 || gx >= g.n || gz >= g.n) return false;
  const j = gz * g.n + gx, t = g.top[j];
  if (t === NONE) return false;
  const yd = y * 10;
  return yd <= t && yd >= g.low[j];
}

// The tallest thing at a node, for the map's coarse squares (-Infinity if none).
export function topOf(g, gx, gz) {
  const t = g.top[gz * g.n + gx];
  return t === NONE ? -Infinity : t / 10;
}
