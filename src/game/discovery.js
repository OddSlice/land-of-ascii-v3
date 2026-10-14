// What you have seen of the land (phase 5a), for the overhead map. Tracked
// on the coarse 16 m squares the renderer already marches over (each with
// its tallest ground or water, as the march's look-ahead keeps them; worked
// out here once from the terrain's 4 m level), never per cell:
// - each frame a few rays across your view walk those squares outward from
//   the eye, 8 m a step, to 480 m; a square counts as seen when its top
//   rises above everything nearer on the ray; (phase 5b) forests and
//   villages stand in the way at their crowns' and roofs' height, and past
//   NEAR_SEE only what stands out counts: a rising slope or a hill, water,
//   buildings (so a walk along an open road does not fill the plain);
// - the squares round your feet (24 m) count as seen, and the 8 m squares
//   you walk on are kept too, so the map draws the roads you have walked;
// - standing on a viewpoint shows a wide circle round it (700 m).
// It costs a few hundred steps a frame on the main thread.
import { setBit, gridSize } from './progress.js';
import { sightGrid, topOf } from './sight.js';

export const SEEN_TILE = 16, WALK_TILE = 8, SEE_FAR = 480, NEAR = 24, VIEW_REVEAL = 700;
export const NEAR_SEE = 160, STANDS_OUT = 12, COVER = 0.35;
const RAYS = 8, SLOTS = 40;

export class Discovery {
  constructor(world) {
    const T = world.terrain, N = world.N;
    this.N = N;
    this.sn = gridSize(N, SEEN_TILE); this.wn = gridSize(N, WALK_TILE);
    // the tallest and lowest surface in each 16 m square (from the 4 m level)
    const L = T.levels[2], n = L.n, step = L.size, H = L.H, NN = n + 1, sn = this.sn;
    const mx = new Float32Array(sn * sn).fill(-1e9), mn = new Float32Array(sn * sn).fill(1e9);
    for (let k = 0; k <= n; k++) for (let i = 0; i <= n; i++) {
      const g = Math.min(sn - 1, Math.floor(k * step / SEEN_TILE)) * sn + Math.min(sn - 1, Math.floor(i * step / SEEN_TILE));
      const h = H[k * NN + i];
      if (h > mx[g]) mx[g] = h;
      if (h < mn[g]) mn[g] = h;
    }
    // (phase 5b) what stands in the way: a square mostly under crowns or
    // roofs blocks at their height (the mean of their tops)
    const sg = sightGrid(world), per = SEEN_TILE / sg.step, wet = T.wWater, TN = T.NN;
    const block = Float32Array.from(mx), out = new Uint8Array(sn * sn);
    for (let gz = 0; gz < sn; gz++) for (let gx = 0; gx < sn; gx++) {
      let c = 0, sum = 0, tot = 0, built = 0;
      for (let b = 0; b < per; b++) for (let a = 0; a < per; a++) {
        const i = gx * per + a, k = gz * per + b;
        if (i >= sg.n || k >= sg.n) continue;
        tot++;
        const t = topOf(sg, i, k);
        if (t > -Infinity) { c++; sum += t; if (sg.low[k * sg.n + i] < -30000) built++; }
      }
      const g = gz * sn + gx;
      if (tot && c / tot >= COVER) block[g] = Math.max(mx[g], sum / c);
      // what stands out from afar: a slope or hill rising over its
      // neighbours, water, buildings
      let lo = mn[g];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = gx + dx, b = gz + dz;
        if (a >= 0 && b >= 0 && a < sn && b < sn && mn[b * sn + a] < lo) lo = mn[b * sn + a];
      }
      const cx = Math.min(T.N, gx * SEEN_TILE + 8), cz = Math.min(T.N, gz * SEEN_TILE + 8);
      if (mx[g] - lo >= STANDS_OUT || wet[Math.round(cz) * TN + Math.round(cx)] > 127 || built >= 4) out[g] = 1;
    }
    this.block = block; this.out = out;
    this.mx = mx;
    this.slot = 0;
    this.lastWalk = -1;
  }

  // One frame: rays across the view (yaw, horizontal field of view in
  // radians) from the eye; the squares round the feet; the walked square.
  // Returns how many squares were newly seen or walked.
  step(p, x, z, eye, yaw, hfov) {
    const { sn, block, out, N } = this, seen = p.seen;
    let added = 0;
    for (let r = 0; r < RAYS; r++) {
      const s = (this.slot + r * (SLOTS / RAYS)) % SLOTS;
      const a = yaw + (s / (SLOTS - 1) - 0.5) * hfov * 1.1, dx = Math.sin(a), dz = Math.cos(a);
      let top = -Infinity;
      for (let d = 12; d <= SEE_FAR; d += 8) {
        const px = x + dx * d, pz = z + dz * d;
        if (px < 0 || pz < 0 || px > N || pz > N) break;
        const g = Math.floor(pz / SEEN_TILE) * sn + Math.floor(px / SEEN_TILE);
        // (a forest's or a village's square is seen by its crowns and roofs)
        const sl = (block[g] - eye) / d;
        if (sl >= top - 1e-4 && (d <= NEAR_SEE || out[g]) && setBit(seen, g)) added++;
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
