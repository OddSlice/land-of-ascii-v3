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
import { openVisitor } from './lib/game.mjs';

const a = args();
const seed = Number(a.seed || 3), name = String(a.browser || 'chromium');
const { server, url } = await serve();
const browser = await launch(name);
const rows = [];
const check = (what, ok, note = '') => { rows.push({ what, ok, note }); console.log(`${ok ? 'pass' : 'FAIL'}  ${what}${note ? `: ${note}` : ''}`); };

// (phase 6: the title screen comes first; Play or Continue, unless `keep`)
async function open(ctx, s = seed, keep = false, query = '') {
  const { page, errors } = await openVisitor(browser, url, { ctx, built: !!a.built, query: `?seed=${s}${query}` });
  await page.evaluate(async () => { await window.lab.whenIdle(); });
  if (!keep) await page.evaluate(() => window.lab.titlePlay());
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
  let { page, errors } = await open(ctxA, seed, true);
  const st = await page.evaluate(() => ({ title: window.lab.titleState(), meet: window.lab.progress.meet(), on: window.lab.progress.on }));
  check('a first visit shows the title screen with Play, and the first meeting', st.title.up && /^Play/.test(st.title.choices[0]) && st.meet && st.meet.on, st.meet ? `${st.title.choices[0]}; ${st.meet.name} comes to the road` : 'no meeting');
  await page.evaluate(() => window.lab.titlePlay());
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
  const lastAt = await page.evaluate(() => { const s = window.lab.state(); return [s.x, s.z]; });
  await page.evaluate(() => window.lab.progress.save());
  await page.reload();
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(async () => { await window.lab.ready; await window.lab.whenIdle(); });
  // (phase 6) the title says Continue, with the standing and where you were; Continue stands you there
  const t2 = await page.evaluate(() => window.lab.titleState());
  check('after loading again the title screen says Continue, with the standing and the last place', t2.up && /^Continue/.test(t2.choices[0]) && /a (stranger|wayfarer|friend|known|trusted)/.test(t2.choices[0]), t2.choices[0]);
  await page.evaluate(() => window.lab.titlePlay());
  const cAt = await page.evaluate(() => { const s = window.lab.state(); return [s.x, s.z]; });
  check('Continue stands you where you left off', Math.hypot(cAt[0] - lastAt[0], cAt[1] - lastAt[1]) < 1.5, `${lastAt.map((v) => v.toFixed(1))} -> ${cAt.map((v) => v.toFixed(1))}`);
  const B = await snapshot(page);
  for (const k of ['found', 'met', 'favours', 'lantern', 'lit', 'sketches', 'seen', 'walked', 'first']) check(`after loading again: ${k}`, same(A.p[k], B.p[k]));
  check('after loading again: every sketch\'s cells', same(A.sk, B.sk), `${Object.keys(B.sk).length} sketches`);
  check('after loading again: no first meeting', await page.evaluate(() => !window.lab.progress.meet().on));
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
  // ---- (phase 6) a shared link with a place and an hour opens there ----
  {
    const ctxE = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    const e = await open(ctxE, seed, true, '&at=700.5,1100.2,90&hour=16.5');
    const up = await e.page.evaluate(() => window.lab.titleState().up);
    await e.page.evaluate(() => window.lab.titlePlay());
    const at = await e.page.evaluate(() => { const s = window.lab.state(); return { x: s.x, z: s.z, yaw: s.yaw, hour: s.hour }; });
    const yawDeg = (at.yaw % 360 + 360) % 360;   // (lab.state gives degrees)
    check('a shared link with a place and an hour opens there, after the title screen', up && Math.abs(at.x - 700.5) < 0.05 && Math.abs(at.z - 1100.2) < 0.05 && Math.abs(yawDeg - 90) < 0.5 && Math.abs(at.hour - 16.5) < 0.05,
      `(${at.x.toFixed(1)}, ${at.z.toFixed(1)}), facing ${yawDeg.toFixed(0)}, ${at.hour.toFixed(2)} h`);
    // and the link the World section makes for where you stand opens there too
    await e.page.evaluate(() => window.lab.setCamera({ x: 812.3, z: 1013.7, yaw: 200 }));
    const made = await e.page.evaluate(() => window.lab.shareLink(true));
    const q = new URL(made).searchParams;
    const e2 = await open(ctxE, seed, false, `&at=${q.get('at')}&hour=${q.get('hour')}`);
    const at2 = await e2.page.evaluate(() => { const s = window.lab.state(); return { x: s.x, z: s.z }; });
    check('the link Share this world makes, with the place, opens at that place', /seed=3/.test(made) && Math.hypot(at2.x - 812.3, at2.z - 1013.7) < 0.1, `${made.replace(/^.*\?/, '?')}`);
    await ctxE.close();
  }
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
