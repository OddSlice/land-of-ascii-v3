// Recording a stage (lib/stage.mjs) to a video file: frames piped into
// ffmpeg as PNG (H.264, yuv420p, faststart), the game's sound taken from
// its OfflineAudioContext (lib/clock.mjs) as a WAV, then trimmed, faded and
// levelled (two-pass loudnorm) and muxed in.
//
//   const rec = startVideo(file, { fps: 60, crf: 17 });
//   await rec.write(png); ... await rec.finish();
//   await takeSound(st, wav); mixSound(video, wav, final, { seconds: 15, lufs: -14 });
import fs from 'node:fs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';

export function startVideo(file, { fps = 60, crf = 17 } = {}) {
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-r', String(fps), '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  return {
    write: (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); }),
    finish: () => new Promise((res) => { ff.on('close', res); ff.stdin.end(); }),
  };
}

// The game's sound, rendered to the end of its offline context, as a WAV.
export async function takeSound(st, file) {
  const n = await st.eval(() => window.__promo.finishAudio());
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(Buffer.from(await st.eval((k) => window.__promo.wav[k], i), 'base64'));
  fs.writeFileSync(file, Buffer.concat(parts));
}

// The sound mixed in: `seconds` long, a short fade in, a fade out over the
// last `fade` seconds, levelled to `lufs` (true peak -1.5 dB).
export function mixSound(video, wav, out, { seconds, lufs = -14, fade = 1.4 }) {
  const pre = `atrim=0:${seconds},asetpts=N/SR/TB,afade=t=in:st=0:d=0.25,afade=t=out:st=${seconds - fade}:d=${fade}`;
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', wav, '-af', `${pre},loudnorm=I=${lufs}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
  const j = JSON.parse((probe.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/) || ['{}'])[0]);
  const ln = `loudnorm=I=${lufs}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', video, '-i', wav, '-filter_complex', `[1:a]${pre},${ln},aresample=48000[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(seconds), '-movflags', '+faststart', out]);
}

export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const lerp = (x, y, t) => x + (y - x) * t;
