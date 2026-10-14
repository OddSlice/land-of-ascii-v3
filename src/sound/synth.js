// The sounds themselves (phase 5b), made at runtime on the Web Audio API
// from oscillators, filtered noise and short envelopes: no audio files. The
// noise is made once, from a seeded generator, into three buffers (white,
// pink, brown); every bed loops one of them through its filters, and every
// event is a handful of nodes that end and are dropped by themselves.
// Each takes an output node (a voice's place: its panner and distance
// gain, src/sound/engine.js) and an audio-clock time to start at.
import { SOUND } from './palette.js';

const NOISE_SECONDS = 5;

// White, pink and brown noise, the same every visit (a seeded generator).
export function noiseBuffers(ctx) {
  const n = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  let s = 0x2545f491;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
  const make = (fill) => { const b = ctx.createBuffer(1, n, ctx.sampleRate); fill(b.getChannelData(0)); return b; };
  const white = make((d) => { for (let i = 0; i < n; i++) d[i] = rnd(); });
  const pink = make((d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  });
  const brown = make((d) => { let l = 0; for (let i = 0; i < n; i++) { l = (l + 0.02 * rnd()) / 1.02; d[i] = l * 3.5; } });
  // (the loops' ends meet: a short cross-fade, so a bed never clicks)
  for (const b of [white, pink, brown]) {
    const d = b.getChannelData(0), m = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < m; i++) { const f = i / m; d[n - m + i] = d[n - m + i] * (1 - f) + d[i] * f; }
  }
  return { white, pink, brown };
}

// A looping noise source starting at a random point of its buffer.
function loop(ctx, buffer, at = 0) {
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  src.start(ctx.currentTime, at % NOISE_SECONDS);
  return src;
}
const filt = (ctx, type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
const gainN = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const chain = (...nodes) => { for (let i = 0; i + 1 < nodes.length; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };

// ---- beds ----------------------------------------------------------------------------
// Each returns { level: AudioParam (0..1 of its full level), tone: {f}, stop }.

// The wind: pink noise through a band-pass whose centre rises with the gusts,
// and a thin whistle over it on high ground.
export function windBed(ctx, nz, out) {
  const W = SOUND.wind;
  const src = loop(ctx, nz.pink, 0.7), bp = filt(ctx, 'bandpass', W.band[0], W.q), g = gainN(ctx, 0);
  chain(src, bp, g, out);
  const src2 = loop(ctx, nz.white, 2.3), bp2 = filt(ctx, 'bandpass', W.whistle.band, W.whistle.q), g2 = gainN(ctx, 0);
  chain(src2, bp2, g2, out);
  return { level: g.gain, band: bp.frequency, whistle: g2.gain, stop: () => { src.stop(); src2.stop(); } };
}

// The rain: white noise between a high- and a low-pass.
export function rainBed(ctx, nz, out) {
  const R = SOUND.rain;
  const src = loop(ctx, nz.white, 1.1), hp = filt(ctx, 'highpass', R.band[0], 0.5), lp = filt(ctx, 'lowpass', R.band[1], 0.5), g = gainN(ctx, 0);
  chain(src, hp, lp, g, out);
  return { level: g.gain, low: lp.frequency, stop: () => src.stop() };
}

// Water: `kind` lake (lapping), river (flowing), sea (swell). The laps and
// the swell are slow oscillators on the gain, each at its own rate.
export function waterBed(ctx, nz, out, kind) {
  const P = SOUND.water[kind];
  const src = loop(ctx, kind === 'river' ? nz.pink : nz.brown, kind === 'lake' ? 3.1 : kind === 'sea' ? 0.4 : 4.2);
  const f = kind === 'river' ? filt(ctx, 'bandpass', P.band, P.q) : filt(ctx, 'lowpass', P.low, 0.6);
  const g = gainN(ctx, 0), mod = gainN(ctx, 1);
  chain(src, f, mod, g, out);
  const lfos = [];
  if (kind !== 'river') {
    const rates = kind === 'lake' ? P.lap : P.swell;
    for (const r of rates) {
      const o = ctx.createOscillator(); o.frequency.value = r;
      const d = gainN(ctx, P.depth / rates.length / 2);
      o.connect(d); d.connect(mod.gain); o.start();
      lfos.push(o);
    }
    mod.gain.value = 1 - P.depth / 2;
  }
  return { level: g.gain, tone: f.frequency, stop: () => { src.stop(); for (const o of lfos) o.stop(); } };
}

// A fire: a soft low roar (its pops are events).
export function fireBed(ctx, nz, out, kind) {
  const P = SOUND.fire[kind];
  const src = loop(ctx, nz.brown, kind === 'torch' ? 1.7 : 3.7), lp = filt(ctx, 'lowpass', P.low, 0.8), g = gainN(ctx, 0);
  chain(src, lp, g, out);
  return { level: g.gain, stop: () => src.stop() };
}

// ---- events --------------------------------------------------------------------------
// Each plays into `out` at audio time `t` with linear peak `v` and returns
// when it ends (audio time). `r` is a 0..1 hash for variety.

const env = (p, t, v, a, d) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + a); p.exponentialRampToValueAtTime(Math.max(1e-4, v * 0.001), t + a + d); p.setValueAtTime(0, t + a + d + 0.01); };
function noiseHit(ctx, nz, out, t, v, type, f, q, a, d, buf = 'white', at = 0) {
  const src = ctx.createBufferSource(); src.buffer = nz[buf];
  const fl = filt(ctx, type, f, q), g = gainN(ctx, 0);
  chain(src, fl, g, out);
  env(g.gain, t, v, a, d);
  src.start(t, at % (NOISE_SECONDS - 1)); src.stop(t + a + d + 0.05);
  return t + a + d + 0.05;
}
function tone(ctx, out, t, v, type, f0, f1, a, d, vib = 0, vibHz = 0) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + a + d);
  const g = gainN(ctx, 0);
  if (vib) { const l = ctx.createOscillator(); l.frequency.value = vibHz; const lg = gainN(ctx, vib); l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + a + d + 0.05); }
  o.connect(g); g.connect(out);
  env(g.gain, t, v, a, d);
  o.start(t); o.stop(t + a + d + 0.05);
  return t + a + d + 0.05;
}
// a tone through a band-pass (a voice's formant)
function voiced(ctx, out, t, v, type, f0, f1, a, d, band, q, vib = 0, vibHz = 0) {
  const bp = filt(ctx, 'bandpass', band, q); bp.connect(out);
  return tone(ctx, bp, t, v, type, f0, f1, a, d, vib, vibHz);
}

export function footstep(ctx, nz, out, t, v, m, r) {
  const [band, q, decay, thump, share, grit] = m;
  let end = noiseHit(ctx, nz, out, t, v, 'bandpass', band * (0.9 + 0.2 * r), q, 0.004, decay, 'pink', r * 4);
  if (thump) end = Math.max(end, tone(ctx, out, t, v * share, 'sine', thump * (1 + 0.1 * r), thump * 0.6, 0.003, decay * 0.9));
  if (grit) for (let k = 1; k <= 3; k++) end = Math.max(end, noiseHit(ctx, nz, out, t + k * 0.022 * (0.8 + 0.4 * r), v * grit * 0.5, 'highpass', band * 1.3, 0.7, 0.002, 0.018, 'white', r * 3 + k));
  return end;
}
export function splash(ctx, nz, out, t, v, r) {
  const S = SOUND.steps.splash;
  const e1 = noiseHit(ctx, nz, out, t, v, 'bandpass', S.band * (0.85 + 0.3 * r), 0.8, 0.01, S.decay, 'white', r * 3);
  const e2 = tone(ctx, out, t + 0.03, v * 0.25, 'sine', 900 + 500 * r, 380, 0.005, 0.08);
  return Math.max(e1, e2);
}
export function creak(ctx, nz, out, t, v, r) {
  const C = SOUND.steps.creak;
  return voiced(ctx, out, t, v, 'sawtooth', C.pitch[0] * (0.9 + 0.2 * r), C.pitch[1], 0.04, C.decay, C.band, C.q, 6, 23);
}
export function landing(ctx, nz, out, t, v) {
  const L = SOUND.steps.land;
  return Math.max(tone(ctx, out, t, v, 'sine', L.pitch[0], L.pitch[1], 0.004, L.decay), noiseHit(ctx, nz, out, t, v * 0.6, 'lowpass', 320, 0.7, 0.004, L.decay * 0.8, 'brown', 1));
}
// a songbird's phrase: a few short whistled notes, its own tune from r
export function birdSong(ctx, nz, out, t, v, r, r2) {
  const B = SOUND.birds.song, n = B.notes[0] + Math.floor(r * (B.notes[1] - B.notes[0] + 1));
  let at = t, end = t;
  for (let k = 0; k < n; k++) {
    const h = (Math.sin((k + 1) * 12.9898 * (1 + r2) + r * 78.233) * 43758.5453) % 1, hh = Math.abs(h);
    const f0 = B.pitch[0] + (B.pitch[1] - B.pitch[0]) * hh, f1 = f0 * (0.75 + 0.5 * Math.abs((hh * 7.3) % 1));
    const len = B.note[0] + (B.note[1] - B.note[0]) * Math.abs((hh * 3.7) % 1);
    end = Math.max(end, tone(ctx, out, at, v * (0.6 + 0.4 * hh), 'sine', f0, f1, 0.006, len));
    at += len + 0.03 + 0.06 * Math.abs((hh * 5.1) % 1);
  }
  return end;
}
export function gullCall(ctx, nz, out, t, v, r) {
  const G = SOUND.birds.gull, f = G.pitch[0] + (G.pitch[1] - G.pitch[0]) * r;
  let end = voiced(ctx, out, t, v, 'triangle', f, f * 1.25, 0.04, 0.32, f * 1.4, 1.5, 18, 9);
  if (r > 0.5) end = Math.max(end, voiced(ctx, out, t + 0.42, v * 0.8, 'triangle', f * 1.1, f * 0.8, 0.03, 0.28, f * 1.4, 1.5, 18, 9));
  return end;
}
export function crowCaw(ctx, nz, out, t, v, r) {
  const C = SOUND.birds.crow, n = 2 + Math.floor(r * 2);
  let end = t;
  for (let k = 0; k < n; k++) end = Math.max(end, voiced(ctx, out, t + k * 0.38, v, 'sawtooth', C.pitch * (1 + 0.06 * r), C.pitch * 0.82, 0.02, 0.2, 1050, 2.2, 25, 31),
    noiseHit(ctx, nz, out, t + k * 0.38, v * 0.35, 'bandpass', 1300, 1.5, 0.02, 0.18, 'white', r * 5 + k));
  return end;
}
export function finchCall(ctx, nz, out, t, v, r) {
  const F = SOUND.birds.finch, f = F.pitch[0] + (F.pitch[1] - F.pitch[0]) * r;
  return Math.max(tone(ctx, out, t, v, 'sine', f, f * 1.3, 0.004, 0.05), tone(ctx, out, t + 0.08, v * 0.7, 'sine', f * 1.1, f * 0.9, 0.004, 0.04));
}
export function sheepBaa(ctx, nz, out, t, v, r) {
  const f = SOUND.animals.sheep.pitch * (0.85 + 0.3 * r);
  return Math.max(voiced(ctx, out, t, v, 'sawtooth', f, f * 0.92, 0.06, 0.55, 850, 1.4, 14, 6.5), voiced(ctx, out, t, v * 0.4, 'sawtooth', f, f * 0.92, 0.06, 0.55, 1700, 2.5, 14, 6.5));
}
export function cowMoo(ctx, nz, out, t, v, r) {
  const f = SOUND.animals.cattle.pitch * (0.9 + 0.2 * r);
  const lp = filt(ctx, 'lowpass', 650, 1.2); lp.connect(out);
  return tone(ctx, lp, t, v, 'sawtooth', f, f * 1.25, 0.25, 1.0, 3, 4);
}
export function henCluck(ctx, nz, out, t, v, r) {
  const f = SOUND.animals.hens.pitch * (0.85 + 0.3 * r), n = 3 + Math.floor(r * 3);
  let end = t;
  for (let k = 0; k < n; k++) end = Math.max(end, voiced(ctx, out, t + k * (0.11 + 0.05 * r), v, 'triangle', f, f * 0.8, 0.005, 0.05, 1200, 2));
  return end;
}
export function duckQuack(ctx, nz, out, t, v, r) {
  const f = SOUND.animals.duck.pitch * (0.9 + 0.2 * r), n = 2 + Math.floor(r * 2);
  let end = t;
  for (let k = 0; k < n; k++) end = Math.max(end, voiced(ctx, out, t + k * 0.22, v, 'sawtooth', f, f * 0.75, 0.01, 0.13, 1250, 3.5));
  return end;
}
export function dogBark(ctx, nz, out, t, v, r) {
  const f = SOUND.animals.dog.pitch * (0.9 + 0.2 * r);
  let end = Math.max(voiced(ctx, out, t, v, 'square', f, f * 0.7, 0.005, 0.11, 950, 1.6), noiseHit(ctx, nz, out, t, v * 0.5, 'bandpass', 1200, 1.2, 0.004, 0.09, 'white', r * 7));
  if (r > 0.4) end = Math.max(end, voiced(ctx, out, t + 0.24, v * 0.85, 'square', f * 1.05, f * 0.72, 0.005, 0.1, 950, 1.6));
  return end;
}
export function deerBreak(ctx, nz, out, t, v, r) {
  let end = noiseHit(ctx, nz, out, t, v, 'bandpass', 2400, 0.8, 0.03, 0.55, 'white', r * 9);
  for (let k = 0; k < 6; k++) end = Math.max(end, tone(ctx, out, t + 0.12 + k * 0.13 * (0.9 + 0.2 * r), v * 0.5, 'sine', 110, 60, 0.003, 0.06));
  return end;
}
export function firePop(ctx, nz, out, t, v, r, band) {
  return noiseHit(ctx, nz, out, t, v, 'highpass', band * (0.8 + 0.5 * r), 0.9, 0.001, 0.012 + 0.02 * r, 'white', r * 11);
}
export function drip(ctx, nz, out, t, v, r) {
  const D = SOUND.rain.drip, f = D.pitch[0] + (D.pitch[1] - D.pitch[0]) * r;
  return tone(ctx, out, t, v, 'sine', f, f * 0.55, 0.002, D.decay);
}
export function wellDraw(ctx, nz, out, t, v, r) {
  const W = SOUND.well;
  let end = t;
  for (let k = 0; k < 4; k++) end = Math.max(end, voiced(ctx, out, t + k * 0.55, v * 0.6, 'sawtooth', W.rope[k & 1], W.rope[(k + 1) & 1], 0.08, 0.35, 900, 5, 4, 13));
  return Math.max(end, noiseHit(ctx, nz, out, t + 2.5, v, 'bandpass', W.splash, 0.8, 0.01, 0.35, 'white', r * 13));
}
export function bellStrike(ctx, out, t, v) {
  const B = SOUND.bell;
  let end = t;
  for (const [m, a] of B.partials) end = Math.max(end, tone(ctx, out, t, v * a, 'sine', B.pitch * m, B.pitch * m * 0.998, 0.004, B.decay / Math.sqrt(m)));
  return end;
}
export function latch(ctx, nz, out, t, v, r) {
  const e1 = noiseHit(ctx, nz, out, t, v, 'highpass', 3200, 0.8, 0.001, 0.015, 'white', r * 17);
  const e2 = tone(ctx, out, t + 0.02, v * 0.6, 'sine', 320, 240, 0.002, 0.05);
  const e3 = voiced(ctx, out, t + 0.06, v * 0.3, 'sawtooth', 160, 130, 0.05, 0.25, 700, 5);
  return Math.max(e1, e2, e3);
}
