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
import { vnoise } from '../../world/noise.js';
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
export function rippleSlope(x, z, t, dx, dz, footprint) {
  if (footprint >= LONGEST * FADE1) return 0;    // every wave faded: calm
  const bend = W.ripple.irregular * (vnoise(x / 4.3, z / 3.7, SEED + 97) + 0.6 * vnoise(x / 1.7, z / 1.9, SEED + 98));
  let s = 0;
  for (let i = 0, q = 0; i < NW; i++, q += 6) {
    const kx = WV[q], kz = WV[q + 1], w = WV[q + 2], amp = WV[q + 3], len = WV[q + 4];
    const fade = 1 - smooth(len * FADE0, len * FADE1, footprint);
    if (fade <= 0) continue;
    const ph = kx * x + kz * z - w * t + bend * (1 + i);
    s += amp * fade * Math.cos(ph) * (kx * dx + kz * dz) / WV[q + 5];
  }
  return s;
}

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
