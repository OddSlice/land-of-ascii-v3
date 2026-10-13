// Counts cells that blink (change, then change back on the next frame) while
// the camera walks or turns with every clock frozen. A steady picture has
// almost none: detail is fixed to the land, so it slides smoothly instead.
//
//   node tools/flicker.mjs                 the look set: each tree, cloud and meadow option on the
//                                          views where it shows, beside the same run on a reference
//                                          build (--ref DIR, e.g. a copy of phase 0b's sources)
//   node tools/flicker.mjs --set water     the phase 0b water set (shore walks, turns across the lake)
//   node tools/flicker.mjs --set fort      (phase 3a) the fort beside the lab's wall and gate: walking
//                                          the road to the gate, walking the wall walk, turning inside
//   node tools/flicker.mjs --set world     a walk through the generated world (default seed, settled
//                                          look): meadow, forest and along the lake, from its cameras,
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
//   node tools/flicker.mjs --at x,z,yaw,pitch [--stress] [--time day] [--step 0.075] [--dir 0] [--turn 0] [--look cloud=B]
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
    { label: 'forest edge across the meadow, walking sideways', at: [276, 248, -97, 1], ...W },
    { label: 'forest edge across the meadow, turning', at: [276, 248, -97, 1], ...TURN },
    { label: 'inside the stand, walking out', at: [356, 320, 175, 3], ...F },
    { label: 'inside the stand, turning', at: [356, 320, 175, 3], ...TURN },
    { label: 'trees in the lake, walking along the shore', at: [356, 229.6, 2, -12], ...W },
    { label: 'far treeline, walking sideways', at: [345, 60, 4, 1], ...W },
    { label: 'stress forest, walking in', stress: true, cam: 0, ...F },
    { label: 'stress forest, turning', stress: true, cam: 0, ...TURN },
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
const OPTIONS = { cloud: ['A', 'B'], meadow: [0, 1, 2] };
const frames = Number(a.frames || 60);

// ---- the far skyline (phase 2a), in Node --------------------------------------
// Turning at 18 degrees a second from the spawn and the main lake's shore (the
// world's own cameras, which look toward the range), density 3, every clock
// frozen: blinks (a cell that changes and changes back) where the cell goes
// between sky (sky, cloud, sun, moon, stars) and land are the skyline's crawl.
async function skyline(root, seed) {
  const G = await import(`${root}/src/world/gen/world.js`), PK = await import(`${root}/src/world/pack.js`);
  const BE = await import(`${root}/src/scene/cpu/backend.js`), RS = await import(`${root}/src/resolve.js`), LK = await import(`${root}/src/look.js`);
  const CT = await import(`${root}/src/contract.js`), OB = await import(`${root}/src/world/objects.js`);
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value));
  const cols = 360, rows = 112, n = cols * rows, look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  const out = [];
  for (const ci of [0, 1]) {
    const c = w.cameras[ci], be = BE.createCpuBackend(w);
    const fr = [];
    for (let i = 0; i < frames + 1; i++) {
      const cam = { x: c.x, z: c.z, y: OB.groundAt(w.terrain, c.x, c.z) + 1.7, yaw: (c.yaw + 0.3 * i) * Math.PI / 180, pitch: c.pitch * Math.PI / 180 };
      const f = { seq: i, cam, cols, rows, fovY: LK.LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: 14, t: 0, day: 0, look };
      const hits = new Uint8Array(n * CT.HIT_STRIDE);
      for (let k = 0; k < 400; k++) { be.render(f, 0, cols, hits); if (be.settled) break; }
      const mats = new Uint8Array(n);
      for (let k = 0; k < n; k++) mats[k] = hits[k * CT.HIT_STRIDE] <= CT.MAT.STAR ? 1 : 0;
      const cells = new Uint8Array(n * 8);
      if (LK.LOOK.moonKeys) RS.resolveStripe(RS.makePalette(14, 0, 'moon'), hits, cells, cols, rows, 0, f);
      else RS.resolveStripe(RS.makePalette(14), hits, cells, cols, rows, 0, look);
      fr.push({ cells, mats });
    }
    let sg = 0, sc = 0, ag = 0, ac = 0;
    for (let i = 2; i < fr.length; i++) {
      const A = fr[i - 2], B = fr[i - 1], C = fr[i];
      for (let k = 0; k < n; k++) {
        const o = k * 8;
        const same = (x, y) => x[o] === y[o] && x[o + 1] === y[o + 1] && x[o + 2] === y[o + 2] && x[o + 3] === y[o + 3];
        if (same(A.cells, B.cells) || !same(A.cells, C.cells)) continue;
        const gb = A.cells[o + 3] !== B.cells[o + 3];
        const cb = Math.abs(A.cells[o] - B.cells[o]) > 6 || Math.abs(A.cells[o + 1] - B.cells[o + 1]) > 6 || Math.abs(A.cells[o + 2] - B.cells[o + 2]) > 6;
        // (the skyline: sky in one frame, land in the next, or a fading top cell)
        const sky = A.mats[k] !== B.mats[k] || (A.mats[k] === 0 && (k >= cols && A.mats[k - cols] === 1));
        if (gb) { ag++; if (sky) sg++; }
        if (cb) { ac++; if (sky) sc++; }
      }
    }
    const per = (x) => 100 * x / (fr.length - 2) / n;
    out.push({ view: c.name, skylineGlyph: per(sg), skylineColour: per(sc), allGlyph: per(ag), allColour: per(ac) });
  }
  return out;
}
// ---- the buildings' own cells (phase 3a), in Node ----------------------------
// The fort set's six runs, rendered in Node at 360 x 112 (density 3), every
// clock frozen at 14:00: blinks counted only on cells that show a building
// (stone, timber, plaster, roof, a window) in any of the three frames, as a
// share of those cells, so the fort and the lab's wall compare like for like
// whatever else is in view.
async function buildings(seed) {
  const { buildWorld } = await import('../src/world/world.js');
  const G = await import('../src/world/gen/world.js'), PK = await import('../src/world/pack.js');
  const BE = await import('../src/scene/cpu/backend.js'), RS = await import('../src/resolve.js'), { LOOK } = await import('../src/look.js');
  const CT = await import('../src/contract.js'), OB = await import('../src/world/objects.js'), { Player } = await import('../src/app/player.js');
  const lab = buildWorld();
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value)), f = w.sites.fort;
  const BLD = new Set([CT.MAT.STONE, CT.MAT.MASONRY, CT.MAT.TIMBER, CT.MAT.PLASTER, CT.MAT.ROOF, CT.MAT.WINDOW,
    CT.MAT.THATCH, CT.MAT.PLASTER2, CT.MAT.PLASTER3, CT.MAT.TIMBER2, CT.MAT.TIMBER3]);
  const cols = 360, rows = 112, n = cols * rows, look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  const o = f.gate.out, deg = (x) => x * 180 / Math.PI;
  // the wall walk: the camera's spot, along its wall
  const wc = w.cameras.find((c) => c.name === 'the wall walk over the valley');
  let best = null;
  for (const e of f.edges) {
    const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1], l = Math.hypot(dx, dz), t = Math.max(0, Math.min(1, ((wc.x - e.a[0]) * dx + (wc.z - e.a[1]) * dz) / (l * l)));
    const d = Math.hypot(wc.x - e.a[0] - dx * t, wc.z - e.a[1] - dz * t);
    if (!best || d < best.d) best = { d, dx: dx / l, dz: dz / l };
  }
  const yc = w.cameras.find((c) => c.name === 'the courtyard');
  const pl = new Player(w, { rules: 'world' });
  let RUNS = [
    { label: 'lab wall: walking the road to the gate', world: lab, x: 256, z: 143, yaw: 0, pitch: 2, ...F },
    { label: 'lab wall: walking the wall walk', world: lab, x: 230, z: 158.5, y: 18.7, yaw: 90, pitch: -3, ...F },
    { label: 'lab wall: turning by the gate', world: lab, x: 256, z: 145, yaw: 0, pitch: 2, ...TURN },
    { label: 'fort: walking the road to the gate', world: w, x: f.front.x + o[0] * 14, z: f.front.z + o[1] * 14, yaw: deg(Math.atan2(-o[0], -o[1])), pitch: 2, ...F },
    { label: 'fort: walking the wall walk', world: w, x: wc.x, z: wc.z, y: wc.y, yaw: deg(Math.atan2(best.dx, best.dz)), pitch: -3, ...F },
    { label: 'fort: turning in the courtyard', world: w, x: yc.x, z: yc.z, y: pl.standOn(yc.x, yc.z, yc.y - 1.7) + 1.7, yaw: yc.yaw, pitch: yc.pitch, ...TURN },
  ];
  // (phase 3b) the villages: walking into each along its road, walking a
  // street, crossing a bridge, turning on the green
  const deg2 = (a) => a * 180 / Math.PI;
  w.sites.villages.forEach((v, q) => {
    const p = v.plan, rd = w.roads.find((r) => r.to === `village ${q + 1}`);
    let k = 0;
    for (let i = 0; i < rd.n; i++) { const d = Math.min(...p.houses.map((h) => Math.hypot(h.x - rd.x[i], h.z - rd.z[i]))); k = i; if (d >= 35) break; }
    const yaw = deg2(Math.atan2(rd.x[Math.max(0, k - 8)] - rd.x[k], rd.z[Math.max(0, k - 8)] - rd.z[k]));
    RUNS.push({ label: `village ${q + 1} (${p.pattern}): walking in along its road`, world: w, x: rd.x[k], z: rd.z[k], yaw, pitch: 1, stand: true, ...F });
    if (p.pattern === 'street') {
      const i0 = Math.min(rd.n - 1, 40), i1 = Math.max(0, i0 - 10);
      RUNS.push({ label: `village ${q + 1} (street): walking its street`, world: w, x: rd.x[i0], z: rd.z[i0], yaw: deg2(Math.atan2(rd.x[i1] - rd.x[i0], rd.z[i1] - rd.z[i0])), pitch: 0, stand: true, ...F });
    }
    if (p.green) RUNS.push({ label: `village ${q + 1} (green): turning on the green`, world: w, x: p.green.x + p.green.r * 0.2, z: p.green.z - p.green.r * 0.3, yaw: 0, pitch: 3, stand: true, ...TURN });
  });
  if (w.sites.bridges && w.sites.bridges.length) {
    const b = w.sites.bridges[0], ux = Math.cos(b.a), uz = Math.sin(b.a);
    const x = b.x - ux * (b.len / 2 + 4), z = b.z - uz * (b.len / 2 + 4);
    RUNS.push({ label: `crossing the ${b.style} bridge`, world: w, x, z, yaw: deg2(Math.atan2(ux, uz)), pitch: 0, stand: true, ...F });
  }
  const out = [];
  if (a.only) RUNS = RUNS.filter((r) => String(a.only).split(',').some((w2) => r.label.includes(w2)));
  for (const run of RUNS) {
    const be = BE.createCpuBackend(run.world), fr = [];
    const way = (run.yaw + run.dir) * Math.PI / 180;
    for (let i = 0; i < frames + 1; i++) {
      const x = run.x + Math.sin(way) * run.step * i, z = run.z + Math.cos(way) * run.step * i;
      // (`stand`: on whatever is underfoot, a bridge's deck say)
      const y = run.y ?? (run.stand ? pl.supportAt(x, z, OB.groundAt(run.world.terrain, x, z) + 3) : OB.groundAt(run.world.terrain, x, z)) + 1.7;
      const cam = { x, z, y, yaw: (run.yaw + run.turn * i) * Math.PI / 180, pitch: run.pitch * Math.PI / 180 };
      const fq = { seq: i, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: 14, t: 0, day: 0, look };
      const hits = new Uint8Array(n * CT.HIT_STRIDE);
      for (let k = 0; k < 400; k++) { be.render(fq, 0, cols, hits); if (be.settled) break; }
      const mats = new Uint8Array(n), mat = new Uint8Array(n);
      for (let k = 0; k < n; k++) { mat[k] = hits[k * CT.HIT_STRIDE]; mats[k] = BLD.has(mat[k]) ? 1 : 0; }
      const cells = new Uint8Array(n * 8);
      RS.resolveStripe(RS.makePalette(14, 0, 'moon'), hits, cells, cols, rows, 0, fq);
      fr.push({ cells, mats, mat });
    }
    let bc = 0, gf = 0, cf = 0, agf = 0, acf = 0;
    const byMat = {};
    for (let i = 2; i < fr.length; i++) {
      const A = fr[i - 2], B = fr[i - 1], C = fr[i];
      for (let k = 0; k < n; k++) {
        const q = k * 8, bld = A.mats[k] || B.mats[k] || C.mats[k];
        if (a.bymat && bld) { const m = CT.MAT_NAMES[B.mat[k]]; const fg = A.cells[q + 3] === C.cells[q + 3] && A.cells[q + 3] !== B.cells[q + 3]; byMat[m] = byMat[m] || [0, 0]; byMat[m][0]++; if (fg) byMat[m][1]++; }
        const flipG = A.cells[q + 3] === C.cells[q + 3] && A.cells[q + 3] !== B.cells[q + 3];
        const jump = Math.max(Math.abs(A.cells[q] - B.cells[q]), Math.abs(A.cells[q + 1] - B.cells[q + 1]), Math.abs(A.cells[q + 2] - B.cells[q + 2]));
        const back = Math.max(Math.abs(A.cells[q] - C.cells[q]), Math.abs(A.cells[q + 1] - C.cells[q + 1]), Math.abs(A.cells[q + 2] - C.cells[q + 2]));
        const flipC = jump > 6 && back <= jump / 4;
        if (flipG) agf++; if (flipC) acf++;
        if (!bld) continue;
        bc++; if (flipG) gf++; if (flipC) cf++;
      }
    }
    const frN = fr.length - 2;
    if (a.bymat) console.log('   by material:', Object.entries(byMat).sort((x, y) => y[1][1] - x[1][1]).slice(0, 6).map(([m, [c, f]]) => `${m} ${f} flips in ${c} cells`).join(', '));
    out.push({ label: run.label, share: 100 * bc / frN / n, glyph: 100 * gf / Math.max(1, bc), colour: 100 * cf / Math.max(1, bc), allGlyph: 100 * agf / frN / n, allColour: 100 * acf / frN / n });
    console.log(`${run.label}: building cells ${(100 * bc / frN / n).toFixed(1)}% of the frame; on them glyph flips ${(100 * gf / Math.max(1, bc)).toFixed(3)}%, colour flips ${(100 * cf / Math.max(1, bc)).toFixed(3)}%`);
  }
  return out;
}
// ---- people (phase 4a), in Node ---------------------------------------------
// Three views with people in them: turning on the busiest green at midday,
// walking a street past people, and turning in the courtyard at night while
// the watch walks the wall. First with every clock frozen (the people stand
// still where the clock left them: walkers mid-stride), the camera moving:
// blinks counted on the people's own cells (cells that show a person in any
// of the three frames), beside the courtyard's building cells in the same
// run. Then with the camera still and the clock running at one game second
// a second (60 frames a second): the people walk, and what changes and
// changes back on their cells is reported on its own.
async function peopleSet(seed) {
  const G = await import('../src/world/gen/world.js'), PK = await import('../src/world/pack.js');
  const BE = await import('../src/scene/cpu/backend.js'), RS = await import('../src/resolve.js'), { LOOK } = await import('../src/look.js');
  const CT = await import('../src/contract.js'), OB = await import('../src/world/objects.js');
  const PP = await import('../src/world/people/people.js'), MT = await import('../src/world/people/meet.js'), FG = await import('../src/world/people/figure.js');
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value));
  const P = PP.buildPeople(w), np = P.persons.length, FS = FG.FS;
  const BLD = new Set([CT.MAT.STONE, CT.MAT.MASONRY, CT.MAT.TIMBER, CT.MAT.PLASTER, CT.MAT.ROOF, CT.MAT.WINDOW]);
  const PPL = new Set([CT.MAT.SKIN, CT.MAT.SKIN2, CT.MAT.HAIR, CT.MAT.LINEN, CT.MAT.RUSSET, CT.MAT.OCHRE, CT.MAT.MOSS, CT.MAT.SLATE, CT.MAT.UMBER, CT.MAT.CHARCOAL, CT.MAT.LEATHER, CT.MAT.IRON]);
  const cols = 360, rows = 112, n = cols * rows, look = { cloud: 'B', meadow: 2, shallows: 'blue' };
  const pl = P.p, deg = (x) => x * 180 / Math.PI;
  // (`only`: 'still' keeps those standing, sitting, working or asleep, and
  // 'walking' only those walking; the rest are left out)
  const stAt = (day, hour, only) => {
    const st = new Float32Array(np * FS), segs = [], along = new Float64Array(np);
    for (let i = 0; i < np; i++) { segs[i] = PP.stateAt(P, i, day, hour, st, i * FS); along[i] = PP.alongOf(P, i, segs[i], hour); }
    MT.adjust(st, np, segs, along, null, pl);
    if (only) for (let i = 0; i < np; i++) { const o = i * FS, w2 = st[o + FG.S.POSE] === FG.POSE.WALK; if (only === 'still' ? w2 : !w2) st[o + FG.S.POSE] = FG.POSE.HIDDEN; }
    const lit = new Uint8Array(1 + 3 * 32 + 32); PP.litGroups(P, day, hour, lit);
    return { st, lit };
  };
  // the busiest green (most people standing on it at midday), the street
  const V = P.villages.filter((v) => v.greens.length);
  const near = (x, z, R, s) => { let k = 0; for (let i = 0; i < np; i++) { const o = i * FS; if (s.st[o + FG.S.POSE] !== FG.POSE.HIDDEN && Math.hypot(s.st[o] - x, s.st[o + 1] - z) < R) k++; } return k; };
  const noon = stAt(0, 12.2);
  const RUNS = [];
  const gv = V.map((v) => [v, w.sites.villages[v.q].plan.green]).sort((A, B) => near(B[1].x, B[1].z, B[1].r + 4, noon) - near(A[1].x, A[1].z, A[1].r + 4, noon))[0];
  if (gv) {
    const c = gv[1];
    RUNS.push({ label: `village ${gv[0].q + 1}: turning on the green at midday (${near(c.x, c.z, c.r + 4, noon)} people on it)`, x: c.x + c.r * 0.2, z: c.z - c.r * 0.3, yaw: 0, pitch: 3, hour: 12.2, ...TURN });
  }
  // (the street: of the street village's road and lanes, the spot and the
  // quarter hour with the most people from 3 to 25 m ahead)
  const sv = w.sites.villages.findIndex((v) => v.plan.pattern === 'street');
  if (sv >= 0) {
    const rd = w.roads.find((q) => q.to === `village ${sv + 1}`), lines = [rd, ...(w.sites.villages[sv].plan.lanes || [])];
    let best = null;
    for (let hq = 6 * 4; hq <= 20 * 4; hq++) {
      const s = stAt(0, hq / 4);
      for (const L of lines) for (let i = 10; i < L.n - 10; i += 6) {
        const fx = L.x[i - 10] - L.x[i], fz = L.z[i - 10] - L.z[i], fl = Math.hypot(fx, fz) || 1;
        let k = 0, clear = true;
        for (let j = 0; j < np; j++) {
          const o = j * FS; if (s.st[o + FG.S.POSE] === FG.POSE.HIDDEN) continue;
          const dx = s.st[o] - L.x[i], dz = s.st[o + 1] - L.z[i], d = Math.hypot(dx, dz);
          if (d > 3 && d < 25 && (dx * fx + dz * fz) / fl > 0.75 * d) k++;
          // (nobody on the walk itself: in the game one would step round, or they would)
          const along = (dx * fx + dz * fz) / fl, lat = Math.abs(dx * fz - dz * fx) / fl;
          if (along > -1 && along < F.step * frames + 1.5 && lat < 1.5) clear = false;
        }
        if (!clear) continue;
        if (!best || k > best.k) best = { k, hour: hq / 4, x: L.x[i], z: L.z[i], yaw: deg(Math.atan2(fx, fz)) };
      }
    }
    const hh = Math.floor(best.hour), mm = Math.round((best.hour - hh) * 60);
    RUNS.push({ label: `village ${sv + 1}: walking its street at ${hh}:${String(mm).padStart(2, '0')}, past people (${best.k} ahead)`, x: best.x, z: best.z, yaw: best.yaw, pitch: 0, hour: best.hour, ...F });
  }
  const wc = (await import('../src/world/people/cameras.js')).peopleCameras(w, P).find((c) => c.name.startsWith('the wall walk'));
  if (wc) RUNS.push({ label: 'the wall walk at 23:00, from the courtyard, turning', x: wc.x, z: wc.z, y: wc.y, yaw: wc.yaw, pitch: wc.pitch, hour: 23.0, step: 0, dir: 0, turn: 0.15 });
  const out = [];
  const render = (be, cam, hour, t, s) => {
    const fq = { seq: 0, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour, t, day: 0, look, people: s.st, lit: s.lit };
    const hits = new Uint8Array(n * CT.HIT_STRIDE);
    for (let k = 0; k < 400; k++) { be.render(fq, 0, cols, hits); if (be.settled) break; }
    const mat = new Uint8Array(n); for (let k = 0; k < n; k++) mat[k] = hits[k * CT.HIT_STRIDE];
    const cells = new Uint8Array(n * 8);
    RS.resolveStripe(RS.makePalette(hour, 0, 'moon'), hits, cells, cols, rows, 0, fq);
    return { cells, mat };
  };
  const byMat = {};
  const count = (fr, sets) => {
    const res = sets.map(() => ({ c: 0, g: 0, k: 0 }));
    for (let i = 2; i < fr.length; i++) {
      const A = fr[i - 2], B = fr[i - 1], C = fr[i];
      for (let k = 0; k < n; k++) {
        const q = k * 8;
        const flipG = A.cells[q + 3] === C.cells[q + 3] && A.cells[q + 3] !== B.cells[q + 3];
        const jump = Math.max(Math.abs(A.cells[q] - B.cells[q]), Math.abs(A.cells[q + 1] - B.cells[q + 1]), Math.abs(A.cells[q + 2] - B.cells[q + 2]));
        const back = Math.max(Math.abs(A.cells[q] - C.cells[q]), Math.abs(A.cells[q + 1] - C.cells[q + 1]), Math.abs(A.cells[q + 2] - C.cells[q + 2]));
        const flipC = jump > 6 && back <= jump / 4;
        sets.forEach((S2, j) => { if (S2.has(A.mat[k]) || S2.has(B.mat[k]) || S2.has(C.mat[k])) { res[j].c++; if (flipG) res[j].g++; if (flipC) res[j].k++; if (a.bymat && j === 0) { const m = `${CT.MAT_NAMES[A.mat[k]]}>${CT.MAT_NAMES[B.mat[k]]}>${CT.MAT_NAMES[C.mat[k]]}`; if (flipG) byMat[m] = (byMat[m] || 0) + 1; if (flipC) byMat["c:" + m] = (byMat["c:" + m] || 0) + 1; } } });
      }
    }
    const frN = fr.length - 2;
    return res.map((x) => ({ share: 100 * x.c / frN / n, glyph: 100 * x.g / Math.max(1, x.c), colour: 100 * x.k / Math.max(1, x.c) }));
  };
  for (const run of (a.only ? RUNS.filter((q) => String(a.only).split(',').some((w2) => q.label.includes(w2))) : RUNS)) {
    // the clock frozen, the camera moving: the still figures (standing,
    // sitting, working), then the walkers caught mid-stride, each alone
    const way = (run.yaw + run.dir) * Math.PI / 180;
    const pass = (only) => {
      const be2 = BE.createCpuBackend(w), out2 = [], s = stAt(0, run.hour, only);
      for (let i = 0; i < frames + 1; i++) {
        const x = run.x + Math.sin(way) * run.step * i, z = run.z + Math.cos(way) * run.step * i;
        const y = run.y ?? pl.supportAt(x, z, OB.groundAt(w.terrain, x, z) + 3) + 1.7;
        out2.push(render(be2, { x, z, y, yaw: (run.yaw + run.turn * i) * Math.PI / 180, pitch: run.pitch * Math.PI / 180 }, run.hour, 0, s));
      }
      return out2;
    };
    const [ps, bs] = count(pass('still'), [PPL, BLD]);
    const [pw] = count(pass('walking'), [PPL]);
    let be;
    if (a.bymat) { console.log('   flips by material (before > during > after):', Object.entries(byMat).sort((x, y) => y[1] - x[1]).slice(0, a.bymat === 'all' ? 999 : 12).map(([m, c]) => `${m} ${c}`).join(', ')); for (const k in byMat) delete byMat[k]; }
    // moving: the camera still, the clock running
    be = BE.createCpuBackend(w); const fm = [];
    const y0 = run.y ?? pl.supportAt(run.x, run.z, OB.groundAt(w.terrain, run.x, run.z) + 3) + 1.7;
    for (let i = 0; i < frames + 1; i++) {
      const hour = run.hour + i / 60 / 3600;
      fm.push(render(be, { x: run.x, z: run.z, y: y0, yaw: run.yaw * Math.PI / 180, pitch: run.pitch * Math.PI / 180 }, run.hour, i / 60, stAt(0, hour)));
    }
    const [pm] = count(fm, [PPL]);
    out.push({ label: run.label, ps, bs, pw, pm });
    console.log(`${run.label}: still figures ${ps.share.toFixed(2)}% of the frame, glyph flips ${ps.glyph.toFixed(3)}%, colour ${ps.colour.toFixed(3)}%; walkers (frozen) ${pw.share.toFixed(2)}%, glyph ${pw.glyph.toFixed(3)}%, colour ${pw.colour.toFixed(3)}%; buildings glyph ${bs.glyph.toFixed(3)}%, colour ${bs.colour.toFixed(3)}%; walking, camera still: glyph ${pm.glyph.toFixed(3)}%, colour ${pm.colour.toFixed(3)}%`);
  }
  return out;
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
          // (the look set compares options against the phase 0b look; the
          // world set runs the settled look)
          if (L.setLook) { if (run.scene === 'world' || run.scene === 'yard') L.resetLook(); else L.setLook({ cloud: 'A', meadow: 0, shallows: 'warm', ...(run.look || {}) }); }
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
  console.log(`\n| run${a.weather ? ' | weather' : ''} | blinking cells per frame | glyph blinks | colour blinks (>6 levels) | cells changing at all | glyph flips | colour flips (>6 levels) |`);
  console.log(`|---${a.weather ? '|---' : ''}|---|---|---|---|---|---|`);
  for (const r of results) console.log(`| ${r.label}${a.weather ? ` | ${r.weatherName}` : ''} | ${f3(r.blinkPct)} | ${f3(r.glyphPct)} | ${f3(r.colourPct)} | ${r.changedPct.toFixed(1)}% | ${f3(r.glyphFlipPct)} | ${f3(r.colourFlipPct)} |`);
}
