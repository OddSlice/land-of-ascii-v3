// Placing things in a village (phase 3b; src/world/gen/village.js): what
// is where (roads, lanes, paths and buildings), turned rectangles, whether
// two overlap, and the grid squares one covers.
// Points along roads, lanes and paths (each with its half width), in 8 m
// cells, so "is this near a way?" is quick.
export class Ways {
  constructor() { this.cells = new Map(); }
  add(x, z, half) {
    const k = Math.floor(x / 8) * 4096 + Math.floor(z / 8);
    let c = this.cells.get(k);
    if (!c) { c = []; this.cells.set(k, c); }
    c.push(x, z, half);
  }
  line(xs, zs, half, step = 1) { for (let q = 0; q < xs.length; q += step) this.add(xs[q], zs[q], half); }
  // the least clearance from (x, z) to the edge of any way (negative: on it)
  clear(x, z, reach = 12) {
    let best = Infinity;
    const r = Math.ceil(reach / 8);
    const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = cx - r; i <= cx + r; i++) for (let k = cz - r; k <= cz + r; k++) {
      const c = this.cells.get(i * 4096 + k);
      if (!c) continue;
      for (let o = 0; o < c.length; o += 3) {
        const d = Math.hypot(c[o] - x, c[o + 1] - z) - c[o + 2];
        if (d < best) best = d;
      }
    }
    return best;
  }
}

// A turned rectangle: centre, angle, half sizes.
export const rect = (x, z, a, hw, hd) => ({ x, z, a, hw, hd, ca: Math.cos(a), sa: Math.sin(a) });
// Do two turned rectangles come within `gap` of each other? (separating axes)
export function overlaps(A, B, gap) {
  for (const R of [A, B]) {
    for (const [ux, uz] of [[R.ca, R.sa], [-R.sa, R.ca]]) {
      const proj = (Q) => {
        const c = Q.x * ux + Q.z * uz;
        const e = Q.hw * Math.abs(Q.ca * ux + Q.sa * uz) + Q.hd * Math.abs(-Q.sa * ux + Q.ca * uz);
        return [c - e, c + e];
      };
      const [a0, a1] = proj(A), [b0, b1] = proj(B);
      if (a1 + gap < b0 || b1 + gap < a0) return false;
    }
  }
  return true;
}
// Points over a rectangle (and `pad` past it), every `step` metres.
export function* over(R, pad = 0, step = 1) {
  const nu = Math.max(1, Math.ceil(2 * (R.hw + pad) / step)), nw = Math.max(1, Math.ceil(2 * (R.hd + pad) / step));
  for (let i = 0; i <= nu; i++) for (let k = 0; k <= nw; k++) {
    const u = -R.hw - pad + 2 * (R.hw + pad) * i / nu, w = -R.hd - pad + 2 * (R.hd + pad) * k / nw;
    yield [R.x + u * R.ca - w * R.sa, R.z + u * R.sa + w * R.ca];
  }
}
