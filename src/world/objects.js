// Things that stand on the ground and are drawn in their own depth-tested
// pass: conifers in two loose stands, a handful of bushes, the torch.
import { hash2 } from './noise.js';
import { SEED, STANDS, BUSHES, TORCH, WALL, WATER } from './layout.js';
import { lakeDist, roadDist, NN } from './terrain.js';

export function groundAt(ground, x, z) {
  const i = Math.max(0, Math.min(511.999, x)), k = Math.max(0, Math.min(511.999, z));
  const i0 = Math.floor(i), k0 = Math.floor(k), fx = i - i0, fz = k - k0;
  const j = k0 * NN + i0;
  const a = ground[j], b = ground[j + 1], c = ground[j + NN], d = ground[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function conifer(x, z, base, s, tall = 1) {
  const r = (n) => hash2(s, n, SEED + 31);
  const h = (13 + 7.5 * r(1)) * tall;
  const R = 2.0 + 0.9 * r(2);
  const c0 = 2.0 + 1.2 * r(3);
  const T = 7 + Math.floor(3 * r(4));
  const tiers = [];
  const span = h - c0;
  const env = (f) => R * Math.pow(1 - f, 0.9) + 0.22;
  for (let t = 0; t < T; t++) {
    const f0 = t / T;
    const f1 = Math.min(1, (t + 1.5) / T);
    const ya = base + c0 + f0 * span;
    const yb = base + c0 + f1 * span;
    const Ra = env(f0) * (0.92 + 0.16 * r(10 + t));
    const Rb = t === T - 1 ? 0.1 : env(f0) * 0.3;
    tiers.push(ya, yb, Ra, Rb);
  }
  return { x, z, base, top: base + h, R: R + 0.4, trunkTop: base + c0 + 1, tiers: Float32Array.from(tiers), seed: s };
}

export function buildObjects(terrain) {
  const { ground } = terrain;
  const trees = [];
  let s = 1;
  for (const st of STANDS) {
    let placed = 0;
    for (let tries = 0; tries < st.count * 60 && placed < st.count; tries++) {
      const a = hash2(s, tries, SEED + 41) * Math.PI * 2;
      const rr = Math.sqrt(hash2(s, tries, SEED + 42));
      const x = st.x + Math.cos(a) * rr * st.rx, z = st.z + Math.sin(a) * rr * st.rz;
      if (lakeDist(x, z) < 1.1) continue;
      if (roadDist(x, z) < 5) continue;
      if (z > WALL.z0 - 8 && z < WALL.z1 + 8) continue;
      // loose: keep a clear gap between trunks, with the odd close pair
      let ok = true;
      for (const t of trees) {
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < st.gap) { ok = false; break; }
      }
      if (!ok) continue;
      trees.push(conifer(x, z, groundAt(ground, x, z) - 0.3, s * 1000 + placed, st.tall || 1));
      placed++;
    }
    s++;
  }

  const bushes = BUSHES.map(([x, z], n) => {
    const r = (m) => hash2(n, m, SEED + 51);
    return { x, z, base: groundAt(ground, x, z), rx: 1.0 + 0.7 * r(1), ry: 0.75 + 0.5 * r(2), seed: n };
  });

  const torch = { x: TORCH.x, z: TORCH.z, base: groundAt(ground, TORCH.x, TORCH.z), h: TORCH.height };
  torch.flameY = torch.base + torch.h + 0.18;

  return { trees, bushes, torch, water: WATER };
}
