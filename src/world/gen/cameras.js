// The eight world cameras the tools use, found from the data so the same
// code works on any seed (never placed by hand for a flattering frame):
// the spawn view, the main lake's shore, inside a forest stand, a forest
// edge across meadow, a river valley, the coast, a ridge-top vista, and the
// road approaching the fort site. Angles in degrees: yaw 0 looks north (+z),
// 90 east.
import { SCALE } from '../scale.js';
import { KIND } from './water.js';
import { heightAt, clearLine } from './sites.js';

const TAU = Math.PI * 2;
const deg = (r) => r * 180 / Math.PI;

export function worldCameras(world, { seaDist, shore }) {
  const { N, NN, terrain, sites, roads, rivers, kindMap: kind } = world;
  const H = terrain.ground, trees = world.objects.trees;
  const dry = (x, z) => x > 2 && z > 2 && x < N - 2 && z < N - 2 && kind[Math.round(z) * NN + Math.round(x)] === KIND.NONE;
  const slopeAt = (x, z) => Math.hypot(heightAt(H, N, x + 2, z) - heightAt(H, N, x - 2, z), heightAt(H, N, x, z + 2) - heightAt(H, N, x, z - 2)) / 4;
  // trees in 32 m buckets
  const G = 32, gn = Math.ceil(N / G), grid = Array.from({ length: gn * gn }, () => []);
  for (const t of trees) grid[Math.min(gn - 1, Math.floor(t.z / G)) * gn + Math.min(gn - 1, Math.floor(t.x / G))].push(t);
  const near = (x, z, r) => {
    const out = [];
    for (let gz = Math.max(0, Math.floor((z - r) / G)); gz <= Math.min(gn - 1, Math.floor((z + r) / G)); gz++)
      for (let gx = Math.max(0, Math.floor((x - r) / G)); gx <= Math.min(gn - 1, Math.floor((x + r) / G)); gx++)
        for (const t of grid[gz * gn + gx]) if (Math.hypot(t.x - x, t.z - z) <= r) out.push(t);
    return out;
  };
  const roadNear = (x, z) => {
    for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
      const i = Math.round(x + dx), k = Math.round(z + dz);
      if (i >= 0 && k >= 0 && i <= N && k <= N && terrain.wRoad[k * NN + i] > 0) return true;
    }
    return false;
  };
  const count = (gx, gz) => (gx < 0 || gz < 0 || gx >= gn || gz >= gn ? 0 : grid[gz * gn + gx].length);
  const rangeDir = (() => { const s = Math.SQRT1_2; return [s, s]; })();      // the range lies north and east
  const cams = [];

  // 1. the spawn
  const sp = sites.spawn;
  cams.push({ name: 'spawn view', x: sp.x, z: sp.z, yaw: sp.yaw, pitch: 0, time: 'day' });

  // 2. the main lake's shore: a few metres back from the water, looking the
  // longest way across it, toward the range if that is a close second
  {
    const L = sites.lake;
    let best = null;
    for (let q = 0; q < shore.length; q += 2) {
      const [sx, sz] = shore[q];
      const ox = sx - L.x, oz = sz - L.z, ol = Math.hypot(ox, oz) || 1;
      let x = sx, z = sz, s = 0;
      while (!dry(x, z) && s < 60) { x += ox / ol; z += oz / ol; s++; }
      x += ox / ol * 3; z += oz / ol * 3;
      if (!dry(x, z) || slopeAt(x, z) > 0.15) continue;
      for (let a = -40; a <= 40; a += 10) {
        const ang = Math.atan2(-ox, -oz) + a * Math.PI / 180, dx = Math.sin(ang), dz = Math.cos(ang);
        let d = 4, wetRun = 0;
        for (; d < 900; d += 4) {
          const wx = x + dx * d, wz = z + dz * d;
          if (wx < 0 || wz < 0 || wx > N || wz > N) break;
          if (kind[Math.round(wz) * NN + Math.round(wx)] === KIND.LAKE) wetRun = d; else if (d > wetRun + 12 && wetRun) break;
        }
        const ahead = near(x + dx * 12, z + dz * 12, 10).length;
        const score = wetRun + 120 * (dx * rangeDir[0] + dz * rangeDir[1]) - 60 * ahead;
        if (!best || score > best.score) best = { x, z, yaw: deg(ang), score };
      }
    }
    if (best) cams.push({ name: 'main lake shore', x: best.x, z: best.z, yaw: best.yaw, pitch: -4, time: 'day' });
  }

  // 3. inside a forest stand: the densest stand, at the spot farthest from
  // any trunk, looking the way the stand runs on longest
  {
    let bi = -1, bc = 0;
    for (let gz = 2; gz < gn - 2; gz++) for (let gx = 2; gx < gn - 2; gx++) {
      let c = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) c += count(gx + b, gz + a);
      if (c > bc) { bc = c; bi = gz * gn + gx; }
    }
    if (bi >= 0) {
      const cx = (bi % gn + 0.5) * G, cz = (Math.floor(bi / gn) + 0.5) * G;
      const ts = near(cx, cz, 60);
      let fx = cx, fz = cz, room = 0;
      for (let z = cz - 16; z <= cz + 16; z += 0.5) for (let x = cx - 16; x <= cx + 16; x += 0.5) {
        let m = Infinity;
        for (const t of ts) m = Math.min(m, Math.hypot(t.x - x, t.z - z));
        if (m > room) { room = m; fx = x; fz = z; }
      }
      let yaw = 0, bestN = -1;
      for (let a = 0; a < 24; a++) {
        const ang = a / 24 * TAU, dx = Math.sin(ang), dz = Math.cos(ang);
        // trees in a narrow wedge out to 80 m, none right in front of the eye
        let n = 0, blocked = false;
        for (const t of near(fx, fz, 80)) {
          const u = (t.x - fx) * dx + (t.z - fz) * dz, v = Math.abs((t.x - fx) * dz - (t.z - fz) * dx);
          if (u > 0 && v < u * 0.35) n++;
          if (u > 0 && u < 6 && v < 1.2) blocked = true;
        }
        if (!blocked && n > bestN) { bestN = n; yaw = deg(ang); }
      }
      cams.push({ name: 'inside a forest stand', x: fx, z: fz, yaw, pitch: 3, time: 'day' });
    }
  }

  // 4. a forest edge across meadow: a stand's edge seen from open, dry,
  // gentle meadow 80-120 m away
  {
    let best = null;
    for (let gz = 3; gz < gn - 3; gz++) for (let gx = 3; gx < gn - 3; gx++) {
      const c = count(gx, gz);
      if (c < 8) continue;
      for (let a = 0; a < 8; a++) {
        const ang = a / 8 * TAU, dx = Math.sin(ang), dz = Math.cos(ang);
        const ex = (gx + 0.5) * G, ez = (gz + 0.5) * G;
        for (const r of [80, 100, 120]) {
          const x = ex + dx * r, z = ez + dz * r;
          if (!dry(x, z) || slopeAt(x, z) > 0.1) continue;
          // open meadow between: no trees near the line, no water on it
          let open = true;
          for (let d = 0; d < r - 30 && open; d += 8) {
            const px = x - dx * d, pz = z - dz * d;
            const pj = Math.round(pz) * NN + Math.round(px);
            if (!dry(px, pz) || near(px, pz, 12).length || terrain.wSand[pj] > 0 || terrain.wRock[pj] > 0) open = false;
          }
          if (!open || near(x, z, 40).length || roadNear(x, z)) continue;
          const score = c + count(gx - 1, gz) + count(gx + 1, gz) + count(gx, gz - 1) + count(gx, gz + 1) - slopeAt(x, z) * 40;
          if (!best || score > best.score) best = { x, z, yaw: deg(Math.atan2(-dx, -dz)), score };
          break;
        }
      }
    }
    if (best) cams.push({ name: 'forest edge across meadow', x: best.x, z: best.z, yaw: best.yaw, pitch: 1, time: 'day' });
  }

  // 5. a river valley: on a bank where the river runs straight between
  // rising ground, looking downstream
  {
    let best = null;
    for (const rv of rivers) {
      for (let q = 60; q < rv.n - 80; q += 10) {
        if (rv.lake[q] >= 0) continue;
        const ax = rv.x[q] - rv.x[q - 40], az = rv.z[q] - rv.z[q - 40], bx = rv.x[q + 50] - rv.x[q], bz = rv.z[q + 50] - rv.z[q];
        const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz) || 1))));
        if (turn > 0.35) continue;
        const ul = Math.hypot(bx, bz) || 1, ux = bx / ul, uz = bz / ul;
        const side = (s) => heightAt(H, N, rv.x[q] + uz * s * 70, rv.z[q] - ux * s * 70) - rv.level[q];
        const valley = Math.min(side(1), side(-1));
        if (valley < 5) continue;
        for (const s of [1, -1]) {
          const x = rv.x[q] + uz * s * (rv.hw[q] + 4), z = rv.z[q] - ux * s * (rv.hw[q] + 4);
          if (!dry(x, z) || slopeAt(x, z) > 0.3) continue;
          const score = Math.min(valley, 25) - 20 * turn - 10 * slopeAt(x, z) - 3 * near(x + ux * 10, z + uz * 10, 6).length;
          if (!best || score > best.score) best = { x, z, yaw: deg(Math.atan2(ux, uz)), score };
        }
      }
    }
    if (best) cams.push({ name: 'river valley', x: best.x, z: best.z, yaw: best.yaw, pitch: -3, time: 'day' });
  }

  // 6. the coast: on a beach close to the sea, looking along the shore
  // (the sea on one side, the land on the other), toward the side where
  // the coast rises highest within view
  {
    let best = null;
    for (let z = 40; z < N - 40; z += 12) for (let x = 40; x < N - 40; x += 12) {
      const j = z * NN + x;
      if (seaDist[j] < 6 || seaDist[j] > 16 || !dry(x, z) || slopeAt(x, z) > 0.12 || !terrain.wSand[j]) continue;
      // toward the sea: down the distance field
      const gx = seaDist[j + 6] - seaDist[j - 6], gz = seaDist[j + 6 * NN] - seaDist[j - 6 * NN];
      const gl = Math.hypot(gx, gz);
      if (gl < 1) continue;
      const sx = -gx / gl, sz = -gz / gl;
      for (const turn of [-60, 60]) {
        const ang = Math.atan2(sx, sz) + turn * Math.PI / 180, dx = Math.sin(ang), dz = Math.cos(ang);
        let rise = 0;
        for (let d = 150; d <= 450; d += 50) rise = Math.max(rise, heightAt(H, N, x + dx * d - sx * 20, z + dz * d - sz * 20) - SCALE.sea);
        const score = Math.min(rise, 25) - 50 * slopeAt(x, z) - 4 * near(x, z, 25).length;
        if (!best || score > best.score) best = { x, z, yaw: deg(ang), score };
      }
    }
    if (best) cams.push({ name: 'the coast', x: best.x, z: best.z, yaw: best.yaw, pitch: -2, time: 'day' });
  }

  // 7. a ridge-top vista: of the viewpoints, the one that sees the main lake
  // best (the water catches the eye across a hazy land), looking at it; or
  // else the first, looking its best way
  if (sites.viewpoints.length) {
    const L = sites.lake;
    let pick = null;
    for (const v of sites.viewpoints) {
      const d = Math.hypot(L.x - v.x, L.z - v.z);
      const eye = heightAt(H, N, v.x, v.z) + SCALE.eye;
      if (d > 1300 || !clearLine(H, N, v.x, v.z, eye, L.x, L.z, L.level + 0.5)) continue;
      if (!pick || d < pick.d) pick = { v, d };
    }
    const v = pick ? pick.v : sites.viewpoints[0];
    const yaw = pick ? deg(Math.atan2(L.x - v.x, L.z - v.z)) : v.yaw;
    cams.push({ name: 'ridge-top vista', x: v.x, z: v.z, yaw, pitch: -6, time: 'day' });
  }

  // 8. the road approaching the fort: 140 m back along the road that ends
  // at the gate, looking at the gate
  {
    const f = sites.fort;
    let best = null;
    for (const rd of roads) {
      for (const e of [0, rd.n - 1]) {
        const d = Math.hypot(rd.x[e] - f.front.x, rd.z[e] - f.front.z);
        if (!best || d < best.d) best = { rd, d, e };
      }
    }
    if (best) {
      const rd = best.rd, q = best.e === 0 ? Math.min(rd.n - 1, 140) : Math.max(0, rd.n - 1 - 140);
      cams.push({ name: 'road approaching the fort', x: rd.x[q], z: rd.z[q], yaw: deg(Math.atan2(f.gate.x - rd.x[q], f.gate.z - rd.z[q])), pitch: 0, time: 'day' });
    }
  }
  return cams;
}
