// Counts cells that blink (change, then change back on the next frame) while
// the camera walks or turns with every clock frozen. A steady picture has
// almost none: detail is fixed to the land, so it slides smoothly instead.
//
//   node tools/flicker.mjs                 the look set: each tree, cloud and meadow option on the
//                                          views where it shows, beside the same run on a reference
//                                          build (--ref DIR, e.g. a copy of phase 0b's sources)
//   node tools/flicker.mjs --set water     the phase 0b water set (shore walks, turns across the lake)
//   node tools/flicker.mjs --set world     a walk through the generated world (default seed, settled
//                                          look): meadow, forest and along the lake, from its cameras
//   --only forest,stand                    only the runs whose label contains one of these
//   node tools/flicker.mjs --at x,z,yaw,pitch [--stress] [--time day] [--step 0.075] [--dir 0] [--turn 0] [--look tree=B]
//
// step is metres a frame (0.075 m = 4.5 m/s at 60 fps), dir the walking
// direction in degrees from the way the camera faces (90 = sideways), turn
// degrees a frame (0.3 = 18 degrees a second). Views are given as positions,
// not camera numbers, so any build can run them.
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, parseLook, ROOT } from './lib/serve.mjs';

const a = args();
const W = { step: 0.075, dir: 90, turn: 0 }, F = { step: 0.075, dir: 0, turn: 0 }, TURN = { step: 0, dir: 0, turn: 0.3 };
const SETS = {
  look: [
    // trees, near to far, and in the water
    { axis: 'tree', label: 'forest edge across the meadow, walking sideways', at: [276, 248, -97, 1], ...W },
    { axis: 'tree', label: 'forest edge across the meadow, turning', at: [276, 248, -97, 1], ...TURN },
    { axis: 'tree', label: 'inside the stand, walking out', at: [356, 320, 175, 3], ...F },
    { axis: 'tree', label: 'inside the stand, turning', at: [356, 320, 175, 3], ...TURN },
    { axis: 'tree', label: 'trees in the lake, walking along the shore', at: [356, 229.6, 2, -12], ...W },
    { axis: 'tree', label: 'far treeline, walking sideways', at: [345, 60, 4, 1], ...W },
    { axis: 'tree', label: 'stress forest, walking in', stress: true, cam: 0, ...F },
    { axis: 'tree', label: 'stress forest, turning', stress: true, cam: 0, ...TURN },
    // clouds, in views with no trees in them (trees would be counted too)
    { axis: 'cloud', label: 'open sky, turning', at: [300, 120, 170, 25], ...TURN },
    { axis: 'cloud', label: 'open sky, walking sideways', at: [300, 120, 170, 25], ...W },
    { axis: 'cloud', label: 'stress sky over the lake, turning', stress: true, at: [818, 653.6, 8, 30], ...TURN },
    // meadow, likewise
    { axis: 'meadow', label: 'open meadow, walking', at: [300, 120, 160, -14], ...F },
    { axis: 'meadow', label: 'open meadow, turning', at: [300, 120, 160, -14], ...TURN },
    { axis: 'meadow', label: 'stress vista, turning', stress: true, cam: 2, ...TURN },
  ],
  world: [
    // (cameras of the generated world, found from its data; `turn` here is
    // the camera turned that many degrees first)
    { label: 'world, open meadow: walking', scene: 'world', cam: 3, face: 180, ...F },
    { label: 'world, forest edge across the meadow: walking sideways', scene: 'world', cam: 3, ...W },
    { label: 'world, inside a forest stand: walking', scene: 'world', cam: 2, ...F },
    // (along the shore whichever way is dry and more level)
    { label: 'world, main lake shore: walking along the shore', scene: 'world', cam: 1, dir: -90, level: true, step: 0.075, turn: 0 },
    { label: 'world, open meadow: turning', scene: 'world', cam: 3, face: 180, ...TURN },
    { label: 'world, inside a forest stand: turning', scene: 'world', cam: 2, ...TURN },
    { label: 'world, main lake shore: turning', scene: 'world', cam: 1, ...TURN },
  ],
  water: [
    { label: 'lab, meadow (no water): walking sideways', at: [262, 225, -8, 2], ...W },
    { label: 'lab, meadow (no water): turning', at: [262, 225, -8, 2], ...TURN },
    { label: 'lab, lake shore: walking along the shore', at: [327, 232.5, -12, -7], ...W },
    { label: 'lab, lake shore: turning across the lake', at: [327, 232.5, -12, -7], ...TURN },
    { label: 'lab, low over the lake: walking along the shore', at: [356, 229.6, 2, -12], ...W },
    { label: 'lab, low over the lake: turning across the lake', at: [356, 229.6, 2, -12], ...TURN },
    { label: 'stress, across the lake: walking along the shore', stress: true, cam: 1, ...W },
    { label: 'stress, across the lake: turning across the lake', stress: true, cam: 1, ...TURN },
  ],
};
const OPTIONS = { tree: ['A', 'B'], cloud: ['A', 'B'], meadow: [0, 1, 2] };
const frames = Number(a.frames || 60);

let runs;
if (a.at) {
  const at = a.at.split(',').map(Number);
  runs = [{ label: 'custom', at, stress: !!a.stress, scene: a.scene, time: a.time, step: Number(a.step ?? 0.075), dir: Number(a.dir || 0), turn: Number(a.turn || 0), look: parseLook(a.look), y: a.y !== undefined ? Number(a.y) : undefined }];
} else {
  const only = a.only ? String(a.only).split(',') : null;
  const set = SETS[a.set || 'look'].filter((r) => !only || only.some((w) => r.label.includes(w)));
  runs = [];
  for (const r of set) {
    if (!r.axis) { runs.push({ ...r }); continue; }
    for (const o of OPTIONS[r.axis]) runs.push({ ...r, look: { [r.axis]: o }, option: `${r.axis} ${o}` });
  }
}

// one build: every run, on pages for the lab and the stress scene
async function measure(browser, root, list) {
  const { server, url } = await serve(root);
  const out = [];
  try {
    for (const scene of ['lab', 'stress', 'world']) {
      const mine = list.filter((r) => (r.scene || (r.stress ? 'stress' : 'lab')) === scene);
      if (!mine.length) continue;
      const lab = await openLab(browser, url, { scene, density: a.density });
      for (const run of mine) {
        const r = await lab.page.evaluate(async ({ run, frames }) => {
          const L = window.lab;
          // (the look set compares options against the phase 0b look; the
          // world set runs the settled look)
          if (L.setLook) { if (run.scene === 'world') L.resetLook(); else L.setLook({ tree: 'A', cloud: 'A', meadow: 0, shallows: 'warm', ...(run.look || {}) }); }
          let s0;
          if (run.cam !== undefined) { L.camera(run.cam); if (run.face) L.face(L.state().yaw + run.face); s0 = L.state(); } else {
            L.setCamera({ x: run.at[0], z: run.at[1], yaw: run.at[2], pitch: run.at[3] });
            s0 = L.state();
            if (run.y !== undefined) s0.eye = run.y;
          }
          L.freeze(run.time || 'day', 0);
          let prev2 = null, prev = null, blinks = 0, changed = 0, glyphBlinks = 0, colourBlinks = 0, n = 0;
          let dir = run.dir;
          if (run.level) {
            // how far the ground rises or falls, or the water deepens, over the walk
            const cost = (d) => { const w = (s0.yaw + d) * Math.PI / 180, g0 = L.ground(s0.x, s0.z), g = L.ground(s0.x + Math.sin(w) * 4.5, s0.z + Math.cos(w) * 4.5); return Math.abs(g.ground - g0.ground) + 10 * (g.surface - g.ground); };
            if (cost(dir + 180) < cost(dir)) dir += 180;
          }
          const way = (s0.yaw + dir) * Math.PI / 180;
          for (let i = 0; i < frames; i++) {
            L.setCamera({ x: s0.x + Math.sin(way) * run.step * i, z: s0.z + Math.cos(way) * run.step * i, yaw: s0.yaw + run.turn * i, pitch: s0.pitch, ...(run.y !== undefined ? { y: run.y } : {}) });
            await L.whenIdle();
            const cur = L.cells();
            if (prev2) {
              let b = 0, ch = 0, gb = 0, cb = 0;
              for (let k = 0; k < cur.length; k += 8) {
                const same = (x, y) => x[k] === y[k] && x[k + 1] === y[k + 1] && x[k + 2] === y[k + 2] && x[k + 3] === y[k + 3];
                // a visible colour step: more than 6 levels in some channel
                const far = (x, y) => Math.abs(x[k] - y[k]) > 6 || Math.abs(x[k + 1] - y[k + 1]) > 6 || Math.abs(x[k + 2] - y[k + 2]) > 6;
                if (!same(prev, cur)) ch++;
                if (!same(prev2, prev) && same(prev2, cur)) {
                  b++;
                  if (prev2[k + 3] !== prev[k + 3]) gb++;
                  if (far(prev2, prev)) cb++;
                }
              }
              blinks += b; changed += ch; glyphBlinks += gb; colourBlinks += cb; n++;
            }
            prev2 = prev; prev = cur;
          }
          const cells = prev.length / 8;
          return { cells, blinkPct: 100 * blinks / n / cells, changedPct: 100 * changed / n / cells, glyphPct: 100 * glyphBlinks / n / cells, colourPct: 100 * colourBlinks / n / cells };
        }, { run, frames });
        await lab.check();
        out.push({ ...run, ...r });
        console.log(`${run.label}${run.option ? ` [${run.option}]` : ''}: ${r.blinkPct.toFixed(3)}% blink (glyph ${r.glyphPct.toFixed(3)}%, colour >6 ${r.colourPct.toFixed(3)}%; ${r.changedPct.toFixed(1)}% change)`);
      }
      await lab.ctx.close();
    }
  } finally {
    server.close();
  }
  return out;
}

const browser = await launch(a.browser || 'chromium');
let results, ref = null;
try {
  results = await measure(browser, ROOT, runs);
  if (a.ref) {
    // the reference build: each view once (it has no look candidates)
    const seen = new Set();
    const refRuns = runs.filter((r) => { if (seen.has(r.label)) return false; seen.add(r.label); return true; }).map((r) => ({ ...r, look: null, option: null }));
    console.log(`\nreference build: ${a.ref}`);
    ref = await measure(browser, a.ref, refRuns);
  }
} finally {
  await browser.close();
}
const f3 = (x) => `${x.toFixed(3)}%`;
if (!a.at && (a.set || 'look') === 'look') {
  console.log('\n| view and motion | option | blinking cells | glyph blinks | colour blinks (>6 levels) | reference build: blinking / glyph / colour |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    const rr = ref && ref.find((x) => x.label === r.label);
    console.log(`| ${r.label} | ${r.option} | ${f3(r.blinkPct)} | ${f3(r.glyphPct)} | ${f3(r.colourPct)} | ${rr ? `${f3(rr.blinkPct)} / ${f3(rr.glyphPct)} / ${f3(rr.colourPct)}` : '–'} |`);
  }
} else if (!a.at) {
  console.log('\n| run | blinking cells per frame | glyph blinks | colour blinks (>6 levels) | cells changing at all |');
  console.log('|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.label} | ${f3(r.blinkPct)} | ${f3(r.glyphPct)} | ${f3(r.colourPct)} | ${r.changedPct.toFixed(1)}% |`);
}
