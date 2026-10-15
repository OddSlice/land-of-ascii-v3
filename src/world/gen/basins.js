// The lakes' hollows (phase 1; src/world/gen/world.js shapes them into the
// land): the main lake's on the main river, and a few small ones.
import { hash2 } from '../noise.js';
import { CG } from './water.js';

// The main lake's hollow, on the main river where it crosses the middle of
// the lowland, and two or three small hollows elsewhere in the lowland.
export function placeBasins(seed, N, frame, co, rivers, hills) {
  const P = {}, out = [], rises = [];
  const { Hc, nn } = co;
  const at = (x, z) => Hc[Math.round(z / CG) * nn + Math.round(x / CG)];
  const ell = (x, z, rx, ry, a, depth, level, flat, rise) => ({ x, z, rx, ry, ca: Math.cos(a), sa: Math.sin(a), depth, level, rise, wob: 0.2, ws: out.length * 5.7, flatK: flat });
  if (rivers.length) {
    const nodes = rivers[0].nodes;
    let pick = -1, bestD = Infinity;
    for (let q = 4; q < nodes.length - 4; q++) {
      const c = nodes[q], x = (c % nn) * CG, z = Math.floor(c / nn) * CG;
      frame.at(x, z, P);
      if (P.c < 380 || P.g > -260) continue;
      const d = Math.abs(P.f - 0.5);
      if (d < bestD) { bestD = d; pick = q; }
    }
    if (pick >= 0) {
      const c = nodes[pick], x = (c % nn) * CG, z = Math.floor(c / nn) * CG;
      const a = nodes[Math.min(nodes.length - 1, pick + 6)], b = nodes[Math.max(0, pick - 6)];
      const ang = Math.atan2(Math.floor(a / nn) - Math.floor(b / nn), (a % nn) - (b % nn));
      const r = 230 + 90 * hash2(1, 1, seed + 551), ry = r * (0.6 + 0.2 * hash2(1, 2, seed + 551));
      out.push(ell(x, z, r, ry, ang, 8, at(x, z), 1.5, 0.02));
      // low rises at the lake's edge, off the river's line, as such valleys
      // often have: one to its side, one below it to the other side, from
      // where one looks up the valley across the water (the fort site and
      // the spawn will want them)
      const side = hash2(1, 3, seed + 551) < 0.5 ? 1 : -1;
      const kr = 115 + 45 * hash2(1, 5, seed + 551), ka = hash2(1, 6, seed + 551) * Math.PI, off = ry + kr * 0.55;
      rises.push({ x: x - Math.sin(ang) * side * off, z: z + Math.cos(ang) * side * off, rx: kr, ry: kr * 0.8, ca: Math.cos(ka), sa: Math.sin(ka), h: 11 + 6 * hash2(1, 7, seed + 551), wob: 0.14, ws: 41.3 });
      const da = ang - side * (0.75 + 0.2 * hash2(1, 8, seed + 551)), dr = 110 + 40 * hash2(1, 10, seed + 551);
      const doff = Math.hypot(r * Math.cos(da - ang), ry * Math.sin(da - ang)) + dr * 0.6;
      rises.push({ x: x + Math.cos(da) * doff, z: z + Math.sin(da) * doff, rx: dr, ry: dr * 0.8, ca: Math.cos(da), sa: Math.sin(da), h: 12 + 6 * hash2(1, 11, seed + 551), wob: 0.14, ws: 17.9 });
    }
  }
  // small hollows
  const want = 2 + Math.floor(2 * hash2(2, 1, seed + 552));
  for (let t = 0; t < 300 && out.length < 1 + want; t++) {
    const x = 250 + (N - 500) * hash2(t, 1, seed + 553), z = 250 + (N - 500) * hash2(t, 2, seed + 553);
    frame.at(x, z, P);
    if (P.c < 250 || P.g > -180) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.z - z) < b.rx * b.flatK + 160)) continue;
    if (hills.some((h) => Math.hypot(h.x - x, h.z - z) < h.rx + 60) || rises.some((h) => Math.hypot(h.x - x, h.z - z) < h.rx + 60)) continue;
    let nearRiver = false;
    for (const rv of rivers) for (const c of rv.nodes) if (Math.hypot((c % nn) * CG - x, Math.floor(c / nn) * CG - z) < 160) { nearRiver = true; break; }
    if (nearRiver) continue;
    const r = 45 + 50 * hash2(t, 3, seed + 553);
    out.push(ell(x, z, r, r * (0.6 + 0.35 * hash2(t, 4, seed + 553)), hash2(t, 5, seed + 553) * Math.PI, 3 + 1.5 * hash2(t, 6, seed + 553), at(x, z), 2.2, 0.025));
  }
  return { basins: out, rises };
}
