// Peaceful walks for TikTok: five vertical videos (1080 x 1920, 60 frames
// a second, about 30 s each) with no words at all, recorded from the real
// game frame by frame (lib/vertical.mjs) with its own sound: the music,
// the wind and the water, the birds, the footsteps. The picture sits in the
// title screen's stone frame and fades in from the dark and out again.
//
//   node tools/promo/tiktok-walks.mjs                       all five, into promo/tiktok-walks/
//   node tools/promo/tiktok-walks.mjs --only fort-weather   one of: lake-to-village, fort-weather, flock, bridge, night-village
//   node tools/promo/tiktok-walks.mjs --only flock --preview 30
//
// Each walk is a smooth path through the land (seed 3), the eye 1.7 m over
// the ground, moving at about walking pace and easing in and out:
//   lake-to-village  along Dunholme's lake, the village beyond the water,
//                    then up the road into it, in the afternoon
//   fort-weather     the fort above its winding road from 06:30 to 22:00, through clear
//                    skies, cloud, rain and mist, and back to a clear night
//   flock            past the grazing flock on a misty morning, the mist lifting
//   bridge           over the stone bridge across the Fennwater, late in the afternoon
//   night-village    the road into Elmswick under the stars, the lantern lit
import fs from 'node:fs';
import path from 'node:path';
import { args } from '../lib/serve.mjs';
import { ROOT } from './lib/stage.mjs';
import { ease } from './lib/record.mjs';
import { record } from './lib/vertical.mjs';

const a = args();
const PREVIEW = a.preview ? Number(a.preview) : 0;
const ONLY = a.only ? String(a.only).split(',') : null;
const DUMP = a.dump ? String(a.dump).split(',').map(Number) : [];
const OUT = path.join(ROOT, 'promo', 'tiktok-walks');
const WORK = path.join(ROOT, 'shots', 'promo-work', 'tiktok-walks');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WORK, { recursive: true });
const FPS = 60, SECONDS = 30, TOTAL = SECONDS * FPS;
const COMMON = { seconds: SECONDS, border: true, fade: [1.0, 1.6] };

// ---- paths ----
// A Catmull-Rom curve through the points, sampled at even distances, then
// walked with a gentle start and stop (`ramp`: the share of the walk spent
// speeding up, and again slowing down). Returns frame -> { x, z }.
function curve(points, samples = 2000) {
  const P = [points[0], ...points, points[points.length - 1]], out = [];
  for (let i = 1; i < P.length - 2; i++) {
    for (let k = 0; k < samples / (P.length - 3); k++) {
      const t = k / (samples / (P.length - 3)), [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      const c = (a0, a1, a2, a3) => 0.5 * ((2 * a1) + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t * t + (-a0 + 3 * a1 - 3 * a2 + a3) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  const len = [0];
  for (let i = 1; i < out.length; i++) len.push(len[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, len, total: len[len.length - 1] };
}
function walk(points, { ramp = 0.14 } = {}) {
  const C = curve(points);
  // distance along the path at time u in 0..1: constant speed between ramps
  const v = 1 / (1 - ramp), dist = (u) => {
    if (u < ramp) return v * u * u / (2 * ramp);
    if (u > 1 - ramp) return 1 - v * (1 - u) * (1 - u) / (2 * ramp);
    return v * (u - ramp / 2);
  };
  const at = (d) => {
    const target = d * C.total;
    let lo = 0, hi = C.len.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C.len[m] < target) lo = m; else hi = m; }
    const t = (target - C.len[lo]) / Math.max(1e-9, C.len[hi] - C.len[lo]);
    return { x: C.pts[lo][0] + (C.pts[hi][0] - C.pts[lo][0]) * t, z: C.pts[lo][1] + (C.pts[hi][1] - C.pts[lo][1]) * t };
  };
  return { at: (f) => at(dist(Math.min(1, f / (TOTAL - 1)))), metres: C.total };
}
const yawTo = (p, q) => Math.atan2(q.x - p.x, q.z - p.z) * 180 / Math.PI;
const turn = (from, to) => { let d = to - from; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
// A yaw that follows its aim smoothly (no snaps when the aim moves fast).
function smoothYaw() { let y = null; return (aim, k = 0.06) => (y = y === null ? aim : y + turn(y, aim) * k); }
// The eye placed where the game would stand you there (on the ground, a
// bridge's deck, a floor: the player's own rule), lifted by `lift`, its
// height smoothed so bumps in the ground don't shake the picture.
const place = (A, q) => A.st.eval((p) => {
  const L = window.lab;
  L.setCamera({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch || 0 });
  const t = L.state().eye + (p.lift || 0);
  window.__wy = window.__wy === undefined || p.reset ? t : window.__wy + (t - window.__wy) * 0.08;
  L.setCamera({ x: p.x, z: p.z, y: window.__wy, yaw: p.yaw, pitch: p.pitch || 0 });
}, q);
const keyed = (keys, u) => {
  for (let k = 1; k < keys.length; k++) if (u <= keys[k][0]) { const [u0, a0] = keys[k - 1], [u1, a1] = keys[k], t = (u - u0) / (u1 - u0); return typeof a0 === 'number' ? a0 + (a1 - a0) * t : Object.fromEntries([...new Set([...Object.keys(a0), ...Object.keys(a1)])].map((n) => [n, (a0[n] || 0) + ((a1[n] || 0) - (a0[n] || 0)) * t])); }
  return keys[keys.length - 1][1];
};
// (the game's notes, prompts and signposts are kept off: just the walk)
const quiet = (A) => A.ov('tidy', true, true, true);

// ---- 1. along the lake into Dunholme ----
const lakeToVillage = (() => {
  // the west shore of the village's lake, then the road in from the west (it
  // is listed from the village out, so its points are taken backwards)
  let W = null;
  const aimAt = { x: 1214, z: 1258 }, yaw = smoothYaw();
  return {
    ...COMMON,
    async frame(f, A) {
      if (f === 0) {
        await quiet(A);
        const road = await A.st.eval(() => { const r = window.lab.world.roads[0]; return { x: Array.from(r.x), z: Array.from(r.z) }; });
        W = walk([[1055, 1352], [1050, 1334], [1056, 1298], ...[100, 78, 56, 36].map((i) => [road.x[i], road.z[i]])]);
        await A.st.eval(() => { const L = window.lab; L.setWeather('fair'); L.setHour(16.3); L.setDay(0); L.setFly(false); L.runClock(true); L.unfreeze(); });
      }
      // (the village beyond the water first, then the road ahead)
      const p = W.at(f), ahead = W.at(Math.min(TOTAL - 1, f + 90)), u = f / (TOTAL - 1);
      const aim = u < 0.5 ? yawTo(p, aimAt) : yawTo(p, ahead);
      await place(A, { ...p, yaw: yaw(aim, f === 0 ? 1 : 0.04), pitch: -1, reset: f === 0 });
    },
  };
})();

// ---- 2. the fort, a day of weather ----
const fortWeather = (() => {
  // the hour, and the weather's mix, wetness and drift, through the clip
  const HOURS = [[0, 6.5], [0.14, 8.6], [0.48, 14.6], [0.74, 18.4], [0.88, 20.4], [1, 22.0]];
  const MIX = [[0, { clear: 1 }], [0.16, { fair: 1 }], [0.32, { overcast: 1 }], [0.44, { overcast: 0.3, rain: 0.7 }], [0.56, { rain: 1 }], [0.66, { overcast: 0.6, rain: 0.4 }],
    [0.74, { mist: 0.75, fair: 0.25 }], [0.84, { fair: 1 }], [1, { clear: 1 }]];
  const WET = [[0, 0], [0.42, 0.2], [0.58, 1], [0.8, 0.7], [1, 0.25]];
  let p0 = null;
  return {
    ...COMMON,
    // (the wind and the rain and the music; at this speed the birds, the
    // bell and the footsteps would come many times a second)
    sound: { life: 0, places: 0, player: 0 },
    async frame(f, A) {
      if (f === 0) {
        await quiet(A);
        p0 = await A.camPose(8);
        await A.st.eval(() => { const L = window.lab; L.setFly(true); L.runClock(false); L.unfreeze(); });
      }
      const u = f / (TOTAL - 1), t = ease(u) * 0.5 + u * 0.5, r = p0.yaw * Math.PI / 180;
      await A.st.eval(({ h, mix, wet, drift }) => { const L = window.lab; L.setHour(h); L.setWeather({ mix, wet, drift }); }, { h: keyed(HOURS, u), mix: keyed(MIX, u), wet: keyed(WET, u), drift: 900 * u });
      // (from 46 m back down the road and 24 m up, so the road winds up to
      // the gate below; gliding 16 m nearer)
      const back = 46 - 16 * t;
      await place(A, { x: p0.x - Math.sin(r) * back + Math.cos(r) * 3 * t, z: p0.z - Math.cos(r) * back - Math.sin(r) * 3 * t, yaw: p0.yaw - 2 + 3 * t, pitch: -6, lift: 24 - 4 * t, reset: f === 0 });
    },
  };
})();

// ---- 3. past the flock, the mist lifting ----
const flock = (() => {
  let W = null, centre = null;
  const yaw = smoothYaw(), MIX = [[0, { mist: 0.55, fair: 0.45 }], [1, { mist: 0.15, fair: 0.85 }]];
  return {
    ...COMMON,
    async frame(f, A) {
      if (f === 0) {
        await quiet(A);
        await A.st.eval(() => { const L = window.lab; L.setHour(8.1); L.setDay(0); L.setFly(false); L.runClock(true); L.unfreeze(); });
        await A.st.step(2);
        centre = await A.st.eval(() => window.lab.animals.where(0));
        // an arc round the flock from 12 m in to about 7 m, from the pasture's camera side
        const c = await A.camPose(23), a0 = Math.atan2(c.x - centre.x, c.z - centre.z);
        const pts = [];
        for (let k = 0; k <= 6; k++) { const ang = a0 - 0.5 + k * 0.26, rad = 12 - k * 0.8; pts.push([centre.x + Math.sin(ang) * rad, centre.z + Math.cos(ang) * rad]); }
        W = walk(pts);
      }
      const u = f / (TOTAL - 1), p = W.at(f);
      await A.st.eval((mix) => window.lab.setWeather({ mix, wet: 0, drift: 0 }), keyed(MIX, u));
      await place(A, { ...p, yaw: yaw(yawTo(p, centre), f === 0 ? 1 : 0.05), pitch: -9, reset: f === 0 });
    },
  };
})();

// ---- 4. over the bridge across the Fennwater ----
const bridge = (() => {
  // the fort's road (listed from the fort down to Dunholme), from 60 m before
  // the bridge to 70 m past it
  let W = null, onBridge = null;
  const yaw = smoothYaw();
  return {
    ...COMMON,
    async frame(f, A) {
      if (f === 0) {
        await quiet(A);
        const r = await A.st.eval(() => { const R = window.lab.world.roads[3], b = window.lab.progress.places().find((p) => p.id === 'bridge1'); let k = 0, bd = Infinity; for (let i = 0; i < R.x.length; i++) { const d = Math.hypot(R.x[i] - b.x, R.z[i] - b.z); if (d < bd) { bd = d; k = i; } } return { x: Array.from(R.x), z: Array.from(R.z), k }; });
        const pts = [];
        for (let i = r.k - 60; i <= r.k + 70; i += 13) pts.push([r.x[i], r.z[i]]);
        W = walk(pts);
        onBridge = { x: r.x[r.k], z: r.z[r.k] };
        await A.st.eval(() => { const L = window.lab; L.setWeather('fair'); L.setHour(16.7); L.setDay(0); L.setFly(false); L.runClock(true); L.unfreeze(); });
      }
      const p = W.at(f), ahead = W.at(Math.min(TOTAL - 1, f + 90));
      // (looking along the deck, the parapets and the lamps either side, and a
      // little down as it crosses the water)
      const near = Math.max(0, 1 - Math.hypot(p.x - onBridge.x, p.z - onBridge.z) / 22);
      await place(A, { ...p, yaw: yaw(yawTo(p, ahead), f === 0 ? 1 : 0.05), pitch: -3 - 2 * ease(near), reset: f === 0 });
    },
  };
})();

// ---- 5. the road into Elmswick at night ----
const nightVillage = (() => {
  let W = null;
  const yaw = smoothYaw();
  return {
    ...COMMON,
    async frame(f, A) {
      if (f === 0) {
        await quiet(A);
        // the road from the main road into the village (it is listed from the village out)
        const road = await A.st.eval(() => { const r = window.lab.world.roads[1]; return { x: Array.from(r.x), z: Array.from(r.z) }; });
        const pts = [];
        for (let i = 122; i >= 12; i -= 22) pts.push([road.x[i], road.z[i]]);
        W = walk(pts);
        await A.st.eval(() => { const L = window.lab; L.setWeather('clear'); L.setHour(21.6); L.setDay(0); L.setFly(false); L.runClock(true); L.unfreeze(); L.progress.setLit(true); });
      }
      const p = W.at(f), q = W.at(Math.min(TOTAL - 1, f + 90));
      await place(A, { ...p, yaw: yaw(yawTo(p, q), f === 0 ? 1 : 0.05), pitch: 0, reset: f === 0 });
    },
  };
})();

const WALKS = { 'lake-to-village': lakeToVillage, 'fort-weather': fortWeather, flock, bridge, 'night-village': nightVillage };
for (const [name, spec] of Object.entries(WALKS)) {
  if (ONLY && !ONLY.includes(name)) continue;
  await record(name, spec, { out: OUT, work: WORK, preview: PREVIEW, dump: DUMP, prefix: 'land-of-ascii-walk-' });
}
