// The world check's land checks (tools/world-check.mjs): building a seed,
// reaching every site, the roads, the rivers, the trees, the sky test and
// far readability.
import { generateWorld } from '../../src/world/gen/world.js';
import { makeFrame } from '../../src/world/gen/land.js';
import { createCpuBackend } from '../../src/scene/cpu/backend.js';
import { HIT_STRIDE, CELL_STRIDE, MAT, MAT_NAMES } from '../../src/contract.js';
import { resolveStripe, makePalette } from '../../src/resolve.js';
import { KIND } from '../../src/world/gen/water.js';
import { LOOK } from '../../src/look.js';
import { SCALE } from '../../src/world/scale.js';
import { groundAt } from '../../src/world/objects.js';
import { spanAt } from '../../src/world/spans.js';
import { hash2 } from '../../src/world/noise.js';
import { polyDist } from '../../src/world/gen/fort.js';

export function build(seed) {
  const g = generateWorld(seed);
  let r;
  while (!(r = g.next()).done);
  return r.value;
}

// 2. Reachable nodes from the spawn on the 1 m grid.
export function reach(w) {
  const N = w.N, NN = w.NN, G = w.terrain.ground, S = w.terrain.levels[0].H, sp = w.spans;
  const ok = new Uint8Array(NN * NN);
  for (let j = 0; j < NN * NN; j++) {
    const i = j % NN, k = (j - i) / NN;
    if (i < 1 || k < 1 || i > N - 1 || k > N - 1) continue;
    if (S[j] - G[j] > SCALE.chest) continue;
    const s = spanAt(sp, i, k);
    // the wall blocks; its gate does not
    if (s >= 0 && !(sp.flags[s] & 2)) continue;
    ok[j] = 1;
  }
  const seen = new Uint8Array(NN * NN), q = new Int32Array(NN * NN);
  const s0 = Math.round(w.start.z) * NN + Math.round(w.start.x);
  let h = 0, t = 0;
  if (ok[s0]) { seen[s0] = 1; q[t++] = s0; }
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (h < t) {
    const j = q[h++];
    for (const [dx, dz, d] of nb) {
      const m = j + dz * NN + dx;
      if (seen[m] || !ok[m]) continue;
      if (G[m] - G[j] > SCALE.climb * d) continue;   // too steep to walk up
      seen[m] = 1; q[t++] = m;
    }
  }
  const at = (x, z) => {
    // a site counts if any node within 3 m of it is reached
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (seen[(Math.round(z) + dz) * NN + Math.round(x) + dx]) return true;
    return false;
  };
  const s = w.sites;
  const list = [['fort (gate)', s.fort.front], ...s.villages.map((v, i) => [`village ${i + 1}`, v]), ...s.viewpoints.map((v, i) => [`viewpoint ${i + 1}`, v])];
  return { reached: t, sites: list.map(([name, p]) => ({ name, ok: at(p.x, p.z) })) };
}

// 3. Roads: steepest over 4 m along the centre line, deepest water crossed.
export function roads(w) {
  const T = w.terrain, surf = { ground: T.levels[0].H, N: w.N, NN: w.NN };
  let steep = 0, deep = 0, where = null;
  for (const r of w.roads) {
    // (phase 3b: over a bridge, the bridge's road is what is walked)
    const on = (q) => onBridge(w, r.x[q], r.z[q]);
    for (let q = 0; q + 4 < r.n; q++) {
      // (a bridge's deck is laid where the road's bed is, 0.1 m under its line)
      const y0 = on(q) ? r.y[q] - 0.1 : groundAt(surf, r.x[q], r.z[q]), y1 = on(q + 4) ? r.y[q + 4] - 0.1 : groundAt(surf, r.x[q + 4], r.z[q + 4]);
      // the gradient along the road (round a hairpin the straight line is shorter)
      let run = 0;
      for (let u = q; u < q + 4; u++) run += Math.hypot(r.x[u + 1] - r.x[u], r.z[u + 1] - r.z[u]);
      const sl = Math.abs(y1 - y0) / Math.max(1e-6, run);
      if (sl > steep) { steep = sl; where = [Math.round(r.x[q]), Math.round(r.z[q])]; }
      if (!on(q)) deep = Math.max(deep, groundAt(surf, r.x[q], r.z[q]) - groundAt(T, r.x[q], r.z[q]));
    }
  }
  return { steep, deep, where, ok: steep <= SCALE.road.maxSlope && deep <= SCALE.river.ford };
}

// (phase 3b) Is (x, z) on one of the world's bridges?
export function onBridge(w, x, z) {
  for (const b of w.sites.bridges || []) {
    const dx = x - b.x, dz = z - b.z, u = dx * Math.cos(b.a) + dz * Math.sin(b.a), v = -dx * Math.sin(b.a) + dz * Math.cos(b.a);
    if (Math.abs(u) <= b.len / 2 + 0.5 && Math.abs(v) <= 3) return true;
  }
  return false;
}

// 4. Rivers: the water never rises downstream, and the river ends in a lake or the sea.
export function rivers(w) {
  const out = [];
  for (const r of w.rivers) {
    let rises = 0;
    for (let q = 0; q + 1 < r.n; q++) if (r.level[q + 1] > r.level[q] + 1e-4) rises++;
    const e = r.n - 1;
    const end = Math.abs(r.level[e] - SCALE.sea) < 1e-3 ? 'sea' : r.lake[e] >= 0 ? 'lake' : 'neither';
    out.push({ n: r.n, rises, end, ok: rises === 0 && end !== 'neither' });
  }
  return out;
}

// 5. Trees: none in water, none on a road.
export function trees(w) {
  const T = w.terrain, NN = w.NN;
  let wet = 0, road = 0;
  for (const t of w.objects.trees) {
    const j = Math.round(t.z) * NN + Math.round(t.x);
    if (T.wWater[j] > 0 || T.levels[0].H[j] > T.ground[j] + 1e-3) wet++;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (T.wRoad[j + dz * NN + dx] > 0) { road++; dz = dx = 2; }
  }
  return { count: w.objects.trees.length, wet, road, ok: wet === 0 && road === 0 };
}

// 6. The sky test.
export function sky(w, seed, nPts = 300, nRoad = 50) {
  const N = w.N, NN = w.NN, G = w.terrain.ground, frame = makeFrame(seed, N), P = {};
  const be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE);
  const render = (x, z, yawDeg) => {
    const cam = { x, z, y: groundAt(w.terrain, x, z) + SCALE.eye, yaw: yawDeg * Math.PI / 180, pitch: 0 };
    const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 12.5 };
    for (let i = 0; i < 400; i++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    let n = 0;
    for (let c = 0; c < cols * rows; c++) if (hits[c * HIT_STRIDE] <= MAT.STAR) n++;
    return n / (cols * rows);
  };
  const pts = [];
  for (let t = 0; pts.length < nPts && t < 200000; t++) {
    const x = 20 + (N - 40) * hash2(t, 1, seed + 991), z = 20 + (N - 40) * hash2(t, 2, seed + 991);
    const j = Math.round(z) * NN + Math.round(x);
    if (w.terrain.wWater[j]) continue;
    frame.at(x, z, P);
    if (P.g > 0 || P.c < 0) continue;
    if (Math.hypot(G[j + 1] - G[j - 1], G[j + NN] - G[j - NN]) / 2 > SCALE.climb) continue;
    pts.push({ x, z, kind: 'lowland', yaw: 360 * hash2(t, 3, seed + 991) });
  }
  const total = w.roads.reduce((s, r) => s + r.n, 0);
  for (let q = 0; q < nRoad; q++) {
    let d = Math.floor((q + 0.5) / nRoad * total);
    for (const r of w.roads) { if (d < r.n) { pts.push({ x: r.x[d], z: r.z[d], kind: 'road', yaw: 360 * hash2(q, 4, seed + 991) }); break; } d -= r.n; }
  }
  const shares = [];
  for (const p of pts) for (let k = 0; k < 4; k++) shares.push({ s: render(p.x, p.z, p.yaw + 90 * k), kind: p.kind });
  const sorted = shares.map((v) => v.s).sort((p, q) => p - q);
  const median = sorted[Math.floor(sorted.length / 2)];
  const low = sorted.filter((v) => v < 0.15).length / sorted.length;
  const roadMed = shares.filter((v) => v.kind === 'road').map((v) => v.s).sort((p, q) => p - q);
  return { views: sorted.length, median, low, p10: sorted[Math.floor(sorted.length * 0.1)], roadMedian: roadMed[Math.floor(roadMed.length / 2)], ok: median >= 0.35 && low < 0.1 };
}

// 7. Far readability.
export const KITMAT_V = new Set([MAT.STONE, MAT.MASONRY, MAT.TIMBER, MAT.TIMBER2, MAT.TIMBER3, MAT.PLASTER, MAT.PLASTER2, MAT.PLASTER3, MAT.ROOF, MAT.THATCH, MAT.WINDOW]);
export const STEP = 6;
export function farRead(w, gw) {
  const N = w.N, NN = w.NN, kind = gw.kindMap, level = gw.levelMap, lake = gw.sites.lake;
  const be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE), cells = new Uint8Array(cols * rows * CELL_STRIDE);
  // (phase 3a) and from the spawn turned toward the fort, aimed a little
  // over its yard, which must read: its stone, timber, plaster, roofs and
  // windows against the cells round them
  const fort = w.sites.fort, fy = groundAt(w.terrain, w.start.x, w.start.z) + SCALE.eye, fd = Math.hypot(fort.x - w.start.x, fort.z - w.start.z);
  const spots = [{ name: 'spawn', x: w.start.x, z: w.start.z, yaw: w.start.yaw, pitch: 0, range: true },
    { name: 'spawn, toward the fort', x: w.start.x, z: w.start.z, yaw: Math.atan2(fort.x - w.start.x, fort.z - w.start.z) * 180 / Math.PI, pitch: Math.atan2(fort.base + 4 - fy, fd) * 180 / Math.PI, fort: true },
    ...w.sites.viewpoints.map((v, i) => ({ name: `viewpoint ${i + 1}`, x: v.x, z: v.z, yaw: v.yaw, pitch: -6 }))];
  const fortFoot = (x, z) => polyDist(fort.poly, x, z) < 8;
  const KITMAT = new Set([MAT.STONE, MAT.MASONRY, MAT.TIMBER, MAT.PLASTER, MAT.ROOF, MAT.WINDOW]);
  const out = [];
  for (const sp of spots) {
    const cam = { x: sp.x, z: sp.z, y: groundAt(w.terrain, sp.x, sp.z) + SCALE.eye, yaw: sp.yaw * Math.PI / 180, pitch: sp.pitch * Math.PI / 180 };
    const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour: LOOK.hours.day, t: 12.5, day: 0 };
    for (let i = 0; i < 400; i++) { be.render(f, 0, cols, hits); if (be.settled) break; }
    const rec = hits.slice();
    resolveStripe(makePalette(f.hour, 0), hits, cells, cols, rows, 0, f);
    // each cell's ray (the contract's own), to find where it lands
    const ty = Math.tan(f.fovY / 2), tx = ty * f.aspect, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
    const cls = new Int8Array(cols * rows).fill(-1);    // 0 lake, 1 river, 2 forest, 3 road, 4 the fort
    const faces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const k = r * cols + c, o = k * HIT_STRIDE, m = rec[o], d = (rec[o + 6] | (rec[o + 7] << 8)) / 10;
      const X = (2 * (c + 0.5) / cols - 1) * tx, Y = (1 - 2 * (r + 0.5) / rows) * ty;
      const fz = cp - Y * spp, fy = Y * cp + spp, len = Math.hypot(X, fy, fz);
      const hx = cam.x + (X * cy0 + fz * sy0) / len * d, hz = cam.z + (-X * sy0 + fz * cy0) / len * d;
      const j = Math.round(Math.max(0, Math.min(N, hz))) * NN + Math.round(Math.max(0, Math.min(N, hx)));
      if (sp.fort) { if (KITMAT.has(m) && fortFoot(hx, hz)) cls[k] = 4; continue; }
      if (m === MAT.WATER && d < 6500) {
        if (kind[j] === KIND.LAKE && Math.abs(level[j] - lake.level) < 0.3) cls[k] = 0;
        else if (kind[j] === KIND.RIVER) cls[k] = 1;
      } else if ((m === MAT.CONIFER || m === MAT.TRUNK) && d > 150) cls[k] = 2;
      else if (m === MAT.DIRT) cls[k] = 3;
      if (sp.range && d > 800 && d < 6500 && (m === MAT.ROCK || m === MAT.SNOW || m === MAT.GRASS)) faces.push([m, k, rec[o + 1] * (1 - rec[o + 2] / 255)]);
    }
    const mean = (list) => { const s = [0, 0, 0]; for (const k of list) for (let q = 0; q < 3; q++) s[q] += cells[k * CELL_STRIDE + q]; return s.map((v) => v / list.length); };
    const step = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    const res = { name: sp.name, features: {} };
    ['main lake', 'river', 'forest', 'road', 'fort'].forEach((name, q) => {
      if ((q === 4) !== !!sp.fort) return;
      const inside = [], round = [];
      for (let k = 0; k < cols * rows; k++) if (cls[k] === q) inside.push(k);
      if (inside.length < 6) { res.features[name] = null; return; }
      const seen = new Uint8Array(cols * rows);
      for (const k of inside) {
        const c = k % cols, r = (k - c) / cols;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          const kk = rr * cols + cc;
          if (seen[kk] || cls[kk] === q || rec[kk * HIT_STRIDE] <= MAT.STAR || rec[kk * HIT_STRIDE] === MAT.CLOUD) continue;
          seen[kk] = 1; round.push(kk);
        }
      }
      if (round.length < 6) { res.features[name] = null; return; }
      const s = step(mean(inside), mean(round));
      res.features[name] = { cells: inside.length, step: +s.toFixed(1), ok: s > STEP };
    });
    if (sp.range) {
      // lit against shaded, within one material (snow against rock would say nothing)
      let best = null;
      for (const m of [MAT.ROCK, MAT.SNOW, MAT.GRASS]) {
        const list = faces.filter((v) => v[0] === m).sort((p, q) => p[2] - q[2] || p[1] - q[1]);
        if (list.length < 24) continue;
        const qn = Math.floor(list.length / 4);
        const b = list.slice(0, qn).map((v) => v[1]), a = list.slice(list.length - qn).map((v) => v[1]);
        const s = step(mean(a), mean(b));
        if (!best || s > best.step) best = { material: MAT_NAMES[m], lit: a.length, shaded: b.length, step: +s.toFixed(1), ok: s > STEP };
      }
      res.range = best || { ok: false, note: 'range faces not in view' };
    }
    // (the fort must be there to read; the others only where they are seen)
    res.ok = Object.values(res.features).every((v) => !v || v.ok) && (!sp.range || res.range.ok) && (!sp.fort || !!res.features.fort);
    out.push(res);
  }
  return { spots: out, ok: out.every((s) => s.ok) };
}

// 7b. (phase 3b) Each village must read clearly from at least one viewpoint
// (its buildings against the cells round them, as the far features), and
// from that same viewpoint its lights must show at night.
export function villageRead(w) {
  const be = createCpuBackend(w);
  const cols = 360, rows = 112, hits = new Uint8Array(cols * rows * HIT_STRIDE), cells = new Uint8Array(cols * rows * CELL_STRIDE);
  const out = [];
  w.sites.villages.forEach((v, vi) => {
    const p = v.plan, c = p.centre, R = p.radius + 6;
    let best = null;
    for (const [i, vp] of w.sites.viewpoints.entries()) {
      const ey = groundAt(w.terrain, vp.x, vp.z) + SCALE.eye, d = Math.hypot(c.x - vp.x, c.z - vp.z);
      if (d > 1400) continue;
      const cam = { x: vp.x, z: vp.z, y: ey, yaw: Math.atan2(c.x - vp.x, c.z - vp.z), pitch: Math.atan2(c.y + 3 - ey, d) };
      const shot = (hour) => {
        const f = { seq: 1, cam, cols, rows, fovY: LOOK.fovY * Math.PI / 180, aspect: cols / (2 * rows), hour, t: 12.5, day: 0 };
        for (let k = 0; k < 400; k++) { be.render(f, 0, cols, hits); if (be.settled) break; }
        const rec = hits.slice();
        resolveStripe(makePalette(hour, 0), hits, cells, cols, rows, 0, f);
        const ty = Math.tan(f.fovY / 2), tx = ty * f.aspect, cp = Math.cos(cam.pitch), spp = Math.sin(cam.pitch), cy0 = Math.cos(cam.yaw), sy0 = Math.sin(cam.yaw);
        const inV = new Uint8Array(cols * rows);
        for (let r = 0; r < rows; r++) for (let cc = 0; cc < cols; cc++) {
          const k = r * cols + cc, o = k * HIT_STRIDE, dd = (rec[o + 6] | (rec[o + 7] << 8)) / 10;
          const X = (2 * (cc + 0.5) / cols - 1) * tx, Y = (1 - 2 * (r + 0.5) / rows) * ty;
          const fz = cp - Y * spp, fy = Y * cp + spp, len = Math.hypot(X, fy, fz);
          const hx = cam.x + (X * cy0 + fz * sy0) / len * dd, hz = cam.z + (-X * sy0 + fz * cy0) / len * dd;
          if (Math.hypot(hx - c.x, hz - c.z) <= R) inV[k] = 1;
        }
        return { rec, cells: cells.slice(), inV };
      };
      const day = shot(LOOK.hours.day);
      const inside = [], round = [];
      for (let k = 0; k < cols * rows; k++) if (day.inV[k] && KITMAT_V.has(day.rec[k * HIT_STRIDE])) inside.push(k);
      if (inside.length < 6) continue;
      const seen = new Uint8Array(cols * rows), isIn = new Uint8Array(cols * rows);
      for (const k of inside) isIn[k] = 1;
      for (const k of inside) {
        const cc = k % cols, r = (k - cc) / cols;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, c2 = cc + dc;
          if (rr < 0 || c2 < 0 || rr >= rows || c2 >= cols) continue;
          const kk = rr * cols + c2;
          if (seen[kk] || isIn[kk] || day.rec[kk * HIT_STRIDE] <= MAT.STAR || day.rec[kk * HIT_STRIDE] === MAT.CLOUD) continue;
          seen[kk] = 1; round.push(kk);
        }
      }
      if (round.length < 6) continue;
      const mean = (list) => { const sm = [0, 0, 0]; for (const k of list) for (let q = 0; q < 3; q++) sm[q] += day.cells[k * CELL_STRIDE + q]; return sm.map((x) => x / list.length); };
      const A = mean(inside), B = mean(round), step = Math.max(Math.abs(A[0] - B[0]), Math.abs(A[1] - B[1]), Math.abs(A[2] - B[2]));
      const night = shot(LOOK.hours.night);
      let lights = 0;
      for (let k = 0; k < cols * rows; k++) { const m = night.rec[k * HIT_STRIDE]; if (night.inV[k] && (m === MAT.WINDOW || m === MAT.FLAME)) lights++; }
      const res = { viewpoint: i + 1, dist: Math.round(d), cells: inside.length, step: +step.toFixed(1), lights, ok: step > STEP && lights >= 2 };
      if (!best || (res.ok && !best.ok) || (res.ok === best.ok && res.step > best.step)) best = res;
    }
    out.push({ village: vi + 1, pattern: p.pattern, ...(best || { ok: false, note: 'seen from no viewpoint' }) });
  });
  return { villages: out, ok: out.every((x) => x.ok) };
}

// 8. The fort.
