// (0.5.3) The music, heard offline: whole pieces for a few hours and
// weathers, rendered in the browser on an OfflineAudioContext through the
// game's own chain (the music's level at the default settings, the
// limiter), to WAV files to listen to (shots/music/, kept out of git), with
// each piece's loudest sample, its loudness and how many notes it played.
//
//   node tools/music-check.mjs [--seed 3] [--solo keys|flute|pad|bass|bell]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';

const a = args();
const seed = Number(a.seed || 3), solo = a.solo ? String(a.solo) : null;
const OUT = path.join(ROOT, 'shots', 'music');
fs.mkdirSync(OUT, { recursive: true });
const cases = [['dawn', 6.2, 0], ['midday', 12, 0], ['dusk', 18.6, 0], ['night', 23, 0], ['rain by day', 13, 1]];
const { server, url } = await serve();
const browser = await launch('chromium');
let ok = true;
try {
  const page = await browser.newPage();
  await page.goto(`${url}/src/index.html?quiet=1`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (const [name, hour, rain] of cases) {
    const k = cases.findIndex((c) => c[0] === name);
    const r = await page.evaluate(async ({ url, seed, hour, rain, k, solo }) => {
      const { Music, compose } = await import(`${url}/src/sound/music.js`);
      const { noiseBuffers } = await import(`${url}/src/sound/synth.js`);
      const { SOUND } = await import(`${url}/src/sound/palette.js`);
      const piece = compose(seed * 1009 + k, hour, rain), rate = 44100, secs = Math.ceil(piece.length + 6);
      const ctx = new OfflineAudioContext(2, rate * secs, rate);
      const L = SOUND.limit, lim = ctx.createDynamicsCompressor();
      lim.threshold.value = L.threshold; lim.knee.value = L.knee; lim.ratio.value = L.ratio; lim.attack.value = L.attack; lim.release.value = L.release;
      lim.connect(ctx.destination);
      const m = new Music(ctx, lim, noiseBuffers(ctx), seed);
      m.out.gain.value = SOUND.master * SOUND.music.default * SOUND.music.level;
      m.seed = seed; m.n = k; m.nextAt = 0;
      if (solo) { const play = m.note.bind(m); m.note = (nt, t) => { if (nt.inst === solo) play(nt, t); }; }
      // (the frames: every 50 ms of the piece, as the game would)
      for (let t = 0; t < secs - 1; t += 0.05) m.update(t, hour, rain, true);
      const buf = await ctx.startRendering();
      const l = buf.getChannelData(0), rr = buf.getChannelData(1);
      let peak = 0, sum = 0;
      for (let i = 0; i < l.length; i++) { const v = Math.max(Math.abs(l[i]), Math.abs(rr[i])); if (v > peak) peak = v; sum += l[i] * l[i] + rr[i] * rr[i]; }
      // the loudest second's loudness
      let loudest = 0;
      for (let s = 0; s + rate <= l.length; s += rate) { let q = 0; for (let i = s; i < s + rate; i++) q += l[i] * l[i]; loudest = Math.max(loudest, Math.sqrt(q / rate)); }
      // 16-bit WAV
      const n = l.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
      wav.setUint32(24, rate, true); wav.setUint32(28, rate * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); str(36, 'data'); wav.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, rr[i])) * 32767, true); }
      const bytes = new Uint8Array(wav.buffer); let b64 = '';
      for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { mode: piece.mode, bpm: piece.bpm, lead: piece.lead, secs: piece.length, notes: m.played, peak, rms: Math.sqrt(sum / (2 * l.length)), loudest, wav: btoa(b64) };
    }, { url, seed, hour, rain, k, solo });
    const file = path.join(OUT, `music-${name.replace(/ /g, '-')}${solo ? `-${solo}` : ''}.wav`);
    fs.writeFileSync(file, Buffer.from(r.wav, 'base64'));
    const dB = (v) => (20 * Math.log10(Math.max(1e-9, v))).toFixed(1);
    if (r.peak >= 1) ok = false;
    console.log(`${name.padEnd(12)} ${r.mode.padEnd(10)} ${r.bpm.toFixed(0)} bpm, ${r.lead.padEnd(5)} ${r.secs.toFixed(0)} s, ${r.notes} notes; peak ${r.peak.toFixed(3)} (${dB(r.peak)} dB), loudness ${dB(r.rms)} dB, loudest second ${dB(r.loudest)} dB -> ${path.relative(ROOT, file)}`);
  }
} finally { await browser.close(); server.close(); }
console.log(ok ? 'music check: no clipping' : 'music check: CLIPS');
process.exit(ok ? 0 : 1);
