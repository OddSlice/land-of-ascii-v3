// Checks that the cell buffer is byte-identical whatever the number of
// render workers, including ?threads=0 (everything on the main thread), in
// the lab's scene, the stress scene and the generated world, for each look
// combination asked for. The generated world is checked twice: served
// cross-origin isolated (shared memory, one shadow worker) and without the
// headers (each worker its own copy), and every page must build the same
// world, byte for byte (lab.worldHash), whether in a worker or on the page.
//   node tools/identity.mjs [--threads 0,1,3,5,8] [--scene lab|stress|both|world|all] [--built]
//                           [--seed N]                the generated world's seed (default: the page's)
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
// The generated world: its eight cameras (found from its data) at their own
// time and at night, and views that test the edges: the open sea from above
// a cliff (it must run to the horizon), the map's edge from outside it, down
// into a river, up at the fort's gate. Phase 2a adds dawn, the night under a
// bright and a dark moon, and the waterline from the beach both ways (one
// of them looks out to sea); the lake's camera sees the backdrop and its
// mirror image in the water.
const WORLD = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((cam) => ({ cam, t: 'day' })),
  { cam: 0, t: 'dusk' }, { cam: 1, t: 'night' }, { cam: 4, t: 'dusk' },
  { site: 'coastUp', t: 'day' }, { site: 'edge', t: 'day' }, { site: 'gate', t: 'night' }, { site: 'river', t: 'day' },
  { cam: 0, t: 'dawn' }, { cam: 0, t: 'night', day: 15 }, { cam: 6, t: 'night' }, { site: 'shoreL', t: 'day' }, { site: 'shoreR', t: 'dusk' },
];
const scenes = {
  lab: [['lab', LAB]], stress: [['stress', STRESS]], both: [['lab', LAB], ['stress', STRESS]],
  world: [['world', WORLD, true], ['world', WORLD, false]],
  all: [['lab', LAB], ['stress', STRESS], ['world', WORLD, true], ['world', WORLD, false]],
}[a.scene || 'both'];

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
const worlds = {};
let bad = 0;
const plain = await serve(undefined, { isolated: false });
try {
  for (const [scene, views, iso = true] of scenes) for (const n of counts) {
    const name = scene === 'world' ? `world (${iso ? 'shared' : 'fallback'})` : scene;
    const lab = await openLab(browser, iso ? url : plain.url, { built: !!a.built, threads: n, scene, seed: a.seed });
    if (scene === 'world') {
      const st = await lab.page.evaluate(() => ({ hash: window.lab.worldHash(), shared: window.lab.shared, threads: window.lab.threads }));
      worlds[`${name} ${n}`] = st;
      if (n > 0 && st.shared !== iso) throw new Error(`${name} with ${n} workers: shared memory ${st.shared ? 'on' : 'off'}`);
    }
    for (const look of looks) {
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const h = await lab.page.evaluate(async ({ v, look }) => {
          const L = window.lab;
          if (L.resetLook) { L.resetLook(); if (look) L.setLook(look); }
          if (v.free) L.setCamera(v.free);
          else if (v.site) {
            const s = L.world.sites, c = L.cameras;
            const coast = c.find((k) => k.name === 'the coast'), riv = c.find((k) => k.name === 'river valley');
            if (v.site === 'coastUp') L.setCamera({ x: coast.x, z: coast.z, y: 80, yaw: coast.yaw, pitch: -8 });
            if (v.site === 'edge') L.setCamera({ x: 1024, z: -150, y: 60, yaw: 10, pitch: -6 });
            if (v.site === 'gate') L.setCamera({ x: s.fort.gate.x + 0.3, z: s.fort.front.z, yaw: s.fort.front.z < s.fort.gate.z ? 0 : 180, pitch: 18 });
            if (v.site === 'river') L.setCamera({ x: riv.x, z: riv.z, yaw: riv.yaw + 70, pitch: -35 });
            if (v.site === 'shoreL' || v.site === 'shoreR') L.setCamera({ x: coast.x, z: coast.z, yaw: coast.yaw + (v.site === 'shoreL' ? -90 : 90), pitch: -14 });
          } else L.camera(v.cam);
          L.freeze(v.t, 12.5, v.day || 0);
          await L.whenIdle();
          return L.cellHash();
        }, { v, look });
        await lab.check();
        (table[`${name} ${i}|${lookName(look)}`] ||= {})[n] = h;
      }
    }
    await lab.ctx.close();
  }
  if (Object.keys(worlds).length) {
    const hs = Object.values(worlds).map((w) => w.hash);
    const same = hs.every((h) => h === hs[0]);
    if (!same) bad++;
    console.log(`world built ${same ? 'byte-identical' : 'DIFFERENTLY'} on every page (worker or page, shared or not): ${Object.entries(worlds).map(([k, w]) => `${k}:${w.hash}`).join(' ')}`);
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
  plain.server.close();
}
process.exit(bad ? 1 : 0);
