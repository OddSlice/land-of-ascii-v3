// (0.5.3) The music, heard offline: the three tracks played in turn, as
// the game plays them (each beginning under the last one's closing chord),
// and on into the first again, rendered in the browser on an
// OfflineAudioContext through the game's own chain (the music's level at
// the default settings, the limiter), to one WAV file to listen to
// (shots/music/, kept out of git), with each track's loudest sample, its
// loudness and its notes, and the loudest moment of each hand-off.
//
//   node tools/music-check.mjs [--hour 12] [--rain 0]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';

const a = args();
const hour = Number(a.hour ?? 12), rain = Number(a.rain || 0);
const OUT = path.join(ROOT, 'shots', 'music');
fs.mkdirSync(OUT, { recursive: true });
const { server, url } = await serve();
const browser = await launch('chromium');
let ok = true;
try {
  const page = await browser.newPage();
  await page.goto(`${url}/src/index.html?quiet=1`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  const r = await page.evaluate(async ({ url, hour, rain }) => {
    const { Music, compose } = await import(`${url}/src/sound/music.js`);
    const { noiseBuffers } = await import(`${url}/src/sound/synth.js`);
    const { SOUND } = await import(`${url}/src/sound/palette.js`);
    const T = SOUND.music.tracks, rate = 44100;
    // (the whole loop, and 25 s into the first track again)
    const loop = T.reduce((s, tr) => s + compose(tr.seed, 12, 0, tr).handoff, 0), secs = Math.ceil(0.1 + loop + 25);
    const ctx = new OfflineAudioContext(2, rate * secs, rate);
    const L = SOUND.limit, lim = ctx.createDynamicsCompressor();
    lim.threshold.value = L.threshold; lim.knee.value = L.knee; lim.ratio.value = L.ratio; lim.attack.value = L.attack; lim.release.value = L.release;
    lim.connect(ctx.destination);
    const m = new Music(ctx, lim, noiseBuffers(ctx), 0);
    m.out.gain.value = SOUND.master * SOUND.music.default * SOUND.music.level;
    m.nextAt = 0; m.starts = [];
    const counts = [];
    // (the frames: every 50 ms, as the game would)
    for (let t = 0; t < secs - 1; t += 0.05) { const k = m.update(t, hour, rain, true); counts[m.starts.length - 1] = (counts[m.starts.length - 1] || 0) + k; }
    const buf = await ctx.startRendering();
    const l = buf.getChannelData(0), rr = buf.getChannelData(1);
    const stats = (t0, t1) => {
      let peak = 0, sum = 0, n = 0;
      for (let i = Math.floor(t0 * rate); i < Math.min(l.length, t1 * rate); i++) { const v = Math.max(Math.abs(l[i]), Math.abs(rr[i])); if (v > peak) peak = v; sum += l[i] * l[i] + rr[i] * rr[i]; n += 2; }
      return { peak, rms: Math.sqrt(sum / Math.max(1, n)) };
    };
    const tracks = m.starts.map((s, i) => ({ name: s.name, at: s.at, secs: (m.starts[i + 1] ? m.starts[i + 1].at : secs) - s.at, notes: counts[i] || 0, ...stats(s.at, m.starts[i + 1] ? m.starts[i + 1].at : secs) }));
    // each hand-off: 6 s either side, and the quietest second there (no hole)
    const joins = m.starts.slice(1).map((s) => {
      let quiet = Infinity;
      for (let t = s.at - 6; t < s.at + 6; t += 0.5) quiet = Math.min(quiet, stats(t, t + 1).rms);
      return { at: s.at, into: s.name, ...stats(s.at - 6, s.at + 6), quiet };
    });
    const all = stats(0, secs);
    // 16-bit WAV
    const n = l.length, wav = new DataView(new ArrayBuffer(44 + n * 4));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); wav.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt '); wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 2, true);
    wav.setUint32(24, rate, true); wav.setUint32(28, rate * 4, true); wav.setUint16(32, 4, true); wav.setUint16(34, 16, true); str(36, 'data'); wav.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { wav.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l[i])) * 32767, true); wav.setInt16(46 + i * 4, Math.max(-1, Math.min(1, rr[i])) * 32767, true); }
    const bytes = new Uint8Array(wav.buffer); let b64 = '';
    for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return { tracks, joins, loop, all, secs, wav: b64 };
  }, { url, hour, rain });
  const file = path.join(OUT, `music-loop${rain ? '-rain' : ''}${hour !== 12 ? `-${hour}h` : ''}.wav`);
  fs.writeFileSync(file, Buffer.from(r.wav, 'binary'));
  const dB = (v) => (20 * Math.log10(Math.max(1e-9, v))).toFixed(1);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  for (const t of r.tracks) console.log(`${mmss(t.at)}  ${t.name.padEnd(14)} ${t.secs.toFixed(0)} s, ${t.notes} notes; peak ${t.peak.toFixed(3)}, loudness ${dB(t.rms)} dB`);
  for (const j of r.joins) console.log(`hand-off into ${j.into} at ${mmss(j.at)}: peak ${j.peak.toFixed(3)}, loudness ${dB(j.rms)} dB, quietest second ${dB(j.quiet)} dB`);
  console.log(`the loop: ${mmss(r.loop)}, then round again; whole render peak ${r.all.peak.toFixed(3)}, loudness ${dB(r.all.rms)} dB -> ${path.relative(ROOT, file)}`);
  if (r.all.peak >= 1) ok = false;
} finally { await browser.close(); server.close(); }
console.log(ok ? 'music check: no clipping' : 'music check: CLIPS');
process.exit(ok ? 0 : 1);
