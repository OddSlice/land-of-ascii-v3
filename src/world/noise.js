// Deterministic hashing and value noise. The whole scene comes from these and
// a constant seed, so every thread builds the same world.

export function hash2(x, y, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash1(x, seed) {
  return hash2(x, 0x5bd1e995, seed);
}

// Smooth value noise, -1..1.
// (Phase 4a: the four corners' hashes share their parts, the same integers
// hash2 would make, so the result is identical; Firefox ran it slowly.)
export function vnoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const hs = Math.imul(seed | 0, 1442695041);
  const x0 = Math.imul(xi | 0, 374761393), x1 = Math.imul((xi + 1) | 0, 374761393);
  const y0 = Math.imul(yi | 0, 668265263) ^ hs, y1 = Math.imul((yi + 1) | 0, 668265263) ^ hs;
  let h = x0 ^ y0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; const a = (h >>> 0) / 4294967296;
  h = x1 ^ y0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; const b = (h >>> 0) / 4294967296;
  h = x0 ^ y1; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; const c = (h >>> 0) / 4294967296;
  h = x1 ^ y1; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; const d = (h >>> 0) / 4294967296;
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, y, seed, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// Ridged noise, 0..1, sharp crests.
export function ridged(x, y, seed, octaves = 3) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 211));
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum / norm;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
