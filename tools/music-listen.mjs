// (phase 6) The music pass, by measurement, for what a listener would hear
// wrong, and the record of every tune:
// - clashes: each note against the chord the pad holds when it starts, in
//   Node from the composer itself (src/sound/music.js): a semitone, or a
//   tritone, against a chord tone;
// - clicks and harshness: from the rendered loop (shots/music/music-loop.wav,
//   tools/music-check.mjs): a sample-to-sample jump far above the moment's
//   loudness, and the share of the sound above 4 kHz;
// - the tunes: each track's notes, by name, so they can be checked by ear
//   against anything they might resemble.
//
//   node tools/music-listen.mjs
import fs from 'node:fs';
import path from 'node:path';
import { compose } from '../src/sound/music.js';
import { SOUND } from '../src/sound/palette.js';
import { ROOT } from './lib/serve.mjs';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const name = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };

say('## clashes (a note against the chord the pad holds as it starts; the pad\'s own notes too)\n');
for (const tr of SOUND.music.tracks) {
  const P = compose(tr.seed, 12, 0, tr);
  const pads = P.notes.filter((n) => n.inst === 'pad');
  let semis = 0, tris = 0, total = 0;
  const bad = [];
  for (const n of P.notes) {
    if (n.inst === 'pad') continue;
    const pad = pads.filter((p) => p.t <= n.t + 0.05 && p.t + p.dur > n.t).pop();
    if (!pad) continue;
    total++;
    for (const m of pad.midi) {
      const d = Math.abs(n.midi - m);
      // (a semitone, or a semitone and an octave, rubs; a major seventh
      // an octave apart is the chord's own colour, and not counted)
      if (d === 1 || d === 13) { semis++; bad.push(`${n.inst} ${name(n.midi)} against ${name(m)} at ${n.t.toFixed(1)} s`); break; }
      if (d % 12 === 6 && n.inst === 'bass') { tris++; bad.push(`bass ${name(n.midi)} a tritone from ${name(m)} at ${n.t.toFixed(1)} s`); break; }
    }
  }
  let inner = 0; for (const p of pads) for (let i = 0; i < p.midi.length; i++) for (let j = i + 1; j < p.midi.length; j++) if (Math.abs(p.midi[i] - p.midi[j]) === 1) inner++;
  say(`${tr.name}: ${inner} chords with two notes a semitone apart;`);
  say(`${tr.name}: ${total} notes over a chord; ${semis} a semitone (or a semitone and an octave) from a note the pad holds; ${tris} bass notes a tritone from one`);
  for (const b of bad.slice(0, 6)) say(`  ${b}`);
}

say('\n## the tunes\n');
for (const tr of SOUND.music.tracks) {
  const P = compose(tr.seed, 12, 0, tr);
  const lead = P.notes.filter((n) => n.inst === tr.lead && (tr.lead === 'flute' || n.midi >= (P.root + 12)));
  say(`${tr.name} (${tr.mode}, root ${name(tr.root)}, ${tr.bpm} bpm, the tune on the ${tr.lead === 'keys' ? 'piano' : 'flute'}): ${lead.map((n) => name(n.midi)).join(' ')}`);
}

// the rendered loop
const wav = path.join(ROOT, 'shots', 'music', 'music-loop.wav');
if (fs.existsSync(wav)) {
  const b = fs.readFileSync(wav), rate = b.readUInt32LE(24), n = (b.length - 44) / 4;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = b.readInt16LE(44 + i * 4) / 32768;
  // clicks: a jump between samples over 12 times the moment's mean jump, and over 0.02
  let clicks = 0;
  const W = 2048;
  for (let s = 0; s + W < n; s += W) {
    let mean = 0; for (let i = s + 1; i < s + W; i++) mean += Math.abs(L[i] - L[i - 1]); mean /= W;
    for (let i = s + 1; i < s + W; i++) if (Math.abs(L[i] - L[i - 1]) > Math.max(0.02, 12 * mean)) { clicks++; break; }
  }
  // above 4 kHz: what a first difference filter (a rough high-pass) keeps, against the whole
  let hi = 0, all = 0;
  const a = Math.exp(-2 * Math.PI * 4000 / rate);
  let lp = 0;
  for (let i = 0; i < n; i++) { lp = a * lp + (1 - a) * L[i]; const h = L[i] - lp; hi += h * h; all += L[i] * L[i]; }
  say(`\n## the rendered loop (${(n / rate).toFixed(0)} s)\n`);
  say(`clicks (a jump far over the moment's): ${clicks} of ${Math.floor(n / W)} blocks of ${W} samples`);
  say(`share of the sound above about 4 kHz: ${(100 * hi / all).toFixed(2)}%`);
} else say('\n(no rendered loop: run tools/music-check.mjs first)');
fs.mkdirSync(path.join(ROOT, 'shots', 'phase6'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'shots', 'phase6', 'music-listen.txt'), `${lines.join('\n')}\n`);
