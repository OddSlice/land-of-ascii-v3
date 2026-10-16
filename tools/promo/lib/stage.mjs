// The promo's stage: the built game opened as a visitor opens it (the title
// screen, progress and sound on), drawn on the page itself (?threads=0, so
// each frame is made in full inside its step: every worker count draws the
// same cells, tools/identity.mjs), with the game's own font and every clock
// held (lib/clock.mjs). Frames are captured with Chrome's own screenshot
// command at the window's exact size.
//
//   const st = await openStage({ width: 1920, height: 1080, audio: 31 });
//   await st.step(10); const png = await st.shot();
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../../lib/browser.mjs';
import { serve, ROOT } from '../../lib/serve.mjs';
import { openVisitor } from '../../lib/game.mjs';
import { clockScript } from './clock.mjs';
import { fontScript } from './fonts.mjs';

// The detail level every promo picture uses: medium (6 x 12 pixel cells at
// 1920 x 1080), a level the menu offers, where the letters still read.
export const DENSITY = 2;

// The Display choices the promo is made with, set as a player sets them in
// the menu: text two steps larger (so the words read in a video), nothing
// over the picture (no statistics line), detail as above.
export const DISPLAY = { text: 1.3, hud: 'none' };

export async function openStage({ width = 1920, height = 1080, dpr = 1, seed = 7, audio = 0, density = DENSITY, query = '', hideFoot = true, display = DISPLAY } = {}) {
  const { server, url } = await serve();
  const browser = await launch('chromium', { audio: audio > 0 });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await ctx.addInitScript(fontScript());
  await ctx.addInitScript((d) => { try { localStorage.setItem('land-of-ascii-v3.display', JSON.stringify({ v: 2, density: d.density - 1, glyphs: true, hud: d.hud, sensitivity: 1, invert: false, text: d.text, motion: 'system', cap: 0, auto: true })); } catch { /* none */ } }, { ...display, density });
  const { page, errors } = await openVisitor(browser, url, { ctx, init: clockScript({ seed, audio }), query: `?threads=0&density=${density}${query}` });
  await page.evaluate(() => window.__fontsReady);
  // (the title's foot: the version and "sound starts with your first click",
  // which mean nothing in a trailer or a still that is kept for years)
  if (hideFoot) await page.addStyleTag({ content: '#title .foot { visibility: hidden !important; }' });
  await page.waitForFunction(() => window.lab.titleState().shown, null, { timeout: 30000 });
  await page.evaluate(() => window.__promo.hold());
  const cdp = await ctx.newCDPSession(page);
  const st = {
    url, page, ctx, cdp, errors, width, height,
    async step(n = 1) { for (let i = 0; i < n; i++) await page.evaluate(() => window.__promo.step()); },
    async shot(format = 'png') { const { data } = await cdp.send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality: 95 } : {}), captureBeyondViewport: false }); return Buffer.from(data, 'base64'); },
    eval: (fn, arg) => page.evaluate(fn, arg),
    async close() { await browser.close(); server.close(); },
  };
  return st;
}

// Leave the title screen as Play does, and set the world's clock: `hour`,
// moving at real time (people walk, animals graze) unless `still`.
export async function playAt(st, { hour = 14, day = 0, weather = 'fair', still = false } = {}) {
  await st.eval(({ hour, day, weather, still }) => {
    const L = window.lab;
    if (L.titleState().up) L.titlePlay();
    L.setWeather(weather);
    L.setDay(day);
    const s = L.state();
    L.freeze(hour, s.t, day);
    if (!still) { L.unfreeze(); L.runClock(true); }
  }, { hour, day, weather, still });
}

export const writePng = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); };
export { ROOT };
