// (phase 5a) The pictures for docs/phase5a.md, from one scripted first
// session on the default seed, as a player sees it (the start card, the
// exchange, the journal and the menu shown): the map unknown at the start;
// the first meeting on the road and its exchange; the first favour's chain
// played through, every exchange written down (shots/phase5a/chain.md);
// the map after the walk; each journal page; a sketch full screen and as
// text; the lantern on a night road (and the same road without it); the
// save line in the menu. To shots/phase5a/.
//
//   node tools/pictures5a.mjs [--seed 3] [--built]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';
import { generateWorld, DEFAULT_SEED } from '../src/world/gen/world.js';
import { packWorld, unpackWorld } from '../src/world/pack.js';
import { buildPeople, routeOf } from '../src/world/people/people.js';
import { placesOf } from '../src/game/places.js';
import { buildFavours } from '../src/game/favours.js';

const a = args();
const seed = Number(a.seed || DEFAULT_SEED);
const OUT = path.join(ROOT, 'shots', 'phase5a');
fs.mkdirSync(OUT, { recursive: true });
// the same world in Node, for the ways between people
const gen = generateWorld(seed); let r; while (!(r = gen.next()).done);
const W = unpackWorld(packWorld(r.value)), P = buildPeople(W), FV = buildFavours(W, P, placesOf(W));
const wayTo = (a2, b2) => { const R = routeOf(P, a2, b2); const pts = []; for (let i = 0; i < R.n; i += 6) pts.push([R.x[i], R.z[i]]); pts.push([R.x[R.n - 1], R.z[R.n - 1]]); return { pts, len: R.len }; };

const { server, url } = await serve();
const browser = await launch('chromium');
const chain = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/${a.built ? 'play.html' : ''}?seed=${seed}`);
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(async () => { await window.lab.ready; await window.lab.whenIdle(); await window.lab.whenIdle(); });
  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 86 }); console.log(`shots/phase5a/${name}.jpg`); };
  const idle = (n = 2) => page.evaluate(async (n) => { for (let k = 0; k < n; k++) await window.lab.whenIdle(); }, n);
  const clock = () => page.evaluate(() => { const s = window.lab.state(); const h = Math.floor(s.hour), m = Math.floor((s.hour - h) * 60); return `day ${s.day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; });
  // stand 1.6 m in front of person i, facing them, at an hour
  const before = (i, hour) => page.evaluate(async ({ i, hour }) => {
    const L = window.lab;
    if (hour !== undefined) L.freeze(hour, 0, L.state().day);
    await L.whenIdle(); await L.whenIdle();
    const p = L.people.list()[i], a2 = p.yaw;
    L.setCamera({ x: p.x + Math.sin(a2) * 1.7, z: p.z + Math.cos(a2) * 1.7, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -6 });
    await L.whenIdle(); await L.whenIdle(); await L.whenIdle();
  }, { i, hour });
  const greet = async (label) => {
    await page.evaluate(() => window.lab.people.greet());
    await page.waitForTimeout(350);
    const t = await page.evaluate(() => window.lab.progress.talk.read());
    const pages = [];
    if (t) {
      for (let k = 0; k < 6; k++) {
        const q = await page.evaluate(() => window.lab.progress.talk.read());
        if (!q) break;
        pages.push(q.lines.join(' '));
        if (label && k === 0) await shot(label);
        await page.evaluate(() => window.lab.progress.talk.go());
        await page.waitForTimeout(150);
      }
    }
    return { who: t ? `${t.who.name}, ${t.who.role}` : '', pages };
  };
  // walk a way: the camera stepped along it, a frame at each step, so what
  // is seen is noted as in walking
  const walkWay = async (pts) => { for (let i = 0; i < pts.length; i += 2) { const p = pts[i], q = pts[Math.min(pts.length - 1, i + 2)]; await page.evaluate(async ({ p, q }) => { window.lab.setCamera({ x: p[0], z: p[1], yaw: Math.atan2(q[0] - p[0], q[1] - p[1]) * 180 / Math.PI, pitch: 0 }); await window.lab.whenIdle(); }, { p, q }); } };
  const state = (id) => page.evaluate((id) => window.lab.progress.favours().find((f) => f.id === id), id);
  const journalWords = async (id) => { const f = await state(id); return f && f.words ? f.words.join(' ') : ''; };

  // ---- the start: the card, the map unknown ----
  await shot('start-card');
  await page.evaluate(() => window.lab.titlePlay && window.lab.titlePlay());   // (phase 6: past the title screen)
  await page.mouse.click(640, 400);
  await page.evaluate(() => { window.lab.menu.close(); window.lab.freeze(14.0, 0, 0); });
  await idle(3);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(600);
  await shot('map-start');
  await page.keyboard.press('KeyM');
  // ---- the first meeting: coming up the road, then waiting at its edge ----
  const m = FV.meet, f0 = FV.list.find((f) => f.id === FV.first);
  await page.evaluate(async ({ m }) => {
    // (from 7 m toward the spawn from where they will stand, as they come up the road)
    const L = window.lab; L.freeze(m.arrive - 0.12 / 60, 0, 0);
    const x = m.spot.x + Math.sin(m.spot.yaw) * 7, z = m.spot.z + Math.cos(m.spot.yaw) * 7;
    L.setCamera({ x, z, yaw: m.spot.yaw * 180 / Math.PI + 180, pitch: -3 }); await L.whenIdle();
    const p = L.people.list()[m.person];
    L.face(Math.atan2(p.x - x, p.z - z) * 180 / Math.PI); await L.whenIdle(); await L.whenIdle();
  }, { m });
  await shot('meeting-road');
  await before(m.person, m.arrive + 0.5 / 60);
  chain.push({ step: 'the first meeting', when: await clock(), where: 'the spawn\'s road, 26 m from where you start', ...(await greet('meeting-exchange')), journal: await journalWords(f0.id), state: 'taken' });
  // ---- to the one it is for, along the way, and the favour done ----
  const du = FV.usual.get(f0.dest), w0 = wayTo(m.spot.place, du.place);
  await walkWay(w0.pts);
  await before(f0.dest, Math.max(m.arrive + w0.len / 4.5 / 3600 + 0.02, 14.1));
  chain.push({ step: `${f0.kind}: to ${P.persons[f0.dest].name}`, when: await clock(), where: du.where, walk: `${Math.round(w0.len)} m, ${(w0.len / 4.5 / 60).toFixed(1)} min`, ...(await greet('deliver-exchange')), journal: '', state: (await state(f0.id)).state === 4 ? 'done; the lantern given; their own favour taken' : 'not done' });
  await page.keyboard.press('KeyM'); await page.waitForTimeout(600);
  await shot('map-after');
  await page.keyboard.press('KeyM');
  // ---- the chain on: each favour that follows, played through (asked
  // where the last one ended, or by going back to its giver) ----
  let prev = f0;
  for (let k = 0; k < 3; k++) {
    const f = FV.list.find((x) => x.parent === prev.id);
    if (!f) break;
    const gu = FV.usual.get(f.giver);
    if ((await state(f.id)).state < 2) {
      await before(f.giver, 15.0);
      chain.push({ step: `asked by ${P.persons[f.giver].name}`, when: await clock(), where: gu.where, ...(await greet(null)), state: (await state(f.id)).state === 2 ? 'taken' : 'not taken' });
    }
    const words = await journalWords(f.id);
    if (f.kind === 'find') {
      const w1 = wayTo(gu.place, f.spot.place);
      await walkWay(w1.pts);
      await page.evaluate(async ({ s }) => { const L = window.lab; L.setCamera({ x: s.x - 3, z: s.z, yaw: 90, pitch: -18 }); await L.whenIdle(); await L.whenIdle(); }, { s: f.spot });
      await shot('lost-thing');
      await page.evaluate(async ({ s }) => { const L = window.lab; L.setCamera({ x: s.x - 0.5, z: s.z, yaw: 90, pitch: -18 }); await L.whenIdle(); await L.whenIdle(); }, { s: f.spot });
      const picked = (await state(f.id)).state;
      chain.push({ step: `find: ${f.slots.short}`, when: await clock(), where: f.spot.lost, walk: `${Math.round(w1.len)} m, ${(w1.len / 4.5 / 60).toFixed(1)} min`, journal: words, pages: [picked === 3 ? 'picked up where it lay' : `not picked up (state ${picked})`], who: '' });
      const w2 = wayTo(f.spot.place, gu.place);
      await walkWay(w2.pts);
      await before(f.giver, 15.6);
      chain.push({ step: `back to ${P.persons[f.giver].name}`, when: await clock(), where: gu.where, walk: `${Math.round(w2.len)} m, ${(w2.len / 4.5 / 60).toFixed(1)} min`, ...(await greet(k === 1 ? 'back-exchange' : null)), state: (await state(f.id)).state === 4 ? 'done' : 'not done' });
    } else {
      const du2 = FV.usual.get(f.dest), w1 = wayTo(gu.place, du2.place);
      await walkWay(w1.pts);
      await before(f.dest, 15.2);
      chain.push({ step: `${f.kind}: to ${P.persons[f.dest].name}`, when: await clock(), where: du2.where, walk: `${Math.round(w1.len)} m, ${(w1.len / 4.5 / 60).toFixed(1)} min`, journal: words, ...(await greet(null)), state: f.kind === 'tell' ? 'the answer to carry back; their own favour taken' : 'done' });
      if (f.kind === 'tell') {
        const w2 = wayTo(du2.place, gu.place);
        await walkWay(w2.pts);
        await before(f.giver, 15.4);
        chain.push({ step: `back to ${P.persons[f.giver].name}`, when: await clock(), where: gu.where, walk: `${Math.round(w2.len)} m, ${(w2.len / 4.5 / 60).toFixed(1)} min`, ...(await greet(null)), state: (await state(f.id)).state === 4 ? 'done' : 'not done' });
      }
    }
    prev = f;
  }
  const standing = await page.evaluate(() => window.lab.progress.journal.data().standing);
  chain.push({ step: 'standing', when: await clock(), where: '', pages: [`known as ${standing}`] });
  // ---- sketches: a notable view, and the land ----
  const v = await page.evaluate(() => window.lab.progress.places().find((p) => p.kind === 'viewpoint'));
  await page.evaluate(async ({ v }) => { const L = window.lab; L.setCamera({ x: v.x + 2, z: v.z + 2, yaw: 160, pitch: -5 }); L.freeze(16.5, 0, 0); for (let k = 0; k < 4; k++) await L.whenIdle(); }, { v });
  const s1 = await page.evaluate(() => window.lab.progress.sketch());
  await page.evaluate(async () => { const L = window.lab; L.camera(1); L.freeze(17.6, 0, 0); for (let k = 0; k < 3; k++) await L.whenIdle(); });
  await page.evaluate(() => window.lab.progress.sketch());
  fs.writeFileSync(path.join(OUT, 'sketch.txt'), await page.evaluate((id) => window.lab.progress.sketchText(id), s1.id));
  console.log('shots/phase5a/sketch.txt');
  // ---- the journal's pages ----
  for (const tab of ['places', 'people', 'sketches', 'favours']) {
    await page.evaluate((t) => { window.lab.progress.journal.open(t); window.lab.progress.journal.tab(t); }, tab);
    await page.waitForTimeout(600);
    await shot(`journal-${tab}`);
  }
  await page.evaluate((id) => window.lab.progress.journal.view(id), s1.id);
  await page.waitForTimeout(1200);
  await shot('sketch-full');
  await page.evaluate(() => { window.lab.progress.journal.shut(); window.lab.progress.journal.close(); });
  // ---- the lantern on a night road ----
  for (const lit of [false, true]) {
    await page.evaluate(async (lit) => { const L = window.lab; L.camera(7); L.freeze(22.6, 0, 3); L.progress.setLit(lit); for (let k = 0; k < 4; k++) await L.whenIdle(); }, lit);
    await page.waitForTimeout(400);
    await shot(lit ? 'lantern-lit' : 'lantern-dark');
  }
  // ---- and mirrored: standing in the lake's shallows at night, lit ----
  {
    const lakePts = (await page.evaluate(() => window.lab.progress.places().find((p) => p.kind === 'lake'))).at;
    const shore = FV.spots.find((s2) => s2.kind === 'shore');
    if (shore) {
      const w2 = lakePts.reduce((b, q) => (!b || Math.hypot(q[0] - shore.x, q[1] - shore.z) < Math.hypot(b[0] - shore.x, b[1] - shore.z) ? q : b), null);
      const dx = w2[0] - shore.x, dz = w2[1] - shore.z, d = Math.hypot(dx, dz);
      await page.evaluate(async ({ x, z, yaw }) => { const L = window.lab; L.setCamera({ x, z, yaw, pitch: -24 }); L.freeze(22.6, 0, 3); L.progress.setLit(true); for (let k = 0; k < 5; k++) await L.whenIdle(); }, { x: shore.x + dx / d * 7, z: shore.z + dz / d * 7, yaw: Math.atan2(dx, dz) * 180 / Math.PI });
      await page.waitForTimeout(400);
      await shot('lantern-water');
    }
  }
  // ---- the save line in the menu ----
  await page.evaluate(() => { window.lab.menu.open(); document.querySelector('#menu-tab-world').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#menu .saveline').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await shot('menu-save');
  await page.evaluate(() => window.lab.menu.close());
  if (errors.length) throw new Error(errors.join('\n'));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
// the chain, as a table
const esc = (s) => String(s || '').replace(/\|/g, '/').replace(/\n/g, ' ');
const md = ['| step | when | where | walking | who | what is said | the journal | then |', '|---|---|---|---|---|---|---|---|',
  ...chain.map((c) => `| ${esc(c.step)} | ${esc(c.when)} | ${esc(c.where)} | ${esc(c.walk)} | ${esc(c.who)} | ${esc((c.pages || []).join(' / '))} | ${esc(c.journal)} | ${esc(c.state)} |`)].join('\n');
fs.writeFileSync(path.join(OUT, 'chain.md'), `${md}\n`);
console.log('shots/phase5a/chain.md');
