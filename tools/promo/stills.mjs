// The promo's stills: hype images, the itch.io page set, real screenshots,
// the link preview and the animated cover.
//
//   node tools/promo/stills.mjs                  everything, into promo/images and promo/itch
//   node tools/promo/stills.mjs --only cover,keyart
//
// Each picture of the land is the game's own frame (lib/stage.mjs: the
// built game, every clock held, seeded), captured at the exact size it is
// shown at, so nothing is ever scaled. The cards are drawn by
// pages/card.html with the game's own stone frame, lettering and font.
// Hype images and the itch art tidy the game's notes away; the screenshots
// show the game as a player sees it (with the statistics line off, the
// Display setting "nothing over the picture").
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { args } from '../lib/serve.mjs';
import { openStage, ROOT, writePng } from './lib/stage.mjs';

const a = args();
const ONLY = a.only ? String(a.only).split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
const IMG = path.join(ROOT, 'promo', 'images'), ITCH = path.join(ROOT, 'promo', 'itch'), SHOTS = path.join(ITCH, 'screenshots');
const WORK = path.join(ROOT, 'shots', 'promo-work', 'stills');
for (const d of [IMG, ITCH, SHOTS, WORK]) fs.mkdirSync(d, { recursive: true });
const URL_TEXT = 'ODDSLICE.ITCH.IO', FOOT = 'PLAY FREE IN YOUR BROWSER';
const report = [];

const st = await openStage({ width: 1920, height: 1080 });
const { page } = st;
await page.addScriptTag({ type: 'module', url: `${st.url}/tools/promo/lib/overlay.js` });
await page.waitForFunction(() => window.__ov && window.__ov.ready);
await st.eval(() => { window.lab.setHud(false); });
const browser = st.ctx.browser();

// ---- the game's pictures ----
// `s`: { w, h, cam, closer, turn, pitch, at: {x,z,yaw,pitch,y}, hour, weather, tidy, setup(L) as a string run in the page }
async function scene(s) {
  await page.setViewportSize({ width: s.w, height: s.h });
  const plain = Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function'));
  await st.eval((o) => {
    const L = window.lab;
    if (L.titleState().up) L.titlePlay();
    // (nothing left open from the scene before: the journal and its viewer,
    // the map, an exchange; the text at the size the promo uses)
    L.progress.journal.shut(); L.progress.journal.close(); L.setMap(false);
    for (const e of document.querySelectorAll('#journal *')) if (e.scrollTop) e.scrollTop = 0;
    for (let k = 0; k < 4 && document.querySelector('#talk.on'); k++) { if (k === 0) L.progress.talk.later(); else L.progress.talk.go(); }
    document.documentElement.style.setProperty('--ui-text', '1.3');
    document.documentElement.classList.remove('promo-noprompt');
    L.setWeather(o.weather || 'fair');
    let p;
    if (o.at) p = { ...o.at };
    else { const c = L.cameras[o.cam]; p = { x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch, y: c.y }; }
    if (o.closer) { const r = p.yaw * Math.PI / 180; p.x += Math.sin(r) * o.closer; p.z += Math.cos(r) * o.closer; p.y = undefined; }
    if (o.right) { const r = p.yaw * Math.PI / 180; p.x += Math.cos(r) * o.right; p.z -= Math.sin(r) * o.right; p.y = undefined; }
    p.yaw += o.turn || 0; p.pitch += o.pitch || 0;
    L.setFly(true);
    L.setCamera({ x: p.x, z: p.z, y: p.y !== undefined ? p.y : Math.max(L.ground(p.x, p.z).ground, L.ground(p.x, p.z).surface) + 1.7, yaw: p.yaw, pitch: p.pitch });
    L.setHour(o.hour); L.runClock(true);
    window.__ov.tidy(o.tidy !== false, o.tidy !== false);
  }, plain);
  // (a few frames at the new hour first: people and animals are placed by
  // the frames, so a setup that looks for them sees where they are now)
  await st.step(3);
  if (s.setup) await st.eval(s.setup);
  if (s.prep) await s.prep();
  for (let k = 0; k < 90; k++) { await st.step(1); if (k > 6 && await st.eval(() => window.lab.state().settled)) break; }
  await st.step(s.extra || 3);
  // (a key pressed as a player would, then frames for the game to answer:
  // a sketch waits on the game's own timers, which move only as frames do)
  if (s.press) { await page.keyboard.press(s.press); await st.step(s.pressSteps || 20); }
  if (s.after) { await st.eval(s.after); await st.step(s.afterSteps || 4); }
  const png = await st.steadyShot();
  writePng(path.join(WORK, `${s.name}.png`), png);
  return `data:image/png;base64,${png.toString('base64')}`;
}

// ---- the cards ----
const cardCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const card = await cardCtx.newPage();
await card.goto(`${st.url}/tools/promo/pages/card.html`);
await card.waitForFunction(() => window.cardReady === true);
async function render(name, w, h, pieces, file, { transparent = false } = {}) {
  await card.setViewportSize({ width: w, height: h });
  if (transparent) await card.addStyleTag({ content: 'html, body, #card { background: transparent !important; }' });
  const r = await card.evaluate((spec) => window.render(spec), { w, h, pieces });
  const buf = await card.screenshot({ clip: { x: 0, y: 0, width: w, height: h }, omitBackground: transparent });
  writePng(file, buf);
  report.push({ name, file: path.relative(ROOT, file), size: `${w}x${h}`, spills: r.spills, font: r.font });
  if (r.spills.length) console.log(`  ${name}: SPILLS ${r.spills.join('; ')}`);
  if (transparent) await card.reload().then(() => card.waitForFunction(() => window.cardReady === true));
  return buf;
}

// the frame round a card: cells cw x 2cw; stone 3 cells at the sides, 2
// rows and a rail at the top and the foot. The field inside it:
// (whole rows of stone: a card whose height is not a whole number of rows
// has the frame centred, its top and foot rows cut evenly)
const geo = (w, h, cw) => {
  const ch = 2 * cw, cols = Math.round(w / cw), rows = Math.ceil(h / ch), oy = -Math.floor((rows * ch - h) / 2);
  return { frame: { type: 'frame', x: 0, y: oy, w: cols * cw, h: rows * ch, cw }, field: { x: 3 * cw, y: oy + 3 * ch, w: cols * cw - 6 * cw, h: rows * ch - 6 * ch } };
};
const field = (w, h, cw) => geo(w, h, cw).field;
const frameOf = (w, h, cw) => geo(w, h, cw).frame;
const shade = (f, from, to, css) => ({ type: 'shade', x: f.x, y: from, w: f.w, h: to - from, css });
const footer = (w, y, size = 26) => ({ type: 'foot', text: FOOT, url: URL_TEXT, x: w / 2, y, anchor: 'center', vanchor: 'middle', size });

// A hype image: a picture in the field, the name at the top, one line, the footer.
async function hype(name, pic, tagline, { titleCw = 7, top = 104, extra = [], footFromBottom = 54, tagY = null, picDy = 0 } = {}) {
  const W = 1920, H = 1080, cw = 12, f = field(W, H, cw);
  return render(name, W, H, [
    { type: 'pic', src: pic, x: f.x, y: f.y + picDy, clip: f },
    shade(f, f.y, f.y + 330, 'background:linear-gradient(rgba(13,14,18,.78), rgba(13,14,18,0))'),
    shade(f, f.y + f.h - 190, f.y + f.h, 'background:linear-gradient(rgba(13,14,18,0), rgba(13,14,18,.86))'),
    ...extra,
    frameOf(W, H, cw),
    { type: 'title', lines: ['LAND OF ASCII'], cw: titleCw, x: W / 2, y: top, anchor: 'center' },
    { type: 'tag', text: tagline, x: W / 2, y: tagY !== null ? tagY : top + 16 * titleCw + 26, anchor: 'center', size: 34, weight: 600, maxW: f.w - 80 },
    footer(W, f.y + f.h - footFromBottom),
  ], path.join(IMG, `${name}.png`));
}

// ---- the scenes ----
const FHD = { w: 1848, h: 936 };                          // a hype image's field
const SCENES = {
  fortNight: { name: 'fort-night', ...FHD, cam: 8, hour: 23.0, closer: 6, pitch: 11 },
  lakeDawn: { name: 'lake-dawn', ...FHD, cam: 1, hour: 6.62, pitch: 2 },
  bridge: { name: 'bridge-evening', ...FHD, cam: 19, hour: 17.3, pitch: 2 },
  greenNoon: { name: 'green-noon', ...FHD, cam: 20, hour: 12.15, closer: 26 },
  pasture: { name: 'pasture', ...FHD, cam: 23, hour: 10.5, turn: -4 },
};

// ======== hype images (1920 x 1080) ========
if (want('keyart')) {
  const pic = await scene(SCENES.fortNight);
  await hype('land-of-ascii-key-art', pic, 'A quiet walk through a land drawn in letters.');
}
if (want('villagers')) {
  // Dunholme at midday: stood between the well and the nearest villager,
  // a moment for them to turn, then a greeting (their line in the game's
  // own speech box)
  const pic = await scene({ name: 'villagers', ...FHD, cam: 13, hour: 12.2, tidy: false, extra: 26,
    setup: () => {
      const L = window.lab; window.__ov.tidy(false, true, true);
      const c = L.cameras[13];
      const ps = L.people.list().filter((p) => !p.hidden && p.role !== 'guard').map((p) => ({ ...p, d: Math.hypot(p.x - c.x, p.z - c.z) })).filter((p) => p.d > 3).sort((x, y) => x.d - y.d);
      // (2.6 m from them, a little round from the well so its post is not in the way)
      const p = ps[0], a = Math.atan2(c.x - p.x, c.z - p.z) + 0.5, x = p.x + Math.sin(a) * 2.6, z = p.z + Math.cos(a) * 2.6;
      L.setFly(false);
      document.documentElement.classList.add('promo-noprompt');
      L.setCamera({ x, z, yaw: Math.atan2(p.x - x, p.z - z) * 180 / Math.PI + 6, pitch: 1 });
      window.__villager = p.name;
    },
    after: () => window.lab.people.greet(),
    afterSteps: 3 });
  await st.eval(() => document.documentElement.classList.remove('promo-noprompt'));
  await hype('land-of-ascii-villagers', pic, 'Everyone here keeps a day of their own.', { footFromBottom: 30 });
}
if (want('sketching')) {
  // six sketches made with K round the land, then the journal open on them
  // (with the regular text size, so the page sits inside the picture)
  const SK = [[1, 6.62, 0], [13, 12.2, 0], [19, 17.3, 0], [8, 23.0, 6], [23, 10.5, 0], [15, 18.35, 0]];
  const pic = await scene({ ...SCENES.pasture, name: 'sketching', h: 936 + 88, tidy: false,
    prep: async () => {
      for (const [cam, hour, closer] of SK) {
        await st.eval(({ cam, hour, closer }) => {
          const L = window.lab, c = L.cameras[cam]; const r = c.yaw * Math.PI / 180;
          const x = c.x + Math.sin(r) * closer, z = c.z + Math.cos(r) * closer;
          L.setFly(true); L.setCamera({ x, z, y: c.y !== undefined && !closer ? c.y : Math.max(L.ground(x, z).ground, L.ground(x, z).surface) + 1.7, yaw: c.yaw, pitch: c.pitch + 2 }); L.setHour(hour);
        }, { cam, hour, closer });
        for (let k = 0; k < 60; k++) { await st.step(1); if (k > 6 && await st.eval(() => window.lab.state().settled)) break; }
        await page.keyboard.press('KeyK');
        await st.step(30);
      }
      await st.eval(() => { const L = window.lab, c = L.cameras[23]; L.setCamera({ x: c.x, z: c.z, y: Math.max(L.ground(c.x, c.z).ground, L.ground(c.x, c.z).surface) + 1.7, yaw: c.yaw - 4, pitch: c.pitch }); L.setHour(10.5); document.documentElement.style.setProperty('--ui-text', '1'); window.__ov.tidy(true, true, true); });
      for (let k = 0; k < 40; k++) await st.step(1);
    },
    after: () => { const L = window.lab; L.progress.journal.open('sketches'); for (const e of document.querySelectorAll('#journal *')) if (e.scrollHeight > e.clientHeight + 4 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; },
    afterSteps: 10 });
  await hype('land-of-ascii-sketching', pic, 'Stop anywhere and sketch the view.', { titleCw: 4, top: 92, tagY: 168, footFromBottom: 34 });
  await st.eval(() => { window.lab.progress.journal.close(); document.documentElement.style.setProperty('--ui-text', '1.3'); });
}
if (want('land')) {
  // four tiles, dawn to night
  const T = { w: 900, h: 280 };
  const tiles = [
    [await scene({ ...SCENES.lakeDawn, ...T, name: 'tile-dawn' }), 'dawn, Still Mere'],
    [await scene({ name: 'tile-noon', ...T, cam: 13, hour: 12.2, pitch: 2 }), 'midday, Dunholme'],
    [await scene({ ...SCENES.bridge, ...T, name: 'tile-evening' }), 'evening, the bridge over the Skell'],
    [await scene({ ...SCENES.fortNight, ...T, name: 'tile-night' }), 'night, the fort'],
  ];
  const W = 1920, H = 1080, cw = 12, f = field(W, H, cw), gx = (f.w - 2 * T.w) / 3, y0 = 290, gy = 26;
  const pieces = [{ type: 'shade', x: f.x, y: f.y, w: f.w, h: f.h, css: 'background:#0f0f12' }];
  tiles.forEach(([src, label], k) => {
    const x = f.x + gx + (k % 2) * (T.w + gx), y = y0 + Math.floor(k / 2) * (T.h + gy + 24);
    pieces.push({ type: 'pic', src, x, y, css: 'border-radius:4px;outline:1px solid #383842;' });
    pieces.push({ type: 'label', text: label, x: x + 2, y: y + T.h + 8, size: 20 });
  });
  pieces.push(frameOf(W, H, cw),
    { type: 'title', lines: ['LAND OF ASCII'], cw: 6, x: W / 2, y: 104, anchor: 'center' },
    { type: 'tag', text: 'Lakes, a fort and three villages, all drawn in letters.', x: W / 2, y: 104 + 96 + 22, anchor: 'center', size: 32, weight: 600, maxW: f.w - 80 },
    footer(W, f.y + f.h - 46, 24));
  await render('land-of-ascii-the-land', W, H, pieces, path.join(IMG, 'land-of-ascii-the-land.png'));
}
if (want('whatsnew')) {
  const pic = await scene({ ...SCENES.lakeDawn, name: 'whatsnew' });
  const W = 1920, H = 1080, cw = 12, f = field(W, H, cw);
  await render('land-of-ascii-whats-new', W, H, [
    { type: 'pic', src: pic, x: f.x, y: f.y },
    shade(f, f.y, f.y + f.h, 'background:linear-gradient(90deg, rgba(13,14,18,.92) 0%, rgba(13,14,18,.86) 40%, rgba(13,14,18,0) 66%)'),
    frameOf(W, H, cw),
    { type: 'badge', text: "WHAT'S NEW IN 0.6", x: 120, y: 150, size: 28 },
    { type: 'title', lines: ['LAND OF ASCII'], cw: 5, x: 120, y: 236 },
    { type: 'list', items: ['A title screen to set out from', 'Share a link to your world, or a spot in it', 'Keys you can change, and larger text', 'Villagers who talk like real people', 'Saves that look after themselves'], x: 120, y: 360, size: 31, maxW: 860 },
    footer(W, f.y + f.h - 54),
  ], path.join(IMG, 'land-of-ascii-whats-new.png'));
}

// ======== the itch.io page set ========
if (want('cover')) {
  // Still Mere at dawn (the fort at night was tried: it goes to a dark block
  // at half size). Rendered a little larger than the field and cropped at
  // 1:1, as a longer lens would.
  const C = { w: 630, h: 500 }, cw = 6, f = field(C.w, C.h, cw);
  const R = { w: 760, h: 560 }, at = { x: 380, y: 300 };
  const pic = await scene({ ...SCENES.lakeDawn, pitch: 6, name: 'cover', ...R });
  await render('cover', C.w, C.h, [
    { type: 'pic', src: pic, x: f.x + f.w / 2 - at.x, y: f.y + f.h / 2 - at.y, clip: f },
    shade(f, f.y, f.y + 240, 'background:linear-gradient(rgba(13,14,18,.78), rgba(13,14,18,0))'),
    frameOf(C.w, C.h, cw),
    { type: 'title', lines: ['LAND OF', 'ASCII'], cw: 5, x: C.w / 2, y: f.y + 16, anchor: 'center' },
  ], path.join(ITCH, 'cover-630x500.png'));
}
if (want('banner')) {
  const B = { w: 960, h: 300 }, cw = 6, f = field(B.w, B.h, cw);
  const R = { w: 1440, h: 720 }, at = { x: 720, y: 380 };
  const pic = await scene({ ...SCENES.lakeDawn, name: 'banner', ...R, pitch: 2 });
  await render('banner', B.w, B.h, [
    { type: 'pic', src: pic, x: f.x + f.w / 2 - at.x, y: f.y + f.h / 2 - at.y, clip: f },
    shade(f, f.y, f.y + f.h, 'background:radial-gradient(ellipse at center, rgba(13,14,18,.7) 0%, rgba(13,14,18,.25) 70%)'),
    frameOf(B.w, B.h, cw),
    { type: 'title', lines: ['LAND OF ASCII'], cw: 5, x: B.w / 2, y: B.h / 2 - 10, anchor: 'center', vanchor: 'middle' },
    { type: 'tag', text: 'A quiet walk through a land drawn in letters.', x: B.w / 2, y: B.h / 2 + 56, anchor: 'center', size: 20, weight: 600 },
  ], path.join(ITCH, 'banner-960x300.png'));
}
if (want('wide')) {
  const Wd = { w: 1920, h: 823 }, cw = 12, f = field(Wd.w, Wd.h, cw);
  const pic = await scene({ ...SCENES.lakeDawn, name: 'wide', w: f.w, h: f.h, pitch: 3 });
  await render('wide', Wd.w, Wd.h, [
    { type: 'pic', src: pic, x: f.x, y: f.y },
    shade(f, f.y, f.y + 300, 'background:linear-gradient(rgba(13,14,18,.72), rgba(13,14,18,0))'),
    shade(f, f.y + f.h - 150, f.y + f.h, 'background:linear-gradient(rgba(13,14,18,0), rgba(13,14,18,.82))'),
    frameOf(Wd.w, Wd.h, cw),
    { type: 'title', lines: ['LAND OF ASCII'], cw: 7, x: Wd.w / 2, y: 104, anchor: 'center' },
    { type: 'tag', text: 'A quiet walk through a land drawn in letters.', x: Wd.w / 2, y: 104 + 112 + 24, anchor: 'center', size: 32, weight: 600 },
    footer(Wd.w, f.y + f.h - 48, 24),
  ], path.join(ITCH, 'wide-cover-1920x823.png'));
}
if (want('tile')) {
  // a background that repeats without a seam: the field of the title
  // screen's frame, the faintest letters on the game's dark
  await card.setViewportSize({ width: 256, height: 256 });
  const buf = await card.evaluate(async () => {
    await document.fonts.load('600 14px "Cascadia Mono"');
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const g = c.getContext('2d'); g.fillStyle = '#0d0e12'; g.fillRect(0, 0, 256, 256);
    g.font = '600 14px "Cascadia Mono"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const hash = (x, y) => { let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
    const ramp = ['.', '.', ':', '+', '=', '#'];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const n = hash(x, y); if (n > 0.16) continue;
      g.fillStyle = n < 0.03 ? 'rgba(255,176,96,0.20)' : 'rgba(220,215,203,0.10)';
      g.fillText(ramp[Math.floor((n / 0.16) * ramp.length)], x * 8 + 4, y * 16 + 8);
    }
    return c.toDataURL('image/png');
  });
  writePng(path.join(ITCH, 'background-tile-256.png'), Buffer.from(buf.split(',')[1], 'base64'));
  report.push({ name: 'tile', file: 'promo/itch/background-tile-256.png', size: '256x256', spills: [] });
}

if (want('gif')) {
  // The animated cover (itch.io plays it when the cover is hovered): the
  // cover's view with its clock running, 12 frames a second for 2.5 s, then
  // the same frames backwards, so the loop has no seam. The frame, the shade
  // and the name are drawn once, on a clear card, and laid over each frame.
  const C = { w: 630, h: 500 }, cw = 6, f = field(C.w, C.h, cw);
  const R = { w: 760, h: 560 }, at = { x: 380, y: 300 };
  const dir = path.join(WORK, 'gif'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await scene({ ...SCENES.lakeDawn, pitch: 6, name: 'gif-first', ...R });
  await st.eval(() => { const L = window.lab; L.runClock(false); L.unfreeze(); });
  for (let k = 0; k < 30; k++) { await st.step(5); writePng(path.join(dir, `f${String(k).padStart(3, '0')}.png`), await st.shot()); }
  await render('gif-overlay', C.w, C.h, [
    shade(f, f.y, f.y + 240, 'background:linear-gradient(rgba(13,14,18,.78), rgba(13,14,18,0))'),
    frameOf(C.w, C.h, cw),
    { type: 'title', lines: ['LAND OF', 'ASCII'], cw: 5, x: C.w / 2, y: f.y + 16, anchor: 'center' },
  ], path.join(dir, 'overlay.png'), { transparent: true });
  const cx = at.x - f.w / 2, cy = at.y - f.h / 2;
  const top = Math.max(0, -f.y), py = Math.max(0, f.y);
  const out = path.join(ITCH, 'cover-animated-630x500.gif');
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '12', '-i', path.join(dir, 'f%03d.png'), '-i', path.join(dir, 'overlay.png'), '-filter_complex',
    `[0]crop=${f.w}:${f.h - top}:${cx}:${cy + top},split[x][y];[y]reverse[r];[x][r]concat=n=2:v=1[p];color=c=0x0d0e12:s=${C.w}x${C.h}:r=12[bg];[bg][p]overlay=${f.x}:${py}:shortest=1[b];[b][1]overlay=0:0,split[a][c];[a]palettegen=max_colors=160:stats_mode=diff[pal];[c][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', out], { encoding: 'utf8' });
  if (r.status) console.log(r.stderr);
  report.push({ name: 'animated cover', file: path.relative(ROOT, out), size: '630x500', spills: [], mb: +(fs.statSync(out).size / 1e6).toFixed(2) });
}

// ======== screenshots: the game as a player sees it (1920 x 1080) ========
const SH = { w: 1920, h: 1080, tidy: false };
const shotTo = async (name, s) => { const data = await scene({ ...SH, ...s, name: `shot-${name}` }); writePng(path.join(SHOTS, `${name}.png`), Buffer.from(data.split(',')[1], 'base64')); report.push({ name: `screenshot ${name}`, file: `promo/itch/screenshots/${name}.png`, size: '1920x1080', spills: [] }); };
if (want('screenshots')) {
  // 1. Rose Cobb meets you on the road with the first favour
  await shotTo('1-meeting-on-the-road', { cam: 0, hour: 14, setup: async () => {
    const L = window.lab, m = L.progress.meet(); window.__ov.tidy(false, true); L.setFly(false);
    L.setHour(m.arrive + 0.001);
    const yaw = m.spot.yaw * 180 / Math.PI, x = m.spot.x + Math.sin(m.spot.yaw) * 2.4, z = m.spot.z + Math.cos(m.spot.yaw) * 2.4;
    L.setCamera({ x, z, yaw: Math.atan2(m.spot.x - x, m.spot.z - z) * 180 / Math.PI, pitch: -2 });
    void yaw;
  }, after: () => window.lab.people.greet(), afterSteps: 3 });
  // 2. the green at dusk, someone to talk to (the prompt)
  await shotTo('2-elmswick-at-dusk', { cam: 15, hour: 18.35, setup: () => { const L = window.lab; window.__ov.tidy(false, true); L.setFly(false); }, extra: 4 });
  // 3. the journal: the places found so far
  await shotTo('3-the-journal', { cam: 13, hour: 16.5, setup: () => { window.__ov.tidy(false, true); }, after: () => { window.lab.progress.journal.open('places'); for (const e of document.querySelectorAll('#journal *')) if (e.scrollTop) e.scrollTop = 0; }, afterSteps: 6 });
  // 4. the map, a good way into a walk: before it, the camera walks the
  // main roads behind a traveller for a day, and the game marks what is
  // seen and walked as it would for a player
  await shotTo('4-the-map', { cam: 0, hour: 15.2, setup: () => { window.__ov.tidy(true, true); window.lab.setFly(false); },
    prep: async () => {
      const who = await st.eval(() => window.lab.people.list().find((p) => p.role === 'traveller').name);
      for (let h = 7; h <= 19; h += 1 / 30) {
        await st.eval(({ h, who }) => { const L = window.lab; L.setHour(h); const p = L.people.list().find((q) => q.name === who); if (p && !p.hidden) L.setCamera({ x: p.x + 1.5, z: p.z, yaw: p.yaw * 180 / Math.PI, pitch: 0 }); }, { h, who });
        await st.step(2);
      }
      await st.eval(() => { const L = window.lab, c = L.cameras[0]; L.setCamera({ x: c.x, z: c.z, yaw: c.yaw, pitch: c.pitch }); L.setHour(15.2); window.__ov.tidy(false, true); });
      await st.step(4);
    },
    after: () => { window.lab.setMap(true); }, afterSteps: 6 });
  // 5. a signpost read on the road
  await shotTo('5-a-signpost', { cam: 0, hour: 11, setup: () => {
    const L = window.lab; window.__ov.tidy(false, true); L.setFly(false);
    const posts = L.signs(); const s = L.state(); const p = posts.map((q) => ({ ...q, d: Math.hypot(q.x - s.x, q.z - s.z) })).sort((x, y) => x.d - y.d)[0];
    L.setCamera({ x: p.x - 2.6, z: p.z - 1.0, yaw: Math.atan2(2.6, 1.0) * 180 / Math.PI, pitch: -3 });
  }, extra: 6 });
  // 6. the sketch viewer
  // (a sketch of Still Mere at dawn, made with K and opened by its number:
  // the journal lists the newest first)
  await shotTo('6-a-sketch', { ...SCENES.lakeDawn, w: 1920, h: 1080, tidy: false, press: 'KeyK', pressSteps: 30, setup: () => { window.__ov.tidy(true, true); },
    after: () => { const L = window.lab; const d = L.progress.journal.data(); const id = Math.max(...d.sketches.map((x) => x.id)); L.progress.journal.open('sketches'); L.progress.journal.view(id); }, afterSteps: 8 });
}

fs.writeFileSync(path.join(WORK, 'report.json'), JSON.stringify(report, null, 1));
console.log(report.map((r) => `${r.size.padEnd(9)} ${r.file}${r.spills.length ? `  SPILLS: ${r.spills.join('; ')}` : ''}`).join('\n'));
console.log('errors', st.errors);
await cardCtx.close();
await st.close();
