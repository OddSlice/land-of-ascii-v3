// Recording a vertical video (1080 x 1920, 60 frames a second) from the
// game: the stage (lib/stage.mjs) at 540 x 960 CSS pixels and two device
// pixels each, the overlay (lib/overlay.js) over it, each frame captured
// once drawn and piped into ffmpeg, the game's own sound mixed in.
// Used by tiktok.mjs (captions, cuts in letters, an end card) and
// tiktok-walks.mjs (a border and a fade, nothing else).
//
// spec: { seconds, frame(f, api), cuts: [frames], captions: [[from, to,
//   text]], end: frame (the end card from there; none if left out),
//   sound: { group: level }, border: true (the stone frame round the
//   picture), fade: [seconds in, seconds out] (from and to the dark) }
// opts: { out, work, preview: every nth frame as a PNG, no video,
//   dump: [frames to keep], prefix: the file name's start }
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { openStage, ROOT, writePng } from './stage.mjs';
import { startVideo, takeSound, mixSound } from './record.mjs';

const FPS = 60, CUT = 26;

export async function record(name, spec, { out: OUT, work: WORK, preview: PREVIEW = 0, dump: DUMP = [], prefix = 'land-of-ascii-' } = {}) {
  const total = Math.round(spec.seconds * FPS), END = spec.end !== undefined ? spec.end : Infinity;
  const st = await openStage({ width: 540, height: 960, dpr: 2, density: 2, audio: PREVIEW ? 0 : spec.seconds + 1 });
  const { page } = st;
  await page.addScriptTag({ type: 'module', url: `${st.url}/tools/promo/lib/overlay.js` });
  await page.waitForFunction(() => window.__ov && window.__ov.ready);
  await st.eval(() => { const L = window.lab; L.setHud(false); L.titlePlay(); });
  if (!PREVIEW) {
    await st.eval((g) => { const L = window.lab; L.sound.enable(); for (const [k, v] of Object.entries(g)) L.sound.set(k, v); window.__promo.audioStart(); L.sound.nextPiece(); }, spec.sound || {});
  }
  const ov = (fn, ...x) => page.evaluate(([f, y]) => window.__ov[f](...y), [fn, x]);
  const api = {
    st, page, ov,
    center: (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel),
    camPose: (i) => st.eval((k) => { const c = window.lab.cameras[k]; return { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch, y: c.y }; }, i),
    place: (p) => st.eval((q) => { const L = window.lab; const g = L.ground(q.x, q.z); L.setCamera({ x: q.x, z: q.z, y: q.y !== undefined ? q.y : Math.max(g.ground, g.surface) + 1.7, yaw: q.yaw, pitch: q.pitch }); }, p),
    scale: (dsf) => st.cdp.send('Emulation.setDeviceMetricsOverride', { width: 1080 / dsf, height: 1920 / dsf, deviceScaleFactor: dsf, mobile: false }),
  };
  // (set explicitly, or Chrome's screenshot command captures CSS pixels: 540 x 960)
  await api.scale(2);
  if (spec.border) await ov('setBorder', true);
  const [fadeIn, fadeOut] = (spec.fade || [0, 0]).map((s) => Math.round(s * FPS));
  const rec = PREVIEW ? null : startVideo(path.join(WORK, `${name}-picture.mp4`), { fps: FPS, crf: 17 });
  let last = null, cutAt = -1;
  const t0 = Date.now(), hashes = [];
  for (let f = 0; f < total; f++) {
    if ((spec.cuts || []).includes(f) || f === END) { await ov('setCut', `data:image/png;base64,${last.toString('base64')}`); cutAt = f; }
    // (the end card: the game behind it holds still, dimmed)
    if (f === END) { await ov('setCaption', null, 0); await ov('setClock', null); await ov('setCursor', null); await ov('setEnd', true); await st.eval(() => { const L = window.lab, s = L.state(); L.freeze(s.hour, s.t, s.day); }); }
    if (f < END) await spec.frame(f, api);
    // captions: typed on, then taken back
    let c = null;
    for (const [from, to, text] of spec.captions || []) {
      if (f < from || f >= to + text.length / 1.6) continue;
      c = [text, f < to ? (f - from) * 1.1 : text.length - (f - to) * 1.6];
    }
    if (f < END) await ov('setCaption', ...(c || [null, 0]));
    if (fadeIn || fadeOut) await ov('setVeil', Math.max(fadeIn ? 1 - f / fadeIn : 0, fadeOut ? 1 - (total - 1 - f) / fadeOut : 0));
    await ov('drawCut', cutAt >= 0 ? (f - cutAt) / CUT : 1);
    if (cutAt >= 0 && f - cutAt >= CUT) cutAt = -1;
    await st.step(1);
    const png = await st.steadyShot();
    last = png;
    hashes.push(crypto.createHash('md5').update(png).digest('hex').slice(0, 12));
    if (DUMP.includes(f)) writePng(path.join(WORK, `dump-${name}`, `f${String(f).padStart(4, '0')}.png`), png);
    if (PREVIEW) { if (f % PREVIEW === 0) writePng(path.join(WORK, `preview-${name}`, `f${String(f).padStart(4, '0')}.png`), png); }
    else await rec.write(png);
    if (f % 180 === 0) console.log(`${name}: frame ${f} of ${total}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  // (each frame's fingerprint before encoding, so two runs can be compared frame by frame)
  fs.writeFileSync(path.join(WORK, `${name}-frames.txt`), hashes.join('\n') + '\n');
  if (st.retakes) console.log(`${name}: ${st.retakes} frame(s) captured again`);
  if (st.errors.length) console.log(`${name}: errors`, st.errors);
  if (!PREVIEW) {
    await rec.finish();
    const wav = path.join(WORK, `${name}-sound.wav`);
    await takeSound(st, wav);
    const file = path.join(OUT, `${prefix}${name}.mp4`);
    mixSound(path.join(WORK, `${name}-picture.mp4`), wav, file, { seconds: spec.seconds, lufs: -14 });
    console.log(`wrote ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1e6).toFixed(1)} MB)`);
  }
  await st.close();
}

