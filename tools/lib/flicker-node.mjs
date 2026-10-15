// The flicker tool's runs in Node (tools/flicker.mjs --skyline,
// --buildings, --people, --animals): each a walk or a turn rendered at 360 x
// 112 (density 3) with the real CPU backend and resolve step, its blinks
// counted on the cells of what it is about.
import { args } from './serve.mjs';

const a = args();
const frames = Number(a.frames || 60);
// the motions: walking sideways, walking forward, turning (metres and degrees a frame)
export const W = { step: 0.075, dir: 90, turn: 0 }, F = { step: 0.075, dir: 0, turn: 0 }, TURN = { step: 0, dir: 0, turn: 0.3 };

// ---- the far skyline (phase 2a), in Node --------------------------------------
// Turning at 18 degrees a second from the spawn and the main lake's shore (the
// world's own cameras, which look toward the range), density 3, every clock
// frozen: blinks (a cell that changes and changes back) where the cell goes
// between sky (sky, cloud, sun, moon, stars) and land are the skyline's crawl.
export async function skyline(root, seed) {
  const G = await import(`${root}/src/world/gen/world.js`), PK = await import(`${root}/src/world/pack.js`);
  const BE = await import(`${root}/src/scene/cpu/backend.js`), RS = await import(`${root}/src/resolve.js`), LK = await import(`${root}/src/look.js`);
  const CT = await import(`${root}/src/contract.js`), OB = await import(`${root}/src/world/objects.js`);
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value));
  // (the look in use, for an older build given by --ref, which still reads
  // its look candidates; this one has none and ignores it)
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
      RS.resolveStripe(RS.makePalette(14, 0), hits, cells, cols, rows, 0, f);
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
export async function buildings(seed) {
  const { buildWorld } = await import('../../src/world/world.js');
  const G = await import('../../src/world/gen/world.js'), PK = await import('../../src/world/pack.js');
  const BE = await import('../../src/scene/cpu/backend.js'), RS = await import('../../src/resolve.js'), { LOOK } = await import('../../src/look.js');
  const CT = await import('../../src/contract.js'), OB = await import('../../src/world/objects.js'), { Player } = await import('../../src/app/player.js');
  const lab = buildWorld();
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value)), f = w.sites.fort;
  const BLD = new Set([CT.MAT.STONE, CT.MAT.MASONRY, CT.MAT.TIMBER, CT.MAT.PLASTER, CT.MAT.ROOF, CT.MAT.WINDOW,
    CT.MAT.THATCH, CT.MAT.PLASTER2, CT.MAT.PLASTER3, CT.MAT.TIMBER2, CT.MAT.TIMBER3]);
  const cols = 360, rows = 112, n = cols * rows;
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
    // (phase 5b) toward the curtain wall between the first two towers, from
    // 25 m, square on: the range its head joints are now drawn to
    ...(() => { const tw = w.fortDesc.pieces.filter((p) => p.kind === 'tower'); const mx = (tw[0].at[0] + tw[1].at[0]) / 2, mz = (tw[0].at[1] + tw[1].at[1]) / 2; let nx = -(tw[1].at[1] - tw[0].at[1]), nz = tw[1].at[0] - tw[0].at[0]; const l = Math.hypot(nx, nz); nx /= l; nz /= l; if (nx * (mx - f.x) + nz * (mz - f.z) < 0) { nx = -nx; nz = -nz; } return [{ label: 'fort: walking toward the wall from 25 m', world: w, x: mx + nx * 25, z: mz + nz * 25, yaw: deg(Math.atan2(-nx, -nz)), pitch: 4, ...F }, { label: 'fort: walking along the wall 20 m out', world: w, x: mx + nx * 20 - nz * 2, z: mz + nz * 20 + nx * 2, yaw: deg(Math.atan2(-nx, -nz)), pitch: 4, ...W }]; })(),
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
      const fq = { seq: i, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: 14, t: 0, day: 0 };
      const hits = new Uint8Array(n * CT.HIT_STRIDE);
      for (let k = 0; k < 400; k++) { be.render(fq, 0, cols, hits); if (be.settled) break; }
      const mats = new Uint8Array(n), mat = new Uint8Array(n);
      for (let k = 0; k < n; k++) { mat[k] = hits[k * CT.HIT_STRIDE]; mats[k] = BLD.has(mat[k]) ? 1 : 0; }
      const cells = new Uint8Array(n * 8);
      RS.resolveStripe(RS.makePalette(14, 0), hits, cells, cols, rows, 0, fq);
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
export async function peopleSet(seed) {
  const G = await import('../../src/world/gen/world.js'), PK = await import('../../src/world/pack.js');
  const BE = await import('../../src/scene/cpu/backend.js'), RS = await import('../../src/resolve.js'), { LOOK } = await import('../../src/look.js');
  const CT = await import('../../src/contract.js'), OB = await import('../../src/world/objects.js');
  const PP = await import('../../src/world/people/people.js'), MT = await import('../../src/world/people/meet.js'), FG = await import('../../src/world/people/figure.js');
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value));
  const P = PP.buildPeople(w), np = P.persons.length, FS = FG.FS;
  const BLD = new Set([CT.MAT.STONE, CT.MAT.MASONRY, CT.MAT.TIMBER, CT.MAT.PLASTER, CT.MAT.ROOF, CT.MAT.WINDOW]);
  const PPL = new Set([CT.MAT.SKIN, CT.MAT.SKIN2, CT.MAT.HAIR, CT.MAT.LINEN, CT.MAT.RUSSET, CT.MAT.OCHRE, CT.MAT.MOSS, CT.MAT.SLATE, CT.MAT.UMBER, CT.MAT.CHARCOAL, CT.MAT.LEATHER, CT.MAT.IRON]);
  const cols = 360, rows = 112, n = cols * rows;
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
    // (phase 5b: --street-hour 11.5 holds it to one hour, as phase 4a's run)
    const h0 = a['street-hour'] ? Math.round(Number(a['street-hour']) * 4) : 6 * 4, h1 = a['street-hour'] ? h0 : 20 * 4;
    for (let hq = h0; hq <= h1; hq++) {
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
    if (a.where) console.log(`street walk from ${best.x.toFixed(2)},${best.z.toFixed(2)} yaw ${best.yaw.toFixed(2)} at ${best.hour}`);
    const hh = Math.floor(best.hour), mm = Math.round((best.hour - hh) * 60);
    RUNS.push({ label: `village ${sv + 1}: walking its street at ${hh}:${String(mm).padStart(2, '0')}, past people (${best.k} ahead)`, x: best.x, z: best.z, yaw: best.yaw, pitch: 0, hour: best.hour, ...F });
  }
  const wc = (await import('../../src/world/people/cameras.js')).peopleCameras(w, P).find((c) => c.name.startsWith('the wall walk'));
  if (wc) RUNS.push({ label: 'the wall walk at 23:00, from the courtyard, turning', x: wc.x, z: wc.z, y: wc.y, yaw: wc.yaw, pitch: wc.pitch, hour: 23.0, step: 0, dir: 0, turn: 0.15 });
  const out = [];
  const render = (be, cam, hour, t, s) => {
    const fq = { seq: 0, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour, t, day: 0, people: s.st, lit: s.lit };
    const hits = new Uint8Array(n * CT.HIT_STRIDE);
    for (let k = 0; k < 400; k++) { be.render(fq, 0, cols, hits); if (be.settled) break; }
    const mat = new Uint8Array(n); for (let k = 0; k < n; k++) mat[k] = hits[k * CT.HIT_STRIDE];
    const cells = new Uint8Array(n * 8);
    RS.resolveStripe(RS.makePalette(hour, 0), hits, cells, cols, rows, 0, fq);
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
// ---- animals and wild ground detail (phase 4b), in Node ---------------------
export async function animalsSet(seed) {
  const G = await import('../../src/world/gen/world.js'), PK = await import('../../src/world/pack.js');
  const BE = await import('../../src/scene/cpu/backend.js'), RS = await import('../../src/resolve.js'), { LOOK } = await import('../../src/look.js');
  const CT = await import('../../src/contract.js'), OB = await import('../../src/world/objects.js');
  const PP = await import('../../src/world/people/people.js'), AB = await import('../../src/world/animals/build.js'), AST = await import('../../src/world/animals/state.js');
  const AM = await import('../../src/world/animals/meet.js'), AK = await import('../../src/world/animals/kinds.js'), ASH = await import('../../src/world/animals/shapes.js');
  const AC = await import('../../src/world/animals/cameras.js');
  const g = G.generateWorld(seed); let r; while (!(r = g.next()).done);
  const w = PK.unpackWorld(PK.packWorld(r.value));
  const P = PP.buildPeople(w), An = AB.buildAnimals(w, P), N0 = An.members.length;
  // (--noshadow: the animals' shadows off, to tell what flickers)
  if (a.noshadow) LOOK.animals.shadow.dark = 0;
  const M = CT.MAT;
  const ANI = new Set([M.WOOL, M.HIDE, M.FAWN, M.GULL, M.CROW, M.DUCK, M.DUCKHEAD, M.HARE, M.CHARCOAL, M.LINEN, M.RUSSET, M.UMBER, M.OCHRE, M.SLATE]);
  const WILD = new Set([M.ROCK, M.BARK, M.WOOD, M.REED, M.FLOWERA, M.FLOWERB, M.FLOWERC, M.PASTURE]);
  const cols = 360, rows = 112, n = cols * rows;
  const pl = P.p, deg = (x) => x * 180 / Math.PI;
  const stAt = (day, hour, cam) => {
    const st = new Float32Array(N0 * AK.AS), ids = new Int32Array(N0);
    const near = cam ? [cam.x, cam.z, cam.y - 1.7] : [];
    const k = a.noanimals ? 0 : AST.animalsAt(An, day, hour, near, st, ids);
    AM.settle(st, k, near, pl, cam ? { x: cam.x, z: cam.z, r: 160 } : null);
    return { st: st.slice(0, k * AK.AS), ids, k };
  };
  const marksOf = (s, cam) => {
    const ty = Math.tan(LOOK.fovY * Math.PI / 360), colAngle = 2 * ty * (cols / (2 * rows)) / cols, out = new Float32Array(N0 * 6);
    const k = ASH.birdMarks(s.st, s.k, (i) => An.members[s.ids[i]].group, cam, colAngle, out);
    return out.slice(0, k);
  };
  const RUNS = [];
  const cams = AC.animalCameras(w, An);
  const pc = cams.find((c) => c.name.startsWith('a pasture'));
  if (pc) RUNS.push({ label: 'beside a grazing flock, turning', x: pc.x, z: pc.z, yaw: pc.yaw - 9, pitch: pc.pitch, hour: pc.time, ...TURN });
  // the densest boulder field (most boulders within 25 m), walked through
  const pieces = w.kitDesc.pieces;
  const bs = pieces.filter((q) => q.kind === 'boulder');
  let bf = null;
  for (const b of bs) { const k = bs.filter((q) => Math.hypot(q.at[0] - b.at[0], q.at[1] - b.at[1]) < 25).length; if (!bf || k > bf.k) bf = { k, b }; }
  if (bf) {
    // (from 12 m out, walking through its middle: each step clear by the walking rules)
    const cx = bf.b.at[0], cz = bf.b.at[1];
    let best = null;
    for (let t = 0; t < 16; t++) {
      const a2 = t * Math.PI / 8, x = cx - Math.sin(a2) * 10, z = cz - Math.cos(a2) * 10;
      let ok = true;
      for (let i = 0; i <= frames && ok; i++) { const px = x + Math.sin(a2) * F.step * i, pz = z + Math.cos(a2) * F.step * i; if (pl.blocked(px, pz, pl.supportAt(px, pz, OB.groundAt(w.terrain, px, pz) + 3))) ok = false; }
      if (ok) { best = { x, z, yaw: deg(a2) }; break; }
    }
    if (best) RUNS.push({ label: `walking toward a boulder field (${bf.k} boulders within 25 m)`, x: best.x, z: best.z, yaw: best.yaw, pitch: -4, hour: 14, ...F });
  }
  // the biggest reed bed, walked into
  const rb = pieces.filter((q) => q.kind === 'reeds').sort((A, B) => B.r - A.r)[0];
  if (rb) {
    let best = null;
    for (let t = 0; t < 16 && !best; t++) {
      const a2 = t * Math.PI / 8, x = rb.at[0] - Math.sin(a2) * (rb.r + 3), z = rb.at[1] - Math.cos(a2) * (rb.r + 3);
      const j = Math.round(z) * w.NN + Math.round(x);
      if (w.terrain.wWater[j] > 127 && w.terrain.levels[0].H[j] - w.terrain.ground[j] > 0.5) continue;
      best = { x, z, yaw: deg(a2) };
    }
    if (best) {
      const ux = Math.sin(best.yaw * Math.PI / 180), uz = Math.cos(best.yaw * Math.PI / 180);
      RUNS.push({ label: 'walking up to a reed bed, from 9 m off its edge', x: best.x - ux * 6, z: best.z - uz * 6, yaw: best.yaw, pitch: -6, hour: 14, ...F, wade: true });
      RUNS.push({ label: 'walking into a reed bed (it parts round you)', x: best.x, z: best.z, yaw: best.yaw, pitch: -6, hour: 14, ...F, wade: true });
    }
  }
  // a flock of small birds crossing: the camera under its way, looking up
  const fg = An.groups.find((q) => q.type === 'finches');
  let fly = null;
  if (fg) {
    // (the moment the flock is highest over the ground, mid-crossing)
    for (let m = 9 * 60; m < 17 * 60; m += 0.1) {
      const st = new Float32Array(fg.members.length * AK.AS), ids = new Int32Array(fg.members.length);
      const n = AST.animalsAt(An, 0, m / 60, [], st, ids, [fg]);
      let k = 0, x = 0, z = 0, y = 0;
      for (let i = 0; i < n; i++) if (st[i * AK.AS + AK.A.POSE] === AK.APOSE.FLY) { k++; x += st[i * AK.AS]; z += st[i * AK.AS + 1]; y += st[i * AK.AS + 2]; }
      if (k > n / 2) { const up = y / k - OB.groundAt(w.terrain, x / k, z / k); if (!fly || up > fly.up) fly = { hour: m / 60, x: x / k, z: z / k, y: y / k, up }; else if (up < fly.up - 3) break; }
    }
  }
  if (fly) {
    // (the camera 40 m off and looking at them; the run starts a second before)
    const cx = fly.x + 30, cz = fly.z + 30, cy = pl.supportAt(cx, cz, OB.groundAt(w.terrain, cx, cz) + 0.3) + 1.7;
    RUNS.push({ label: 'small birds crossing the sky (camera still, clock running)', x: cx, z: cz, y: cy, yaw: deg(Math.atan2(-30, -30)), pitch: deg(Math.atan2(fly.y - cy, 42)), hour: fly.hour - 1 / 3600, step: 0, dir: 0, turn: 0, movingOnly: true });
  }
  const render = (be, cam, hour, t, s) => {
    const fq = { seq: 0, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour, t, day: 0, animals: s.st, marks: marksOf(s, cam) };
    const hits = new Uint8Array(n * CT.HIT_STRIDE);
    for (let k = 0; k < 400; k++) { be.render(fq, 0, cols, hits); if (be.settled) break; }
    // (the ground detail's materials are counted only within 120 m: past
    // that the rock is the mountains')
    const mat = new Uint8Array(n); for (let k = 0; k < n; k++) { const o = k * CT.HIT_STRIDE, m = hits[o], d = (hits[o + 6] | (hits[o + 7] << 8)) / 10; mat[k] = WILD.has(m) && d > 120 ? 255 : m; }
    const cells = new Uint8Array(n * 8);
    RS.resolveStripe(RS.makePalette(hour, 0), hits, cells, cols, rows, 0, fq);
    return { cells, mat, hits: process.env.DUMP ? hits : null };
  };
  let dumped = 0;
  const count = (fr, sets) => {
    const res = sets.map(() => ({ c: 0, g: 0, k: 0 }));
    for (let i = 2; i < fr.length; i++) {
      const A = fr[i - 2], B = fr[i - 1], C = fr[i];
      if (process.env.DUMP && dumped < 3) {
        for (let k = 0; k < n && dumped < 3; k++) {
          const q = k * 8;
          if (!((process.env.DUMP === 'wild' ? WILD : ANI).has(A.mat[k]) && A.cells[k * 8 + 3] === C.cells[k * 8 + 3] && A.cells[k * 8 + 3] !== B.cells[k * 8 + 3])) continue;
          dumped++;
          const cx = k % cols, cy = Math.floor(k / cols);
          console.log(`flip at col ${cx} row ${cy}, frames ${i - 2}..${i}`);
          for (const F2 of [A, B, C]) if (F2.hits) { const o = k * CT.HIT_STRIDE; console.log('  rec', Array.from(F2.hits.slice(o, o + 8)), 'cell', Array.from(F2.cells.slice(q, q + 8))); }
          for (const [nm, F2] of [['A', A], ['B', B], ['C', C]]) {
            const lines = [];
            for (let y = Math.max(0, cy - 4); y <= Math.min(rows - 1, cy + 3); y++) { let ln = ''; for (let x = Math.max(0, cx - 12); x <= Math.min(cols - 1, cx + 12); x++) { const m = F2.mat[y * cols + x]; ln += x === cx && y === cy ? '@' : m === M.REED ? 'r' : m === M.WATER ? '~' : m === M.SKY ? ' ' : m === M.WOOL ? 'w' : m === M.CHARCOAL ? 'c' : m === M.LINEN ? 'l' : m === M.PASTURE ? '.' : m === M.GRASS ? ',' : m === M.STONE ? 's' : '?'; } lines.push(ln); }
            console.log(nm + '\n' + lines.join('\n'));
          }
        }
      }
      for (let k = 0; k < n; k++) {
        const q = k * 8;
        const flipG = A.cells[q + 3] === C.cells[q + 3] && A.cells[q + 3] !== B.cells[q + 3];
        const jump = Math.max(Math.abs(A.cells[q] - B.cells[q]), Math.abs(A.cells[q + 1] - B.cells[q + 1]), Math.abs(A.cells[q + 2] - B.cells[q + 2]));
        const back = Math.max(Math.abs(A.cells[q] - C.cells[q]), Math.abs(A.cells[q + 1] - C.cells[q + 1]), Math.abs(A.cells[q + 2] - C.cells[q + 2]));
        const flipC = jump > 6 && back <= jump / 4;
        sets.forEach((S2, j) => { const has = S2 === 'all' || S2.has(A.mat[k]) || S2.has(B.mat[k]) || S2.has(C.mat[k]); if (has) { res[j].c++; if (flipG) res[j].g++; if (flipC) res[j].k++; if (a.bymat && j === Number(a.bymatset || 0) && (flipG || flipC)) { const m = `${CT.MAT_NAMES[A.mat[k]]}>${CT.MAT_NAMES[B.mat[k]]}>${CT.MAT_NAMES[C.mat[k]]}`; BYM[m] = (BYM[m] || 0) + 1; } } });
      }
    }
    const frN = fr.length - 2;
    return res.map((x) => ({ share: 100 * x.c / frN / n, glyph: 100 * x.g / Math.max(1, x.c), colour: 100 * x.k / Math.max(1, x.c) }));
  };
  const out = [], BYM = {};
  for (const run of (a.only ? RUNS.filter((q) => String(a.only).split(',').some((w2) => q.label.includes(w2))) : RUNS)) {
    const way = (run.yaw + run.dir) * Math.PI / 180;
    // (the eye where the game's own walking rules put it: on the ground, on
    // what one stands on, or wading and swimming in water)
    const eyeAt = (x, z) => run.y ?? (run.wade ? pl.restAt(x, z) : pl.supportAt(x, z, OB.groundAt(w.terrain, x, z) + 3)) + 1.7;
    let still = null, wild = null, all = null;
    if (!run.movingOnly) {
      // the clock frozen, the camera moving (the animals react to where it is)
      const be2 = BE.createCpuBackend(w), fr = [];
      for (let i = 0; i < frames + 1; i++) {
        const x = run.x + Math.sin(way) * run.step * i, z = run.z + Math.cos(way) * run.step * i;
        const cam = { x, z, y: eyeAt(x, z), yaw: (run.yaw + run.turn * i) * Math.PI / 180, pitch: run.pitch * Math.PI / 180 };
        fr.push(render(be2, cam, run.hour, 0, stAt(0, run.hour, cam)));
      }
      [still, wild, all] = count(fr, [ANI, WILD, 'all']);
      if (a.bymat) { console.log('   flips on animal cells by material:', Object.entries(BYM).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([m, c]) => `${m} ${c}`).join(', ')); for (const k in BYM) delete BYM[k]; }
    }
    // moving: the camera still, the clock running at one game second a second
    const be = BE.createCpuBackend(w), fm = [];
    const cam0 = { x: run.x, z: run.z, y: eyeAt(run.x, run.z), yaw: run.yaw * Math.PI / 180, pitch: run.pitch * Math.PI / 180 };
    for (let i = 0; i < frames + 1; i++) { const hour = run.hour + i / 60 / 3600; fm.push(render(be, cam0, hour, i / 60, stAt(0, hour, cam0))); }
    const [mv, mall] = count(fm, [ANI, 'all']);
    out.push({ label: run.label, still, wild, all, mv, mall });
    const f3 = (x) => (x ? `${x.glyph.toFixed(3)}% / ${x.colour.toFixed(3)}% (${x.share.toFixed(2)}% of the frame)` : '-');
    console.log(`${run.label}: still animals ${f3(still)}; wild ground detail ${f3(wild)}; whole frame ${f3(all)}; moving animals, camera still ${f3(mv)}; whole frame ${f3(mall)}`);
  }
  return out;
}
