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

try {
  // ---- a first visit ----
  const lab = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1440, height: 900, dpr: 1 });
  const { page } = lab;
  await page.waitForTimeout(400);
  let s = await st(page);
  check('the start card shows on a first visit', s.m.card);
  check('the compact statistics show from the start: one line with the frame rate', s.m.hud === 'minimal' && s.hudText.split('\n').filter(Boolean).length === 1 && /fps/.test(s.hudText), JSON.stringify(s.hudText.trim()));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s = await st(page);
  check('Escape on the start card closes it and does not open the menu', !s.m.card && !s.m.open);
  check('then the hint that Escape opens the menu shows', s.m.hint);
  await page.waitForTimeout(4600);
  s = await st(page);
  check('the hint fades after a few seconds', !s.m.hint);

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
  check('after a reload the start card stays away (seen once)', !s.m.card);
  check('after a reload the Display choices are back', s.preset === 1 && s.glyphs === false && s.m.hud === 'full' && Math.abs(s.sensitivity - 1.5) < 1e-9 && s.invert === true,
    `density ${s.preset + 1}, glyphs ${s.glyphs}, statistics ${s.m.hud}, sensitivity ${s.sensitivity}, invert ${s.invert}`);
  check('after a reload the seed, the time and the weather are the default ones', Math.abs(s.hour - 14) < 0.01 && s.weather === 'auto' && (await page.evaluate(() => window.lab.seed)) === 3, `hour ${s.hour}, weather ${s.weather}`);
  await lab.check();
  await lab.ctx.close();

  // ---- 1024 x 640 ----
  const small = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
  await small.page.keyboard.press('Enter'); await small.page.waitForTimeout(200);
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
    await mp.keyboard.press('Enter'); await mp.waitForTimeout(200);
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
  await p2.goto(`${url}/index.html?threads=4`);
  await p2.waitForFunction(() => window.lab && window.lab.ready, null, { timeout: 180000 });
  await p2.evaluate(() => window.lab.ready);
  await p2.waitForTimeout(300);
  await p2.keyboard.press('Enter'); await p2.waitForTimeout(200);
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
  await p3.goto(`${url}/index.html?threads=4`);
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
    await jp.keyboard.press('Enter'); await jp.waitForTimeout(300);
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
    check('J opens the journal, with the focus in it', j0.r.open && !!j0.focus, j0.focus);
    check('while the journal is open the clock stands still', t1 === j0.t, `${j0.t} -> ${t1}`);
    // the arrow keys between the pages
    const tabs = [];
    for (let k = 0; k < 4; k++) { tabs.push(await jp.evaluate(() => window.lab.progress.journal.read().tab)); await jp.keyboard.press('ArrowDown'); await jp.waitForTimeout(120); }
    check('the arrow keys move between the four pages, round again', tabs.join(' ') === 'places people sketches favours' && (await jp.evaluate(() => window.lab.progress.journal.read().tab)) === 'places', tabs.join(' '));
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
    const emo = await jp.evaluate(() => /\p{Extended_Pictographic}/u.test(document.querySelector('#menu').innerText + document.querySelector('#talk').innerText + document.querySelector('#card').innerText));
    check('no emoji in the menu, the exchange or the start card', !emo);
    await J.check();
    await J.ctx.close();
  }

  // ---- (phase 5b) the Sound section, at 1024 x 640 ----
  {
    const Sd = await openLab(browser, url, { built: true, scene: 'world', threads: 4, quiet: false, width: 1024, height: 640, dpr: 1 });
    const sp = Sd.page;
    const silent = await sp.evaluate(() => ({ on: window.lab.sound.on, line: document.querySelector('#card .snd') && !document.querySelector('#card .snd').hidden ? document.querySelector('#card .snd').textContent : '' }));
    check('the page starts silent, and the start card says sound starts with the first click', !silent.on && /first click/.test(silent.line), JSON.stringify(silent));
    await sp.mouse.click(500, 300); await sp.waitForTimeout(400);
    check('the first click starts the sound', await sp.evaluate(() => window.lab.sound.on));
    // (0.5.3) the music: its first piece a few seconds in
    await sp.waitForTimeout((SOUND.music.first + 1.5) * 1000);
    const mus = await sp.evaluate(() => window.lab.sound.music);
    check('the music starts a few seconds after the sound', mus && mus.playing && mus.played > 0, JSON.stringify(mus));
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
    const kept = await sp.evaluate(() => window.lab.sound.settings);
    check('after a reload the Sound choices are back', Math.abs(kept.master - vol) < 1e-9 && kept.muted === true && vol < 0.8, JSON.stringify(kept));
    await sp.keyboard.press('KeyN'); await sp.waitForTimeout(150);
    check('N turns it on again', (await sp.evaluate(() => window.lab.sound.settings.muted)) === false);
    await Sd.check();
    await Sd.ctx.close();
  }

  console.log(`menu check: ${results.filter((r) => r.ok).length} of ${results.length} passed\n`);
  for (const r of results) console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\ncontrols reached by Tab, section by section:\n  ${names.join('\n  ')}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
