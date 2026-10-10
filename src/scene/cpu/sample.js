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

export function bil1(arr, x, z, N, NN) {
  let u = x, w = z;
  if (u < 0) u = 0; else if (u > N - 1e-6) u = N - 1e-6;
  if (w < 0) w = 0; else if (w > N - 1e-6) w = N - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0;
  const j = k0 * NN + i0;
  const a = arr[j], b = arr[j + 1], c = arr[j + NN], d = arr[j + NN + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

export function bilU8(arr, x, z, N, NN) { return bil1(arr, x, z, N, NN) / 255; }
