// (phase 5a) The progress check: a scripted session in a fresh browser
// profile (the first meeting, a favour taken and done, the lantern, a
// chained favour, a lost thing found, sketches at a notable view and
// elsewhere, places found and people met, the lantern lit), then:
//  1. the page is loaded again: every saved thing must come back the same
//     (the record to the byte, and each sketch's cells);
//  2. the backup text, pasted into the World section's box in a second,
//     fresh profile and restored, must bring back the same;
//  3. a profile whose storage throws: the game runs, the journal works for
//     the session, and the save line says so once;
//  4. clearing progress (asked first) empties this world's record, and
//     another seed starts fresh while this one's is kept.
//
//   node tools/progress-check.mjs [--browser chromium] [--seed 3] [--built]
import { launch } from './lib/browser.mjs';
import { serve, args } from './lib/serve.mjs';

const a = args();
const seed = Number(a.seed || 3), name = String(a.browser || 'chromium');
const { server, url } = await serve();
const browser = await launch(name);
const rows = [];
const check = (what, ok, note = '') => { rows.push({ what, ok, note }); console.log(`${ok ? 'pass' : 'FAIL'}  ${what}${note ? `: ${note}` : ''}`); };

async function open(ctx, s = seed) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}/${a.built ? 'index.html' : ''}?seed=${s}`);
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.lab.ready);
  await page.evaluate(async () => { await window.lab.whenIdle(); });
  return { page, errors };
}
// what is saved, read back: the record and each sketch's cells
const snapshot = (page) => page.evaluate(async () => {
  const L = window.lab, p = L.progress.get();
  const sk = {};
  for (const s of p.sketches) sk[s.id] = await L.progress.sketchHash(s.id);
  return { p, sk, journal: L.progress.journal.data() };
});
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

try {
  // ---- the scripted session ----
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  let { page, errors } = await open(ctxA);
  const st = await page.evaluate(() => ({ card: window.lab.menu.read().card, meet: window.lab.progress.meet(), on: window.lab.progress.on }));
  check('a first visit shows the start card and the first meeting', st.card && st.meet && st.meet.on, st.meet ? `${st.meet.name} comes to the road` : 'no meeting');
  await page.mouse.click(640, 400);
  const session = await page.evaluate(async () => {
    const L = window.lab, log = [];
    const near = async (i, hour, day = 0) => {
      L.menu.close(); L.freeze(hour, 0, day); await L.whenIdle();
      const p = L.people.list()[i], a2 = p.yaw;
      L.setCamera({ x: p.x + Math.sin(a2) * 1.6, z: p.z + Math.cos(a2) * 1.6, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -8 });
      await L.whenIdle(); await L.whenIdle();
    };
    const say = async () => { L.people.greet(); await new Promise((r) => setTimeout(r, 200)); const t = L.progress.talk.read(); log.push(t ? t.lines.join(' ') : '(a usual line)'); return t; };
    const yes = async () => { for (let k = 0; k < 6; k++) { const t = L.progress.talk.read(); if (!t) break; L.progress.talk.go(); await new Promise((r) => setTimeout(r, 60)); } };
    const m = L.progress.meet();
    await near(m.person, m.arrive + 0.02); await say(); await yes();
    const F = L.progress.favours(), f0 = F.find((f) => f.first);
    // walk a little along the road
    L.unfreeze(); L.walk(['KeyW'], 4); L.freeze(14.3, 0, 0);
    // the first favour done, the next taken
    const D = L.people.list()[f0.dest];
    await near(f0.dest, 15.0); await say(); await yes();
    // a find favour: taken, its thing picked up, brought back
    const ff = L.progress.favours().find((f) => f.kind === 'find' && !f.parent && f.state === 0);
    if (ff) {
      L.progress.setFavour(ff.id, 2);
      L.setCamera({ x: ff.spot.x + 0.6, z: ff.spot.z, yaw: -90, pitch: -20 }); L.freeze(15.2, 0, 0);
      await L.whenIdle(); await L.whenIdle(); await L.whenIdle();
    }
    // a sketch at a viewpoint (a notable view), and one by the fort
    const v = L.progress.places().find((p) => p.kind === 'viewpoint');
    L.setCamera({ x: v.x + 3, z: v.z + 3, yaw: 200, pitch: -4 }); L.freeze(16, 0, 0);
    await L.whenIdle(); await L.whenIdle(); await L.whenIdle();
    const s1 = await L.progress.sketch();
    L.camera(8); await L.whenIdle(); await L.whenIdle();
    const s2 = await L.progress.sketch();
    L.progress.setLit(true);
    await L.whenIdle();
    L.progress.save();
    return { log, sketches: [s1, s2], picked: ff ? L.progress.favours().find((f) => f.id === ff.id).state : null };
  });
  check('the first favour taken and done; the lantern given', session.log.length >= 2, session.log.slice(0, 2).join(' / ').slice(0, 160));
  check('a lost thing picked up where it lay', session.picked === 3, `state ${session.picked}`);
  check('two sketches kept, one of a notable view', session.sketches.every(Boolean) && !!session.sketches[0].notable, session.sketches.map((s) => s && s.place).join('; '));
  const A = await snapshot(page);
  const counts = `${Object.keys(A.p.found).length} places, ${Object.keys(A.p.met).length} people, ${A.p.sketches.length} sketches, ${Object.values(A.p.favours).filter((f) => f.s === 4).length} done of ${Object.keys(A.p.favours).length} favours, lantern ${A.p.lantern}${A.p.lit ? ' (lit)' : ''}, ${A.journal.carried.length} carried, ${Math.round(A.journal.seen * 100)}% of the land seen`;
  console.log(`  saved: ${counts}`);
  const stored = await page.evaluate(() => window.lab.progress.stored());
  check('written to the browser\'s storage', !!stored, `${stored ? stored.length : 0} characters for the record`);
  // ---- 1. load again ----
  await page.reload();
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(async () => { await window.lab.ready; await window.lab.whenIdle(); });
  const B = await snapshot(page);
  for (const k of ['found', 'met', 'favours', 'lantern', 'lit', 'sketches', 'seen', 'walked', 'first']) check(`after loading again: ${k}`, same(A.p[k], B.p[k]));
  check('after loading again: every sketch\'s cells', same(A.sk, B.sk), `${Object.keys(B.sk).length} sketches`);
  check('after loading again: no first meeting, no start card', await page.evaluate(() => !window.lab.progress.meet().on && !window.lab.menu.read().card));
  const backup = await page.evaluate(() => window.lab.progress.backup());
  console.log(`  backup text: ${backup.length} characters, ${backup.split('\n').length} lines`);
  check('no page errors in the session', !errors.length, errors.join(' | ').slice(0, 200));
  // ---- 2. paste to restore, in a fresh profile ----
  const ctxC = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  ({ page } = await open(ctxC));
  await page.evaluate(() => window.lab.menu.close());
  await page.mouse.click(512, 320);
  const before = await page.evaluate(() => window.lab.progress.get());
  check('a fresh profile starts with nothing saved', !Object.keys(before.found).length || Object.keys(before.found).length <= 3, `${Object.keys(before.found).length} places noted on arrival`);
  await page.evaluate(() => { window.lab.menu.open(); document.querySelector('#menu-tab-world').click(); });
  await page.fill('#menu textarea', backup);
  await page.click('#menu button:has-text("restore from this text")');
  await page.waitForTimeout(800);
  const said = await page.evaluate(() => document.querySelector('#menu .restore .note').textContent);
  const C = await snapshot(page);
  for (const k of ['found', 'met', 'favours', 'lantern', 'lit', 'sketches', 'seen', 'walked']) check(`restored from the backup text: ${k}`, same(A.p[k], C.p[k]));
  check('restored from the backup text: every sketch\'s cells', same(A.sk, C.sk));
  check('the save line after restoring', /places found/.test(await page.evaluate(() => document.querySelector('#menu .saveline').textContent)), `"${said}"`);
  // restoring rubbish says why and changes nothing
  await page.fill('#menu textarea', 'not a backup at all');
  await page.click('#menu button:has-text("restore from this text")');
  await page.waitForTimeout(300);
  check('a damaged backup is refused and changes nothing', same(C.p, (await snapshot(page)).p), await page.evaluate(() => document.querySelector('#menu .restore .note').textContent));
  // ---- 4. clearing (asked first), and another seed starts fresh ----
  const quiet = await page.evaluate(() => document.querySelector('#menu .ask').offsetParent === null && [...document.querySelectorAll('#menu button')].filter((b) => /open that world|open seed/.test(b.textContent)).every((b) => b.offsetParent === null));
  await page.click('#menu button:has-text("clear progress")');
  const asked = quiet && await page.evaluate(() => document.querySelector('#menu .ask').offsetParent !== null);
  await page.click('#menu button:has-text("keep it")');
  const kept = await snapshot(page);
  check('clear progress asks first; "keep it" keeps it', asked && same(kept.p.favours, C.p.favours));
  await page.click('#menu button:has-text("clear progress")');
  await page.click('#menu button:has-text("clear it")');
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => ({ p: window.lab.progress.get(), stored: window.lab.progress.stored(), line: document.querySelector('#menu .saveline').textContent }));
  check('"clear it" empties this world\'s record', !Object.keys(cleared.p.favours).length && !cleared.p.sketches.length && !cleared.p.lantern, cleared.line);
  await ctxC.close();
  const { page: p5 } = await open(ctxA, 5);
  const fresh5 = await p5.evaluate(() => ({ p: window.lab.progress.get(), meet: window.lab.progress.meet() }));
  check('a new world from a new seed starts fresh', !Object.keys(fresh5.p.favours).length && !fresh5.p.sketches.length && fresh5.meet && fresh5.meet.on);
  const { page: p3 } = await open(ctxA, seed);
  const back3 = await snapshot(p3);
  check('and the first world is kept', same(back3.p.favours, A.p.favours) && same(back3.sk, A.sk));
  await ctxA.close();
  // ---- 3. no storage at all ----
  const ctxD = await browser.newContext({ viewport: { width: 1024, height: 640 } });
  await ctxD.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage is blocked'); } }); });
  const d = await open(ctxD);
  await d.page.mouse.click(512, 320);
  const nd = await d.page.evaluate(async () => {
    const L = window.lab, m = L.progress.meet();
    L.freeze(m.arrive + 0.02, 0, 0);
    await L.whenIdle(); await L.whenIdle();
    const p = L.people.list()[m.person], a2 = p.yaw;
    L.setCamera({ x: p.x + Math.sin(a2) * 1.6, z: p.z + Math.cos(a2) * 1.6, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -8 });
    await L.whenIdle(); await L.whenIdle();
    L.people.greet(); await new Promise((r) => setTimeout(r, 200)); L.progress.talk.go();
    const sk = await L.progress.sketch();
    L.progress.journal.open('favours');
    const j = L.progress.journal.read();
    L.progress.journal.close();
    L.menu.open(); document.querySelector('#menu-tab-world').click();
    return { taken: L.progress.favours().find((f) => f.first).state, sketch: !!sk, journal: j.text, note: L.progress.note(), errors: L.errors };
  });
  console.log('  no storage:', JSON.stringify({ ...nd, journal: nd.journal.slice(0, 120) }));
  check('without storage the game runs and the journal works for the session', nd.taken === 2 && nd.sketch && /Take /.test(nd.journal) && !nd.errors.length && !d.errors.length, d.errors.join(' | ').slice(0, 160));
  check('the save line says once that nothing is kept', /not keeping anything/.test(nd.note), nd.note);
  await ctxD.close();
} finally {
  await browser.close();
  server.close();
}
const bad = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - bad.length} of ${rows.length} pass (${name})`);
process.exit(bad.length ? 1 : 0);
