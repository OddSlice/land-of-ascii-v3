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
//     count stays near the detail level's promise.
//   node tools/menu-check.mjs [--browser chromium]
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
  for (let i = 0; i < 4; i++) {
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
  check('the arrow keys move between the four sections, round again', tabsSeen.join(' ') === 'controls display world advanced' && s.m.tab === 'controls', tabsSeen.join(' '));
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
  const t0 = (await st(page)).t;
  await page.keyboard.press('KeyW'); await page.keyboard.press('Digit3');
  await page.waitForTimeout(500);
  s = await st(page);
  check('while open the clock stands still and game keys do nothing', s.t === t0 && s.hour === 14 && s.menu, `t ${t0} -> ${s.t}, hour ${s.hour}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s = await st(page);
  check('Escape closes the menu', !s.m.open && !s.menu);
  await page.waitForTimeout(300);
  check('closed, the clock runs again', (await st(page)).t > s.t);
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(100);
  s = await st(page);
  check('closed, the game has its keys back (2: dusk)', Math.abs(s.hour - 17.85) < 1e-9, `${s.hour}`);
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
  check('after a reload the seed, the time and the weather are the default ones', s.hour === 14 && s.weather === 'auto' && (await page.evaluate(() => window.lab.seed)) === 3, `hour ${s.hour}, weather ${s.weather}`);
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

  console.log(`menu check: ${results.filter((r) => r.ok).length} of ${results.length} passed\n`);
  for (const r of results) console.log(`${r.ok ? 'pass' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  console.log(`\ncontrols reached by Tab, section by section:\n  ${names.join('\n  ')}`);
} finally {
  await browser.close();
  server.close();
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
