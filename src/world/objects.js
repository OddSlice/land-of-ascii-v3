// Things that stand on the ground and are drawn in their own depth-tested
// pass: conifers in two loose stands, a handful of bushes, the torch.
import { hash2 } from './noise.js';
import { LOOK } from '../look.js';
import { SEED, STANDS, BUSHES, TORCH, WALL, WATER } from './layout.js';
import { lakeDist, roadDist } from './terrain.js';

// Height of the true ground at (x, z), bilinear between nodes.
export function groundAt(T, x, z) {
  const ground = T.ground, NN = T.NN, top = T.N - 0.001;
  const i = Math.max(0, Math.min(top, x)), k = Math.max(0, Math.min(top, z));
  const i0 = Math.floor(i), k0 = Math.floor(k), fx = i - i0, fz = k - k0;
  const j = k0 * NN + i0;
  const a = ground[j], b = ground[j + 1], c = ground[j + NN], d = ground[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Floats per tier: bottom and top height, radius at the bottom and at the
// top, the tier's shift off the trunk (x, z; treatment B), the sector of a
// notch (-1: none) and its depth, and the top of a tier cut short (= top
// when it is not).
export const TIER = 9;

// A conifer from its identity `s`: everything about its shape comes from it.
// It carries both treatments' tiers, so the look can be switched live.
// `narrow` scales the crown: trees grown close together are narrower.
export function conifer(x, z, base, s, tall = 1, narrow = 1) {
  const r = (n) => hash2(s, n, SEED + 31);
  const P = LOOK.trees, PB = P.B;
  const lerp = ([a, b], f) => a + (b - a) * f;
  const h = lerp(P.height, r(1)) * tall * (r(11) < P.emergent[0] ? P.emergent[1] : 1);
  const R = lerp(P.crown, r(2)) * narrow;
  const c0 = h * lerp(P.bare, r(3));                    // bare trunk up to the crown
  const T = P.tiers[0] + Math.floor((P.tiers[1] - P.tiers[0] + 1) * r(4) * 0.999);
  const la = r(7) * Math.PI * 2, lean = P.lean * r(6);
  const span = h - c0;
  const env = (f) => R * Math.pow(1 - f, 0.9) + 0.22;
  const A = [], B = [];
  for (let t = 0; t < T; t++) {
    const f0 = t / T, f1 = Math.min(1, (t + 1.5) / T);
    const ya = base + c0 + f0 * span, yb = base + c0 + f1 * span;
    const last = t === T - 1;
    A.push(ya, yb, env(f0) * (0.92 + 0.16 * r(10 + t)), last ? 0.1 : env(f0) * 0.3, 0, 0, -1, 0, yb);
    // B: uneven reach, shifted off the axis, some cut short, some notched
    const cut = !last && r(50 + t) < PB.gaps ? 0.35 + 0.25 * r(55 + t) : 1;
    const off = R * PB.asym * r(80 + t), oa = r(90 + t) * Math.PI * 2;
    const notch = r(100 + t) < PB.notches;
    B.push(ya, yb, env(f0) * (0.76 + 0.44 * r(60 + t)), last ? 0.1 : env(f0) * (0.22 + 0.22 * r(70 + t)),
      Math.cos(oa) * off, Math.sin(oa) * off, notch ? r(105 + t) * PB.sectors : -1, notch ? 0.45 + 0.4 * r(110 + t) : 0,
      ya + (yb - ya) * cut);
  }
  return {
    x, z, base, top: base + h, R: R + 0.4, trunkTop: base + c0 + 0.6,
    trunkR: lerp(P.trunk, r(5)), tierH: 1.5 * span / T,
    leanX: Math.cos(la) * lean, leanZ: Math.sin(la) * lean,
    tone: r(8) * 2 - 1, bark: r(9) * 2 - 1,
    tiers: Float32Array.from(A), tiersB: Float32Array.from(B), seed: s,
  };
}

// Where the ground is forest floor: under and just round the crowns of the
// trees (255 under a crown, fading out a metre or so past it).
export function floorField(terrain, trees) {
  const { N, NN } = terrain;
  const w = new Uint8Array(NN * NN);
  for (const t of trees) {
    const R = t.R + 3.2;
    for (let z = Math.max(0, Math.floor(t.z - R)); z <= Math.min(N, Math.ceil(t.z + R)); z++) {
      for (let x = Math.max(0, Math.floor(t.x - R)); x <= Math.min(N, Math.ceil(t.x + R)); x++) {
        const d = Math.hypot(x - t.x, z - t.z);
        if (d >= R) continue;
        let f = (R - d) / 3; f = f > 1 ? 1 : f;
        const v = (f * f * (3 - 2 * f) * 255 + 0.5) | 0;
        const j = z * NN + x;
        if (v > w[j]) w[j] = v;
      }
    }
  }
  return w;
}

export function buildObjects(terrain) {
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
      trees.push(conifer(x, z, groundAt(terrain, x, z) - 0.3, s * 1000 + placed, st.tall || 1));
      placed++;
    }
    s++;
  }

  const bushes = BUSHES.map(([x, z], n) => {
    const r = (m) => hash2(n, m, SEED + 51);
    return { x, z, base: groundAt(terrain, x, z), rx: 1.0 + 0.7 * r(1), ry: 0.75 + 0.5 * r(2), seed: n };
  });

  const torch = { x: TORCH.x, z: TORCH.z, base: groundAt(terrain, TORCH.x, TORCH.z), h: TORCH.height, phase: 0 };
  torch.flameY = torch.base + torch.h + 0.18;

  return { trees, bushes, torches: [torch], water: WATER };
}
