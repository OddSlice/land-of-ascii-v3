// The 30-second trailer: recorded from the real game, frame by frame.
//
//   node tools/promo/trailer.mjs                 promo/video/land-of-ascii-trailer.mp4
//   node tools/promo/trailer.mjs --preview 15    every 15th frame as a PNG (no video), to check a cut
//
// The game is opened as a visitor opens it (lib/stage.mjs): the built
// play.html, drawn on the page, every clock held and stepped exactly 1/60 s
// a frame, Math.random seeded, the game's own font. Each frame is captured
// with Chrome's screenshot command and piped into ffmpeg (H.264, CRF 16,
// yuv420p, faststart). The sound is the game's own: its engine runs on an
// OfflineAudioContext kept in step with the frames (lib/clock.mjs), so the
// music, the wind, the water, the footsteps and the birds are rendered
// sample-exact with the picture, then levelled to -15 LUFS and mixed in.
// The cursor, the captions, the cuts in letters and the end card are drawn
// over the game by lib/overlay.js. Same input, same picture, every run (the
// sound matches to within one 16-bit step: Chrome's audio renderer rounds).
//
// The story (60 frames a second, 1,800 in all):
//   A   0.0 s  the title screen; a cursor clicks Play
//   B   2.9 s  up the road, Rose Cobb comes to meet you; a greeting, her
//              favour, and the cursor takes it ("I'll do it")
//   C  11.5 s  in the pasture by the flock: K sketches the view, the
//              journal opens on the sketch
//   D  15.5 s  four views, dawn to night: the lake, the green, the bridge,
//              the fort (cuts in letters between them)
//   E  26.0 s  the end card: the name, PLAY LAND OF ASCII NOW, ODDSLICE.ITCH.IO
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { args } from '../lib/serve.mjs';
import { openStage, ROOT, writePng } from './lib/stage.mjs';

const a = args();
const PREVIEW = a.preview ? Number(a.preview) : 0;
const OUT = path.join(ROOT, 'promo', 'video');
const WORK = path.join(ROOT, 'shots', 'promo-work');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const FPS = 60, TOTAL = 30 * FPS, AUDIO = 31;
const VIDEO = path.join(WORK, 'trailer-picture.mp4'), WAV = path.join(WORK, 'trailer-sound.wav'), FINAL = path.join(OUT, 'land-of-ascii-trailer.mp4');

// ---- the timeline (frames) ----
const T = {
  click: 168, cutB: 168,
  capB: [196, 344], greetBy: 330, cursorB: [440, 500], clickB: 512, byeB: 604,
  cutC: 690, capC: [704, 820], sketch: 772, journal: 850,
  cutD: [930, 1088, 1246, 1404], capD: [954, 1090],
  cutE: 1560, end: TOTAL,
};
const CUT = 26;              // a cut in letters lasts this many frames
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (x, y, t) => x + (y - x) * t;

// ---- the views (seed 3): a fixed camera, how it moves, its hour ----
// (move: metres forward, metres to the right, degrees of turn, over the shot)
const VIEWS = [
  { cam: 1, hour: 6.62, fwd: 0, side: 1.5, turn: -7, pitch: 0 },          // Still Mere at dawn
  { cam: 13, hour: 12.2, fwd: 3, side: 0, turn: 5, pitch: 0 },           // Dunholme's well and chapel at midday
  { cam: 19, hour: 17.3, fwd: 2.5, side: 0, turn: 5, pitch: 0 },          // the bridge over the Skell, evening
  { cam: 8, hour: 23.0, fwd: 7, side: 0, turn: -3, pitch: 0 },            // the fort from the road, night
];

const st = await openStage({ width: 1920, height: 1080, audio: PREVIEW ? 0 : AUDIO });
const { page } = st;
await page.addScriptTag({ type: 'module', url: `${st.url}/tools/promo/lib/overlay.js` });
await page.waitForFunction(() => window.__ov && window.__ov.ready);
await st.eval(() => window.lab.setHud(false));
if (!PREVIEW) {
  await st.eval(() => { window.lab.sound.enable(); window.__promo.audioStart(); window.lab.sound.nextPiece(); });
}

// the encoder
let ff = null;
if (!PREVIEW) {
  ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', VIDEO], { stdio: ['pipe', 'inherit', 'inherit'] });
}
const write = (buf) => new Promise((res) => { if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res); });

// ---- helpers in the page ----
const ov = (fn, arg) => page.evaluate(([f, x]) => window.__ov[f](...x), [fn, arg]);
const center = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
async function place(pose) {
  await st.eval((p) => {
    const L = window.lab, y = p.y !== undefined ? p.y : Math.max(L.ground(p.x, p.z).ground, L.ground(p.x, p.z).surface) + 1.7;
    L.setCamera({ x: p.x, z: p.z, y, yaw: p.yaw, pitch: p.pitch });
  }, pose);
}
const camPose = (i) => st.eval((k) => { const c = window.lab.cameras[k]; return { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch, y: c.y }; }, i);
function moved(p0, v, t) {
  const yaw = (p0.yaw + v.turn * t) * Math.PI / 180, f = (v.fwd || 0) * t, s = (v.side || 0) * t;
  return { x: p0.x + Math.sin(yaw) * f + Math.cos(yaw) * s, z: p0.z + Math.cos(yaw) * f - Math.sin(yaw) * s, yaw: p0.yaw + v.turn * t, pitch: p0.pitch + (v.pitch || 0) * t };
}

// a cut in letters: the frame just shown breaks up over the next CUT frames
let lastShot = null, cutAt = -1;
async function startCut(f) { await ov('setCut', [`data:image/png;base64,${lastShot.toString('base64')}`]); cutAt = f; }

// ---- the frames ----
let walking = false, stoppedAt = -1, viewIdx = -1, viewP0 = null, meetName = null, sketchId = null;
const t0 = Date.now();
for (let f = 0; f < TOTAL; f++) {
  // -- A: the title, and the cursor --
  if (f <= T.click) {
    const play = await center('#title .choice.main');
    if (f >= 18 && play) {
      const t = ease((f - 18) / 128), x = lerp(1560, play.x + 40, t), y = lerp(930, play.y + 6, t);
      if (f === 120) await page.mouse.move(play.x + 40, play.y + 6);
      const down = f >= T.click - 4 && f < T.click + 2;
      await ov('setCursor', [{ x, y, down, ring: f >= T.click ? (f - T.click) / 14 : 0 }]);
      if (f === T.click) await page.mouse.click(play.x + 40, play.y + 6);
    }
  }
  // -- B: up the road to meet Rose Cobb --
  if (f === T.cutB) {
    await startCut(f);
    await ov('setCursor', [null]);
    // (Play's click leaves the title a few frames later: leave it now, so the
    // place set below is not overwritten; the cut starts from the title)
    await st.eval(() => { window.lab.titlePlay(); window.lab.setWeather('fair'); });
    await ov('tidy', [false, true]);
    const m = await st.eval(() => window.lab.progress.meet());
    meetName = m.name;
    // 13 m short of where she will wait, on the line from the spawn, facing her
    const s = await st.eval(() => window.lab.state());
    const dx = m.spot.x - s.x, dz = m.spot.z - s.z, L = Math.hypot(dx, dz), k = (L - 13.5) / L;
    await st.eval(({ x, z, yaw, hour }) => { const Lb = window.lab; Lb.setFly(false); Lb.setCamera({ x, z, yaw, pitch: -2 }); Lb.setHour(hour); Lb.runClock(true); }, { x: s.x + dx * k, z: s.z + dz * k, yaw: Math.atan2(dx, dz) * 180 / Math.PI, hour: m.arrive - 2.6 / 3600 });
    await page.keyboard.down('KeyW'); walking = true;
  }
  if (f > T.cutB && f < T.cutC) {
    if (walking) {
      const r = await st.eval((name) => { const p = window.lab.people.list().find((q) => q.name === name); const s = window.lab.state(); return { d: Math.hypot(p.x - s.x, p.z - s.z), yaw: Math.atan2(p.x - s.x, p.z - s.z) * 180 / Math.PI }; }, meetName);
      await st.eval((y) => window.lab.face(y), r.yaw);
      if (r.d < 2.6 || f >= T.greetBy) { await page.keyboard.up('KeyW'); walking = false; stoppedAt = f; }
    }
    // (a moment to stop and for her to turn to you, then E greets her)
    if (stoppedAt >= 0 && f === stoppedAt + 22) { await st.eval((name) => { const p = window.lab.people.list().find((q) => q.name === name); const s = window.lab.state(); window.lab.face(Math.atan2(p.x - s.x, p.z - s.z) * 180 / Math.PI); }, meetName); await page.keyboard.press('KeyE'); }
    if (stoppedAt >= 0 && f === stoppedAt + 24 && !(await st.eval(() => !!document.querySelector('#talk.on')))) throw new Error(`the greeting did not open an exchange (frame ${f})`);
    // the cursor takes the favour ("I'll do it"), then says farewell (the
    // exchange holds the world still until it is closed)
    if (f >= T.cursorB[0] && f < T.byeB + 24) {
      const yes = await center('#talk.on button.yes');
      if (yes) {
        const t = ease((f - T.cursorB[0]) / (T.cursorB[1] - T.cursorB[0])), x = lerp(760, yes.x, t), y = lerp(1075, yes.y + 4, t);
        const at = f < T.byeB - 30 ? T.clickB : T.byeB;
        if (f === T.cursorB[1] || f === T.byeB - 10) await page.mouse.move(yes.x, yes.y);
        await ov('setCursor', [{ x, y, down: f >= at - 4 && f < at + 2, ring: f >= at && f < at + 14 ? (f - at) / 14 : 0 }]);
        if (f === T.clickB || f === T.byeB) await page.mouse.click(yes.x, yes.y);
      } else await ov('setCursor', [null]);
    }
    if (f === T.byeB + 24) await ov('setCursor', [null]);
  }
  // -- C: by the flock, a sketch --
  if (f === T.cutC) {
    await startCut(f);
    await ov('setCursor', [null]);
    await ov('tidy', [false, true, true]);          // (the first favour's tip about the journal: not now)
    const p = await camPose(23);
    await place({ ...p, yaw: p.yaw - 4 });
    await st.eval(() => { const L = window.lab; L.setFly(true); L.setWeather('fair'); L.setHour(10.5); L.runClock(true); });
  }
  if (f > T.cutC && f < T.cutD[0]) {
    const p = await camPose(23), t = (f - T.cutC) / (T.cutD[0] - T.cutC);
    await place({ ...p, yaw: p.yaw - 4 + 3 * t });
    if (f === T.sketch) { await page.keyboard.press('KeyK'); }
    if (f === T.journal) {
      sketchId = await st.eval(() => { const d = window.lab.progress.journal.data(); return d && d.sketches.length ? d.sketches[d.sketches.length - 1].id : null; });
      if (sketchId !== null) await st.eval((id) => { window.lab.progress.journal.open('sketches'); window.lab.progress.journal.view(id); }, sketchId);
    }
  }
  // -- D: the views, dawn to night --
  const vi = T.cutD.findIndex((c) => c === f);
  if (vi >= 0) {
    await startCut(f);
    // (the views: the journal shut, and the mended cloak put away, so the
    // land is seen on its own)
    if (vi === 0) await st.eval(() => { const L = window.lab; L.progress.journal.shut(); L.progress.journal.close(); const fv = L.progress.favours().find((x) => x.first); if (fv) L.progress.setFavour(fv.id, 0); });
    await ov('tidy', [true, true]);
    const v = VIEWS[vi];
    let p0 = await camPose(v.cam);
    if (v.closer) { const y = p0.yaw * Math.PI / 180; p0 = { ...p0, x: p0.x + Math.sin(y) * v.closer, z: p0.z + Math.cos(y) * v.closer, y: undefined }; }
    viewIdx = vi; viewP0 = p0;
    await st.eval((h) => { const L = window.lab; L.setFly(true); L.setWeather('fair'); L.setHour(h); L.runClock(true); }, v.hour);
  }
  if (viewIdx >= 0) {
    const start = T.cutD[viewIdx], stop = viewIdx < 3 ? T.cutD[viewIdx + 1] : TOTAL;
    const t = (f - start) / (stop - start);
    await place({ ...moved(viewP0, VIEWS[viewIdx], ease(t) * 0.6 + t * 0.4), y: viewP0.y });
  }
  // -- E: the end card --
  if (f === T.cutE) { await startCut(f); await ov('setEnd', [true]); }

  // -- captions --
  const caption = (range, text) => {
    if (f < range[0] || f >= range[1] + text.length) return null;
    const typed = (f - range[0]) * 1.1;
    const shown = f < range[1] ? typed : text.length - (f - range[1]) * 1.6;
    return [text, shown];
  };
  const c = caption(T.capB, 'Meet the people who live here.') || caption(T.capC, 'Stop anywhere and sketch the view.') || caption(T.capD, 'From first light to the last lamp.');
  await ov('setCaption', c || [null, 0]);
  // -- the cut in progress --
  await ov('drawCut', [cutAt >= 0 ? (f - cutAt) / CUT : 1]);
  if (cutAt >= 0 && f - cutAt >= CUT) cutAt = -1;

  await st.step(1);
  const png = await st.shot();
  lastShot = png;
  if (PREVIEW) { if (f % PREVIEW === 0) writePng(path.join(WORK, 'preview', `f${String(f).padStart(4, '0')}.png`), png); }
  else await write(png);
  if (f % 120 === 0) console.log(`frame ${f} of ${TOTAL}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
console.log('errors', st.errors);

if (!PREVIEW) {
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  const n = await st.eval(() => window.__promo.finishAudio());
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(Buffer.from(await st.eval((k) => window.__promo.wav[k], i), 'base64'));
  fs.writeFileSync(WAV, Buffer.concat(parts));
}
await st.close();
if (PREVIEW) process.exit(0);

// ---- the sound mixed in: trimmed to 30.0 s, faded at the end, levelled to -15 LUFS (two passes) ----
const pre = 'atrim=0:30,asetpts=N/SR/TB,afade=t=in:st=0:d=0.25,afade=t=out:st=28.4:d=1.6';
const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', WAV, '-af', `${pre},loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' });
const j = JSON.parse((probe.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/) || ['{}'])[0]);
const ln = `loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', VIDEO, '-i', WAV, '-filter_complex', `[1:a]${pre},${ln},aresample=48000[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', '30', '-movflags', '+faststart', FINAL]);
console.log(`wrote ${path.relative(ROOT, FINAL)} (${(fs.statSync(FINAL).size / 1e6).toFixed(1)} MB)`);
