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
//   node tools/lookbook.mjs --regress [--save] [--built] [--scenes lab,stress,world,yard] [--look cloud=A,...] [--why] [--people off] [--gen off]
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
//   node tools/lookbook.mjs --phase 3a [--seeds 3,1,2,4,5] [--built] [--only yard,fort,plans]
//       docs/phase3a.md (shots/phase3a/): the two prototypes (spans and exact
//       shapes) near, at middle distance and far; every kit piece in the
//       building yard by day and at night; the fort on each seed from the
//       road, inside the gate passage, the courtyard, the wall walk and
//       across the lake, at day, dusk, night and in rain; and each seed's
//       fort plan, cut through 1.4 m above the yard
//   node tools/lookbook.mjs --phase 3b [--seeds 3,1,2,4,5] [--built] [--only yard,villages,plans,bridges,fort]
//       docs/phase3b.md (shots/phase3b/): the village kit in the building
//       yard by day and at night; each village of the default seed from its
//       road, at its centre, inside one of its houses, from across the water
//       or its fields, and at night; the villages' plans on each seed; a
//       timber and a stone bridge from the road and from the bank (day,
//       night, rain); the fort's approach on each seed, from the road and
//       from above
//   node tools/lookbook.mjs --phase 4a [--seed 3] [--built] [--only yard,distance,villages,moments,table]
//       docs/phase4a.md (shots/phase4a/): the figures in the building yard at
//       every distance and pose; one person near, middle and far by day, and
//       with a lantern at night; each village's centre at dawn, midday, dusk
//       and midnight; the wall walk at night, a traveller on the road,
//       someone asleep, a greeting on screen; and three people's day as a
//       table (shots/phase4a/day.md)
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
if (String(a.phase) === '3b') { await phase3b(); process.exit(0); }
if (String(a.phase) === '4a') { await phase4a(); process.exit(0); }
if (String(a.phase) === '4b') { await phase4b(); process.exit(0); }
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
      // (phase 4b: --gen off: no wild ground detail and no animals, phase 4a's world)
      const lab = await openLab(browser, url, { built: !!a.built, scene, density, threads: 8, extra: a.gen === 'off' ? { wild: 0, animals: 0 } : null });
      const { page } = lab;
      const cams = await page.evaluate(() => window.lab.cameras.map((c) => c.name));
      for (let i = 0; i < cams.length; i++) {
        for (const t of times) {
          const cells = await page.evaluate(async ({ i, t, look, weather, people }) => {
            const L = window.lab;
            // (phase 4a: people on, or off with --people off)
            if (L.people) L.people.set(people);
            L.resetLook();
            if (look) L.setLook(look);
            // (phase 2b: the weather held at fair, the look before weather)
            if (L.setWeather) L.setWeather(weather);
            L.camera(i); L.freeze(t, 0);
            await L.whenIdle();
            const st = L.state();
            return { cols: st.cols, rows: st.rows, data: Array.from(L.cells()) };
          }, { i, t, look, weather, people: a.people !== 'off' });
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
  let worst = 0; let compared = 0, same = 0;
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
    compared++; if (!ch) same++;
    console.log(`| ${f.name} | ${(100 * ch / n).toFixed(2)}%${ch ? ` (${ch} cells)` : ''} | ${(100 * vis / n).toFixed(2)}%${vis ? ` (${vis} cells)` : ''} |`);
  }
  console.log(`\nlargest change: ${(100 * worst).toFixed(2)}% of a frame's cells; ${same} of ${compared} comparable frames identical cell for cell`);
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
  // (phase 3b) the villages (within their radius and 20 m), their fields and
  // footpaths, the bridges and the road's 45 m either side of each (lifted,
  // straightened, its banks), each with the 16 m the coarser terrain levels
  // carry a change, up to 30 m above their ground
  const disks = [];
  for (const v of w.sites.villages) {
    const p = v.plan; if (!p) continue;
    disks.push([p.centre.x, p.centre.z, p.radius + 20 + 16, p.centre.y + 30]);
    for (const fl of p.fields || []) disks.push([fl.x, fl.z, Math.hypot(fl.L, fl.W) / 2 + 16, groundAt(w.terrain, fl.x, fl.z) + 30]);
    for (const pa of p.paths || []) for (let q = 0; q < pa.n; q += 4) disks.push([pa.x[q], pa.z[q], 18, groundAt(w.terrain, pa.x[q], pa.z[q]) + 30]);
    if (p.signpost) disks.push([p.signpost.x, p.signpost.z, 18, p.signpost.y + 30]);
  }
  for (const b of w.sites.bridges || []) {
    disks.push([b.x, b.z, b.len / 2 + 16, b.y + 30]);
    const rb = w.roads[b.road];
    if (rb) { let qc = 0, bd = Infinity; for (let q = 0; q < rb.n; q++) { const d = Math.hypot(rb.x[q] - b.x, rb.z[q] - b.z); if (d < bd) { bd = d; qc = q; } } for (let q = Math.max(0, qc - Math.ceil(b.len / 2) - 45); q <= Math.min(rb.n - 1, qc + Math.ceil(b.len / 2) + 45); q += 3) disks.push([rb.x[q], rb.z[q], 20, rb.y[q] + 30]); }
  }
  const ceiling = Math.max(top, ...disks.map((d) => d[3]));
  const inVillage = (x, y, z) => { for (const [cx, cz, rr, yt] of disks) if (y < yt && Math.abs(x - cx) < rr && Math.abs(z - cz) < rr && Math.hypot(x - cx, z - cz) < rr) return true; return false; };
  const inZone = (x, y, z) => {
    if (inVillage(x, y, z)) return true;
    if (y > top) return false;
    if (polyDist(cleared, x, z) < 22) return true;
    if (x > ox0 - 16 && x < ox1 + 16 && z > oz0 - 16 && z < oz1 + 16) return true;
    for (const [px, pz] of roadPts) if (Math.abs(px - x) < 24 && Math.abs(pz - z) < 24) return true;
    return false;
  };
  const be = createCpuBackend(w), player = new Player(w, { rules: 'world' });
  console.log('\nwhy the world frames changed (cells; a cell can have more than one reason)\n');
  console.log('| frame | changed | the fort, a village, a field, a footpath or a bridge (or their surroundings) in view | in their shadow | in water mirroring them | unexplained |');
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
    const shadowed = (x, y, z) => { const l = Math.hypot(L[0], L[2]) || 1, el = Math.max(0.035, L[1]); for (let s = 1; s < 1200; s += 1) { const px = x + L[0] / l * s, pz = z + L[2] / l * s, py = y + el / Math.sqrt(1 - el * el) * s; if (py > ceiling) return false; if (inZone(px, py, pz)) return true; } return false; };
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
  console.log(`\n${bad ? `${bad} changed cells unexplained` : 'every changed cell is explained by the fort, a village, its fields and footpaths or a bridge (in view, their shadow or their reflection)'}`);
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
  const only = a.only ? String(a.only).split(',') : ['yard', 'fort', 'plans'];
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
    // (`zoom`: the middle of the view, that many times over, for a figure far off)
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

    // 1. (the prototypes were removed from the build in phase 3b; their
    // pictures stay in shots/phase3a/)

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


// ---- phase 3b ------------------------------------------------------------------
// A plan of the world round (cx, cz), span metres across, n pixels: the
// kit dark (lighter the higher it stands above the ground), water blue,
// roads and footpaths tan, fields by kind (crop, stubble, fallow), the ground
// green shaded by height; returns the pixels and the torches in pixels.
async function topPlan(w, cx, cz, span, n) {
  const { supportAt } = await import('../src/world/kit.js');
  const { groundAt } = await import('../src/world/objects.js');
  const T = w.terrain, K = w.kit, NN = T.NN, m = span / n, x0 = cx - span / 2, z1 = cz + span / 2;
  const base = groundAt(T, cx, cz), rgb = new Uint8Array(n * n * 3);
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const x = x0 + (ix + 0.5) * m, z = z1 - (iy + 0.5) * m, o = (iy * n + ix) * 3;
    const gy = groundAt(T, x, z), top = supportAt(K, x, z, 1e9), j = Math.round(z) * NN + Math.round(x);
    let c;
    if (top > gy + 0.25) { const t = Math.max(0, Math.min(1, (top - gy) / 9)); c = [70 + 90 * t, 62 + 80 * t, 58 + 70 * t]; }
    else if (T.wWater[j] > 127) c = [64, 104, 150];
    else if (T.wRoad[j] > 127) c = [176, 150, 108];
    else if (T.wPath[j] > 127) c = [196, 176, 132];
    else if (T.wField[j] > 127) c = T.fieldKind[j] === 2 ? [196, 178, 104] : T.fieldKind[j] === 3 ? [128, 98, 70] : [150, 160, 74];
    else { const t = Math.max(-1, Math.min(1, (gy - base) / 20)); c = [88 + 40 * t, 120 + 40 * t, 76 + 30 * t]; }
    rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
  }
  const torches = K.torches.filter((t) => Math.abs(t.x - cx) < span / 2 && Math.abs(t.z - cz) < span / 2).map((t) => [(t.x - x0) / m, (z1 - t.z) / m]);
  return { n, rgb: Array.from(rgb), torches };
}

async function phase3b() {
  const OUT = path.join(ROOT, 'shots', 'phase3b');
  fs.mkdirSync(OUT, { recursive: true });
  const seeds = String(a.seeds || '3,1,2,4,5').split(',').map(Number);
  const only = a.only ? String(a.only).split(',') : ['yard', 'villages', 'plans', 'bridges', 'fort'];
  const { generateWorld } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const { VILLAGE_ROWS } = await import('../src/world/yard.js');
  const worlds = new Map();
  const worldOf = (seed) => {
    if (!worlds.has(seed)) { const g = generateWorld(seed); let r; while (!(r = g.next()).done); worlds.set(seed, unpackWorld(packWorld(r.value))); }
    return worlds.get(seed);
  };
  const now = await serve();
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  const hourOf = { day: 14, dusk: 17.85, night: 23, dawn: 6.15 };
  const deg = (r) => r * 180 / Math.PI;
  const { groundAt } = await import('../src/world/objects.js');
  const groundOf = (w, x, z) => groundAt(w.terrain, x, z);
  const waterOf = (w, x, z) => { const T = w.terrain; return groundAt({ ground: T.levels[0].H, N: T.N, NN: T.NN }, x, z); };
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
      return c.toDataURL('image/jpeg', 0.86);
    }, { srcs, labels, title, per, scale });
    const planImage = (pl) => bench.evaluate(({ n, rgb, torches }) => {
      const c = document.createElement('canvas'); c.width = n; c.height = n;
      const g = c.getContext('2d'), img = g.createImageData(n, n);
      for (let i = 0; i < n * n; i++) { img.data[i * 4] = rgb[i * 3]; img.data[i * 4 + 1] = rgb[i * 3 + 1]; img.data[i * 4 + 2] = rgb[i * 3 + 2]; img.data[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      g.fillStyle = '#ffb347'; for (const [x, y] of torches) { g.beginPath(); g.arc(x, y, 2.4, 0, 2 * Math.PI); g.fill(); }
      return c.toDataURL('image/png');
    }, pl);
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
    // a free camera at (x, z), eye `up` over the ground (or the water), looking at (tx, ty, tz)
    const aim = (w, x, z, up, tx, ty, tz) => {
      const T = w.terrain, j = Math.round(z) * T.NN + Math.round(x);
      const gy = Math.max(groundOf(w, x, z), T.wWater[j] > 127 ? waterOf(w, x, z) : -1e9), y = gy + up;
      return { x, z, y, yaw: deg(Math.atan2(tx - x, tz - z)), pitch: deg(Math.atan2(ty - y, Math.hypot(tx - x, tz - z))) };
    };

    // 1. the village kit in the building yard, by day and at night
    if (only.includes('yard')) {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'yard' });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const cams = await lab.page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
      const mine = cams.map((c, i) => ({ ...c, i })).filter((c) => VILLAGE_ROWS.some((r) => c.name === `${r}, near` || c.name === r) || c.name === 'the village pieces at night');
      const srcs = [], labels = [];
      for (const c of mine) { srcs.push(await frame(lab, { cam: c.i, hour: hourOf[c.time] })); labels.push(`${c.i + 1} ${c.name} (${c.time})`); }
      writeDataURL(path.join(OUT, 'yard.jpg'), await compose(srcs, labels, 'The village kit in the building yard (?yard=1), each piece turned 25 degrees', 3, 0.2));
      const nsrcs = [], nlabels = [];
      for (const c of mine.filter((c) => /^(cottage|hall|chapel|market|jetty|signpost|stone bridge|inside)/.test(c.name))) { nsrcs.push(await frame(lab, { cam: c.i, hour: 23 })); nlabels.push(`${c.i + 1} ${c.name}, night`); }
      writeDataURL(path.join(OUT, 'yard-night.jpg'), await compose(nsrcs, nlabels, 'The village kit at night (23:00): lanterns, hearths, lit windows', 3, 0.2));
      await lab.ctx.close();
    }

    // 2. each village of the default seed: from its road, its centre, inside
    // a house, from across the water or its fields, and at night
    if (only.includes('villages')) {
      const seed = seeds[0], w = worldOf(seed);
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
      for (const [q, v] of w.sites.villages.entries()) {
        const p = v.plan, tag = `village ${q + 1} (${p.pattern})`, c = p.centre;
        const road = names.indexOf(`${tag}, the road in`), centre = names.indexOf(`${tag}, its centre`);
        // inside its first enterable house: just in from the door, looking in
        const e = p.enter[0], ex = e.door[0] - e.x, ez = e.door[1] - e.z, el = Math.hypot(ex, ez);
        const ix = e.x + ex / el * Math.max(0.6, el - 1.1), iz = e.z + ez / el * Math.max(0.6, el - 1.1);
        const inside = { x: ix, z: iz, y: e.floor + 1.6, yaw: deg(Math.atan2(-ex, -ez)), pitch: -8 };
        // across the water (a shore village) or across its farthest field
        let ax, az;
        if (p.pattern === 'shore' && p.shoreFace) { ax = c.x + p.shoreFace[0] * 70; az = c.z + p.shoreFace[1] * 70; }
        else { const f = p.fields.reduce((b, f) => (Math.hypot(f.x - c.x, f.z - c.z) > Math.hypot(b.x - c.x, b.z - c.z) ? f : b), p.fields[0]); const d = Math.hypot(f.x - c.x, f.z - c.z) || 1; ax = c.x + (f.x - c.x) / d * (d + 15); az = c.z + (f.z - c.z) / d * (d + 15); }
        const across = aim(w, ax, az, 4, c.x, c.y + 3, c.z);
        const shots = [
          [{ cam: road, hour: 14 }, 'from its road, day'], [{ cam: centre, hour: 14 }, 'its centre, day'],
          [{ free: inside, hour: 17.85 }, `inside a ${e.kind}, dusk`], [{ free: across, hour: 14 }, `across the ${p.pattern === 'shore' ? 'water' : 'fields'} (${Math.round(Math.hypot(ax - c.x, az - c.z))} m), day`],
          [{ cam: road, hour: 17.85 }, 'from its road, dusk'], [{ cam: road, hour: 23 }, 'from its road, night'],
          [{ cam: centre, hour: 23 }, 'its centre, night'], [{ free: across, hour: 23 }, 'across, night'],
        ];
        const srcs = [], labels = [];
        for (const [set, label] of shots) { srcs.push(await frame(lab, set)); labels.push(label); }
        writeDataURL(path.join(OUT, `village-${q + 1}.jpg`), await compose(srcs, labels, `Village ${q + 1} of seed ${seed}: ${p.pattern}, ${p.houses.length} houses (${p.enter.length} to go into), ${p.barns.length} ${p.barns.length === 1 ? 'barn' : 'barns'}, ${p.fields.length} fields`, 4, 0.2));
      }
      await lab.ctx.close();
    }

    // 3. the villages' plans on each seed, 150 m across
    if (only.includes('plans')) {
      const srcs = [], labels = [];
      for (const seed of seeds) {
        const w = worldOf(seed);
        for (const [q, v] of w.sites.villages.entries()) {
          const p = v.plan;
          srcs.push(await planImage(await topPlan(w, p.centre.x, p.centre.z, 150, 375)));
          labels.push(`seed ${seed}, village ${q + 1}: ${p.pattern}, ${p.houses.length} houses, ${p.fields.length} fields`);
        }
      }
      writeDataURL(path.join(OUT, 'plans.jpg'), await compose(srcs, labels, 'The villages, 150 m across, north up: buildings dark (lighter the taller), fields by kind, roads and footpaths tan, lights orange', 3, 1));
    }

    // 4. a bridge of each kind (the first found on the seeds) from the road and from the bank
    if (only.includes('bridges')) {
      const srcs = [], labels = [];
      for (const style of ['timber', 'stone']) {
        let seed = null, b = null;
        for (const s of seeds) { const w = worldOf(s); b = (w.sites.bridges || []).find((x) => x.style === style); if (b) { seed = s; break; } }
        if (!b) { console.log(`no ${style} bridge on seeds ${seeds}`); continue; }
        const w = worldOf(seed), ux = Math.cos(b.a), uz = Math.sin(b.a);
        const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
        await lab.page.evaluate(() => window.lab.setHud(false));
        const rx = b.x - ux * (b.len / 2 + 14), rz = b.z - uz * (b.len / 2 + 14);
        const fromRoad = { ...aim(w, rx, rz, 1.7, b.x, b.y + 0.6, b.z) };
        // the bank: the first dry spot out to the side, either side
        let bank = null;
        for (const d of [14, 18, 22, 26, 10]) for (const sg of [1, -1]) {
          const x = b.x - uz * d * sg + ux * 4, z = b.z + ux * d * sg + uz * 4, j = Math.round(z) * w.terrain.NN + Math.round(x);
          if (!bank && w.terrain.wWater[j] < 64) bank = aim(w, x, z, 1.7, b.x, b.y - 1, b.z);
        }
        bank = bank || aim(w, b.x - uz * 18, b.z + ux * 18, 3, b.x, b.y, b.z);
        for (const [set, label] of [[{ free: fromRoad, hour: 14 }, 'from the road, day'], [{ free: bank, hour: 14 }, 'from the bank, day'], [{ free: bank, hour: 23 }, 'from the bank, night'], [{ free: bank, hour: 14, weather: 'rain' }, 'from the bank, rain']]) {
          srcs.push(await frame(lab, set)); labels.push(`${style} bridge (seed ${seed}, ${Math.round(b.len)} m), ${label}`);
        }
        await lab.ctx.close();
      }
      writeDataURL(path.join(OUT, 'bridges.jpg'), await compose(srcs, labels, 'The bridges: timber over a narrow crossing, stone with arches over a wide one', 4, 0.2));
    }

    // 5. the fort's approach on each seed: from the road, and from above (260 m across)
    if (only.includes('fort')) {
      const srcs = [], labels = [];
      for (const seed of seeds) {
        const w = worldOf(seed), f = w.sites.fort;
        const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
        await lab.page.evaluate(() => window.lab.setHud(false));
        const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
        srcs.push(await frame(lab, { cam: names.indexOf('road approaching the fort'), hour: 14 })); labels.push(`seed ${seed}: the road approaching the fort`);
        srcs.push(await frame(lab, { cam: names.indexOf('the fort from the road'), hour: 14 })); labels.push(`seed ${seed}: the fort from the road`);
        await lab.ctx.close();
        const pl = await planImage(await topPlan(w, f.x, f.z, 260, 480));
        srcs.push(await bench.evaluate(async ({ src, W, H }) => {
          const im = await loadImage(src), c = document.createElement('canvas'); c.width = W; c.height = H;
          const g = c.getContext('2d'); g.fillStyle = '#121316'; g.fillRect(0, 0, W, H);
          const s = Math.min(W / im.width, H / im.height); g.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
          return c.toDataURL('image/png');
        }, { src: pl, W: 2880, H: 1800 }));
        labels.push(`seed ${seed}: from above, 260 m across, north up`);
      }
      writeDataURL(path.join(OUT, 'fort-approach.jpg'), await compose(srcs, labels, "The fort's new approach on each seed: the winding road", 3, 0.2));
    }
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase3b/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close();
  }
}

// ---- phase 4a: people -----------------------------------------------------------
async function phase4a() {
  const OUT = path.join(ROOT, 'shots', 'phase4a');
  fs.mkdirSync(OUT, { recursive: true });
  const seed = Number(a.seed || 3);
  const only = a.only ? String(a.only).split(',') : ['yard', 'distance', 'villages', 'moments', 'table'];
  const { generateWorld } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const PP = await import('../src/world/people/people.js');
  const { POSE } = await import('../src/world/people/figure.js');
  const g = generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = unpackWorld(packWorld(r.value)), P = PP.buildPeople(w);
  const now = await serve();
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  const hourOf = { day: 14, dusk: 19.2, night: 23, dawn: 6.6, noon: 12.2 };
  const deg = (x) => x * 180 / Math.PI;
  const hm = (h) => { const H = Math.floor(h + 1e-6), M = Math.round((h - H) * 60); return `${String(H % 24).padStart(2, '0')}:${String(M === 60 ? 0 : M).padStart(2, '0')}`; };
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
      return c.toDataURL('image/jpeg', 0.86);
    }, { srcs, labels, title, per, scale });
    // a view: a camera, a free camera, or beside person `who` `dist` metres off; every clock frozen
    const frame = async (lab, set) => {
      await lab.page.evaluate(async (set) => {
        const L = window.lab;
        L.setWeather(set.weather || 'fair');
        // (the camera first: choosing one sets its own hour)
        if (set.free) L.setCamera(set.free); else if (set.cam !== undefined) L.camera(set.cam);
        L.freeze(set.hour, 12.5, set.day || 0);
        await L.whenIdle();
        if (set.who !== undefined) { L.people.goTo(set.who, set.dist); await L.whenIdle(); }
        await L.whenIdle();
      }, set);
      await lab.check();
      if (set.zoom) {
        const el = await lab.page.$('#view'), bb = await el.boundingBox(), cw = bb.width / set.zoom, ch = bb.height / set.zoom;
        return `data:image/png;base64,${(await lab.page.screenshot({ clip: { x: bb.x + (bb.width - cw) / 2, y: bb.y + (bb.height - ch) / 2, width: cw, height: ch } })).toString('base64')}`;
      }
      return shot(lab.page);
    };
    const world = async () => {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
      await lab.page.evaluate(() => window.lab.setHud(false));
      return lab;
    };
    // (a view of person i at an hour from `d` metres: round them from the
    // way they face, the first spot one could stand on, out of the water,
    // with a clear line to their chest; `front`: within 40 degrees of their
    // facing, so they face the camera)
    const { solidAt } = await import('../src/world/kit.js');
    const { groundAt } = await import('../src/world/objects.js');
    const MT = await import('../src/world/people/meet.js');
    const stateOf = (day, hour) => {
      const n = P.persons.length, st = new Float32Array(n * 18), segs = [], along = new Float64Array(n);
      for (let i = 0; i < n; i++) { segs[i] = PP.stateAt(P, i, day, hour, st, i * 18); along[i] = PP.alongOf(P, i, segs[i], hour); }
      MT.adjust(st, n, segs, along, null, P.p);
      return st;
    };
    const viewOf = (i, day, hour, d, front = false) => {
      const st = stateOf(day, hour), o = i * 18, px = st[o], pz = st[o + 1], pf = st[o + 2], yaw = st[o + 3];
      const ty = pf + 1.15, T = w.terrain;
      for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9]) {
        if (front && Math.abs(k) > 2) break;
        const th = yaw + k * 0.35, cx = px + Math.sin(th) * d, cz = pz + Math.cos(th) * d;
        if (cx < 2 || cz < 2 || cx > w.N - 2 || cz > w.N - 2) continue;
        const j = Math.round(cz) * T.NN + Math.round(cx);
        if (T.wWater && T.wWater[j] > 127) continue;
        const ft = P.p.supportAt(cx, cz, groundAt(T, cx, cz) + 0.3);
        if (P.p.blocked(cx, cz, ft)) continue;
        const eye = ft + 1.7;
        let clear = true;
        for (const tyq of [pf + 0.4, ty, pf + 1.6]) for (let q = 1; q < 40 && clear; q++) {
          const f = q / 40, x = cx + (px - cx) * f, z = cz + (pz - cz) * f, y = eye + (tyq - eye) * f;
          if (solidAt(w.kit, x, y, z) || y < groundAt(T, x, z) + 0.05) clear = false;
        }
        if (clear) return { x: cx, z: cz, y: eye, yaw: deg(Math.atan2(px - cx, pz - cz)), pitch: deg(Math.atan2(ty - eye, d)) };
      }
      return null;
    };
    const atHour = (hour, ok) => { const st = new Float32Array(P.persons.length * 18), out = []; for (let i = 0; i < P.persons.length; i++) { const sg = PP.stateAt(P, i, 0, hour, st, i * 18); if (ok(sg, i, st[i * 18 + 5])) out.push(i); } return out; };

    // 1. the figure in the building yard: every pose, near to very far, at night, asleep, on a bench
    if (only.includes('yard')) {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'yard' });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const cams = await lab.page.evaluate(() => window.lab.cameras.map((c, i) => ({ name: c.name, time: c.time, i })));
      const mine = cams.filter((c) => c.name.startsWith('people') || c.name.startsWith('someone'));
      const srcs = [], labels = [];
      for (const c of mine) { srcs.push(await frame(lab, { cam: c.i, hour: hourOf[c.time] })); labels.push(`${c.i + 1} ${c.name}`); }
      writeDataURL(path.join(OUT, 'yard.jpg'), await compose(srcs, labels, 'Figures in the building yard (?yard=1): standing with a hoe, walking with a lantern, at work, fishing, sweeping, a guard with spear and torch, a traveller, bare-headed; seated; asleep', 3, 0.2));
      await lab.ctx.close();
    }

    // 2. one person near, middle and far by day; a walker with a lantern at night
    if (only.includes('distance')) {
      const lab = await world();
      // (someone at work in a field mid-morning: open ground all round)
      const dh = 10.0, day = atHour(dh, (sg) => sg.kind === 'stay' && sg.act === 'working the field')[0];
      // (someone out walking after dusk, a lantern in hand, for a while yet)
      let night, nh;
      for (let h = 18.6; h < 22.5 && night === undefined; h += 0.05) {
        const found = atHour(h, (sg, i, pose) => sg.kind === 'walk' && pose === POSE.WALK && P.persons[i].village !== undefined);
        // (halfway along the walk: home from the fields takes a minute or two)
        if (found.length) { night = found[0]; const sg = PP.segmentAt(PP.planOf(P, night, 0), h); nh = (sg.t0 + sg.t1) / 2; }
      }
      const srcs = [], labels = [];
      const zl = (d) => (d >= 50 ? ' (the middle, three times over)' : '');
      for (const d of [3, 25, 55]) { const v = viewOf(day, 0, dh, d); if (!v) continue; srcs.push(await frame(lab, { hour: dh, free: v, zoom: d >= 50 ? 3 : 0 })); labels.push(`${P.persons[day].name}, ${P.persons[day].label}, at work: ${d} m, ${hm(dh)}${zl(d)}`); }
      if (night !== undefined) for (const d of [3, 25, 55]) { const v = viewOf(night, 0, nh, d); if (!v) continue; srcs.push(await frame(lab, { hour: nh, free: v, zoom: d >= 50 ? 3 : 0 })); labels.push(`${P.persons[night].name}, ${P.persons[night].label}, with a lantern: ${d} m, ${hm(nh)}${zl(d)}`); }
      writeDataURL(path.join(OUT, 'distance.jpg'), await compose(srcs, labels, 'Near (all parts), middle (limbs merged) and far (a two-cell silhouette), by day and at night', 3, 0.2));
      await lab.ctx.close();
    }

    // 3. each village's centre at dawn, midday, dusk and midnight
    if (only.includes('villages')) {
      const lab = await world();
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => c.name));
      const srcs = [], labels = [];
      for (const [q, v] of w.sites.villages.entries()) {
        const cam = names.indexOf(`village ${q + 1} (${v.plan.pattern}), its centre`);
        for (const [t, h] of [['dawn', 6.6], ['midday', 12.2], ['dusk', 19.2], ['midnight', 0.0]]) { srcs.push(await frame(lab, { cam, hour: h })); labels.push(`village ${q + 1} (${v.plan.pattern}), ${t} (${hm(h)})`); }
      }
      const gi = names.findIndex((n) => n.endsWith('at midday'));
      for (const [t, h] of [['dawn', 6.6], ['midday', 12.2], ['dusk', 19.2], ['midnight', 0.0]]) { srcs.push(await frame(lab, { cam: gi, hour: h })); labels.push(`${names[gi].replace(', at midday', '')}, the green, ${t} (${hm(h)})`); }
      writeDataURL(path.join(OUT, 'villages.jpg'), await compose(srcs, labels, `Each village's centre, and the green, at dawn, midday, dusk and midnight (seed ${seed}, day 0, fair)`, 4, 0.16));
      await lab.ctx.close();
    }

    // 4. the wall walk at night, a traveller on the road, someone asleep, a greeting on screen
    if (only.includes('moments')) {
      const lab = await world();
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c) => ({ name: c.name, time: c.time })));
      const srcs = [], labels = [];
      const wi = names.findIndex((c) => c.name.startsWith('the wall walk at night'));
      srcs.push(await frame(lab, { cam: wi, hour: 23 })); labels.push('the wall walk at 23:00, from the courtyard: the watch with torches');
      const ti = names.findIndex((c) => c.name === 'a traveller on the road');
      if (ti >= 0) { srcs.push(await frame(lab, { cam: ti, hour: names[ti].time })); labels.push(`a traveller on the road, ${hm(names[ti].time)}`); }
      // asleep: the first who sleeps in a house one can go into, from just inside its door
      const sl = P.persons.find((q) => q.village !== undefined && P.villages[q.village].houses[q.home].enter);
      if (sl) {
        const H = P.villages[sl.village].houses[sl.home], ins = P.places[H.inside], bed = P.places[H.bed];
        const y = ins.ft + 1.7, d = Math.hypot(bed.x - ins.x, bed.z - ins.z);
        srcs.push(await frame(lab, { hour: 2.0, free: { x: ins.x, z: ins.z, y, yaw: deg(Math.atan2(bed.x - ins.x, bed.z - ins.z)), pitch: deg(Math.atan2(bed.top + 0.2 - y, d)) } }));
        labels.push(`${sl.name} asleep at 02:00, from inside the door`);
      }
      // the greeting: beside someone on the green at midday, E
      const gi = atHour(12.2, (sg) => sg.kind === 'stay' && sg.act === 'talking')[0] ?? atHour(12.2, (sg) => sg.kind === 'stay')[0];
      await frame(lab, { hour: 12.2, free: viewOf(gi, 0, 12.2, 1.6, true) });
      const said = await lab.page.evaluate(async () => { const L = window.lab; L.setQuiet(false); L.setHud(false); const s = L.people.greet(); await new Promise((q) => setTimeout(q, 400)); return s; });
      srcs.push(`data:image/png;base64,${(await lab.page.screenshot()).toString('base64')}`);
      labels.push(said ? `pressing E beside ${said.name}: "${said.text}"` : 'pressing E: nobody to greet');
      await lab.page.evaluate(() => window.lab.setQuiet(true));
      writeDataURL(path.join(OUT, 'moments.jpg'), await compose(srcs, labels, 'The watch at night, a traveller, someone asleep, a greeting', 2, 0.3));
      await lab.ctx.close();
    }

    // 5. three people's day (day 0, the forecast's weather), from their plans:
    // a row wherever one of them starts something, in bold for whoever did
    if (only.includes('table')) {
      const pick = [P.persons.find((q) => q.role === 'farmer'), P.persons.find((q) => q.role === 'guard'), P.persons.find((q) => q.role === 'traveller')].filter(Boolean);
      const plans = pick.map((q) => PP.planOf(P, q.id, 0));
      const WHERE = { bed: 'in bed', sit: 'by the hearth, seated', hearth: 'at the hearth', in: 'indoors', closed: 'indoors', door: 'at the door', field: 'on a strip of the field', fieldgate: 'at the field gate',
        well: 'at the well', green: 'on the green', bench: 'on a bench', shelter: 'under the market shelter', chapel: 'at the chapel door', jetty: 'on the jetty', barn: 'in the barn',
        post: 'at the gate', walk: 'on the wall walk', yard: 'in the yard', hallspot: 'in the keep\'s hall', hall: 'in the keep\'s hall', inner: 'inside the gate', keepdoor: 'at the keep door' };
      const TO = { bed: 'to bed', sit: 'home', hearth: 'home', in: 'home', closed: 'home', door: 'home', field: 'to the field', fieldgate: 'to the field gate', well: 'to the well', green: 'to the green',
        bench: 'to a bench', shelter: 'to the market shelter', chapel: 'to the chapel', jetty: 'to the jetty', barn: 'to the barn', post: 'to the gate', walk: 'up to the wall walk', yard: 'to the yard',
        hallspot: 'to the keep\'s hall', hall: 'to the keep\'s hall', inner: 'to the gate', keepdoor: 'to the keep' };
      const vill = (pl) => (pl.q !== undefined ? ` (village ${pl.q + 1})` : '');
      const what = (sg) => {
        if (sg.kind === 'walk') { const t = P.places[sg.to]; return `walking ${TO[t.kind] || `to the ${t.kind}`}${vill(t)}`; }
        const pl = P.places[sg.at]; return `${sg.act}, ${WHERE[pl.kind] || pl.kind}${vill(pl)}`;
      };
      // a row wherever any of the three starts something
      const times = [...new Set(plans.flatMap((pl) => pl.map((sg) => +sg.t0.toFixed(4))))].sort((x, y) => x - y);
      const lines = ['| from | ' + pick.map((q) => `${q.name}, ${q.label}`).join(' | ') + ' |', '|---|' + pick.map(() => '---|').join('')];
      let prev = null;
      for (const t of times) {
        const cells = plans.map((pl) => { const sg = PP.segmentAt(pl, t + 1e-4); return sg.t0 > t - 1e-3 ? `**${what(sg)}**` : what(sg); });
        const key = cells.join('|').replace(/\*\*/g, '');
        if (key === prev) continue; prev = key;
        lines.push(`| ${hm(t)} | ${cells.join(' | ')} |`);
      }
      fs.writeFileSync(path.join(OUT, 'day.md'), lines.join('\n') + '\n');
      console.log(lines.join('\n'));
    }
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase4a/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close();
  }
}

// ---- phase 4b: animals and wild ground detail --------------------------------
// docs/phase4b.md (shots/phase4b/): each animal near, middle and far in the
// building yard; a flock leaving its fold at dawn and coming back at dusk;
// deer at a forest edge at dawn, and the same spot after walking up; ducks
// and their reflections; gulls on the coast; crows on the wall walk; small
// birds crossing; each kind of ground detail in place and from a viewpoint;
// the overhead maps of five seeds with pastures, folds and where each kind
// lives; and the counts.
async function phase4b() {
  const OUT = path.join(ROOT, 'shots', 'phase4b');
  fs.mkdirSync(OUT, { recursive: true });
  const seed = Number(a.seed || 3);
  const only = a.only ? String(a.only).split(',') : ['yard', 'flock', 'deer', 'water', 'birds', 'ground', 'maps'];
  const { generateWorld } = await import('../src/world/gen/world.js');
  const { packWorld, unpackWorld } = await import('../src/world/pack.js');
  const PP = await import('../src/world/people/people.js');
  const AB = await import('../src/world/animals/build.js');
  const AST = await import('../src/world/animals/state.js');
  const AK = await import('../src/world/animals/kinds.js');
  const { groundAt } = await import('../src/world/objects.js');
  const { solidAt } = await import('../src/world/kit.js');
  const build = (s) => { const g = generateWorld(s); let r; while (!(r = g.next()).done); return unpackWorld(packWorld(r.value)); };
  const w = build(seed), P = PP.buildPeople(w), An = AB.buildAnimals(w, P);
  const now = await serve();
  const browser = await launch('chromium');
  const shot = async (page) => `data:image/png;base64,${(await (await page.$('#view')).screenshot()).toString('base64')}`;
  const deg = (x) => x * 180 / Math.PI;
  const hm = (h) => { const H = Math.floor(h + 1e-6), M = Math.round((h - H) * 60); return `${String(H % 24).padStart(2, '0')}:${String(M === 60 ? 0 : M).padStart(2, '0')}`; };
  // where group g's members are at an hour (nobody near), their middle
  const middle = (g, hour) => {
    const st = new Float32Array(g.members.length * AK.AS), ids = new Int32Array(g.members.length);
    const n = AST.animalsAt(An, 0, hour, [], st, ids, [g]);
    let x = 0, z = 0, y = 0; for (let i = 0; i < n; i++) { x += st[i * AK.AS]; z += st[i * AK.AS + 1]; y += st[i * AK.AS + 2]; }
    return { x: x / n, z: z / n, y: y / n };
  };
  // a free camera `d` metres from c (first toward direction a), `up` metres above the ground, looking at c
  const T = w.terrain;
  const view = (c, d, a0, up = 0, aim = 0.5) => {
    for (let k = 0; k < 24; k++) {
      const b = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12, x = c.x + Math.sin(b) * d, z = c.z + Math.cos(b) * d;
      if (x < 2 || z < 2 || x > w.N - 2 || z > w.N - 2 || T.wWater[Math.round(z) * w.NN + Math.round(x)] > 127) continue;
      const ft = P.p.supportAt(x, z, groundAt(T, x, z) + 0.3);
      if (P.p.blocked(x, z, ft)) continue;
      const y = ft + 1.7 + up;
      // (a clear line to what it looks at: no wall, roof or hill between)
      let clear = true;
      for (let q = 1; q < 48 && clear; q++) {
        const f = q / 48, px = x + (c.x - x) * f, pz = z + (c.z - z) * f, py = y + (c.y + aim - y) * f;
        if ((w.kit && solidAt(w.kit, px, py, pz)) || py < groundAt(T, px, pz)) clear = false;
      }
      if (!clear) continue;
      return { x, z, y, yaw: deg(Math.atan2(c.x - x, c.z - z)), pitch: deg(Math.atan2(c.y + aim - y, Math.hypot(c.x - x, c.z - z))) };
    }
    return null;
  };
  try {
    const bench = await workbench(browser);
    const compose = (srcs, labels, title, per, scale = 1) => bench.evaluate(async ({ srcs, labels, title, per, scale }) => {
      const ims = await Promise.all(srcs.map(loadImage));
      const pad = 12, top = 30, w2 = Math.round(ims[0].width * scale), h = Math.round(ims[0].height * scale);
      const rows = Math.ceil(ims.length / per);
      const c = document.createElement('canvas');
      c.width = pad + per * (w2 + pad); c.height = top + rows * (h + 26 + pad);
      const g = c.getContext('2d');
      g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText(title, pad, 21);
      g.font = '12px Menlo, monospace'; g.fillStyle = '#b8b2a4';
      g.imageSmoothingQuality = 'high';
      ims.forEach((im, k) => {
        const x = pad + (k % per) * (w2 + pad), y = top + Math.floor(k / per) * (h + 26 + pad);
        g.drawImage(im, x, y, w2, h);
        g.fillText(labels[k], x, y + h + 17);
      });
      return c.toDataURL('image/jpeg', 0.86);
    }, { srcs, labels, title, per, scale });
    const frame = async (lab, set) => {
      await lab.page.evaluate(async (set) => {
        const L = window.lab;
        L.setWeather(set.weather || 'fair');
        if (set.free) L.setCamera(set.free); else if (set.cam !== undefined) L.camera(set.cam);
        L.freeze(set.hour, 12.5, set.day || 0);
        await L.whenIdle(); await L.whenIdle();
      }, set);
      await lab.check();
      if (set.zoom) {
        const el = await lab.page.$('#view'), bb = await el.boundingBox(), cw = bb.width / set.zoom, ch = bb.height / set.zoom;
        return `data:image/png;base64,${(await lab.page.screenshot({ clip: { x: bb.x + (bb.width - cw) / 2, y: bb.y + (bb.height - ch) / 2, width: cw, height: ch } })).toString('base64')}`;
      }
      return shot(lab.page);
    };
    const world = async () => {
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'world', seed });
      await lab.page.evaluate(() => window.lab.setHud(false));
      return lab;
    };

    // 1. every kind near, middle and far in the building yard, side on, 14:00
    if (only.includes('yard')) {
      const Y = await import('../src/world/yard.js');
      const st = Y.yardAnimals(), rowsK = new Map();
      for (let o = 0; o < st.length; o += AK.AS) { const k = st[o + AK.A.KIND], e = rowsK.get(k) || { x: 0, z: 0, y: 0, n: 0 }; e.x += st[o]; e.z += st[o + 1]; e.y += st[o + 2]; e.n++; rowsK.set(k, e); }
      const lab = await openLab(browser, now.url, { built: !!a.built, scene: 'yard' });
      await lab.page.evaluate(() => window.lab.setHud(false));
      const srcs = [], labels = [];
      for (const [k, e] of rowsK) {
        const c = { x: e.x / e.n, z: e.z / e.n, y: Y.YARD_GROUND }, flying = k >= AK.KIND.GULL;
        for (const [d, nm] of [[k === AK.KIND.HEN || k === AK.KIND.DUCK || k === AK.KIND.FINCH || k === AK.KIND.HARE ? 5 : 9, 'near'], [25, 'middle'], [70, 'far']]) {
          // (side on, from whichever side has fewer rows between, a little
          // to one side and up, so the rows between pass under the view)
          const sd = k < 5 ? -1 : 1, x = c.x + d * 0.2, z = c.z + sd * d, y = c.y + 1.7 + d * 0.08;
          srcs.push(await frame(lab, { hour: 14, free: { x, z, y, yaw: deg(Math.atan2(c.x - x, c.z - z)), pitch: deg(Math.atan2(c.y + (flying ? 1.4 : 0.5) - y, Math.hypot(c.x - x, c.z - z))) }, zoom: d >= 70 ? 3 : d >= 25 ? 1.5 : 0 }));
          labels.push(`${AK.KIND_NAMES[k]}, ${nm}: ${d} m${d >= 25 ? ` (the middle, ${d >= 70 ? 3 : 1.5} times over)` : ''}`);
        }
      }
      writeDataURL(path.join(OUT, 'yard.jpg'), await compose(srcs, labels, 'Each kind in every pose in the building yard (?yard=1), near, middle and far, 14:00', 3, 0.22));
      // the ground detail in the yard
      const cams = await lab.page.evaluate(() => window.lab.cameras.map((c, i) => ({ name: c.name, time: c.time, i })));
      const s2 = [], l2 = [];
      for (const c of cams.filter((q) => q.name.startsWith('wild') || q.name.startsWith('a log'))) { s2.push(await frame(lab, { cam: c.i, hour: 14 })); l2.push(`${c.i + 1} ${c.name}`); }
      writeDataURL(path.join(OUT, 'yard-ground.jpg'), await compose(s2, l2, 'Wild ground detail in the building yard: three sizes of boulder, an outcrop, a log, two stumps, reed beds in a pond', 3, 0.25));
      await lab.ctx.close();
    }

    // 2. a flock leaving its fold at dawn and coming back at dusk
    if (only.includes('flock')) {
      const g = An.groups.find((q) => q.type === 'flock'), plan = PP.planOf(P, g.shepherd, 0);
      const so = plan.find((sg) => sg.lead === 'out' && sg.t0 > 5), si = [...plan].reverse().find((sg) => sg.lead === 'in' && sg.t0 > 12);
      const F = g.F, gate = P.places[F.gate];
      const ox = gate.x - F.x, oz = gate.z - F.z, ol = Math.hypot(ox, oz) || 1;
      // (out past the gate, a little up, looking back at the fold: the flock
      // comes out toward the camera and goes back in away from it)
      const c = { x: F.x, z: F.z, y: groundAt(T, F.x, F.z) };
      const v = view(c, 22, Math.atan2(ox, oz), 5, 0.3);
      const lab = await world();
      const srcs = [], labels = [];
      const vf = view(c, 18, Math.atan2(ox, oz), 8, 0);
      const follow = (h) => { const m = middle(g, h); return view(m, 14, Math.atan2(m.x - F.x, m.z - F.z) + Math.PI / 2, 3, 0.3); };
      const shots = [['fold', so.t0 - 0.15, 'in the fold'], ['follow', so.t0 + (so.t1 - so.t0) * 0.35, 'going out behind the shepherd'], ['follow', so.t1 + 0.1, 'out on the way to the pasture'],
        ['follow', 10.5, 'grazing on the pasture'], ['follow', 14.5, 'grazing on the pasture'],
        ['follow', si.t0 + (si.t1 - si.t0) * 0.5, 'coming in'], ['follow', si.t1 - 0.02, 'at the gate'], ['fold', si.t1 + 0.3, 'folded for the night']];
      for (const [kind, h, what] of shots) { const vv = kind === 'fold' ? vf : follow(h); if (!vv) continue; srcs.push(await frame(lab, { hour: h, free: vv })); labels.push(`${hm(h)} ${what}`); }
      writeDataURL(path.join(OUT, 'flock.jpg'), await compose(srcs, labels, `A flock of ${g.members.length} and its shepherd: out of the fold after dawn, on the pasture, back in at dusk (seed ${seed}, day 0, village ${g.village + 1})`, 2, 0.32));
      await lab.ctx.close();
    }

    // 3. deer at a forest edge at dawn, and the same spot after walking up
    if (only.includes('deer')) {
      const g = An.groups.find((q) => q.type === 'deer'), c = middle(g, 6.4);
      const out = Math.atan2(g.edge[0] - g.into[0], g.edge[1] - g.into[1]);
      const lab = await world();
      const srcs = [], labels = [];
      for (const d of [45, 30, 17]) {
        const v = view(c, d, out, 0, 0.8);
        if (!v) continue;
        srcs.push(await frame(lab, { hour: 6.4, free: v, zoom: d > 30 ? 2 : 0 })); labels.push(`06:24, from ${d} m${d > 40 ? ' (grazing; the middle, twice over)' : d > 25 ? ' (heads up)' : ' (they run for the trees)'}`);
      }
      // and back off again later: they are back
      const v = view(c, 45, out, 0, 0.8);
      srcs.push(await frame(lab, { hour: 6.9, free: v, zoom: 2 })); labels.push('06:54, from 45 m again: back at the edge (the middle, twice over)');
      writeDataURL(path.join(OUT, 'deer.jpg'), await compose(srcs, labels, `Deer at a forest edge at dawn, walking up to them (seed ${seed}, group of ${g.members.length})`, 2, 0.32));
      await lab.ctx.close();
    }

    // 4. ducks and their reflections; gulls on the coast
    if (only.includes('water')) {
      const lab = await world();
      const srcs = [], labels = [];
      const dk = An.groups.find((q) => q.type === 'ducks');
      const c = middle(dk, 10);
      for (const [h, d] of [[10, 9], [10, 22], [21.2, 9]]) { const cc = h > 20 ? middle(dk, h) : c; const v = view(cc, d, Math.atan2(dk.bank[0] - dk.at[0], dk.bank[1] - dk.at[1]), 0.5, 0.1); if (v) { srcs.push(await frame(lab, { hour: h, free: v })); labels.push(`ducks, ${hm(h)}, ${d} m${h > 20 ? ', tucked on the bank' : ''}`); } }
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c2) => c2.name));
      const gi = names.indexOf('gulls on the coast');
      for (const [h, z] of [[14, 0], [14, 2.5], [23, 2.5]]) { srcs.push(await frame(lab, { cam: gi, hour: h, zoom: z })); labels.push(`gulls on the coast, ${hm(h)}${z ? ', the middle 2.5 times over' : ''}`); }
      writeDataURL(path.join(OUT, 'water.jpg'), await compose(srcs, labels, 'Ducks on a lake with their reflections, and on the bank at night; gulls over the coast and on the beach', 3, 0.25));
      await lab.ctx.close();
    }

    // 5. crows on the wall walk; small birds crossing; the large birds
    if (only.includes('birds')) {
      const lab = await world();
      const srcs = [], labels = [];
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c2) => c2.name));
      const ci = names.indexOf('crows on the wall walk');
      srcs.push(await frame(lab, { cam: ci, hour: 10 })); labels.push('crows on the wall walk, 10:00, from 15 m and more along it (heads up)');
      srcs.push(await frame(lab, { cam: ci, hour: 10, zoom: 3 })); labels.push('the same, the middle three times over: a crow on the parapet at eye height, 25 m');
      // small birds: in the air between copses, the camera under their way
      const fg = An.groups.find((q) => q.type === 'finches');
      let fly = null;
      for (let m = 9 * 60; m < 17 * 60; m += 0.1) {
        const st = new Float32Array(fg.members.length * AK.AS), ids = new Int32Array(fg.members.length);
        const n = AST.animalsAt(An, 0, m / 60, [], st, ids, [fg]);
        let k = 0, x = 0, z = 0, y = 0;
        for (let i = 0; i < n; i++) if (st[i * AK.AS + AK.A.POSE] === AK.APOSE.FLY) { k++; x += st[i * AK.AS]; z += st[i * AK.AS + 1]; y += st[i * AK.AS + 2]; }
        // (the moment the flock is highest over the ground: mid-crossing)
        if (k > n / 2) { const up = y / k - groundAt(T, x / k, z / k); if (!fly || up > fly.up) fly = { hour: m / 60, x: x / k, z: z / k, y: y / k, up }; else if (fly && up < fly.up - 3) break; }
      }
      if (fly) {
        const ft = P.p.supportAt(fly.x + 30, fly.z + 30, groundAt(T, fly.x + 30, fly.z + 30) + 0.3);
        const v = { x: fly.x + 30, z: fly.z + 30, y: ft + 1.7, yaw: deg(Math.atan2(-30, -30)), pitch: deg(Math.atan2(fly.y - ft - 1.7, 42)) };
        srcs.push(await frame(lab, { hour: fly.hour, free: v })); labels.push(`a flock of small birds crossing, ${hm(fly.hour)}, 40 m off`);
        srcs.push(await frame(lab, { hour: fly.hour, free: v, zoom: 3 })); labels.push('the same, the middle three times over: marks of their own glyphs');
      }
      const kg = An.groups.find((q) => q.type === 'kites');
      if (kg) { const ft = groundAt(T, kg.centre[0] + 160, kg.centre[1]); const v = { x: kg.centre[0] + 160, z: kg.centre[1], y: ft + 1.7, yaw: -90, pitch: 30 }; srcs.push(await frame(lab, { hour: 12, free: v })); labels.push('the pair of large birds over the mountains, 12:00, looking up'); }
      writeDataURL(path.join(OUT, 'birds.jpg'), await compose(srcs, labels, 'Crows on the fort\'s wall walk, small birds crossing the sky (marks far off), the large birds soaring', 2, 0.32));
      await lab.ctx.close();
    }

    // 6. each kind of ground detail in place, and from a viewpoint
    if (only.includes('ground')) {
      const pieces = w.kitDesc.pieces, lab = await world();
      const srcs = [], labels = [];
      const near = (kind, pick) => {
        const ps = pieces.filter((q) => q.kind === kind);
        let best = null;
        for (const q of ps) { const k = pick ? pick(q, ps) : 0; if (!best || k > best.k) best = { q, k }; }
        return best && best.q;
      };
      const cluster = (q, ps) => ps.filter((o) => Math.hypot(o.at[0] - q.at[0], o.at[1] - q.at[1]) < 20).length;
      const sets = [
        ['boulder', 'a boulder field', (q, ps) => cluster(q, ps), 14],
        ['boulder', 'a large boulder', (q) => q.h, 7],
        ['outcrop', 'an outcrop on steep meadow', (q) => q.r, 10],
        ['log', 'a fallen log at a forest edge', (q) => q.len, 7],
        ['stump', 'stumps among the trees', (q, ps) => cluster(q, ps), 7],
        ['reeds', 'a reed bed at a lake\'s edge', (q) => q.r, 10],
      ];
      for (const [kind, label, pick, d] of sets) {
        const q = near(kind, pick); if (!q) continue;
        const c = { x: q.at[0], z: q.at[1], y: groundAt(T, q.at[0], q.at[1]) };
        const v = view(c, d, 0.7, 0.6, 0.2);
        if (v) { srcs.push(await frame(lab, { hour: 14, free: v })); labels.push(`${label}, ${d} m`); }
      }
      // a flower drift: the cell of most weight within reach of a road, from 12 m
      let fl = null; const FW = T.wFlower;
      for (let k = 64; k < w.N - 64 && FW; k += 8) for (let i = 64; i < w.N - 64; i += 8) { const j = k * w.NN + i; if (FW[j] > 200 && (!fl || FW[j] > fl.w)) fl = { w: FW[j], x: i, z: k }; }
      if (fl) { const c = { x: fl.x, z: fl.z, y: groundAt(T, fl.x, fl.z) }; const v = view(c, 12, 0.4, 0.3, 0); if (v) { srcs.push(await frame(lab, { hour: 14, free: v })); labels.push('a drift of flowers in the meadow, 12 m'); } }
      // from the viewpoints: the vista and the spawn
      const names = await lab.page.evaluate(() => window.lab.cameras.map((c2) => c2.name));
      for (const nm of ['the ridge-top vista', 'spawn']) { const ci = names.findIndex((n) => n.includes(nm)); if (ci >= 0) { srcs.push(await frame(lab, { cam: ci, hour: 14 })); labels.push(`${names[ci]}, 14:00`); } }
      writeDataURL(path.join(OUT, 'ground.jpg'), await compose(srcs, labels, `Wild ground detail in place (seed ${seed}, 14:00): boulders, an outcrop, a log, stumps, reeds, flowers, and from the viewpoints`, 3, 0.25));
      await lab.ctx.close();
    }

    // 7. the overhead maps of five seeds: water, forest, roads, fields and
    // pastures, folds, and where each kind of animal lives
    if (only.includes('maps')) {
      const seeds = String(a.seeds || '3,1,2,4,5').split(',').map(Number);
      const rows = [];
      for (const s of seeds) {
        const ws = s === seed ? w : build(s), Ps = s === seed ? P : PP.buildPeople(ws), As = s === seed ? An : AB.buildAnimals(ws, Ps), Ts = ws.terrain;
        const S = 512, f = ws.N / S, cls = new Uint8Array(S * S);
        // 0 meadow, 1 water, 2 road, 3 field, 4 pasture, 5 forest, 6 flowers, 7 rock, 8 sand, 9 snow
        const tc = new Uint16Array(S * S); for (const t of ws.objects.trees) { const i = Math.min(S - 1, Math.floor(t.x / f)), k = Math.min(S - 1, Math.floor(t.z / f)); tc[k * S + i]++; }
        for (let k = 0; k < S; k++) for (let i = 0; i < S; i++) {
          const j = Math.round(k * f) * ws.NN + Math.round(i * f);
          cls[k * S + i] = Ts.wWater[j] > 127 ? 1 : Ts.wRoad[j] > 127 ? 2 : Ts.fieldId && Ts.fieldId[j] ? (Ts.fieldKind[j] === 4 ? 4 : 3) : tc[k * S + i] >= 2 ? 5 : Ts.wFlower && Ts.wFlower[j] > 127 ? 6 : Ts.wSnow[j] > 127 ? 9 : Ts.wRock[j] > 127 ? 7 : Ts.wSand[j] > 127 ? 8 : 0;
        }
        const marks = [];
        for (const V of Ps.villages) for (const F of V.folds) marks.push({ t: 'fold', x: F.x / f, z: F.z / f });
        for (const g of As.groups) marks.push({ t: g.type, x: g.home[0] / f, z: g.home[1] / f });
        for (const p of ws.kitDesc.pieces) if (p.kind === 'boulder' || p.kind === 'reeds' || p.kind === 'log') marks.push({ t: p.kind, x: p.at[0] / f, z: p.at[1] / f });
        rows.push({ seed: s, S, cls: Array.from(cls), marks, counts: As.count });
      }
      const png = await bench.evaluate(async ({ rows }) => {
        const COL = ['#5d7040', '#4f6f93', '#a08a62', '#9c8a4c', '#8aa05a', '#26402c', '#a9a35a', '#7a7672', '#b9a77c', '#dcdcd6'];
        const MK = { fold: ['#f2e6c8', 3, 's'], flock: ['#ffffff', 3, 'c'], herd: ['#7a4a32', 4, 'c'], hens: ['#c25a2e', 2, 'c'], dog: ['#3a2a20', 2, 'c'], deer: ['#d08a3c', 4, 'c'], hare: ['#e0c090', 2, 'c'], ducks: ['#2f6a3a', 3, 'c'], gulls: ['#ffffff', 3, 't'], crow: ['#111111', 3, 't'], finches: ['#c8a040', 3, 't'], kites: ['#ff3020', 5, 't'], boulder: ['#cfcac2', 1, 'p'], reeds: ['#d4d080', 1, 'p'], log: ['#6a4a30', 1, 'p'] };
        const W = 512, pad = 14, top = 30, cap = 70;
        const c = document.createElement('canvas'); c.width = pad + rows.length * (W + pad); c.height = top + W + cap;
        const g = c.getContext('2d'); g.fillStyle = '#121316'; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#e8e2d4'; g.font = 'bold 15px Menlo, monospace'; g.fillText('Overhead maps: fields (ochre) and pastures (light green), folds (squares), and where each kind lives (dots and triangles)', pad, 21);
        rows.forEach((r, n) => {
          const x0 = pad + n * (W + pad), img = g.createImageData(r.S, r.S);
          for (let k = 0; k < r.S * r.S; k++) { const h = COL[r.cls[k]]; img.data[k * 4] = parseInt(h.slice(1, 3), 16); img.data[k * 4 + 1] = parseInt(h.slice(3, 5), 16); img.data[k * 4 + 2] = parseInt(h.slice(5, 7), 16); img.data[k * 4 + 3] = 255; }
          g.putImageData(img, x0, top);
          for (const m of r.marks) {
            const [col, sz, shp] = MK[m.t] || ['#f0f', 2, 'c']; g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 0.6;
            const x = x0 + m.x, y = top + m.z;
            if (shp === 'p') { g.fillRect(x, y, 1, 1); continue; }
            g.beginPath();
            if (shp === 's') g.rect(x - sz, y - sz, sz * 2, sz * 2); else if (shp === 't') { g.moveTo(x, y - sz); g.lineTo(x + sz, y + sz); g.lineTo(x - sz, y + sz); g.closePath(); } else g.arc(x, y, sz, 0, Math.PI * 2);
            g.fill(); g.stroke();
          }
          g.fillStyle = '#e8e2d4'; g.font = '12px Menlo, monospace';
          g.fillText(`seed ${r.seed}`, x0, top + W + 16);
          const names = ['sheep', 'cattle', 'hens', 'dogs', 'deer', 'hares', 'ducks', 'gulls', 'crows', 'small birds', 'large birds'];
          const txt = names.map((nm, k) => `${r.counts[k] || 0} ${nm}`);
          g.fillStyle = '#b8b2a4'; g.fillText(txt.slice(0, 6).join(', '), x0, top + W + 32); g.fillText(txt.slice(6).join(', '), x0, top + W + 48);
        });
        return c.toDataURL('image/jpeg', 0.88);
      }, { rows });
      writeDataURL(path.join(OUT, 'maps.jpg'), png);
    }
    console.log(fs.readdirSync(OUT).map((f) => `shots/phase4b/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`).join('\n'));
  } finally {
    await browser.close();
    now.server.close();
  }
}
