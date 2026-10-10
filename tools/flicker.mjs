// Counts cells that blink (change, then change back on the next frame) while
// the camera walks or turns with every clock frozen. A steady picture has
// almost none: detail is fixed to the land, so it slides smoothly instead.
//
//   node tools/flicker.mjs                        the water set: along the shore and turning across the lake,
//                                                 with a dry view moved the same way for comparison
//   node tools/flicker.mjs --cam 1 [--stress] [--frames 60] [--step 0.075] [--dir 0] [--turn 0]
//
// step is metres a frame (0.075 m = 4.5 m/s at 60 fps), dir the walking
// direction in degrees from the way the camera faces (90 = sideways, along a
// shore it faces across), turn degrees a frame.
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const one = a.cam !== undefined;
const runs = one
  ? [{ stress: !!a.stress, cam: Number(a.cam), step: Number(a.step ?? 0.075), dir: Number(a.dir || 0), turn: Number(a.turn || 0), label: 'custom' }]
  : [
    // a dry view for comparison, moved the same way
    { stress: false, cam: 1, step: 0.075, dir: 90, turn: 0, label: 'lab, meadow (no water): walking sideways' },
    { stress: false, cam: 1, step: 0, dir: 0, turn: 0.3, label: 'lab, meadow (no water): turning' },
    { stress: false, cam: 2, step: 0.075, dir: 90, turn: 0, label: 'lab, lake shore: walking along the shore' },
    { stress: false, cam: 2, step: 0, dir: 0, turn: 0.3, label: 'lab, lake shore: turning across the lake' },
    { stress: false, cam: 5, step: 0.075, dir: 90, turn: 0, label: 'lab, low over the lake: walking along the shore' },
    { stress: false, cam: 5, step: 0, dir: 0, turn: 0.3, label: 'lab, low over the lake: turning across the lake' },
    { stress: true, cam: 1, step: 0.075, dir: 90, turn: 0, label: 'stress, across the lake: walking along the shore' },
    { stress: true, cam: 1, step: 0, dir: 0, turn: 0.3, label: 'stress, across the lake: turning across the lake' },
  ];
const frames = Number(a.frames || 60);
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
const results = [];
try {
  for (const stress of [false, true]) {
    const mine = runs.filter((r) => r.stress === stress);
    if (!mine.length) continue;
    const lab = await openLab(browser, url, { stress, density: a.density });
    for (const run of mine) {
      const r = await lab.page.evaluate(async ({ cam, frames, step, dir, turn }) => {
        const L = window.lab;
        L.camera(cam);
        const c = L.cameras[cam];
        L.freeze(c.time, 0);
        const s0 = L.state();
        let prev2 = null, prev = null, blinks = 0, changed = 0, glyphBlinks = 0, colourBlinks = 0, n = 0;
        const way = (s0.yaw + dir) * Math.PI / 180;
        for (let i = 0; i < frames; i++) {
          L.setCamera({ x: s0.x + Math.sin(way) * step * i, z: s0.z + Math.cos(way) * step * i, yaw: s0.yaw + turn * i, pitch: s0.pitch });
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
      }, { ...run, frames });
      await lab.check();
      results.push({ ...run, ...r });
      console.log(`${run.label} (camera ${run.cam + 1}, ${frames} frames, ${run.step} m at ${run.dir}° and ${run.turn}° a frame): ${r.blinkPct.toFixed(3)}% of cells blink per frame (glyph ${r.glyphPct.toFixed(3)}%, colour step >6 ${r.colourPct.toFixed(3)}%; ${r.changedPct.toFixed(1)}% change at all)`);
    }
    await lab.ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (!one) {
  console.log('\n| run | blinking cells per frame | glyph blinks | colour blinks (>6 levels) | cells changing at all |');
  console.log('|---|---|---|---|---|');
  for (const r of results) console.log(`| ${r.label} | ${r.blinkPct.toFixed(3)}% | ${r.glyphPct.toFixed(3)}% | ${r.colourPct.toFixed(3)}% | ${r.changedPct.toFixed(1)}% |`);
}
