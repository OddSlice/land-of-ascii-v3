// Checks that the cell buffer is byte-identical whatever the number of
// render workers, including ?threads=0 (everything on the main thread), in
// the lab's scene and the stress scene, for each look combination asked for.
//   node tools/identity.mjs [--threads 0,1,3,5,8] [--scene lab|stress|both] [--built]
//                           [--look tree=B,cloud=B]   one look (the rest at their defaults)
//                           [--looks all]             every combination of the look candidates
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, parseLook } from './lib/serve.mjs';
import { LOOK } from '../src/look.js';

const a = args();
const counts = String(a.threads || '0,1,3,5,8').split(',').map(Number);
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
const LAB = [
  { cam: 0, t: 'day' }, { cam: 1, t: 'day' }, { cam: 2, t: 'dusk' }, { cam: 3, t: 'night' }, { cam: 4, t: 'dusk' },
  { free: { x: 255, z: 150, yaw: 10, pitch: 35 }, t: 'day' },        // looking up at the wall
  { free: { x: 250, z: 120, yaw: -30, pitch: -40 }, t: 'day' },      // looking down
  { free: { x: 210, z: 240, yaw: 80, pitch: 12 }, t: 'dusk' },       // among the trees
  { cam: 5, t: 'day' },                                               // low over the lake
  { cam: 5, t: 'night' },
  { free: { x: 318, z: 240, yaw: 60, pitch: -20 }, t: 'dusk' },      // looking down into the shallows
  { cam: 6, t: 'day' }, { cam: 7, t: 'day' }, { cam: 8, t: 'day' },   // trees near, middle and far
];
const STRESS = [
  { cam: 0, t: 'day' }, { cam: 1, t: 'day' }, { cam: 2, t: 'day' },
  { cam: 1, t: 'dusk' }, { cam: 1, t: 'night' },                      // the big lake: glitter, torches
  { free: { x: 760, z: 640, yaw: 30, pitch: -25 }, t: 'day' },       // down into the lake from the south shore
  { cam: 0, t: 'night' },
];
const scenes = { lab: [[false, LAB]], stress: [[true, STRESS]], both: [[false, LAB], [true, STRESS]] }[a.scene || 'both'];

// the looks to check
let looks = [null];
if (a.looks === 'all') {
  looks = [{}];
  for (const [name, c] of Object.entries(LOOK.choices)) {
    looks = looks.flatMap((l) => Object.keys(c.options).map((o) => ({ ...l, [name]: o })));
  }
} else if (a.look) looks = [parseLook(a.look)];
const lookName = (l) => (l ? Object.entries(l).map(([k, v]) => `${k}=${v}`).join(',') : 'default');

const table = {};
let bad = 0;
try {
  for (const [stress, views] of scenes) for (const n of counts) {
    const lab = await openLab(browser, url, { built: !!a.built, threads: n, stress });
    for (const look of looks) {
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const h = await lab.page.evaluate(async ({ v, look }) => {
          if (window.lab.resetLook) { window.lab.resetLook(); if (look) window.lab.setLook(look); }
          if (v.free) window.lab.setCamera(v.free); else window.lab.camera(v.cam);
          window.lab.freeze(v.t, 12.5);
          await window.lab.whenIdle();
          return window.lab.cellHash();
        }, { v, look });
        await lab.check();
        (table[`${stress ? 'stress' : 'lab'} ${i}|${lookName(look)}`] ||= {})[n] = h;
      }
    }
    await lab.ctx.close();
  }
  let rows = 0;
  for (const [key, row] of Object.entries(table)) {
    const vals = Object.values(row);
    const same = vals.every((x) => x === vals[0]);
    rows++;
    if (!same) bad++;
    if (!same || looks.length === 1) {
      const [view, look] = key.split('|');
      console.log(`${view}${looks.length > 1 ? ` [${look}]` : ''}: ${same ? 'identical' : 'DIFFERENT'}  ${Object.entries(row).map(([n, h]) => `${n}:${h}`).join(' ')}`);
    }
  }
  console.log(`\n${rows - bad} of ${rows} view-and-look combinations identical across ${counts.join(', ')} workers (${looks.length} look${looks.length > 1 ? 's' : ''})`);
} finally {
  await browser.close();
  server.close();
}
process.exit(bad ? 1 : 0);
