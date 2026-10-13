// The resolve step: HitBuffer -> CellBuffer.
//
// For every cell it takes what the ray hit and turns it into one glyph, one
// background and one foreground colour, using only src/look.js:
// - the background is the surface's colour under the light that reaches it
//   (between its shade and lit colours), with detail, torchlight and haze;
// - the glyph comes from the material's family, its rung picked by that light
//   (brighter surface, lighter mark), never from the finished colour;
// - the glyph is inked a little darker or lighter than the background.
// It reads nothing but its own cell, except that a faint flame is blended
// with the next cell up (or down) its own column; stripes never touch.
import { LOOK } from './look.js';
import { MAT, MAT_NAMES, MAT_COUNT, MAT_NONE, MAT_SHELTER, MAT_FAINT, HIT_STRIDE, REC, CELL_STRIDE } from './contract.js';
import { FAMILY, SHADE_STEPS, RAIN_GLYPHS } from './glyphs.js';
import { weatherParams } from './weather.js';
import { sunDir, moonDir, moonDirOn, moonLit } from './world/sky.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16 - 0.5);

// Every colour-like value of a keyframe as a flat list of numbers, so
// keyframes can be blended without knowing their shape.
function flatten(key) {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(...hex(v));
    else if (typeof v === 'number') out.push(v);
    else for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(key);
  return out;
}
function unflatten(shape, flat) {
  let i = 0;
  const walk = (v) => {
    if (typeof v === 'string') { const c = [flat[i], flat[i + 1], flat[i + 2]]; i += 3; return c; }
    if (typeof v === 'number') return flat[i++];
    const o = {};
    for (const k of Object.keys(v)) o[k] = walk(v[k]);
    return o;
  };
  return walk(shape);
}
const KEYS = ['day', 'dusk', 'night'].map((k) => flatten(LOOK.keys[k]));
// the night rule 'moon' (phase 2a): day, dawn, its dusk, and night under a bright and a dark moon
const MKEYS = [LOOK.keys.day, LOOK.moonKeys.dawn, LOOK.moonKeys.dusk, LOOK.moonKeys.moonlit, LOOK.moonKeys.starlit].map(flatten);

// How much of each keyframe applies at an hour, from the sun's height.
export function keyWeights(hour) {
  const el = Math.asin(sunDir(hour)[1]) * 180 / Math.PI;
  const day = smooth(4, 16, el);
  const night = smooth(-4, -13, el);
  return [day, Math.max(0, 1 - day - night), night];
}

// The same under the night rule 'moon': twilight is dawn in the morning and
// dusk in the evening; night is moonlit by how much of the moon is lit and
// how high it is, else starlit.
export function moonWeights(hour, day) {
  const [d, tw, n] = keyWeights(hour);
  const moon = moonDirOn(hour, day);
  const ml = moonLit(hour, day) * smooth(-0.05, 0.12, moon[1]);
  const am = hour < 12 ? 1 : 0;
  return [d, tw * am, tw * (1 - am), n * ml, n * (1 - ml)];
}

let cacheKey = null, cachePal = null;
const MIST = LOOK.weather.mist, RAIN = LOOK.weather.rain;

// How much of the sun and moon discs shows through the weather's cloud (1 in fair).
const discOf = (sun) => smooth(0.25, 0.9, sun);

// A keyframe under weather (phase 2b): the sky, the air, the clouds and the
// water's mirrored sky turn toward the keyframe's overcast colour by the
// weather's `grey` and dim by its `dim`; cloud tops darken toward their
// undersides by its `dark`.
function weatherKey(k, P) {
  const C = k.weather.cast, g = P.grey, dm = P.dim;
  const toward = (c, t, sh) => { for (let i = 0; i < 3; i++) c[i] = (c[i] + (t[i] - c[i]) * sh) * dm; };
  toward(k.sky.high, C, g); toward(k.sky.horizon, C, g); toward(k.sky.glow, C, g);
  toward(k.haze.colour, C, g); toward(k.water.sky, C, g);
  const cl = k.cloud;
  for (let i = 0; i < 3; i++) {
    cl.lit[i] += (cl.shade[i] - cl.lit[i]) * P.dark;
    cl.lit[i] = (cl.lit[i] + (C[i] * 1.03 - cl.lit[i]) * g * 0.9) * dm;
    cl.shade[i] = (cl.shade[i] + (C[i] * 0.86 - cl.shade[i]) * g * 0.9) * dm;
  }
}

// The palette for an hour, a day (the moon's phase), a night rule and the
// frame's weather (src/weather.js; none is fair).
export function makePalette(hour, day = 0, night = 'p1', weather = null) {
  const P = weatherParams(weather);
  const ck = (night === 'p1' ? `${hour}` : `${hour}|${day}`) + (P.fair ? '' : `|${P.mixKey}`);
  if (ck === cacheKey) return cachePal;
  let k, dirFade, illum = 1, L, nightShare;
  const sun = sunDir(hour);
  // (under cloud the moon's light does not get through: its night is starlit)
  const disc = P.fair ? 1 : discOf(P.sun);
  if (night === 'p1') {
    const w = keyWeights(hour);
    nightShare = w[2];
    const flat = KEYS[0].map((_, i) => KEYS[0][i] * w[0] + KEYS[1][i] * w[1] + KEYS[2][i] * w[2]);
    k = unflatten(LOOK.keys.day, flat);
    // the light that shades the ground fades out as it reaches the horizon
    const moon = moonDir(hour);
    L = sun[1] > -0.035 ? sun : moon;
    dirFade = smooth(-0.035, 0.06, L[1]);
  } else {
    const w = moonWeights(hour, day);
    if (!P.fair) { const m = w[3] * (1 - disc); w[3] -= m; w[4] += m; }
    nightShare = w[3] + w[4];
    const flat = MKEYS[0].map((_, i) => MKEYS[0][i] * w[0] + MKEYS[1][i] * w[1] + MKEYS[2][i] * w[2] + MKEYS[3][i] * w[3] + MKEYS[4][i] * w[4]);
    k = unflatten(LOOK.keys.day, flat);
    const moon = moonDirOn(hour, day);
    illum = moonLit(hour, day);
    // sunlight fades out as the sun sets; moonlight fades in only as the
    // twilight deepens (and as the moon rises), so the change from one to
    // the other never flashes
    if (sun[1] > -0.035) { L = sun; dirFade = smooth(-0.035, 0.06, sun[1]); }
    else { L = moon; dirFade = smooth(-0.035, -0.15, sun[1]) * smooth(-0.035, 0.06, moon[1]); }
  }
  if (!P.fair) weatherKey(k, P);
  const lit = new Float32Array(MAT_COUNT * 3), shade = new Float32Array(MAT_COUNT * 3);
  for (let m = 0; m < MAT_COUNT; m++) {
    const e = k[MAT_NAMES[m]];
    if (e && e.lit) { lit.set(e.lit, m * 3); shade.set(e.shade, m * 3); }
    else if (Array.isArray(e)) { lit.set(e, m * 3); shade.set(e, m * 3); }
  }
  const mats = MAT_NAMES.map((n) => LOOK.materials[n]);
  // the weather's light: the direct light that gets through, what is held
  // back returning as soft light from the sky, softer shadows, darker nights
  const ambient = P.fair ? k.light.ambient
    : (k.light.ambient + k.light.direct * dirFade * (1 - P.sun) * P.skylight) * (1 + (P.night - 1) * nightShare);
  // the mist's strength: it thins as the sun climbs
  const elDeg = Math.asin(Math.max(-1, Math.min(1, sun[1]))) * 180 / Math.PI;
  cachePal = {
    k, lit, shade, dirFade, night, illum,
    // the air's two shares by tau, as tables (aerial perspective)
    airT: airTables(k),
    // the flat ground's share of direct light (the far rule's pivot)
    flat: Math.max(0.035, L[1]),
    ambient, direct: P.fair ? k.light.direct * dirFade : k.light.direct * dirFade * P.sun,
    cloudK: P.fair ? k.light.cloudShadow : k.light.cloudShadow * P.cloudShadow,
    // the share of direct light far land keeps (phase 2b: little at dusk)
    farSun: k.light.far,
    castK: P.fair ? k.light.castShadow : k.light.castShadow * P.cast,
    // the weather (phase 2b): its numbers, how much of the sun and moon
    // discs shows, the mist's density (per metre) and colour, the rain's colour
    wp: P, disc, mistK: P.mist > 0 ? MIST.density * P.mist * (1 - smooth(MIST.sun[0], MIST.sun[1], elDeg)) : 0,
    mistC: k.weather.mist, rainC: k.weather.rain,
    inkLit: Float32Array.from(mats.map((m) => m.ink.lit)),
    inkDark: Float32Array.from(mats.map((m) => m.ink.dark)),
    toneAmp: Float32Array.from(mats.map((m) => m.tone || 0)),
    emissive: Uint8Array.from(mats.map((m) => (m.emissive ? 1 : 0))),
    curve: Float32Array.from(mats.map((m) => m.curve || LOOK.curve)),
    inkFloor: hex(LOOK.inkFloor),
    toneRung: Float32Array.from(mats.map((m) => (m.toneRung !== undefined ? m.toneRung : LOOK.toneRung))),
    water: LOOK.water || {},
  };
  cacheKey = ck;
  return cachePal;
}

const C = LOOK.clamp;
const out3 = [0, 0, 0];

// Clamp a colour: no channel under C.min or over C.max, saturation capped.
function clampColour(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx > 1 && (mx - mn) / mx > C.maxSat) {
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    const den = (mx - mn) - C.maxSat * (mx - l);
    const k = den > 1e-6 ? C.maxSat * l / den : 0;
    r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k;
  }
  out3[0] = r < C.min ? C.min : r > C.max ? C.max : r;
  out3[1] = g < C.min ? C.min : g > C.max ? C.max : g;
  out3[2] = b < C.min ? C.min : b > C.max ? C.max : b;
  return out3;
}

// Sky colour for an elevation (0 horizon .. 1 zenith) and an angle from the sun.
function skyColour(pal, el, sunAng, o) {
  const s = pal.k.sky;
  const f = 1 - Math.pow(1 - el, 3.2);
  let r = s.horizon[0] + (s.high[0] - s.horizon[0]) * f;
  let g = s.horizon[1] + (s.high[1] - s.horizon[1]) * f;
  let b = s.horizon[2] + (s.high[2] - s.horizon[2]) * f;
  const gl = Math.exp(-sunAng / Math.max(0.02, s.glowSize)) * 0.85 * (1 - 0.5 * el);
  r += (s.glow[0] - r) * gl; g += (s.glow[1] - g) * gl; b += (s.glow[2] - b) * gl;
  o[0] = r; o[1] = g; o[2] = b;
}

const sky3 = [0, 0, 0];

// Aerial perspective (air 'aerial'): the air a ray passes through on its way
// out of the eye at height y0, rising at mu (the sine of its elevation) for
// d metres, in metres of air as dense as at LOOK.air.base. Air thins with
// height as exp(-(y - base) / height), plus a thin share the same everywhere.
const AIR = LOOK.air, FAR = LOOK.far, INTERIOR = LOOK.interior;
// (1 - e^-x) / x, from a table between -8 and 8 (64 steps a unit), exactly beyond
const XT = new Float64Array(1025);
for (let i = 0; i <= 1024; i++) { const x = i / 64 - 8; XT[i] = Math.abs(x) < 1e-9 ? 1 : (1 - Math.exp(-x)) / x; }
function grow(x) {
  if (x <= -8 || x >= 8) return (1 - Math.exp(-x)) / x;
  const f = (x + 8) * 64, i = f | 0, t = f - i;
  return XT[i] + (XT[i + 1] - XT[i]) * t;
}
// the density at a height, from a table every half metre up to 1,200 m above the base
const DT = new Float64Array(2402);
for (let i = 0; i < 2402; i++) { const b = Math.exp(-(i / 2 - 1 - 0) / AIR.height); DT[i] = b > 1.5 ? 1.5 : b; }
const densityAt = (y0) => {
  const f = (y0 - AIR.base + 1) * 2;
  if (f <= 0 || f >= 2401) { const b = Math.exp(-(y0 - AIR.base) / AIR.height); return b > 1.5 ? 1.5 : b; }
  const i = f | 0;
  return DT[i] + (DT[i + 1] - DT[i]) * (f - i);
};
// (`base`: the density at y0, when the caller already has it.) Under the
// weather (phase 2b) the air is thicker or thinner (`wDen`, times) and its
// height profile deeper or shallower (`wHt`, metres).
let wAir = false, wDen = 1, wHt = AIR.height;
const densityW = (y0) => { const b = Math.exp(-(y0 - AIR.base) / wHt); return b > 1.5 ? 1.5 : b; };
function airOf(y0, mu, d, base) {
  if (wAir) { if (base === undefined) base = densityW(y0); return wDen * (base * d * grow(mu * d / wHt) + AIR.uniform * d); }
  if (base === undefined) base = densityAt(y0);
  return base * d * grow(mu * d / AIR.height) + AIR.uniform * d;
}

// The mist (phase 2b, LOOK.weather.mist) a ray passes through, in metres of
// full-density mist: its height above the mist's floor goes from r0 at the
// eye to r1 at its end, d metres on (straight between them). The mist is
// full up to `depth` above the floor and thins above it over `height` metres.
function mistOf(r0, r1, d) {
  if (d <= 0) return 0;
  const a = r0 - MIST.depth, b = r1 - MIST.depth, Hm = MIST.height;
  if (a <= 0 && b <= 0) return d;
  if (a >= 0 && b >= 0) {
    const c = b - a;
    if (c > -1e-3 && c < 1e-3) return d * Math.exp(-(a + b) / (2 * Hm));
    return d * Hm / c * (Math.exp(-a / Hm) - Math.exp(-b / Hm));
  }
  // part of the way in the full mist, the rest rising (or falling) out of it
  const top = a > b ? a : b, above = d * (top / (top - (a > b ? b : a)));
  return d - above + above * Hm / top * (1 - Math.exp(-top / Hm));
}
// The same for a ray that goes on for ever, rising at mu from r0 (the floor
// taken as level from the eye on); one that does not rise is taken 2 km.
function mistSky(r0, mu) {
  if (mu < 0.02) return mistOf(r0, r0 + mu * 2000, 2000);
  const a = r0 - MIST.depth;
  return a <= 0 ? -a / mu + MIST.height / mu : MIST.height / mu * Math.exp(-a / MIST.height);
}

// The mist's floor at a point: the ground smoothed over its surroundings,
// raised on high ground (a grid built with the world, `env.mist`).
function floorAt(F, x, z) {
  const n = F.n, s = F.size;
  let u = x / s, w = z / s;
  if (u < 0) u = 0; else if (u > n - 1e-6) u = n - 1e-6;
  if (w < 0) w = 0; else if (w > n - 1e-6) w = n - 1e-6;
  const i0 = u | 0, k0 = w | 0, fx = u - i0, fz = w - k0, nn = n + 1, j = k0 * nn + i0, A = F.F;
  const a = A[j], b = A[j + 1], c = A[j + nn], e = A[j + nn + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + e) * fx * fz;
}

// The two shares of a keyframe's air by tau, from tables 8 m apart out to
// 12 km (made with each palette), exactly beyond them.
const TAU_STEP = 8, TAU_N = 1536;
function airTables(k) {
  const A = k.air, hl = new Float64Array(TAU_N + 1), hc = new Float64Array(TAU_N + 1);
  for (let i = 0; i <= TAU_N; i++) { const t = i * TAU_STEP; hl[i] = A.lum * (1 - Math.exp(-t / A.dist)); hc[i] = A.chroma * (1 - Math.exp(-t / A.distC)); }
  return { hl, hc, A };
}

// Mix a colour toward the horizon tone by `tau` metres of air: colour
// shifts by the keyframe's `chroma` share, light and dark close up only by
// its `lum` share. Fills rec.r/g/b and returns the light share (for glyphs).
// `ck`: how much of the colour shift applies (phase 2b: less on high lit ground).
function airMix(pal, r, g, b, tau, ck = 1) {
  const H = pal.k.haze.colour, T = pal.airT;
  let hl, hc;
  const f = tau / TAU_STEP;
  if (f < TAU_N) { const i = f | 0, t = f - i; hl = T.hl[i] + (T.hl[i + 1] - T.hl[i]) * t; hc = T.hc[i] + (T.hc[i + 1] - T.hc[i]) * t; }
  else { hl = T.A.lum * (1 - Math.exp(-tau / T.A.dist)); hc = T.A.chroma * (1 - Math.exp(-tau / T.A.distC)); }
  if (ck !== 1) hc *= ck;
  const dy = (hl - hc) * ((0.3 * H[0] + 0.59 * H[1] + 0.11 * H[2]) - (0.3 * r + 0.59 * g + 0.11 * b));
  rec.r = r + (H[0] - r) * hc + dy; rec.g = g + (H[1] - g) * hc + dy; rec.b = b + (H[2] - b) * hc + dy;
  return hl;
}

// the materials of the ground, whose large forms the far rule strengthens
const FORM = new Uint8Array(32);
for (const m of [MAT.GRASS, MAT.DIRT, MAT.SAND, MAT.ROCK, MAT.SNOW, MAT.FLOOR]) FORM[m] = 1;
// how much rain darkens a material (phase 2b; foliage less, snow and the
// already wet bed not at all), and the stripe's wetness: how much darker wet
// ground is, how much sky it mirrors
const WETM = new Float32Array(64);
for (const m of [MAT.GRASS, MAT.DIRT, MAT.SAND, MAT.ROCK, MAT.STONE, MAT.FLOOR, MAT.TRUNK, MAT.WOOD, MAT.TIMBER, MAT.PLASTER, MAT.ROOF, MAT.YARD, MAT.MASONRY]) WETM[m] = 1;
// (phase 4a: the villages' materials, which phase 3b left dry by mistake, and
// people's clothes, which darken a little less than stone)
for (const m of [MAT.THATCH, MAT.PLASTER2, MAT.PLASTER3, MAT.TIMBER2, MAT.TIMBER3, MAT.CROP, MAT.STUBBLE, MAT.FALLOW]) WETM[m] = 1;
for (const m of [MAT.HAIR, MAT.LINEN, MAT.RUSSET, MAT.OCHRE, MAT.MOSS, MAT.SLATE, MAT.UMBER, MAT.CHARCOAL, MAT.LEATHER]) WETM[m] = 0.7;
WETM[MAT.SKIN] = 0.3; WETM[MAT.SKIN2] = 0.3; WETM[MAT.IRON] = 0.5;
WETM[MAT.CONIFER] = 0.5; WETM[MAT.BUSH] = 0.5;
let wetDark = 0, wetSheen = 0;
// the rules of the stripe being resolved: air (aerial perspective and the
// far-land rules) and the air a record's ray passed through (-1: phase 1's haze)
let airOn = false;

// The colour of one record of a HitBuffer (any material). Fills `rec` with
// r, g, b, the brightness that picks a rung, and the haze share. A cloud
// record's edge is returned as its coverage in `rec.cover` with the sky
// behind it in `rec.sky*`, so each caller can draw the edge its own way.
const rec = { r: 0, g: 0, b: 0, bright: 0, h: 0, cover: 1, skyR: 0, skyG: 0, skyB: 0 };
// the look candidates of the stripe being resolved (set by resolveStripe)
let grassHue = 0, blueShallows = false;
// `mu`: for a direct view, the sine of the ray's elevation (wet ground
// mirrors the sky at low angles); 2 for any other record. `y`: the height of
// what was hit, where known (far lit ground high up keeps its colour).
// (`amb`, phase 3a: the share of the soft light that reaches a surface
// inside a building, from its R2's MAT_SHELTER record)
function recordColour(pal, hits, o, tau = -1, mu = 2, y = NaN, amb = 1) {
  const { lit, shade, k } = pal;
  const haze = k.haze, torch = k.torch;
  const m = hits[o];
  let light = hits[o + 1] / 255;
  const sh = hits[o + 2] / 255, cl = hits[o + 3] / 255, gl = hits[o + 4] / 255;
  const toneB = hits[o + 5];
  const dist = (hits[o + 6] | (hits[o + 7] << 8)) / 10;
  let r, g, b, bright, h = 0;
  rec.cover = 1;
  if (m === MAT.SKY || m === MAT.STAR) {
    // (a star keeps the sky's closeness to the sun in [3], phase 2b, so its
    // cell carries the glow round a low sun like the sky beside it)
    skyColour(pal, light, (1 - (m === MAT.SKY ? toneB : cl * 255) / 255) * Math.PI, sky3);
    r = sky3[0]; g = sky3[1]; b = sky3[2];
    bright = m === MAT.STAR ? k.stars * (toneB / 255) : 1;
  } else if (m === MAT.CLOUD) {
    const c = k.cloud;
    r = c.shade[0] + (c.lit[0] - c.shade[0]) * light;
    g = c.shade[1] + (c.lit[1] - c.shade[1]) * light;
    b = c.shade[2] + (c.lit[2] - c.shade[2]) * light;
    h = haze.max * (1 - Math.exp(-dist / (haze.dist * 9)));
    r += (haze.colour[0] - r) * h; g += (haze.colour[1] - g) * h; b += (haze.colour[2] - b) * h;
    bright = light;
    const cover = toneB / 255;
    if (cover < 0.92) {
      skyColour(pal, sh, (1 - cl) * Math.PI, sky3);
      rec.cover = cover; rec.skyR = sky3[0]; rec.skyG = sky3[1]; rec.skyB = sky3[2];
    }
  } else if (m === MAT.WINDOW) {
    // (phase 3a) a window: a dark opening by day, lit from within at night by
    // the keyframe's `windowStrength`; (phase 4a) dark at any hour while
    // nobody inside is awake (its light 0; a fixed window is never 0)
    const j = m * 3, f = light <= 0 ? 0 : pal.k.windowStrength * (0.85 + 0.15 * light);
    r = shade[j] + (lit[j] - shade[j]) * f; g = shade[j + 1] + (lit[j + 1] - shade[j + 1]) * f; b = shade[j + 2] + (lit[j + 2] - shade[j + 2]) * f;
    bright = f;
  } else if (m === MAT.SUN || m === MAT.MOON || m === MAT.FLAME) {
    const c = m === MAT.SUN ? k.sun : m === MAT.MOON ? k.moon : k.flame;
    // (under the night rule 'moon' the moon is as bright as its lit share)
    const f = m === MAT.FLAME ? 0.75 + 0.25 * light : m === MAT.MOON && pal.night !== 'p1' ? light : 1;
    r = c[0] * f; g = c[1] * f; b = c[2] * f;
    // (behind the weather's cloud the sun and moon fade into the sky round them)
    if (pal.disc < 1 && m !== MAT.FLAME) { const s = k.sky.glow, d = pal.disc; r = s[0] + (r - s[0]) * d; g = s[1] + (g - s[1]) * d; b = s[2] + (b - s[2]) * d; }
    bright = light;
  } else {
    // a lit surface; far away (the far rule) the large forms gain contrast
    // about the flat ground's light, as the fine detail fades
    if (tau >= 0 && FORM[m]) {
      const f = smooth(FAR.fade[0], FAR.fade[1], dist);
      if (f > 0) { light = pal.flat + (light - pal.flat) * (1 + FAR.form * f); if (light < 0) light = 0; else if (light > 1) light = 1; }
    }
    // (at dusk far land loses its direct light: a silhouette, phase 2b)
    const dk = tau >= 0 && pal.farSun < 1 ? 1 - (1 - pal.farSun) * smooth(FAR.fade[0], FAR.fade[1], dist) : 1;
    const L = pal.ambient * amb + pal.direct * dk * light * (1 - pal.castK * sh) * (1 - pal.cloudK * cl);
    const t0 = L < 0 ? 0 : L > 1 ? 1 : L;
    const t = Math.pow(t0, pal.curve[m]);
    const j = m * 3;
    r = shade[j] + (lit[j] - shade[j]) * t;
    g = shade[j + 1] + (lit[j + 1] - shade[j + 1]) * t;
    b = shade[j + 2] + (lit[j + 2] - shade[j + 2]) * t;
    if (m === MAT.WATER) {
      const fr = 0.85 * toneB / 255;
      const ws = k.water.sky;
      r += (ws[0] - r) * fr; g += (ws[1] - g) * fr; b += (ws[2] - b) * fr;
    } else {
      const tn = (toneB - 128) / 127;
      const tk = 1 + pal.toneAmp[m] * tn;
      r *= tk; g *= tk; b *= tk;
      if (m === MAT.GRASS && grassHue > 0) {
        // meadow mottling: tone also turns the green drier or lusher, more so in the light
        const to = tn > 0 ? k.grassDry : k.grassLush, f = (tn > 0 ? tn : -tn) * grassHue * t, j0 = m * 3;
        r += (to[0] - lit[j0]) * f; g += (to[1] - lit[j0 + 1]) * f; b += (to[2] - lit[j0 + 2]) * f;
      }
    }
    // (inside a building, phase 3a: darker where little soft light reaches,
    // and lit by its torches at least as strongly as LOOK.interior.torch)
    let ts = torch.strength;
    if (amb < 1) {
      const kk = INTERIOR.dark + (1 - INTERIOR.dark) * amb;
      r *= kk; g *= kk; b *= kk;
      if (INTERIOR.torch > ts) ts += (INTERIOR.torch - ts) * (1 - amb);
    }
    const tg = gl * ts;
    r += torch.colour[0] * tg; g += torch.colour[1] * tg; b += torch.colour[2] * tg;
    // wet ground (phase 2b): darker, and seen low it mirrors a little sky
    if (wetDark > 0 && WETM[m] > 0) {
      const wk = 1 - wetDark * WETM[m];
      r *= wk; g *= wk; b *= wk;
      if (mu < 1.5) {
        const q = 1 - (mu < 0 ? -mu : mu), f = wetSheen * WETM[m] * q * q * q * q, hz = k.sky.horizon;
        r += (hz[0] - r) * f; g += (hz[1] - g) * f; b += (hz[2] - b) * f;
      }
    }
    if (tau >= 0) {
      // (high lit ground keeps more of its colour against the air's, phase 2b)
      const ck = FORM[m] && y === y ? 1 - FAR.warm[0] * smooth(FAR.warm[1], FAR.warm[2], y - AIR.base) * t0 : 1;
      h = airMix(pal, r, g, b, tau, ck); r = rec.r; g = rec.g; b = rec.b;
    }
    else {
      h = haze.max * (1 - Math.exp(-dist / haze.dist));
      r += (haze.colour[0] - r) * h; g += (haze.colour[1] - g) * h; b += (haze.colour[2] - b) * h;
    }
    bright = t0 + tg * 2.5 + pal.toneRung[m] * ((toneB - 128) / 127);
    if (bright > 1) bright = 1; else if (bright < 0) bright = 0;
  }
  rec.r = r; rec.g = g; rec.b = b; rec.bright = bright; rec.h = h;
  return m;
}

// A water cell from its three records: the mirror (R1) and the bed seen
// through the water (R2), mixed by the Fresnel share (R0's tone); then the
// surface's own torchlight and haze. Fills `rec` like recordColour.
function waterColour(pal, hits, o, ey = 0, mu = 0) {
  const k = pal.k, W = pal.water, haze = k.haze;
  const F = hits[o + 5] / 255;
  const dist = (hits[o + 6] | (hits[o + 7] << 8)) / 10;
  // the mirror (with aerial perspective, over its own leg up from the water)
  const leg1 = (hits[o + REC + 6] | (hits[o + REC + 7] << 8)) / 10;
  const tau1 = airOn ? airOf(ey + mu * dist, -mu, leg1) : -1;
  recordColour(pal, hits, o + REC, tau1, 2, ey + mu * (dist - leg1));
  let mr = rec.r, mg = rec.g, mb = rec.b;
  if (rec.cover < 1) {
    // a reflected cloud's edge melts into the reflected sky
    mr = rec.skyR + (mr - rec.skyR) * rec.cover; mg = rec.skyG + (mg - rec.skyG) * rec.cover; mb = rec.skyB + (mb - rec.skyB) * rec.cover;
  }
  if (rainDull > 0) {
    // rain breaks far reflections past what a cell can show: they dull
    // toward the air's colour
    const f = rainDull * smooth(RAIN.dullDist[0], RAIN.dullDist[1], dist), hc = haze.colour;
    mr += (hc[0] - mr) * f; mg += (hc[1] - mg) * f; mb += (hc[2] - mb) * f;
  }
  if (mistOn) {
    // the mist over the water veils its mirror too, over the mirrored ray's leg
    const m1 = hits[o + REC], leg = (hits[o + REC + 6] | (hits[o + REC + 7] << 8)) / 10;
    const t = mistK * (m1 <= MAT.STAR ? mistSky(waterRel, -mu) : mistOf(waterRel, waterRel - mu * leg, leg));
    const sh = 1 - Math.exp(-t), mc = pal.mistC;
    mr += (mc[0] - mr) * sh; mg += (mc[1] - mg) * sh; mb += (mc[2] - mb) * sh;
  }
  const mBright = hits[o + REC] === MAT.SUN || hits[o + REC] === MAT.MOON ? 1 : rec.bright;
  // foam at the waterline (phase 2a): its record stands in for the bed's,
  // which is taken as sand under the same light, at the same depth
  const o2 = o + 2 * REC;
  let foam = 0;
  if (hits[o2] === MAT.FOAM) {
    foam = hits[o2 + 5] / 255;
    hits[o2 + 5] = 128;
    hits[o2] = (hits[o2 + 6] | hits[o2 + 7]) ? MAT.SAND : MAT_NONE;
  }
  // the bed, darkened and tinted by the water it is seen through
  let br, bg, bb, bBright;
  if (hits[o + 2 * REC] !== MAT_NONE) {
    recordColour(pal, hits, o + 2 * REC, airOn ? 0 : -1);
    const path = (hits[o + 2 * REC + 6] | (hits[o + 2 * REC + 7] << 8)) / 10;
    // warm: the bed shows through the shallows, tinted toward the deep
    // colour with depth; blue: an even blue, the bed only in the last half metre
    const a = blueShallows ? smooth(0, W.blueDepth, path) : Math.max(W.tint, 1 - Math.exp(-path / W.absorb));
    const sh = 1 - pal.castK * (hits[o + 2] / 255) * 0.5;
    const deep = blueShallows ? k.water.blue : k.water.deep, shal = k.water.shallow;
    // shallow water warms the bed a little, deeper water takes it to the deep colour
    br = (rec.r + (shal[0] - rec.r) * W.warm) * sh; bg = (rec.g + (shal[1] - rec.g) * W.warm) * sh; bb = (rec.b + (shal[2] - rec.b) * W.warm) * sh;
    br += (deep[0] - br) * a; bg += (deep[1] - bg) * a; bb += (deep[2] - bb) * a;
    bBright = rec.bright * (1 - a);
  } else {
    const deep = blueShallows ? k.water.blue : k.water.deep;
    br = deep[0]; bg = deep[1]; bb = deep[2]; bBright = 0.2;
  }
  let r = br + (mr - br) * F, g = bg + (mg - bg) * F, b = bb + (mb - bb) * F;
  let fBright = 0;
  if (foam > 0) {
    // the foam over it, lit as the surface
    const L = pal.ambient + pal.direct * (hits[o2 + 1] / 255) * (1 - pal.castK * hits[o2 + 2] / 255) * (1 - pal.cloudK * hits[o2 + 3] / 255);
    const t = Math.pow(L < 0 ? 0 : L > 1 ? 1 : L, pal.curve[MAT.FOAM]), j = MAT.FOAM * 3, lit = pal.lit, sh = pal.shade;
    r += (sh[j] + (lit[j] - sh[j]) * t - r) * foam; g += (sh[j + 1] + (lit[j + 1] - sh[j + 1]) * t - g) * foam; b += (sh[j + 2] + (lit[j + 2] - sh[j + 2]) * t - b) * foam;
    fBright = t;
  }
  // torchlight on the surface
  const tg = (hits[o + 4] / 255) * k.torch.strength * W.torchSurface;
  r += k.torch.colour[0] * tg; g += k.torch.colour[1] * tg; b += k.torch.colour[2] * tg;
  // haze over the way to the surface
  let h;
  if (airOn) { h = airMix(pal, r, g, b, airOf(ey, mu, dist)); r = rec.r; g = rec.g; b = rec.b; }
  else {
    h = haze.max * (1 - Math.exp(-dist / haze.dist));
    r += (haze.colour[0] - r) * h; g += (haze.colour[1] - g) * h; b += (haze.colour[2] - b) * h;
  }
  let bright = bBright + (mBright - bBright) * F + tg * 2.5;
  if (foam > 0) bright += (fBright - bright) * foam;
  if (bright > 1) bright = 1; else if (bright < 0) bright = 0;
  rec.r = r; rec.g = g; rec.b = b; rec.bright = bright; rec.h = h; rec.cover = 1;
  return foam >= 0.5 ? MAT.FOAM : MAT.WATER;
}

// A cell a skyline covers only in part (the far rule): R1 is what lies
// behind (sky, cloud or a far ridgeline) with, in its [4], the share of the
// cell the land in R0 covers. The colours blend by that share; the glyph is
// the one of whichever covers more. Fills `rec`; returns that material.
function fringeColour(pal, hits, o, ey, mu) {
  const cov = hits[o + REC + 4] / 255;
  hits[o + REC + 4] = 0;
  const m1 = hits[o + REC];
  const d1 = (hits[o + REC + 6] | (hits[o + REC + 7] << 8)) / 10;
  recordColour(pal, hits, o + REC, airOn && m1 > MAT.STAR && m1 !== MAT.CLOUD ? airOf(ey, mu, d1) : -1, 2, ey + mu * d1);
  let br = rec.r, bg = rec.g, bb = rec.b;
  if (rec.cover < 1) { br = rec.skyR + (br - rec.skyR) * rec.cover; bg = rec.skyG + (bg - rec.skyG) * rec.cover; bb = rec.skyB + (bb - rec.skyB) * rec.cover; }
  const bBright = rec.bright, bh = rec.h;
  const m0 = hits[o];
  const d0 = (hits[o + 6] | (hits[o + 7] << 8)) / 10;
  recordColour(pal, hits, o, airOn ? airOf(ey, mu, d0) : -1, 2, ey + mu * d0);
  rec.r = br + (rec.r - br) * cov; rec.g = bg + (rec.g - bg) * cov; rec.b = bb + (rec.b - bb) * cov;
  rec.h = bh + (rec.h - bh) * cov; rec.cover = 1;
  if (cov >= 0.5) return m0;
  rec.bright = bBright;
  return m1;
}

let faint = new Int32Array(256), faintW = new Float32Array(256);
// the stripe's mist (phase 2b): on, its strength, and the height above the
// mist's floor of the water a water cell's mirror is seen in
let mistOn = false, mistK = 0, waterRel = 0, rainDull = 0;
// the stripe's rain streaks, per cell: strength (0: none), glyph
let rainS = new Float32Array(0), rainG = new Uint8Array(0);

// Rain (phase 2b, LOOK.weather.rain): the streaks round the eye, fixed to
// the world and falling with the clock, projected into the cells of this
// stripe (each stripe projects them all and keeps its own columns, so a cell
// never depends on its stripe). A streak shows only in front of what the
// cell's ray hit; where several cross a cell the strongest wins.
function rainStreaks(frame, P, hits, c0, sw, rows) {
  const n = sw * rows;
  if (rainS.length < n) { rainS = new Float32Array(n); rainG = new Uint8Array(n); }
  rainS.fill(0, 0, n);
  const cam = frame.cam, W = frame.cols, R = rows;
  const ty = Math.tan(frame.fovY / 2), tx = ty * frame.aspect;
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
  const ex = cam.x, ey = cam.y, ez = cam.z, t = frame.t;
  const V = RAIN.speed, sx = P.wind[0] / V, sz = P.wind[1] / V;
  const reach = RAIN.reach, g = RAIN.spacing, per = RAIN.period, len = RAIN.length;
  const strength = RAIN.strength * P.rain;
  // a column's drops fall along a slanted line fixed to the world, which at
  // height y stands at (u - sx y, w - sz y) for the column's (u, w)
  const ue = ex + sx * ey, we = ez + sz * ey;
  const i0 = Math.floor((ue - reach) / g), i1 = Math.ceil((ue + reach) / g);
  const k0 = Math.floor((we - reach) / g), k1 = Math.ceil((we + reach) / g);
  const ylo = ey - 6, yhi = ey + 12;
  // the streak's length along its fall
  const vl = Math.sqrt(sx * sx + 1 + sz * sz), lx = sx / vl * len, ly = len / vl, lz = sz / vl * len;
  const proj = (x, y, z, out) => {
    const rx = x - ex, ry = y - ey, rz = z - ez;
    const a = rx * cy - rz * sy, b = rx * sy + rz * cy;
    const cz = b * cp + ry * sp, cyv = ry * cp - b * sp;
    out[0] = (a / cz / tx + 1) / 2 * W; out[1] = (1 - cyv / cz / ty) / 2 * R; out[2] = cz;
  };
  const A = [0, 0, 0], B = [0, 0, 0];
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const u = (i + 0.1 + 0.8 * hash01(i, k, 1)) * g, w = (k + 0.1 + 0.8 * hash01(i, k, 2)) * g;
      // (the drop falls at V; its heads are `per` apart along the column)
      const ph = hash01(i, k, 3) * per + V * t;
      const q0 = Math.ceil((ylo + ph) / per), q1 = Math.floor((yhi + ph) / per);
      for (let q = q0; q <= q1; q++) {
        const y = q * per - ph, x = u - sx * y, z = w - sz * y;
        const dx = x - ex, dy = y - ey, dz = z - ez, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < RAIN.near || d > reach) continue;
        const st = strength * smooth(RAIN.near, RAIN.near * 1.8, d) * (1 - smooth(reach * 0.55, reach, d));
        if (st <= 0.01) continue;
        // the head and the tail above it, back along its fall
        proj(x, y, z, A); proj(x + lx, y + ly, z + lz, B);
        if (A[2] < 0.3 || B[2] < 0.3) continue;
        const dX = A[0] - B[0], dY = A[1] - B[1];
        // (on screen a row is two columns' width tall)
        const lean = dY > 1e-6 ? dX / (2 * dY) : 0;
        const gl = lean > 0.3 ? RAIN_GLYPHS[2] : lean < -0.3 ? RAIN_GLYPHS[1] : RAIN_GLYPHS[0];
        const steps = Math.ceil(Math.max(Math.abs(dX), Math.abs(dY))) + 1;
        for (let m = 0; m < steps; m++) {
          const f = steps > 1 ? m / (steps - 1) : 0.5;
          const X = Math.floor(B[0] + dX * f), Y = Math.floor(B[1] + dY * f);
          if (X < c0 || X >= c0 + sw || Y < 0 || Y >= R) continue;
          const ci = Y * sw + (X - c0);
          if (st <= rainS[ci]) continue;
          // only in front of what the cell's ray hit
          const o = ci * HIT_STRIDE, hd = hits[o + 6] | (hits[o + 7] << 8);
          if (hd !== 65535 && d >= hd / 10) continue;
          rainS[ci] = st; rainG[ci] = gl;
        }
      }
    }
  }
}
const hash01 = (i, k, n) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(k | 0, 668265263) ^ Math.imul(n + 0x3c6ef372, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// Resolve a stripe. `hits` and `cells` cover columns c0..c0+sw-1, all rows.
// `frame` is the frame description (src/contract.js); a call without one
// (the overhead map passes the look alone) resolves with phase 1's haze.
// `env`: what the world gives resolve besides the frame (phase 2b: the mist's
// floor, `env.mist`); without it there is no mist.
export function resolveStripe(pal, hits, cells, sw, rows, c0, frame, env = null) {
  const viewed = !!(frame && frame.cam);
  const look = viewed ? frame.look : frame;
  const dither = LOOK.dither, glyphFade = LOOK.haze.glyphFade;
  airOn = viewed && (look && look.air ? look.air : LOOK.choices.air.default) === 'aerial';
  // the weather (phase 2b): thicker or thinner air, wet ground, mist, rain
  // (from the frame: the palette is shared by frames whose ground may be
  // wetter or drier)
  const P = viewed ? weatherParams(frame.weather) : pal.wp;
  wAir = airOn && !P.fair && (P.air[0] !== 1 || P.air[1] !== 1);
  wDen = P.air[0]; wHt = AIR.height * P.air[1];
  wetDark = P.wetness > 0 ? P.wetness * P.wet[0] : 0; wetSheen = P.wetness * P.wet[1];
  mistK = pal.mistK;
  mistOn = viewed && mistK > 0 && !!(env && env.mist);
  const rainOn = viewed && P.rain > 0;
  rainDull = rainOn ? RAIN.dull * P.rain : 0;
  // every cell's ray, from the frame by the contract's own formula: its
  // elevation (as a sine) and the eye's height
  let ey = 0, tx = 0, ty = 0, cp = 1, sp = 0, W = 1, base0 = 1, cyw = 1, syw = 0, ex = 0, ez = 0, relE = 0;
  if (airOn || mistOn) {
    const cam = frame.cam;
    ey = cam.y; ty = Math.tan(frame.fovY / 2); tx = ty * frame.aspect; cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch); W = frame.cols;
    base0 = wAir ? densityW(ey) : densityAt(ey);
    cyw = Math.cos(cam.yaw); syw = Math.sin(cam.yaw); ex = cam.x; ez = cam.z;
    if (mistOn) relE = ey - floorAt(env.mist, ex, ez);
  }
  if (rainOn) rainStreaks(frame, P, hits, c0, sw, rows);
  const mc = pal.mistC, rc = pal.rainC;
  const [ifr, ifg, ifb] = pal.inkFloor;
  const flameK = pal.k.flameStrength, flameP = LOOK.flameFade, flameF = pal.k.flameFloor;
  grassHue = look ? LOOK.meadow.hue[look.meadow] || 0 : 0;
  blueShallows = !!(look && look.shallows === 'blue');
  let nf = 0;
  for (let cy = 0; cy < rows; cy++) {
    const yb = (1 - 2 * (cy + 0.5) / rows) * ty, bRow = cp - yb * sp, up = yb * cp + sp;
    for (let q = 0; q < sw; q++) {
      const i = cy * sw + q, o = i * HIT_STRIDE, oc = i * CELL_STRIDE;
      const cx = c0 + q;
      const m = hits[o];
      let mu = 0, a = 0, ln = 1;
      if (airOn || mistOn) {
        // (the sine of the ray's elevation: its slope over the length of its direction)
        a = (2 * (cx + 0.5) / W - 1) * tx;
        ln = Math.sqrt(a * a + bRow * bRow + up * up);
        mu = up / ln;
      }
      // the mist between the eye and what the ray hit (and, for water, the
      // height of the water above the mist's floor, for its mirror)
      let ms = 0;
      if (mistOn) {
        let tm;
        if (m <= MAT.STAR) tm = mistSky(relE, mu);
        else {
          const d0 = (hits[o + 6] | (hits[o + 7] << 8)) / 10, hx = a * cyw + bRow * syw, hz = -a * syw + bRow * cyw;
          const rel = ey + mu * d0 - floorAt(env.mist, ex + hx / ln * d0, ez + hz / ln * d0);
          if (m === MAT.WATER) waterRel = rel;
          tm = mistOf(relE, rel, d0);
        }
        ms = 1 - Math.exp(-mistK * tm);
      }
      const mirrorFlame = m === MAT.WATER && (hits[o + REC] === MAT.FLAME || hits[o + REC] === MAT.WINDOW);
      let gm = m;
      if (m === MAT.WATER && hits[o + REC] !== MAT_NONE) gm = waterColour(pal, hits, o, ey, mu);
      else if (hits[o + REC] !== MAT_NONE) gm = fringeColour(pal, hits, o, ey, mu);
      else {
        const d0 = (hits[o + 6] | (hits[o + 7] << 8)) / 10;
        recordColour(pal, hits, o, airOn && m > MAT.STAR && m !== MAT.CLOUD ? airOf(ey, mu, d0, base0) : -1, airOn ? mu : 2, airOn ? ey + mu * d0 : NaN,
          hits[o + 2 * REC] === MAT_SHELTER ? hits[o + 2 * REC + 1] / 255 : 1);
      }
      if (m === MAT.FLAME || m === MAT.WINDOW || mirrorFlame) {
        // a flame held at its minimum size, or any flame by day: blended
        // with what is behind it once every other cell is done (a window,
        // phase 3a: by how much of its drawn size it really is, its
        // brightness already the keyframe's)
        const lm = hits[o + (mirrorFlame ? REC : 0)], cov = Math.pow(hits[o + (mirrorFlame ? REC : 0) + 5] / 255, flameP);
        const w = lm === MAT.WINDOW ? cov : (flameF + (1 - flameF) * cov) * flameK;
        if (w < 0.999) {
          if (nf >= faint.length) { const a = new Int32Array(nf * 2); a.set(faint); faint = a; const b = new Float32Array(nf * 2); b.set(faintW); faintW = b; }
          faint[nf] = mirrorFlame ? -1 - i : i; faintW[nf] = w; nf++;
        }
      } else if (hits[o + 2 * REC] === MAT_FAINT) {
        // (phase 4a) a far figure: by how much of its drawn size it really is
        const w = hits[o + 2 * REC + 1] / 255;
        if (w < 0.999) {
          if (nf >= faint.length) { const a = new Int32Array(nf * 2); a.set(faint); faint = a; const b = new Float32Array(nf * 2); b.set(faintW); faintW = b; }
          faint[nf] = i; faintW[nf] = w; nf++;
        }
      }
      if (m === MAT.CLOUD && rec.cover < 0.92) {
        // the edge: sky behind, the cloud in a shade block over it
        const cover = rec.cover;
        const step = cover < 0.42 ? 0 : cover < 0.7 ? 1 : 2;
        let sr = rec.skyR, sg = rec.skyG, sb = rec.skyB, fr = rec.r, fg = rec.g, fb = rec.b;
        if (ms > 0) { sr += (mc[0] - sr) * ms; sg += (mc[1] - sg) * ms; sb += (mc[2] - sb) * ms; fr += (mc[0] - fr) * ms; fg += (mc[1] - fg) * ms; fb += (mc[2] - fb) * ms; }
        const bc = clampColour(sr, sg, sb);
        cells[oc] = bc[0]; cells[oc + 1] = bc[1]; cells[oc + 2] = bc[2]; cells[oc + 3] = SHADE_STEPS[step];
        if (rainOn && rainS[i] > 0) { cells[oc + 3] = rainG[i]; fr = bc[0] + (rc[0] - bc[0]) * rainS[i]; fg = bc[1] + (rc[1] - bc[1]) * rainS[i]; fb = bc[2] + (rc[2] - bc[2]) * rainS[i]; }
        const fc = clampColour(fr, fg, fb);
        cells[oc + 4] = fc[0]; cells[oc + 5] = fc[1]; cells[oc + 6] = fc[2]; cells[oc + 7] = 0;
        continue;
      }
      let r = rec.r, g = rec.g, b = rec.b, h = rec.h;
      const bright = rec.bright;
      if (ms > 0) { r += (mc[0] - r) * ms; g += (mc[1] - g) * ms; b += (mc[2] - b) * ms; h = 1 - (1 - h) * (1 - ms); }
      // glyph: the rung of the family's ladder
      const fam = FAMILY[gm];
      const n = fam.length;
      let rung;
      if (pal.emissive[gm]) rung = Math.round(bright * (n - 1));
      else rung = Math.floor((1 - bright) * (n - 1) + 0.5 + BAYER[(cy & 3) * 4 + (cx & 3)] * dither);
      if (rung < 0) rung = 0; else if (rung > n - 1) rung = n - 1;
      let glyph = fam[rung];
      // ink: a tint of the background, darker on lit ground, lighter in the dark
      let ink = pal.inkDark[gm] + (pal.inkLit[gm] - pal.inkDark[gm]) * bright;
      ink *= 1 - h * glyphFade;
      if (gm === MAT.STAR && bright < 0.06) { glyph = 0; ink = 0; }
      // (a sun or moon fading behind cloud loses its mark with it)
      if ((gm === MAT.SUN || gm === MAT.MOON) && pal.disc < 1) ink *= pal.disc;
      const bg = clampColour(r, g, b);
      const br = bg[0], bgG = bg[1], bb = bg[2];
      cells[oc] = br; cells[oc + 1] = bgG; cells[oc + 2] = bb; cells[oc + 3] = glyph;
      let fr, fg, fb;
      if (rainOn && rainS[i] > 0) {
        // a rain streak in front: its glyph, inked toward the rain's colour
        const st = rainS[i];
        cells[oc + 3] = rainG[i];
        fr = br + (rc[0] - br) * st; fg = bgG + (rc[1] - bgG) * st; fb = bb + (rc[2] - bb) * st;
      } else { fr = br + ink * (br > ifr ? br : ifr); fg = bgG + ink * (bgG > ifg ? bgG : ifg); fb = bb + ink * (bb > ifb ? bb : ifb); }
      const fc = clampColour(fr, fg, fb);
      cells[oc + 4] = fc[0]; cells[oc + 5] = fc[1]; cells[oc + 6] = fc[2]; cells[oc + 7] = 0;
    }
  }
  // Faint flames: what is behind a flame is the next cell up its column that
  // is not flame (down, for a flame seen in the water, which hangs upside
  // down). The column is in this stripe, so stripes still never touch.
  for (let k = 0; k < nf; k++) {
    const mirror = faint[k] < 0, i = mirror ? -1 - faint[k] : faint[k], w = faintW[k];
    const q = i % sw, cy = (i - q) / sw;
    let j = -1;
    for (let d = 1; d <= 8; d++) {
      const y = mirror ? cy + d : cy - d;
      if (y < 0 || y >= rows) break;
      const jj = y * sw + q, oj = jj * HIT_STRIDE;
      const lj = hits[oj] === MAT.WATER ? hits[oj + REC] : hits[oj];
      const isFlame = lj === MAT.FLAME || lj === MAT.WINDOW || hits[oj + 2 * REC] === MAT_FAINT;
      if (!isFlame) { j = jj; break; }
    }
    const oc = i * CELL_STRIDE;
    let nb;
    if (j >= 0) nb = cells.subarray(j * CELL_STRIDE, j * CELL_STRIDE + 8);
    else { const hc = clampColour(pal.k.haze.colour[0], pal.k.haze.colour[1], pal.k.haze.colour[2]); nb = [hc[0], hc[1], hc[2], 0, hc[0], hc[1], hc[2], 0]; }
    for (const c of [0, 1, 2, 4, 5, 6]) cells[oc + c] = Math.round(nb[c] + (cells[oc + c] - nb[c]) * w);
    if (w < LOOK.flameMark) cells[oc + 3] = nb[3];
  }
}
