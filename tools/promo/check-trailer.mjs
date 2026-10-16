// Checks the trailer file the way a reviewer would:
//  - exactly 30.0 s, 1920 x 1080, 60 frames a second, 1,800 frames;
//  - sound all the way through: the level of every second (none silent);
//  - the loudness over the whole (about -15 LUFS);
//  - a contact sheet (a frame every 2 s) and a still of the end card.
//
//   node tools/promo/check-trailer.mjs [promo/video/land-of-ascii-trailer.mp4]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../lib/serve.mjs';

const FILE = path.resolve(process.argv[2] || path.join(ROOT, 'promo', 'video', 'land-of-ascii-trailer.mp4'));
const OUT = path.join(ROOT, 'shots', 'promo-work', 'check');
fs.mkdirSync(OUT, { recursive: true });
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });

const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', FILE]).stdout);
const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio');
const fps = v.r_frame_rate.split('/').reduce((x, y) => x / y);
const facts = {
  file: path.relative(ROOT, FILE), mb: +(fs.statSync(FILE).size / 1e6).toFixed(1),
  duration: +(+probe.format.duration).toFixed(3), video: { codec: v.codec_name, w: v.width, h: v.height, fps, frames: +v.nb_read_frames, pix: v.pix_fmt },
  audio: a ? { codec: a.codec_name, rate: +a.sample_rate, channels: a.channels, duration: +(+a.duration).toFixed(3) } : null,
};

// the level of each second (RMS, dB), and the whole's loudness
const levels = [];
for (let s = 0; s < 30; s++) {
  const r = run('ffmpeg', ['-hide_banner', '-ss', String(s), '-t', '1', '-i', FILE, '-vn', '-af', 'astats=measure_overall=RMS_level+Peak_level:measure_perchannel=none', '-f', 'null', '-']);
  const rms = +(r.stderr.match(/RMS level dB:\s*(-?[\d.inf]+)/) || [])[1];
  const peak = +(r.stderr.match(/Peak level dB:\s*(-?[\d.inf]+)/) || [])[1];
  levels.push({ s, rms: Number.isFinite(rms) ? +rms.toFixed(1) : -120, peak: Number.isFinite(peak) ? +peak.toFixed(1) : -120 });
}
const lufs = (() => { const r = run('ffmpeg', ['-hide_banner', '-i', FILE, '-vn', '-af', 'ebur128', '-f', 'null', '-']); const m = r.stderr.match(/I:\s*(-?[\d.]+) LUFS/g); return m ? +m.pop().match(/-?[\d.]+/)[0] : null; })();

// the contact sheet (every 2 s) and the end card (at 29 s)
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', FILE, '-vf', 'fps=0.5,scale=480:-1,tile=5x3:padding=4', '-frames:v', '1', path.join(OUT, 'contact-sheet.png')]);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '29', '-i', FILE, '-frames:v', '1', path.join(OUT, 'end-card.png')]);

const silent = levels.filter((l) => l.rms < -50);
const ok = facts.duration >= 29.98 && facts.duration <= 30.02 && v.width === 1920 && v.height === 1080 && Math.abs(fps - 60) < 1e-6 && +v.nb_read_frames === 1800 && a && !silent.length;
fs.writeFileSync(path.join(OUT, 'trailer-check.json'), JSON.stringify({ ...facts, lufs, levels, ok }, null, 1));
console.log(JSON.stringify(facts));
console.log(`loudness ${lufs} LUFS; level each second (RMS dB): ${levels.map((l) => l.rms).join(' ')}`);
console.log(silent.length ? `SILENT seconds: ${silent.map((l) => l.s).join(', ')}` : 'sound in every second');
console.log(ok ? 'PASS' : 'FAIL');
