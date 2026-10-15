// The one shared way the tools open the game and stand somewhere in it
// (phase 6.1), so they stop drifting apart:
// - openLab (tools/lib/serve.mjs): a tool's page, quiet (no title screen,
//   menu, hint or statistics), the scene, the seed, the workers and the
//   detail level given;
// - openVisitor: the page as a visitor opens it (the title screen, progress
//   and sound on), with a script to run before the page's own (storage set
//   or broken, say);
// - play: Play (or Continue) by the keyboard, once the title's panel is
//   forward;
// - view: a fixed camera (index or name) or a place, the weather held and
//   every clock frozen (lab.view), waited until on screen.
export { openLab } from './serve.mjs';

// (`before(page, ctx)`: run once the page exists, before it is opened: a CPU
// throttle, say. Every page error and console error is collected in `errors`.)
export async function openVisitor(browser, base, { width = 1280, height = 800, dpr = 1, init = null, query = '', built = true, ctx = null, before = null, timeout = 180000, missing = false } = {}) {
  const c = ctx || await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  if (init) await c.addInitScript(init);
  const page = await c.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // (`missing`: a resource that fails to load is not counted, for a live site's)
  page.on('console', (m) => { if (m.type() === 'error' && !(missing && /Failed to load resource/.test(m.text()))) errors.push(m.text()); });
  if (before) await before(page, c);
  await page.goto(`${base}/${built ? 'play.html' : ''}${query}`);
  await page.waitForFunction(() => window.lab && window.lab.ready && window.lab.titleState, null, { timeout });
  await page.evaluate(() => window.lab.ready);
  return { ctx: c, page, errors };
}

export async function play(page, settle = 300) {
  await page.waitForFunction(() => window.lab.titleState() && window.lab.titleState().shown, null, { timeout: 15000 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(settle);
}

export const view = (page, spec) => page.evaluate(async (s) => {
  const L = window.lab;
  if (L.view) return L.view(s);
  // (an older build, measured beside this one: the same steps by hand)
  const { camera, at, hour = 'own', weather = 'fair', t = 0, day } = s;
  if (weather !== null && L.setWeather) L.setWeather(weather);
  let i = -1;
  if (camera !== undefined) { i = typeof camera === 'number' ? camera : L.cameras.findIndex((c) => c.name === camera); L.camera(i); } else if (at) L.setCamera(at);
  L.freeze(hour === 'own' ? (i >= 0 ? L.cameras[i].time : L.state().hour) : hour, t, day);
  await L.whenIdle();
  return L.state();
}, spec);
