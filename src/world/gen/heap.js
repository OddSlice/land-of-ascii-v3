// A binary min-heap of integer items keyed by numbers. Ties are broken by
// the order items were pushed, so every thread pops the same sequence.
export class MinHeap {
  constructor(cap = 1024) {
    this.key = new Float64Array(cap);
    this.ord = new Float64Array(cap);
    this.val = new Int32Array(cap);
    this.n = 0;
    this.count = 0;
  }

  get size() { return this.n; }

  less(a, b) { return this.key[a] < this.key[b] || (this.key[a] === this.key[b] && this.ord[a] < this.ord[b]); }

  swap(a, b) {
    const k = this.key[a], o = this.ord[a], v = this.val[a];
    this.key[a] = this.key[b]; this.ord[a] = this.ord[b]; this.val[a] = this.val[b];
    this.key[b] = k; this.ord[b] = o; this.val[b] = v;
  }

  push(v, k) {
    if (this.n === this.val.length) {
      const grow = (A, T) => { const B = new T(A.length * 2); B.set(A); return B; };
      this.key = grow(this.key, Float64Array); this.ord = grow(this.ord, Float64Array); this.val = grow(this.val, Int32Array);
    }
    let i = this.n++;
    this.key[i] = k; this.ord[i] = this.count++; this.val[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p); i = p;
    }
  }

  // The smallest key (read before pop).
  topKey() { return this.key[0]; }

  pop() {
    const top = this.val[0];
    const last = --this.n;
    if (last > 0) {
      this.key[0] = this.key[last]; this.ord[0] = this.ord[last]; this.val[0] = this.val[last];
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < last && this.less(a, m)) m = a;
        if (b < last && this.less(b, m)) m = b;
        if (m === i) break;
        this.swap(i, m); i = m;
      }
    }
    return top;
  }
}
