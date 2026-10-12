// The eight world cameras the tools use, found from the data so the same
// code works on any seed (never placed by hand for a flattering frame):
// the spawn view, the main lake's shore, inside a forest stand, a forest
// edge across meadow, a river valley, the coast, a ridge-top vista, and the
// road approaching the fort site. Angles in degrees: yaw 0 looks north (+z),
// 90 east.
import { SCALE } from '../scale.js';
import { KIND } from './water.js';
import { heightAt, clearLine, brow } from './sites.js';

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
        if (turn > 0.7) continue;
        const ul = Math.hypot(bx, bz) || 1, ux = bx / ul, uz = bz / ul;
        const side = (s) => heightAt(H, N, rv.x[q] + uz * s * 70, rv.z[q] - ux * s * 70) - rv.level[q];
        // (the deepest, straightest valley wins; a shallow one only if there is no other)
        const valley = Math.min(side(1), side(-1));
        if (valley < 1) continue;
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

  // 6. the coast (phase 2b: chosen by how much sea and land it sees): from
  // the land just behind the beach or its upper edge, looking along the
  // shore, the spot and turn whose view below the horizon is closest to
  // COAST_VIEW's shares of sea, other land and sand, so the camera no longer
  // stands in the middle of the beach with sand filling the lower half
  {
    const COAST_VIEW = { sea: 0.42, land: 0.38, sand: 0.2 };
    const eyeAt = (x, z) => heightAt(H, N, x, z) + SCALE.eye;
    // the share of sea, sand and other land in the view from (x, z) along
    // yaw `ang`: columns across the picture's width, rows from just under
    // the horizon down to its foot (pitch -2), each row's ground taken where
    // a ray at that depression meets the level of the eye's foot
    const view = (x, z, ang) => {
      const eye = eyeAt(x, z), base = heightAt(H, N, x, z), out = { sea: 0, land: 0, sand: 0, n: 0 };
      const halfW = Math.atan(Math.tan(Math.PI / 6) * 1.6);
      for (let c = 0; c < 15; c++) {
        const a = ang + halfW * (c / 7 - 1), dx = Math.sin(a), dz = Math.cos(a);
        for (let r = 0; r < 12; r++) {
          const dep = (0.6 + 31.4 * (r / 11) ** 1.5) * Math.PI / 180;
          let d = (eye - base) / Math.tan(dep);
          if (d > 1500) d = 1500;
          const px = x + dx * d, pz = z + dz * d;
          out.n++;
          if (px < 0 || pz < 0 || px > N || pz > N) { out.sea++; continue; }
          const q = Math.round(pz) * NN + Math.round(px);
          if (kind[q] === KIND.SEA) out.sea++;
          else if (terrain.wSand[q] > 127) out.sand++;
          else out.land++;
        }
      }
      return { sea: out.sea / out.n, land: out.land / out.n, sand: out.sand / out.n };
    };
    let best = null;
    for (let z = 40; z < N - 40; z += 12) for (let x = 40; x < N - 40; x += 12) {
      const j = z * NN + x;
      if (seaDist[j] < 10 || seaDist[j] > 48 || !dry(x, z) || slopeAt(x, z) > 0.15) continue;
      // (not out on the beach: on its upper edge or on the land behind it)
      if (terrain.wSand[j] > 127 && seaDist[j] < SCALE.beach) continue;
      const gx = seaDist[j + 6] - seaDist[j - 6], gz = seaDist[j + 6 * NN] - seaDist[j - 6 * NN];
      const gl = Math.hypot(gx, gz);
      if (gl < 1) continue;
      const sx = -gx / gl, sz = -gz / gl;
      for (const turn of [-60, -48, -36, 36, 48, 60]) {
        const ang = Math.atan2(sx, sz) + turn * Math.PI / 180;
        const v = view(x, z, ang);
        const score = -(Math.abs(v.sea - COAST_VIEW.sea) + Math.abs(v.land - COAST_VIEW.land) + Math.abs(v.sand - COAST_VIEW.sand)) - 2 * slopeAt(x, z) - 0.05 * near(x, z, 25).length;
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
    // (at the brow of the viewpoint's hill, for the way it looks)
    const b = brow(H, N, kind, v.x, v.z, yaw);
    cams.push({ name: 'ridge-top vista', x: b.x, z: b.z, yaw, pitch: -6, time: 'day' });
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

// (phase 3a) The fort's four cameras, found from its plan: the fort from its
// road, inside the gate's passage looking in, the courtyard, and the wall
// walk looking out over the valley (from the run of wall that faces the
// main lake most).
// (`stand`: the eye's height is the floor's at the place, near enough; the
// feet settle onto what is under them at once, so the road pressed into the
// passage's floor cannot leave the eye falling for a few frames)
export function fortCameras(world) {
  const { sites, roads } = world, f = sites.fort, base = f.base, eye = SCALE.eye;
  const K = SCALE.kit, o = f.gate.out;
  const cams = [];
  // the fort from its road, 75 m back from the gate's mouth along it
  {
    const rd = roads.find((r) => r.to === 'fort');
    let q = 0, best = Infinity;
    for (let i = 0; i < rd.n; i++) { const d = Math.hypot(rd.x[i] - f.front.x, rd.z[i] - f.front.z); if (d < best) { best = d; q = i; } }
    let acc = 0;
    while (q + 1 < rd.n && acc < 75) { acc += Math.hypot(rd.x[q + 1] - rd.x[q], rd.z[q + 1] - rd.z[q]); q++; }
    cams.push({ name: 'the fort from the road', x: rd.x[q], z: rd.z[q], yaw: deg(Math.atan2(f.gate.x - rd.x[q], f.gate.z - rd.z[q])), pitch: 4, time: 'day' });
  }
  // inside the gate's passage, near its mouth, looking through it into the yard
  {
    const x = f.gate.x + o[0] * (K.gate.depth / 2 - 1.4), z = f.gate.z + o[1] * (K.gate.depth / 2 - 1.4);
    cams.push({ name: 'inside the gate passage, looking in', x, z, y: base + eye, stand: true, yaw: deg(Math.atan2(-o[0], -o[1])), pitch: 1, time: 'day' });
  }
  // the courtyard: just inside, to one side of the way, toward the keep's door
  {
    const x = f.inner.x - o[0] * 4 + o[1] * 5, z = f.inner.z - o[1] * 4 - o[0] * 5;
    cams.push({ name: 'the courtyard', x, z, y: base + eye, stand: true, yaw: deg(Math.atan2(f.keep.door.x - x, f.keep.door.z - z)), pitch: 6, time: 'day' });
  }
  // the wall walk over the valley
  {
    const L = sites.lake;
    let best = null;
    for (const e of f.edges) {
      if (e.gate) continue;
      const mx = (e.a[0] + e.b[0]) / 2, mz = (e.a[1] + e.b[1]) / 2;
      const dl = Math.hypot(L.x - mx, L.z - mz) || 1, face = (e.out[0] * (L.x - mx) + e.out[1] * (L.z - mz)) / dl;
      if (!best || face > best.face) best = { e, mx, mz, face };
    }
    const { e, mx, mz } = best;
    const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], dl = Math.hypot(d[0], d[1]);
    // on the walk's inner half, a third of the way along, looking out over
    // the parapet at an angle along the wall, the walk and its merlons
    // leading off into the picture
    const back = K.wall.thick / 2 - 0.5;
    const x = mx - e.out[0] * back - d[0] / dl * dl * 0.22, z = mz - e.out[1] * back - d[1] / dl * dl * 0.22;
    const look = [e.out[0] * 0.55 + d[0] / dl, e.out[1] * 0.55 + d[1] / dl];
    cams.push({ name: 'the wall walk over the valley', x, z, y: base + K.wall.height + eye, stand: true, yaw: deg(Math.atan2(look[0], look[1])), pitch: -3, time: 'day' });
  }
  return cams;
}

// (phase 3b) The villages' cameras, from their plans: each village from its
// road as it comes in and from its centre; inside a house one can enter;
// and a bridge from its bank.
export function villageCameras(world) {
  const { sites, roads } = world, eye = SCALE.eye, cams = [];
  const H = world.terrain.ground, N = world.N, NN = N + 1;
  const g = (x, z) => H[Math.round(z) * NN + Math.round(x)];
  const wet = (x, z) => world.terrain.wWater[Math.round(z) * NN + Math.round(x)] > 127;
  const times = ['day', 'dusk', 'day'];
  sites.villages.forEach((v, q) => {
    const p = v.plan, c = p.centre, name = `village ${q + 1} (${p.pattern})`;
    // its road, about 70 m out from the nearest house
    const rd = roads.find((r) => r.to === `village ${q + 1}`);
    let k = 0;
    for (let i = 0; i < rd.n; i++) {
      const d = Math.min(...p.houses.map((h) => Math.hypot(h.x - rd.x[i], h.z - rd.z[i])));
      if (d >= 70) { k = i; break; }
      k = i;
    }
    const tx = p.chapel ? p.chapel.x : c.x, tz = p.chapel ? p.chapel.z : c.z;
    cams.push({ name: `${name}, the road in`, x: rd.x[k], z: rd.z[k], yaw: deg(Math.atan2(tx - rd.x[k], tz - rd.z[k])), pitch: 2, time: 'day' });
    // its centre: at the well, or the middle of its green, looking at the chapel
    const at = p.green ? [p.green.x + p.green.r * 0.15, p.green.z - p.green.r * 0.25] : p.well ? [p.well.x + 2.4, p.well.z + 2.4] : [c.x, c.z];
    let best = null;
    for (let t = 0; t < 16; t++) {
      const a = t / 16 * Math.PI * 2, x = at[0] + Math.cos(a) * 3, z = at[1] + Math.sin(a) * 3;
      if (wet(x, z) || p.rects.some(([rx, rz, ra, hw, hd]) => { const dx = x - rx, dz = z - rz, ca = Math.cos(ra), sa = Math.sin(ra); return Math.abs(dx * ca + dz * sa) < hw + 1 && Math.abs(-dx * sa + dz * ca) < hd + 1; })) continue;
      best = [x, z]; break;
    }
    const [cx, cz] = best || at;
    const look = p.chapel && Math.hypot(p.chapel.x - cx, p.chapel.z - cz) > 12 ? [p.chapel.x, p.chapel.z] : p.houses.length ? [p.houses[0].x, p.houses[0].z] : [c.x + 10, c.z];
    cams.push({ name: `${name}, its centre`, x: cx, z: cz, y: g(cx, cz) + eye, stand: true, yaw: deg(Math.atan2(look[0] - cx, look[1] - cz)), pitch: 4, time: times[q] });
  });
  // inside a house one can enter: the first village's first, just in from
  // its door, looking toward the hearth
  {
    const v = sites.villages.find((x) => x.plan.enter.length) || null;
    if (v) {
      const h = v.plan.enter[0], ca = Math.cos(h.a), sa = Math.sin(h.a);
      const S = h.kind === 'hall' ? SCALE.kit.hall : SCALE.kit.cottage;
      const lu = -h.side * (h.w - S.wallT - 0.7), lw = h.d - S.wallT - 0.6;
      const x = h.x + lu * ca - lw * sa, z = h.z + lu * sa + lw * ca;
      const hu = h.side * (h.w - S.wallT - 0.5), hx = h.x + hu * ca, hz = h.z + hu * sa;
      cams.push({ name: 'inside a house, by the hearth', x, z, y: h.floor + 0.02 + eye, stand: true, yaw: deg(Math.atan2(hx - x, hz - z)), pitch: -8, time: 'dusk' });
    }
  }
  // a bridge, from its bank, a little downstream
  if (sites.bridges && sites.bridges.length) {
    const b = sites.bridges[0], nx = -Math.sin(b.a), nz = Math.cos(b.a);
    let spot = null;
    for (const d of [16, 20, 24, 13, 28]) for (const sg of [1, -1]) for (const along of [-0.5, 0.5, -0.8, 0.8]) {
      if (spot) break;
      const x = b.x + nx * sg * d + Math.cos(b.a) * b.len * along, z = b.z + nz * sg * d + Math.sin(b.a) * b.len * along;
      if (x < 2 || z < 2 || x > N - 2 || z > N - 2 || wet(x, z)) continue;
      if (roads.some((r) => { for (let i = 0; i < r.n; i += 3) if (Math.hypot(r.x[i] - x, r.z[i] - z) < 4) return true; return false; })) continue;
      spot = [x, z];
    }
    if (spot) cams.push({ name: `the ${b.style} bridge from its bank`, x: spot[0], z: spot[1], y: g(spot[0], spot[1]) + eye, stand: true, yaw: deg(Math.atan2(b.x - spot[0], b.z - spot[1])), pitch: 2, time: 'day' });
  }
  return cams;
}
