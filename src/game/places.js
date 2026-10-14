// The places the journal lists (phase 5a), every kind the generator knows:
// the fort, each village, each viewpoint, the great lake, the coast, each
// bridge, the head of each river, and the foot of the mountains. All from
// the world's own records, so every seed has them; their names come from
// the seed (src/game/words.js). A place is found the first time you come
// within its distance (FOUND_AT) with a clear line of sight over the land
// to one of its points. Nothing here changes the world.
import { hash2 } from '../world/noise.js';
import { groundAt } from '../world/objects.js';
import { VILLAGE_NAMES, HILL_NAMES, RIVER_NAMES, LAKE_NAMES, COMPASS, PLACE_WORDS, FOUND_AT } from './words.js';

const TAU = Math.PI * 2;

// `n` different picks from a list, from the seed.
export function pickNames(list, n, seed, salt) {
  const order = list.map((x, i) => [hash2(i, salt, seed + 7331), x]).sort((a, b) => a[0] - b[0]).map((q) => q[1]);
  return Array.from({ length: n }, (_, i) => order[i % order.length]);
}

// A compass word for the way from (ax, az) to (bx, bz): +z is north, +x east.
export function compass(ax, az, bx, bz) {
  const a = Math.atan2(bx - ax, bz - az);
  return COMPASS[((Math.round(a / (TAU / 8)) % 8) + 8) % 8];
}

export const fill = (s, slots) => s.replace(/\{(\w+)\}/g, (m, k) => (slots[k] !== undefined ? slots[k] : m));
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The names a world gives its villages, hills, rivers and lake.
export function namesOf(world) {
  const s = world.seed >>> 0;
  return {
    villages: pickNames(VILLAGE_NAMES, world.sites.villages.length, s, 1),
    hills: pickNames(HILL_NAMES, world.sites.viewpoints.length, s, 2),
    rivers: pickNames(RIVER_NAMES, world.rivers.length, s, 3),
    lake: pickNames(LAKE_NAMES, 1, s, 4)[0],
  };
}

// Is there a clear line over the land (the ground, or water's surface)
// from (x0, z0, y0) to (x1, z1, y1)? The last two metres are not tested
// (the place's own ground).
export function sightLine(world, x0, z0, y0, x1, z1, y1) {
  const T = world.terrain, S = { ground: T.levels[0].H, N: T.N, NN: T.NN };
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / 3));
  for (let k = 1; k < n; k++) {
    const f = k / n;
    if (d * (1 - f) < 2) break;
    if (groundAt(S, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f) > y0 + (y1 - y0) * f - 0.25) return false;
  }
  return true;
}

// The world's places: [{ id, kind, title, where, hint, at: [[x, z, y], ...]
// (the points it can be seen by), D (found within), x, z (where it is) }].
export function placesOf(world) {
  const T = world.terrain, s = world.sites, names = namesOf(world), N = world.N;
  const G = (x, z) => groundAt(T, x, z);
  const out = [];
  // the nearest village (or the fort) to a point, for "north of Ashby"
  const towns = [...s.villages.map((v, q) => ({ x: v.plan ? v.plan.centre.x : v.x, z: v.plan ? v.plan.centre.z : v.z, name: names.villages[q] })), ...(s.fort ? [{ x: s.fort.x, z: s.fort.z, name: 'the fort' }] : [])];
  const near = (x, z, skip = null) => towns.filter((t) => t !== skip).reduce((b, t) => (!b || Math.hypot(t.x - x, t.z - z) < Math.hypot(b.x - x, b.z - z) ? t : b), null);
  const words = (kind, slots, x, z, skip) => {
    const W = PLACE_WORDS[kind], nt = near(x, z, skip);
    const sl = { dir: nt ? compass(nt.x, nt.z, x, z) : '', near: nt ? nt.name : '', ...slots };
    return { title: fill(W.title, sl), where: fill(W.where, sl), hint: W.hint };
  };
  const add = (id, kind, x, z, at, slots = {}, skip = null) => out.push({ id, kind, x, z, at, D: FOUND_AT[kind], ...words(kind, slots, x, z, skip) });

  if (s.fort) {
    const f = s.fort, k = f.keep;
    add('fort', 'fort', f.x, f.z, [[k.x, k.z, f.base + 10], [f.front.x, f.front.z, f.base + 4], ...f.towers.map((t) => [t.x, t.z, f.base + 8])], {}, towns[towns.length - 1]);
  }
  s.villages.forEach((v, q) => {
    const c = v.plan ? v.plan.centre : v;
    add(`village${q}`, 'village', c.x, c.z, [[c.x, c.z, G(c.x, c.z) + 4]], { name: names.villages[q] }, towns[q]);
  });
  s.viewpoints.forEach((v, q) => add(`view${q}`, 'viewpoint', v.x, v.z, [[v.x, v.z, G(v.x, v.z) + 1]], { name: names.hills[q] }));
  // the great lake: up to 40 points over its water
  if (s.lake) {
    const pts = waterPoints(world, s.lake.x, s.lake.z, s.lake.level, 40);
    add('lake', 'lake', s.lake.x, s.lake.z, pts, { name: names.lake });
  }
  // the coast: up to 60 points of sea next to land
  {
    const pts = coastPoints(world, 60);
    if (pts.length) {
      // (where it is: its point nearest the middle of the land)
      const c = pts.reduce((b, p) => (!b || Math.hypot(p[0] - N / 2, p[1] - N / 2) < Math.hypot(b[0] - N / 2, b[1] - N / 2) ? p : b), null);
      add('coast', 'coast', c[0], c[1], pts);
    }
  }
  // the bridges: named by the river they cross and the road they carry
  (s.bridges || []).forEach((b, q) => {
    const rv = nearestRiver(world, b.x, b.z);
    const rd = world.roads[b.road];
    const to = rd ? (rd.to === 'fort' ? 'the fort' : rd.to.startsWith('village') ? names.villages[Number(rd.to.split(' ')[1]) - 1] : 'the spawn') : 'the fort';
    add(`bridge${q}`, 'bridge', b.x, b.z, [[b.x, b.z, b.y + 1]], { river: rv >= 0 ? names.rivers[rv] : 'the river', town: to });
  });
  // the head of each river, where it rises (its first point, on the map)
  world.rivers.forEach((rv, q) => {
    const x = rv.x[0], z = rv.z[0];
    if (x < 4 || z < 4 || x > N - 4 || z > N - 4) return;
    add(`source${q}`, 'source', x, z, [[x, z, G(x, z) + 1.5]], { river: names.rivers[q] });
  });
  // the foot of the mountains
  const ft = footOf(world);
  if (ft) add('foot', 'foot', ft[0], ft[1], [[ft[0], ft[1], G(ft[0], ft[1]) + 2]]);
  return { list: out, names, towns };
}

// Points spread over a lake's water: a flood over an 8 m grid from its
// middle, over cells whose surface stands at its level.
function waterPoints(world, x0, z0, level, max) {
  const T = world.terrain, N = world.N, NN = world.NN, S = T.levels[0].H, step = 8, n = Math.floor(N / step);
  const wet = (i, k) => {
    const x = i * step, z = k * step, j = Math.round(z) * NN + Math.round(x);
    return T.wWater[j] > 127 && Math.abs(S[j] - level) < 0.3;
  };
  let si = Math.round(x0 / step), sk = Math.round(z0 / step);
  if (!wet(si, sk)) {
    let best = null;
    for (let r = 1; r < 12 && !best; r++) for (let a = -r; a <= r && !best; a++) for (const [di, dk] of [[a, -r], [a, r], [-r, a], [r, a]]) if (!best && wet(si + di, sk + dk)) best = [si + di, sk + dk];
    if (!best) return [[x0, z0, level + 0.3]];
    [si, sk] = best;
  }
  const seen = new Set([sk * n + si]), q = [[si, sk]], all = [];
  for (let h = 0; h < q.length && q.length < 20000; h++) {
    const [i, k] = q[h];
    all.push([i * step, k * step, level + 0.3]);
    for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = k + dk, key = b * n + a;
      if (a < 0 || b < 0 || a >= n || b >= n || seen.has(key) || !wet(a, b)) continue;
      seen.add(key); q.push([a, b]);
    }
  }
  if (all.length <= max) return all;
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * all.length / max)]);
}

// Points along the sea's edge: 16 m cells of sea beside land.
function coastPoints(world, max) {
  const T = world.terrain, N = world.N, NN = world.NN, S = T.levels[0].H, step = 16, sea = world.sea;
  const isSea = (x, z) => { if (x < 0 || z < 0 || x > N || z > N) return true; const j = Math.round(z) * NN + Math.round(x); return T.wWater[j] > 127 && Math.abs(S[j] - sea) < 0.05; };
  const all = [];
  for (let z = step; z < N - step; z += step) for (let x = step; x < N - step; x += step) {
    if (!isSea(x, z)) continue;
    if (!isSea(x + step, z) || !isSea(x - step, z) || !isSea(x, z + step) || !isSea(x, z - step)) all.push([x, z, sea + 0.3]);
  }
  if (all.length <= max) return all;
  // (spread along the coast: every so many)
  return Array.from({ length: max }, (_, i) => all[Math.floor(i * all.length / max)]);
}

// The river whose water passes nearest (x, z).
function nearestRiver(world, x, z) {
  let best = -1, bd = Infinity;
  world.rivers.forEach((rv, q) => { for (let i = 0; i < rv.n; i += 2) { const d = Math.hypot(rv.x[i] - x, rv.z[i] - z); if (d < bd) { bd = d; best = q; } } });
  return best;
}

// The foot of the mountains: on the 16 m grid, low ground (under 45 m above
// the sea, and fairly level) with ground over 110 m above the sea within
// 220 m; of those, the one nearest the middle of the land.
function footOf(world) {
  const T = world.terrain, N = world.N, sea = world.sea, step = 16;
  const G = (x, z) => groundAt(T, x, z);
  let best = null, bd = Infinity;
  for (let z = step * 2; z < N - step * 2; z += step) for (let x = step * 2; x < N - step * 2; x += step) {
    const h = G(x, z) - sea;
    if (h < 22 || h > 45) continue;
    const j = Math.round(z) * world.NN + Math.round(x);
    if (T.wWater[j] > 30) continue;
    if (Math.abs(G(x + 4, z) - G(x - 4, z)) > 2.4 || Math.abs(G(x, z + 4) - G(x, z - 4)) > 2.4) continue;
    let high = false;
    for (let a = 0; a < 16 && !high; a++) for (const r of [120, 170, 220]) if (G(x + Math.cos(a * TAU / 16) * r, z + Math.sin(a * TAU / 16) * r) - sea > 110) { high = true; break; }
    if (!high) continue;
    const d = Math.hypot(x - N / 2, z - N / 2);
    if (d < bd) { bd = d; best = [x, z]; }
  }
  return best;
}

// Which of `list`'s places a walker at (x, z) with the eye at height `eye`
// finds now: within its distance and with a clear sight of one of its points.
export function findsFrom(world, list, done, x, z, eye) {
  const out = [];
  for (const pl of list) if (!done[pl.id] && finds(world, pl, x, z, eye)) out.push(pl.id);
  return out;
}
// Is one place found from here?
export function finds(world, pl, x, z, eye) {
  for (const p of pl.at) {
    const d = Math.hypot(p[0] - x, p[1] - z);
    if (d > pl.D) continue;
    if (d < 6 || sightLine(world, x, z, eye, p[0], p[1], p[2])) return true;
  }
  return false;
}
