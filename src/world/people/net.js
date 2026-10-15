// The people's way network (phase 4a; src/world/people/people.js): the
// roads, the villages' lanes and the footpaths as nodes and links, joined
// where they meet, with the shortest way between two nodes (A*). Also what
// the signposts read (src/game/signs.js).
export class Net {
  constructor() { this.x = []; this.z = []; this.nb = []; }
  add(x, z) { this.x.push(x); this.z.push(z); this.nb.push([]); return this.x.length - 1; }
  link(a, b) { if (a === b) return; const d = Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]); this.nb[a].push(b, d); this.nb[b].push(a, d); }
  line(xs, zs, n) { let prev = -1; for (let i = 0; i < n; i++) { const k = this.add(xs[i], zs[i]); if (prev >= 0) this.link(prev, k); prev = k; } }
  // join points of different lines within `r` metres
  join(r = 2.2) {
    const cell = new Map(), key = (x, z) => `${Math.floor(x / r)},${Math.floor(z / r)}`;
    for (let i = 0; i < this.x.length; i++) { const k = key(this.x[i], this.z[i]); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); }
    for (let i = 0; i < this.x.length; i++) {
      const cx = Math.floor(this.x[i] / r), cz = Math.floor(this.z[i] / r);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get(`${cx + a},${cz + b}`) || []) {
        if (j <= i) continue;
        if (Math.hypot(this.x[i] - this.x[j], this.z[i] - this.z[j]) < r && !this.nb[i].includes(j)) this.link(i, j);
      }
    }
    this.cell = cell; this.r = r;
    this.n = this.x.length;
    this.dist = new Float64Array(this.n); this.prev = new Int32Array(this.n); this.done = new Uint8Array(this.n);
  }
  // the nodes within `rad` metres of (x, z), nearest first
  nearby(x, z, rad) {
    const out = [];
    for (let i = 0; i < this.n; i++) { const d = Math.hypot(this.x[i] - x, this.z[i] - z); if (d < rad) out.push([d, i]); }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((q) => q[1]);
  }
  // the shortest way from node a to node b (A*)
  path(a, b) {
    if (a === b) return [a];
    const { dist, prev, done } = this;
    dist.fill(Infinity); prev.fill(-1); done.fill(0);
    const heap = [];
    const push = (f, c) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const bx = this.x[b], bz = this.z[b];
    dist[a] = 0; push(0, a);
    while (heap.length) {
      const [, c] = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === b) break;
      const nb = this.nb[c];
      for (let k = 0; k < nb.length; k += 2) {
        const j = nb[k], nd = dist[c] + nb[k + 1];
        if (nd < dist[j]) { dist[j] = nd; prev[j] = c; push(nd + Math.hypot(this.x[j] - bx, this.z[j] - bz), j); }
      }
    }
    if (!done[b]) return null;
    const out = []; for (let c = b; c >= 0; c = prev[c]) out.push(c);
    return out.reverse();
  }
}
