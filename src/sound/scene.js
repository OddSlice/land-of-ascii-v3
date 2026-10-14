// Where the world's sounds come from (phase 5b), worked out once a world
// from its own records, nothing new placed: the water's edges (lake shores,
// river reaches, the sea's edge), the trees at the edges of forests and
// copses (songbirds), the fires (torches and hearths), the wells, the
// chapels, the fort's gate passage. Each list sits in a grid of 128 m
// squares, so a frame asks only the squares round the ear.
import { groundAt } from '../world/objects.js';

const B = 128;

function grid(N) {
  const n = Math.ceil(N / B) + 1;
  return { n, cells: Array.from({ length: n * n }, () => []) };
}
const put = (g, x, z, item) => { const i = Math.max(0, Math.min(g.n - 1, Math.floor(x / B))), k = Math.max(0, Math.min(g.n - 1, Math.floor(z / B))); g.cells[k * g.n + i].push(item); };
// every item of grid g within r of (x, z), into out (cleared)
export function around(g, x, z, r, out) {
  out.length = 0;
  const i0 = Math.max(0, Math.floor((x - r) / B)), i1 = Math.min(g.n - 1, Math.floor((x + r) / B));
  const k0 = Math.max(0, Math.floor((z - r) / B)), k1 = Math.min(g.n - 1, Math.floor((z + r) / B));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) for (const it of g.cells[k * g.n + i]) {
    const dx = it.x - x, dz = it.z - z;
    if (dx * dx + dz * dz <= r * r) out.push(it);
  }
  return out;
}

export function soundScene(world) {
  const T = world.terrain, N = world.N, NN = T.NN, S0 = T.levels[0].H, sea = world.sea;
  const out = { water: { lake: grid(N), river: grid(N), sea: grid(N) }, trees: grid(N), fires: grid(N), wells: [], chapels: [], gate: null, bridges: [] };
  // ---- the water's edges: 8 m points of water beside land ----
  const wet = (x, z) => { if (x < 0 || z < 0 || x > N || z > N) return true; const j = Math.round(z) * NN + Math.round(x); return T.wWater[j] > 127 && S0[j] - T.ground[j] > 0.05; };
  const lakeLevels = (world.lakes || []).map((l) => l.level);
  const step = 8;
  for (let z = step; z < N - step; z += step) for (let x = step; x < N - step; x += step) {
    if (!wet(x, z)) continue;
    if (wet(x + step, z) && wet(x - step, z) && wet(x, z + step) && wet(x, z - step)) continue;
    const lv = S0[Math.round(z) * NN + Math.round(x)];
    const kind = Math.abs(lv - sea) < 0.05 ? 'sea' : lakeLevels.some((l) => Math.abs(l - lv) < 0.3) ? 'lake' : 'river';
    if (kind !== 'river') put(out.water[kind], x, z, { x, z, y: lv });
  }
  // the rivers along their own courses, each point with how fast it falls
  (world.rivers || []).forEach((rv, q) => {
    for (let i = 0; i < rv.n; i += 3) {
      const j = Math.min(rv.n - 1, i + 6), d = Math.hypot(rv.x[j] - rv.x[i], rv.z[j] - rv.z[i]) || 1;
      const lvA = Array.isArray(rv.level) || ArrayBuffer.isView(rv.level) ? rv.level[i] : groundAt(T, rv.x[i], rv.z[i]);
      const lvB = Array.isArray(rv.level) || ArrayBuffer.isView(rv.level) ? rv.level[j] : groundAt(T, rv.x[j], rv.z[j]);
      put(out.water.river, rv.x[i], rv.z[i], { x: rv.x[i], z: rv.z[i], y: lvA, fall: Math.abs(lvA - lvB) / d, river: q });
    }
  });
  (world.sites.bridges || []).forEach((b) => out.bridges.push({ x: b.x, z: b.z, y: b.y, len: b.len || 12 }));
  // ---- the trees at the edges of forests and copses ----
  const trees = world.objects.trees, tg = new Map(), cell = 6;
  const key = (i, k) => i * 100003 + k;
  for (const t of trees) { const k = key(Math.floor(t.x / cell), Math.floor(t.z / cell)); tg.set(k, (tg.get(k) || 0) + 1); }
  const count = (x, z) => tg.get(key(Math.floor(x / cell), Math.floor(z / cell))) || 0;
  let id = 0;
  for (const t of trees) {
    // (part of a stand, with open ground on one side)
    let near = 0, open = 0;
    for (let a = 0; a < 8; a++) {
      const ang = a * Math.PI / 4, c = count(t.x + Math.cos(ang) * 9, t.z + Math.sin(ang) * 9);
      if (c) near++; else open++;
    }
    if (near >= 2 && open >= 2 && (id++ % 3 === 0)) put(out.trees, t.x, t.z, { x: t.x, z: t.z, y: t.top - 2, id: id });
  }
  // ---- the fires, the wells, the chapels, the gate ----
  const torches = (world.kit && world.kit.torches) || world.objects.torches || [];
  torches.forEach((t, k) => put(out.fires, t.x, t.z, { x: t.x, z: t.z, y: t.flameY, kind: t.mount === 'hearth' ? 'hearth' : 'torch', group: t.group || 0, rooms: t.rooms || [], id: k }));
  for (const v of world.sites.villages) {
    const p = v.plan;
    if (p.well) out.wells.push({ x: p.well.x, z: p.well.z, y: p.well.y });
    if (p.chapel) out.chapels.push({ x: p.chapel.x, z: p.chapel.z, y: (p.chapel.floor || 0) + 8 });
  }
  const f = world.sites.fort;
  if (f && f.well) out.wells.push({ x: f.well.x, z: f.well.z, y: groundAt(T, f.well.x, f.well.z) });
  if (f && f.gate) out.gate = { x: f.gate.x, z: f.gate.z, ox: f.gate.out[0], oz: f.gate.out[1] };
  return out;
}
