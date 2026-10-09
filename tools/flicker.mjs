// Counts cells that blink (change, then change back on the next frame) while
// the camera walks or turns with every clock frozen. A steady picture has
// almost none: detail is fixed to the land, so it slides smoothly instead.
//   node tools/flicker.mjs [--cam 1] [--frames 60] [--step 0.075] [--turn 0]
import { launch } from './lib/browser.mjs';
import { serve, args, openLab } from './lib/serve.mjs';

const a = args();
const cam = Number(a.cam || 0), frames = Number(a.frames || 60);
const step = Number(a.step ?? 0.075), turn = Number(a.turn || 0);   // metres and degrees per frame (0.075 m = 4.5 m/s at 60 fps)
const { server, url } = await serve();
const browser = await launch(a.browser || 'chromium');
try {
  const lab = await openLab(browser, url, {});
  const r = await lab.page.evaluate(async ({ cam, frames, step, turn }) => {
    const L = window.lab;
    L.camera(cam);
    const c = L.cameras[cam];
    L.freeze(c.time, 0);
    const s0 = L.state();
    let prev2 = null, prev = null, blinks = 0, changed = 0, glyphBlinks = 0, colourBlinks = 0, n = 0;
    const MAT = new Map();
    const yaw = s0.yaw * Math.PI / 180;
    for (let i = 0; i < frames; i++) {
      L.setCamera({ x: s0.x + Math.sin(yaw) * step * i, z: s0.z + Math.cos(yaw) * step * i, yaw: s0.yaw + turn * i, pitch: s0.pitch });
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
  }, { cam, frames, step, turn });
  await lab.check();
  console.log(`camera ${cam + 1}, ${frames} frames, ${step} m and ${turn}° a frame: ${r.blinkPct.toFixed(3)}% of cells blink per frame (glyph ${r.glyphPct.toFixed(3)}%, colour step >6 ${r.colourPct.toFixed(3)}%; ${r.changedPct.toFixed(1)}% change at all)`);
} finally {
  await browser.close();
  server.close();
}
