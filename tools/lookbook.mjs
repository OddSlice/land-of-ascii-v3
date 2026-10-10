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
//   node tools/lookbook.mjs --regress [--save] [--built] [--scenes lab,stress,world] [--look tree=A,...]
//       the regression lookbook: the twenty fixed cameras (nine in the lab,
//       three in the stress scene, the generated world's eight for the
//       default seed) at day, dusk and night with every clock frozen and the
//       default look (or --look), compared cell for cell with the saved set
//       in tools/regress/ (--save replaces it). Reports the share of cells
//       that changed in each frame, so a later phase can show it did not
//       disturb the look by accident.
//   node tools/lookbook.mjs --phase 1 [--seeds 3,1,2,4,5] [--built]
//       docs/phase1.md: the overhead map (M) of each seed, and the default
//       seed's eight world cameras at day, dusk and night (shots/phase1/)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch, workbench, dataURL, writeDataURL } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';

const a = args();
if (a.regress) { await regress(); process.exit(process.exitCode || 0); }
if (String(a.phase) === '1') { await phase1(); process.exit(0); }
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
  const scenes = String(a.scenes || 'lab,stress,world').split(',');
  const look = a.look ? Object.fromEntries(String(a.look).split(',').map((kv) => kv.split('='))) : null;
  try {
    for (const scene of scenes) {
      const lab = await openLab(browser, url, { built: !!a.built, scene, density, threads: 8 });
      const { page } = lab;
      const cams = await page.evaluate(() => window.lab.cameras.map((c) => c.name));
      for (let i = 0; i < cams.length; i++) {
        for (const t of times) {
          const cells = await page.evaluate(async ({ i, t, look }) => {
            const L = window.lab;
            L.resetLook();
            if (look) L.setLook(look);
            L.camera(i); L.freeze(t, 0);
            await L.whenIdle();
            const st = L.state();
            return { cols: st.cols, rows: st.rows, data: Array.from(L.cells()) };
          }, { i, t, look });
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
    await cand('trees.jpg', 'Conifers, treatment A and B: near, middle, far (day)', 'tree', ['A', 'B'], ['tidy tiers', 'rough and dark'], [
      { label: 'near: inside the far-shore stand, looking out', v: { at: [356, 320, 175, 3] } },
      { label: 'middle: a stand edge across the meadow (50-90 m)', v: { at: [276, 248, -97, 1] } },
      { label: 'far: the far-shore stand from the south end (250 m)', v: { at: [345, 60, 4, 1] } },
      { label: 'stress: in the dense forest', v: { stress: true, cam: 0 } },
    ]);
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
