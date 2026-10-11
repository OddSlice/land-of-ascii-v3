// Weather (phase 2b): the forecast, and the numbers a frame's weather comes to.
//
// The weather is a pure function of the world's seed, the day count and the
// hour, never simulated state, so any moment can be reproduced with the clock
// frozen. The page works it out and sends it in the frame (src/contract.js)
// as how much of each of the five kinds applies, how wet the ground is and
// how far the clouds have drifted on the weather's wind; every backend and
// resolve call blends the kinds' numbers in src/look.js by that mix. A frame
// with no weather is fair, which is exactly the look before weather.
import { LOOK } from './look.js';
import { hash2 } from './world/noise.js';

export const KINDS = ['clear', 'fair', 'overcast', 'rain', 'mist'];
const K = LOOK.weather.kinds, F = LOOK.weather.forecast, WET = LOOK.weather.wet;
const BL = F.blend / 60;                  // hours over which one kind turns into the next
const HB = BL / 2;
const FAIR_WIND = K.fair.wind[0];

const smooth01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
// the integral of smooth01 from 0 to u
const S1 = (u) => (u <= 0 ? 0 : u >= 1 ? u - 0.5 : u * u * u - u * u * u * u / 2);

// ---- the forecast ----------------------------------------------------------

// One day's plan: [start, end, kind] in hours from its midnight, covering
// 0..24 (later spells painted over earlier ones).
function dayPlan(seed, day) {
  const r = (n) => hash2(day, n, (seed | 0) + 701);
  const pick = (a, n) => a[0] + (a[1] - a[0]) * r(n);
  let segs = [[0, 24, day === 0 ? 'fair' : r(1) < F.clear ? 'clear' : 'fair']];
  const paint = (s, e, kind) => {
    s = Math.max(0, s); e = Math.min(24, e);
    if (e <= s) return;
    const out = [];
    for (const [a, b, k] of segs) {
      if (b <= s || a >= e) { out.push([a, b, k]); continue; }
      if (a < s) out.push([a, s, k]);
      if (b > e) out.push([e, b, k]);
    }
    out.push([s, e, kind]);
    segs = out.sort((p, q) => p[0] - q[0]);
  };
  if (day === 0 || r(2) < F.mist) paint(pick(F.mistFrom, 3), pick(F.mistTo, 4), 'mist');
  if (day !== 0 && r(5) < F.rain) {
    const s = pick(F.rainFrom, 6), e = s + pick(F.rainFor, 7);
    paint(s - pick(F.before, 8), s, 'overcast');
    paint(s, e, 'rain');
    paint(e, e + pick(F.after, 9), 'overcast');
  } else if (day !== 0 && r(10) < F.overcast) {
    const s = pick(F.overcastFrom, 11);
    paint(s, s + pick(F.overcastFor, 12), 'overcast');
  }
  return segs;
}

// The days before, of and after `day` as one timeline in hours from day 0's
// midnight, neighbours of one kind merged, so blends cross midnight.
const plans = new Map();
function timeline(seed, day) {
  const key = `${seed}|${day}`;
  let tl = plans.get(key);
  if (tl) return tl;
  tl = [];
  for (let d = day - 1; d <= day + 1; d++) {
    for (const [a, b, k] of dayPlan(seed, d)) {
      const s = 24 * d + a, e = 24 * d + b, last = tl[tl.length - 1];
      if (last && last[2] === k) last[1] = e; else tl.push([s, e, k]);
    }
  }
  if (plans.size > 256) plans.clear();
  plans.set(key, tl);
  return tl;
}

// How much of each kind applies at absolute hour H (the timeline must cover
// it): one kind, or two while one turns into the next.
function mixAt(tl, H, out) {
  for (const k of KINDS) out[k] = 0;
  let i = 0;
  while (i < tl.length - 1 && H >= tl[i][1]) i++;
  const [s, e, k] = tl[i];
  if (i > 0 && H < s + HB) {
    const t = smooth01((H - (s - HB)) / BL);
    out[tl[i - 1][2]] += 1 - t; out[k] += t;
  } else if (i < tl.length - 1 && H > e - HB) {
    const t = smooth01((H - (e - HB)) / BL);
    out[k] += 1 - t; out[tl[i + 1][2]] += t;
  } else out[k] = 1;
  return out;
}

// The integral from a to b (absolute hours) of a kind's number f(kind),
// blended as the weather is.
function integrate(tl, a, b, f) {
  let s = 0;
  for (const [s0, e0, k] of tl) { const lo = Math.max(a, s0), hi = Math.min(b, e0); if (hi > lo) s += f(k) * (hi - lo); }
  for (let i = 1; i < tl.length; i++) {
    const B = tl[i][0], p = f(tl[i - 1][2]), q = f(tl[i][2]);
    if (p === q) continue;
    const lo = Math.max(a, B - HB), hi = Math.min(b, B + HB);
    if (hi <= lo) continue;
    const ramp = BL * (S1((hi - B + HB) / BL) - S1((lo - B + HB) / BL));
    s += (q - p) * (ramp - Math.max(0, hi - Math.max(lo, B)));
  }
  return s;
}

// The clouds' drift on the weather's wind, beyond fair's own (which the
// animation clock already moves them by): metres east, the extra wind summed
// over game time since day 0's midnight, a game hour counting as a minute (the
// clock's own pace, T), so with the clock running the clouds move at the
// weather's wind.
const extraWind = (k) => K[k].wind[0] - FAIR_WIND;
const cums = new Map();
function cumDays(seed, day) {
  // the integral up to the midnight that starts `day`
  let c = cums.get(seed);
  if (!c) { c = { lo: 0, v: [0] }; cums.set(seed, c); }
  while (day > c.lo + c.v.length - 1) {
    const d = c.lo + c.v.length - 1;
    c.v.push(c.v[c.v.length - 1] + integrate(timeline(seed, d), 24 * d, 24 * d + 24, extraWind));
  }
  while (day < c.lo) {
    const d = c.lo - 1;
    c.v.unshift(c.v[0] - integrate(timeline(seed, d), 24 * d, 24 * d + 24, extraWind));
    c.lo = d;
  }
  return c.v[day - c.lo];
}

// How wet the ground is at absolute hour H: the rain over the hours before,
// soaking in at WET.soak a full share per hour and drying out over WET.dry
// hours (a kernel, summed over two-minute steps of rain, smooth in H).
const STEP = 2 / 60;
function kernelInt(x) {
  // the integral from 0 to x of WET.soak * (1 - smooth01(t / WET.dry))
  if (x <= 0) return 0;
  if (x >= WET.dry) return WET.soak * WET.dry / 2;
  return WET.soak * (x - WET.dry * S1(x / WET.dry));
}
const tmp = {};
function wetAt(tl, H) {
  let w = 0;
  const k0 = Math.ceil((H - WET.dry - STEP / 2) / STEP), k1 = Math.floor((H + STEP / 2) / STEP);
  for (let k = k0; k <= k1; k++) {
    const g = k * STEP;
    const share = kernelInt(H - (g - STEP / 2)) - kernelInt(H - (g + STEP / 2));
    if (share <= 0) continue;
    const r = mixAt(tl, g, tmp).rain;
    if (r > 0) w += r * share;
  }
  return w > 1 ? 1 : w;
}

// The frame's weather (src/contract.js): `mode` 'auto' for the forecast, or
// one kind held.
export function weatherFor(seed, day, hour, mode = 'auto') {
  const H = 24 * day + hour;
  if (mode !== 'auto' && K[mode]) {
    return { mix: { [mode]: 1 }, wet: K[mode].rain > 0 ? 1 : 0, drift: extraWind(mode) * 60 * H };
  }
  const tl = timeline(seed, day);
  const mix = mixAt(tl, H, {});
  for (const k of KINDS) if (!mix[k]) delete mix[k];
  const drift = 60 * (cumDays(seed, day) + integrate(tl, 24 * day, H, extraWind));
  return { mix, wet: wetAt(tl, H), drift };
}

// The day's plan, for the menu and the tools: [[from, to, kind], ...] in hours.
export function forecastOf(seed, day) { return dayPlan(seed, day).map((s) => s.slice()); }

// The kind that applies most at a moment of a frame's weather.
export function mainKind(w) {
  const m = (w && w.mix) || { fair: 1 };
  let best = 'fair', bv = -1;
  for (const k of KINDS) if ((m[k] || 0) > bv) { bv = m[k] || 0; best = k; }
  return best;
}

// ---- the numbers a frame's weather comes to ----------------------------------

const FIELDS = Object.keys(K.fair);
let lastKey = null, lastP = null;

// The kinds' numbers blended by the frame's mix (fair's own where the frame
// has no weather), with the wetness and drift: { clouds, size, ..., wet:
// [dark, sheen], wetness, drift }. Blended in a fixed order, so every thread
// gets the same numbers.
export function weatherParams(w) {
  const mix = (w && w.mix) || null;
  const wetness = w && w.wet ? w.wet : 0, drift = w && w.drift ? w.drift : 0;
  const key = mix ? `${KINDS.map((k) => mix[k] || 0).join(',')}|${wetness}|${drift}` : `f|${wetness}|${drift}`;
  if (key === lastKey) return lastP;
  const P = {};
  for (const f of FIELDS) {
    const v0 = K.fair[f];
    if (!mix) { P[f] = Array.isArray(v0) ? v0.slice() : v0; continue; }
    if (Array.isArray(v0)) {
      const a = v0.map(() => 0);
      for (const k of KINDS) { const m = mix[k] || 0; if (m) for (let i = 0; i < a.length; i++) a[i] += m * K[k][f][i]; }
      P[f] = a;
    } else {
      let s = 0;
      for (const k of KINDS) { const m = mix[k] || 0; if (m) s += m * K[k][f]; }
      P[f] = s;
    }
  }
  P.wetness = wetness; P.drift = drift;
  // (what the palette depends on: the mix alone)
  P.mixKey = key.split('|')[0];
  // fair alone: exactly the look before weather
  P.fair = !mix || (mix.fair === 1 && KINDS.every((k) => k === 'fair' || !mix[k]));
  lastKey = key; lastP = P;
  return P;
}

// ---- the mist's floor ----------------------------------------------------------

// The ground smoothed over LOOK.weather.mist.floor metres (two box blurs of
// the 8 m level), lowered on high ground: where the ground lies below it (a
// hollow, a valley floor, a lake) the mist lies deep; where it stands above
// (a knoll, a ridge) the mist thins away. Built once per world, the same in
// every thread; resolve reads it (src/resolve.js, `env.mist`).
export function mistFloorOf(world) {
  if (world.mistFloor) return world.mistFloor;
  const M = LOOK.weather.mist, lv = world.terrain.levels[world.terrain.levels.length - 1];
  const n = lv.n, nn = n + 1, size = lv.size, sea = world.sea !== undefined ? world.sea : LOOK.air.base;
  const r = Math.max(1, Math.round(M.floor / size / 2));
  let a = Float64Array.from(lv.H), b = new Float64Array(nn * nn);
  const pass = (src, dst, along) => {
    for (let k = 0; k <= n; k++) {
      for (let i = 0; i <= n; i++) {
        let s = 0;
        for (let d = -r; d <= r; d++) {
          let ii = along ? i + d : i, kk = along ? k : k + d;
          ii = ii < 0 ? 0 : ii > n ? n : ii; kk = kk < 0 ? 0 : kk > n ? n : kk;
          s += src[kk * nn + ii];
        }
        dst[k * nn + i] = s / (2 * r + 1);
      }
    }
  };
  for (let p = 0; p < 2; p++) { pass(a, b, true); pass(b, a, false); }
  const F = new Float32Array(nn * nn);
  for (let j = 0; j < F.length; j++) F[j] = a[j] - M.raise * Math.max(0, a[j] - sea);
  world.mistFloor = { n, size, F };
  return world.mistFloor;
}
