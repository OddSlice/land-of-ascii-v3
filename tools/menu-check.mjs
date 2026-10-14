// The menu check (phase 2b; the tabs and the statistics after it): opens the
// built page as a first-time visitor would (no tool quiet), and with the
// keyboard alone
//  1. dismisses the start card (Escape on it never opens the menu), with the
//     compact statistics on screen from the start;
//  2. opens the menu with Escape and walks every control of every section
//     with Tab, checking that focus stays inside the menu and comes back
//     round, and that the arrow keys move between the sections' tabs;
//  3. changes each Display option from the keyboard and checks it took
//     effect (the grid, the glyphs, the statistics, the mouse);
//  4. checks the menu holds the clock and movement while open, takes no game
//     key while open and steals none once closed, and that a click beside it
//     closes it without taking the mouse;
//  5. reloads and checks the Display choices came back while the seed, the
//     time and the weather did not (a plain visit opens the default world);
//  6. opens it at 1024 x 640 and checks nothing scrolls sideways;
//  7. runs once more with localStorage throwing on every call;
//  8. opens with choices kept before the statistics were on by default and
//     checks they show (the rest of the choices kept);
//  9. opens full screen on 4K screens (at 100% and 150%) and checks the cell
//     count stays near the detail level's promise;
// 10. (phase 5a) at 1024 x 640, the journal (J): it opens and closes on J and
//     Escape and holds the clock; the arrow keys move between its four
//     pages and Tab walks every control and stays inside; each page fits
//     with no sideways scrolling; buttons show a pointer and change on
//     hover; the keyboard focus is visibly outlined; a sketch opens full
//     screen, pages on with the arrow keys and copies as text; an exchange's
//     buttons work by mouse and its keys by keyboard; the World section's
//     save line, backup, restore box and clear (asked first) are reached
//     by Tab; and nothing on any of them is an emoji.
//   node tools/menu-check.mjs [--browser chromium]
import { SOUND } from '../src/sound/palette.js';
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); };

// what has the keyboard focus, in a few words
const focusName = (page) => page.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return null;
  const inMenu = !!e.closest('#menu');
  const label = e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(' ').map((id) => (document.getElementById(id) || {}).textContent).join(' ') : '') || e.textContent || e.type;
  return `${inMenu ? '' : '[outside] '}${label.trim().replace(/\s+/g, ' ')}`;
});
// press Tab until the focus is on a control whose name matches
async function tabTo(page, re, max = 80) {
  for (let i = 0; i < max; i++) {
    const n = await focusName(page);
    if (n && re.test(n)) return n;
    await page.keyboard.press('Tab');
  }
  throw new Error(`no control matching ${re} within ${max} presses of Tab`);
}
const st = (page) => page.evaluate(() => ({ ...window.lab.state(), m: window.lab.menu.read(), hudText: document.getElementById('hud').textContent }));
// (phase 6) the title screen: wait for its panel, then Play (or Continue) by the keyboard, as a player would
const title = (page) => page.evaluate(() => window.lab.titleState());
async function play(page) {
  await page.waitForFunction(() => window.lab.titleState && window.lab.titleState() && window.lab.titleState().shown, null, { timeout: 8000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
}

try {
  // ---- a first visit ----
  const lab = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1440, height: 900, dpr: 1 });
  const { page } = lab;
  // (phase 6) the title screen, over the world; a key while its panel fades in brings it forward at once
  await page.reload();
  await page.waitForFunction(() => window.lab && window.lab.titleState && window.lab.titleState() && window.lab.titleState().up, null, { timeout: 180000 });
  const fading = !(await title(page)).shown;
  await page.keyboard.press('Shift'); await page.waitForTimeout(60);
  let t = await title(page);
  check('the title screen shows on a visit; a key while its panel fades in brings it forward at once', t.up && t.shown, fading ? 'was fading' : 'already forward when checked');
  check('the title screen\'s first choice, Play, has the keyboard; no statistics over it', /^Play/.test(t.focus) && (await page.evaluate(() => getComputedStyle(document.getElementById('hud')).visibility)) === 'hidden', t.focus);
  check('the title screen\'s foot shows the version and the seed', /^version \S+ · seed 3/.test(t.foot), t.foot);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(50);
  const down = (await title(page)).focus;
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(50);
  check('the arrow keys move between its choices', /^New world/.test(down) && /^Play/.test((await title(page)).focus), down);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  let s = await st(page);
  check('Escape on the title screen opens nothing', (await title(page)).up && !s.m.open);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  s = await st(page);
  check('Enter on Play leaves the title screen; the compact statistics show: one line with the frame rate', !(await title(page)).up && s.m.hud === 'minimal' && s.hudText.split('\n').filter(Boolean).length === 1 && /fps/.test(s.hudText), JSON.stringify(s.hudText.trim()));
  check('then the hint that Escape opens the menu shows', s.m.hint);
  // (phase 6: on a first walk it names the keys that matter, for ten seconds)
  check('on a first walk the hint names the keys that matter', /walk/.test(await page.evaluate(() => document.getElementById('hint').innerText)) && /greet/.test(await page.evaluate(() => document.getElementById('hint').innerText)));
  await page.waitForTimeout(10600);
  s = await st(page);
  check('the hint fades after ten seconds', !s.m.hint);

  // ---- open, and walk every control ----
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  s = await st(page);
  check('Escape opens the menu', s.m.open, `focus on "${await focusName(page)}"`);
  const walk = async () => {
    const seen = [];
    let first = await focusName(page), outside = 0;
    for (let i = 0; i < 200; i++) {
      await page.keyboard.press('Tab');
      const n = await focusName(page);
      if (!n || n.startsWith('[outside]')) outside++;
      if (n === first) break;
      seen.push(n);
    }
    return { seen: [first, ...seen], outside };
  };
  let w = await walk();
  s = await st(page);
  check('Tab reaches every control and comes back round', w.seen.length === s.m.controls && w.outside === 0, `${w.seen.length} reached of ${s.m.controls}, ${w.outside} outside`);
  await page.keyboard.press('Shift+Tab');
  const back = await focusName(page);
  check('Shift+Tab from the first control goes to the last', back === w.seen[w.seen.length - 1], back);
  // the tabs: the arrow keys move between them, and each section's controls are all reached
  await tabTo(page, /^Controls$/);
  const names = [], tabsSeen = [];
  let allReached = true;
  for (let i = 0; i < 5; i++) {
    s = await st(page);
    tabsSeen.push(s.m.tab);
    w = await walk();
    if (!(w.seen.length === s.m.controls && w.outside === 0)) allReached = false;
    names.push(`[${s.m.tab}] ${w.seen.join(' | ')}`);
    await tabTo(page, new RegExp(`^${s.m.tab[0].toUpperCase()}${s.m.tab.slice(1)}$`));
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
  }
  s = await st(page);
  check('the arrow keys move between the five sections, round again', tabsSeen.join(' ') === 'controls display sound world advanced' && s.m.tab === 'controls', tabsSeen.join(' '));
  check('in every section Tab reaches all its controls and stays inside', allReached);
  await page.keyboard.press('ArrowDown');           // to Display, for the options below
  await page.waitForTimeout(150);

  // ---- the Display options, from the keyboard ----
  const before = await st(page);
  await tabTo(page, /^coarse$/); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  s = await st(page);
  check('detail level: coarse takes effect', s.preset === 0 && s.cells < before.cells, `${before.cells} -> ${s.cells} cells`);
  await tabTo(page, /^medium$/); await page.keyboard.press('Space'); await page.waitForTimeout(250);
  s = await st(page);
  check('detail level: medium takes effect', s.preset === 1, `${s.cells} cells`);
  await tabTo(page, /^glyphs/); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s = await st(page);
  check('glyphs: off takes effect', s.glyphs === false);
  await tabTo(page, /^off$/); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  s = await st(page);
  check('statistics: off takes effect', s.m.hud === 'none' && s.hudText === '', JSON.stringify(s.hudText.trim()));
  await tabTo(page, /^full$/); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  s = await st(page);
  check('statistics: full takes effect', s.m.hud === 'full' && s.hudText.split('\n').filter(Boolean).length >= 4, `${s.hudText.split('\n').filter(Boolean).length} lines`);
  await tabTo(page, /^mouse sensitivity/);
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  s = await st(page);
  check('mouse sensitivity: the arrow keys move it', Math.abs(s.sensitivity - 1.5) < 1e-9, `${s.sensitivity}`);
  await tabTo(page, /^invert vertical look/); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s = await st(page);
  check('invert vertical look: on takes effect', s.invert === true);

  // ---- the menu holds the game ----
  const { t: t0, hour: h0 } = await st(page);
  await page.keyboard.press('KeyW'); await page.keyboard.press('Digit3');
  await page.waitForTimeout(500);
  s = await st(page);
  check('while open the clock stands still and game keys do nothing', s.t === t0 && s.hour === h0 && s.menu, `t ${t0} -> ${s.t}, hour ${h0} -> ${s.hour}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s = await st(page);
  check('Escape closes the menu', !s.m.open && !s.menu);
  await page.waitForTimeout(300);
  check('closed, the clock runs again', (await st(page)).t > s.t);
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(100);
  s = await st(page);
  check('closed, the game has its keys back (2: dusk)', Math.abs(s.hour - 17.85) < 1e-3, `${s.hour}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.mouse.click(30, 450);
  await page.waitForTimeout(300);
  s = await st(page);
  const locked = await page.evaluate(() => !!document.pointerLockElement);
  check('a click beside the menu closes it without taking the mouse', !s.m.open && !locked);

  // ---- a reload keeps the Display choices, never the world's ----
  await page.evaluate(() => { window.lab.setWeather('rain'); window.lab.setHour(9); });
  await page.reload();
  await page.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await page.evaluate(() => window.lab.ready);
  await page.waitForTimeout(500);
  s = await st(page);
  check('after a reload the title screen shows again', (await title(page)).up);
  await page.evaluate(() => window.lab.titlePlay());
  s = await st(page);
  check('after a reload the Display choices are back', s.preset === 1 && s.glyphs === false && s.m.hud === 'full' && Math.abs(s.sensitivity - 1.5) < 1e-9 && s.invert === true,
    `density ${s.preset + 1}, glyphs ${s.glyphs}, statistics ${s.m.hud}, sensitivity ${s.sensitivity}, invert ${s.invert}`);
  check('after a reload the seed, the time and the weather are the default ones', Math.abs(s.hour - 14) < 0.01 && s.weather === 'auto' && (await page.evaluate(() => window.lab.seed)) === 3, `hour ${s.hour}, weather ${s.weather}`);
  await lab.check();
  await lab.ctx.close();

  // ---- 1024 x 640 ----
  const small = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
  await play(small.page);
  await small.page.keyboard.press('Escape'); await small.page.waitForTimeout(400);
  const fit = await small.page.evaluate(() => {
    const b = document.querySelector('#menu .pane'), p = document.querySelector('#menu .panel'), r = p.getBoundingClientRect();
    return { body: b.scrollWidth <= b.clientWidth, page: document.documentElement.scrollWidth <= innerWidth, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: Math.round(r.width) };
  });
  check('at 1024 x 640 the menu fits with no sideways scrolling', fit.body && fit.page && fit.inside, JSON.stringify(fit));
  await small.check();
  await small.ctx.close();

  // ---- (phase 3b) 1280 x 720: the Controls fit without scrolling; the benchmark ----
  {
    const mid = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1280, height: 720, dpr: 1 });
    const mp = mid.page;
    await play(mp);
    await mp.keyboard.press('Escape'); await mp.waitForTimeout(400);
    const ctl = await mp.evaluate(() => { const b = document.querySelector('#menu .pane'); return { scroll: b.scrollHeight, client: b.clientHeight }; });
    check('at 1280 x 720 the Controls fit without scrolling', ctl.scroll <= ctl.client + 1, JSON.stringify(ctl));
    // (the clock runs in real time meanwhile: its hour compared to within 36 s)
    const snap = () => mp.evaluate(() => { const s = window.lab.state(); return JSON.stringify({ hour: Math.round(s.hour * 100) / 100, weather: s.weather, x: s.x.toFixed(2), z: s.z.toFixed(2), yaw: s.yaw.toFixed(3), running: s.running, frozen: s.frozen }); });
    const benchButton = (text) => mp.evaluate((text) => { const b = [...document.querySelectorAll('#menu button')].find((x) => x.textContent.trim().includes(text)); if (b) b.click(); return !!b; }, text);
    await mp.click('#menu [role="tab"]:has-text("Advanced")'); await mp.waitForTimeout(300);
    const b0 = await snap();
    check('the benchmark does not run until asked', !(await mp.evaluate(() => window.lab.bench && window.lab.bench.running)));
    await benchButton('run the benchmark'); await mp.waitForTimeout(3000);
    const during = await mp.evaluate(() => window.lab.bench && window.lab.bench.running);
    await benchButton('cancel'); await mp.waitForTimeout(500);
    const afterCancel = await snap();
    check('the benchmark, cancelled part way, puts back the clock, the weather and the camera', during && afterCancel === b0, `${b0} -> ${afterCancel}`);
    await benchButton('run the benchmark'); await mp.waitForTimeout(3000);
    await mp.keyboard.press('Escape'); await mp.waitForTimeout(600);
    const afterClose = await snap();
    check('closing the menu during the benchmark stops it and puts everything back', afterClose === b0 && !(await mp.evaluate(() => window.lab.bench.running)), afterClose);
    await mp.keyboard.press('Escape'); await mp.waitForTimeout(400);
    await mp.click('#menu [role="tab"]:has-text("Advanced")'); await mp.waitForTimeout(300);
    const t0 = Date.now();
    await benchButton('run the benchmark');
    await mp.waitForFunction(() => !window.lab.bench.running, null, { timeout: 600000 });
    const res = await mp.evaluate(() => ({ rows: window.lab.bench.rows.length, cams: window.lab.cameras.length, text: window.lab.bench.text() }));
    const afterRun = await snap();
    check('the benchmark runs every camera in fair weather and rain, and puts everything back', res.rows === 2 * res.cams && afterRun === b0 && /slowest/.test(res.text),
      `${res.rows} rows for ${res.cams} cameras in ${Math.round((Date.now() - t0) / 1000)} s`);
    await mid.check();
    await mid.ctx.close();
  }

  // ---- without localStorage ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(() => {
    for (const m of ['getItem', 'setItem', 'removeItem']) Storage.prototype[m] = () => { throw new Error('storage blocked'); };
  });
  const p2 = await ctx.newPage();
  const errs = [];
  p2.on('pageerror', (e) => errs.push(String(e)));
  await p2.goto(`${url}/play.html?threads=4`);
  await p2.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await p2.evaluate(() => window.lab.ready);
  await p2.waitForTimeout(300);
  await play(p2);
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(400);
  const ok2 = await p2.evaluate(() => window.lab.menu.read().open);
  await p2.click('#menu [role="tab"]:has-text("Display")'); await p2.waitForTimeout(200);
  await p2.click('#menu button:has-text("coarse")'); await p2.waitForTimeout(200);
  const pre = await p2.evaluate(() => window.lab.state().preset);
  check('with localStorage throwing, the game and the menu still work', ok2 && pre === 0 && !errs.length && !(await p2.evaluate(() => window.lab.errors.length)), errs.join(' '));
  await ctx.close();

  // ---- choices kept before the statistics were on by default ----
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx3.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('menu-check')) {
        sessionStorage.setItem('menu-check', '1');
        localStorage.setItem('land-of-ascii-v3.display', JSON.stringify({ density: 1, glyphs: true, hud: 'none', sensitivity: 1.25, invert: false }));
        localStorage.setItem('land-of-ascii-v3.seen', '1');
      }
    } catch { /* no storage */ }
  });
  const p3 = await ctx3.newPage();
  await p3.goto(`${url}/play.html?threads=4`);
  await p3.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await p3.evaluate(() => window.lab.ready);
  await p3.waitForTimeout(500);
  s = await st(p3);
  check('choices kept before the change: the statistics show, the rest are kept', s.m.hud === 'minimal' && /fps/.test(s.hudText) && s.preset === 1 && Math.abs(s.sensitivity - 1.25) < 1e-9,
    `statistics ${s.m.hud}, density ${s.preset + 1}, sensitivity ${s.sensitivity}`);
  await ctx3.close();

  // ---- 4K screens, full screen: the cell count stays near the promise ----
  const big = [];
  for (const [w, hh, dpr] of [[3840, 2160, 1], [2560, 1440, 1.5]]) {
    const L = await openLab(browser, url, { built: true, scene: 'world', threads: 4, width: w, height: hh, dpr });
    const g = await L.page.evaluate(() => { const x = window.lab.state(); return { cells: x.cells, cols: x.cols, rows: x.rows, cw: x.cw }; });
    big.push({ screen: `${w * dpr}x${hh * dpr} at ${dpr * 100}%`, ...g });
    await L.check();
    await L.ctx.close();
  }
  check('a 4K screen full screen keeps about 40,000 cells (fine)', big.every((b) => b.cells > 34000 && b.cells < 46000), big.map((b) => `${b.screen}: ${b.cols} x ${b.rows} = ${b.cells} (${b.cw} px cells)`).join('; '));

  // ---- (phase 5a) the journal and the new World controls, at 1024 x 640 ----
  {
    const J = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
    const jp = J.page;
    await play(jp);
    // the first meeting: greet, and the exchange's buttons by mouse
    const ex = await jp.evaluate(async () => {
      const L = window.lab, m = L.progress.meet();
      L.freeze(m.arrive + 0.02, 0, 0); await L.whenIdle(); await L.whenIdle();
      const p = L.people.list()[m.person], a2 = p.yaw;
      L.setCamera({ x: p.x + Math.sin(a2) * 1.6, z: p.z + Math.cos(a2) * 1.6, yaw: (a2 + Math.PI) * 180 / Math.PI, pitch: -8 });
      await L.whenIdle(); await L.whenIdle();
      L.people.greet(); await new Promise((r) => setTimeout(r, 300));
      const b = [...document.querySelectorAll('#talk button')];
      return { open: !!L.progress.talk.read(), buttons: b.length, cursor: b.map((x) => getComputedStyle(x).cursor), lines: L.progress.talk.read().lines.length };
    });
    check('an exchange: two or three lines, two buttons with a pointer', ex.open && ex.buttons === 2 && ex.lines >= 2 && ex.lines <= 3 && ex.cursor.every((c) => c === 'pointer'), JSON.stringify(ex));
    const hb = await jp.evaluate(() => getComputedStyle(document.querySelectorAll('#talk button')[1]).backgroundColor);
    await jp.hover('#talk button:nth-child(2)');
    await jp.waitForTimeout(250);
    const ha = await jp.evaluate(() => getComputedStyle(document.querySelectorAll('#talk button')[1]).backgroundColor);
    check('an exchange\'s buttons change on hover', hb !== ha, `${hb} -> ${ha}`);
    // (phase 5b) the exchange stands the clock still, dims the world, frees the mouse
    await jp.evaluate(() => window.lab.unfreeze());
    const pz = await jp.evaluate(async () => {
      const t0 = window.lab.state().t; await new Promise((r) => setTimeout(r, 500));
      return { t0, t1: window.lab.state().t, veil: getComputedStyle(document.getElementById('veil')).opacity, locked: !!document.pointerLockElement, open: !!window.lab.progress.talk.read() };
    });
    check('while an exchange is open the clock stands still', pz.open && pz.t1 === pz.t0, `t ${pz.t0} -> ${pz.t1}`);
    check('the world dims under an exchange, and the mouse is free for its buttons', Number(pz.veil) > 0.9 && !pz.locked, `veil ${pz.veil}, locked ${pz.locked}`);
    await jp.mouse.click(500, 200);
    await jp.waitForTimeout(150);
    check('a click on the picture during an exchange does not take the mouse', !(await jp.evaluate(() => !!document.pointerLockElement)) && !!(await jp.evaluate(() => window.lab.progress.talk.read())));
    await jp.click('#talk button.yes');
    await jp.waitForTimeout(250);
    const took = await jp.evaluate(() => window.lab.progress.favours().find((f) => f.first).state);
    check('clicking "I will do it" takes the favour', took === 2, `state ${took}`);
    const stay = await jp.evaluate(async () => { await new Promise((r) => setTimeout(r, 400)); return !!window.lab.progress.talk.read(); });
    check('its last line waits to be read (no timer)', stay);
    await jp.keyboard.press('KeyE'); await jp.waitForTimeout(500);
    const after = await jp.evaluate(async () => { const t0 = window.lab.state().t; await new Promise((r) => setTimeout(r, 400)); return { open: !!window.lab.progress.talk.read(), t0, t1: window.lab.state().t, veil: getComputedStyle(document.getElementById('veil')).opacity }; });
    check('E closes it: the clock runs again and the world comes back', !after.open && after.t1 > after.t0 && Number(after.veil) < 0.1, JSON.stringify(after));
    await jp.keyboard.press('KeyK'); await jp.waitForTimeout(500);
    await jp.evaluate(async () => { const L = window.lab; L.camera(6); await L.whenIdle(); });
    await jp.keyboard.press('KeyK'); await jp.waitForTimeout(500);
    const nSk = await jp.evaluate(() => window.lab.progress.get().sketches.length);
    check('K sketches the view (twice)', nSk === 2, `${nSk} sketches`);
    // J opens the journal
    const h0 = await jp.evaluate(() => window.lab.state());
    await jp.evaluate(() => window.lab.runClock(true, 1 / 60));
    await jp.keyboard.press('KeyJ'); await jp.waitForTimeout(400);
    const j0 = await jp.evaluate(() => ({ r: window.lab.progress.journal.read(), focus: document.activeElement && document.activeElement.closest('#journal') ? document.activeElement.textContent : null, t: window.lab.state().t }));
    await jp.waitForTimeout(500);
    const t1 = await jp.evaluate(() => window.lab.state().t);
    check('J opens the journal, with the focus in it; the first time on the favour taken', j0.r.open && !!j0.focus && j0.r.tab === 'favours', `${j0.focus}; ${j0.r.tab}`);
    check('while the journal is open the clock stands still', t1 === j0.t, `${j0.t} -> ${t1}`);
    // the arrow keys between the pages
    const tabs = [];
    for (let k = 0; k < 4; k++) { tabs.push(await jp.evaluate(() => window.lab.progress.journal.read().tab)); await jp.keyboard.press('ArrowDown'); await jp.waitForTimeout(120); }
    check('the arrow keys move between the four pages, round again', tabs.join(' ') === 'favours places people sketches' && (await jp.evaluate(() => window.lab.progress.journal.read().tab)) === 'favours', tabs.join(' '));
    // each page: fits, Tab stays inside, focus outlined, pointer and hover
    const pages = [];
    for (const tab of ['places', 'people', 'sketches', 'favours']) {
      await jp.evaluate((t) => window.lab.progress.journal.tab(t), tab);
      await jp.waitForTimeout(150);
      const info = await jp.evaluate(() => {
        const pane = document.querySelector('#journal .pane'), panel = document.querySelector('#journal .panel'), r = panel.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#journal .panel button')].filter((b) => b.offsetParent !== null);
        const small = [...document.querySelectorAll('#journal .panel *')].filter((e) => e.offsetParent !== null && e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)).reduce((m, x) => Math.min(m, x), 99);
        return { fits: pane.scrollWidth <= pane.clientWidth && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth,
          pointer: btns.every((b) => getComputedStyle(b).cursor === 'pointer'), buttons: btns.length, smallest: small,
          emoji: /\p{Extended_Pictographic}/u.test(panel.innerText) };
      });
      // Tab round the page's controls
      let inside = true, seen = new Set();
      for (let k = 0; k < info.buttons + 2; k++) {
        await jp.keyboard.press('Tab');
        const f = await jp.evaluate(() => { const e = document.activeElement; return e && e.closest('#journal') ? { t: e.textContent.trim().slice(0, 30), o: getComputedStyle(e).outlineStyle, w: getComputedStyle(e).outlineWidth } : null; });
        if (!f) inside = false; else seen.add(`${f.t}|${f.o}|${f.w}`);
      }
      const outlined = [...seen].every((x) => !/\|none\|/.test(x));
      const want = await jp.evaluate(() => [...document.querySelectorAll('#journal .panel button')].filter((b) => b.offsetParent !== null && !b.disabled && b.tabIndex >= 0).length);
      pages.push({ tab, ...info, inside, outlined, reached: seen.size, want });
    }
    check('every journal page fits at 1024 x 640 with no sideways scrolling', pages.every((p) => p.fits), pages.map((p) => `${p.tab} ${p.fits}`).join(', '));
    check('Tab walks each page\'s controls and stays inside the journal', pages.every((p) => p.inside && p.reached === p.want), pages.map((p) => `${p.tab} ${p.reached} of ${p.want}`).join(', '));
    check('the keyboard focus is visibly outlined', pages.every((p) => p.outlined));
    check('every journal button shows a pointer', pages.every((p) => p.pointer));
    check('the journal\'s text is at least 11 px', pages.every((p) => p.smallest >= 11), pages.map((p) => p.smallest).join(', '));
    check('no emoji anywhere in the journal', pages.every((p) => !p.emoji));
    // hover feedback on a tab
    await jp.evaluate(() => window.lab.progress.journal.tab('places'));
    const tb = await jp.evaluate(() => getComputedStyle(document.querySelector('#jr-tab-people')).backgroundColor);
    await jp.hover('#jr-tab-people'); await jp.waitForTimeout(250);
    const ta = await jp.evaluate(() => getComputedStyle(document.querySelector('#jr-tab-people')).backgroundColor);
    check('the journal\'s tabs change on hover', tb !== ta, `${tb} -> ${ta}`);
    // a sketch, full screen, by keyboard
    await jp.evaluate(() => window.lab.progress.journal.tab('sketches'));
    await jp.focus('#journal .card');
    await jp.keyboard.press('Enter'); await jp.waitForTimeout(700);
    const v0 = await jp.evaluate(() => ({ r: window.lab.progress.journal.read(), w: document.querySelector('#journal .viewer canvas').getBoundingClientRect().width, fits: document.querySelector('#journal .viewer canvas').getBoundingClientRect().right <= innerWidth }));
    await jp.keyboard.press('ArrowRight'); await jp.waitForTimeout(500);
    const v1 = await jp.evaluate(() => window.lab.progress.journal.read().viewing);
    check('a sketch opens full screen and the arrow keys page through', v0.r.viewing === 0 && v1 === 1 && v0.w > 600 && v0.fits, `${v0.r.viewing} -> ${v1}, ${Math.round(v0.w)} px wide`);
    const copied = await jp.evaluate(async () => { const id = window.lab.progress.get().sketches[0].id; const t = await window.lab.progress.sketchText(id); const s = window.lab.progress.get().sketches[0]; return { lines: t.split('\n').length, width: t.split('\n')[0].length, rows: s.rows, cols: s.cols }; });
    check('a sketch as text: one line a row, one character a cell', copied.lines === copied.rows && copied.width === copied.cols, JSON.stringify(copied));
    await jp.keyboard.press('Escape'); await jp.waitForTimeout(250);
    const v2 = await jp.evaluate(() => window.lab.progress.journal.read());
    check('Escape closes the sketch, then the journal stays open', v2.open && v2.viewing === null);
    await jp.keyboard.press('KeyJ'); await jp.waitForTimeout(250);
    check('J closes the journal', !(await jp.evaluate(() => window.lab.progress.journal.read().open)));
    // the World section's progress controls
    await jp.keyboard.press('Escape'); await jp.waitForTimeout(400);
    await jp.evaluate(() => document.querySelector('#menu-tab-world').click());
    await jp.waitForTimeout(200);
    const named = [];
    for (let k = 0; k < 40; k++) { await jp.keyboard.press('Tab'); named.push(await focusName(jp)); }
    const wanted = ['copy a backup as text', 'paste a backup here', 'restore from this text', 'clear progress'];
    check('Tab reaches the save line\'s controls in World', wanted.every((w) => named.some((n) => n && n.includes(w))), wanted.filter((w) => !named.some((n) => n && n.includes(w))).join(', '));
    const line = await jp.evaluate(() => document.querySelector('#menu .saveline').textContent);
    check('the save line says what is saved for this world', /places found.*(people|person) met.*sketch.*favours? done/.test(line), line);
    const fitW = await jp.evaluate(() => { const b = document.querySelector('#menu .pane'); return b.scrollWidth <= b.clientWidth && document.documentElement.scrollWidth <= innerWidth; });
    check('the World section fits at 1024 x 640 with no sideways scrolling', fitW);
    const emo = await jp.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector('#menu').innerText + document.querySelector('#talk').innerText + document.querySelector('#title').innerText));
    check('no emoji in the menu, the exchange or the title screen', !emo);
    await J.check();
    await J.ctx.close();
  }

  // ---- (phase 5b) the Sound section, at 1024 x 640 ----
  {
    const Sd = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
    const sp = Sd.page;
    const silent = await sp.evaluate(() => ({ on: window.lab.sound.on, line: window.lab.titleState().foot }));
    check('the page starts silent, and the title screen says sound starts with the first click', !silent.on && /first click/.test(silent.line), JSON.stringify(silent));
    await sp.mouse.click(30, 620); await sp.waitForTimeout(400);
    check('the first click starts the sound', await sp.evaluate(() => window.lab.sound.on));
    // (0.5.3) the music: its first piece a few seconds in
    await sp.waitForTimeout((SOUND.music.first + 1.5) * 1000);
    const mus = await sp.evaluate(() => window.lab.sound.music);
    check('the music starts a few seconds after the sound', mus && mus.playing && mus.played > 0, JSON.stringify(mus));
    await play(sp);
    await sp.keyboard.press('Escape'); await sp.waitForTimeout(300);
    if (!(await sp.evaluate(() => window.lab.menu.read().open))) { await sp.keyboard.press('Escape'); await sp.waitForTimeout(300); }
    await sp.evaluate(() => document.querySelector('#menu-tab-sound').click());
    await sp.waitForTimeout(250);
    const sec = await sp.evaluate(() => {
      const pane = document.querySelector('#menu .pane'), sec2 = document.querySelector('#menu-panel-sound');
      return { sliders: sec2.querySelectorAll('input[type="range"]').length, toggles: sec2.querySelectorAll('[role="switch"]').length, fit: pane.scrollWidth <= pane.clientWidth && document.documentElement.scrollWidth <= innerWidth, text: sec2.innerText };
    });
    check('the Sound section: on or off, the volume, the music and five kinds of sound', sec.toggles === 1 && sec.sliders === 7, JSON.stringify({ sliders: sec.sliders, toggles: sec.toggles }));
    check('the Sound section fits at 1024 x 640 with no sideways scrolling', sec.fit);
    const named = [];
    for (let k = 0; k < 12; k++) { await sp.keyboard.press('Tab'); named.push(await focusName(sp)); }
    const want = ['sound', 'volume', 'music', 'wind and rain', 'water', 'birds and beasts', 'your footsteps', 'fires, wells, bells and doors'];
    check('Tab reaches every Sound control', want.every((w2) => named.some((n) => n && n.includes(w2))), want.filter((w2) => !named.some((n) => n && n.includes(w2))).join(', '));
    // the volume down by the arrow keys, kept after a reload
    await sp.focus('#menu-panel-sound input[type="range"]');
    for (let k = 0; k < 6; k++) await sp.keyboard.press('ArrowLeft');
    const vol = await sp.evaluate(() => window.lab.sound.settings.master);
    await sp.keyboard.press('Escape'); await sp.waitForTimeout(250);
    await sp.keyboard.press('KeyN'); await sp.waitForTimeout(200);
    const muted = await sp.evaluate(() => ({ m: window.lab.sound.settings.muted, note: document.getElementById('note').textContent }));
    check('N turns the sound off, and says so', muted.m === true && /Sound off/.test(muted.note), JSON.stringify(muted));
    await sp.reload(); await sp.waitForFunction(() => window.lab && window.lab.ready); await sp.waitForTimeout(500);
    await sp.evaluate(() => window.lab.titlePlay());
    const kept = await sp.evaluate(() => window.lab.sound.settings);
    check('after a reload the Sound choices are back', Math.abs(kept.master - vol) < 1e-9 && kept.muted === true && vol < 0.8, JSON.stringify(kept));
    await sp.keyboard.press('KeyN'); await sp.waitForTimeout(150);
    check('N turns it on again', (await sp.evaluate(() => window.lab.sound.settings.muted)) === false);
    await Sd.check();
    await Sd.ctx.close();
  }

  // ---- (0.5.5) greeting from any side, the prompt, a signpost, and the map's drawn layer, at 1024 x 640 ----
  {
    const Mp = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
    const mp = Mp.page;
    await play(mp); await mp.waitForTimeout(4400);   // (the title screen, then its hint's four seconds)
    // behind someone at work in a field, 2.2 m back, looking the way they look
    const who = await mp.evaluate(async () => {
      const L = window.lab; L.freeze(11, 0, 0);
      const list = L.people.list(), p = list.find((q) => !q.hidden && q.act === 'working the field');
      L.setCamera({ x: p.x - Math.sin(p.yaw) * 2.2, z: p.z - Math.cos(p.yaw) * 2.2, yaw: p.yaw * 180 / Math.PI, pitch: -6 });
      return p.name;
    });
    await mp.keyboard.down('KeyS'); await mp.waitForTimeout(50); await mp.keyboard.up('KeyS'); await mp.waitForTimeout(600);
    const pr = await mp.evaluate(() => ({ on: document.getElementById('prompt').classList.contains('on'), text: document.getElementById('prompt').textContent }));
    check('standing behind someone, the prompt says E talks to them', pr.on && pr.text.includes(who), JSON.stringify(pr));
    await mp.keyboard.press('KeyE'); await mp.waitForTimeout(400);
    const said = await mp.evaluate(() => (window.lab.lastSaid ? window.lab.lastSaid.name : null));
    check('E from behind them greets them', said === who, `${said} / ${who}`);
    // a signpost: its panel, every row an arrow, a place and a distance
    // (once what they said has gone: the panel waits for it)
    await mp.waitForTimeout(5600);
    await mp.evaluate(async () => {
      const L = window.lab, d = L.signs();
      const P = d.find((q) => q.arms.length > 1) || d[0];
      L.setCamera({ x: P.x + 2, z: P.z + 1, yaw: 0, pitch: -4 });
      await new Promise((r) => setTimeout(r, 200));
    });
    await mp.keyboard.down('KeyS'); await mp.waitForTimeout(40); await mp.keyboard.up('KeyS'); await mp.waitForTimeout(700);
    const sp2 = await mp.evaluate(() => { const el = document.getElementById('sign'); const r = el.getBoundingClientRect(); return { on: el.classList.contains('on'), rows: [...el.querySelectorAll('li[data-yaw]')].map((li) => li.textContent), fits: r.left >= 0 && r.right <= innerWidth }; });
    check('by a signpost, its arms are read: a place, a way and a distance each', sp2.on && sp2.rows.length > 0 && sp2.rows.every((t) => /(north|south|east|west)/.test(t) && /\d+ (m|km)/.test(t)) && sp2.fits, JSON.stringify(sp2));
    // the map's drawn layer, with three villages, the fort and a hill found
    await mp.evaluate(() => {
      const L = window.lab, j = L.progress.get();
      for (const id of ['village0', 'village1', 'village2', 'fort', 'view3']) j.found[id] = j.found[id] || [1, 11];
      L.progress.set(JSON.stringify(j));
    });
    await mp.keyboard.press('KeyM'); await mp.waitForTimeout(1200);
    const mo = await mp.evaluate(() => {
      const o = document.getElementById('mapover'), q = (s) => o.querySelector(s);
      const inView = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5; };
      const overlap = (a, b) => { const p = a.getBoundingClientRect(), q2 = b.getBoundingClientRect(); return p.left < q2.right && p.right > q2.left && p.top < q2.bottom && p.bottom > q2.top; };
      const names = [...o.querySelectorAll('.labels .name')];
      return {
        shown: !o.hidden, compass: ['.ns.n', '.ns.s', '.ew.e', '.ew.w'].map((s) => q(s).textContent).join(''),
        allIn: ['.ns.n', '.ns.s', '.ew.e', '.ew.w', '.legend', '.rose', '.readout', '.scale', '.you'].every((s) => inView(q(s)) || s === '.you'),
        legendClear: !overlap(q('.legend'), q('.ew.w')) && !overlap(q('.legend'), q('.frame')),
        names: names.map((n) => n.textContent), namesApart: names.every((a, i) => names.every((b, j) => i === j || !overlap(a, b))),
        facing: q('.facing').textContent, found: q('.found').textContent,
      };
    });
    check('M shows the map with north, south, east and west on its frame', mo.shown && mo.compass === 'NSEW', JSON.stringify({ shown: mo.shown, compass: mo.compass }));
    check('the legend, the rose, the readout and the scale are all on screen at 1024 x 640, the legend clear of the map', mo.allIn && mo.legendClear, JSON.stringify({ allIn: mo.allIn, legendClear: mo.legendClear }));
    check('the places found are named on the map, no two names overlapping', mo.names.length >= 5 && mo.namesApart, JSON.stringify(mo.names));
    check('the readout says which way you face and how much is found', /^facing (north|south|east|west)/.test(mo.facing) && /of \d+ places found/.test(mo.found), `${mo.facing}; ${mo.found}`);
    await mp.keyboard.press('KeyM'); await mp.waitForTimeout(200);
    check('M again closes it, and its layer with it', await mp.evaluate(() => document.getElementById('mapover').hidden));
    await Mp.check();
    await Mp.ctx.close();
  }

  // ---- (phase 6) the title screen's choices, the keys, text size, motion, the cap, sharing, the pause ----
  {
    const T = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1, context: { permissions: ['clipboard-read', 'clipboard-write'] } });
    const tp = T.page;
    const clip = () => tp.evaluate(() => navigator.clipboard.readText());
    await tp.waitForFunction(() => window.lab.titleState().shown, null, { timeout: 8000 });
    let t = await title(tp);
    const fit = await tp.evaluate(() => { const r = document.querySelector('#title .panel').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; });
    check('the title screen fits at 1024 x 640', fit);
    check('its flyover: four spots found from the world\'s own cameras, one of them in rain', t.spots.length === 4 && new Set(t.spots.map((x) => x.name)).size === 4 && t.spots.some((x) => x.weather === 'rain'), t.spots.map((x) => `${x.name} at ${x.hour}${x.weather === 'rain' ? ' in rain' : ''}`).join('; '));
    // the flyover touches nothing that is kept: a spot goes by, then Play
    const before = await tp.evaluate(() => ({ found: Object.keys(window.lab.progress.get().found).length, at: window.lab.progress.get().at || null }));
    await tp.waitForTimeout(21500);
    const during = await tp.evaluate(() => ({ cam: window.lab.state().camName, found: Object.keys(window.lab.progress.get().found).length }));
    // Settings opens the menu over the title; Escape closes it, back to the title with Play focused
    await tp.click('#title .choice:has-text("Settings")'); await tp.waitForTimeout(500);   // (an Escape in the menu's first 350 ms is the one that opened it)
    const menuOver = await tp.evaluate(() => window.lab.menu.read().open && window.lab.titleState().up);
    await tp.keyboard.press('Escape'); await tp.waitForTimeout(300);
    t = await title(tp);
    check('Settings opens the menu over the title screen; Escape goes back to it, Play focused', menuOver && t.up && !(await tp.evaluate(() => window.lab.menu.read().open)) && /^Play/.test(t.focus));
    // Share this world, on the title
    await tp.click('#title .choice:has-text("Share this world")'); await tp.waitForTimeout(300);
    const c1 = await clip();
    check('Share this world on the title screen copies a link to this seed', /\/play\.html\?seed=3$/.test(c1) && /copied/.test((await title(tp)).note), c1);
    await tp.keyboard.press('Home');
    await tp.evaluate(() => window.lab.titlePlay()); await tp.waitForTimeout(400);
    const after = await tp.evaluate(() => { const s = window.lab.state(); return { x: s.x, z: s.z, cam: s.camName, weather: s.weather, found: Object.keys(window.lab.progress.get().found).length }; });
    check('the flyover changes no saved progress, and Play puts you where you were', before.found === 0 && during.found === 0 && /^title: /.test(during.cam) && Math.hypot(after.x - 624, after.z - 1088) < 2 && after.weather === 'auto', `${during.cam}; then (${after.x.toFixed(0)}, ${after.z.toFixed(0)}), weather ${after.weather}`);
    // the keys: one changed, a clash refused, kept after a reload, the old key free, reset
    await tp.evaluate(() => window.lab.menu.open()); await tp.waitForTimeout(250);
    const bindBtn = (n) => tp.locator('#menu .rebind').nth(n);
    await bindBtn(11).click(); await tp.keyboard.press('KeyU'); await tp.waitForTimeout(100);          // the map, to U
    const said1 = await tp.evaluate(() => document.querySelector('#menu .keysaid').textContent);
    await bindBtn(0).click(); await tp.keyboard.press('KeyE'); await tp.waitForTimeout(100);           // walk forward, to E: refused
    const said2 = await tp.evaluate(() => document.querySelector('#menu .keysaid').textContent);
    await bindBtn(0).click(); await tp.keyboard.press('Escape'); await tp.waitForTimeout(100);         // Escape leaves it
    const said3 = await tp.evaluate(() => document.querySelector('#menu .keysaid').textContent);
    check('a key can be changed; one already used is refused, and says why; Escape leaves it', /the map: U/.test(said1) && /already greet/.test(said2) && /Left as it was/.test(said3), `${said1} | ${said2} | ${said3}`);
    await tp.evaluate(() => window.lab.menu.close()); await tp.waitForTimeout(150);
    await tp.keyboard.press('KeyM'); await tp.waitForTimeout(250);
    const mOpen = await tp.evaluate(() => !document.getElementById('mapover').hidden);
    await tp.keyboard.press('KeyU'); await tp.waitForTimeout(250);
    const uOpen = await tp.evaluate(() => !document.getElementById('mapover').hidden);
    await tp.keyboard.press('KeyU'); await tp.waitForTimeout(150);
    check('the changed key does its action and the old one is free', !mOpen && uOpen);
    await tp.reload(); await tp.waitForFunction(() => window.lab && window.lab.ready); await tp.evaluate(() => window.lab.titlePlay());
    const keptKeys = await tp.evaluate(() => JSON.parse(localStorage.getItem('land-of-ascii-v3.keys') || '{}').map);
    await tp.evaluate(() => window.lab.menu.open()); await tp.waitForTimeout(200);
    await tp.click('#menu button:has-text("reset the keys")'); await tp.waitForTimeout(150);
    const resetTo = await tp.evaluate(() => JSON.parse(localStorage.getItem('land-of-ascii-v3.keys') || '{}').map);
    check('the changed key is kept after a reload; reset puts them all back', keptKeys === 'KeyU' && resetTo === 'KeyM', `${keptKeys} -> ${resetTo}`);
    // text size: larger, and every section still fits with no sideways scrolling
    await tp.click('#menu-tab-display'); await tp.waitForTimeout(150);
    await tp.click('#menu button:has-text("larger")'); await tp.waitForTimeout(200);
    const fits = [];
    for (const id of ['controls', 'display', 'sound', 'world', 'advanced']) {
      await tp.click(`#menu-tab-${id}`); await tp.waitForTimeout(120);
      fits.push(await tp.evaluate(() => { const b = document.querySelector('#menu .pane'); return b.scrollWidth <= b.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth; }));
    }
    const zoom = await tp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-text').trim());
    check('the text size "larger" applies, and every section still fits at 1024 x 640 with no sideways scrolling', zoom === '1.3' && fits.every(Boolean), `--ui-text ${zoom}; ${fits.join(' ')}`);
    await tp.click('#menu-tab-display'); await tp.waitForTimeout(100);
    await tp.click('#menu button:has-text("regular")');
    // reduced motion: the class that stills every transition; the title's drift still
    await tp.click('#menu button:has-text("reduced")'); await tp.waitForTimeout(150);
    const still = await tp.evaluate(() => document.documentElement.classList.contains('still') && getComputedStyle(document.querySelector('#menu .panel')).transitionDuration.split(',').every((d) => parseFloat(d) === 0));
    // the cap: 30 frames a second at most
    await tp.click('#menu button:has-text("30 at most")'); await tp.waitForTimeout(1500);
    const pace = await tp.evaluate(() => window.lab.pace());
    check('reduced motion stills the menu\'s transitions', still);
    check('the frame-rate cap of 30 holds the frames at least two refreshes apart (60 Hz)', pace.cap === 30 && pace.every >= 2 && pace.refresh > 12, JSON.stringify(pace));
    await tp.reload(); await tp.waitForFunction(() => window.lab && window.lab.ready);
    await tp.waitForFunction(() => window.lab.titleState().shown, null, { timeout: 8000 });
    const y0 = await tp.evaluate(() => window.lab.state().yaw); await tp.waitForTimeout(2000);
    const y1 = await tp.evaluate(() => window.lab.state().yaw);
    check('with reduced motion the title screen\'s view holds still', Math.abs(y1 - y0) < 1e-6, `${y0.toFixed(3)} -> ${y1.toFixed(3)}`);
    await tp.evaluate(() => window.lab.titlePlay());
    await tp.evaluate(() => window.lab.menu.open()); await tp.click('#menu-tab-display'); await tp.waitForTimeout(100);
    await tp.click('#menu button:has-text("as the device asks")'); await tp.click('#menu button:has-text("as fast as it goes")');
    // Share this world with the place and the hour
    await tp.click('#menu-tab-world'); await tp.waitForTimeout(150);
    await tp.check('#m-share-place');
    await tp.click('#menu button:has-text("share this world")'); await tp.waitForTimeout(300);
    const c2 = await clip();
    check('Share this world with the place and the hour copies a link that has both', /\?seed=3&at=[\d.]+%2C[\d.]+%2C\d+&hour=[\d.]+$/.test(c2), c2.replace(/^.*\?/, '?'));
    await tp.evaluate(() => window.lab.menu.close()); await tp.waitForTimeout(200);
    // the pause while the window is elsewhere
    await tp.evaluate(() => window.dispatchEvent(new Event('blur'))); await tp.waitForTimeout(150);
    const away = await tp.evaluate(() => document.getElementById('away').classList.contains('on'));
    const xz0 = await tp.evaluate(() => { const s = window.lab.state(); return [s.x, s.z]; });
    await tp.keyboard.down('KeyW'); await tp.waitForTimeout(400); await tp.keyboard.up('KeyW');
    const xz1 = await tp.evaluate(() => { const s = window.lab.state(); return [s.x, s.z]; });
    await tp.click('#away'); await tp.waitForTimeout(200);
    const back = await tp.evaluate(() => !document.getElementById('away').classList.contains('on'));
    check('leaving the window pauses the game (nothing moves) until a click', away && xz0[0] === xz1[0] && xz0[1] === xz1[1] && back);
    // full screen: the button, on and off again
    await tp.evaluate(() => window.lab.menu.open()); await tp.click('#menu-tab-display'); await tp.waitForTimeout(100);
    await tp.click('#menu button.fs'); await tp.waitForTimeout(500);
    const fsOn = await tp.evaluate(() => !!document.fullscreenElement);
    await tp.click('#menu button.fs'); await tp.waitForTimeout(500);
    const fsOff = await tp.evaluate(() => !document.fullscreenElement);
    check('the full screen button goes full screen and back', fsOn && fsOff);
    // New world: the seed field refuses words, opens a number
    await tp.reload(); await tp.waitForFunction(() => window.lab && window.lab.ready);
    await tp.waitForFunction(() => window.lab.titleState().shown, null, { timeout: 8000 });
    await tp.click('#title .choice:has-text("New world")');
    await tp.fill('#title .newrow input', 'abc'); await tp.keyboard.press('Enter'); await tp.waitForTimeout(100);
    const refused = (await title(tp)).note;
    await tp.fill('#title .newrow input', '48211'); await tp.keyboard.press('Enter');
    await tp.waitForURL(/seed=48211/, { timeout: 10000 });
    check('New world refuses a seed that is not a number, and opens one that is', /whole number/.test(refused) && /seed=48211/.test(tp.url()), refused);
    await T.ctx.close();
  }
  // ---- (phase 6) a browser that cannot run the game is told what it lacks ----
  {
    const ctx6 = await browser.newContext({ viewport: { width: 1024, height: 640 } });
    await ctx6.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...r) { return k === 'webgl2' ? null : g.call(this, k, ...r); }; });
    const p6 = await ctx6.newPage();
    await p6.goto(`${url}/play.html`);
    await p6.waitForSelector('#error.unsupported', { timeout: 20000 });
    const msg = await p6.evaluate(() => document.getElementById('error').innerText);
    check('a browser without WebGL 2 is told so, naming it, instead of an error', /cannot run in this browser/.test(msg) && /WebGL 2/.test(msg), msg.split('\n')[0]);
    await ctx6.close();
  }

  console.log(`menu check: ${results.filter((r) => r.ok).length} of ${results.length} passed\n`);
  for (const r of results) console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\ncontrols reached by Tab, section by section:\n  ${names.join('\n  ')}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
