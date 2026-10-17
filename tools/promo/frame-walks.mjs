// Peaceful walks, framed: the walk recordings in shots/walks/ (made by
// tools/walk.mjs during development, 1440 x 900 at 25 frames a second;
// one, the dawn-to-dusk tour, at 1278 x 720 with the game's sound) set at
// their own size, never scaled, inside the title screen's stone frame, on
// the game's dark field with its faint letters, 1920 x 1080. No words: the
// loading screen at the start of each recording is cut, and a strip along
// the top is cropped off, where some recordings show the statistics line.
// The picture fades in and out; the frame stays.
//
//   node tools/promo/frame-walks.mjs                 every walk, into dist/walks/
//   node tools/promo/frame-walks.mjs --only road,dusk
//
// The files are large, so they are kept out of git (dist/ is ignored).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launch } from '../lib/browser.mjs';
import { serve, args, ROOT } from '../lib/serve.mjs';

const a = args();
const ONLY = a.only ? String(a.only).split(',') : null;
const SRC = path.join(ROOT, 'shots', 'walks');
const OUT = path.join(ROOT, 'dist', 'walks');
const WORK = path.join(ROOT, 'shots', 'promo-work', 'walks');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const W = 1920, H = 1080, CW = 12;          // the frame's cells: 12 x 24 px, as on the hype images

// The walks: the recording, its name out, and the part of the picture kept
// (w x h at x, y: the 1440 x 900 ones lose 96 px at the top, where the
// statistics line can be, and 12 at the foot, so the height is whole rows).
const BIG = { w: 1440, h: 792, x: 0, y: 96 };
const WALKS = [
  { name: 'dawn-to-dusk', file: 'world-5b-dawn-to-dusk-with-sound.webm', crop: { w: 1272, h: 720, x: 3, y: 0 } },
  { name: 'village-green-day-to-night', file: 'world-green-day.webm', crop: BIG },
  // (the flock: a still, dark loading page until 27 s, and the night falls to
  // black after 265 s)
  { name: 'the-flock', file: 'world-flock-day.webm', crop: BIG, from: 27, to: 265 },
  { name: 'the-villages', file: 'world-village.webm', crop: BIG },
  // (the fort: the recording ends facing a wall)
  { name: 'the-fort', file: 'world-fort.webm', crop: BIG, to: 204.5 },
  { name: 'deer-at-dawn', file: 'world-dawn-deer.webm', crop: BIG },
  { name: 'rain-and-mist', file: 'world-weather.webm', crop: BIG },
  { name: 'the-fort-at-night', file: 'world-fort-night.webm', crop: BIG },
  { name: 'dusk', file: 'world-dusk.webm', crop: BIG },
  { name: 'the-road', file: 'world-road.webm', crop: BIG },
  { name: 'looking-round', file: 'world-pan.webm', crop: BIG },
];

const run = (args) => spawnSync('ffmpeg', ['-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
const probe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }).stdout);

// The part of a recording worth showing. The start: the first moment,
// after the loading screen, that the frame is no longer the dark page
// (sampled four times a second). The end: before a still tail, if the
// recording ends on one (ffmpeg's freeze detector). A walk can also give
// its own `from` and `to` (seconds), where the recording needs it.
function spanOf(w, file, dur) {
  let from = w.from, to = w.to;
  if (from === undefined) {
    const r = run(['-t', '60', '-i', file, '-vf', 'fps=4,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
    const vals = [...r.stderr.matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
    const k = vals.findIndex(([, y]) => y > 30);
    from = k < 0 ? 0 : vals[k][0] + 0.5;
  }
  if (to === undefined) {
    const r = run(['-ss', String(Math.max(0, dur - 60)), '-i', file, '-map', '0:v', '-vf', 'freezedetect=n=0.002:d=2', '-f', 'null', '-']);
    const st = [...r.stderr.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]), en = [...r.stderr.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +m[1]);
    to = dur - 0.3;
    if (st.length > en.length) to = Math.max(0, dur - 60) + st[st.length - 1] - 0.3;
  }
  return { from, to };
}

// The overlay for a picture of w x h: the field with its faint letters, the
// stone frame hugging the picture, and the picture's place clear.
async function overlays(sizes) {
  const { server, url } = await serve();
  const b = await launch('chromium');
  const page = await (await b.newContext({ viewport: { width: W, height: H } })).newPage();
  await page.goto(`${url}/tools/promo/pages/card.html`);
  await page.waitForFunction(() => window.cardReady === true);
  const out = {};
  for (const s of sizes) {
    const file = path.join(WORK, `overlay-${s.w}x${s.h}.png`);
    const data = await page.evaluate(async ({ s, W, H, CW }) => {
      const { drawFrame } = await import('/src/app/title.js');
      await document.fonts.load('600 14px "Cascadia Mono"');
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d');
      // the field: the itch.io page's tile, repeated
      g.fillStyle = '#0d0e12'; g.fillRect(0, 0, W, H);
      g.font = '600 14px "Cascadia Mono"'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const hash = (x, y) => { let v = Math.imul(x % 32, 374761393) ^ Math.imul(y % 16, 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
      const ramp = ['.', '.', ':', '+', '=', '#'];
      for (let y = 0; y < Math.ceil(H / 16); y++) for (let x = 0; x < W / 8; x++) {
        const n = hash(x, y); if (n > 0.16) continue;
        g.fillStyle = n < 0.03 ? 'rgba(255,176,96,0.20)' : 'rgba(220,215,203,0.10)';
        g.fillText(ramp[Math.floor((n / 0.16) * ramp.length)], x * 8 + 4, y * 16 + 8);
      }
      // the frame: 3 cells of stone at the sides, 2 rows and a rail at the top and foot
      const cols = s.w / CW + 6, rows = s.h / (2 * CW) + 6, fw = cols * CW, fh = rows * 2 * CW;
      const fx = Math.round((W - fw) / 2 / CW) * CW, fy = Math.round((H - fh) / 2);
      const f = document.createElement('canvas');
      drawFrame(f, cols, rows, CW, 1);
      g.drawImage(f, fx, fy);
      const px = fx + 3 * CW, py = fy + 3 * 2 * CW;
      g.clearRect(px, py, s.w, s.h);
      return { png: c.toDataURL('image/png'), px, py };
    }, { s, W, H, CW });
    fs.writeFileSync(file, Buffer.from(data.png.split(',')[1], 'base64'));
    out[`${s.w}x${s.h}`] = { file, x: data.px, y: data.py };
  }
  await b.close(); server.close();
  return out;
}

const list = WALKS.filter((w) => !ONLY || ONLY.includes(w.name));
const ov = await overlays([...new Map(list.map((w) => [`${w.crop.w}x${w.crop.h}`, w.crop])).values()]);
const report = [];
for (const w of list) {
  const src = path.join(SRC, w.file), info = probe(src);
  const hasSound = info.streams.some((s) => s.codec_type === 'audio');
  let dur = +info.format.duration;
  if (!Number.isFinite(dur)) dur = +spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout.trim().split('\n').pop();
  const span = spanOf(w, src, dur), start = span.from, len = Math.floor((span.to - start) * 25) / 25;
  const o = ov[`${w.crop.w}x${w.crop.h}`], c = w.crop;
  const out = path.join(OUT, `land-of-ascii-walk-${w.name}.mp4`);
  const vf = `[0:v]crop=${c.w}:${c.h}:${c.x}:${c.y},fps=25,setpts=PTS-STARTPTS,fade=t=in:st=0:d=1.5,fade=t=out:st=${(len - 2).toFixed(2)}:d=2,pad=${W}:${H}:${o.x}:${o.y}:color=0x0d0e12[v];[v][1:v]overlay=0:0,format=yuv420p[out]`;
  const af = hasSound ? `;[0:a]asetpts=PTS-STARTPTS,afade=t=in:st=0:d=1.5,afade=t=out:st=${(len - 2).toFixed(2)}:d=2,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]` : '';
  const r = run(['-loglevel', 'error', '-y', '-ss', start.toFixed(2), '-t', len.toFixed(2), '-i', src, '-i', o.file, '-filter_complex', vf + af,
    '-map', '[out]', ...(hasSound ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '160k'] : []), '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-r', '25', '-movflags', '+faststart', out]);
  if (r.status) { console.log(w.name, r.stderr.slice(-800)); continue; }
  const mb = +(fs.statSync(out).size / 1e6).toFixed(1);
  report.push({ name: w.name, from: w.file, start: +start.toFixed(2), seconds: +len.toFixed(2), sound: hasSound, mb });
  console.log(`${w.name}: ${len.toFixed(1)} s from ${start.toFixed(1)} s${hasSound ? ', with sound' : ''}, ${mb} MB`);
}
fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 1));
