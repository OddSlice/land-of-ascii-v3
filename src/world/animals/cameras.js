// The fixed cameras that look at animals (phase 4b), from the animals' own
// data, so every seed has them: a pasture with its full flock in the
// morning, a forest edge with deer at dawn, the coast with its gulls, and
// crows on the fort's wall walk. Each looks at where its animals are at its
// hour (worked out once here, with nobody near them).
import { animalsAt } from './state.js';
import { AS, A } from './kinds.js';
import { groundAt } from '../objects.js';

const deg = (r) => r * 180 / Math.PI;

export function animalCameras(world, An) {
  const cams = [], P = An.P, p = P.p, T = world.terrain;
  const middle = (g, hour) => {
    const st = new Float32Array(g.members.length * AS), ids = new Int32Array(g.members.length);
    const n = animalsAt(An, 0, hour, [], st, ids, [g]);
    let x = 0, z = 0, y = 0;
    for (let i = 0; i < n; i++) { x += st[i * AS + A.X]; z += st[i * AS + A.Z]; y += st[i * AS + A.Y]; }
    return n ? { x: x / n, z: z / n, y: y / n } : null;
  };
  // a clear spot `d` metres from c, first from direction a, then round it
  const from = (c, d, a, away = null) => {
    for (let k = 0; k < 16; k++) {
      const b = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8, x = c.x + Math.sin(b) * d, z = c.z + Math.cos(b) * d;
      const ft = p.supportAt(x, z, groundAt(T, x, z) + 0.3);
      if (x < 2 || z < 2 || x > world.N - 2 || z > world.N - 2 || p.blocked(x, z, ft) || T.wWater[Math.round(z) * world.NN + Math.round(x)] > 127) continue;
      if (away && Math.hypot(x - away.x, z - away.z) < d * 0.8) continue;
      return { x, z, ft };
    }
    return null;
  };
  const look = (s, c, hy = 0.5) => ({ yaw: deg(Math.atan2(c.x - s.x, c.z - s.z)), pitch: deg(Math.atan2(c.y + hy - (s.ft + 1.7), Math.hypot(c.x - s.x, c.z - s.z))) });
  // a pasture with its full flock, in the morning
  const fl = An.groups.find((g) => g.type === 'flock');
  if (fl) {
    // (from inside the pasture, toward the flock: not over its wall)
    const c = middle(fl, 10.5), PA = fl.PA;
    const inside = (x, z) => { const ox = x - PA.x, oz = z - PA.z; return Math.abs(ox * PA.ca + oz * PA.sa) < PA.L - 1.5 && Math.abs(-ox * PA.sa + oz * PA.ca) < PA.W - 1.5; };
    let s = null;
    for (let d = 16; d >= 6 && !s; d -= 2) { const q = c && from(c, d, Math.atan2(PA.x - c.x, PA.z - c.z)); if (q && inside(q.x, q.z)) s = q; }
    if (s) cams.push({ name: 'a pasture with its flock', x: s.x, z: s.z, ...look(s, c), time: 10.5 });
  }
  // a forest edge with deer, at dawn (from the open side)
  const dr = An.groups.find((g) => g.type === 'deer');
  if (dr) {
    const c = middle(dr, 6.4);
    const s = c && from(c, 30, Math.atan2(dr.edge[0] - dr.into[0], dr.edge[1] - dr.into[1]));
    if (s) cams.push({ name: 'deer at a forest edge, at dawn', x: s.x, z: s.z, ...look(s, c, 0.8), time: 6.4 });
  }
  // the coast with its gulls (a beach's, from inland)
  const gu = An.groups.find((g) => g.type === 'gulls' && g.level < 1e9);
  if (gu) {
    const c = { x: gu.home[0], z: gu.home[1], y: gu.perches[0][2] };
    const s = from(c, 22, Math.atan2(c.x - gu.centre[0], c.z - gu.centre[1]));
    if (s) { const lk = look(s, { x: (c.x + gu.centre[0]) / 2, z: (c.z + gu.centre[1]) / 2, y: c.y + 6 }); cams.push({ name: 'gulls on the coast', x: s.x, z: s.z, ...lk, time: 14 }); }
  }
  // crows on the fort's wall walk, from along the walk (past their alert
  // distance, so they stay)
  const cr = An.groups.find((g) => g.type === 'crow' && g.perch.at === 'fort');
  if (cr && P.fort) {
    const pc = cr.perch;
    let best = null, bd = Infinity;
    for (const pl of P.places) {
      if (pl.kind !== 'walk') continue;
      const d = Math.hypot(pl.x - pc.x, pl.z - pc.z);
      if (d > 24 && d < bd) { bd = d; best = pl; }
    }
    if (best && bd < 45) {
      const s = { x: best.x, z: best.z, ft: best.ft };
      cams.push({ name: 'crows on the wall walk', x: s.x, z: s.z, y: s.ft + 1.7, ...look(s, { x: pc.x, z: pc.z, y: pc.y }, 0.2), time: 10 });
    }
  }
  return cams;
}
