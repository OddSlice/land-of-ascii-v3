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
import { MAT, MAT_NAMES, MAT_COUNT, MAT_NONE, HIT_STRIDE, REC, CELL_STRIDE } from './contract.js';
import { FAMILY, SHADE_STEPS } from './glyphs.js';
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

// The palette for an hour, a day (the moon's phase) and a night rule.
export function makePalette(hour, day = 0, night = 'p1') {
  const ck = night === 'p1' ? hour : `${hour}|${day}`;
  if (ck === cacheKey) return cachePal;
  let k, dirFade, illum = 1, L;
  const sun = sunDir(hour);
  if (night === 'p1') {
    const w = keyWeights(hour);
    const flat = KEYS[0].map((_, i) => KEYS[0][i] * w[0] + KEYS[1][i] * w[1] + KEYS[2][i] * w[2]);
    k = unflatten(LOOK.keys.day, flat);
    // the light that shades the ground fades out as it reaches the horizon
    const moon = moonDir(hour);
    L = sun[1] > -0.035 ? sun : moon;
    dirFade = smooth(-0.035, 0.06, L[1]);
  } else {
    const w = moonWeights(hour, day);
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
  const lit = new Float32Array(MAT_COUNT * 3), shade = new Float32Array(MAT_COUNT * 3);
  for (let m = 0; m < MAT_COUNT; m++) {
    const e = k[MAT_NAMES[m]];
    if (e && e.lit) { lit.set(e.lit, m * 3); shade.set(e.shade, m * 3); }
    else if (Array.isArray(e)) { lit.set(e, m * 3); shade.set(e, m * 3); }
  }
  const mats = MAT_NAMES.map((n) => LOOK.materials[n]);
  cachePal = {
    k, lit, shade, dirFade, night, illum,
    // the air's two shares by tau, as tables (aerial perspective)
    airT: airTables(k),
    // the flat ground's share of direct light (the far rule's pivot)
    flat: Math.max(0.035, L[1]),
    ambient: k.light.ambient, direct: k.light.direct * dirFade,
    cloudK: k.light.cloudShadow, castK: k.light.castShadow,
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
const AIR = LOOK.air, FAR = LOOK.far;
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
// (`base`: the density at y0, when the caller already has it)
function airOf(y0, mu, d, base = densityAt(y0)) {
  return base * d * grow(mu * d / AIR.height) + AIR.uniform * d;
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
function airMix(pal, r, g, b, tau) {
  const H = pal.k.haze.colour, T = pal.airT;
  let hl, hc;
  const f = tau / TAU_STEP;
  if (f < TAU_N) { const i = f | 0, t = f - i; hl = T.hl[i] + (T.hl[i + 1] - T.hl[i]) * t; hc = T.hc[i] + (T.hc[i + 1] - T.hc[i]) * t; }
  else { hl = T.A.lum * (1 - Math.exp(-tau / T.A.dist)); hc = T.A.chroma * (1 - Math.exp(-tau / T.A.distC)); }
  const dy = (hl - hc) * ((0.3 * H[0] + 0.59 * H[1] + 0.11 * H[2]) - (0.3 * r + 0.59 * g + 0.11 * b));
  rec.r = r + (H[0] - r) * hc + dy; rec.g = g + (H[1] - g) * hc + dy; rec.b = b + (H[2] - b) * hc + dy;
  return hl;
}

// the materials of the ground, whose large forms the far rule strengthens
const FORM = new Uint8Array(32);
for (const m of [MAT.GRASS, MAT.DIRT, MAT.SAND, MAT.ROCK, MAT.SNOW, MAT.FLOOR]) FORM[m] = 1;
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
function recordColour(pal, hits, o, tau = -1) {
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
    skyColour(pal, light, m === MAT.SKY ? (1 - toneB / 255) * Math.PI : Math.PI, sky3);
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
  } else if (m === MAT.SUN || m === MAT.MOON || m === MAT.FLAME) {
    const c = m === MAT.SUN ? k.sun : m === MAT.MOON ? k.moon : k.flame;
    // (under the night rule 'moon' the moon is as bright as its lit share)
    const f = m === MAT.FLAME ? 0.75 + 0.25 * light : m === MAT.MOON && pal.night !== 'p1' ? light : 1;
    r = c[0] * f; g = c[1] * f; b = c[2] * f;
    bright = light;
  } else {
    // a lit surface; far away (the far rule) the large forms gain contrast
    // about the flat ground's light, as the fine detail fades
    if (tau >= 0 && FORM[m]) {
      const f = smooth(FAR.fade[0], FAR.fade[1], dist);
      if (f > 0) { light = pal.flat + (light - pal.flat) * (1 + FAR.form * f); if (light < 0) light = 0; else if (light > 1) light = 1; }
    }
    const L = pal.ambient + pal.direct * light * (1 - pal.castK * sh) * (1 - pal.cloudK * cl);
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
    const tg = gl * torch.strength;
    r += torch.colour[0] * tg; g += torch.colour[1] * tg; b += torch.colour[2] * tg;
    if (tau >= 0) { h = airMix(pal, r, g, b, tau); r = rec.r; g = rec.g; b = rec.b; }
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
  const tau1 = airOn ? airOf(ey + mu * dist, -mu, (hits[o + REC + 6] | (hits[o + REC + 7] << 8)) / 10) : -1;
  recordColour(pal, hits, o + REC, tau1);
  let mr = rec.r, mg = rec.g, mb = rec.b;
  if (rec.cover < 1) {
    // a reflected cloud's edge melts into the reflected sky
    mr = rec.skyR + (mr - rec.skyR) * rec.cover; mg = rec.skyG + (mg - rec.skyG) * rec.cover; mb = rec.skyB + (mb - rec.skyB) * rec.cover;
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
  recordColour(pal, hits, o + REC, airOn && m1 > MAT.STAR && m1 !== MAT.CLOUD ? airOf(ey, mu, d1) : -1);
  let br = rec.r, bg = rec.g, bb = rec.b;
  if (rec.cover < 1) { br = rec.skyR + (br - rec.skyR) * rec.cover; bg = rec.skyG + (bg - rec.skyG) * rec.cover; bb = rec.skyB + (bb - rec.skyB) * rec.cover; }
  const bBright = rec.bright, bh = rec.h;
  const m0 = hits[o];
  recordColour(pal, hits, o, airOn ? airOf(ey, mu, (hits[o + 6] | (hits[o + 7] << 8)) / 10) : -1);
  rec.r = br + (rec.r - br) * cov; rec.g = bg + (rec.g - bg) * cov; rec.b = bb + (rec.b - bb) * cov;
  rec.h = bh + (rec.h - bh) * cov; rec.cover = 1;
  if (cov >= 0.5) return m0;
  rec.bright = bBright;
  return m1;
}

let faint = new Int32Array(256), faintW = new Float32Array(256);

// Resolve a stripe. `hits` and `cells` cover columns c0..c0+sw-1, all rows.
// `frame` is the frame description (src/contract.js); a call without one
// (the overhead map passes the look alone) resolves with phase 1's haze.
export function resolveStripe(pal, hits, cells, sw, rows, c0, frame) {
  const viewed = !!(frame && frame.cam);
  const look = viewed ? frame.look : frame;
  const dither = LOOK.dither, glyphFade = LOOK.haze.glyphFade;
  airOn = viewed && (look && look.air ? look.air : LOOK.choices.air.default) === 'aerial';
  // every cell's ray, from the frame by the contract's own formula: its
  // elevation (as a sine) and the eye's height
  let ey = 0, tx = 0, ty = 0, cp = 1, sp = 0, W = 1, base0 = 1;
  if (airOn) {
    const cam = frame.cam;
    ey = cam.y; ty = Math.tan(frame.fovY / 2); tx = ty * frame.aspect; cp = Math.cos(cam.pitch); sp = Math.sin(cam.pitch); W = frame.cols;
    base0 = densityAt(ey);
  }
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
      let mu = 0;
      if (airOn) {
        // (the sine of the ray's elevation: its slope over the length of its direction)
        const a = (2 * (cx + 0.5) / W - 1) * tx;
        mu = up / Math.sqrt(a * a + bRow * bRow + up * up);
      }
      const mirrorFlame = m === MAT.WATER && hits[o + REC] === MAT.FLAME;
      let gm = m;
      if (m === MAT.WATER && hits[o + REC] !== MAT_NONE) gm = waterColour(pal, hits, o, ey, mu);
      else if (hits[o + REC] !== MAT_NONE) gm = fringeColour(pal, hits, o, ey, mu);
      else recordColour(pal, hits, o, airOn && m > MAT.STAR && m !== MAT.CLOUD ? airOf(ey, mu, (hits[o + 6] | (hits[o + 7] << 8)) / 10, base0) : -1);
      if (m === MAT.FLAME || mirrorFlame) {
        // a flame held at its minimum size, or any flame by day: blended
        // with what is behind it once every other cell is done
        const w = (flameF + (1 - flameF) * Math.pow(hits[o + (mirrorFlame ? REC : 0) + 5] / 255, flameP)) * flameK;
        if (w < 0.999) {
          if (nf >= faint.length) { const a = new Int32Array(nf * 2); a.set(faint); faint = a; const b = new Float32Array(nf * 2); b.set(faintW); faintW = b; }
          faint[nf] = mirrorFlame ? -1 - i : i; faintW[nf] = w; nf++;
        }
      }
      if (m === MAT.CLOUD && rec.cover < 0.92) {
        // the edge: sky behind, the cloud in a shade block over it
        const cover = rec.cover;
        const step = cover < 0.42 ? 0 : cover < 0.7 ? 1 : 2;
        const bc = clampColour(rec.skyR, rec.skyG, rec.skyB);
        cells[oc] = bc[0]; cells[oc + 1] = bc[1]; cells[oc + 2] = bc[2]; cells[oc + 3] = SHADE_STEPS[step];
        const fc = clampColour(rec.r, rec.g, rec.b);
        cells[oc + 4] = fc[0]; cells[oc + 5] = fc[1]; cells[oc + 6] = fc[2]; cells[oc + 7] = 0;
        continue;
      }
      const r = rec.r, g = rec.g, b = rec.b, bright = rec.bright, h = rec.h;
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
      const bg = clampColour(r, g, b);
      const br = bg[0], bgG = bg[1], bb = bg[2];
      cells[oc] = br; cells[oc + 1] = bgG; cells[oc + 2] = bb; cells[oc + 3] = glyph;
      const fr = br + ink * (br > ifr ? br : ifr), fg = bgG + ink * (bgG > ifg ? bgG : ifg), fb = bb + ink * (bb > ifb ? bb : ifb);
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
      const isFlame = hits[oj] === MAT.FLAME || (hits[oj] === MAT.WATER && hits[oj + REC] === MAT.FLAME);
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
