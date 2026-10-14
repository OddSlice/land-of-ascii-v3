// (phase 5b) Before-and-after frames for the polish list, on the default
// seed, every view placed from the world's own records (so any build can be
// shot the same way): a reed bed from 10 m; crows on the walls and a flock
// of small birds at middle distance; deer coming back after you back off
// (a strip of frames); a lost thing at night, unlit and by the lantern; the
// things in the hand; the fort's wall at 15 and 25 m; the keep's hall and a
// tower's room; a street of people; an exchange. To shots/phase5b/<tag>-*.jpg.
//
//   node tools/pictures5b.mjs --tag before --root DIR   (a copy of the old build)
//   node tools/pictures5b.mjs --tag after [--only reeds,deer]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld } from '../src/world/pack.js';
import { buildPeople } from '../src/world/people/people.js';
import { placesOf } from '../src/game/places.js';
import { buildFavours } from '../src/game/favours.js';
import { PT, P, P_STRIDE } from '../src/world/kit.js';
import { groundAt } from '../src/world/objects.js';

const a = args();
const seed = Number(a.seed || DEFAULT_SEED), tag = String(a.tag || 'after');
const only = a.only ? String(a.only).split(',') : null;
const OUT = path.join(ROOT, 'shots', 'phase5b');
fs.mkdirSync(OUT, { recursive: true });
const gen = generateWorld(seed); let r; while (!(r = gen.next()).done);
const W = unpackWorld(packWorld(r.value)), PP = buildPeople(W), FV = buildFavours(W, PP, placesOf(W));
const T = W.terrain, deg = (x) => x * 180 / Math.PI;
const dry = (x, z) => { const j = Math.round(z) * W.NN + Math.round(x); return !(T.wWater[j] > 127 && T.levels[0].H[j] - T.ground[j] > 0.3); };
const look = (x, z, tx, tz) => deg(Math.atan2(tx - x, tz - z));

// ---- the views, from the world --------------------------------------------------------
const V = {};
{ // the biggest reed bed, from 10 m off its edge, from dry ground
  const S = W.kit.prims; let best = null;
  for (let i = 0; i < W.kit.np; i++) { const q = i * P_STRIDE; if (S[q + P.TYPE] === PT.REED && (!best || S[q + P.HX] > best[2])) best = [S[q + P.CX], S[q + P.CZ], S[q + P.HX]]; }
  for (let k = 0; k < 24; k++) {
    const t = k * Math.PI / 12, x = best[0] + Math.sin(t) * (best[2] + 10), z = best[1] + Math.cos(t) * (best[2] + 10);
    if (!dry(x, z)) continue;
    V.reeds = { x, z, yaw: look(x, z, best[0], best[1]), pitch: -4, hour: 14 };
    V.reedsNear = { x: best[0] + Math.sin(t) * (best[2] + 4), z: best[1] + Math.cos(t) * (best[2] + 4), yaw: look(x, z, best[0], best[1]), pitch: -6, hour: 14 };
    break;
  }
}
{ // the fort's wall between its first two towers, square on, at 15 and 25 m
  const tw = W.fortDesc.pieces.filter((p) => p.kind === 'tower'), f = W.sites.fort;
  const mx = (tw[0].at[0] + tw[1].at[0]) / 2, mz = (tw[0].at[1] + tw[1].at[1]) / 2;
  let nx = -(tw[1].at[1] - tw[0].at[1]), nz = tw[1].at[0] - tw[0].at[0]; const l = Math.hypot(nx, nz); nx /= l; nz /= l;
  if (nx * (mx - f.x) + nz * (mz - f.z) < 0) { nx = -nx; nz = -nz; }
  for (const d of [15, 25]) { const x = mx + nx * d, z = mz + nz * d; V[`wall${d}`] = { x, z, yaw: look(x, z, mx, mz), pitch: 6, hour: 15 }; }
  // the keep's hall, from its door end looking down it; a square tower's room
  const kp = W.fortDesc.pieces.find((p) => p.kind === 'keep');
  const ca = Math.cos(kp.angle), sa = Math.sin(kp.angle), y = kp.base + 0.06 + 1.7;
  const hz = kp.w - 1.5 - 0.6;
  V.hall = { x: kp.at[0] - hz * sa, z: kp.at[1] + hz * ca, y, yaw: deg(Math.atan2(sa, -ca)), pitch: -8, hour: 21 };
  V.hall2 = { x: kp.at[0] + (kp.d - 2.2) * ca, z: kp.at[1] + (kp.d - 2.2) * sa, y, yaw: deg(Math.atan2(-ca, -sa)), pitch: -8, hour: 21 };
  const sq = tw.find((p) => p.shape === 'square');
  const cx = sq.at[0], cz = sq.at[1];
  V.tower = { x: cx + (f.x - cx) * 0.06, z: cz + (f.z - cz) * 0.06, y: sq.base + 0.06 + 1.7, yaw: look(f.x, f.z, cx, cz), pitch: -10, hour: 11 };
  V.tower2 = { ...V.tower, yaw: V.tower.yaw + 110 }; V.tower3 = { ...V.tower, yaw: V.tower.yaw - 110 };
}
{ // a lost thing on the shore, 7 m off, at night; things in the hand
  const f = FV.list.find((x) => x.kind === 'find' && x.spot);
  const s = f.spot; let at = null;
  for (let k = 0; k < 24 && !at; k++) { const t = k * Math.PI / 12, x = s.x + Math.sin(t) * 7, z = s.z + Math.cos(t) * 7; if (dry(x, z)) at = { x, z, yaw: look(x, z, s.x, s.z) }; }
  V.lost = { ...at, pitch: -14, hour: 22.5, favour: f.id };
  const pick = (pred) => (FV.list.find(pred) || {}).id;
  V.hands = [['cloak', pick((x) => x.kind === 'carry' && /cloak/.test(x.slots && x.slots.thing || x.thing || '')) || FV.first, 2],
    ['bundle', pick((x) => x.kind === 'carry' && x.id !== FV.first && x.shape === 'bundle'), 2],
    ['tool', pick((x) => x.kind === 'find' && x.shape === 'tool'), 3],
    ['lantern', pick((x) => x.kind === 'find' && x.shape === 'oldlantern'), 3]].filter((h) => h[1]);
  V.handsAt = { x: W.start.x, z: W.start.z, yaw: deg(W.start.yaw || 0), pitch: -18, hour: 11 };
}

// ---- the shots ------------------------------------------------------------------------
const root = a.root ? path.resolve(String(a.root)) : ROOT;
const { server, url } = await serve(root);
const browser = await launch('chromium');
const want = (n) => !only || only.some((o) => n.startsWith(o));
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/index.html?seed=${seed}&quiet=1`);
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(async () => { await window.lab.ready; window.lab.setQuiet && window.lab.setQuiet(true); window.lab.setHud(false); window.lab.setDensity(3); await window.lab.whenIdle(); });
  const shot = async (name) => { const f = `${tag}-${name}.jpg`; await page.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 88 }); console.log(`shots/phase5b/${f}`); };
  const at = (v, weather = 'fair') => page.evaluate(async ({ v, weather }) => {
    const L = window.lab;
    L.setWeather(weather); L.freeze(v.hour, 0, 0);
    L.setCamera({ x: v.x, z: v.z, y: v.y, yaw: v.yaw, pitch: v.pitch });
    for (let k = 0; k < 4; k++) await L.whenIdle();
  }, { v, weather });

  if (want('reeds') && V.reeds) { await at(V.reeds); await shot('reeds-10m'); await at(V.reedsNear); await shot('reeds-4m'); }
  if (want('birds')) {
    for (const [type, d, name] of [['crow', 25, 'crows-25m'], ['finches', 30, 'small-birds-30m']]) {
      const ok = await page.evaluate(async ({ type, d }) => {
        const L = window.lab; L.setWeather('fair'); L.freeze(type === 'crow' ? 16 : 9.5, 0, 0);
        const g = L.animals.groups().findIndex((x) => x.type === type);
        if (g < 0) return false;
        L.animals.goTo(g, d); for (let k = 0; k < 4; k++) await L.whenIdle();
        return true;
      }, { type, d });
      if (ok) await shot(name);
    }
  }
  if (want('deer')) {
    // walk up to the deer at dawn until they run, wait, then back away at a
    // walk with the clock running: frames as they come back
    const g = await page.evaluate(async () => {
      const L = window.lab; L.setWeather('fair'); L.freeze(6.4, 0, 0);
      const g = L.animals.groups().findIndex((x) => x.type === 'deer');
      L.animals.goTo(g, 50, -0.02); for (let k = 0; k < 3; k++) await L.whenIdle();
      return g;
    });
    const step = (d0, d1, secs, n) => page.evaluate(async ({ g, d0, d1, secs, n }) => {
      const L = window.lab, s = L.state(), w0 = L.animals.groups()[g];
      const c = { x: s.x, z: s.z };
      const ux = (w0.x - c.x), uz = (w0.z - c.z), l = Math.hypot(ux, uz);
      const hx = w0.x - ux / l * 50, hz = w0.z - uz / l * 50;
      const yaw = Math.atan2(ux, uz) * 180 / Math.PI;
      for (let k = 1; k <= n; k++) {
        const d = d0 + (d1 - d0) * k / n;
        L.setCamera({ x: w0.x - ux / l * d, z: w0.z - uz / l * d, yaw, pitch: -2 });
        await new Promise((res) => setTimeout(res, secs * 1000 / n));
      }
      void hx; void hz;
    }, { g, d0, d1, secs, n });
    await page.evaluate(() => { window.lab.unfreeze(); window.lab.runClock(false); });
    await step(50, 14, 7, 30);
    await page.waitForTimeout(2500);
    await shot('deer-1-fled');
    await step(14, 26, 4, 16);
    await page.evaluate(async () => { await window.lab.whenIdle(); });
    await shot('deer-2-backing-off');
    await step(26, 34, 3, 10);
    await page.waitForTimeout(1500);
    await shot('deer-3-backed-off');
    await page.waitForTimeout(16000);
    await shot('deer-4-coming-back');
    await page.waitForTimeout(16000);
    await shot('deer-5-home');
  }
  if (want('lost') && V.lost) {
    await page.evaluate((id) => { const L = window.lab; L.progress.enable({ store: false }); L.progress.clear(); L.progress.setFavour(id, 2); }, V.lost.favour);
    await at(V.lost); await shot('lost-night-unlit');
    await page.evaluate(() => window.lab.progress.setLit(true));
    await at(V.lost); await shot('lost-night-lantern');
    await page.evaluate(() => { window.lab.progress.setLit(false); window.lab.progress.clear(); });
  }
  if (want('hands')) {
    for (const [name, id, st] of V.hands) {
      await page.evaluate(({ id, st }) => { const L = window.lab; L.progress.enable({ store: false }); L.progress.clear(); L.progress.setFavour(id, st); }, { id, st });
      await at(V.handsAt); await shot(`hand-${name}`);
    }
    await page.evaluate(() => window.lab.progress.clear());
  }
  if (want('wall')) { await at(V.wall15); await shot('wall-15m'); await at(V.wall25); await shot('wall-25m'); }
  if (want('keep')) { await at(V.hall); await shot('keep-hall'); await at(V.hall2); await shot('keep-hall-2'); await at(V.tower); await shot('tower-room'); await at(V.tower2); await shot('tower-room-2'); await at(V.tower3); await shot('tower-room-3'); }
  if (want('street')) {
    await page.evaluate(async () => {
      const L = window.lab, i = L.cameras.findIndex((c) => /street\), its centre/.test(c.name));
      L.camera(i); L.freeze(10, 0, 0); L.setWeather('fair'); for (let k = 0; k < 4; k++) await L.whenIdle();
    });
    await shot('street-people');
  }
  if (want('talk')) {
    // (a first visit, as a player has it: the first meeting on the road)
    const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const p2 = await c2.newPage();
    await p2.goto(`${url}/index.html?seed=${seed}`);
    await p2.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
    await p2.evaluate(async () => { await window.lab.ready; await window.lab.whenIdle(); });
    await p2.keyboard.press('Enter'); await p2.waitForTimeout(300);
    const ok = await p2.evaluate(async () => {
      const L = window.lab, m = L.progress.meet();
      if (!m) return false;
      L.setHud(false); L.freeze(m.arrive + 0.02, 0, 0); await L.whenIdle(); await L.whenIdle();
      const pp = L.people.list()[m.person], a2 = pp.yaw;
      L.setCamera({ x: pp.x + Math.sin(a2) * 1.6, z: pp.z + Math.cos(a2) * 1.6, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -8 });
      await L.whenIdle(); await L.whenIdle();
      L.people.greet(); await new Promise((r2) => setTimeout(r2, 700));
      return !!L.progress.talk.read();
    });
    if (ok) { const f = `${tag}-exchange.jpg`; await p2.screenshot({ path: path.join(OUT, f), type: 'jpeg', quality: 88 }); console.log(`shots/phase5b/${f}`); }
    await c2.close();
  }
  if (want('map')) {
    // the map after walking the road from the spawn to the fort, a metre a
    // frame with the eye ahead, progress on (nothing kept)
    const rd = W.roads.find((q) => q.to === 'fort');
    const pts = []; for (let k = 0; k < rd.n; k += 1) pts.push([rd.x[k], rd.z[k]]);
    await page.evaluate(async (pts) => {
      const L = window.lab; L.progress.enable({ store: false }); L.progress.clear(); L.freeze(11, 0, 0); L.setWeather('fair');
      for (let k = 0; k + 1 < pts.length; k++) {
        const [x, z] = pts[k], [x2, z2] = pts[k + 1];
        L.setCamera({ x, z, yaw: Math.atan2(x2 - x, z2 - z) * 180 / Math.PI, pitch: 0 });
        await new Promise((r2) => requestAnimationFrame(r2));
      }
      L.setMap(true); await new Promise((r2) => setTimeout(r2, 800));
    }, pts);
    await shot('map-after-the-fort-road');
    await page.evaluate(() => { window.lab.setMap(false); window.lab.progress.clear(); });
  }
  if (errors.length) console.log('page errors:', errors);
} finally { await browser.close(); server.close(); }
