// The palette (src/resolve.js uses it): every colour of the look's
// keyframes blended for an hour, a day (the moon's phase) and the frame's
// weather, with the light's levels and the air's tables; kept while the
// same hour, day and weather come again.
import { LOOK } from './look.js';
import { MAT_NAMES, MAT_COUNT } from './contract.js';
import { weatherParams } from './weather.js';
import { sunDir, moonDirOn, moonLit } from './world/sky.js';

export const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

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
// the keyframes (phase 2a): day, dawn, dusk, and night under a bright and a dark moon
const MKEYS = [LOOK.keys.day, LOOK.moonKeys.dawn, LOOK.moonKeys.dusk, LOOK.moonKeys.moonlit, LOOK.moonKeys.starlit].map(flatten);

// How much of each keyframe applies at an hour, from the sun's height.
function keyWeights(hour) {
  const el = Math.asin(sunDir(hour)[1]) * 180 / Math.PI;
  const day = smooth(4, 16, el);
  const night = smooth(-4, -13, el);
  return [day, Math.max(0, 1 - day - night), night];
}

// How much each of the five keyframes applies (day, dawn, dusk, moonlit,
// starlit): twilight is dawn in the morning and dusk in the evening; night
// is moonlit by how much of the moon is lit and how high it is, else starlit.
export function moonWeights(hour, day) {
  const [d, tw, n] = keyWeights(hour);
  const moon = moonDirOn(hour, day);
  const ml = moonLit(hour, day) * smooth(-0.05, 0.12, moon[1]);
  const am = hour < 12 ? 1 : 0;
  return [d, tw * am, tw * (1 - am), n * ml, n * (1 - ml)];
}

let cacheKey = null, cachePal = null;
const MIST = LOOK.weather.mist;

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

// The palette for an hour, a day (the moon's phase) and the frame's weather
// (src/weather.js; none is fair).
export function makePalette(hour, day = 0, weather = null) {
  const P = weatherParams(weather);
  const ck = `${hour}|${day}` + (P.fair ? '' : `|${P.mixKey}`);
  if (ck === cacheKey) return cachePal;
  let dirFade, L;
  const sun = sunDir(hour);
  // (under cloud the moon's light does not get through: its night is starlit)
  const disc = P.fair ? 1 : discOf(P.sun);
  const w = moonWeights(hour, day);
  if (!P.fair) { const m = w[3] * (1 - disc); w[3] -= m; w[4] += m; }
  const nightShare = w[3] + w[4];
  const flat = MKEYS[0].map((_, i) => MKEYS[0][i] * w[0] + MKEYS[1][i] * w[1] + MKEYS[2][i] * w[2] + MKEYS[3][i] * w[3] + MKEYS[4][i] * w[4]);
  const k = unflatten(LOOK.keys.day, flat);
  const moon = moonDirOn(hour, day);
  const illum = moonLit(hour, day);
  // sunlight fades out as the sun sets; moonlight fades in only as the
  // twilight deepens (and as the moon rises), so the change from one to
  // the other never flashes
  if (sun[1] > -0.035) { L = sun; dirFade = smooth(-0.035, 0.06, sun[1]); }
  else { L = moon; dirFade = smooth(-0.035, -0.15, sun[1]) * smooth(-0.035, 0.06, moon[1]); }
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
    k, lit, shade, dirFade, illum,
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

// The two shares of a keyframe's air by tau, from tables 8 m apart out to
// 12 km (made with each palette), exactly beyond them.
export const TAU_STEP = 8, TAU_N = 1536;
function airTables(k) {
  const A = k.air, hl = new Float64Array(TAU_N + 1), hc = new Float64Array(TAU_N + 1);
  for (let i = 0; i <= TAU_N; i++) { const t = i * TAU_STEP; hl[i] = A.lum * (1 - Math.exp(-t / A.dist)); hc[i] = A.chroma * (1 - Math.exp(-t / A.distC)); }
  return { hl, hc, A };
}
