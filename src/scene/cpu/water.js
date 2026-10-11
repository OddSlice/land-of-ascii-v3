// Water optics for the CPU backend: the ripple field, and the reflected and
// refracted rays of a water cell.
//
// The ripple field is a pure function of world position and time (a few
// travelling waves with their phases bent by a little noise), so with the
// clocks frozen the picture repeats exactly, and turning the camera never
// makes reflections swim. Ripples do not draw anything themselves: they tilt
// the surface normal, which tilts both rays.
//
// A level surface keeps a reflected or refracted ray in the vertical plane of
// the incoming one, so both stay inside the plane march. Only the tilt along
// the plane is used: it moves reflections up and down per column, which is
// what breaks a mirrored treeline into wavering strips.
import { LOOK } from '../../look.js';
import { vnoise, hash2 } from '../../world/noise.js';
import { SEED } from '../../world/layout.js';

const W = LOOK.water;
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// Waves as [k x-component, k z-component, angular speed, slope amplitude,
// length, |k|], also flat in WV (6 numbers a wave) for the hot loop.
const WAVES = W.ripple.waves.map(([len, deg, speed, height]) => {
  const k = 2 * Math.PI / len, a = deg * Math.PI / 180;
  const kx = k * Math.cos(a), kz = k * Math.sin(a);
  return [kx, kz, k * speed, height * k * W.ripple.strength, len, Math.hypot(kx, kz)];
});
const WV = Float64Array.from(WAVES.flat()), NW = WAVES.length;

// The steepest the ripples can tilt the surface, for culling margins.
export const MAX_RIPPLE = WAVES.reduce((a, w) => a + Math.abs(w[3]), 0);
const LONGEST = WAVES.reduce((a, w) => Math.max(a, w[4]), 0);
const [FADE0, FADE1] = W.ripple.fade;

// The slope of the ripples along a horizontal direction (dx, dz) at (x, z),
// time t, with waves shorter than the cell's footprint faded out so distant
// water lies calm instead of sparkling.
// `longK` (phase 2b): how much of the waves longer than LOOK.weather.rain.calm[0]
// is left (rain beats them down).
const CALM = LOOK.weather.rain.calm[0];
export function rippleSlope(x, z, t, dx, dz, footprint, longK = 1) {
  if (footprint >= LONGEST * FADE1) return 0;    // every wave faded: calm
  const bend = W.ripple.irregular * (vnoise(x / 4.3, z / 3.7, SEED + 97) + 0.6 * vnoise(x / 1.7, z / 1.9, SEED + 98));
  let s = 0;
  for (let i = 0, q = 0; i < NW; i++, q += 6) {
    const kx = WV[q], kz = WV[q + 1], w = WV[q + 2], amp = WV[q + 3], len = WV[q + 4];
    const fade = 1 - smooth(len * FADE0, len * FADE1, footprint);
    if (fade <= 0) continue;
    const ph = kx * x + kz * z - w * t + bend * (1 + i);
    const k = longK !== 1 && len > CALM ? longK : 1;
    s += amp * fade * k * Math.cos(ph) * (kx * dx + kz * dz) / WV[q + 5];
  }
  return s;
}

// The open sea's swell (phase 2a, LOOK.coast.swell): long waves running
// onshore, the same way, faded as a cell's footprint passes LOOK.coast.swellFade
// of their length (so the far sea lies calm and meets the sky softly).
const SW = LOOK.coast.swell.map(([len, deg, speed, height]) => {
  const k = 2 * Math.PI / len, a = deg * Math.PI / 180;
  return [k * Math.cos(a), k * Math.sin(a), k * speed, height * k, len];
});
const SWF = LOOK.coast.swellFade;
export function swellSlope(x, z, t, dx, dz, footprint) {
  let s = 0;
  for (let i = 0; i < SW.length; i++) {
    const [kx, kz, w, amp, len] = SW[i];
    const fade = 1 - smooth(len * SWF[0], len * SWF[1], footprint);
    if (fade <= 0) continue;
    s += amp * fade * Math.cos(kx * x + kz * z - w * t + i * 1.7) * (kx * dx + kz * dz) / Math.hypot(kx, kz);
  }
  return s;
}

// Rain on water (phase 2b, LOOK.weather.rain.rings): where drops land the
// surface is tilted by many small spreading rings, one in every square of
// `size` metres, at a place and moment fixed to the square, every `period`
// seconds; each a ridge `width` wide, spreading at `speed` and dying away. The
// slope along (dx, dz), faded as a cell's footprint passes a ring's size, so
// they show only near the eye and far rain on water reads as a calm grey.
const RG = LOOK.weather.rain.rings;
export function ringSlope(x, z, t, dx, dz, footprint) {
  const R = RG.speed * RG.period, fade = 1 - smooth(RG.width, R, footprint);
  if (fade <= 0) return 0;
  const S = RG.size, gx = Math.floor(x / S), gz = Math.floor(z / S);
  let s = 0;
  for (let k = -1; k <= 1; k++) {
    for (let i = -1; i <= 1; i++) {
      const cx = gx + i, cz = gz + k;
      const px = (cx + 0.15 + 0.7 * hash2(cx, cz, SEED + 171)) * S, pz = (cz + 0.15 + 0.7 * hash2(cx, cz, SEED + 172)) * S;
      const ox = x - px, oz = z - pz, d = Math.sqrt(ox * ox + oz * oz);
      if (d > R + 2 * RG.width) continue;
      const age = ((t / RG.period + hash2(cx, cz, SEED + 173)) % 1 + 1) % 1;
      const r = age * R, u = (d - r) / RG.width;
      if (u > 2 || u < -2) continue;
      // the ridge's slope across it, along the ray
      const g = -2 * u * Math.exp(-u * u) * RG.slope * (1 - age) * (1 - age);
      s += d > 1e-6 ? g * (ox * dx + oz * dz) / d : 0;
    }
  }
  return s * fade;
}

// How far rain's rings may tilt the mirrored and refracted rays (phase 2b),
// and the steepest the swell can tilt the sea, for culling margins.
export const RING_TILT = RG.tilt;
export const MAX_SWELL = SW.reduce((a, w) => a + Math.abs(w[3]), 0);

const out = { sr: 0, st: 0, F: 0 };

// For an incoming ray of slope sigma (negative, looking down) meeting water
// whose surface slopes by g along the ray: the reflected slope (up), the
// refracted slope (down), and the Fresnel share of the mirror.
export function waterRays(sigma, g) {
  const len = Math.sqrt(1 + sigma * sigma);
  const iu = 1 / len, iy = sigma / len;            // incoming direction in the plane
  const nl = Math.sqrt(1 + g * g);
  const nu = -g / nl, ny = 1 / nl;                 // tilted normal
  const cosi = -(iu * nu + iy * ny);               // > 0
  // reflection
  let ru = iu + 2 * cosi * nu, ry = iy + 2 * cosi * ny;
  if (ru < 0.05) ru = 0.05;
  if (ry < 0.002 * ru) ry = 0.002 * ru;
  out.sr = ry / ru;
  // refraction (Snell)
  const eta = 1 / W.ior;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  const c2 = Math.sqrt(k > 0 ? k : 0);
  let tu = eta * iu + (eta * cosi - c2) * nu, ty = eta * iy + (eta * cosi - c2) * ny;
  if (tu < 0.02) tu = 0.02;
  if (ty > -0.02) ty = -0.02;
  out.st = ty / tu;
  // Fresnel (Schlick)
  const f = W.fresnel.r0 + (1 - W.fresnel.r0) * Math.pow(1 - Math.max(0, Math.min(1, cosi)), W.fresnel.power);
  out.F = f < W.fresnel.max ? f : W.fresnel.max;
  return out;
}
