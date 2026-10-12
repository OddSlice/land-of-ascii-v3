// Builds the public lookbooks (the parts of shots/ kept in git), from our own
// frames only (no reference footage, which stays private). Run
// tools/shoot.mjs first.
//   node tools/lookbook.mjs [--built]              docs/phase0a.md: one sheet per camera, and
//                                                  what the glyphs add over flat colour (shots/phase0a/)
//   node tools/lookbook.mjs --phase 0b [--built] [--density 4]   docs/phase0b.md: the lake at day, dusk and night,
//                                                  and the stress scene's cameras (shots/phase0b/)
//   node tools/lookbook.mjs --phase 0c --ref DIR [--built]   docs/phase0c.md: each look candidate at near, middle
//       and far distance, and the three fixes before (the build in DIR, e.g. a copy of phase 0b) and after
//       (shots/phase0c/)
//   node tools/lookbook.mjs --regress [--save] [--built] [--scenes lab,stress,world,yard] [--look cloud=A,...] [--why]
//       the regression lookbook: the fixed cameras (nine in the lab, three in
//       the stress scene, the generated world's twelve for the default seed,
//       phase 3a's building yard's fourteen) at day, dusk and night with every clock frozen and the
//       default look (or --look), compared cell for cell with the saved set
//       in tools/regress/ (--save replaces it). Reports the share of cells
//       that changed in each frame, so a later phase can show it did not
//       disturb the look by accident.
//   node tools/lookbook.mjs --phase 1 [--seeds 3,1,2,4,5] [--built]
//       docs/phase1.md: the overhead map (M) of each seed, and the default
//       seed's eight world cameras at day, dusk and night (shots/phase1/)
//   node tools/lookbook.mjs --phase 2a --ref DIR [--seeds 3,1,2,4,5] [--built]
//       docs/phase2a.md: the spawn, the ridge-top vista, the coast and the
//       main lake at day, dawn, dusk and night under a bright and a dark
//       moon, each beside the same camera in the build in DIR (a copy of
//       phase 1's), and the overhead maps of the seeds (shots/phase2a/)
//   node tools/lookbook.mjs --phase 2b --ref DIR [--built]
//       docs/phase2b.md (shots/phase2b/): the spawn, the main lake, a forest
//       edge and the coast under each kind of weather by day and at night;
//       one view across a whole day of the forecast (seed 3, day 227); the
//       five look fixes before (the build in DIR, a copy of phase 2b before
//       them) and after; the menu's sections, the start card, the hint and
//       the clean screen
//   node tools/lookbook.mjs --phase 3a [--seeds 3,1,2,4,5] [--built] [--only proto,yard,fort,plans]
//       docs/phase3a.md (shots/phase3a/): the two prototypes (spans and exact
//       shapes) near, at middle distance and far; every kit piece in the
//       building yard by day and at night; the fort on each seed from the
//       road, inside the gate passage, the courtyard, the wall walk and
//       across the lake, at day, dusk, night and in rain; and each seed's
//       fort plan, cut through 1.4 m above the yard
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch, workbench, dataURL, writeDataURL } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
if (a.regress) { await regress(); process.exit(process.exitCode || 0); }
if (String(a.phase) === '1') { await phase1(); process.exit(0); }
if (String(a.phase) === '2a') { await phase2a(); process.exit(0); }
if (String(a.phase) === '2b') { await phase2b(); process.exit(0); }
if (String(a.phase) === '3a') { await phase3a(); process.exit(0); }
if (a.phase === '0c') { await phase0c(); process.exit(0); }
const SHOTS = path.join(ROOT, 'shots');
const PHASE = a.phase === '0b' ? '0b' : '0a';
const OUT = path.join(SHOTS, `phase${PHASE}`);
fs.mkdirSync(OUT, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const times = ['day', 'dusk', 'night'];

const { server, url } = await serve();
const browser = await launch('chromium');
try {
  const lab = await openLab(browser, url, { built: !!a.built, density: a.density });
  const { page } = lab;
  await page.evaluate(() => window.lab.setHud(false));
  const cams = await page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
  const bench = await workbench(browser);

  // a sheet: one frame large, then a row of three
  const sheet = (main, row, title, labels) => bench.evaluate(async ({ main, row, title, labels }) => {
    const [M, ...T] = await Promise.all([main, ...row].map(loadImage));
    const W = 1600, pad = 12, top = 30;
    const mh = Math.round(M.height * W / M.width);
    const cw = Math.round((W - 2 * pad) / 3), ch = Math.round(M.height * cw / M.width);
    const c = document.createElement('canvas');
    c.width = W + 2 * pad; c.height = top + mh + pad + ch + 26 + pad;
    const g = c.getContext('2d');
    g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
    g.imageSmoothingQuality = 'high';
    g.drawImage(M, pad, top, W, mh);
    g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
    T.forEach((im, k) => {
      const x = pad + k * (cw + pad);
      g.drawImage(im, x, top + mh + pad, cw, ch);
      g.fillText(labels[k], x, top + mh + pad + ch + 17);
    });
    return c.toDataURL('image/jpeg', 0.86);
  }, { main, row, title, labels });

  // one sheet per camera (phase 0b: the two lake cameras): its own time
  // large, then day, dusk and night
  for (let i = 0; i < cams.length; i++) {
    if (PHASE === '0b' && i !== 2 && i !== 5) continue;
    const c = cams[i];
    const own = (t) => path.join(SHOTS, `${i + 1}-${slug(c.name)}-${t}.png`);
    const jpg = await sheet(dataURL(own(c.time)), times.map((t) => dataURL(own(t))), `${i + 1}. ${c.name} (${c.time})`, times);
    writeDataURL(path.join(OUT, `look-${i + 1}-${slug(c.name)}.jpg`), jpg);
  }

  if (PHASE === '0b') {
    // the stress scene: the lake large, then its three cameras by day
    await lab.ctx.close();
    const st = await openLab(browser, url, { built: !!a.built, stress: true, density: a.density });
    await st.page.evaluate(() => window.lab.setHud(false));
    const names = await st.page.evaluate(() => window.lab.cameras.map((c) => c.name));
    const grab = async (cam, t) => {
      await st.page.evaluate(({ cam, t }) => {
        if (typeof cam === 'number') window.lab.camera(cam); else window.lab.setCamera(cam);
        window.lab.freeze(t, typeof cam === 'number' ? 0 : 3);
      }, { cam, t });
      await st.page.evaluate(() => window.lab.whenIdle());
      await st.check();
      const buf = await (await st.page.$('#view')).screenshot();
      return `data:image/png;base64,${buf.toString('base64')}`;
    };
    const row = [];
    for (let k = 0; k < 3; k++) row.push(await grab(k, 'day'));
    const short = names.map((n) => n.replace(/^stress: /, ''));
    writeDataURL(path.join(OUT, 'stress-cameras.jpg'), await sheet(row[1], row, 'Stress scene: 2048 x 2048 m, 1,500 m view, its three cameras by day', short));
    // a torch on the south shore and its reflection, from just above the water
    const torch = await grab({ x: 720, z: 690, y: 35.8, yaw: 180, pitch: -4 }, 'night');
    const lake = [await grab(1, 'day'), await grab(1, 'dusk'), await grab(1, 'night')];
    writeDataURL(path.join(OUT, 'stress-lake.jpg'), await sheet(torch, lake, `Stress scene at night: a lakeside torch and its reflection; below, ${short[1]}`, times));
  } else {
    // close-ups at 100%: glyphs on and off, at the top density and the lowest
    const crops = [];
    for (const [density, label] of [[3, 'top density, 7 x 14 px cells'], [0, 'lowest density, 13 x 26 px cells']]) {
      for (const glyphs of [true, false]) {
        await page.evaluate(({ density, glyphs }) => { window.lab.setDensity(density); window.lab.camera(1); window.lab.freeze('day', 0); window.lab.setGlyphs(glyphs); }, { density, glyphs });
        await page.evaluate(() => window.lab.whenIdle());
        await lab.check();
        const buf = await (await page.$('#view')).screenshot();
        crops.push({ src: `data:image/png;base64,${buf.toString('base64')}`, label: `${label}, glyphs ${glyphs ? 'on' : 'off (G)'}` });
      }
    }
    await page.evaluate(() => { window.lab.setGlyphs(true); window.lab.setDensity(3); });
    const jpg = await bench.evaluate(async ({ crops }) => {
      const ims = await Promise.all(crops.map((c) => loadImage(c.src)));
      // the same patch of the meadow camera: tree, grass and sky
      const fx = 0.03, fy = 0.24, fw = 0.22, fh = 0.27;
      const pad = 12, top = 30, w = Math.round(ims[0].width * fw), h = Math.round(ims[0].height * fh);
      const c = document.createElement('canvas');
      c.width = pad + 2 * (w + pad); c.height = top + 2 * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText('What the glyphs add: the same patch at 100%, glyphs on and off', pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      ims.forEach((im, k) => {
        const x = pad + (k % 2) * (w + pad), y = top + Math.floor(k / 2) * (h + 26 + pad);
        g.imageSmoothingEnabled = false;
        g.drawImage(im, im.width * fx, im.height * fy, w, h, x, y, w, h);
        g.fillText(crops[k].label, x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.9);
    }, { crops });
    writeDataURL(path.join(OUT, 'glyphs-on-off.jpg'), jpg);
  }
  console.log(fs.readdirSync(OUT).map((f) => `shots/phase${PHASE}/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
} finally {
  await browser.close();
  server.close();
}

// ---- the regression lookbook ------------------------------------------------

async function regress() {
  const DIR = path.join(ROOT, 'tools', 'regress');
  const times = ['day', 'dusk', 'night'];
  const density = Number(a.density || 3);
  const { server, url } = await serve();
  const browser = await launch('chromium');
  const frames = [];
  // (phase 3a: and the building yard)
  const scenes = String(a.scenes || 'lab,stress,world,yard').split(',');
  const look = a.look ? Object.fromEntries(String(a.look).split(',').map((kv) => kv.split('='))) : null;
  const weather = String(a.weather || 'fair');
  try {
    for (const scene of scenes) {
      const lab = await openLab(browser, url, { built: !!a.built, scene, density, threads: 8 });
      const { page } = lab;
      const cams = await page.evaluate(() => window.lab.cameras.map((c) => c.name));
      for (let i = 0; i < cams.length; i++) {
        for (const t of times) {
          const cells = await page.evaluate(async ({ i, t, look, weather }) => {
            const L = window.lab;
            L.resetLook();
            if (look) L.setLook(look);
            // (phase 2b: the weather held at fair, the look before weather)
            if (L.setWeather) L.setWeather(weather);
            L.camera(i); L.freeze(t, 0);
            await L.whenIdle();
            const st = L.state();
            return { cols: st.cols, rows: st.rows, data: Array.from(L.cells()) };
          }, { i, t, look, weather });
          await lab.check();
          frames.push({ name: `${scene} ${i + 1} ${cams[i]} (${t})`, cols: cells.cols, rows: cells.rows, data: Uint8Array.from(cells.data) });
        }
      }
      await lab.ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (a.save) {
    fs.mkdirSync(DIR, { recursive: true });
    let off = 0;
    const index = frames.map((f) => { const e = { name: f.name, cols: f.cols, rows: f.rows, offset: off, length: f.data.length }; off += f.data.length; return e; });
    const all = Buffer.concat(frames.map((f) => Buffer.from(f.data)));
    fs.writeFileSync(path.join(DIR, 'cells.bin.gz'), zlib.gzipSync(all, { level: 9 }));
    fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ saved: new Date().toISOString(), density, frames: index }, null, 1));
    console.log(`saved ${frames.length} frames to tools/regress/ (${(fs.statSync(path.join(DIR, 'cells.bin.gz')).size / 1e6).toFixed(1)} MB)`);
    return;
  }
  const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
  const saved = zlib.gunzipSync(fs.readFileSync(path.join(DIR, 'cells.bin.gz')));
  console.log(`compared with the set saved ${index.saved} (density ${index.density})\n`);
  console.log('| frame | cells changed | visibly changed (glyph, or a colour step over 6 levels) |');
  console.log('|---|---|---|');
  let worst = 0;
  for (const f of frames) {
    const e = index.frames.find((x) => x.name === f.name);
    if (!e || e.cols !== f.cols || e.rows !== f.rows) { console.log(`| ${f.name} | not comparable (no saved frame of this size) | |`); process.exitCode = 1; continue; }
    const old = saved.subarray(e.offset, e.offset + e.length);
    let ch = 0, vis = 0;
    for (let k = 0; k < f.data.length; k += 8) {
      let diff = false, far = f.data[k + 3] !== old[k + 3];
      for (let c = 0; c < 8; c++) if (f.data[k + c] !== old[k + c]) diff = true;
      for (const c of [0, 1, 2, 4, 5, 6]) if (Math.abs(f.data[k + c] - old[k + c]) > 6) far = true;
      if (diff) ch++;
      if (diff && far) vis++;
    }
    const n = f.data.length / 8;
    worst = Math.max(worst, ch / n);
    console.log(`| ${f.name} | ${(100 * ch / n).toFixed(2)}% | ${(100 * vis / n).toFixed(2)}% |`);
  }
  console.log(`\nlargest change: ${(100 * worst).toFixed(2)}% of a frame's cells`);
  if (a.why) await why(frames, index, saved);
}

// (phase 3a) --regress --why: for each world frame that changed, why each
// changed cell did, found in Node from the new world (the default seed): its
// ray passes through the fort's surroundings (the fort, its banks, its new
// road, or where phase 2b's wall stood), or the point it meets lies in the
// shadow the fort casts (or the old wall cast), or it meets water whose
// mirror ray does either. Anything else is unexplained: a change away from
// the fort, which phase 3a must not make.
async function why(frames, index, saved) {
  const { generateWorld, DEFAULT_SEED } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const { createCpuBackend } = await import('../src/scene/cpu/backend.js');
  const { Player } = await import('../src/app/player.js');
  const { HIT_STRIDE, MAT, REC } = await import('../src/contract.js');
  const { sunDir, moonFor } = await import('../src/world/sky.js');
  const { inPoly } = await import('../src/world/gen/fort.js');
  const { LOOK } = await import('../src/look.js');
  const { groundAt } = await import('../src/world/objects.js');
  const g = generateWorld(DEFAULT_SEED); let r; while (!(r = g.next()).done);
  const w = unpackWorld(packWorld(r.value)), f = w.sites.fort;
  // the fort's surroundings: the cleared polygon (the fort, its banks and
  // margin), phase 2b's wall with the ground levelled round it, and the
  // road's changed stretch within 8 m
  const cleared = w.fortDesc.cleared[0];
  const ox0 = Math.round(f.x - 60) - 22, ox1 = ox0 + 164, oz0 = Math.round(f.z - 1) - 22, oz1 = oz0 + 47;
  const rd = w.roads.find((q) => q.to === 'fort');
  // the new road's first stretch, and phase 2b's road ends it replaced; the
  // coarser terrain levels carry a change up to 16 m beyond where it is made
  const roadPts = [...(f.replaced || [])];
  for (let q = 0; q < Math.min(rd.n, f.reach + 60); q++) roadPts.push([rd.x[q], rd.z[q]]);
  const { polyDist } = await import('../src/world/gen/fort.js');
  const top = f.base + 26;
  const inZone = (x, y, z) => {
    if (y > top) return false;
    if (polyDist(cleared, x, z) < 22) return true;
    if (x > ox0 - 16 && x < ox1 + 16 && z > oz0 - 16 && z < oz1 + 16) return true;
    for (const [px, pz] of roadPts) if (Math.abs(px - x) < 24 && Math.abs(pz - z) < 24) return true;
    return false;
  };
  const be = createCpuBackend(w), player = new Player(w, { rules: 'world' });
  console.log('\nwhy the world frames changed (cells; a cell can have more than one reason)\n');
  console.log('| frame | changed | the fort or its surroundings in view | in the fort\'s shadow | in water mirroring either | unexplained |');
  console.log('|---|---|---|---|---|---|');
  let bad = 0;
  for (const fr of frames) {
    if (!fr.name.startsWith('world')) continue;
    const e = index.frames.find((x) => x.name === fr.name);
    if (!e || e.cols !== fr.cols || e.rows !== fr.rows) continue;
    const old = saved.subarray(e.offset, e.offset + e.length);
    const changed = [];
    for (let k = 0, c = 0; k < fr.data.length; k += 8, c++) { for (let q = 0; q < 8; q++) if (fr.data[k + q] !== old[k + q]) { changed.push(c); break; } }
    if (!changed.length) { console.log(`| ${fr.name} | 0 | | | | |`); continue; }
    const m = fr.name.match(/^world (\d+) .* \((day|dusk|night)\)$/), ci = +m[1] - 1, t = m[2];
    const cam0 = w.cameras[ci];
    player.place(cam0.x, cam0.z, cam0.yaw * Math.PI / 180, cam0.pitch * Math.PI / 180, cam0.y !== undefined ? cam0.y - 1.7 : undefined);
    const cols = fr.cols, rows = fr.rows, hits = new Uint8Array(cols * rows * HIT_STRIDE);
    const cam = { x: player.x, z: player.z, y: player.eye, yaw: player.yaw, pitch: player.pitch };
    const fov = LOOK.fovY * Math.PI / 180, hour = LOOK.hours[t];
    const frame = { seq: 1, cam, cols, rows, fovY: fov, aspect: cols / (2 * rows), hour, t: 0, day: 0, look: Object.fromEntries(Object.entries(LOOK.choices).map(([k, c]) => [k, c.default])) };
    for (let k = 0; k < 600; k++) { be.render(frame, 0, cols, hits); if (be.settled) break; }
    const sun = sunDir(hour), L = sun[1] > -0.035 ? sun : moonFor(hour, 0, 'moon');
    const ty = Math.tan(fov / 2), tx = ty * frame.aspect, cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
    let nView = 0, nShadow = 0, nWater = 0, nBad = 0;
    const shadowed = (x, y, z) => { const l = Math.hypot(L[0], L[2]) || 1, el = Math.max(0.035, L[1]); for (let s = 1; s < 1200; s += 1) { const px = x + L[0] / l * s, pz = z + L[2] / l * s, py = y + el / Math.sqrt(1 - el * el) * s; if (py > top) return false; if (inZone(px, py, pz)) return true; } return false; };
    for (const c of changed) {
      const col = c % cols, row = (c - col) / cols, o = c * HIT_STRIDE;
      const X = (2 * (col + 0.5) / cols - 1) * tx, Y = (1 - 2 * (row + 0.5) / rows) * ty;
      const fz = cp - Y * sp, fy = Y * cp + sp, ln = Math.hypot(X, fy, fz);
      const dx = (X * cy0 + fz * sy0) / ln, dz = (-X * sy0 + fz * cy0) / ln, dy = fy / ln;
      const dist = hits[o] === 255 ? 6500 : Math.min(6500, (hits[o + 6] | (hits[o + 7] << 8)) / 10 || 6500);
      let view = false, shadow = false, water = false;
      for (let s = 0; s <= dist + 3 && !view; s += 0.5) if (inZone(cam.x + dx * s, cam.y + dy * s, cam.z + dz * s)) view = true;
      const hx = cam.x + dx * dist, hy = cam.y + dy * dist, hz = cam.z + dz * dist;
      if (!view && dist < 6500) shadow = shadowed(hx, hy, hz);
      if (!view && !shadow && hits[o] === MAT.WATER) { for (let s = 0; s <= 900 && !water; s += 1) { const px = hx + dx * s, py = hy - dy * s, pz = hz + dz * s; if (inZone(px, py, pz) || (s % 4 === 0 && shadowed(px, Math.max(py, groundAt(w.terrain, px, pz)), pz))) water = true; } }
      if (view) nView++; if (shadow) nShadow++; if (water) nWater++;
      if (!view && !shadow && !water) { nBad++; if (a.why === 'list' && nBad <= 12) console.log(`   unexplained: col ${col} row ${row} mat ${hits[o]} dist ${dist.toFixed(1)} at ${hx.toFixed(1)},${hy.toFixed(1)},${hz.toFixed(1)} old ${Array.from(old.subarray(c * 8, c * 8 + 7))} new ${Array.from(fr.data.subarray(c * 8, c * 8 + 7))}`); }
    }
    bad += nBad;
    console.log(`| ${fr.name} | ${changed.length} | ${nView} | ${nShadow} | ${nWater} | ${nBad} |`);
  }
  console.log(`\n${bad ? `${bad} changed cells unexplained` : 'every changed cell is explained by the fort (in view, its shadow or its reflection)'}`);
  if (bad) process.exitCode = 1;
}

// ---- phase 0c: the candidates side by side, and the fixes before and after ----

async function phase0c() {
  const OUT0 = path.join(ROOT, 'shots', 'phase0c');
  fs.mkdirSync(OUT0, { recursive: true });
  const browser = await launch('chromium');
  const servers = [];
  const labs = {};
  // a page per build and scene, opened when first needed
  const labFor = async (root, stress) => {
    const key = `${root}|${stress}`;
    if (!labs[key]) {
      const sv = await serve(root);
      servers.push(sv.server);
      labs[key] = await openLab(browser, sv.url, { built: !!a.built, stress, density: a.density || 3 });
      await labs[key].page.evaluate(() => window.lab.setHud(false));
    }
    return labs[key];
  };
  // one frame: { stress, at: [x, z, yaw, pitch, y?] or cam, time, look }
  const grab = async (root, v) => {
    const lab = await labFor(root, !!v.stress);
    await lab.page.evaluate((v) => {
      const L = window.lab;
      if (L.resetLook) { L.resetLook(); if (v.look) L.setLook(v.look); }
      if (v.cam !== undefined) L.camera(v.cam);
      else L.setCamera({ x: v.at[0], z: v.at[1], yaw: v.at[2], pitch: v.at[3], y: v.at[4] });
      L.freeze(v.time || 'day', 0);
    }, v);
    await lab.page.evaluate(() => window.lab.whenIdle());
    await lab.check();
    const buf = await (await lab.page.$('#view')).screenshot();
    return `data:image/png;base64,${buf.toString('base64')}`;
  };
  const bench = await workbench(browser);
  // a grid of frames: rows (with labels) by columns (with labels); `crop`
  // is an optional [x0, y0, x1, y1] of each frame, as fractions
  const grid = (title, colLabels, rowLabels, cells, crop) => bench.evaluate(async ({ title, colLabels, rowLabels, cells, crop }) => {
    const ims = await Promise.all(cells.flat().map(loadImage));
    const [x0, y0, x1, y1] = crop || [0, 0, 1, 1];
    const sw = ims[0].width * (x1 - x0), sh = ims[0].height * (y1 - y0);
    const nc = colLabels.length, nr = rowLabels.length;
    const cw = Math.round(1560 / nc), ch = Math.round(cw * sh / sw);
    const pad = 10, top = 52, left = 0;
    const c = document.createElement('canvas');
    c.width = left + nc * (cw + pad) + pad; c.height = top + nr * (ch + 26 + pad);
    const g = c.getContext('2d');
    g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
    g.font = '12px Menlo, monospace'; g.fillStyle = '#d0cabd';
    colLabels.forEach((l, k) => g.fillText(l, left + pad + k * (cw + pad), 44));
    g.imageSmoothingQuality = 'high';
    for (let r = 0; r < nr; r++) {
      for (let k = 0; k < nc; k++) {
        const im = ims[r * nc + k], x = left + pad + k * (cw + pad), y = top + r * (ch + 26 + pad);
        g.drawImage(im, im.width * x0, im.height * y0, sw, sh, x, y, cw, ch);
      }
      g.fillStyle = '#b8b2a4'; g.fillText(rowLabels[r], left + pad, top + r * (ch + 26 + pad) + ch + 17);
    }
    return c.toDataURL('image/jpeg', 0.86);
  }, { title, colLabels, rowLabels, cells, crop });
  const save = (name, url) => writeDataURL(path.join(OUT0, name), url);
  try {
    // the candidates: rows near, middle, far; columns the options
    const cand = async (name, title, axis, options, names, rows) => {
      const cells = [];
      for (const r of rows) {
        const row = [];
        for (const o of options) row.push(await grab(ROOT, { ...r.v, look: { ...(r.v.look || {}), [axis]: o } }));
        cells.push(row);
      }
      save(name, await grid(title, options.map((o, k) => `${axis} ${o}: ${names[k]}`), rows.map((r) => r.label), cells, rows[0].crop));
    };
    await cand('clouds.jpg', 'Clouds, treatment A and B: overhead, middle sky, horizon, dusk', 'cloud', ['A', 'B'], ['cumulus', 'banks'], [
      { label: 'overhead', v: { at: [300, 120, 170, 45] } },
      { label: 'middle of the sky', v: { at: [262, 225, -8, 12] } },
      { label: 'to the horizon (stress lake)', v: { stress: true, cam: 1 } },
      { label: 'dusk', v: { at: [182, 112, 58, 2], time: 'dusk' } },
    ]);
    await cand('meadow.jpg', 'Meadow mottling, strengths 0, 1, 2: near, middle, far (day)', 'meadow', [0, 1, 2], ['none (phase 0b)', 'soft patches', 'strong patches'], [
      { label: 'near', v: { at: [262, 200, -8, -14] } },
      { label: 'middle', v: { at: [262, 225, -8, 2] } },
      { label: 'far (stress, ridge-top vista)', v: { stress: true, cam: 2 } },
    ]);
    await cand('shallows.jpg', 'Shallows, warm bed and even blue: near, middle, far (day)', 'shallows', ['warm', 'blue'], ['warm bed (phase 0b)', 'even blue'], [
      { label: 'near: the lake shore', v: { at: [327, 232.5, -12, -7] } },
      { label: 'middle: low over the lake', v: { at: [356, 229.6, 2, -12] } },
      { label: 'far: across the stress lake', v: { stress: true, cam: 1 } },
    ]);
    // the fixes, before (the reference build) and after (this build, default look)
    if (a.ref) {
      const fix = async (name, title, rows, crop) => {
        const cells = [];
        for (const r of rows) cells.push([await grab(a.ref, r.v), await grab(ROOT, r.v)]);
        save(name, await grid(title, ['before (phase 0b)', 'after (phase 0c)'], rows.map((r) => r.label), cells, crop));
      };
      await fix('fix-torches.jpg', 'Fix 1: distant torch flames fade instead of standing out as bright blocks', [
        { label: 'stress, ridge-top vista by day: the river torches', v: { stress: true, cam: 2 } },
        { label: 'stress, across the lake at night', v: { stress: true, cam: 1, time: 'night' } },
        { label: 'lab, the road to the wall by day: the gate torch', v: { at: [252.6, 86, 0, 0] } },
      ]);
      await fix('fix-treelines.jpg', 'Fix 2: far stands keep a jagged top of single tips, then soften into a ragged band', [
        { label: 'stress, across the lake: the far shore (400-600 m), enlarged', v: { stress: true, cam: 1 } },
      ], [0.55, 0.3, 1, 0.5]);
      await fix('fix-treelines-lab.jpg', 'Fix 2: the far-shore stand from the south end of the valley (250 m)', [
        { label: 'lab, far treeline', v: { at: [345, 60, 4, 1] } },
      ]);
      await fix('fix-forest.jpg', 'Fix 3: inside a forest: varied trunks, a canopy with gaps and depth, a shaded forest floor', [
        { label: 'stress, dense forest by day', v: { stress: true, cam: 0 } },
        { label: 'lab, inside the far-shore stand', v: { at: [356, 320, 175, 3] } },
      ]);
    }
  } finally {
    for (const l of Object.values(labs)) await l.ctx.close();
    await browser.close();
    for (const sv of servers) sv.close();
  }
  console.log(fs.readdirSync(OUT0).map((f) => `shots/phase0c/${f} ${(fs.statSync(path.join(OUT0, f)).size / 1024).toFixed(0)} KB`).join('\n'));
}

// ---- phase 1: the generated world's maps and cameras ---------------------------

async function phase1() {
  const OUT = path.join(ROOT, 'shots', 'phase1');
  fs.mkdirSync(OUT, { recursive: true });
  const seeds = String(a.seeds || '3,1,2,4,5').split(',').map(Number);
  const { server, url } = await serve();
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  try {
    const bench = await workbench(browser);
    // compose images in rows of `per`, each with a label, under a title
    const compose = (srcs, labels, title, per, scale = 1) => bench.evaluate(async ({ srcs, labels, title, per, scale }) => {
      const ims = await Promise.all(srcs.map(loadImage));
      const pad = 12, top = 30, w = Math.round(ims[0].width * scale), h = Math.round(ims[0].height * scale);
      const rows = Math.ceil(ims.length / per);
      const c = document.createElement('canvas');
      c.width = pad + per * (w + pad); c.height = top + rows * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      g.imageSmoothingQuality = 'high';
      ims.forEach((im, k) => {
        const x = pad + (k % per) * (w + pad), y = top + Math.floor(k / per) * (h + 26 + pad);
        g.drawImage(im, x, y, w, h);
        g.fillText(labels[k], x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.88);
    }, { srcs, labels, title, per, scale });
    // the maps
    const maps = [];
    for (const seed of seeds) {
      const lab = await openLab(browser, url, { built: !!a.built, scene: 'world', seed, width: 1100, height: 900 });
      await lab.page.evaluate(async () => { window.lab.setHud(false); window.lab.freeze('day', 0); await window.lab.whenIdle(); window.lab.setMap(true); await new Promise((r) => setTimeout(r, 300)); });
      await lab.check();
      const src = await shot(lab.page);
      maps.push(src);
      writeDataURL(path.join(OUT, `map-seed-${seed}.jpg`), await compose([src], [`seed ${seed}${seed === seeds[0] ? ' (the default)' : ''}`], `Overhead map (M), seed ${seed}`, 1, 0.5));
      await lab.ctx.close();
    }
    writeDataURL(path.join(OUT, 'maps.jpg'), await compose(maps, seeds.map((s, k) => `seed ${s}${k === 0 ? ' (the default)' : ''}`), 'Overhead maps (M): # fort site, o village sites, * viewpoints, + spawn, @ you', 3, 0.3));
    // the default seed's cameras at day, dusk and night
    const lab = await openLab(browser, url, { built: !!a.built, scene: 'world', seed: seeds[0] });
    const { page } = lab;
    await page.evaluate(() => window.lab.setHud(false));
    const cams = await page.evaluate(() => window.lab.cameras.map((c) => c.name));
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const days = [];
    for (let i = 0; i < cams.length; i++) {
      const row = [];
      for (const t of ['day', 'dusk', 'night']) {
        await page.evaluate(async ({ i, t }) => { window.lab.camera(i); window.lab.freeze(t, 0); await window.lab.whenIdle(); }, { i, t });
        await lab.check();
        row.push(await shot(page));
      }
      days.push(row[0]);
      writeDataURL(path.join(OUT, `cam-${i + 1}-${slug(cams[i])}.jpg`), await compose(row, ['day (14:00)', 'dusk (17:51)', 'night (23:00)'], `World camera ${i + 1}: ${cams[i]} (seed ${seeds[0]})`, 3, 0.25));
      if (i === 0) writeDataURL(path.join(OUT, 'spawn.jpg'), await compose([row[0]], [`seed ${seeds[0]}, the spawn: the view the page opens on`], 'The first view', 1, 0.5));
    }
    writeDataURL(path.join(OUT, 'cameras-day.jpg'), await compose(days, cams.map((c, i) => `${i + 1} ${c}`), `The eight world cameras by day (seed ${seeds[0]})`, 2, 0.25));
    await lab.ctx.close();
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase1/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    server.close();
  }
}

// ---- phase 2a: before and after, and the maps with their copses -------------

async function phase2a() {
  if (!a.ref) throw new Error('--phase 2a needs --ref DIR (a copy of phase 1, for the frames before)');
  const OUT = path.join(ROOT, 'shots', 'phase2a');
  fs.mkdirSync(OUT, { recursive: true });
  const seeds = String(a.seeds || '3,1,2,4,5').split(',').map(Number);
  const now = await serve(), ref = await serve(a.ref);
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  // the times: [label, hour, day] (phase 1 has no dawn of its own and no moon's
  // phases, so its frames at those times show what it drew then)
  const TIMES = [['day (14:00)', 14, 0], ['dawn (06:09)', 6.15, 0], ['dusk (17:51)', 17.85, 0], ['night (23:00), bright moon (day 0)', 23, 0], ['night (23:00), dark moon (day 15)', 23, 15]];
  const CAMS = [[0, 'spawn view'], [6, 'ridge-top vista'], [5, 'the coast'], [1, 'main lake shore']];
  try {
    const bench = await workbench(browser);
    const compose = (srcs, labels, title, per, scale = 1) => bench.evaluate(async ({ srcs, labels, title, per, scale }) => {
      const ims = await Promise.all(srcs.map(loadImage));
      const pad = 12, top = 30, w = Math.round(ims[0].width * scale), h = Math.round(ims[0].height * scale);
      const rows = Math.ceil(ims.length / per);
      const c = document.createElement('canvas');
      c.width = pad + per * (w + pad); c.height = top + rows * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      g.imageSmoothingQuality = 'high';
      ims.forEach((im, k) => {
        const x = pad + (k % per) * (w + pad), y = top + Math.floor(k / per) * (h + 26 + pad);
        g.drawImage(im, x, y, w, h);
        g.fillText(labels[k], x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.88);
    }, { srcs, labels, title, per, scale });
    // before and after
    const frames = {};
    for (const [tag, srv] of [['before', ref], ['after', now]]) {
      const lab = await openLab(browser, srv.url, { built: !!a.built, scene: 'world', seed: seeds[0] });
      await lab.page.evaluate(() => window.lab.setHud(false));
      for (const [ci] of CAMS) for (const [, hour, day] of TIMES) {
        await lab.page.evaluate(async ({ ci, hour, day }) => { window.lab.camera(ci); window.lab.freeze(hour, 0, day); await window.lab.whenIdle(); }, { ci, hour, day });
        await lab.check();
        frames[`${tag} ${ci} ${hour} ${day}`] = await shot(lab.page);
      }
      await lab.ctx.close();
    }
    const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    for (const [ci, name] of CAMS) {
      const srcs = [], labels = [];
      for (const [label, hour, day] of TIMES) {
        srcs.push(frames[`before ${ci} ${hour} ${day}`], frames[`after ${ci} ${hour} ${day}`]);
        labels.push(`phase 1, ${label}`, `phase 2a, ${label}`);
      }
      writeDataURL(path.join(OUT, `${slug(name)}.jpg`), await compose(srcs, labels, `${name} (seed ${seeds[0]}): phase 1 and phase 2a`, 2, 0.25));
    }
    // the maps (M), with the copses
    const maps = [];
    for (const seed of seeds) {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed, width: 1100, height: 900 });
      await lab.page.evaluate(async () => { window.lab.setHud(false); window.lab.freeze('day', 0); await window.lab.whenIdle(); window.lab.setMap(true); await new Promise((r) => setTimeout(r, 300)); });
      await lab.check();
      const src = await shot(lab.page);
      maps.push(src);
      writeDataURL(path.join(OUT, `map-seed-${seed}.jpg`), await compose([src], [`seed ${seed}${seed === seeds[0] ? ' (the default)' : ''}`], `Overhead map (M), seed ${seed}: the stands and the copses`, 1, 0.5));
      await lab.ctx.close();
    }
    writeDataURL(path.join(OUT, 'maps.jpg'), await compose(maps, seeds.map((s, k) => `seed ${s}${k === 0 ? ' (the default)' : ''}`), 'Overhead maps (M): the copses are the small dark clumps in the open lowland', 3, 0.3));
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase2a/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close(); ref.server.close();
  }
}

// ---- phase 2b: weather, the fixes, the menu --------------------------------------
async function phase2b() {
  const OUT = path.join(ROOT, 'shots', 'phase2b');
  fs.mkdirSync(OUT, { recursive: true });
  const now = await serve(), ref = a.ref ? await serve(a.ref) : null;
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  const pageShot = async (page) => `data:image/png;base64,${(await page.screenshot()).toString('base64')}`;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60 + 1e-6)).padStart(2, '0')}`;
  try {
    const bench = await workbench(browser);
    // a sheet: frames in rows of `per`, each labelled, optionally cropped
    const compose = (srcs, labels, title, per, scale = 1, crop = null, notes = null) => bench.evaluate(async ({ srcs, labels, title, per, scale, crop, notes }) => {
      const ims = await Promise.all(srcs.map(loadImage));
      const im0 = ims[0], cx = crop ? crop[0] * im0.width : 0, cy = crop ? crop[1] * im0.height : 0, cw = crop ? crop[2] * im0.width : im0.width, ch = crop ? crop[3] * im0.height : im0.height;
      const pad = 12, top = notes ? 30 + 17 * notes.length : 30, w = Math.round(cw * scale), h = Math.round(ch * scale);
      const rows = Math.ceil(ims.length / per);
      const c = document.createElement('canvas');
      c.width = pad + per * (w + pad); c.height = top + rows * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      if (notes) notes.forEach((n, k) => g.fillText(n, pad, 40 + 17 * k));
      g.imageSmoothingQuality = 'high';
      ims.forEach((im, k) => {
        const x = pad + (k % per) * (w + pad), y = top + Math.floor(k / per) * (h + 26 + pad);
        g.drawImage(im, cx, cy, cw, ch, x, y, w, h);
        g.fillText(labels[k], x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.88);
    }, { srcs, labels, title, per, scale, crop, notes });

    // 1. the four views under each kind of weather, by day and at night (mist
    // lies only round dawn, so its day frame is at 07:00)
    // (--only menu: part 4 alone)
    if (a.only !== 'menu') {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed: 3 });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const CAMS = [[0, 'spawn view'], [1, 'main lake shore'], [3, 'forest edge across meadow'], [5, 'the coast']];
      const KINDS = ['clear', 'fair', 'overcast', 'rain', 'mist'];
      for (const [ci, name] of CAMS) {
        const srcs = [], labels = [];
        for (const kind of KINDS) {
          for (const [label, hour] of [[kind === 'mist' ? 'morning (07:00)' : 'day (14:00)', kind === 'mist' ? 7 : 14], ['night (23:00, day 0)', 23]]) {
            await lab.page.evaluate(async ({ ci, kind, hour }) => { const L = window.lab; L.setWeather(kind); L.camera(ci); L.freeze(hour, 12.5, 0); await L.whenIdle(); }, { ci, kind, hour });
            await lab.check();
            srcs.push(await shot(lab.page)); labels.push(`${kind}, ${label}`);
          }
        }
        writeDataURL(path.join(OUT, `weather-${slug(name)}.jpg`), await compose(srcs, labels, `${name} (seed 3) under each kind of weather, by day and at night`, 2, 0.25));
      }
      // 2. one view across a whole day of the forecast: seed 3, day 227
      const plan = await lab.page.evaluate(() => { window.lab.setDay(227); return window.lab.weather().forecast; });
      const HOURS = [3, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11, 12, 14, 17.85, 22];
      const srcs = [], labels = [];
      for (const h of HOURS) {
        const w = await lab.page.evaluate(async ({ h }) => { const L = window.lab; L.setWeather('auto'); L.camera(1); L.freeze(h, 12.5, 227); await L.whenIdle(); const w = L.weather(); return { kind: w.kind, mix: w.mix, wet: w.wet }; }, { h });
        await lab.check();
        const mix = Object.entries(w.mix).sort((p, q) => q[1] - p[1]).map(([k, v]) => (v < 0.995 ? `${k} ${Math.round(v * 100)}%` : k)).join(' + ');
        srcs.push(await shot(lab.page)); labels.push(`${hm(h)}  ${mix}${w.wet > 0.02 ? `, ground ${Math.round(w.wet * 100)}% wet` : ''}`);
      }
      const notes = [`the forecast: ${plan.map(([s, e, k]) => `${hm(s)}-${hm(e)} ${k}`).join(', ')}`];
      writeDataURL(path.join(OUT, 'day-227.jpg'), await compose(srcs, labels, 'Main lake shore across day 227 of seed 3, the weather from the forecast', 4, 0.25, null, notes));
      await lab.ctx.close();
    }

    // 3. the five fixes, before (the build in --ref) and after
    if (ref && a.only !== 'menu') {
      const FIX = [
        { file: 'fix-1-dusk-silhouette', title: 'Fix 1: the far range at dusk, a dark silhouette instead of a pale lit face', cam: 0, hour: 'dusk', crop: [0, 0.2, 1, 0.45] },
        { file: 'fix-2-warm-far-rock', title: 'Fix 2: far lit rock stays warm tan (spawn view, 14:00)', cam: 0, hour: 'day', crop: [0, 0.25, 0.7, 0.3] },
        { file: 'fix-3-crest-snow', title: 'Fix 3: no thin line of snow along the crests (near the range, 14:00)', free: { x: 1500, z: 1300, yaw: 45, pitch: 8 }, hour: 'day', crop: [0, 0, 1, 0.6] },
        { file: 'fix-4-dawn-specks', title: 'Fix 4: no specks in the dawn sky (spawn view, 06:09)', cam: 0, hour: 'dawn', crop: [0.2, 0.02, 0.6, 0.4] },
        { file: 'fix-5a-lake-wet-band', title: 'Fix 5: the lake\'s wet band follows how gently the shore slopes (main lake shore, 14:00)', cam: 1, hour: 'day', crop: [0.3, 0.45, 0.7, 0.55] },
        { file: 'fix-5b-coast-camera', title: 'Fix 5: the coast camera chosen by how much sea and land it sees (14:00)', cam: 5, hour: 'day', crop: null },
      ];
      const frames = {};
      for (const [tag, srv] of [['before', ref], ['after', now]]) {
        const lab = await openLab(browser, srv.url, { built: true, scene: 'world', seed: 3 });
        await lab.page.evaluate(() => window.lab.setHud(false));
        for (const f of FIX) {
          await lab.page.evaluate(async (f) => { const L = window.lab; if (L.setWeather) L.setWeather('fair'); if (f.free) L.setCamera(f.free); else L.camera(f.cam); L.freeze(f.hour, 12.5, 0); await L.whenIdle(); }, f);
          await lab.check();
          frames[`${tag} ${f.file}`] = await shot(lab.page);
        }
        await lab.ctx.close();
      }
      for (const f of FIX) writeDataURL(path.join(OUT, `${f.file}.jpg`), await compose([frames[`before ${f.file}`], frames[`after ${f.file}`]], ['before', 'after'], f.title, 2, f.crop ? 0.5 : 0.3, f.crop));
    }

    // 4. the menu: the clean screen, the start card, the hint, each section
    {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed: 3, quiet: false, dpr: 1 });
      const { page } = lab;
      await page.waitForTimeout(400);
      const card = await pageShot(page);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      const hint = await pageShot(page);
      await page.waitForTimeout(4800);
      const clean = await pageShot(page);
      writeDataURL(path.join(OUT, 'screen.jpg'), await compose([card, hint, clean], ['the start card (first visit only)', 'the hint, for four seconds', 'the screen: the compact statistics only'], 'The game screen', 3, 0.42));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
      const secs = [];
      for (const id of ['Controls', 'Display', 'World', 'Advanced']) {
        await page.click(`#menu [role="tab"]:has-text("${id}")`);
        await page.waitForTimeout(700);
        secs.push(await pageShot(page));
      }
      writeDataURL(path.join(OUT, 'menu.jpg'), await compose(secs, ['Controls', 'Display', 'World', 'Advanced'], 'The menu (Esc): its four sections, over the world, dimmed and still drawn', 2, 0.5));
      for (const [k, id] of ['controls', 'display', 'world', 'advanced'].entries()) writeDataURL(path.join(OUT, `menu-${id}.jpg`), await compose([secs[k]], [id], `The menu: ${id}`, 1, 0.75));
      await lab.check();
      await lab.ctx.close();
    }
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase2b/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close(); if (ref) ref.server.close();
  }
}

// ---- phase 3a: the prototypes, the kit, the fort on five seeds, its plans ----------
async function phase3a() {
  const OUT = path.join(ROOT, 'shots', 'phase3a');
  fs.mkdirSync(OUT, { recursive: true });
  const seeds = String(a.seeds || '3,1,2,4,5').split(',').map(Number);
  const only = a.only ? String(a.only).split(',') : ['proto', 'yard', 'fort', 'plans'];
  const now = await serve();
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  try {
    const bench = await workbench(browser);
    const compose = (srcs, labels, title, per, scale = 1, notes = null) => bench.evaluate(async ({ srcs, labels, title, per, scale, notes }) => {
      const ims = await Promise.all(srcs.map(loadImage));
      const pad = 12, top = notes ? 30 + 17 * notes.length : 30, w = Math.round(ims[0].width * scale), h = Math.round(ims[0].height * scale);
      const rows = Math.ceil(ims.length / per);
      const c = document.createElement('canvas');
      c.width = pad + per * (w + pad); c.height = top + rows * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      if (notes) notes.forEach((n, k) => g.fillText(n, pad, 40 + 17 * k));
      g.imageSmoothingQuality = 'high';
      ims.forEach((im, k) => {
        const x = pad + (k % per) * (w + pad), y = top + Math.floor(k / per) * (h + 26 + pad);
        g.drawImage(im, x, y, w, h);
        g.fillText(labels[k], x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.86);
    }, { srcs, labels, title, per, scale, notes });
    const frame = async (lab, set) => {
      await lab.page.evaluate(async (set) => {
        const L = window.lab;
        L.setWeather(set.weather || 'fair');
        if (set.free) L.setCamera(set.free); else L.camera(set.cam);
        L.freeze(set.hour, 12.5, 0);
        await L.whenIdle();
      }, set);
      await lab.check();
      return shot(lab.page);
    };

    // 1. the prototypes: each piece turned and squared to the grid, as spans
    // and as exact shapes, near, at middle distance and far
    if (only.includes('proto')) {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'yard', extra: { proto: 1 } });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
      const at = (rep, piece, dist) => names.indexOf(`prototype, ${rep}: ${piece}, ${dist}`);
      for (const [piece, file] of [['wall', 'wall'], ['tower', 'tower'], ['house', 'house'], ['wall (square)', 'wall-square'], ['tower (square)', 'tower-square'], ['house (square)', 'house-square']]) {
        const srcs = [], labels = [];
        for (const rep of ['spans', 'shapes']) for (const dist of ['near', 'middle', 'far']) {
          srcs.push(await frame(lab, { cam: at(rep, piece, dist), hour: 14 }));
          labels.push(`${rep === 'spans' ? 'spans (1 m columns)' : 'exact shapes'}, ${dist}`);
        }
        writeDataURL(path.join(OUT, `proto-${file}.jpg`), await compose(srcs, labels, `Prototype: the ${piece}${piece.includes('square') ? '' : ', turned 25 degrees'}, spans above and exact shapes below`, 3, 0.2));
      }
      await lab.ctx.close();
    }

    // 2. the building yard: every kit piece by day, and at night
    if (only.includes('yard')) {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'yard' });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const cams = await lab.page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
      const hourOf = { day: 14, dusk: 17.85, night: 23, dawn: 6.15 };
      const srcs = [], labels = [];
      for (let i = 0; i < cams.length; i++) { srcs.push(await frame(lab, { cam: i, hour: hourOf[cams[i].time] })); labels.push(`${i + 1} ${cams[i].name} (${cams[i].time})`); }
      writeDataURL(path.join(OUT, 'yard.jpg'), await compose(srcs, labels, 'The building yard (?yard=1): every piece of the kit, turned 25 degrees', 3, 0.2));
      const NIGHT = [0, 1, 2, 3, 5, 7, 8, 12];
      const nsrcs = [], nlabels = [];
      for (const i of NIGHT) { nsrcs.push(await frame(lab, { cam: i, hour: 23 })); nlabels.push(`${i + 1} ${cams[i].name}, night`); }
      writeDataURL(path.join(OUT, 'yard-night.jpg'), await compose(nsrcs, nlabels, 'The building yard at night (23:00): torches, lit windows, interiors', 3, 0.2));
      await lab.ctx.close();
    }

    // 3. the fort on each seed: five views at day, dusk, night and in rain
    if (only.includes('fort')) {
      const VIEWS = ['the fort from the road', 'inside the gate passage, looking in', 'the courtyard', 'the wall walk over the valley', 'across the lake'];
      const CONDS = [['day (14:00)', 14, 'fair'], ['dusk (17:51)', 17.85, 'fair'], ['night (23:00)', 23, 'fair'], ['rain (14:00)', 14, 'rain']];
      for (const seed of seeds) {
        const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
        await lab.page.evaluate(() => window.lab.setHud(false));
        // across the lake: over the water near its far shore, facing the fort
        const across = await lab.page.evaluate(() => {
          const L = window.lab, f = L.world.sites.fort, k = L.world.sites.lake;
          let dx = k.x - f.x, dz = k.z - f.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
          let r = Math.sqrt(k.area / Math.PI) * 0.8, x = k.x + dx * r, z = k.z + dz * r;
          for (let i = 0; i < 40 && L.ground(x, z).surface > k.level + 0.3; i++) { r *= 0.9; x = k.x + dx * r; z = k.z + dz * r; }
          const y = Math.max(L.ground(x, z).surface, k.level) + 5, d = Math.hypot(f.x - x, f.z - z);
          return { x, z, y, yaw: Math.atan2(f.x - x, f.z - z) * 180 / Math.PI, pitch: Math.atan2(f.base + 5 - y, d) * 180 / Math.PI, d: Math.round(d) };
        });
        const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
        const srcs = [], labels = [];
        for (const v of VIEWS) for (const [label, hour, weather] of CONDS) {
          const set = v === 'across the lake' ? { free: across, hour, weather } : { cam: names.indexOf(v), hour, weather };
          srcs.push(await frame(lab, set));
          labels.push(`${v === 'across the lake' ? `across the lake (${across.d} m)` : v}, ${label}`);
        }
        writeDataURL(path.join(OUT, `fort-seed-${seed}.jpg`), await compose(srcs, labels, `The fort, seed ${seed}: from the road, in the gate passage, the courtyard, the wall walk, across the lake`, 4, 0.2));
        await lab.ctx.close();
      }
    }

    // 4. the plans: each seed's fort cut through 1.4 m above its yard (the
    // walls and towers dark where they stand at that height, lighter the
    // higher they rise), the floors and the ground below shaded by height,
    // the road dashed, the torches orange
    if (only.includes('plans')) {
      const { generateWorld } = await import('../src/world/gen/world.js');
      const { packWorld, unpackWorld } = await import('../src/world/pack.js');
      const { solidAt, supportAt } = await import('../src/world/kit.js');
      const { groundAt } = await import('../src/world/objects.js');
      const { inPoly } = await import('../src/world/gen/fort.js');
      const plans = [], planLabels = [];
      for (const seed of seeds) {
        const g = generateWorld(seed); let r; while (!(r = g.next()).done);
        const w = unpackWorld(packWorld(r.value)), f = w.sites.fort, K = w.kit, base = f.base;
        const span = 110, n = 440, m = span / n;      // 0.25 m a pixel
        const x0 = f.x - span / 2, z1 = f.z + span / 2;
        const rgb = new Uint8Array(n * n * 3), cut = base + 1.4;
        for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
          const x = x0 + (ix + 0.5) * m, z = z1 - (iy + 0.5) * m, o = (iy * n + ix) * 3;
          let c;
          if (solidAt(K, x, cut, z)) {
            const top = supportAt(K, x, z, 1e9), t = Math.max(0, Math.min(1, (top - base) / 14));
            c = [52 + 40 * t, 50 + 38 * t, 56 + 36 * t];
          } else {
            const gy = groundAt(w.terrain, x, z), sy = supportAt(K, x, z, cut), y = Math.max(gy, sy);
            if (sy > gy + 0.05) { const t = Math.max(0, Math.min(1, (y - base) / 2)); c = [176 + 30 * t, 164 + 30 * t, 140 + 30 * t]; }
            else if (inPoly(f.poly, x, z)) c = [150, 128, 96];
            else { const t = Math.max(-1, Math.min(1, (y - base) / 8)); c = t >= 0 ? [96 + 50 * t, 128 + 40 * t, 82 + 40 * t] : [96 + 40 * t, 128 + 40 * t, 82 + 30 * t]; }
          }
          rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
        }
        const rd = w.roads.find((q) => q.to === 'fort');
        const road = []; for (let q = 0; q < rd.n; q++) road.push([(rd.x[q] - x0) / m, (z1 - rd.z[q]) / m]);
        const torches = K.torches.map((t) => [(t.x - x0) / m, (z1 - t.z) / m]);
        const src = await bench.evaluate(({ n, rgb, road, torches }) => {
          const c = document.createElement('canvas'); c.width = n; c.height = n;
          const g = c.getContext('2d'), img = g.createImageData(n, n);
          for (let i = 0; i < n * n; i++) { img.data[i * 4] = rgb[i * 3]; img.data[i * 4 + 1] = rgb[i * 3 + 1]; img.data[i * 4 + 2] = rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
          g.putImageData(img, 0, 0);
          g.strokeStyle = 'rgba(214,190,140,0.75)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath();
          road.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#ffb347'; for (const [x, y] of torches) { g.beginPath(); g.arc(x, y, 2.6, 0, 2 * Math.PI); g.fill(); }
          return c.toDataURL('image/png');
        }, { n, rgb: Array.from(rgb), road, torches });
        const rounds = f.towers.filter((t) => t.round).length;
        const label = `seed ${seed}: ${f.towers.length} towers (${rounds} round), ${f.stairs.length} stairs, ${f.houses.length} timber ${f.houses.length === 1 ? 'house' : 'houses'}, ${K.torches.length} torches; yard ${base.toFixed(1)} m, ground ${f.ground.toFixed(1)} m`;
        plans.push(src); planLabels.push(`seed ${seed}: ${f.towers.length} towers (${rounds} round), ${f.houses.length} ${f.houses.length === 1 ? 'house' : 'houses'}, ${K.torches.length} torches`);
        writeDataURL(path.join(OUT, `plan-seed-${seed}.jpg`), await compose([src], [label], `The fort's plan, seed ${seed}: cut 1.4 m above the yard, north up, ${span} m across`, 1, 1.6));
      }
      writeDataURL(path.join(OUT, 'plans.jpg'), await compose(plans, planLabels, 'The fort plans: walls dark (lighter where higher), floors pale, yard earth, ground shaded by height; road dashed, torches orange', 3, 1));
    }
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase3a/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close();
  }
}
