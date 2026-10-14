// (phase 5b) The sound check: a scripted walk past every kind of source on
// the default seed, every place found from the world's own records, with
// the sound on (the page's audio allowed without a click). For each stop it
// records which sources played and at what level at the ear, and the beds'
// levels; over the whole walk, the loudest sample before and after the
// limiter (nothing may clip: under 1.0), the most voices sounding at once
// (at most 16), and the sound's own cost on the main thread per frame.
//
//   node tools/sound-check.mjs [--built] [--browser chromium] [--seed 3]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld } from '../src/world/pack.js';
import { buildPeople, planOf } from '../src/world/people/people.js';
import { soundScene } from '../src/sound/scene.js';
import { SOUND } from '../src/sound/palette.js';

const a = args();
const seed = Number(a.seed || DEFAULT_SEED), name = String(a.browser || 'chromium');
const gen = generateWorld(seed); let r; while (!(r = gen.next()).done);
const W = unpackWorld(packWorld(r.value)), T = W.terrain, NN = W.NN, PP = buildPeople(W), SC = soundScene(W);
const deg = (x) => x * 180 / Math.PI;
const all = (g) => g.cells.flat();
const at = (x, z) => Math.round(z) * NN + Math.round(x);
const dry = (x, z) => { const j = at(x, z); return T.wWater[j] < 100; };
const look = (x, z, tx, tz) => deg(Math.atan2(tx - x, tz - z));
// a dry spot about d metres from (x, z), facing it
const off = (x, z, d) => { for (let k = 0; k < 24; k++) { const t = k * Math.PI / 12, px = x + Math.sin(t) * d, pz = z + Math.cos(t) * d; if (dry(px, pz) && dry((px + x) / 2, (pz + z) / 2) || (dry(px, pz) && k === 23)) return { x: px, z: pz, yaw: look(px, pz, x, z) }; } return { x: x + d, z, yaw: look(x + d, z, x, z) }; };
const first = (pred) => { for (let z = 40; z < W.N - 40; z += 6) for (let x = 40; x < W.N - 40; x += 6) if (pred(x, z, at(x, z))) return { x, z }; return null; };

// ---- the stops ---------------------------------------------------------------------
const stops = [];
const add = (label, want, o) => stops.push({ label, want, ...o });
{ // a forest edge at dawn, then at noon: songbirds
  const tr = all(SC.trees).find((t) => { const o = off(t.x, t.z, 18); return dry(o.x, o.z); });
  const o = off(tr.x, tr.z, 18);
  add('a forest edge at dawn (the chorus)', ['birdsong', 'step:meadow'], { ...o, hour: 6.0, secs: 8, walk: 1.5 });
  add('the same edge at noon', ['birdsong'], { ...o, hour: 12.5, secs: 10 });
  add('the same edge as rain arrives', ['rain', 'drip'], { ...o, hour: 12.6, secs: 8, weather: 'rain' });
}
{ // water
  const lk = all(SC.water.lake)[0], o = off(lk.x, lk.z, 5);
  add('the lake shore', ['lake'], { ...o, hour: 11, secs: 4 });
  const rv = all(SC.water.river).sort((p, q) => (q.fall || 0) - (p.fall || 0));
  const o2 = off(rv[0].x, rv[0].z, 4);
  add('a river at its fastest reach', ['river'], { ...o2, hour: 11, secs: 4 });
  const sea = all(SC.water.sea)[0], o3 = off(sea.x, sea.z, 8);
  add('the sea\'s edge', ['sea'], { ...o3, hour: 11, secs: 4 });
  const b = SC.bridges.find((q) => q.y - (W.sites.bridges.find((s) => s.x === q.x).water || q.y) > 1.5) || SC.bridges[0], bw = W.sites.bridges.find((s) => s.x === b.x);
  add('under a bridge', ['river'], { x: b.x, z: b.z, y: (bw.water || b.y - 3) + 1.7, yaw: 0, hour: 11, secs: 4 });
}
{ // underfoot
  const rd = W.roads[0];
  add('walking the road', ['step:road'], { x: rd.x[60], z: rd.z[60], yaw: look(rd.x[60], rd.z[60], rd.x[64], rd.z[64]), hour: 11, secs: 3, walk: 3, run: true });
  const sand = first((x, z, j) => T.wSand[j] > 220 && dry(x, z) && T.wSand[at(x + 3, z)] > 200);
  if (sand) add('walking on sand', ['step:sand'], { ...sand, yaw: 90, hour: 11, secs: 3, walk: 2 });
  const shal = first((x, z, j) => T.wWater[j] > 127 && T.levels[0].H[j] - T.ground[j] > 0.25 && T.levels[0].H[j] - T.ground[j] < 0.55 && Math.abs(T.levels[0].H[j] - W.sea) > 0.1);
  if (shal) add('wading in the shallows', ['step:water', 'splash'], { ...shal, yaw: 0, hour: 11, secs: 3, walk: 2 });
  const snow = first((x, z, j) => T.wSnow[j] > 230 && T.wSnow[at(x + 4, z)] > 230 && T.wSnow[at(x, z + 4)] > 230);
  if (snow) add('walking on snow', ['step:snow'], { ...snow, yaw: 0, hour: 11, secs: 3, walk: 2 });
  const jt = W.kitDesc.pieces.find((p) => p.kind === 'jetty');
  if (jt) add('walking a jetty\'s planks', ['step:timber'], { x: jt.a[0] + (jt.b[0] - jt.a[0]) * 0.2, z: jt.a[1] + (jt.b[1] - jt.a[1]) * 0.2, yaw: look(jt.a[0], jt.a[1], jt.b[0], jt.b[1]), hour: 11, secs: 3, walk: 2 });
  const yc = W.cameras.find((c) => c.name === 'the courtyard');
  if (yc) add('walking the courtyard\'s packed earth, and a jump', ['step:road', 'land'], { x: yc.x, z: yc.z, yaw: deg(yc.yaw), hour: 11, secs: 3, walk: 2, jump: true });
  const sb = W.sites.bridges.find((q) => q.style === 'stone');
  if (sb) { const ca = Math.cos(sb.a), sa = Math.sin(sb.a); add('walking over the stone bridge', ['step:stone'], { x: sb.x - ca * (sb.len / 2 + 1), z: sb.z - sa * (sb.len / 2 + 1), yaw: deg(Math.atan2(ca, sa)), hour: 11, secs: 3, walk: 3 }); }
  const st = (W.sites.fort.stairs || [])[0];
  if (st) { const dx = st.top[0] - st.foot[0], dz = st.top[1] - st.foot[1], l = Math.hypot(dx, dz); add('climbing a stair to the wall walk', ['step:stone', 'creak'], { x: st.foot[0] - dx / l * 1.5, z: st.foot[1] - dz / l * 1.5, yaw: deg(Math.atan2(dx, dz)), hour: 11, secs: 4, walk: 3 }); }
}
{ // places
  const g = W.sites.fort.gate;
  add('the fort gate at night: torches', ['fire'], { x: g.x + g.out[0] * 6, z: g.z + g.out[1] * 6, yaw: look(g.x + g.out[0] * 6, g.z + g.out[1] * 6, g.x, g.z), hour: 22.5, secs: 5 });
  add('walking through the gate passage (the echo)', ['step:road', 'echo'], { x: g.x + g.out[0] * 5, z: g.z + g.out[1] * 5, yaw: look(g.x + g.out[0] * 5, g.z + g.out[1] * 5, g.x, g.z), hour: 22.5, secs: 3, walk: 2.4, echo: true });
  // a house one can enter, in the evening, its hearth lit
  const V0 = W.sites.villages.find((v) => v.plan.houses.some((h) => h.enter));
  const hs = V0.plan.houses.find((h) => h.enter);
  add('inside a house by its hearth, evening', ['fire'], { x: hs.x, z: hs.z, y: (hs.floor || 0) + 1.7, yaw: deg(hs.a || 0), hour: 20, secs: 5 });
  const ch = W.sites.villages.find((v) => v.plan.chapel).plan.chapel, oc = off(ch.x, ch.z, 40);
  add('40 m from a chapel as ten strikes', ['bell'], { ...oc, hour: 9.995, rate: 1 / 60, secs: 30 });
  add('by a well, the keeper drawing water', ['well'], { well: true, hour: 10.2, rate: 1 / 3600, secs: 24 });
  // someone going home: stand by their door as they arrive
  let door = null;
  for (let i = 0; i < PP.persons.length && !door; i++) {
    for (const sg of planOf(PP, i, 0)) {
      if (sg.kind !== 'walk' || sg.t1 < 8 || sg.t1 > 19) continue;
      const pl = PP.places[sg.to];
      if (!pl || !['door', 'in', 'closed', 'hearth', 'sit'].includes(pl.kind)) continue;
      door = { x: pl.x, z: pl.z, t1: sg.t1, i }; break;
    }
  }
  if (door) { const od = off(door.x, door.z, 7); add('by a door as someone goes in (the latch)', ['latch'], { ...od, hour: door.t1 - 15 / 3600, rate: 1 / 3600, secs: 30 }); }
}
{ // animals
  for (const [type, kind, d, hour] of [['flock', 'sheep', 18, 10], ['herd', 'cattle', 22, 10], ['hens', 'hens', 8, 10], ['ducks', 'duck', 12, 10], ['gulls', 'gull', 25, 11], ['crow', 'crow', 15, 16], ['finches', 'finch', 12, 9.5]]) add(`beside the ${type}`, [kind], { group: type, dist: d, hour, secs: kind === 'cattle' ? 40 : 24 });
  add('walking up to a dog (one bark)', ['dog'], { group: 'dog', dist: 45, approach: 5, hour: 10, secs: 6 });
  add('walking up to deer at dawn (breaking cover)', ['deer'], { group: 'deer', dist: 55, approach: 12, hour: 6.4, secs: 6 });
}

// ---- the walk -------------------------------------------------------------------------
const { server, url } = await serve();
const browser = await launch(name, { audio: true });
const rows = [];
let summary;
try {
  const lab = await openLab(browser, url, { built: !!a.built, scene: 'world', seed, width: 1280, height: 720, dpr: 1 });
  const { page } = lab;
  const ok = await page.evaluate(() => { const L = window.lab; const on = L.sound.enable(); L.sound.startLog(); window.__ms = []; const tick = () => { if (typeof L.soundMs === 'number') window.__ms.push(L.soundMs); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return on; });
  if (!ok) throw new Error('the sound would not start');
  for (const s of stops) {
    const res = await page.evaluate(async (s) => {
      const L = window.lab;
      L.setWeather(s.weather || 'fair');
      L.setFly(false);
      L.freeze(s.hour, 0, 0); L.unfreeze();
      L.runClock(!!s.rate, s.rate || 1 / 3600); if (!s.rate) L.runClock(false);
      if (s.group) {
        const g = L.animals.groups().findIndex((x) => x.type === s.group);
        if (g < 0) return { skipped: `no ${s.group}` };
        L.animals.goTo(g, s.dist);
      } else if (s.well) {
        const list = L.people.list(), i = list.findIndex((p) => /^keeping the well|at the well/.test(p.act) && !p.hidden);
        if (i < 0) return { skipped: 'nobody at a well' };
        L.people.goTo(i, 5);
      } else L.setCamera({ x: s.x, z: s.z, y: s.y, yaw: s.yaw, pitch: 0 });
      await new Promise((res) => setTimeout(res, 400));
      L.sound.takeLog();
      window.__spk = window.__spk || []; window.__spk.push([s.label, L.sound.spikes.length]);
      if (s.approach) {
        const st = L.state(), g = L.animals.groups().findIndex((x) => x.type === s.group), w = L.animals.where(g);
        for (let k = 1; k <= 30; k++) { const f = k / 30, d = s.dist + (s.approach - s.dist) * f, ux = (st.x - w.x), uz = (st.z - w.z), l = Math.hypot(ux, uz); L.setCamera({ x: w.x + ux / l * d, z: w.z + uz / l * d, yaw: Math.atan2(-ux, -uz) * 180 / Math.PI, pitch: 0 }); await new Promise((res) => setTimeout(res, 100)); }
      }
      return { ok: true };
    }, s);
    if (res.skipped) { rows.push({ label: s.label, want: s.want, skipped: res.skipped }); continue; }
    // (the beds' loudest, every 100 ms through the whole stop)
    await page.evaluate(() => { window.__beds = {}; window.__bt = setInterval(() => { const b = window.lab.sound.state.beds || {}; for (const [k, v] of Object.entries(b)) window.__beds[k] = Math.max(window.__beds[k] || 0, v); }, 100); });
    if (s.walk) {
      if (s.run) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      if (s.jump) { await page.waitForTimeout(600); await page.keyboard.press('Space'); }
      await page.waitForTimeout(s.walk * 1000);
      await page.keyboard.up('KeyW');
      if (s.run) await page.keyboard.up('ShiftLeft');
    }
    const rest = Math.max(0, s.secs - (s.walk || 0) - (s.approach ? 3 : 0));
    const snap = await page.evaluate(async (ms) => {
      const L = window.lab;
      await new Promise((r2) => setTimeout(r2, ms));
      clearInterval(window.__bt);
      return { log: L.sound.takeLog(), beds: window.__beds, state: L.sound.state };
    }, rest * 1000);
    const heard = {};
    for (const e of snap.log) { const h = heard[e.kind] || (heard[e.kind] = { n: 0, max: 0 }); h.n++; h.max = Math.max(h.max, e.level); }
    for (const [k, v] of Object.entries(snap.beds)) if (v > 1e-3) heard[k] = { n: 0, max: v, bed: true };
    const got = s.want.filter((w) => heard[w] || (w === 'rain' && snap.beds.rain > 1e-3));
    rows.push({ label: s.label, want: s.want, heard, ok: got.length === s.want.length, missing: s.want.filter((w) => !got.includes(w)) });
    console.log(`${got.length === s.want.length ? 'pass' : 'MISS'}  ${s.label}: ${Object.entries(heard).map(([k, v]) => `${k} ${v.bed ? 'bed ' : `${v.n}x `}${(20 * Math.log10(Math.max(1e-6, v.max))).toFixed(0)} dB`).join(', ')}${got.length === s.want.length ? '' : `  (missing ${s.want.filter((w) => !got.includes(w)).join(', ')})`}`);
  }
  summary = await page.evaluate(() => {
    const L = window.lab, ms = window.__ms.slice().sort((x, y) => x - y), q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * (ms.length - 1)))];
    console.log(JSON.stringify(L.sound.spikes), JSON.stringify(window.__spk));
    return { spikes: L.sound.spikes, marks: window.__spk, state: L.sound.state, frames: ms.length, median: q(0.5), p95: q(0.95), max: q(1), over: window.__ms.filter((x) => x >= 0.5).length };
  });
  await lab.check();
  await lab.ctx.close();
} finally { await browser.close(); server.close(); }
const S = summary.state;
const lines = [
  `\nsound check (${name}, seed ${seed}): ${rows.filter((x) => x.ok).length} of ${rows.filter((x) => !x.skipped).length} stops heard what they should${rows.some((x) => x.skipped) ? `; skipped ${rows.filter((x) => x.skipped).map((x) => `${x.label} (${x.skipped})`).join(', ')}` : ''}`,
  `loudest sample: ${S.peak.toFixed(3)} after the limiter, ${S.prePeak.toFixed(3)} before it (1.0 clips): ${S.prePeak < 1 ? 'no clipping' : 'CLIPS before the limiter'}`,
  `voices at once: at most ${S.maxVoices} (cap ${SOUND.voices}): ${S.maxVoices <= SOUND.voices ? 'held' : 'OVER'}; events dropped by the cap: ${S.dropped}`,
  `main thread, the sound's own work per frame: median ${summary.median.toFixed(3)} ms, 95% under ${summary.p95.toFixed(3)} ms, slowest ${summary.max.toFixed(3)} ms; frames at 0.5 ms or more: ${summary.over} of ${summary.frames}`,
];
for (const l of lines) console.log(l);
console.log('slow frames:', JSON.stringify(summary.spikes), '\nby stop (spikes before each):', JSON.stringify(summary.marks));
fs.mkdirSync(path.join(ROOT, 'shots', 'phase5b'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'shots', 'phase5b', 'sound-check.json'), JSON.stringify({ rows, summary }, null, 1));
const okAll = rows.every((x) => x.skipped || x.ok) && S.prePeak < 1 && S.maxVoices <= SOUND.voices;
process.exit(okAll ? 0 : 1);
