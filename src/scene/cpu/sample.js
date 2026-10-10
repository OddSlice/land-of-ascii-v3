// Bilinear sampling on the grids' nodes.

export function bil(level, x, z) { return bil2(level, level.H, x, z); }

export function bil2(level, arr, x, z) {
  const n = level.n, nn = n + 1, s = level.size;
  let u = x / s, w = z / s;
  if (u < 0) u = 0; else if (u > n - 1e-6) u = n - 1e-6;
  if (w < 0) w = 0; else if (w > n - 1e-6) w = n - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * nn + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + nn], d = arr[j + nn + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// A level's copy of a 0..255 weight (the generated world's water, roads and
// sand far off), as 0..1.
export function bil2U8(level, arr, x, z) {
  const n = level.n, nn = n + 1, s = level.size;
  let u = x / s, w = z / s;
  if (u < 0) u = 0; else if (u > n - 1e-6) u = n - 1e-6;
  if (w < 0) w = 0; else if (w > n - 1e-6) w = n - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * nn + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + nn], d = arr[j + nn + 1];
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) / 255;
}

// bil2 for a level's shadow (floats in the lab, bytes in the world).
export function bil2S(level, arr, x, z) {
  const n = level.n, nn = n + 1, s = level.size;
  let u = x / s, w = z / s;
  if (u < 0) u = 0; else if (u > n - 1e-6) u = n - 1e-6;
  if (w < 0) w = 0; else if (w > n - 1e-6) w = n - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * nn + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + nn], d = arr[j + nn + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function bil1(arr, x, z, N, NN) {
  let u = x, w = z;
  if (u < 0) u = 0; else if (u > N - 1e-6) u = N - 1e-6;
  if (w < 0) w = 0; else if (w > N - 1e-6) w = N - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * NN + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + NN], d = arr[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// The same, kept apart per kind of array, so each compiled function only
// ever reads one kind (a function that reads several runs slower in some
// engines): bilU8 for the material weights (0..255, returned as 0..1), bilD
// for the detail fields (floats in the lab, small integers in the world).
export function bilU8(arr, x, z, N, NN) {
  let u = x, w = z;
  if (u < 0) u = 0; else if (u > N - 1e-6) u = N - 1e-6;
  if (w < 0) w = 0; else if (w > N - 1e-6) w = N - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * NN + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + NN], d = arr[j + NN + 1];
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) / 255;
}

export function bilD(arr, x, z, N, NN) {
  let u = x, w = z;
  if (u < 0) u = 0; else if (u > N - 1e-6) u = N - 1e-6;
  if (w < 0) w = 0; else if (w > N - 1e-6) w = N - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * NN + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + NN], d = arr[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
