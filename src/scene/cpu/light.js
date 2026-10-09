// Light for the CPU backend: which light is up (sun or moon), cast shadows
// from terrain, the wall and the trees (one sweep over the grid toward the
// light), the cloud shadows, and the torch.
import { NN, LEVELS } from '../../world/terrain.js';
import { N } from '../../world/layout.js';
import { sunDir, moonDir, WIND } from '../../world/sky.js';
import { fbm } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';

const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// Heights that block light: the drawn surface, raised by the wall's spans,
// the tree crowns (as cones) and the bushes. Built once.
export function buildOccluders(world) {
  const { terrain, spans, objects } = world;
  const occ = Float32Array.from(terrain.levels[0].H);
  const { idx, y1 } = spans;
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const s = idx[z * N + x];
      if (s < 0) continue;
      const top = y1[s];
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const j = (z + dz) * NN + x + dx;
        if (occ[j] < top) occ[j] = top;
      }
    }
  }
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
// in shadow. Swept from the light's side of the grid, one row at a time,
// each node reading the row before it, so it is one pass over the grid.
function sweep(occ, V, lx, lz, tanE) {
  const n = N;
  const NEG = -1e9;
  const lerpAt = (arr, base, stride, pos) => {
    if (pos <= 0) return arr[base];
    if (pos >= n) return arr[base + n * stride];
    const p0 = Math.floor(pos), f = pos - p0;
    return arr[base + p0 * stride] * (1 - f) + arr[base + (p0 + 1) * stride] * f;
  };
  if (Math.abs(lx) >= Math.abs(lz)) {
    const sx = lx > 0 ? 1 : -1;
    const sz = lz / Math.abs(lx);
    const drop = tanE * Math.sqrt(1 + sz * sz);
    const first = lx > 0 ? n : 0;
    for (let k = 0; k <= n; k++) V[k * NN + first] = NEG;
    for (let i = first - sx; i >= 0 && i <= n; i -= sx) {
      const ip = i + sx;
      for (let k = 0; k <= n; k++) {
        const pos = k + sz;
        const o = lerpAt(occ, ip, NN, pos), v = lerpAt(V, ip, NN, pos);
        V[k * NN + i] = (o > v ? o : v) - drop;
      }
    }
  } else {
    const sz = lz > 0 ? 1 : -1;
    const sx = lx / Math.abs(lz);
    const drop = tanE * Math.sqrt(1 + sx * sx);
    const first = lz > 0 ? n : 0;
    for (let i = 0; i <= n; i++) V[first * NN + i] = NEG;
    for (let k = first - sz; k >= 0 && k <= n; k -= sz) {
      const kp = k + sz;
      for (let i = 0; i <= n; i++) {
        const pos = i + sx;
        const o = lerpAt(occ, kp * NN, 1, pos), v = lerpAt(V, kp * NN, 1, pos);
        V[k * NN + i] = (o > v ? o : v) - drop;
      }
    }
  }
}

function downsample(src, n) {
  const m = n >> 1, mm = m + 1, nn = n + 1;
  const out = new Float32Array(mm * mm);
  const at = (i, k) => src[Math.min(n, Math.max(0, k)) * nn + Math.min(n, Math.max(0, i))];
  for (let k = 0; k <= m; k++) {
    for (let i = 0; i <= m; i++) {
      const I = 2 * i, K = 2 * k;
      out[k * mm + i] = (4 * at(I, K) + 2 * (at(I - 1, K) + at(I + 1, K) + at(I, K - 1) + at(I, K + 1))
        + at(I - 1, K - 1) + at(I + 1, K - 1) + at(I - 1, K + 1) + at(I + 1, K + 1)) / 16;
    }
  }
  return out;
}

const CLOUD_GRID = 65, CLOUD_STEP = N / (CLOUD_GRID - 1);

export class Light {
  constructor(world) {
    this.world = world;
    this.occ = buildOccluders(world);
    this.V = new Float32Array(NN * NN);
    this.S = [];                       // ground shadow per level, 0..1
    this.key = null;
    this.cloud = new Float32Array(CLOUD_GRID * CLOUD_GRID);
  }

  // Called once per frame with the frame's hour and clock.
  update(hour, t) {
    const sun = sunDir(hour), moon = moonDir(hour);
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

    // cast shadows: recomputed when the light moves by a step (15 s of game time)
    const q = Math.round(hour * 240);
    const key = (this.isSun ? 's' : 'm') + q;
    if (key !== this.key) {
      this.key = key;
      const hq = q / 240;
      const Lq = this.isSun ? sunDir(hq) : moonDir(hq);
      const eq = Math.max(0.035, Lq[1]);
      const hh = Math.hypot(Lq[0], Lq[2]) || 1;
      this.shadowStep(Lq[0] / hh, Lq[2] / hh, eq / Math.sqrt(1 - eq * eq));
    }
    this.updateClouds(t);
  }

  shadowStep(lx, lz, tanE) {
    const { V, occ } = this;
    sweep(occ, V, lx, lz, tanE);
    const ground = this.world.terrain.levels[0].H;
    const S0 = new Float32Array(NN * NN);
    for (let j = 0; j < S0.length; j++) S0[j] = smooth(-0.1, 0.45, V[j] - ground[j]);
    this.S = [S0];
    let n = N;
    for (let L = 1; L < LEVELS; L++) { this.S.push(downsample(this.S[L - 1], n)); n >>= 1; }
  }

  // Shadow at any point, from the volume height (for walls and trees).
  shadowAt(x, y, z) {
    const i = Math.max(0, Math.min(N - 0.001, x)), k = Math.max(0, Math.min(N - 0.001, z));
    const i0 = Math.floor(i), k0 = Math.floor(k), fx = i - i0, fz = k - k0;
    const j = k0 * NN + i0, V = this.V;
    const v = V[j] + (V[j + 1] - V[j]) * fx + (V[j + NN] - V[j]) * fz + (V[j] - V[j + 1] - V[j + NN] + V[j + NN + 1]) * fx * fz;
    return smooth(-0.15, 0.5, v - y);
  }

  // Cloud shadow on a coarse grid over the valley: large soft patches from a
  // low-frequency field that drifts with the wind, cast along the light so
  // they slide across slopes the right way. Fixed to the land, so walking
  // never makes them crawl.
  updateClouds(t) {
    const g = this.cloud;
    const L = this.isSun ? this.sun : this.moon;
    this.cloudsOn = L[1] > 0.08;
    if (!this.cloudsOn) return;
    const H = this.world.terrain.levels[0].H;
    const lift = 900;                       // height of the cloud layer
    const ox = WIND[0] * t, oz = WIND[1] * t;
    for (let gz = 0; gz < CLOUD_GRID; gz++) {
      for (let gx = 0; gx < CLOUD_GRID; gx++) {
        const x = gx * CLOUD_STEP, z = gz * CLOUD_STEP;
        const y = H[Math.round(z) * NN + Math.round(x)];
        const k = (lift - y) / L[1];
        const cx = x + L[0] * k - ox + 1920, cz = z + L[2] * k - oz + 1740;
        const n = fbm(cx / 105, cz / 85, SEED + 91, 3);
        g[gz * CLOUD_GRID + gx] = smooth(0.0, 0.11, n);
      }
    }
  }

  cloudAt(x, z) {
    if (!this.cloudsOn) return 0;
    const u = Math.max(0, Math.min(CLOUD_GRID - 1.001, x / CLOUD_STEP));
    const w = Math.max(0, Math.min(CLOUD_GRID - 1.001, z / CLOUD_STEP));
    const i0 = Math.floor(u), k0 = Math.floor(w), fx = u - i0, fz = w - k0;
    const j = k0 * CLOUD_GRID + i0, g = this.cloud;
    return g[j] + (g[j + 1] - g[j]) * fx + (g[j + CLOUD_GRID] - g[j]) * fz + (g[j] - g[j + 1] - g[j + CLOUD_GRID] + g[j + CLOUD_GRID + 1]) * fx * fz;
  }
}

// The torch's flicker, a pure function of the clock.
export function torchPower(t) {
  return 1 + 0.07 * Math.sin(t * 9.1) + 0.05 * Math.sin(t * 23.7 + 1.3) + 0.03 * Math.sin(t * 41.3 + 0.4);
}
export const TORCH_RANGE = 11;
