// The resolve step: HitBuffer -> CellBuffer.
//
// For every cell it takes what the ray hit and turns it into one glyph, one
// background and one foreground colour, using only src/look.js:
// - the background is the surface's colour under the light that reaches it
//   (between its shade and lit colours), with detail, torchlight and haze;
// - the glyph comes from the material's family, its rung picked by that light
//   (brighter surface, lighter mark), never from the finished colour;
// - the glyph is inked a little darker or lighter than the background.
// It reads nothing but its own cell, so stripes never touch each other.
import { LOOK } from './look.js';
import { MAT, MAT_NAMES, MAT_COUNT, HIT_STRIDE, CELL_STRIDE } from './contract.js';
import { FAMILY, SHADE_STEPS } from './glyphs.js';
import { sunDir, moonDir } from './world/sky.js';

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

// How much of each keyframe applies at an hour, from the sun's height.
export function keyWeights(hour) {
  const el = Math.asin(sunDir(hour)[1]) * 180 / Math.PI;
  const day = smooth(4, 16, el);
  const night = smooth(-4, -13, el);
  return [day, Math.max(0, 1 - day - night), night];
}

let cacheHour = null, cachePal = null;

export function makePalette(hour) {
  if (hour === cacheHour) return cachePal;
  const w = keyWeights(hour);
  const flat = KEYS[0].map((_, i) => KEYS[0][i] * w[0] + KEYS[1][i] * w[1] + KEYS[2][i] * w[2]);
  const k = unflatten(LOOK.keys.day, flat);
  // the light that shades the ground fades out as it reaches the horizon
  const sun = sunDir(hour), moon = moonDir(hour);
  const L = sun[1] > -0.035 ? sun : moon;
  const dirFade = smooth(-0.035, 0.06, L[1]);
  const lit = new Float32Array(MAT_COUNT * 3), shade = new Float32Array(MAT_COUNT * 3);
  for (let m = 0; m < MAT_COUNT; m++) {
    const e = k[MAT_NAMES[m]];
    if (e && e.lit) { lit.set(e.lit, m * 3); shade.set(e.shade, m * 3); }
    else if (Array.isArray(e)) { lit.set(e, m * 3); shade.set(e, m * 3); }
  }
  const mats = MAT_NAMES.map((n) => LOOK.materials[n]);
  cachePal = {
    k, lit, shade, dirFade,
    ambient: k.light.ambient, direct: k.light.direct * dirFade,
    cloudK: k.light.cloudShadow, castK: k.light.castShadow,
    inkLit: Float32Array.from(mats.map((m) => m.ink.lit)),
    inkDark: Float32Array.from(mats.map((m) => m.ink.dark)),
    toneAmp: Float32Array.from(mats.map((m) => m.tone || 0)),
    emissive: Uint8Array.from(mats.map((m) => (m.emissive ? 1 : 0))),
    inkFloor: hex(LOOK.inkFloor),
  };
  cacheHour = hour;
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

// Resolve a stripe. `hits` and `cells` cover columns c0..c0+sw-1, all rows.
export function resolveStripe(pal, hits, cells, sw, rows, c0) {
  const { lit, shade, k } = pal;
  const dither = LOOK.dither, glyphFade = LOOK.haze.glyphFade, curve = LOOK.curve, toneRung = LOOK.toneRung;
  const haze = k.haze, torch = k.torch;
  const [ifr, ifg, ifb] = pal.inkFloor;
  for (let cy = 0; cy < rows; cy++) {
    for (let q = 0; q < sw; q++) {
      const i = cy * sw + q, o = i * HIT_STRIDE, oc = i * CELL_STRIDE;
      const cx = c0 + q;
      const m = hits[o];
      const light = hits[o + 1] / 255, sh = hits[o + 2] / 255, cl = hits[o + 3] / 255, gl = hits[o + 4] / 255;
      const toneB = hits[o + 5];
      const dist = (hits[o + 6] | (hits[o + 7] << 8)) / 10;
      let r, g, b, bright, h = 0;
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
          // the edge: sky behind, the cloud in a shade block over it
          skyColour(pal, sh, (1 - cl) * Math.PI, sky3);
          const step = cover < 0.42 ? 0 : cover < 0.7 ? 1 : 2;
          const bc = clampColour(sky3[0], sky3[1], sky3[2]);
          cells[oc] = bc[0]; cells[oc + 1] = bc[1]; cells[oc + 2] = bc[2]; cells[oc + 3] = SHADE_STEPS[step];
          const fc = clampColour(r, g, b);
          cells[oc + 4] = fc[0]; cells[oc + 5] = fc[1]; cells[oc + 6] = fc[2]; cells[oc + 7] = 0;
          continue;
        }
      } else if (m === MAT.SUN || m === MAT.MOON || m === MAT.FLAME) {
        const c = m === MAT.SUN ? k.sun : m === MAT.MOON ? k.moon : k.flame;
        const f = m === MAT.FLAME ? 0.75 + 0.25 * light : 1;
        r = c[0] * f; g = c[1] * f; b = c[2] * f;
        bright = light;
      } else {
        // a lit surface
        const L = pal.ambient + pal.direct * light * (1 - pal.castK * sh) * (1 - pal.cloudK * cl);
        const t0 = L < 0 ? 0 : L > 1 ? 1 : L;
        const t = Math.pow(t0, curve);
        const j = m * 3;
        r = shade[j] + (lit[j] - shade[j]) * t;
        g = shade[j + 1] + (lit[j + 1] - shade[j + 1]) * t;
        b = shade[j + 2] + (lit[j + 2] - shade[j + 2]) * t;
        if (m === MAT.WATER) {
          const fr = 0.85 * toneB / 255;
          const ws = k.water.sky;
          r += (ws[0] - r) * fr; g += (ws[1] - g) * fr; b += (ws[2] - b) * fr;
        } else {
          const tk = 1 + pal.toneAmp[m] * ((toneB - 128) / 127);
          r *= tk; g *= tk; b *= tk;
        }
        const tg = gl * torch.strength;
        r += torch.colour[0] * tg; g += torch.colour[1] * tg; b += torch.colour[2] * tg;
        h = haze.max * (1 - Math.exp(-dist / haze.dist));
        r += (haze.colour[0] - r) * h; g += (haze.colour[1] - g) * h; b += (haze.colour[2] - b) * h;
        bright = t0 + tg * 2.5 + toneRung * ((toneB - 128) / 127);
        if (bright > 1) bright = 1; else if (bright < 0) bright = 0;
      }
      // glyph: the rung of the family's ladder
      const fam = FAMILY[m];
      const n = fam.length;
      let rung;
      if (pal.emissive[m]) rung = Math.round(bright * (n - 1));
      else rung = Math.floor((1 - bright) * (n - 1) + 0.5 + BAYER[(cy & 3) * 4 + (cx & 3)] * dither);
      if (rung < 0) rung = 0; else if (rung > n - 1) rung = n - 1;
      let glyph = fam[rung];
      // ink: a tint of the background, darker on lit ground, lighter in the dark
      let ink = pal.inkDark[m] + (pal.inkLit[m] - pal.inkDark[m]) * bright;
      ink *= 1 - h * glyphFade;
      if (m === MAT.STAR && bright < 0.06) { glyph = 0; ink = 0; }
      const bg = clampColour(r, g, b);
      const br = bg[0], bgG = bg[1], bb = bg[2];
      cells[oc] = br; cells[oc + 1] = bgG; cells[oc + 2] = bb; cells[oc + 3] = glyph;
      const fr = br + ink * (br > ifr ? br : ifr), fg = bgG + ink * (bgG > ifg ? bgG : ifg), fb = bb + ink * (bb > ifb ? bb : ifb);
      const fc = clampColour(fr, fg, fb);
      cells[oc + 4] = fc[0]; cells[oc + 5] = fc[1]; cells[oc + 6] = fc[2]; cells[oc + 7] = 0;
    }
  }
}
