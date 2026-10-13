// What you have seen of the land (phase 5a), for the overhead map. Tracked
// on the coarse 16 m squares the renderer already marches over (each with
// its tallest ground or water, as the march's look-ahead keeps them; worked
// out here once from the terrain's 4 m level), never per cell:
// - each frame a few rays across your view walk those squares outward from
//   the eye, 8 m a step, to 480 m; a square counts as seen when its top
//   rises above everything nearer on the ray;
// - the squares round your feet (24 m) count as seen, and the 8 m squares
//   you walk on are kept too, so the map draws the roads you have walked;
// - standing on a viewpoint shows a wide circle round it (700 m).
// It costs a few hundred steps a frame on the main thread.
import { setBit, gridSize } from './progress.js';

export const SEEN_TILE = 16, WALK_TILE = 8, SEE_FAR = 480, NEAR = 24, VIEW_REVEAL = 700;
const RAYS = 8, SLOTS = 40;

export class Discovery {
  constructor(world) {
    const T = world.terrain, N = world.N;
    this.N = N;
    this.sn = gridSize(N, SEEN_TILE); this.wn = gridSize(N, WALK_TILE);
    // the tallest surface in each 16 m square (from the 4 m level)
    const L = T.levels[2], n = L.n, step = L.size, H = L.H, NN = n + 1;
    const mx = new Float32Array(this.sn * this.sn).fill(-1e9);
    for (let k = 0; k <= n; k++) for (let i = 0; i <= n; i++) {
      const g = Math.min(this.sn - 1, Math.floor(k * step / SEEN_TILE)) * this.sn + Math.min(this.sn - 1, Math.floor(i * step / SEEN_TILE));
      const h = H[k * NN + i];
      if (h > mx[g]) mx[g] = h;
    }
    this.mx = mx;
    this.slot = 0;
    this.lastWalk = -1;
  }

  // One frame: rays across the view (yaw, horizontal field of view in
  // radians) from the eye; the squares round the feet; the walked square.
  // Returns how many squares were newly seen or walked.
  step(p, x, z, eye, yaw, hfov) {
    const { sn, mx, N } = this, seen = p.seen;
    let added = 0;
    for (let r = 0; r < RAYS; r++) {
      const s = (this.slot + r * (SLOTS / RAYS)) % SLOTS;
      const a = yaw + (s / (SLOTS - 1) - 0.5) * hfov * 1.1, dx = Math.sin(a), dz = Math.cos(a);
      let top = -Infinity;
      for (let d = 12; d <= SEE_FAR; d += 8) {
        const px = x + dx * d, pz = z + dz * d;
        if (px < 0 || pz < 0 || px > N || pz > N) break;
        const g = Math.floor(pz / SEEN_TILE) * sn + Math.floor(px / SEEN_TILE);
        const sl = (mx[g] - eye) / d;
        if (sl >= top - 1e-4 && setBit(seen, g)) added++;
        if (sl > top) top = sl;
      }
    }
    this.slot = (this.slot + 1) % SLOTS;
    // the walked square, and the squares round the feet
    const wi = Math.floor(z / WALK_TILE) * this.wn + Math.floor(x / WALK_TILE);
    if (wi !== this.lastWalk && x >= 0 && z >= 0 && x <= N && z <= N) {
      this.lastWalk = wi;
      if (setBit(p.walked, wi)) added++;
      added += this.circle(p, x, z, NEAR);
    }
    return added;
  }

  // Every square within r of (x, z), seen.
  circle(p, x, z, r) {
    const { sn } = this;
    let added = 0;
    for (let gz = Math.max(0, Math.floor((z - r) / SEEN_TILE)); gz <= Math.min(sn - 1, Math.floor((z + r) / SEEN_TILE)); gz++) {
      for (let gx = Math.max(0, Math.floor((x - r) / SEEN_TILE)); gx <= Math.min(sn - 1, Math.floor((x + r) / SEEN_TILE)); gx++) {
        const cx = Math.max(gx * SEEN_TILE, Math.min(x, (gx + 1) * SEEN_TILE)), cz = Math.max(gz * SEEN_TILE, Math.min(z, (gz + 1) * SEEN_TILE));
        if (Math.hypot(cx - x, cz - z) <= r && setBit(p.seen, gz * sn + gx)) added++;
      }
    }
    return added;
  }
}
