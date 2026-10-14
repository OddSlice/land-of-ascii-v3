// The music (0.5.3): slow, soft pieces written in code as the land plays.
// Nothing here is a recording or a borrowed tune: each piece is composed
// when it starts, from a seeded generator, to the hour and the weather, and
// played on the Web Audio API by four small instruments made of oscillators
// (a felt piano, a soft flute, a warm pad, a low bass) and a bell for the
// last chord, in one long room's echo (a convolution with a decaying noise
// made here).
//
// Three tracks (SOUND.music.tracks), each a key and a mode, a tempo, four
// chords, each held two bars; they play in turn, each beginning under the
// last one's closing chord, and round again. The pad holds the chords and the
// piano rolls through them; the first time round there is no tune, then a
// short motif on the piano or the flute, its shape kept and its notes fitted
// to each chord, closing on a long note; the last time round it is lighter,
// and the piece ends on the home chord with a few bell notes, under which
// the next track begins.
//
// The palette's numbers are in src/sound/palette.js (SOUND.music).
import { SOUND } from './palette.js';

const M = SOUND.music;
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
};
// the tune's notes: the mode's five-note core (no half step against a chord)
const MAJOR5 = [0, 1, 2, 4, 5], MINOR5 = [0, 2, 3, 4, 6];
const PENTA = { ionian: MAJOR5, lydian: MAJOR5, mixolydian: MAJOR5, dorian: MINOR5, aeolian: MINOR5 };
// four chords, as the mode's degrees (0: home), only on chords that sit well
const PROGS = {
  ionian: [[0, 5, 3, 4], [0, 3, 5, 4], [3, 4, 2, 5], [0, 4, 5, 3], [3, 0, 3, 4], [5, 3, 0, 4]],
  lydian: [[0, 1, 0, 1], [0, 1, 5, 4], [0, 1, 2, 1]],
  mixolydian: [[0, 6, 3, 0], [0, 3, 6, 3], [0, 4, 6, 3]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 2, 3, 6]],
  aeolian: [[0, 5, 2, 6], [0, 3, 5, 6], [5, 6, 0, 0], [0, 6, 5, 6]],
};
// the tune's rhythms over a chord's two bars: [beat, beats held]
const RHYTHMS = [
  [[0, 1.5], [1.5, 0.5], [2, 2], [4, 1], [5, 3]],
  [[0, 3], [3, 1], [4, 4]],
  [[1, 1], [2, 1], [3, 3], [6, 2]],
  [[0, 2], [2, 1], [3, 1], [4, 4]],
  [[0, 1], [1, 1], [2, 4], [6, 1], [7, 1]],
  [[0, 4], [4.5, 0.5], [5, 1], [6, 2]],
];
const CADENCE = [[0, 2], [2, 6]];
// the piano's roll under the chords: [beat, degrees above the chord's root]
const ROLLS = [
  [[0, 0], [1, 4], [2, 7], [3, 9], [4, 7], [5, 4], [6, 7], [7, 9]],
  [[0, 0], [1.5, 4], [3, 9], [4, 0], [5.5, 4], [7, 8]],
  [[0, 0], [2, 7], [3, 9], [4, 4], [6, 8]],
  [[0, 0], [2, 4], [4, 9], [6, 7]],
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const mod = (a, n) => ((a % n) + n) % n;
function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const smooth = (a, b, x) => { let t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ---- writing a piece ---------------------------------------------------------------------

// A piece: its notes, [{ t (s from its start), inst, midi (or a chord's
// midis), v, dur }], sorted, its length, and when the next may begin
// (`handoff`, as its last chord rings). Its key, mode, tempo, chords and
// lead come from `spec` (one of SOUND.music.tracks) where given, and
// otherwise from the hour and the weather; its tune and rolls from `seed`.
export function compose(seed, hour, rain, spec = {}) {
  const r = rng(Math.imul(seed + 1, 2654435761) ^ 0x5bd1e995);
  const night = hour < 5.5 || hour >= 20.5, dusk = !night && hour >= 17, dawn = !night && hour < 8.5, wet = rain > 0.3;
  const mode = spec.mode || (night ? pick(r, wet ? ['aeolian', 'dorian'] : ['dorian', 'aeolian', 'dorian'])
    : dusk ? pick(r, wet ? ['dorian', 'aeolian'] : ['mixolydian', 'dorian', 'ionian'])
      : dawn ? pick(r, ['lydian', 'ionian', 'ionian']) : wet ? pick(r, ['dorian', 'mixolydian']) : pick(r, ['ionian', 'lydian', 'mixolydian', 'ionian']));
  const scale = MODES[mode], penta = PENTA[mode];
  // (the key: the piano's roll starts round C3 to G3, lower at night)
  const root = spec.root || pick(r, night ? [45, 47, 48, 50] : [48, 50, 52, 53, 55]);
  const bpmR = night ? M.bpm.night : M.bpm.day, bpm = spec.bpm || bpmR[0] + r() * (bpmR[1] - bpmR[0]), beat = 60 / bpm;
  const cycles = spec.cycles || (night ? M.cycles.night : M.cycles.day);
  const prog = spec.prog || pick(r, PROGS[mode]);
  const lead = spec.lead || (r() < (night ? 0.5 : 0.4) ? 'flute' : 'keys');
  const rhythm = pick(r, RHYTHMS), roll = pick(r, ROLLS), roll2 = pick(r, ROLLS);
  // a degree's pitch, and a tune index's degree (five to an octave)
  const pitch = (deg, base = root) => base + scale[mod(deg, 7)] + 12 * Math.floor(deg / 7);
  const tuneDeg = (m) => penta[mod(m, 5)] + 7 * Math.floor(m / 5);
  const isChordTone = (deg, c) => [0, 2, 4].includes(mod(deg - c, 7));
  // the motif's shape: steps on the tune's five notes
  const shape = rhythm.map((_, i) => (i === 0 ? 0 : pick(r, [-2, -1, -1, 1, 1, 2, 0])));
  const notes = [];
  const C = M.chordBeats * beat;
  const add = (t, inst, midi, v, dur) => notes.push({ t: Math.max(0, t + (r() - 0.5) * 0.02), inst, midi, v: v * (0.85 + 0.3 * r()), dur });
  // a chord's pad: its four notes folded into one octave and a fifth over the key
  const padOf = (c) => {
    const lo = root + 7;
    const ms = [0, 2, 4, r() < 0.5 ? 6 : 8].map((k) => { let m = pitch(c + k); while (m < lo) m += 12; while (m >= lo + 14) m -= 12; return m; });
    // (phase 6, after the listening pass: the colour note (the seventh or
    // the ninth) never a semitone from another of the chord's notes: up an
    // octave, where it opens out; a seventh just under its root was sour)
    const rub = (m, i) => ms.some((o, j) => j !== i && Math.abs(o - m) === 1);
    if (rub(ms[3], 3)) ms[3] += 12;
    if (rub(ms[3], 3)) ms[3] = pitch(c + 8) + 12 * Math.round((lo + 7 - pitch(c + 8)) / 12);
    return ms.sort((a, b) => a - b);
  };
  // the tune's index nearest a chord tone, from where it was
  const fit = (m, c) => { for (const dm of [0, 1, -1, 2, -2]) if (isChordTone(tuneDeg(m + dm), c)) return m + dm; return m; };
  let m = 6 + Math.floor(r() * 3), t = 0;
  for (let cy = 0; cy < cycles; cy++) {
    const last = cy === cycles - 1 && cycles > 2, quiet = cy === 0;
    prog.forEach((c, k) => {
      const t0 = t + k * C, low = c >= 4 ? c - 7 : c;   // (the roll and the bass keep low)
      add(t0, 'pad', padOf(c), 1, C + 0.4);
      if (!(quiet && k === 0)) {
        // (the roll: the second time round, the other pattern now and then)
        const R = cy > 0 && k % 2 ? roll2 : roll;
        for (const [b, up] of R) { if (last && b % 2) continue; add(t0 + b * beat, 'keys', pitch(low + up, root), quiet ? 0.32 : 0.4, beat * 2.2); }
      }
      if (!quiet || k >= 2) add(t0, 'bass', pitch(low, root - 12), 1, C - 0.3);
      // the tune: the motif fitted to each chord, a long note to close
      if (!quiet) {
        const rh = k === 3 ? CADENCE : rhythm;
        let mm = fit(k === 0 ? m : m + Math.round((r() - 0.5) * 2), c);
        rh.forEach(([b, held], i) => {
          if (i > 0) mm += k === 2 ? -shape[i] : shape[i];
          if (mm < 5) mm += 2; if (mm > 11) mm -= 2;
          if (b === 0 || i === rh.length - 1) mm = fit(mm, c);
          if (last && i % 2 && k < 3) return;
          add(t0 + b * beat, lead, pitch(tuneDeg(mm), root), lead === 'keys' ? 0.75 : 0.85, held * beat * 0.95);
        });
        m = mm;
      }
    });
    t += prog.length * C;
  }
  // the end: the home chord held, a slow roll and a few bell notes
  add(t, 'pad', padOf(0), 1, C * 1.2);
  add(t, 'bass', pitch(0, root - 12), 0.9, C);
  [0, 4, 7, 9].forEach((up, i) => add(t + i * beat * 0.75, 'keys', pitch(up, root), 0.36, beat * 4));
  [14, 16, 18].forEach((up, i) => { if (r() < 0.8) add(t + beat * (3 + i * 1.5), 'bell', pitch(up, root), 1, beat * 3); });
  // (phase 6, after the listening pass) no note a semitone (or a semitone
  // and an octave) from what the pad holds as it starts: moved to the
  // nearest note of the mode that is clear of it, else left out
  const inMode = new Set(scale.map((v) => (v + root) % 12));
  const pads = notes.filter((n) => n.inst === 'pad').sort((a, b) => a.t - b.t);
  const rubs = (m, pad) => pad.midi.some((o) => { const d = Math.abs(m - o); return d === 1 || d === 13; });
  for (const n of notes) {
    if (n.inst === 'pad') continue;
    let pad = null;
    for (const q of pads) { if (q.t <= n.t + 0.05) pad = q; else break; }
    if (!pad || !rubs(n.midi, pad)) continue;
    const alt = [-1, 1, -2, 2, -3, 3].map((d) => n.midi + d).find((m) => inMode.has(((m % 12) + 12) % 12) && !rubs(m, pad));
    if (alt !== undefined) n.midi = alt; else n.drop = true;
  }
  for (let i = notes.length - 1; i >= 0; i--) if (notes[i].drop) notes.splice(i, 1);
  notes.sort((a, b) => a.t - b.t);
  return { notes, length: t + C * 1.2 + M.pad.release * 2, handoff: t + C * M.handoff, mode, bpm, lead, root, name: spec.name || null };
}

// ---- the instruments ----------------------------------------------------------------------

function impulse(ctx) {
  const R = M.room, n = Math.floor(ctx.sampleRate * R.seconds), b = ctx.createBuffer(2, n, ctx.sampleRate);
  const pre = Math.floor(ctx.sampleRate * 0.025);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), r = rng(0x2f6b + ch * 7919);
    let y = 0;
    for (let i = pre; i < n; i++) {
      const f = (i - pre) / (n - pre), a = 0.55 - 0.47 * f;   // (the tail darkens)
      y += a * ((r() * 2 - 1) - y);
      d[i] = y * Math.pow(1 - f, R.decay);
    }
  }
  return b;
}

export class Music {
  constructor(ctx, dest, nz, seed = 0) {
    this.ctx = ctx; this.nz = nz; this.seed = seed | 0;
    this.input = ctx.createGain();
    this.tone = ctx.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = M.tone.day; this.tone.Q.value = 0.4;
    this.out = ctx.createGain(); this.out.gain.value = 0;
    const dry = ctx.createGain(), wet = ctx.createGain(), room = ctx.createConvolver();
    dry.gain.value = M.room.dry; wet.gain.value = M.room.wet; room.buffer = impulse(ctx);
    this.input.connect(this.tone); this.tone.connect(dry); this.tone.connect(room); room.connect(wet);
    dry.connect(this.out); wet.connect(this.out);
    this.out.connect(dest);
    // the felt piano's and the flute's waves: a few soft harmonics
    const wave = (h) => ctx.createPeriodicWave(new Float32Array(h.length), Float32Array.from(h));
    this.keysWave = wave([0, 1, 0.32, 0.1, 0.05, 0.02]);
    this.fluteWave = wave([0, 1, 0.14, 0.04]);
    this.piece = null; this.n = 0; this.idx = 0;
    this.nextAt = ctx.currentTime + M.first;
    this.played = 0;
  }
  level(v, tc) { this.out.gain.setTargetAtTime(v, this.ctx.currentTime, tc); }

  // Each frame: start the next track when its time comes, and schedule the
  // notes falling due. The tracks (SOUND.music.tracks) play in turn, each
  // starting as the last one's home chord rings, and round again.
  // `hour`, `rain`: the world's, for the tone (darker by night and in rain).
  update(now, hour, rain, audible) {
    if (!this.piece) {
      if (now < this.nextAt) return 0;
      if (!audible) { this.nextAt = now + 5; return 0; }
      this.begin(Math.max(now + 0.1, this.nextAt), hour, rain, now);
    }
    let k = this.flush(now + M.lookahead, now);
    // (the hand-off: what is left of this track is already on the audio
    // clock; the next begins under its last chord)
    const P = this.piece;
    if (now + M.lookahead >= this.start + P.handoff) {
      k += this.flush(Infinity, now);
      const at = this.start + P.handoff;
      if (audible) { this.begin(at, hour, rain, now); k += this.flush(now + M.lookahead, now); }
      else { this.piece = null; this.nextAt = now + 5; }
    }
    this.played += k;
    return k;
  }
  begin(at, hour, rain, now) {
    const T = M.tracks, tr = T[this.n++ % T.length];
    this.piece = compose(tr.seed, 12, 0, tr);
    this.start = at; this.idx = 0; this.track = tr.name;
    const night = hour < 5.5 || hour >= 20.5;
    this.tone.frequency.setTargetAtTime(rain > 0.3 ? M.tone.rain : night ? M.tone.night : M.tone.day, now, 2);
    if (this.starts) this.starts.push({ name: tr.name, at });
  }
  // schedule this track's notes due before `until`
  flush(until, now) {
    const P = this.piece;
    let k = 0;
    while (this.idx < P.notes.length && this.start + P.notes[this.idx].t < until) {
      const nt = P.notes[this.idx++], at = this.start + nt.t;
      if (at < now - 0.15) continue;   // (a stalled frame: let a late note go)
      this.note(nt, Math.max(at, now + 0.01));
      k++;
    }
    return k;
  }
  // (the menu, a tool: start the next piece now)
  next() { this.piece = null; this.nextAt = 0; }

  note(nt, t) {
    if (nt.inst === 'pad') this.pad(t, nt.midi, nt.v, nt.dur);
    else this[nt.inst](t, mtof(nt.midi), nt.v, nt.dur, Math.max(-0.35, Math.min(0.35, (nt.midi - 62) / 40)));
  }
  voice(pan) {
    const g = this.ctx.createGain(), p = this.ctx.createStereoPanner();
    p.pan.value = pan; g.connect(p); p.connect(this.input);
    return g;
  }
  osc(type, f, t, end, out, detune = 0) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(end);
    return o;
  }

  // the felt piano: a soft hammer, a quick early fall, then a long ring
  keys(t, f, v, dur, pan) {
    const K = M.keys, ctx = this.ctx, g = this.voice(pan), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.3;
    lp.frequency.setValueAtTime(Math.min(7000, f * 7), t); lp.frequency.setTargetAtTime(Math.min(3800, f * 2.2), t + 0.01, 0.35);
    lp.connect(g);
    const ring = Math.max(K.decay[1], Math.min(K.decay[0], K.decay[0] - 1.3 * Math.log2(f / 220)));
    const a = v * K.level, off = Math.max(dur, 0.5), end = t + Math.min(ring, off + 1.6) + 0.1;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.007);
    g.gain.setTargetAtTime(a * K.body, t + 0.007, 0.28);
    g.gain.setTargetAtTime(0, t + 0.45, ring / 4.5);
    if (off < ring) g.gain.setTargetAtTime(0, t + off, 0.3);
    this.osc(this.keysWave, f, t, end, lp);
    this.osc(this.keysWave, f, t, end, lp, 3);
  }
  // the soft flute: a slow breath in, a late vibrato
  flute(t, f, v, dur, pan) {
    const F = M.flute, ctx = this.ctx, g = this.voice(pan * 0.5), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = F.low; lp.connect(g);
    const a = v * F.level, end = t + dur + 0.8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.14);
    g.gain.setTargetAtTime(a * 0.85, t + 0.14, 0.4);
    g.gain.setTargetAtTime(0, t + dur, 0.16);
    const o = this.osc(this.fluteWave, f, t, end, lp);
    const lfo = ctx.createOscillator(), dep = ctx.createGain();
    lfo.frequency.value = F.vibrato[0]; dep.gain.setValueAtTime(0, t); dep.gain.linearRampToValueAtTime(0, t + 0.35); dep.gain.linearRampToValueAtTime(f * F.vibrato[1], t + 0.95);
    lfo.connect(dep); dep.connect(o.frequency); lfo.start(t); lfo.stop(end);
    // (its breath: a little noise round the note)
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    src.buffer = this.nz.white; bp.type = 'bandpass'; bp.frequency.value = Math.min(6000, f * 2); bp.Q.value = 1.4;
    bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(a * F.breath * 4, t + 0.08); bg.gain.setTargetAtTime(a * F.breath, t + 0.08, 0.15); bg.gain.setTargetAtTime(0, t + dur, 0.12);
    src.connect(bp); bp.connect(bg); bg.connect(lp); src.start(t, (f * 0.37) % 4); src.stop(end);
  }
  // the pad: each note two soft voices a little apart, swelling in and out
  pad(t, midis, v, dur) {
    const Pd = M.pad, ctx = this.ctx, g = this.voice(0), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(Pd.low[0], t); lp.frequency.linearRampToValueAtTime(Pd.low[1], t + dur * 0.6); lp.frequency.linearRampToValueAtTime(Pd.low[0], t + dur + Pd.release);
    lp.connect(g);
    const a = v * Pd.level, end = t + dur + Pd.release * 1.6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + Pd.attack);
    g.gain.setValueAtTime(a, t + Math.max(Pd.attack, dur)); g.gain.setTargetAtTime(0, t + Math.max(Pd.attack, dur), Pd.release / 3);
    midis.forEach((m, i) => {
      const f = mtof(m), p = ctx.createStereoPanner();
      p.pan.value = (i / (midis.length - 1) - 0.5) * 0.6; p.connect(lp);
      this.osc('triangle', f, t, end, p, -Pd.detune); this.osc('triangle', f, t, end, p, Pd.detune);
    });
  }
  // the bass: a low round note under the chord
  bass(t, f, v, dur) {
    const B = M.bass, ctx = this.ctx, g = this.voice(0), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = B.low; lp.connect(g);
    const a = v * B.level;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.09);
    g.gain.setTargetAtTime(a * 0.55, t + 0.09, 1.4); g.gain.setTargetAtTime(0, t + dur, 0.5);
    this.osc('sine', f, t, t + dur + 2.5, lp); this.osc('triangle', f, t, t + dur + 2.5, lp, 4);
  }
  // a bell: a pure note and its bright partial, dying away
  bell(t, f, v, dur, pan) {
    const Bl = M.bell, g = this.voice(pan), g2 = this.ctx.createGain();
    const a = v * Bl.level, end = t + Bl.decay * 1.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, Bl.decay / 5);
    g2.gain.value = 0.22; g2.connect(g);
    this.osc('sine', f, t, end, g); this.osc('sine', f * 4.02, t, end, g2);
  }
}
