// The shape of the land, before water: heights on the grid's nodes from a
// seed. The sea closes the south and west, a mountain range the north and
// east, and between them lies gentle lowland: long shallow rises, broad
// valley floors, a few rounded knolls and the hollows that will hold lakes.
// The range rises only beyond its front, so its foothills never creep into
// the lowland; designed for the view at eye level, not for the map.
import { fbm, ridged, vnoise, hash2, smoothstep } from '../noise.js';
import { SCALE } from '../scale.js';

const SEA = SCALE.sea;

// soft minimum: rounds the corner where two edges meet
const softmin = (a, b, k) => -k * Math.log(Math.exp(-a / k) + Math.exp(-b / k));

// Where a point lies between the sea and the range. `c`: metres inland from
// the shore (negative out at sea); `g`: metres into the range past its front
// (negative in the lowland); `f`: the share of the way from the shore to the
// range front (0..1 in the lowland).
export function makeFrame(seed, N) {
  const S = seed | 0;
  return {
    at(x, z, out) {
      const sd = softmin(x, z, 220), rd = softmin(N - x, N - z, 220);
      const shore = SCALE.coast + 120 * fbm(x / 900, z / 900, S + 1, 2) + 45 * fbm(x / 260, z / 260, S + 2, 2);
      const front = SCALE.range.front + 100 * fbm(x / 900 + 31, z / 900, S + 3, 2) + 35 * fbm(x / 250, z / 250 + 17, S + 4, 2);
      const c = sd - shore, g = front - rd;
      out.c = c; out.g = g; out.rd = rd;
      out.f = c <= 0 ? 0 : g >= 0 ? 1 : c / (c - g);
      return out;
    },
  };
}

// A rounded bump (positive h) or hollow (negative h): a cosine profile out
// to radius r, elliptical (rx along angle a, ry across), its outline
// wobbling by `wob` (a share of the radius) so it never reads as an ellipse.
export function bump(b, x, z) {
  const d = shapeDist(b, x, z, 1);
  return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d);
}

// The distance from a shape's centre in its radii, its outline wobbling
// (worked out only out to `reach` radii).
export function shapeDist(b, x, z, reach) {
  const dx = x - b.x, dz = z - b.z;
  const u = (dx * b.ca + dz * b.sa) / b.rx, v = (-dx * b.sa + dz * b.ca) / b.ry;
  let d = Math.sqrt(u * u + v * v);
  if (b.wob && d < reach / (1 - 1.6 * b.wob)) {
    const a = Math.atan2(v, u);
    d *= 1 + b.wob * (vnoise(Math.cos(a) * 1.8 + b.ws, Math.sin(a) * 1.8, 7) + 0.6 * vnoise(Math.cos(a) * 4.1, Math.sin(a) * 4.1 + b.ws, 8));
  }
  return d;
}

// Knolls: low rounded hills in the lowland, from the seed.
export function knolls(seed, N, frame) {
  const out = [], P = {};
  const want = 6 + Math.floor(4 * hash2(1, 2, seed + 501));
  for (let t = 0; t < 400 && out.length < want; t++) {
    const x = 200 + (N - 400) * hash2(t, 1, seed + 502), z = 200 + (N - 400) * hash2(t, 2, seed + 502);
    frame.at(x, z, P);
    const r = 150 + 140 * hash2(t, 3, seed + 502), a = hash2(t, 4, seed + 502) * Math.PI;
    if (P.c < r + 120 || P.g > -(r + 100)) continue;
    if (out.some((k) => Math.hypot(k.x - x, k.z - z) < k.rx + r + 60)) continue;
    out.push({ x, z, rx: r, ry: r * (0.65 + 0.35 * hash2(t, 5, seed + 502)), ca: Math.cos(a), sa: Math.sin(a), h: 8 + 16 * hash2(t, 6, seed + 502), wob: 0.14, ws: t * 3.1 });
  }
  return out;
}

// Heights of the land at every node. Everything but the finest relief is
// worked out on the 4 m grid, then carried to the 1 m grid by bicubic
// interpolation (smooth, so slopes have no seams), and the fine relief of a
// few metres over tens of metres is added there. `step` 4 returns the coarse
// grid alone (a quick look). `basins` are hollows: each levels the ground
// round it to its centre's height (rising gently outward), then sinks a
// bowl, so water gathering there fills a lake instead of running through.
// `rises` are knolls added after the levelling.
export function shapeLand(seed, N, { basins = [], hills = [], rises = [], step = 1 } = {}) {
  const S = seed | 0, n = N / 4, nn = n + 1;
  const frame = makeFrame(seed, N);
  const P = {};
  const Hc = new Float32Array(nn * nn), Wc = new Float32Array(nn * nn);
  let wf = 0;
  for (let k = 0; k <= n; k++) {
    for (let i = 0; i <= n; i++) { Hc[k * nn + i] = heightAt(i * 4, k * 4); Wc[k * nn + i] = wf; }
  }
  if (step === 4) return { H: Hc, frame, n, nn };
  const NN = N + 1, H = new Float32Array(NN * NN);
  // Catmull-Rom weights for the four positions inside a coarse cell
  const CR = [0, 0.25, 0.5, 0.75].map((t) => [(-t + 2 * t * t - t * t * t) / 2, (2 - 5 * t * t + 3 * t * t * t) / 2, (t + 4 * t * t - 3 * t * t * t) / 2, (-t * t + t * t * t) / 2]);
  const at = (i, k) => Hc[Math.min(n, Math.max(0, k)) * nn + Math.min(n, Math.max(0, i))];
  for (let k = 0; k <= N; k++) {
    const k0 = k >> 2, wz = CR[k & 3];
    for (let i = 0; i <= N; i++) {
      const i0 = i >> 2, wx = CR[i & 3];
      let h = 0;
      for (let b = 0; b < 4; b++) {
        if (wz[b] === 0) continue;
        const kk = k0 - 1 + b;
        h += wz[b] * (wx[0] * at(i0 - 1, kk) + wx[1] * at(i0, kk) + wx[2] * at(i0 + 1, kk) + wx[3] * at(i0 + 2, kk));
      }
      // the fine relief, where the land carries it
      const fx = (i & 3) / 4, fz = (k & 3) / 4, c = k0 * nn + i0;
      const c1 = i0 < n ? c + 1 : c, c2 = k0 < n ? c + nn : c, c3 = i0 < n && k0 < n ? c + nn + 1 : c;
      const w = Wc[c] + (Wc[c1] - Wc[c]) * fx + (Wc[c2] - Wc[c]) * fz + (Wc[c] - Wc[c1] - Wc[c2] + Wc[c3]) * fx * fz;
      if (w > 0) h += w * (0.8 * fbm(i / 50, k / 50, S + 13, 2) + 0.22 * vnoise(i / 14, k / 14, S + 14));
      H[k * NN + i] = h;
    }
  }
  return { H, frame, n: N, nn: NN };

  function lowland(x, z, f) {
    // the long rise from the shore to the range front, with broad swells
    let h = SEA + 4 + 24 * Math.pow(f, 1.2);
    h += 8 * fbm(x / 620, z / 620, S + 11, 3) + 3 * fbm(x / 170, z / 170, S + 12, 2);
    for (const b of hills) { const w = bump(b, x, z); if (w > 0) h += b.h * w; }
    return h;
  }

  // The height at a point without the finest relief; sets `wf`, how much of
  // that relief the point carries.
  function heightAt(x, z) {
    frame.at(x, z, P);
    const { c, g, rd } = P;
    // basins: level the ground round them, then sink the bowl
    let land = lowland(x, z, P.f), keep = 1;
    for (const b of basins) {
      const d = shapeDist(b, x, z, b.flatK);
      if (d >= b.flatK) continue;
      // (the levelled ground follows the bowl's own wobbling outline)
      const lv = 0.5 + 0.5 * Math.cos(Math.PI * d / b.flatK);
      let w = Math.min(1, lv * 2.2);
      w = w * w * (3 - 2 * w);
      land += (b.level + b.rise * Math.max(0, d - 1) * b.rx - land) * w;
      if (d < 1) land -= b.depth * (0.5 + 0.5 * Math.cos(Math.PI * d));
      keep *= 1 - w;
    }
    // the rises beside a lake stand on its levelled ground
    for (const b of rises) { const w = bump(b, x, z); if (w > 0) land += b.h * w; }
    let h;
    if (c < 0) {
      // the sea bed: a shelf falling to about 16 m under the sea at the edge
      h = SEA - 16 * (1 - Math.exp(c / 160)) + 0.6 * fbm(x / 90, z / 90, S + 21, 2) * smoothstep(0, -60, c);
      wf = 0;
    } else {
      // the shore: a beach rising from the water, then the lowland
      const s = smoothstep(25, 300, c);
      h = SEA + 3.2 * (1 - Math.exp(-c / 45)) + (land - SEA - 3.2) * s;
      wf = s * keep;
    }
    // low cliffs along some of the coast
    // (only near the shore: inland the raised ground slopes gently away)
    if (c > -40 && c < 420) {
      const cl = smoothstep(0.52, 0.72, fbm(x / 520, z / 520, S + 22, 2) * 0.5 + 0.5);
      if (cl > 0) h += cl * (6 + 7 * (0.5 + 0.5 * fbm(x / 250, z / 250, S + 23, 2))) * smoothstep(-3, 7, c) * smoothstep(420, 140, c);
    }
    // the range, beyond its front only, and never right at the shore
    if (g > 0) {
      // ridges and valleys run into the range (radially from beyond the
      // south-west corner), so the valleys drain toward the lowland and the
      // sea; finer ridges break up the slopes and the skyline
      const warp = 70 * fbm(x / 420, z / 420, S + 34, 2);
      const u = Math.atan2(z + 300, x + 300) * 2600 + warp;
      const rv = ridged(u / 290, (g + warp) / 900, S + 31, 3);
      const det = ridged(x / 130, z / 130, S + 35, 3);
      const crag = ridged(x / 70 + 3.3, z / 70, S + 36, 2);
      const foot = 45 * smoothstep(0, 170, g);
      const m = smoothstep(50, 380, g);
      const peaks = (SCALE.range.top + 20) * Math.pow(m, 1.25) * (0.3 + 0.7 * rv) * (0.8 + 0.2 * det) * (0.88 + 0.12 * fbm(x / 700, z / 700, S + 32, 2))
        + 26 * m * (det - 0.45) + 12 * m * m * (crag - 0.45);
      const atShore = smoothstep(40, 380, c);
      let up = (foot + peaks) * atShore;
      // toward the north and east edges the range evens out into a high
      // shoulder, so what lies past the edge reads as more high ground
      const e = smoothstep(150, 10, rd) * atShore;
      if (e > 0) up += (SCALE.range.top - 110 + 40 * fbm(x / 500, z / 500, S + 33, 2) - (h - SEA + up)) * e;
      h += up;
      wf *= 1 - e;
    }
    return h;
  }
}
