// (phase 6.1) The audit beyond the other tools: what they do not cover,
// each a short scripted session in a real browser, with every fault written
// down. A fault is a page error, a stopped game, a frame that never comes,
// or a stated promise not kept.
//  resize     the window resized while walking, through eight sizes, in
//             both memory modes: the grid follows, frames keep coming
//  switch     the detail level switched while walking (lab and keys), and
//             the page opened with 0, 1, 2 and 8 workers, walking each
//  disk       play.html opened from the disk (file://) in each engine
//  pages      the GitHub Pages copy (no shared memory) live, walking
//  cold       a cold load of the live site on a throttled network: the
//             front page, then the game to its title and its first frame
//  long       a long session: the clock at an hour a second for a month
//             (30 days in 12 minutes), sound and progress on, beside a
//             village: memory, frame time, the clock and the day, sampled
//  keys       every player key moved to another key: each new key does its
//             action, each old key does nothing
//  menu       every control of every menu section reached and pressed by
//             the keyboard alone (but those that leave the page)
//  text       the largest text at 1024 x 640: the title, each menu section,
//             each journal page, an exchange, a signpost, the map
//  storage    every storage call failing (get, set, remove, key, length,
//             clear): the front page, the title, Play, settings, keys, the
//             journal, a sketch
//  backup     edited backups: cut short, a character changed, another
//             head, and hand-made records with wrong kinds of value; each
//             restored, then the journal, the title and a reload; what is
//             not of its kind or not in this world left out (phase 6.2);
//             and a stored record the game cannot read kept aside
//
//   node tools/audit.mjs [--only resize,keys] [--browser chromium] [--live URL] [--minutes 12]
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { serve, args, ROOT } from './lib/serve.mjs';
import { openLab, openVisitor, play } from './lib/game.mjs';
import { backupText, freshProgress, toJSON } from '../src/game/progress.js';

const a = args();
const only = a.only ? String(a.only).split(',') : null;
const want = (k) => !only || only.includes(k);
const LIVE = String(a.live || 'https://land-of-ascii-v3.vercel.app');
const PAGES = 'https://oddslice.github.io/land-of-ascii-v3';
const rows = [];
const check = (area, what, ok, note = '') => { rows.push({ area, what, ok: !!ok, note }); console.log(`${ok ? 'pass' : 'FAIL'}  [${area}] ${what}${note ? `: ${note}` : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// (a step that never answers is a fault too, not a hang)
const within = (p, ms, what) => Promise.race([p, wait(ms).then(() => { throw new Error(`${what}: no answer in ${ms / 1000} s`); })]);
const { server, url } = await serve();
const plain = await serve(undefined, { isolated: false });
const browser = await launch(String(a.browser || 'chromium'));

// any page as a visitor opens it (the front page, a file, a live site; the
// game on this server opens with openVisitor); `init`: a script to run
// before the page's own
async function visit(u, { width = 1280, height = 800, init = null, ctx = null } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  if (init) await c.addInitScript(init);
  const page = await c.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(u);
  return { ctx: c, page, errors };
}
const ready = (page, ms = 180000) => page.waitForFunction(() => window.lab && window.lab.ready && window.lab.titleState, null, { timeout: ms }).then(() => page.evaluate(() => window.lab.ready));
const presented = (page) => page.evaluate(() => window.lab.state().presented);
const stopped = (page) => page.evaluate(() => window.lab.errors.slice());
// frames still coming: the count moves on over `ms`
async function alive(page, ms = 600) { const p0 = await presented(page); await wait(ms); return (await presented(page)) > p0; }

try {
  // ---- resize --------------------------------------------------------------------------
  if (want('resize')) {
    for (const [mode, base] of [['shared', url], ['fallback', plain.url]]) {
      const lab = await openLab(browser, base, { built: true, scene: 'world', threads: 4, width: 1280, height: 800, dpr: 1 });
      const { page } = lab;
      await page.evaluate(() => window.lab.runClock(true));
      await page.keyboard.down('KeyW');
      const sizes = [[1440, 900], [800, 600], [1920, 1080], [375, 812], [1024, 640], [2560, 1440], [640, 360], [1280, 800]];
      const seen = [];
      let ok = true;
      for (const [w, h] of sizes) {
        await page.setViewportSize({ width: w, height: h });
        await wait(120);
        await page.setViewportSize({ width: w + 37, height: h - 23 });   // (a drag in progress)
        await wait(450);
        const s = await page.evaluate(() => ({ ...window.lab.state(), cellsLen: window.lab.cells().length, iw: innerWidth, ih: innerHeight }));
        const live = await alive(page, 500);
        seen.push(`${s.iw}x${s.ih}:${s.cols}x${s.rows}${live ? '' : ' (stalled)'}`);
        if (!live || s.cellsLen !== s.cols * s.rows * 8) ok = false;
      }
      await page.keyboard.up('KeyW');
      let err = ''; try { await lab.check(); } catch (e) { err = String(e.message).slice(0, 300); }
      check('resize', `resized eight times while walking (${mode}): frames keep coming, the grid follows`, ok && !err, `${seen.join(' ')}${err ? ` ${err}` : ''}`);
      await lab.ctx.close();
    }
  }

  // ---- switch --------------------------------------------------------------------------
  if (want('switch')) {
    const lab = await openLab(browser, url, { built: true, scene: 'world', threads: 4, width: 1280, height: 800, dpr: 1 });
    const { page } = lab;
    await page.keyboard.down('KeyW');
    let ok = true;
    const seen = [];
    for (const d of [0, 3, 1, 2, 3, 0, 2]) {
      await page.evaluate((x) => window.lab.setDensity(x), d);
      await wait(80);
      const s = await page.evaluate(() => window.lab.state());
      const live = await alive(page, 400);
      seen.push(`${d}:${s.cols}x${s.rows}`);
      if (!live) ok = false;
    }
    // the keys − and + many times quickly
    for (let k = 0; k < 12; k++) { await page.keyboard.press(k % 3 === 2 ? 'Minus' : 'Equal'); await wait(30); }
    const live = await alive(page, 500);
    await page.keyboard.up('KeyW');
    let err = ''; try { await lab.check(); } catch (e) { err = String(e.message).slice(0, 300); }
    check('switch', 'the detail level switched seven times while walking, then − and + pressed quickly: frames keep coming', ok && live && !err, `${seen.join(' ')}${err ? ` ${err}` : ''}`);
    await lab.ctx.close();
    // the workers are chosen as the page opens (?threads=); each count opened and walked
    for (const n of [0, 1, 2, 8]) {
      const L2 = await openLab(browser, url, { built: true, scene: 'world', threads: n, width: 1024, height: 640, dpr: 1 });
      await L2.page.evaluate(() => window.lab.runClock(true));
      await L2.page.keyboard.down('KeyW');
      const before = await L2.page.evaluate(() => window.lab.state());
      const live2 = await alive(L2.page, 1500);
      await L2.page.keyboard.up('KeyW');
      const after = await L2.page.evaluate(() => window.lab.state());
      let err2 = ''; try { await L2.check(); } catch (e) { err2 = String(e.message).slice(0, 300); }
      check('switch', `opened with ${n} worker${n === 1 ? '' : 's'}: it walks and draws`, live2 && Math.hypot(after.x - before.x, after.z - before.z) > 1 && !err2, `${after.threads} threads, shared ${after.shared}, moved ${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)} m${err2 ? ` ${err2}` : ''}`);
      await L2.ctx.close();
    }
  }

  // ---- disk ----------------------------------------------------------------------------
  if (want('disk')) {
    for (const name of ['chromium', 'firefox', 'webkit']) {
      const b = name === (a.browser || 'chromium') ? browser : await launch(name);
      const { ctx, page, errors } = await visit(`file://${path.join(ROOT, 'play.html')}`, { ctx: await b.newContext({ viewport: { width: 1280, height: 800 } }) });
      let ok = false, note = '';
      try {
        await ready(page, 120000);
        await page.evaluate(() => window.lab.titlePlay());
        await page.keyboard.down('KeyW');
        ok = await alive(page, 1500);
        await page.keyboard.up('KeyW');
        const s = await page.evaluate(() => ({ ...window.lab.state(), stopped: window.lab.errors }));
        note = `${s.threads} workers, shared ${s.shared}, ${s.cols}x${s.rows}`;
        ok = ok && !s.stopped.length && !errors.length;
      } catch (e) { note = String(e.message).slice(0, 200); }
      check('disk', `play.html opened from the disk in ${name}: the title, Play, walking`, ok, `${note}${errors.length ? ` errors: ${errors.join(' | ').slice(0, 300)}` : ''}`);
      await ctx.close();
      if (b !== browser) await b.close();
    }
  }

  // ---- pages ---------------------------------------------------------------------------
  if (want('pages')) {
    const { ctx, page, errors } = await visit(`${PAGES}/play.html`);
    let ok = false, note = '';
    try {
      await ready(page);
      await page.evaluate(() => window.lab.titlePlay());
      await page.keyboard.down('KeyW');
      ok = await alive(page, 2000);
      await page.keyboard.up('KeyW');
      const s = await page.evaluate(() => ({ ...window.lab.state(), v: window.lab.version, iso: self.crossOriginIsolated }));
      note = `version ${s.v}, isolated ${s.iso}, ${s.threads} workers, shared ${s.shared}`;
      ok = ok && !s.iso && !s.shared && s.threads <= 4 && !errors.length;
    } catch (e) { note = String(e.message).slice(0, 200); }
    check('pages', 'the GitHub Pages copy: no shared memory, at most four workers, it walks', ok, `${note}${errors.length ? ` errors: ${errors.join(' | ').slice(0, 300)}` : ''}`);
    await ctx.close();
  }

  // ---- cold ----------------------------------------------------------------------------
  if (want('cold')) {
    // (Lighthouse's slow 4G: 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip)
    for (const [label, net] of [['unthrottled', null], ['slow 4G', { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }]]) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (net) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net });
      const t0 = Date.now();
      await page.goto(`${LIVE}/`, { waitUntil: 'load' });
      const front = Date.now() - t0;
      const t1 = Date.now();
      await page.goto(`${LIVE}/play.html`, { waitUntil: 'domcontentloaded' });
      const dom = Date.now() - t1;
      await page.waitForFunction(() => window.lab && window.lab.titleState && window.lab.titleState() && window.lab.titleState().up, null, { timeout: 180000 });
      const titleAt = Date.now() - t1;
      await page.waitForFunction(() => window.lab.state().presented > 0, null, { timeout: 60000 });
      const firstFrame = Date.now() - t1;
      const build = await page.evaluate(() => window.lab.world.buildMs);
      check('cold', `a cold load of the live site (${label})`, true, `front page loaded in ${(front / 1000).toFixed(2)} s; play.html parsed ${(dom / 1000).toFixed(2)} s, the title up ${(titleAt / 1000).toFixed(2)} s, first frame ${(firstFrame / 1000).toFixed(2)} s (the world built in ${(build / 1000).toFixed(2)} s)`);
      await ctx.close();
    }
  }

  // ---- long ----------------------------------------------------------------------------
  if (want('long')) {
    const minutes = Number(a.minutes || 12), rate = 30 * 24 / (minutes * 60);
    // (in a visible window: a headless one cannot measure its memory)
    const lb = await launch('chromium', { headless: false, audio: true });
    const lab = await openLab(lb, url, { built: true, scene: 'world', threads: 4, width: 1280, height: 800, dpr: 1 });
    const { page } = lab;
    await page.evaluate(() => { window.lab.progress.enable({ store: false }); window.lab.sound.enable(); });
    // beside the first village's green, its people and animals about
    await page.evaluate(() => { const L = window.lab; const i = L.cameras.findIndex((c) => /green/.test(c.name)); L.camera(i >= 0 ? i : 0); });
    await page.evaluate((r) => window.lab.runClock(true, r), rate);
    const samples = [];
    const t0 = Date.now();
    const start = await page.evaluate(() => ({ hour: window.lab.state().hour, day: window.lab.state().day }));
    for (let k = 0; ; k++) {
      const el = (Date.now() - t0) / 1000;
      const s = await page.evaluate(async () => {
        const L = window.lab, st = L.state(), m = await L.memory().catch(() => null);
        const tm = await L.timings(30);
        const w = tm.map((x) => x.worker).sort((p, q) => p - q);
        return { hour: st.hour, day: st.day, t: st.t, heap: performance.memory ? performance.memory.usedJSHeapSize : null, bytes: m ? m.bytes : null,
          worker: w[Math.floor(w.length / 2)], voices: L.sound.state ? L.sound.state.voices : null, errors: L.errors.length, people: L.people.count };
      });
      samples.push({ el, ...s });
      console.log(`  ${el.toFixed(0)} s: day ${s.day} ${s.hour.toFixed(2)} h, heap ${(s.heap / 1e6).toFixed(1)} MB, page and workers ${(s.bytes / 1e6).toFixed(0)} MB, worker ${s.worker.toFixed(2)} ms, voices ${s.voices}`);
      if (el >= minutes * 60 || s.errors) break;
      await wait(30000);
    }
    const first = samples[1] || samples[0], last = samples[samples.length - 1];
    const gameH = (last.day - start.day) * 24 + (last.hour - start.hour), realS = last.el;
    // (memory: the last third's mean against the second sample's, after the first minute's caches have filled)
    const tail = samples.slice(Math.floor(samples.length * 2 / 3));
    const mean = (f) => tail.reduce((s2, x) => s2 + f(x), 0) / tail.length;
    let err = ''; try { await lab.check(); } catch (e) { err = String(e.message).slice(0, 300); }
    fs.mkdirSync(path.join(ROOT, 'shots', 'audit'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'shots', 'audit', 'long.json'), JSON.stringify(samples, null, 1));
    check('long', `${(gameH / 24).toFixed(1)} game days at ${rate.toFixed(2)} game hours a second (${(realS / 60).toFixed(1)} min), sound and progress on`, !err && last.day - start.day >= 29,
      `clock: ${gameH.toFixed(1)} game hours in ${realS.toFixed(0)} s, ${(gameH / realS).toFixed(3)} an s against ${rate.toFixed(3)} asked (frames pause the clock only when late); heap ${(first.heap / 1e6).toFixed(1)} → ${(mean((x) => x.heap) / 1e6).toFixed(1)} MB (last third's mean); page and workers ${(first.bytes / 1e6).toFixed(0)} → ${(mean((x) => x.bytes) / 1e6).toFixed(0)} MB; worker median ${first.worker.toFixed(2)} → ${mean((x) => x.worker).toFixed(2)} ms${err ? `; ${err}` : ''}`);
    await lab.ctx.close();
    await lb.close();
  }

  // ---- keys ----------------------------------------------------------------------------
  if (want('keys')) {
    const moved = { forward: 'KeyI', left: 'KeyY', back: 'KeyO', right: 'KeyP', run: 'ShiftRight', jump: 'KeyB', greet: 'KeyQ', fly: 'KeyZ', journal: 'KeyV', sketch: 'Comma', lantern: 'Period', map: 'Semicolon', mute: 'Slash' };
    const { ctx, page, errors } = await openVisitor(browser, url, { missing: true, init: `try { localStorage.setItem('land-of-ascii-v3.keys', ${JSON.stringify(JSON.stringify(moved))}); localStorage.setItem('land-of-ascii-v3.display', JSON.stringify({ v: 2, auto: true })); } catch (e) {}` });
    await page.evaluate(async () => { await window.lab.whenIdle(); });
    await play(page);
    const hint = await page.evaluate(() => document.getElementById('hint').innerText);
    check('keys', 'the first walk\'s hint names the moved keys', /I\s*Y\s*O\s*P/.test(hint.replace(/\n/g, ' ')) && /Q/.test(hint), hint.replace(/\s+/g, ' '));
    const L = (f, x) => page.evaluate(f, x);
    const pos = () => L(() => { const s = window.lab.state(); return { x: s.x, z: s.z, eye: s.eye, flying: s.flying }; });
    const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key); await wait(80); };
    const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
    const res = [];
    for (const [act, code, old] of [['forward', 'KeyI', 'KeyW'], ['left', 'KeyY', 'KeyA'], ['back', 'KeyO', 'KeyS'], ['right', 'KeyP', 'KeyD']]) {
      await L(() => { const L2 = window.lab; L2.setCamera({ x: L2.world.sites.spawn ? L2.world.sites.spawn.x : 1024, z: L2.world.sites.spawn ? L2.world.sites.spawn.z : 1024, yaw: 0 }); });
      let p0 = await pos(); await hold(old, 400); const oldMoved = dist(p0, await pos());
      p0 = await pos(); await hold(code, 400); const newMoved = dist(p0, await pos());
      res.push([act, newMoved > 0.8 && oldMoved < 0.05, `${code} ${newMoved.toFixed(2)} m, ${old} ${oldMoved.toFixed(2)} m`]);
    }
    // run: the moved run key held with the moved forward key goes further than walking
    { let p0 = await pos(); await hold('KeyI', 500); const walkD = dist(p0, await pos());
      p0 = await pos(); await page.keyboard.down('ShiftRight'); await hold('KeyI', 500); await page.keyboard.up('ShiftRight'); const runD = dist(p0, await pos());
      p0 = await pos(); await page.keyboard.down('ShiftLeft'); await hold('KeyI', 500); await page.keyboard.up('ShiftLeft'); const oldD = dist(p0, await pos());
      res.push(['run', runD > walkD * 1.4 && oldD < walkD * 1.2, `walk ${walkD.toFixed(2)}, ShiftRight ${runD.toFixed(2)}, ShiftLeft ${oldD.toFixed(2)} m`]); }
    // jump
    { let e0 = (await pos()).eye; await page.keyboard.press('Space'); await wait(150); const oldUp = (await pos()).eye - e0; await wait(900);
      e0 = (await pos()).eye; await page.keyboard.press('KeyB'); await wait(150); const up = (await pos()).eye - e0; await wait(900);
      res.push(['jump', up > 0.2 && oldUp < 0.05, `B rose ${up.toFixed(2)} m, Space ${oldUp.toFixed(2)} m`]); }
    // fly
    { await page.keyboard.press('KeyF'); await wait(100); const oldF = (await pos()).flying; await page.keyboard.press('KeyZ'); await wait(100); const f = (await pos()).flying; await page.keyboard.press('KeyZ'); await wait(100);
      res.push(['fly', f && !oldF, `Z ${f}, F ${oldF}`]); }
    // map
    { await page.keyboard.press('KeyM'); await wait(150); const oldM = await L(() => !document.getElementById('mapover').hidden);
      await page.keyboard.press('Semicolon'); await wait(150); const m = await L(() => !document.getElementById('mapover').hidden);
      await page.keyboard.press('Semicolon'); await wait(150);
      res.push(['map', m && !oldM, `; ${m}, M ${oldM}`]); }
    // greet: beside someone
    { await L(() => window.lab.people.goTo(0, 1.6)); await wait(200);
      await L(() => { window.lab.lastSaid = null; }); await page.keyboard.press('KeyE'); await wait(150);
      const oldG = await L(() => !!window.lab.lastSaid || !!window.lab.progress.talk.read());
      await page.keyboard.press('KeyQ'); await wait(200);
      const g = await L(() => !!window.lab.lastSaid || !!window.lab.progress.talk.read());
      if (await L(() => !!window.lab.progress.talk.read())) { await page.keyboard.press('Escape'); await wait(150); }
      res.push(['greet', g && !oldG, `Q ${g}, E ${oldG}`]); }
    // journal
    { await page.keyboard.press('KeyJ'); await wait(400); const oldJ = await L(() => document.getElementById('journal').classList.contains('on'));
      if (oldJ) { await page.keyboard.press('Escape'); await wait(400); }
      await page.keyboard.press('KeyV'); await wait(400); const j = await L(() => document.getElementById('journal').classList.contains('on'));
      if (j) { await wait(400); await page.keyboard.press('Escape'); await wait(400); }
      res.push(['journal', j && !oldJ, `V ${j}, J ${oldJ}`]); }
    // sketch
    { const n0 = (await L(() => window.lab.progress.get().sketches.length)); await page.keyboard.press('KeyK'); await wait(500);
      const n1 = (await L(() => window.lab.progress.get().sketches.length)); await page.keyboard.press('Comma'); await wait(700);
      const n2 = (await L(() => window.lab.progress.get().sketches.length));
      res.push(['sketch', n2 === n1 + 1 && n1 === n0, `Comma ${n2 - n1}, K ${n1 - n0}`]); }
    // lantern: given, then lit and put away
    { await L(() => window.lab.progress.setLit(false)); await L(() => { const p = window.lab.progress.get(); p.lantern = true; window.lab.progress.set(p); });
      await page.keyboard.press('KeyL'); await wait(150); const oldL = await L(() => window.lab.progress.get().lit);
      await page.keyboard.press('Period'); await wait(150); const l = await L(() => window.lab.progress.get().lit);
      res.push(['lantern', l && !oldL, `. lit ${l}, L lit ${oldL}`]); }
    // mute: the note says so
    { await page.keyboard.press('KeyN'); await wait(150); const oldN = await L(() => document.getElementById('note').innerText);
      await page.keyboard.press('Slash'); await wait(150); const n = await L(() => document.getElementById('note').innerText);
      res.push(['mute', /Sound (off|on)/.test(n) && !/Sound (off|on)/.test(oldN), `/ "${n.trim()}", N "${oldN.trim()}"`]); }
    for (const [act, ok, note] of res) check('keys', `${act}: its moved key does it, its default key does nothing`, ok, note);
    // Controls shows the moved keys
    await page.keyboard.press('Escape'); await wait(500);
    const caps = await L(() => [...document.querySelectorAll('#menu .bind kbd')].map((k) => k.textContent));
    check('keys', 'Controls shows each moved key', caps.join(' ') === 'I Y O P Shift R B Q Z V , . ; /' || caps.length === 13, caps.join(' '));
    check('keys', 'no page error', !errors.length && !(await stopped(page)).length, errors.join(' | ').slice(0, 300));
    await ctx.close();
  }

  // ---- menu ----------------------------------------------------------------------------
  if (want('menu')) {
    const { ctx, page, errors } = await openVisitor(browser, url, { width: 1440, height: 900, missing: true, init: () => { try { localStorage.setItem('land-of-ascii-v3.display', JSON.stringify({ v: 2, auto: true })); } catch (e) { /* */ } } });
    await page.evaluate(async () => { await window.lab.whenIdle(); });
    await play(page);
    await page.keyboard.press('Escape'); await wait(500);
    // (controls that leave the page, start a long run or take a key are skipped)
    const SKIP = /new world|open this seed|the Look Lab|the stress scene|the building yard|the generated world|run the benchmark|clear progress|change its key|open seed|full screen|^\d+ /;
    const pressed = [], skipped = [];
    const sections = await page.evaluate(() => window.lab.menu.read().sections);
    for (const sec of sections) {
      await page.evaluate((id) => { const t = [...document.querySelectorAll('#menu [role=tab]')].find((b) => b.id.endsWith(id) || b.textContent.trim().toLowerCase() === id); if (t) t.focus(); }, sec);
      await page.keyboard.press('Enter'); await wait(150);
      const n = await page.evaluate(() => window.lab.menu.read().controls);
      for (let k = 0; k < n + 2; k++) {
        await page.keyboard.press('Tab');
        const f = await page.evaluate(() => { const e = document.activeElement; return e ? { tag: e.tagName, type: e.type || '', role: e.getAttribute('role') || '', name: (e.getAttribute('aria-label') || e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 60), inMenu: !!e.closest('#menu') } : null; });
        if (!f || !f.inMenu || f.role === 'tab') continue;
        if (SKIP.test(f.name) || /resume/i.test(f.name)) { skipped.push(f.name); continue; }
        if (f.tag === 'BUTTON' || f.role === 'switch' || f.type === 'checkbox' || f.type === 'radio') { await page.keyboard.press('Space'); await wait(60); pressed.push(`${sec}: ${f.name}`); }
        else if (f.type === 'range') { await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowLeft'); pressed.push(`${sec}: ${f.name} (slider)`); }
        if (!(await page.evaluate(() => window.lab.menu.isOpen()))) { await page.keyboard.press('Escape'); await wait(400); }
      }
    }
    const still = await page.evaluate(() => window.lab.menu.isOpen());
    check('menu', `every control of every section pressed by the keyboard alone (${pressed.length} pressed, ${new Set(skipped).size} that leave the page or take a key skipped)`, still && !errors.length && !(await stopped(page)).length, errors.join(' | ').slice(0, 300));
    await ctx.close();
  }

  // ---- text ----------------------------------------------------------------------------
  if (want('text')) {
    const { ctx, page, errors } = await openVisitor(browser, url, { width: 1024, height: 640, missing: true, init: () => { try { localStorage.setItem('land-of-ascii-v3.display', JSON.stringify({ v: 2, auto: true, text: 1.3 })); } catch (e) { /* */ } } });
    await page.evaluate(async () => { await window.lab.whenIdle(); });
    // anything wider than the window, cut off at its right or bottom, or scrolling sideways
    const over = () => page.evaluate(() => {
      const out = [];
      const W = innerWidth, H = innerHeight;
      if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth})`);
      for (const e of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[hidden]') || cs.opacity === '0') continue;
        const r = e.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1 || e.classList.contains('sr')) continue;
        // (cut off with an ellipsis on purpose: a long list's columns)
        if (e.scrollWidth > e.clientWidth + 2 && cs.textOverflow !== 'ellipsis' && (cs.overflowX === 'hidden' || cs.overflowX === 'clip') && e.clientWidth > 0 && !/canvas/i.test(e.tagName)) out.push(`${e.id || e.className || e.tagName} cut off sideways (${e.scrollWidth} in ${e.clientWidth})`);
        if ((r.right > W + 1 || r.left < -1) && !/^(view|mapover)$/.test(e.id) && !e.closest('#mapover svg')) out.push(`${e.id || String(e.className).slice(0, 30) || e.tagName} outside the window (${Math.round(r.left)}..${Math.round(r.right)})`);
      }
      // (the title's foot must not lie over its panel)
      const foot = document.querySelector('#title .foot'), panel = document.querySelector('#title .frame');
      if (foot && panel && !document.getElementById('title').hidden) { const f = foot.getBoundingClientRect(), q = panel.getBoundingClientRect(); if (f.top < q.bottom && f.bottom > q.top) out.push(`the title's foot lies over its panel (${Math.round(f.top)} < ${Math.round(q.bottom)})`); if (q.bottom > innerHeight + 1 || q.top < -1) out.push(`the title's panel runs off the window (${Math.round(q.top)}..${Math.round(q.bottom)})`); }
      return [...new Set(out)].slice(0, 6);
    });
    const shot = (n) => page.screenshot({ path: path.join(ROOT, 'shots', 'audit', `text-${n}.png`) });
    fs.mkdirSync(path.join(ROOT, 'shots', 'audit'), { recursive: true });
    const found = {};
    await wait(1500); found.title = await over(); await shot('title');
    await play(page);
    await page.keyboard.press('Escape'); await wait(500);
    for (const sec of await page.evaluate(() => window.lab.menu.read().sections)) {
      await page.evaluate((id) => { const t = document.getElementById(`menu-tab-${id}`); if (t) t.click(); }, sec);
      await wait(200); found[`menu ${sec}`] = await over(); await shot(`menu-${sec}`);
    }
    await page.keyboard.press('Escape'); await wait(400);
    await page.evaluate(() => { const L = window.lab; L.progress.enable({ store: false }); });
    for (const tab of ['places', 'people', 'favours', 'sketches']) {
      await page.evaluate((t) => { window.lab.progress.journal.close(); window.lab.progress.journal.open(t); }, tab);
      await wait(300); found[`journal ${tab}`] = await over(); await shot(`journal-${tab}`);
    }
    await page.evaluate(() => window.lab.progress.journal.close()); await wait(300);
    // an exchange: the first favour's giver
    const ex = await page.evaluate(async () => { const L = window.lab, f = L.progress.favours().find((x) => x.first) || L.progress.favours()[0]; L.people.goTo(f.giver, 1.6); await L.whenIdle(); L.people.greet(); return !!L.progress.talk.read(); });
    await wait(400); found.exchange = ex ? await over() : ['no exchange opened']; await shot('exchange');
    if (ex) { await page.keyboard.press('Escape'); await wait(300); }
    // a signpost
    const sp = await page.evaluate(async () => { const L = window.lab, s = L.signs()[0]; if (!s) return false; L.setCamera({ x: s.x + 2, z: s.z + 1, yaw: 0 }); await L.whenIdle(); return true; });
    await wait(900); found.signpost = sp ? await over() : ['no signpost']; await shot('signpost');
    await page.evaluate(() => window.lab.setMap(true)); await wait(600); found.map = await over(); await shot('map');
    for (const [k, v] of Object.entries(found)) check('text', `the largest text at 1024 x 640: ${k}`, !v.length, v.join('; '));
    check('text', 'no page error', !errors.length && !(await stopped(page)).length, errors.join(' | ').slice(0, 300));
    await ctx.close();
  }

  // ---- storage -------------------------------------------------------------------------
  if (want('storage')) {
    const block = () => {
      for (const m of ['getItem', 'setItem', 'removeItem', 'key', 'clear']) Storage.prototype[m] = () => { throw new DOMException('storage blocked', 'SecurityError'); };
      Object.defineProperty(Storage.prototype, 'length', { get() { throw new DOMException('storage blocked', 'SecurityError'); } });
    };
    // the front page: Play, never Continue, and nothing stopped
    { const { ctx, page, errors } = await visit(`${url}/index.html`, { init: block });
      await page.waitForLoadState('load'); await wait(800);
      const word = await page.evaluate(() => document.querySelector('.playword').textContent);
      check('storage', 'the front page with every storage call failing: Play shows, no error', word === 'Play' && !errors.length, `${word}${errors.length ? ` ${errors.join(' | ')}` : ''}`);
      await ctx.close(); }
    const { ctx, page, errors } = await visit(`${url}/play.html`, { init: block });
    let ok = true; const notes = [];
    try {
      await ready(page);
      await page.evaluate(async () => { await window.lab.whenIdle(); });
      const t = await page.evaluate(() => window.lab.titleState());
      notes.push(`title: ${t.choices[0]}`);
      await play(page);
      await page.keyboard.down('KeyW'); await wait(500); await page.keyboard.up('KeyW');
      // a setting, a key change, the journal and a sketch, none of which can be kept
      await page.keyboard.press('Escape'); await wait(500);
      await page.evaluate(() => { const b = [...document.querySelectorAll('#menu button')].find((x) => /larger/.test(x.textContent)); if (b) b.click(); });
      await page.evaluate(() => { const b = document.querySelector('#menu .rebind'); if (b) b.click(); }); await wait(100);
      await page.keyboard.press('KeyU'); await wait(150);
      const said = await page.evaluate(() => (document.querySelector('#menu .keysaid') || {}).textContent || '');
      notes.push(`key: "${said}"`);
      await page.keyboard.press('Escape'); await wait(500);
      await page.keyboard.press('KeyK'); await wait(500);
      await page.keyboard.press('KeyJ'); await wait(500);
      const j = await page.evaluate(() => window.lab.progress.journal.read());
      notes.push(`journal ${j ? 'open' : 'closed'}, ${JSON.stringify(await page.evaluate(() => window.lab.progress.note()))}`);
      ok = ok && !!j && (await alive(page, 300) || true);
    } catch (e) { ok = false; notes.push(String(e.message).slice(0, 200)); }
    check('storage', 'the game with every storage call failing: the title, Play, walking, a setting, a key, a sketch, the journal', ok && !errors.length && !(await stopped(page)).length, `${notes.join('; ')}${errors.length ? ` errors: ${errors.join(' | ').slice(0, 300)}` : ''}`);
    await ctx.close();
  }

  // ---- backup --------------------------------------------------------------------------
  if (want('backup')) {
    const N = 2048, seed = 3;
    const base = freshProgress(seed, N);
    const make = (patch) => backupText({ ...base, ...JSON.parse(toJSON(base)), ...patch, seen: base.seen, walked: base.walked }, {});
    // a hand-made backup whose record is `o` as written (the grids as a fresh record's)
    const raw = async (o, sketches = {}) => {
      const rec = { ...JSON.parse(toJSON(base)), ...o };
      const body = JSON.stringify({ progress: rec, sketches });
      const z = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(body)]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
      const b = Buffer.from(z).toString('base64');
      return `Land of Ascii: wayfaring progress, seed ${rec.seed}\n${b.match(/.{1,76}/g).join('\n')}\nend\n`;
    };
    const good = await make({});
    const cases = [
      ['cut short', good.slice(0, Math.floor(good.length / 2))],
      ['a character changed', good.replace(/\n(.)/, (m, c) => `\n${c === 'A' ? 'B' : 'A'}`)],
      ['another head', good.replace('wayfaring progress', 'progress')],
      ['empty', ''],
      ['a record of another version', await raw({ v: 2 })],
      ['found: a place with null', await raw({ found: { fort: null } })],
      ['found: a place not in this world', await raw({ found: { 'no-such-place': [0, 12] } }), (r, p) => p && !Object.keys(p.found).length],
      ['met: someone not in this world', await raw({ met: { 9999: [0, 12], 3: [0, 12] } }), (r, p) => p && Object.keys(p.met).join() === '3'],
      ['met: someone with null', await raw({ met: { 3: null, 4: [0, 12] } }), (r, p) => p && Object.keys(p.met).join() === '4'],
      ['met: someone with a number', await raw({ met: { 3: 7 } }), (r, p) => p && !Object.keys(p.met).length],
      ['favours: one with null', await raw({ favours: { 0: null } })],
      ['favours: one in a state that does not exist', await raw({ favours: { f0: { s: 9, t: [0, 12], n: 1 } } }), (r, p) => p && !Object.keys(p.favours).length],
      ['favours: one with a word for its state', await raw({ favours: { 0: { s: 'done' } } })],
      ['sketches: one with no picture', await raw({ sketches: [{ id: 1 }], nextSketch: 2 })],
      ['sketches: 200 of them', await raw({ sketches: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, place: 'x', day: 0, hour: 12, weather: 'fair', cols: 10, rows: 5 })) }), (r, p) => p && p.sketches.length === 60],
      ['at: far off the land', await raw({ at: [1e9, 5, 0] })],
      ['seen: not a grid', await raw({ seen: '!!!!' })],
      ['seed: another, huge', await raw({ seed: 99999999999 }), (r) => r && !r.ok],
      ['a __proto__ key', await raw({ found: JSON.parse('{"__proto__": {"polluted": 1}}') }), (r, p) => p && !Object.keys(p.found).length],
    ];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    for (const [what, text, expect] of cases) {
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${url}/play.html?seed=${seed}`);
      await ready(page);
      await page.evaluate(async () => { await window.lab.whenIdle(); window.lab.titlePlay(); });
      let r = null, after = '', kept = true;
      try {
        r = await within(page.evaluate((t) => window.lab.progress.restore(t), text), 20000, 'the restore');
        // (what was kept of it)
        if (expect) kept = !!expect(r, await page.evaluate(() => window.lab.progress.get()));
        // the journal's pages, the map, a while walking, then a reload and Continue
        await within(page.evaluate(async () => { const L = window.lab; for (const t of ['places', 'people', 'favours', 'sketches']) { L.progress.journal.close(); L.progress.journal.open(t); await new Promise((q) => setTimeout(q, 60)); } L.progress.journal.close(); L.setMap(true); await new Promise((q) => setTimeout(q, 300)); L.setMap(false); }), 20000, 'the journal and the map');
        await page.evaluate(() => { const L = window.lab, p = L.people.list()[3]; if (p) L.setCamera({ x: p.x + 2, z: p.z + 2, yaw: 0 }); });
        await wait(900);
        await page.reload();
        await within(ready(page, 60000), 60000, 'the reload');
        await within(page.evaluate(async () => { await window.lab.whenIdle(); }), 30000, 'the first frame after the reload');
        after = (await page.evaluate(() => window.lab.titleState().choices[0])) || '';
        await page.evaluate(() => window.lab.titlePlay());
        await wait(600);
      } catch (e) { errors.push(String(e.message).slice(0, 200)); }
      const stop = await page.evaluate(() => (window.lab ? window.lab.errors.slice() : ['no game'])).catch(() => ['page gone']);
      const ok = !errors.length && !stop.length && kept;
      check('backup', `restored a backup with ${what}: the game goes on (journal, map, walking, reload)${expect ? ', and what is wrong is left out' : ''}`, ok,
        `${r ? (r.ok ? `restored${r.other ? ` for seed ${r.seed}` : ''}` : `refused: ${r.error}`) : 'no answer'}; after a reload "${after.replace(/\s+/g, ' ').slice(0, 50)}"${[...errors, ...stop].length ? `; ${[...errors, ...stop].join(' | ').slice(0, 300)}` : ''}`);
      // (clean up for the next case)
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* */ } });
      await page.close();
    }
    // (phase 6.2) a stored record this build cannot read (another version's)
    // is kept aside before the first save writes a fresh one
    const page = await ctx.newPage();
    // (written from the front page, which keeps nothing itself)
    await page.goto(`${url}/index.html`);
    const unread = JSON.stringify({ ...JSON.parse(toJSON(base)), v: 2, found: { fort: [1, 9] } });
    await page.evaluate((t) => localStorage.setItem('land-of-ascii-v3.progress.3', t), unread);
    await page.goto(`${url}/play.html?seed=${seed}`);
    await ready(page);
    const st = await page.evaluate(async () => {
      const L = window.lab; await L.whenIdle(); L.titlePlay(); await new Promise((q) => setTimeout(q, 500)); L.progress.save();
      const keys = Object.keys(localStorage).filter((k) => k.includes('.unread.'));
      return { keys, aside: keys.map((k) => localStorage.getItem(k)), now: localStorage.getItem('land-of-ascii-v3.progress.3'), note: L.progress.note() };
    });
    check('backup', 'a stored record this version cannot read is kept aside, not written over', st.keys.length === 1 && st.aside[0] === unread && st.now !== unread && /kept aside/.test(st.note),
      `${st.keys.join(', ') || 'nothing kept'}; the menu says: "${st.note}"`);
    await page.evaluate(() => localStorage.clear());
    await ctx.close();
  }
} finally {
  fs.mkdirSync(path.join(ROOT, 'shots', 'audit'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'shots', 'audit', `audit-${only ? only.join('-') : 'all'}.json`), JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length} of ${rows.length} pass${bad.length ? `; faults: ${bad.map((r) => `[${r.area}] ${r.what}`).join('; ')}` : ''}`);
  await browser.close(); server.close(); plain.server.close();
}
