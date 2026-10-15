// Counts cells that blink (change, then change back on the next frame) while
// the camera walks or turns with every clock frozen. A steady picture has
// almost none: detail is fixed to the land, so it slides smoothly instead.
//
//   node tools/flicker.mjs [--set world]   a walk through the generated world (below); --ref DIR
//                                          runs the same views on another build beside it
//   node tools/flicker.mjs --set water     the phase 0b water set (shore walks, turns across the lake)
//   node tools/flicker.mjs --set fort      (phase 3a) the fort beside the lab's wall and gate: walking
//                                          the road to the gate, walking the wall walk, turning inside
//   node tools/flicker.mjs --set world     a walk through the generated world (default seed): meadow,
//                                          forest and along the lake, from its cameras,
//                                          and (phase 2a) along the coast's foam line and swell
//   node tools/flicker.mjs --skyline [--ref DIR]   (phase 2a; in Node, no browser) turning toward the
//                                          range from the world's cameras, each blink sorted by what it
//                                          sits on, so the far skyline's crawl (a cell changing between
//                                          sky and land) is counted on its own; with --ref, the same for
//                                          another build (e.g. a copy of phase 1's sources)
//   node tools/flicker.mjs --buildings [--seed N]   (phase 3a; in Node) the fort set, its blinks counted
//                                          only on the buildings' own cells, so the fort and the lab's
//                                          wall compare like for like
//                                          (phase 3b: and the villages: walking into each, walking its
//                                          street, turning on its green, crossing a bridge; --bymat
//                                          sorts each run's blinks by material)
//   node tools/flicker.mjs --animals [--seed N]  (phase 4b; in Node) standing beside a grazing flock
//                                          (turning), walking through a boulder field and through a reed
//                                          bed, and a flock of small birds crossing the sky: blinks counted
//                                          on the animals' own cells and on the wild ground detail's, still
//                                          (clock frozen, camera moving) and moving (camera still, clock running)
//   node tools/flicker.mjs --people [--seed N]   (phase 4a; in Node) a busy green, a street walk past people
//                                          and the wall walk from the courtyard at night: blinks on the
//                                          people's own cells, still (clock frozen) and walking (camera still)
//   --only forest,stand                    only the runs whose label contains one of these
//   --built [--root DIR]                   the single-file build (in DIR: a copy, so the repository can change meanwhile)
//   (phase 2b) the world set also counts glyph flips (a glyph that changes and changes back, whatever
//   its colour does) and colour flips (a background that jumps more than 6 levels and comes back to
//   within a quarter of the jump): "glyph blinks" counts a glyph's change only where the whole cell
//   comes back exactly, so flatter colours (overcast, mist, wet ground) inflate it
//   --weather fair,overcast,wet,rain,mist  (phase 2b) each run under each weather held (wet: fair
//                                          weather on wet ground); --time 6.6 for another hour
//                                          (mist lies only round dawn); the default is fair
//   node tools/flicker.mjs --at x,z,yaw,pitch [--stress] [--time day] [--step 0.075] [--dir 0] [--turn 0]
//
// step is metres a frame (0.075 m = 4.5 m/s at 60 fps), dir the walking
// direction in degrees from the way the camera faces (90 = sideways), turn
// degrees a frame (0.3 = 18 degrees a second). Views are given as positions,
// not camera numbers, so any build can run them.
import { launch } from './lib/browser.mjs';
import { serve, args, openLab, ROOT } from './lib/serve.mjs';
import { W, F, TURN, skyline, buildings, peopleSet, animalsSet } from './lib/flicker-node.mjs';

const a = args();
const SETS = {
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
    // the coast (phase 2a): walking along the beach, its foam line and the
    // sea's swell in view, and turning across the sea
    { label: 'world, the coast: walking along the beach', scene: 'world', cam: 5, ...F },
    { label: 'world, the coast: turning across the sea', scene: 'world', cam: 5, ...TURN },
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
// (phase 3a) the fort against the lab's wall and gate (spans, phase 0a):
// walking the road toward the gate from 14 m off (both start at the same
// distance, so the masonry is seen at the same size), walking along the
// wall's walk with the parapet beside, and turning just inside (the lab:
// just outside its gate, the fort: in its courtyard); the fort on the
// default seed, by day
SETS.fort = [
  { label: 'lab wall: walking the road to the gate', at: [256, 143, 0, 2], ...F },
  { label: 'lab wall: walking the wall walk', at: [230, 158.5, 90, -3], y: 18.7, ...F },
  { label: 'lab wall: turning by the gate', at: [256, 145, 0, 2], ...TURN },
  { label: 'fort: walking the road to the gate', scene: 'world', fort: 'road', ...F },
  { label: 'fort: walking the wall walk', scene: 'world', fort: 'walk', ...F },
  { label: 'fort: turning in the courtyard', scene: 'world', camName: 'the courtyard', ...TURN },
];
const frames = Number(a.frames || 60);

if (a.animals) {
  const seed = Number(a.seed || 3), list = await animalsSet(seed), f3 = (x) => (x ? `${x.glyph.toFixed(3)}% / ${x.colour.toFixed(3)}%` : '-'), sh = (x) => (x ? `${x.share.toFixed(2)}%` : '-');
  console.log(`\nanimals' and wild ground detail's own cells (seed ${seed}, Node, 360 x 112, ${frames} frames)\n`);
  console.log('| run | still animals: share / glyph / colour flips | wild ground detail: share / glyph / colour | whole frame: glyph / colour | moving animals, camera still: share / glyph / colour |');
  console.log('|---|---|---|---|---|');
  for (const v of list) console.log(`| ${v.label} | ${sh(v.still)} / ${f3(v.still)} | ${sh(v.wild)} / ${f3(v.wild)} | ${f3(v.all)} | ${sh(v.mv)} / ${f3(v.mv)} |`);
  process.exit(0);
}
if (a.people) {
  const seed = Number(a.seed || 3), list = await peopleSet(seed), f3 = (x) => `${x.toFixed(3)}%`;
  console.log(`\npeople's own cells (seed ${seed}, Node, 360 x 112, ${frames} frames)\n`);
  console.log('| run | still figures: share of the frame | still figures: glyph / colour flips | buildings in the same run: glyph / colour | walkers caught mid-stride, camera moving: share, glyph / colour | walkers walking, camera still: glyph / colour |');
  console.log('|---|---|---|---|---|---|');
  for (const v of list) console.log(`| ${v.label} | ${v.ps.share.toFixed(2)}% | ${f3(v.ps.glyph)} / ${f3(v.ps.colour)} | ${f3(v.bs.glyph)} / ${f3(v.bs.colour)} | ${v.pw.share.toFixed(2)}%, ${f3(v.pw.glyph)} / ${f3(v.pw.colour)} | ${f3(v.pm.glyph)} / ${f3(v.pm.colour)} |`);
  process.exit(0);
}
if (a.buildings) {
  const seed = Number(a.seed || 3), list = await buildings(seed), f3 = (x) => `${x.toFixed(3)}%`;
  console.log(`\nthe buildings' own cells (seed ${seed}, Node, 360 x 112, ${frames} frames, 14:00)\n`);
  console.log('| run | building cells (share of the frame) | glyph flips on them | colour flips on them (>6 levels) | glyph flips, whole frame | colour flips, whole frame |');
  console.log('|---|---|---|---|---|---|');
  for (const v of list) console.log(`| ${v.label} | ${v.share.toFixed(1)}% | ${f3(v.glyph)} | ${f3(v.colour)} | ${f3(v.allGlyph)} | ${f3(v.allColour)} |`);
  process.exit(0);
}
if (a.skyline) {
  const seed = Number(a.seed || 3);
  const rows = [['this build', await skyline(ROOT, seed)]];
  if (a.ref) rows.push([`reference build (${a.ref})`, await skyline(a.ref, seed)]);
  const f3 = (x) => `${x.toFixed(3)}%`;
  console.log(`\nthe far skyline, turning (seed ${seed}, density 3, ${frames} frames at 18 degrees a second)\n`);
  console.log('| build | view | skyline glyph blinks | skyline colour blinks (>6 levels) | all glyph blinks | all colour blinks |');
  console.log('|---|---|---|---|---|---|');
  for (const [name, list] of rows) for (const v of list) console.log(`| ${name} | ${v.view} | ${f3(v.skylineGlyph)} | ${f3(v.skylineColour)} | ${f3(v.allGlyph)} | ${f3(v.allColour)} |`);
  process.exit(0);
}

let runs;
if (a.at) {
  const at = a.at.split(',').map(Number);
  runs = [{ label: 'custom', at, stress: !!a.stress, scene: a.scene, time: a.time, step: Number(a.step ?? 0.075), dir: Number(a.dir || 0), turn: Number(a.turn || 0), y: a.y !== undefined ? Number(a.y) : undefined }];
} else {
  const only = a.only ? String(a.only).split(',') : null;
  runs = SETS[a.set || 'world'].filter((r) => !only || only.some((w) => r.label.includes(w))).map((r) => ({ ...r }));
}
// (phase 2b) each run under each weather asked for, at the hour asked for
const WEATHERS = { wet: { mix: { fair: 1 }, wet: 1 } };
if (a.weather || a.time) {
  const ws = String(a.weather || 'fair').split(',');
  runs = runs.flatMap((r) => ws.map((w) => ({ ...r, weather: WEATHERS[w] || w, weatherName: w, time: a.time ? (isNaN(+a.time) ? a.time : +a.time) : r.time,
    option: [r.option, ws.length > 1 || a.weather ? w : null, a.time ? `at ${a.time}` : null].filter(Boolean).join(', ') || null })));
}

// one build: every run, on pages for the lab and the stress scene
async function measure(browser, root, list) {
  const { server, url } = await serve(root);
  const out = [];
  try {
    for (const scene of ['lab', 'stress', 'world', 'yard']) {
      const mine = list.filter((r) => (r.scene || (r.stress ? 'stress' : 'lab')) === scene);
      if (!mine.length) continue;
      const lab = await openLab(browser, url, { scene, density: a.density, built: !!a.built, seed: a.seed });
      for (const run of mine) {
        const r = await lab.page.evaluate(async ({ run, frames }) => {
          const L = window.lab;
          let s0;
          if (run.camName !== undefined) run.cam = L.cameras.findIndex((c) => c.name === run.camName);
          if (run.fort === 'road') {
            // 14 m out from the gate's mouth along the road's way in, facing the gate
            const f = L.world.sites.fort, o = f.gate.out;
            L.setCamera({ x: f.front.x + o[0] * 14, z: f.front.z + o[1] * 14, yaw: Math.atan2(-o[0], -o[1]) * 180 / Math.PI, pitch: 2 });
            s0 = L.state();
          } else if (run.fort === 'walk') {
            // on the wall walk camera's spot, looking and walking along its wall
            L.camera(L.cameras.findIndex((c) => c.name === 'the wall walk over the valley'));
            const st = L.state(), f = L.world.sites.fort;
            let best = null;
            for (const e of f.edges) {
              const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1], l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((st.x - e.a[0]) * dx + (st.z - e.a[1]) * dz) / (l * l)));
              const d = Math.hypot(st.x - e.a[0] - dx * t, st.z - e.a[1] - dz * t);
              if (!best || d < best.d) best = { d, dx: dx / l, dz: dz / l };
            }
            L.setCamera({ x: st.x, z: st.z, y: st.eye, yaw: Math.atan2(best.dx, best.dz) * 180 / Math.PI, pitch: -3 });
            s0 = L.state(); run.y = st.eye;
          } else if (run.cam !== undefined) { L.camera(run.cam); if (run.face) L.face(L.state().yaw + run.face); s0 = L.state(); } else {
            L.setCamera({ x: run.at[0], z: run.at[1], yaw: run.at[2], pitch: run.at[3] });
            s0 = L.state();
            if (run.y !== undefined) s0.eye = run.y;
          }
          // (phase 2b: the weather held, fair unless asked)
          if (L.setWeather) L.setWeather(run.weather || 'fair');
          L.freeze(run.time || 'day', 0);
          let prev2 = null, prev = null, blinks = 0, changed = 0, glyphBlinks = 0, colourBlinks = 0, n = 0, glyphFlips = 0, colourFlips = 0;
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
              let b = 0, ch = 0, gb = 0, cb = 0, gf = 0, cf = 0;
              for (let k = 0; k < cur.length; k += 8) {
                // (phase 2b) a glyph that changes and changes back, whatever
                // its colour does; a background that jumps more than 6 levels
                // and comes back to within a quarter of the jump
                if (prev2[k + 3] === cur[k + 3] && prev2[k + 3] !== prev[k + 3]) gf++;
                const jump = Math.max(Math.abs(prev2[k] - prev[k]), Math.abs(prev2[k + 1] - prev[k + 1]), Math.abs(prev2[k + 2] - prev[k + 2]));
                const back = Math.max(Math.abs(prev2[k] - cur[k]), Math.abs(prev2[k + 1] - cur[k + 1]), Math.abs(prev2[k + 2] - cur[k + 2]));
                if (jump > 6 && back <= jump / 4) cf++;
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
              blinks += b; changed += ch; glyphBlinks += gb; colourBlinks += cb; glyphFlips += gf; colourFlips += cf; n++;
            }
            prev2 = prev; prev = cur;
          }
          const cells = prev.length / 8;
          return { cells, blinkPct: 100 * blinks / n / cells, changedPct: 100 * changed / n / cells, glyphPct: 100 * glyphBlinks / n / cells, colourPct: 100 * colourBlinks / n / cells,
            glyphFlipPct: 100 * glyphFlips / n / cells, colourFlipPct: 100 * colourFlips / n / cells };
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
  results = await measure(browser, a.root || ROOT, runs);
  if (a.ref) {
    // the reference build: each view once
    const seen = new Set();
    const refRuns = runs.filter((r) => { if (seen.has(r.label)) return false; seen.add(r.label); return true; }).map((r) => ({ ...r, option: null }));
    console.log(`\nreference build: ${a.ref}`);
    ref = await measure(browser, a.ref, refRuns);
  }
} finally {
  await browser.close();
}
const f3 = (x) => `${x.toFixed(3)}%`;
if (!a.at && ref) {
  console.log('\n| view and motion | blinking cells | glyph blinks | colour blinks (>6 levels) | reference build: blinking / glyph / colour |');
  console.log('|---|---|---|---|---|');
  for (const r of results) {
    const rr = ref.find((x) => x.label === r.label);
    console.log(`| ${r.label} | ${f3(r.blinkPct)} | ${f3(r.glyphPct)} | ${f3(r.colourPct)} | ${rr ? `${f3(rr.blinkPct)} / ${f3(rr.glyphPct)} / ${f3(rr.colourPct)}` : '–'} |`);
  }
} else if (!a.at) {
  console.log(`\n| run${a.weather ? ' | weather' : ''} | blinking cells per frame | glyph blinks | colour blinks (>6 levels) | cells changing at all | glyph flips | colour flips (>6 levels) |`);
  console.log(`|---${a.weather ? '|---' : ''}|---|---|---|---|---|---|`);
  for (const r of results) console.log(`| ${r.label}${a.weather ? ` | ${r.weatherName}` : ''} | ${f3(r.blinkPct)} | ${f3(r.glyphPct)} | ${f3(r.colourPct)} | ${r.changedPct.toFixed(1)}% | ${f3(r.glyphFlipPct)} | ${f3(r.colourFlipPct)} |`);
}
