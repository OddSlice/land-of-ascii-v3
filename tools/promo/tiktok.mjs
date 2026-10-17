// Vertical videos for TikTok (and Reels, Shorts): 1080 x 1920, 60 frames a
// second, the game's own sound, recorded from the real game frame by frame
// as the trailer is (lib/stage.mjs, lib/clock.mjs), with captions, cuts in
// letters and an end card drawn over it (lib/overlay.js, its tall layout).
//
//   node tools/promo/tiktok.mjs                    all three, into promo/tiktok/
//   node tools/promo/tiktok.mjs --only day         one of: letters, day, favour
//   node tools/promo/tiktok.mjs --only day --preview 15   every 15th frame as a PNG
//
// The page is 540 x 960 CSS pixels at two device pixels each, so the game's
// cells are whole device pixels: 10 x 20 at the medium detail level (108
// columns across), large enough that the letters read on a phone.
//
//   letters (14 s)  the land in huge letters, sharpening four times to the
//                   real game; a village at midday; the fort at night
//   day (15 s)      Elmswick from first light to night in 12.5 s, a clock on screen
//   favour (22 s)   Rose Cobb asks you to take a mended cloak to the fort; the
//                   road at sunset; Juliana Rush at the gate thanks you, and
//                   gives you a lantern for the road
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../lib/serve.mjs';
import { ROOT } from './lib/stage.mjs';
import { ease, lerp } from './lib/record.mjs';
import { record as recordVertical } from './lib/vertical.mjs';

const a = args();
const PREVIEW = a.preview ? Number(a.preview) : 0;
const ONLY = a.only ? String(a.only).split(',') : null;
const DUMP = a.dump ? String(a.dump).split(',').map(Number) : [];     // (frames to keep as PNGs, to compare runs)
const OUT = path.join(ROOT, 'promo', 'tiktok');
const WORK = path.join(ROOT, 'shots', 'promo-work', 'tiktok');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const record = (name, spec) => recordVertical(name, spec, { out: OUT, work: WORK, preview: PREVIEW, dump: DUMP, prefix: 'land-of-ascii-tiktok-' });

// ---- 1. letters: the land in huge letters, sharpening ----
const letters = (() => {
  // the steps: device pixels per CSS pixel, and the detail level (0 coarse ..
  // 3 finest): cells of 26, 20, 13 and 10 device pixels
  const STEPS = [[0, 4, 0], [50, 3, 0], [95, 2, 0], [140, 2, 1]];
  let p0 = null, scene = 0;
  return {
    seconds: 14, end: 666, cuts: [222, 444],
    captions: [[8, 150, 'This whole world is drawn in letters.'], [240, 380, 'Everyone here keeps a day of their own.'], [462, 600, 'No enemies. Just a quiet walk.']],
    async frame(f, A) {
      const step = STEPS.find((s) => s[0] === f);
      if (step) { await A.scale(step[1]); await A.st.eval((d) => window.lab.setDensity(d), step[2]); }
      if (f === 0) { await A.ov('tidy', true, true, true); p0 = await A.camPose(1); await A.st.eval(() => { const L = window.lab; L.setFly(true); L.setWeather('fair'); L.setHour(8.5); L.runClock(true); }); }
      if (f === 222) { scene = 1; p0 = await A.camPose(13); await A.st.eval(() => { const L = window.lab; L.setHour(12.2); }); }
      if (f === 444) { scene = 2; const c = await A.camPose(8), r = c.yaw * Math.PI / 180; p0 = { x: c.x + Math.sin(r) * 9, z: c.z + Math.cos(r) * 9, yaw: c.yaw, pitch: c.pitch + 2 }; await A.st.eval(() => window.lab.setHour(20.8)); }
      const [s0, s1] = [[0, 222], [222, 444], [444, 666]][scene], t = ease((f - s0) / (s1 - s0)) * 0.5 + ((f - s0) / (s1 - s0)) * 0.5;
      const move = [{ fwd: 0, turn: -5 }, { fwd: 2.5, turn: 3 }, { fwd: 5, turn: -2 }][scene];
      const r = (p0.yaw + move.turn * t) * Math.PI / 180;
      await A.place({ x: p0.x + Math.sin(r) * move.fwd * t, z: p0.z + Math.cos(r) * move.fwd * t, y: scene === 0 ? p0.y : undefined, yaw: p0.yaw + move.turn * t, pitch: p0.pitch });
    },
  };
})();

// ---- 2. day: Elmswick from first light to night ----
const day = (() => {
  // (the hour at each frame: slow through first light and the evening, quick
  // through the middle of the day)
  const KEYS = [[0, 4.8], [180, 7.4], [400, 16.8], [650, 20.2], [750, 21.8]], END = 750;
  const hourAt = (f) => { for (let k = 1; k < KEYS.length; k++) if (f <= KEYS[k][0]) { const [f0, h0] = KEYS[k - 1], [f1, h1] = KEYS[k]; return h0 + (h1 - h0) * (f - f0) / (f1 - f0); } return KEYS[KEYS.length - 1][1]; };
  const clock = (h) => { const m = Math.floor(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  let p0 = null;
  return {
    seconds: 15, end: END, cuts: [],
    // (the wind, the water and the music; the bell, the birds and the
    // footsteps would come many times a second at this speed)
    sound: { life: 0, places: 0, player: 0 },
    captions: [[10, 160, 'A whole day in a village made of letters.']],
    async frame(f, A) {
      if (f === 0) { await A.ov('tidy', true, true, true); p0 = await A.camPose(15); await A.st.eval(() => { const L = window.lab; L.setFly(true); L.setWeather('fair'); L.runClock(false); L.unfreeze(); }); }
      const h = hourAt(f);
      await A.st.eval((x) => window.lab.setHour(x), h);
      await A.place({ ...p0, pitch: p0.pitch + 5, yaw: p0.yaw - 2 + 4 * (f / END) });
      await A.ov('setClock', clock(h));
    },
  };
})();

// ---- 3. favour: a cloak to the fort, a lantern for the road ----
const favour = (() => {
  const T = { yes: 344, bye: 430, road: 470, gate: 700, end: 1150 };
  let meet = null, julia = null, road = null, walking = false, stopped = -1, gateStop = -1, gateStep = 0;
  const near = (A, name) => A.st.eval((n) => { const p = window.lab.people.list().find((q) => q.name === n); const s = window.lab.state(); return { d: Math.hypot(p.x - s.x, p.z - s.z), yaw: Math.atan2(p.x - s.x, p.z - s.z) * 180 / Math.PI, i: p.i }; }, name);
  const cursorTo = async (A, f, from, at, sel, start = { x: 300, y: 900 }) => {
    const b = await A.center(sel);
    if (!b) return;
    const t = ease((f - from) / (at - 18 - from));
    await A.ov('setCursor', { x: lerp(start.x, b.x, t), y: lerp(start.y, b.y + 3, t), down: f >= at - 4 && f < at + 2, ring: f >= at && f < at + 14 ? (f - at) / 14 : 0 });
    if (f === at) await A.page.mouse.click(b.x, b.y);
  };
  return {
    seconds: 22, end: T.end, cuts: [T.road, T.gate],
    captions: [[6, 170, 'POV: a stranger stops you on the road.'], [488, 640, 'Carry it to the fort before dark.'], [940, 1080, 'A small kindness, and a lantern for the road.']],
    async frame(f, A) {
      // -- the meeting --
      if (f === 0) {
        await A.ov('tidy', false, true, true);
        meet = await A.st.eval(() => window.lab.progress.meet());
        const s = await A.st.eval(() => window.lab.state());
        const dx = meet.spot.x - s.x, dz = meet.spot.z - s.z, L = Math.hypot(dx, dz), k = (L - 13.5) / L;
        await A.st.eval(({ x, z, yaw, hour }) => { const Lb = window.lab; Lb.setFly(false); Lb.setWeather('fair'); Lb.setCamera({ x, z, yaw, pitch: -1 }); Lb.setHour(hour); Lb.runClock(true); }, { x: s.x + dx * k, z: s.z + dz * k, yaw: Math.atan2(dx, dz) * 180 / Math.PI, hour: meet.arrive - 2.6 / 3600 });
        await A.page.keyboard.down('KeyW'); walking = true;
      }
      if (f < T.road) {
        if (walking) {
          const r = await near(A, meet.name);
          await A.st.eval((y) => window.lab.face(y), r.yaw);
          if (r.d < 2.6 || f > 150) { await A.page.keyboard.up('KeyW'); walking = false; stopped = f; }
        }
        if (stopped >= 0 && f === stopped + 22) { const r = await near(A, meet.name); await A.st.eval((y) => window.lab.face(y), r.yaw); await A.page.keyboard.press('KeyE'); }
        if (f >= T.yes - 80 && f <= T.yes + 14) await cursorTo(A, f, T.yes - 80, T.yes, '#talk.on button.yes');
        if (f >= T.bye - 40 && f <= T.bye + 14) await cursorTo(A, f, T.bye - 40, T.bye, '#talk.on button.yes', await A.center('#talk.on button.yes') || { x: 300, y: 900 });
        if (f === T.bye + 15) await A.ov('setCursor', null);
      }
      // -- the road at sunset, the cloak in hand --
      if (f === T.road) {
        await A.ov('setCursor', null);
        // (glided toward it at the camera's own height: on foot the road dips
        // and the hill hides the walls)
        road = await A.camPose(8);
        await A.st.eval(() => { const L = window.lab; L.setFly(true); L.setHour(18.35); });
      }
      if (f >= T.road && f < T.gate) {
        const t = ease((f - T.road) / (T.gate - T.road)) * 0.5 + ((f - T.road) / (T.gate - T.road)) * 0.5, r = road.yaw * Math.PI / 180;
        await A.place({ x: road.x + Math.sin(r) * 7 * t, z: road.z + Math.cos(r) * 7 * t, y: road.y, yaw: road.yaw - 2 * t, pitch: road.pitch + 4 });
      }
      // -- the gate at night: Juliana Rush --
      if (f === T.gate) {
        await A.st.eval(() => window.lab.setHour(21.3));
        await A.st.step(2);
        julia = (await A.st.eval(() => window.lab.progress.favours().find((x) => x.first))).destName;
        const r = await near(A, julia);
        await A.st.eval((i) => { const L = window.lab; L.people.goTo(i, 7); L.setFly(false); }, r.i);
        await A.page.keyboard.down('KeyW'); walking = true;
      }
      if (f > T.gate && f < T.end) {
        if (walking) {
          const r = await near(A, julia);
          await A.st.eval((y) => window.lab.face(y), r.yaw);
          if (r.d < 2.6 || f > T.gate + 120) { await A.page.keyboard.up('KeyW'); walking = false; gateStop = f; }
        }
        if (gateStop >= 0 && f === gateStop + 20) { const r = await near(A, julia); await A.st.eval((y) => window.lab.face(y), r.yaw); await A.page.keyboard.press('KeyE'); gateStep = f; }
        // her thanks, then E turns the page to the lantern, held to the end
        if (gateStep > 0 && f === gateStep + 150) await A.page.keyboard.press('KeyE');
      }
    },
  };
})();

const VIDEOS = { letters, day, favour };
for (const [name, spec] of Object.entries(VIDEOS)) if (!ONLY || ONLY.includes(name)) await record(name, spec);
