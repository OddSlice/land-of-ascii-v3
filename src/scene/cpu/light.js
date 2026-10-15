// Light for the CPU backend: which light is up (sun or moon), cast shadows
// from terrain, the wall and the trees (one sweep over the grid toward the
// light), the cloud shadows, and the torch.
import { LEVELS } from '../../world/terrain.js';
import { sunDir, moonDirOn, WIND } from '../../world/sky.js';
import { fbm } from '../../world/noise.js';
import { spanAt } from '../../world/spans.js';
import { SEED } from '../../world/layout.js';
import { weatherParams } from '../../weather.js';
import { raiseOccluders } from '../../world/kit.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// Heights that block light: the drawn surface, raised by the wall's spans,
// the tree crowns (as cones) and the bushes. Built once.
export function buildOccluders(world) {
  const { terrain, spans, objects, N, NN } = world;
  const occ = Float32Array.from(terrain.levels[0].H);
  const { y1, box } = spans;
  for (let z = box.z0; z < box.z1; z++) {
    for (let x = box.x0; x < box.x1; x++) {
      const s = spanAt(spans, x, z);
      if (s < 0) continue;
      const top = y1[s];
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = (z + dz) * NN + x + dx;
        if (occ[j] < top) occ[j] = top;
      }
    }
  }
  // (phase 3a) the building kit's shapes, by their tops
  raiseOccluders(world.kit, occ, N, NN);
  for (const t of objects.trees) {
    const crownBase = t.tiers[0];
    const R = t.R;
    for (let z = Math.floor(t.z - R); z <= Math.ceil(t.z + R); z++) {
      for (let x = Math.floor(t.x - R); x <= Math.ceil(t.x + R); x++) {
        if (x < 0 || z < 0 || x > N || z > N) continue;
        const rho = Math.hypot(x - t.x, z - t.z);
        if (rho > R) continue;
        const h = t.top - (t.top - crownBase) * (rho / R);
        const j = z * NN + x;
        if (occ[j] < h) occ[j] = h;
      }
    }
  }
  for (const b of objects.bushes) {
    for (let z = Math.floor(b.z - b.rx); z <= Math.ceil(b.z + b.rx); z++) {
      for (let x = Math.floor(b.x - b.rx); x <= Math.ceil(b.x + b.rx); x++) {
        const rho = Math.hypot(x - b.x, z - b.z) / b.rx;
        if (rho > 1) continue;
        const h = b.base + b.ry * 1.5 * Math.sqrt(1 - rho * rho);
        const j = z * NN + x;
        if (occ[j] < h) occ[j] = h;
      }
    }
  }
  return occ;
}

// V[node] = height of the shadow volume over the node: anything below it is
// in shadow. Swept from the light's side of the grid one line at a time, each
// node reading the line before it, so it is one pass over the grid; on a big
// grid the pass is spread over several frames.
const NEG = -1e9;

function sweepLine(job, occ, V, n, NN) {
  const { xdom, s, frac, drop, line } = job;
  const prev = line + s;
  // each node reads the line before it at k + frac, between two nodes
  // `step` apart (clamped at the ends)
  const base = xdom ? prev : prev * NN, step = xdom ? NN : 1, out = xdom ? line : line * NN, ostep = xdom ? NN : 1;
  for (let k = 0, w = out; k <= n; k++, w += ostep) {
    const pos = k + frac;
    let o, v;
    if (pos <= 0) { o = occ[base]; v = V[base]; } else if (pos >= n) {
      const j = base + n * step; o = occ[j]; v = V[j];
    } else {
      const p0 = Math.floor(pos), f = pos - p0, j = base + p0 * step;
      o = occ[j] * (1 - f) + occ[j + step] * f;
      v = V[j] * (1 - f) + V[j + step] * f;
    }
    V[w] = (o > v ? o : v) - drop;
  }
}

// Rows k0..k1-1 of a level from the level below (a tent filter), clamped at
// the edges like terrain.js's downsample, with the same sums in the same order.
function downsampleRows(src, n, out, k0, k1) {
  const m = n >> 1, mm = m + 1, nn = n + 1;
  const at = (i, k) => src[Math.min(n, Math.max(0, k)) * nn + Math.min(n, Math.max(0, i))];
  for (let k = k0; k < k1; k++) {
    const K = 2 * k;
    const edgeRow = K === 0 || K === n;
    for (let i = 0; i <= m; i++) {
      const I = 2 * i;
      let s;
      if (edgeRow || I === 0 || I === n) {
        s = 4 * at(I, K);
        s += 2 * (at(I - 1, K) + at(I + 1, K) + at(I, K - 1) + at(I, K + 1));
        s += at(I - 1, K - 1) + at(I + 1, K - 1) + at(I - 1, K + 1) + at(I + 1, K + 1);
      } else {
        const c = K * nn + I, u = c - nn, d = c + nn;
        s = 4 * src[c];
        s += 2 * (src[c - 1] + src[c + 1] + src[u] + src[d]);
        s += src[u - 1] + src[u + 1] + src[d - 1] + src[d + 1];
      }
      out[k * mm + i] = s / 16;
    }
  }
}

// Cast shadows are recomputed when the light has moved by a step: 15 s of
// game time on the lab's valley, 2 minutes on a big map. The key names the
// step; every thread derives the same one from the hour (and, for the moon,
// the day, since its place follows its phase).
export function lightKey(hour, N, day = 0) {
  const kph = N <= 512 ? 240 : 30;
  const isSun = sunDir(hour)[1] > -0.035;
  const q = Math.round(hour * kph);
  return { key: (isSun ? 's' : `m${day}:`) + q, keyHour: q / kph, isSun, day };
}

// The arrays shadows are kept in: V, the shadow volume's height over each
// node, and S, the ground's shadow per level. The generated world keeps S as
// bytes (0..255) to save memory; the lab and the stress scene as 0..1.
export function shadowStore(world, Shared = ArrayBuffer) {
  const NN = world.NN, bytes = world.kind === 'world';
  const V = new Float32Array(new Shared(NN * NN * 4));
  const S = [];
  for (let L = 0, n = world.N; L < LEVELS; L++, n >>= 1) {
    const m = (n + 1) * (n + 1);
    S.push(bytes ? new Uint8ClampedArray(new Shared(m)) : new Float32Array(new Shared(m * 4)));
  }
  return { V, S };
}

export class Light {
  // `shared`: shadows are swept by another worker into these stores
  // ({ V: [V0, V1], S: [S0, S1] }); each frame says which one to read.
  // `store`: sweep into these arrays instead of new ones.
  constructor(world, { shared = null, store = null, occ = null } = {}) {
    this.world = world;
    this.N = world.N; this.NN = world.NN;
    this.sK = world.kind === 'world' ? 1 / 255 : 1;     // S as bytes: scale back to 0..1
    this.shared = shared;
    if (shared) {
      this.occ = null;
      this.V = shared.V[0]; this.S = shared.S[0];
    } else {
      this.occ = occ || buildOccluders(world);
      const st = store || shadowStore(world);
      this.V = st.V;
      // ground shadow per level, 0..1 (or 0..255)
      this.S = st.S;
    }
    this.key = null;
    this.job = null;                   // a shadow sweep in progress
    // Every worker sweeps the whole grid, so the work is spread over frames,
    // or a frame that also sweeps would be shown late. On a big map: 64K grid
    // nodes a frame (about 1.5 ms with eight workers at once), and a new sweep
    // only every 2 game minutes (half a degree of sun), which takes about
    // 1.5 s to come through. The lab's valley: 96K nodes a frame, a sweep
    // every 15 game seconds that comes through in four frames.
    this.budget = world.N <= 512 ? 96 * 1024 : 64 * 1024;
    this.keysPerHour = world.N <= 512 ? 240 : 30;
    this.stale = false;                // the light moved during a sweep
    this.sweepMs = 0;
    // the cloud-shadow grid: 8 m apart on the lab's valley, 32 m on the big map
    this.G = 65;
    this.step = world.N / (this.G - 1);
    this.cloud = new Float32Array(this.G * this.G);
    // (phase 4a) which frame each grid point was last worked out for: they
    // are worked out as they are first read, so a worker computes only the
    // points its own stripe's view reaches
    this.cloudStamp = new Int32Array(this.G * this.G);
    this.cloudFrame = 0;
  }

  // Called once per frame with the frame's hour and clock (and, with shared
  // shadows, the frame's { buf, settled }), its day (the moon's phase) and
  // its weather (phase 2b: how much cloud casts shadows, how far it has drifted).
  update(hour, t, shadow, day = 0, weather = null) {
    this.wp = weatherParams(weather);
    const sun = sunDir(hour), moon = moonDirOn(hour, day);
    this.day = day;
    // the light that shades the ground: the sun while it is near or above
    // the horizon, else the moon
    this.isSun = sun[1] > -0.035;
    const L = this.isSun ? sun : moon;
    this.sun = sun; this.moon = moon;
    // keep the light a little above the horizon for shading
    const el = Math.max(0.035, L[1]);
    const h = Math.hypot(L[0], L[2]) || 1;
    const c = Math.sqrt(1 - el * el);
    this.L = [L[0] / h * c, el, L[2] / h * c];
    // direct strength fades as the light reaches the horizon
    this.dirFade = smooth(-0.035, 0.06, L[1]);

    if (this.shared) {
      // swept by the shadow worker: read the store this frame was given
      this.V = this.shared.V[shadow.buf]; this.S = this.shared.S[shadow.buf];
      this.sharedSettled = !!shadow.settled;
      this.updateClouds(t);
      return;
    }
    // cast shadows: recomputed when the light moves by a step (15 s of game
    // time, 2 minutes on a big map)
    const k = lightKey(hour, this.N, day), key = k.key;
    if (key !== this.key) {
      const first = this.key === null;
      this.key = key; this.keyHour = k.keyHour;
      // a sweep under way finishes first, then the next starts from the light
      // as it is then, so shadows keep up while the clock runs
      if (this.job) this.stale = true;
      else this.startSweep();
      // the very first sweep is done at once, and timed
      if (first) { const t0 = performance.now(); this.runSweep(Infinity); this.sweepMs = performance.now() - t0; }
    }
    if (this.job) {
      this.runSweep(this.budget);
      if (!this.job && this.stale) { this.stale = false; this.startSweep(); this.runSweep(this.budget); }
    }
    this.updateClouds(t);
  }

  // True while cast shadows are still being brought up to date.
  get pending() { return this.shared ? !this.sharedSettled : this.job !== null; }

  // One whole sweep, at once, for the light at `keyHour` (the shadow worker).
  sweepNow(keyHour, isSun, day = 0) {
    this.keyHour = keyHour; this.isSun = isSun; this.day = day; this.job = null;
    const t0 = performance.now();
    this.startSweep(); this.runSweep(Infinity);
    return performance.now() - t0;
  }

  startSweep() {
    const Lq = this.isSun ? sunDir(this.keyHour) : moonDirOn(this.keyHour, this.day);
    const eq = Math.max(0.035, Lq[1]);
    const hh = Math.hypot(Lq[0], Lq[2]) || 1;
    const lx = Lq[0] / hh, lz = Lq[2] / hh, tanE = eq / Math.sqrt(1 - eq * eq);
    const n = this.N, NN = this.NN, V = this.V;
    const xdom = Math.abs(lx) >= Math.abs(lz);
    const s = xdom ? (lx > 0 ? 1 : -1) : (lz > 0 ? 1 : -1);
    const frac = xdom ? lz / Math.abs(lx) : lx / Math.abs(lz);
    const first = s > 0 ? n : 0;
    // nothing shades the line nearest the light
    if (xdom) for (let k = 0; k <= n; k++) V[k * NN + first] = NEG;
    else for (let i = 0; i <= n; i++) V[first * NN + i] = NEG;
    this.job = { xdom, s, frac, drop: tanE * Math.sqrt(1 + frac * frac), line: first - s, first, phase: 0, mip: 1, row: 0, s0: false };
    this.shadeLine(first);
  }

  // The ground shadow of one swept line.
  shadeLine(line) {
    const { V, N, NN } = this, job = this.job, S0 = this.S[0];
    const H = this.world.terrain.levels[0].H, k1 = 1 / this.sK;
    if (job.xdom) for (let k = 0, j = line; k <= N; k++, j += NN) S0[j] = smooth(-0.1, 0.45, V[j] - H[j]) * k1;
    else for (let i = 0, j = line * NN; i <= N; i++, j++) S0[j] = smooth(-0.1, 0.45, V[j] - H[j]) * k1;
  }

  // Work through the sweep (then the coarser levels) until `budget` nodes are done.
  runSweep(budget) {
    const job = this.job, n = this.N, NN = this.NN;
    let done = 0;
    while (job.phase === 0 && done < budget) {
      if (job.line < 0 || job.line > n) { job.phase = 1; break; }
      sweepLine(job, this.occ, this.V, n, NN);
      this.shadeLine(job.line);
      job.line -= job.s;
      done += NN;
    }
    while (job.phase === 1 && done < budget) {
      const L = job.mip;
      if (L >= LEVELS) { this.job = null; return; }
      const nIn = n >> (L - 1), m = nIn >> 1;
      const rows = Math.max(1, Math.min(m + 1 - job.row, Math.ceil((budget - done) / (m + 1))));
      downsampleRows(this.S[L - 1], nIn, this.S[L], job.row, job.row + rows);
      job.row += rows;
      done += rows * (m + 1);
      if (job.row > m) { job.mip++; job.row = 0; }
    }
  }

  // Shadow at any point, from the volume height (for walls and trees).
  shadowAt(x, y, z) {
    const N = this.N, NN = this.NN;
    const i = Math.max(0, Math.min(N - 0.001, x)), k = Math.max(0, Math.min(N - 0.001, z));
    const i0 = Math.floor(i), k0 = Math.floor(k), fx = i - i0, fz = k - k0;
    const j = k0 * NN + i0, V = this.V;
    const v = V[j] + (V[j + 1] - V[j]) * fx + (V[j + NN] - V[j]) * fz + (V[j] - V[j + 1] - V[j + NN] + V[j + NN + 1]) * fx * fz;
    return smooth(-0.15, 0.5, v - y);
  }

  // Cloud shadow on a coarse grid over the valley: large soft patches from a
  // low-frequency field that drifts with the wind, cast along the light so
  // they slide across slopes the right way. Fixed to the land, so walking
  // never makes them crawl. (Phase 4a: the frame's drift is set here, and
  // each grid point is worked out the first time this frame reads it.)
  updateClouds(t) {
    const L = this.isSun ? this.sun : this.moon;
    this.cloudsOn = L[1] > 0.08;
    if (!this.cloudsOn) return;
    const P = this.wp;
    this.cL = L;
    this.cox = WIND[0] * t + P.drift; this.coz = WIND[1] * t;
    // more cloud, more of the land in its shadow (fair: from n = 0)
    this.ca0 = P.fair ? 0 : P.clouds < 1 ? 0.3 * (1 - P.clouds) : -0.2 * (P.clouds - 1);
    this.cloudFrame++;
  }

  // One grid point of the cloud shadow, for this frame.
  cloudPoint(j) {
    const G = this.G, gx = j % G, gz = (j - gx) / G, step = this.step, L = this.cL;
    const lift = 900;                       // height of the cloud layer
    const x = gx * step, z = gz * step;
    const y = this.world.terrain.levels[0].H[Math.round(z) * this.NN + Math.round(x)];
    const k = (lift - y) / L[1];
    const cx = x + L[0] * k - this.cox + 1920, cz = z + L[2] * k - this.coz + 1740;
    const n = fbm(cx / 105, cz / 85, SEED + 91, 3);
    this.cloudStamp[j] = this.cloudFrame;
    return (this.cloud[j] = smooth(this.ca0, this.ca0 + 0.11, n));
  }

  cloudAt(x, z) {
    if (!this.cloudsOn) return 0;
    const G = this.G;
    const u = Math.max(0, Math.min(G - 1.001, x / this.step));
    const w = Math.max(0, Math.min(G - 1.001, z / this.step));
    const i0 = Math.floor(u), k0 = Math.floor(w), fx = u - i0, fz = w - k0;
    const j = k0 * G + i0, g = this.cloud, st = this.cloudStamp, f = this.cloudFrame;
    if (st[j] !== f) this.cloudPoint(j);
    if (st[j + 1] !== f) this.cloudPoint(j + 1);
    if (st[j + G] !== f) this.cloudPoint(j + G);
    if (st[j + G + 1] !== f) this.cloudPoint(j + G + 1);
    return g[j] + (g[j + 1] - g[j]) * fx + (g[j + G] - g[j]) * fz + (g[j] - g[j + 1] - g[j + G] + g[j + G + 1]) * fx * fz;
  }
}

// The torch's flicker, a pure function of the clock.
export function torchPower(t) {
  return 1 + 0.07 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.03 * Math.sin(t * 41.3 + 0.4);
}
export const TORCH_RANGE = 11;
