// Checks that the cell buffer is byte-identical whatever the number of
// render workers, including ?threads=0 (everything on the main thread), in
// the lab's scene, the stress scene, the building yard and the generated
// world. The generated world is
// checked twice: served cross-origin isolated (shared memory, one shadow
// worker) and without the headers (each worker its own copy), and every
// page must build the same world, byte for byte (lab.worldHash), whether in
// a worker or on the page.
//   node tools/identity.mjs [--threads 0,1,3,5,8] [--scene lab|stress|both|yard|world|all] [--built]
//                           [--seed N]                the generated world's seed (default: the page's)
//                           [--weather all]           (phase 2b) every view under each kind of
//                                                     weather held (or a list: rain,mist); the
//                                                     world gains the lake and the river at dawn,
//                                                     where the mist lies; the default is fair
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const counts = String(a.threads || '0,1,3,5,8').split(',').map(Number);
// (--root DIR: a copy of a build to check, so the repository can change meanwhile)
const { server, url } = await serve(a.root);
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
// The generated world: its first eight cameras (found from its data) at their own
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
  // (phase 3a) the fort's four cameras, by day, and the passage and the
  // courtyard at night (torches, lit windows), the wall walk at dusk
  ...[8, 9, 10, 11].map((cam) => ({ cam, t: 'day' })),
  { cam: 9, t: 'night' }, { cam: 10, t: 'night' }, { cam: 11, t: 'dusk' }, { cam: 8, t: 'night' },
  // (phase 3b) the new cameras: each village's road in and centre, inside a
  // house, a bridge, by day; the centres, the house and the bridge at night
  ...[12, 13, 14, 15, 16, 17, 18, 19].map((cam) => ({ cam, t: 'day' })),
  { cam: 13, t: 'night' }, { cam: 15, t: 'night' }, { cam: 17, t: 'night' }, { cam: 18, t: 'night' }, { cam: 19, t: 'night' }, { cam: 12, t: 'dusk' },
  // (phase 4a) views full of people: the green at midday, at dawn and at
  // dusk (lanterns), the wall walk at night from the courtyard (torches), a
  // traveller on the road at their own hour; each village's centre at
  // midday, and one in the evening
  ...[20, 21, 22].map((cam) => ({ cam, t: 'own' })), { cam: 20, t: 6.6 }, { cam: 20, t: 19.2 },
  { cam: 13, t: 'noon' }, { cam: 15, t: 'noon' }, { cam: 17, t: 'noon' }, { cam: 17, t: 19.2 },
  // (phase 4b) views full of animals: a pasture with its flock, deer at a
  // forest edge at dawn, gulls on the coast, crows on the wall walk at
  // their own hours; the flock coming in at dusk
  ...[23, 24, 25, 26].map((cam) => ({ cam, t: 'own' })), { cam: 23, t: 18.3 },
];
// (phase 3a) the building yard: every piece near, the yard middle and far,
// at night, the passage and the wall walk; the gate, the keep, the torches
// and the window at night too
const YARD = [
  ...Array.from({ length: 14 }, (_, cam) => ({ cam, t: cam === 11 ? 'night' : cam === 13 ? 'dusk' : 'day' })),
  { cam: 0, t: 'night' }, { cam: 3, t: 'night' }, { cam: 7, t: 'night' }, { cam: 8, t: 'night' }, { cam: 12, t: 'night' },
  // (phase 3b) the village pieces by day, the cottage inside and the pieces at night
  ...Array.from({ length: 15 }, (_, k) => ({ cam: 14 + k, t: k === 13 || k === 14 ? 'night' : 'day' })),
  { cam: 14, t: 'night' }, { cam: 20, t: 'night' }, { cam: 26, t: 'night' },
  // (phase 4a) the figures: near, middle, far, very far, at night, asleep, on the bench
  ...Array.from({ length: 7 }, (_, k) => ({ cam: 29 + k, t: 'own' })),
  // (phase 4b) the wild ground detail near and far; every animal in every
  // pose, all of them from three distances and each kind near
  ...Array.from({ length: 17 }, (_, k) => ({ cam: 36 + k, t: 'own' })),
];
const WEATHERS = a.weather === 'all' ? ['clear', 'fair', 'overcast', 'rain', 'mist'] : a.weather ? String(a.weather).split(',') : ['fair'];
// (phase 2b) where the mist lies: over the lake and along the river at dawn
if (a.weather) WORLD.push({ cam: 1, t: 6.6 }, { cam: 4, t: 6.6 });
const scenes = {
  lab: [['lab', LAB]], stress: [['stress', STRESS]], both: [['lab', LAB], ['stress', STRESS]], yard: [['yard', YARD]],
  world: [['world', WORLD, true], ['world', WORLD, false]],
  all: [['lab', LAB], ['stress', STRESS], ['yard', YARD], ['world', WORLD, true], ['world', WORLD, false]],
}[a.scene || 'both'];

const table = {};
const worlds = {};
let bad = 0;
const plain = await serve(a.root, { isolated: false });
try {
  for (const [scene, views, iso = true] of scenes) for (const n of counts) {
    const name = scene === 'world' ? `world (${iso ? 'shared' : 'fallback'})` : scene;
    const lab = await openLab(browser, iso ? url : plain.url, { built: !!a.built, threads: n, scene, seed: a.seed });
    if (scene === 'world') {
      const st = await lab.page.evaluate(() => ({ hash: window.lab.worldHash(), shared: window.lab.shared, threads: window.lab.threads }));
      worlds[`${name} ${n}`] = st;
      if (n > 0 && st.shared !== iso) throw new Error(`${name} with ${n} workers: shared memory ${st.shared ? 'on' : 'off'}`);
    }
    for (const weather of WEATHERS) {
      for (let i = 0; i < views.length; i++) {
        const v = views[i];
        const h = await lab.page.evaluate(async ({ v, weather }) => {
          const L = window.lab;
          if (L.setWeather) L.setWeather(weather);
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
          L.freeze(v.t === 'own' ? L.cameras[v.cam].time : v.t, 12.5, v.day || 0);
          await L.whenIdle();
          return L.cellHash();
        }, { v, weather });
        await lab.check();
        (table[`${name} ${i}${WEATHERS.length > 1 || a.weather ? ` ${weather}` : ''}`] ||= {})[n] = h;
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
    console.log(`${key}: ${same ? 'identical' : 'DIFFERENT'}  ${Object.entries(row).map(([n, h]) => `${n}:${h}`).join(' ')}`);
  }
  console.log(`\n${rows - bad} of ${rows} views identical across ${counts.join(', ')} workers (weather ${WEATHERS.join(', ')})`);
} finally {
  await browser.close();
  server.close();
  plain.server.close();
}
process.exit(bad ? 1 : 0);
