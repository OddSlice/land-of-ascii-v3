// (phase 5b) A walk with its sound, recorded in the page itself (the
// picture's canvas and the sound's own output into one WebM), since a
// browser tool's video carries no sound: from a village green at dawn, by the
// people's own way over the stone bridge, along the lake shore where it
// passes nearest, and up to the fort gate at dusk as rain arrives. Six
// minutes at real speed; the clock runs from dawn to dusk over them. To
// shots/walks/ (kept out of git).
//
//   node tools/walk-sound.mjs [--seed 3] [--secs 360] [--built]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld } from '../src/world/pack.js';
import { soundScene } from '../src/sound/scene.js';

const a = args();
const seed = Number(a.seed || DEFAULT_SEED), SECS = Number(a.secs || 360);
const gen = generateWorld(seed); let r; while (!(r = gen.next()).done);
const W = unpackWorld(packWorld(r.value)), SC = soundScene(W);
// ---- the way: [x, z, speed (m/s)] points ------------------------------------------
// the people's own way from a village green to the fort's gate (over the
// stone bridge), with a turn along the lake shore where it passes nearest
const way = [];
const push = (x, z, sp) => { const l = way[way.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 0.5) way.push([x, z, sp]); };
const PP = await import('../src/world/people/people.js');
const P = PP.buildPeople(W);
const gi = P.places.findIndex((p) => p.kind === 'green'), gate = P.places.findIndex((p) => p.kind === 'gate');
const R = PP.routeOf(P, gi, gate), lk = W.sites.lake;
let iL = 0, dL = Infinity;
for (let i = 0; i < R.n; i++) { const d = Math.hypot(R.x[i] - lk.x, R.z[i] - lk.z); if (d < dL) { dL = d; iL = i; } }
const dry = (x, z) => { const j = Math.round(z) * W.NN + Math.round(x); return W.terrain.wWater[j] < 100; };
const inland = (p) => { for (let d = 3; d < 14; d += 1.5) for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4, x = p.x + Math.cos(t) * d, z = p.z + Math.sin(t) * d; if (dry(x, z)) return [x, z]; } return [p.x, p.z]; };
for (let i = 0; i < R.n; i += 2) {
  push(R.x[i], R.z[i], 4.5);
  if (i <= iL && i + 2 > iL) {
    // to the shore, along it a little, and back
    const shore = SC.water.lake.cells.flat().sort((p, q) => Math.hypot(p.x - R.x[i], p.z - R.z[i]) - Math.hypot(q.x - R.x[i], q.z - R.z[i]));
    const s0 = shore[0], along = shore.filter((p) => Math.hypot(p.x - s0.x, p.z - s0.z) < 70).sort((p, q) => Math.atan2(p.z - lk.z, p.x - lk.x) - Math.atan2(q.z - lk.z, q.x - lk.x));
    for (const p of along.slice(0, 6)) { const [x, z] = inland(p); push(x, z, 4.0); }
    push(R.x[i], R.z[i], 4.5);
  }
}
const g = W.sites.fort.gate;
push(g.x + g.out[0] * 2, g.z + g.out[1] * 2, 1.5);
let total = 0; for (let i = 1; i < way.length; i++) total += Math.hypot(way[i][0] - way[i - 1][0], way[i][1] - way[i - 1][1]) / way[i][2];
console.log(`the way: ${way.length} points, ${total.toFixed(0)} s on foot; recording ${SECS} s`);

const OUT = path.join(ROOT, 'shots', 'walks');
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, 'world-5b-dawn-to-dusk-with-sound.webm');
fs.writeFileSync(file, Buffer.alloc(0));
const { server, url } = await serve();
const browser = await launch('chromium', { headless: false, audio: true });
try {
  const lab = await openLab(browser, url, { built: !!a.built, scene: 'world', seed, width: 1280, height: 720, dpr: 1, threads: 8 });
  const { page } = lab;
  let bytes = 0;
  await page.exposeFunction('__chunk', (b64) => { const b = Buffer.from(b64, 'base64'); fs.appendFileSync(file, b); bytes += b.length; });
  await page.evaluate(async ({ way, SECS, total }) => {
    const L = window.lab;
    L.setHud(false); L.sound.enable(); L.setWeather('fair'); L.setDensity(3);
    // dawn to dusk over the walk
    L.freeze(5.6, 0, 0); L.unfreeze(); L.runClock(true, (18.7 - 5.6) / SECS);
    const cv = document.getElementById('view');
    const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...L.sound.stream().getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 6e6, audioBitsPerSecond: 160000 });
    rec.ondataavailable = async (e) => { if (!e.data.size) return; const buf = new Uint8Array(await e.data.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); await window.__chunk(btoa(s)); };
    rec.start(1000);
    window.__rec = rec;
    // the walk: along the way at each stretch's speed, scaled so it ends at
    // the gate as the time ends (after a pause at the green)
    const k = (SECS - 14) / total;
    let i = 1, at = 0, x = way[0][0], z = way[0][1], yaw = Math.atan2(way[1][0] - x, way[1][1] - z), last = performance.now(), t0 = last, rained = false;
    L.setCamera({ x, z, yaw: yaw * 180 / Math.PI, pitch: 0 });
    await new Promise((done) => {
      const step = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        const el = (now - t0) / 1000;
        if (!rained && el > SECS * 0.8) { L.setWeather('rain'); rained = true; }
        if (el >= SECS) { done(); return; }
        // (a pause at the green to listen, then on)
        if (el > 8 && i < way.length) {
          let go = way[i][2] * dt / k;
          while (go > 0 && i < way.length) {
            const dx = way[i][0] - x, dz = way[i][1] - z, d = Math.hypot(dx, dz);
            if (d <= go) { x = way[i][0]; z = way[i][1]; go -= d; i++; } else { x += dx / d * go; z += dz / d * go; go = 0; }
          }
          const j = Math.min(way.length - 1, i + 3), want = Math.atan2(way[j][0] - x, way[j][1] - z);
          let dyaw = want - yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
          yaw += dyaw * Math.min(1, dt * 2.2);
          L.setCamera({ x, z, yaw: yaw * 180 / Math.PI, pitch: -2 });
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    rec.stop();
    await new Promise((res) => setTimeout(res, 2500));
  }, { way, SECS, total });
  console.log(`${path.relative(ROOT, file)}: ${(bytes / 1e6).toFixed(0)} MB`);
  await lab.check();
} finally { await browser.close(); server.close(); }
