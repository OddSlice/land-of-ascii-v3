// People (phase 4a). Nobody is simulated: who lives where comes from the
// seed, each person's whole day is a plan worked out from the seed, the day
// and the forecast (planOf), and where they are at any moment is a pure
// function of that plan and the clock (stateAt). So people far away cost
// nothing, any moment can be had again with the clock frozen, and time run
// fast simply works.
//
// - Places: a house's doorstep, its bed, the edge of the bed, the hearth; a
//   closed door (people go in through it and are gone, inside); spots by the
//   well, on the green, on a bench, at the chapel door, in a barn, in the
//   fields, on the jetty; the fort's gate, its keep, the bunks, the foot and
//   top of each stair and the wall walk. Each place hangs from another (the
//   bed from the doorstep, the doorstep from the network) by a short line,
//   straight where the player could walk it, else found on a half-metre
//   lattice by the player's rules.
// - The network: the roads, the villages' lanes and the footpaths, joined
//   where they meet. A route is one place's line up to the network, the way
//   along it, and the other's down; it is sampled every half metre by the
//   player's own walking rules, which give the feet's height everywhere (up
//   stairs, over bridges, onto a floor) and prove it can be walked.
// - Routes are found once, the first time a plan needs them, and kept.
import { hash2 } from '../noise.js';
import { MAT } from '../../contract.js';
import { Player } from '../../app/player.js';
import { groundAt } from '../objects.js';
import { forecastOf } from '../../weather.js';
import { frame, keepBunks } from '../kit-pieces.js';
import { furnitureSpots } from '../kit-village.js';
import { roomAt } from '../kit.js';
import { SCALE } from '../scale.js';
import { makeMove, sampleRoute, latticeWay, clearLine } from './walk.js';
import { GIVEN, BYNAME, ROLES } from './names.js';
import { FS, S, POSE, HATK, TOOL, LIGHT, FIG } from './figure.js';

const TAU = Math.PI * 2;
const CLOTH = [MAT.LINEN, MAT.RUSSET, MAT.OCHRE, MAT.MOSS, MAT.SLATE, MAT.UMBER, MAT.CHARCOAL];
const LEGS = [MAT.UMBER, MAT.CHARCOAL, MAT.SLATE, MAT.LEATHER, MAT.MOSS];
export const DUSK = 18.4, DAWN = 6.1;           // hours people carry a light out of doors
const STRIDE = 1.3;                             // metres a walk's cycle (two steps) covers

// ---- the network --------------------------------------------------------------

class Net {
  constructor() { this.x = []; this.z = []; this.nb = []; }
  add(x, z) { this.x.push(x); this.z.push(z); this.nb.push([]); return this.x.length - 1; }
  link(a, b) { if (a === b) return; const d = Math.hypot(this.x[a] - this.x[b], this.z[a] - this.z[b]); this.nb[a].push(b, d); this.nb[b].push(a, d); }
  line(xs, zs, n) { let prev = -1; for (let i = 0; i < n; i++) { const k = this.add(xs[i], zs[i]); if (prev >= 0) this.link(prev, k); prev = k; } }
  // join points of different lines within `r` metres
  join(r = 2.2) {
    const cell = new Map(), key = (x, z) => `${Math.floor(x / r)},${Math.floor(z / r)}`;
    for (let i = 0; i < this.x.length; i++) { const k = key(this.x[i], this.z[i]); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(i); }
    for (let i = 0; i < this.x.length; i++) {
      const cx = Math.floor(this.x[i] / r), cz = Math.floor(this.z[i] / r);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of cell.get(`${cx + a},${cz + b}`) || []) {
        if (j <= i) continue;
        if (Math.hypot(this.x[i] - this.x[j], this.z[i] - this.z[j]) < r && !this.nb[i].includes(j)) this.link(i, j);
      }
    }
    this.cell = cell; this.r = r;
    this.n = this.x.length;
    this.dist = new Float64Array(this.n); this.prev = new Int32Array(this.n); this.done = new Uint8Array(this.n);
  }
  // the nodes within `rad` metres of (x, z), nearest first
  nearby(x, z, rad) {
    const out = [];
    for (let i = 0; i < this.n; i++) { const d = Math.hypot(this.x[i] - x, this.z[i] - z); if (d < rad) out.push([d, i]); }
    return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((q) => q[1]);
  }
  // the shortest way from node a to node b (A*)
  path(a, b) {
    if (a === b) return [a];
    const { dist, prev, done } = this;
    dist.fill(Infinity); prev.fill(-1); done.fill(0);
    const heap = [];
    const push = (f, c) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const bx = this.x[b], bz = this.z[b];
    dist[a] = 0; push(0, a);
    while (heap.length) {
      const [, c] = pop();
      if (done[c]) continue;
      done[c] = 1;
      if (c === b) break;
      const nb = this.nb[c];
      for (let k = 0; k < nb.length; k += 2) {
        const j = nb[k], nd = dist[c] + nb[k + 1];
        if (nd < dist[j]) { dist[j] = nd; prev[j] = c; push(nd + Math.hypot(this.x[j] - bx, this.z[j] - bz), j); }
      }
    }
    if (!done[b]) return null;
    const out = []; for (let c = b; c >= 0; c = prev[c]) out.push(c);
    return out.reverse();
  }
}

// ---- building the people of a world --------------------------------------------

export function buildPeople(world) {
  const seed = world.seed >>> 0;
  const p = new Player(world, { rules: 'world' });
  const move = makeMove(world, p);
  const P = { world, seed, p, move, places: [], persons: [], routes: new Map(), plans: new Map(), bad: [] };
  const r = (a, b, k) => hash2(a, b, seed + k);

  // the network
  const net = new Net();
  for (const rd of world.roads) net.line(rd.x, rd.z, rd.n);
  for (const v of world.sites.villages) {
    const pl = v.plan; if (!pl) continue;
    for (const ln of pl.lanes || []) net.line(ln.x, ln.z, ln.n);
    for (const pa of pl.paths || []) net.line(pa.x, pa.z, pa.n);
  }
  net.join();
  P.net = net;
  connectIslands(P);

  // a place: where it is, the feet's height there, which way one faces there
  // (`ax, az`: where one walks to and from, for a seat or a bed, which one
  // sits or lies on from there; the route ends there, the figure is drawn
  // at x, z. A closed door has its doorstep for that.)
  const place = (kind, x, z, hint, yaw = 0, via = -1, extra = {}) => {
    let ax = extra.ax ?? x, az = extra.az ?? z;
    let ft = p.supportAt(ax, az, hint + 0.3);
    // (a spot something stands on, a post say: the nearest clear ground
    // round it, the figure with it if it stands there itself)
    if (p.blocked(ax, az, ft)) {
      let found = false;
      for (let rr = 0.5; rr <= 2.5 && !found; rr += 0.5) for (let k = 0; k < 12 && !found; k++) {
        const a = k * TAU / 12, bx = ax + Math.cos(a) * rr, bz = az + Math.sin(a) * rr, bf = p.supportAt(bx, bz, hint + 0.3);
        if (!p.blocked(bx, bz, bf)) { if (extra.ax === undefined) { x = bx; z = bz; } ax = bx; az = bz; ft = bf; found = true; }
      }
    }
    const pl = { id: P.places.length, kind, x, z, ax, az, ft, yaw, via, link: null, node: -1, ...extra };
    // (two spots moved onto the same ground: the second is not used)
    if (['well', 'green', 'bench', 'field', 'hallspot', 'yard', 'shelter'].includes(kind) && P.places.some((q) => q.kind === kind && Math.hypot(q.x - x, q.z - z) < 0.8)) pl.dup = true;
    P.places.push(pl);
    return pl.id;
  };
  // a seat's or a bed's way on: `d` metres out from (x, z) along yaw
  const before = (x, z, yaw, d) => ({ ax: x + Math.sin(yaw) * d, az: z + Math.cos(yaw) * d });
  P.place = place;
  const G = (x, z) => groundAt(world.terrain, x, z);

  // ---- the villages ----
  P.villages = world.sites.villages.map((v, q) => {
    const pl = v.plan, V = { q, pattern: pl.pattern, centre: pl.centre, houses: [], wells: [], greens: [], benches: [], fields: [], jetty: [], chapel: -1, barns: [], shelter: [], name: `village ${q + 1}` };
    if (!pl) return V;
    const W = SCALE.kit.cottage.wallT;
    pl.houses.forEach((h, k) => {
      const F = frame(h.x, h.z, h.a);
      const en = h.enter ? pl.enter.find((e) => Math.abs(e.x - h.x) < 0.01 && Math.abs(e.z - h.z) < 0.01) : null;
      const [sx, sz] = F.at(0, h.d + 1.2), out = Math.atan2(-F.sa, F.ca);
      const step = place('door', sx, sz, G(sx, sz), out);
      const H = { k, x: h.x, z: h.z, a: h.a, floor: h.floor, enter: !!en, step, kind: h.kind };
      if (en) {
        const wt = h.kind === 'hall' ? SCALE.kit.hall.wallT : W;
        const fs = furnitureSpots(F, h.w - wt, h.d - wt, h.floor + 0.02, en.side || 1);
        const [ix, iz] = F.at(0, h.d - wt - 0.6);
        const inside = place('in', ix, iz, h.floor, out + Math.PI, step, { house: k, q });
        H.inside = inside;
        H.room = roomAt(world.kit, ix, iz, h.floor + 0.02);
        const way = before(fs.sit.x, fs.sit.z, fs.sit.yaw, 0.5);
        H.sit = place('sit', fs.sit.x, fs.sit.z, fs.floor, fs.sit.yaw, inside, { seat: fs.sit.seat, floor: fs.floor, ...way });
        H.bed = place('bed', fs.bed.x, fs.bed.z, fs.floor, fs.bed.yaw, inside, { top: fs.bed.top, floor: fs.floor, lieAt: H.sit, ...way });
        H.hearth = place('hearth', fs.hearth.x, fs.hearth.z, fs.floor, fs.hearth.yaw, inside);
      } else {
        // through the closed door: gone once past it
        const [cx, cz] = F.at(0, h.d - 0.3);
        H.closed = place('closed', cx, cz, h.floor, out + Math.PI, step, { house: k, q, ax: sx, az: sz, floor: h.floor });
      }
      // (the light group of its windows, see the kit: house k of village q)
      H.group = 1 + q * 32 + k;
      V.houses.push(H);
    });
    // the well: spots round it
    if (pl.well) for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.3, x = pl.well.x + Math.cos(a) * 1.9, z = pl.well.z + Math.sin(a) * 1.9;
      V.wells.push(place('well', x, z, G(x, z), Math.atan2(pl.well.x - x, pl.well.z - z)));
    }
    // the green: a ring of spots, and under the market shelter
    if (pl.green) for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8 + 0.2, rr = pl.green.r * (0.35 + 0.2 * (k % 2)), x = pl.green.x + Math.cos(a) * rr, z = pl.green.z + Math.sin(a) * rr;
      V.greens.push(place('green', x, z, G(x, z), Math.atan2(pl.green.x - x, pl.green.z - z) + (k % 3 - 1) * 0.6));
    }
    if (pl.shelter) for (const du of [-0.8, 0.8]) { const x = pl.shelter.x + du, z = pl.shelter.z; V.shelter.push(place('shelter', x, z, G(x, z), 0)); }
    // benches: two seats each, facing the way the bench faces
    for (const b of pl.benches || []) {
      const F = frame(b.x, b.z, b.a), [fx, fz] = F.dir(0, 1), yaw = Math.atan2(fx, fz);
      for (const u of [-0.4, 0.4]) { const [x, z] = F.at(u, -0.04); V.benches.push(place('bench', x, z, b.base, yaw, -1, { seat: b.base + SCALE.kit.bench.seat, ...before(x, z, yaw, 0.6) })); }
    }
    // the chapel's door
    if (pl.chapel) {
      const c = pl.chapel, F = frame(c.x, c.z, c.a), u = c.tower ? c.w + 2 * SCALE.kit.chapel.tower + 1.0 : c.w + 1.3;
      const [x, z] = F.at(u, 0);
      V.chapel = place('chapel', x, z, G(x, z), Math.atan2(-F.ca, -F.sa));
    }
    // barns: just inside the wide doorway (shelter from rain)
    for (const b of pl.barns || []) {
      const F = frame(b.x, b.z, b.a), [sx, sz] = F.at(0, b.d + 1.4), [ix, iz] = F.at(0, b.d - 1.4);
      const st = place('barndoor', sx, sz, G(sx, sz), Math.atan2(-F.sa, F.ca));
      const bn = place('barn', ix, iz, b.floor, Math.atan2(F.sa, -F.ca), st), dp = P.places[st], ip = P.places[bn];
      // (only a barn one can walk into: on a slope its floor can stand
      // higher over the ground at its doorway than a step)
      if (clearLine(move, [dp.ax, dp.az], [ip.ax, ip.az], dp.ft) && clearLine(move, [ip.ax, ip.az], [dp.ax, dp.az], ip.ft)) V.barns.push(bn);
    }
    // the fields: a gate where each field's footpath ends, and strips of
    // work spots into the field from there
    for (const pa of pl.paths || []) {
      if (pa.to !== 'field') continue;
      const ex = pa.x[0], ez = pa.z[0];
      const f = (pl.fields || []).reduce((b, f) => (!b || Math.hypot(f.x - ex, f.z - ez) < Math.hypot(b.x - ex, b.z - ez) ? f : b), null);
      if (!f) continue;
      const gate = place('fieldgate', ex, ez, G(ex, ez), 0);
      const dl = Math.hypot(f.x - ex, f.z - ez) || 1, ux = (f.x - ex) / dl, uz = (f.z - ez) / dl;
      // (a spot is kept only if it can be walked to from the gate and back:
      // a dry-stone wall can stand between)
      const gp = P.places[gate];
      for (let k = 0; k < 8 && V.fields.filter((id) => P.places[id].via === gate).length < 6; k++) {
        const d = 3 + k * 3.2, side = (k % 2 ? 1 : -1) * (1 + (k >> 1) * 1.6);
        const x = ex + ux * d - uz * side, z = ez + uz * d + ux * side;
        const ft = p.supportAt(x, z, G(x, z) + 0.3);
        if (p.blocked(x, z, ft) || !clearLine(move, [gp.ax, gp.az], [x, z], gp.ft) || !clearLine(move, [x, z], [gp.ax, gp.az], ft)) continue;
        V.fields.push(place('field', x, z, G(x, z), Math.atan2(-uz, ux), gate));
      }
    }
    // the jetty: along it to its end
    if (pl.jetty) {
      const [ax, az] = pl.jetty.a, [bx, bz] = pl.jetty.b, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const foot = place('jettyfoot', ax - ux * 1.2, az - uz * 1.2, G(ax - ux * 1.2, az - uz * 1.2), 0);
      const yaw = Math.atan2(ux, uz);
      const mid = place('jetty', ax + ux * L * 0.55 - uz * 0.25, az + uz * L * 0.55 + ux * 0.25, pl.jetty.y, yaw + 0.9, foot);
      const end = place('jetty', bx - ux * 0.9 + uz * 0.2, bz - uz * 0.9 - ux * 0.2, pl.jetty.y, yaw, mid);
      V.jetty.push(end, mid);
    }
    V.road = world.roads.findIndex((rd) => rd.to === `village ${q + 1}`);
    for (const key of ['wells', 'greens', 'benches', 'fields', 'shelter']) V[key] = V[key].filter((id) => !P.places[id].dup);
    return V;
  });

  // ---- the fort ----
  const f = world.sites.fort;
  if (f) {
    const o = f.gate.out, base = f.base;
    const F = { base };
    F.front = place('gate', f.front.x + o[0] * 1.5, f.front.z + o[1] * 1.5, G(f.front.x, f.front.z), Math.atan2(o[0], o[1]));
    F.inner = place('inner', f.inner.x - o[0] * 4, f.inner.z - o[1] * 4, base, Math.atan2(-o[0], -o[1]), F.front);
    // the gate's watch: just outside the passage, facing out
    F.post = place('post', f.front.x + o[0] * 0.6 - o[1] * 1.4, f.front.z + o[1] * 0.6 + o[0] * 1.4, G(f.front.x, f.front.z), Math.atan2(o[0], o[1]), F.front);
    // the keep: its door, the hall, the bunks (the hall's bed is the first)
    const kd = f.keep.door, kx = f.keep.x, kz = f.keep.z, dl = Math.hypot(kd.x - kx, kd.z - kz) || 1, ux = (kd.x - kx) / dl, uz = (kd.z - kz) / dl;
    F.keepDoor = place('keepdoor', kd.x + ux * 1.6, kd.z + uz * 1.6, base, Math.atan2(ux, uz), F.inner);
    F.hall = place('hall', kd.x - ux * 2.8, kd.z - uz * 2.8, base, Math.atan2(-ux, -uz), F.keepDoor);
    F.room = roomAt(world.kit, kd.x - ux * 2.8, kd.z - uz * 2.8, base + 0.06);
    const kp = world.fortDesc.pieces.find((x) => x.kind === 'keep');
    const bunks = kp ? keepBunks(kp) : [];
    // the hall's own bed (furnished in phase 3a) and the bunks
    F.bunks = [];
    if (kp) {
      const Ff = frame(kp.at[0], kp.at[1], kp.angle - Math.PI / 2), wt = SCALE.kit.keep.wallT;
      const fs = furnitureSpots(Ff, kp.w - wt, kp.d - wt, base + 0.06, 1);
      const way = before(fs.sit.x, fs.sit.z, fs.sit.yaw, 0.5);
      const sit = place('sit', fs.sit.x, fs.sit.z, fs.floor, fs.sit.yaw, F.hall, { seat: fs.sit.seat, floor: fs.floor, ...way });
      F.bunks.push(place('bed', fs.bed.x, fs.bed.z, fs.floor, fs.bed.yaw, F.hall, { top: fs.bed.top, floor: fs.floor, lieAt: sit, ...way }));
      F.hearth = place('hearth', fs.hearth.x, fs.hearth.z, fs.floor, fs.hearth.yaw, F.hall);
    }
    for (const bk of bunks) {
      // (lying along the bunk; sitting on its room side)
      const ca = Math.cos(bk.a), sa = Math.sin(bk.a);
      const [rx, rz] = [kx - bk.x, kz - bk.z], side = (-sa * rx + ca * rz) > 0 ? 1 : -1;
      const sx = bk.x - sa * side * (SCALE.kit.bed.d - 0.12), sz = bk.z + ca * side * (SCALE.kit.bed.d - 0.12);
      const syaw = Math.atan2(-sa * side, ca * side), way = before(sx, sz, syaw, 0.5);
      const sit = place('sit', sx, sz, base + 0.06, syaw, F.hall, { seat: bk.top, floor: base + 0.06, ...way });
      F.bunks.push(place('bed', bk.x, bk.z, base + 0.06, bk.yaw, F.hall, { top: bk.top, floor: base + 0.06, lieAt: sit, ...way }));
    }
    // the hall: a few spots to stand about in, off watch
    F.hallSpots = [];
    {
      const hp = P.places[F.hall];
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + 0.4, x = hp.x + Math.cos(a) * 1.7, z = hp.z + Math.sin(a) * 1.7;
        const id = place('hallspot', x, z, base + 0.06, Math.atan2(hp.x - x, hp.z - z), F.hall);
        // (on the floor, not up on a bunk or the table)
        const q = P.places[id];
        if (!P.p.blocked(q.ax, q.az, q.ft) && Math.abs(q.ft - (base + 0.06)) < 0.08 && clearLine(move, [hp.ax, hp.az], [q.ax, q.az], hp.ft) && clearLine(move, [q.ax, q.az], [hp.ax, hp.az], q.ft)) F.hallSpots.push(id);
      }
    }
    // the yard: a few spots between the gate and the keep
    F.yard = [];
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + 0.15 * k, x = f.inner.x + (kd.x - f.inner.x) * t + (k % 2 ? 1 : -1) * 2.2 * uz, z = f.inner.z + (kd.z - f.inner.z) * t - (k % 2 ? 1 : -1) * 2.2 * ux;
      F.yard.push(place('yard', x, z, base, Math.atan2(-ux, -uz) + k, F.inner));
    }
    // the wall walk: from each stair's top, a beat along its run of wall
    // between the towers at its ends
    F.beats = [];
    const W = SCALE.kit.wall;
    for (const st of f.stairs) {
      const e = f.edges[st.edge], ex = e.b[0] - e.a[0], ez = e.b[1] - e.a[1], el = Math.hypot(ex, ez), dx = ex / el, dz = ez / el;
      const walkY = base + W.height;
      const ta = f.towers.find((t) => Math.hypot(t.x - e.a[0], t.z - e.a[1]) < 0.5), tb = f.towers.find((t) => Math.hypot(t.x - e.b[0], t.z - e.b[1]) < 0.5);
      const ia = (ta ? ta.size : 4) + 1.6, ib = el - (tb ? tb.size : 4) - 1.6;
      const at = (d) => [e.a[0] + dx * d - e.out[0] * 0.3, e.a[1] + dz * d - e.out[1] * 0.3];
      const foot = place('stairfoot', st.foot[0], st.foot[1], base, 0, F.inner);
      const tq = (st.top[0] - e.a[0]) * dx + (st.top[1] - e.a[1]) * dz;
      const [tx, tz] = at(Math.max(ia, Math.min(ib, tq)));
      const top = place('stairtop', st.top[0], st.top[1], walkY, 0, foot);
      const onWalk = place('walk', tx, tz, walkY, Math.atan2(-e.out[0], -e.out[1]), top);
      const [ax, az] = at(ia), [bx, bz] = at(ib);
      F.beats.push({ walk: onWalk, a: [ax, az], b: [bx, bz], y: P.places[onWalk].ft, len: ib - ia, d0: Math.max(ia, Math.min(ib, tq)) - ia, out: e.out });
    }
    F.hallSpots = F.hallSpots.filter((id) => !P.places[id].dup);
    F.yard = F.yard.filter((id) => !P.places[id].dup);
    F.towns = [];
    P.fort = F;
  }

  // ---- who lives where ----
  const villagesOk = P.villages.filter((V) => V.houses.length);
  for (const V of villagesOk) {
    const n = Math.max(10, Math.min(20, Math.round(V.houses.length * 1.15)));
    const homes = [];
    // a house one can enter has one sleeper (its one bed); the others one or two
    V.houses.forEach((H) => { if (H.enter) homes.push(H.k); });
    const rest = V.houses.filter((H) => !H.enter).map((H) => H.k);
    let k = 0;
    while (homes.length < n && rest.length) { homes.push(rest[k % rest.length]); k++; if (k >= rest.length * 2) break; }
    // roles from what the village has
    const roles = [];
    const nf = V.fields.length ? Math.max(2, Math.round(n * 0.35)) : 0;
    for (let i = 0; i < nf; i++) roles.push('farmer');
    if (V.jetty.length) roles.push('fisher', 'fisher');
    roles.push('carter');
    if (V.chapel >= 0) roles.push('keeper');
    roles.push(V.greens.length ? 'minder' : 'wellkeeper');
    while (roles.length < homes.length) roles.push('householder');
    roles.length = homes.length;
    // shuffled from the seed, so a role is not tied to a kind of house
    const order = roles.map((x, i) => [r(V.q, i, 4551), i]).sort((a, b) => a[0] - b[0]).map((q) => roles[q[1]]);
    homes.forEach((hk, i) => {
      const id = P.persons.length, h = (k2) => r(id, 17, 4501 + k2);
      const role = order[i];
      P.persons.push(makePerson(P, id, role, { village: V.q, home: hk }, h));
    });
  }
  // (each person's place among those of the same role in the village, so
  // spots can be handed out one each)
  for (const per of P.persons) {
    const same = P.persons.filter((q) => q.village === per.village && q.role === per.role);
    per.rank = same.indexOf(per); per.peers = same.length;
  }
  // the guards
  if (P.fort) {
    const ng = 9;
    for (let g = 0; g < ng; g++) {
      const id = P.persons.length, h = (k2) => r(id, 17, 4501 + k2);
      P.persons.push(makePerson(P, id, 'guard', { guard: g, shift: g % 3, post: Math.floor(g / 3) }, h));
    }
  }
  // the travellers
  const towns = [...villagesOk.map((V) => ({ village: V.q })), ...(P.fort ? [{ fort: true }] : [])];
  P.towns = towns;
  const nt = 3 + Math.floor(r(1, 2, 4601) * 2);
  for (let t = 0; t < nt && towns.length >= 2; t++) {
    const id = P.persons.length, h = (k2) => r(id, 17, 4501 + k2);
    P.persons.push(makePerson(P, id, 'traveller', { traveller: t }, h));
  }
  return P;
}

// Joins every part of the network that does not reach the roads (a
// village's lanes and paths that stop short of its road) to the part that
// does, at their nearest nodes, by a straight line or a way round.
function connectIslands(P) {
  const net = P.net, n = net.n, comp = new Int32Array(n).fill(-1);
  let nc = 0;
  for (let i = 0; i < n; i++) {
    if (comp[i] >= 0) continue;
    const q = [i]; comp[i] = nc;
    for (let h = 0; h < q.length; h++) { const nb = net.nb[q[h]]; for (let k = 0; k < nb.length; k += 2) if (comp[nb[k]] < 0) { comp[nb[k]] = nc; q.push(nb[k]); } }
    nc++;
  }
  if (nc < 2) return;
  const size = new Int32Array(nc); for (let i = 0; i < n; i++) size[comp[i]]++;
  let main = 0; for (let c = 1; c < nc; c++) if (size[c] > size[main]) main = c;
  const joined = new Uint8Array(nc); joined[main] = 1;
  // again and again: the part nearest to what is joined so far, until none
  // is left that can be joined (each joined part counts for the next)
  for (let round = 0; round < nc; round++) {
    const pairs = [];
    for (let i = 0; i < n; i++) {
      if (joined[comp[i]]) continue;
      for (let j = 0; j < n; j++) {
        if (!joined[comp[j]]) continue;
        const d = Math.hypot(net.x[i] - net.x[j], net.z[i] - net.z[j]);
        if (d < 250) pairs.push([d, i, j]);
      }
    }
    if (!pairs.length) break;
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const tries = [...pairs.slice(0, 6), ...pairs.filter((q, k) => k >= 6 && k % 25 === 0).slice(0, 10)];
    let done = false;
    for (const [d, i, j] of tries) {
      const a = [net.x[i], net.z[i]], b = [net.x[j], net.z[j]], ft = P.p.supportAt(a[0], a[1], groundAt(P.world.terrain, a[0], a[1]) + 0.3);
      const way = clearLine(P.move, a, b, ft) ? [a, b] : latticeWay(P.move, a, b, ft, d > 60 ? 20 : 10, d > 60 ? 30000 : 6000);
      if (!way) continue;
      let prev = i;
      for (let k = 1; k < way.length - 1; k++) { const nk = net.add(way[k][0], way[k][1]); net.link(prev, nk); prev = nk; }
      net.link(prev, j);
      joined[comp[i]] = 1;
      done = true;
      break;
    }
    if (!done) break;
  }
  net.n = net.x.length;
  net.dist = new Float64Array(net.n); net.prev = new Int32Array(net.n); net.done = new Uint8Array(net.n);
}

function makePerson(P, id, role, at, h) {
  const name = `${GIVEN[Math.floor(h(1) * GIVEN.length)]} ${BYNAME[Math.floor(h(2) * BYNAME.length)]}`;
  const pick = (list, k) => list[Math.floor(h(k) * list.length)];
  let top = pick(CLOTH, 3), bottom = pick(LEGS, 4), hat = pick(CLOTH, 5), hatK = HATK.BARE, tool = TOOL.NONE;
  if (role === 'farmer') { hatK = h(6) < 0.6 ? HATK.HAT : HATK.CAP; tool = TOOL.HOE; }
  else if (role === 'fisher') { hatK = h(6) < 0.5 ? HATK.CAP : HATK.HOOD; tool = TOOL.ROD; }
  else if (role === 'carter') { hatK = HATK.HAT; tool = TOOL.STAFF; }
  else if (role === 'keeper') { hatK = HATK.HOOD; top = h(7) < 0.5 ? MAT.CHARCOAL : MAT.UMBER; tool = TOOL.BROOM; }
  else if (role === 'minder' || role === 'wellkeeper') { hatK = h(6) < 0.5 ? HATK.CAP : HATK.BARE; }
  else if (role === 'householder') { hatK = h(6) < 0.35 ? HATK.HOOD : h(6) < 0.6 ? HATK.CAP : HATK.BARE; }
  else if (role === 'guard') { hatK = HATK.HELMET; top = h(7) < 0.5 ? MAT.SLATE : MAT.CHARCOAL; bottom = MAT.LEATHER; tool = TOOL.SPEAR; }
  else if (role === 'traveller') { hatK = h(6) < 0.5 ? HATK.HOOD : HATK.HAT; top = pick([MAT.UMBER, MAT.MOSS, MAT.OCHRE, MAT.CHARCOAL], 8); tool = TOOL.STAFF; }
  if (top === bottom) bottom = LEGS[(LEGS.indexOf(bottom) + 1) % LEGS.length];
  return {
    id, name, role, label: ROLES[role].label, ...at,
    top, bottom, hat, hatK, tool, skin: h(9) < 0.6 ? MAT.SKIN : MAT.SKIN2,
    scale: 0.93 + 0.11 * h(10), speed: 1.15 + 0.3 * h(11),
  };
}

// ---- routes ------------------------------------------------------------------

// The chain of a place up to the network: [place, parent, ..., root].
function chain(P, id) { const out = []; for (let k = id; k >= 0; k = P.places[k].via) out.push(k); return out; }

// The line from a place to its parent (or to the network), found once.
function linkOf(P, id) {
  const pl = P.places[id];
  if (pl.link) return pl.link;
  const { move } = P;
  if (pl.via >= 0) {
    const pa = P.places[pl.via], a = [pl.ax, pl.az], b = [pa.ax, pa.az];
    // (a closed door's line is its doorstep itself)
    if (pl.kind === 'closed') return (pl.link = [b]);
    if (clearLine(move, a, b, pl.ft)) pl.link = [a, b];
    else pl.link = latticeWay(move, a, b, pl.ft, 10, 5000) || (P.bad.push({ place: id, to: pl.via }), [a, b]);
    return pl.link;
  }
  // to the nearest node of the network it can reach
  const net = P.net, near = net.nearby(pl.ax, pl.az, 45);
  for (const k of near.slice(0, 8)) {
    const b = [net.x[k], net.z[k]];
    if (clearLine(move, [pl.ax, pl.az], b, pl.ft)) { pl.node = k; return (pl.link = [[pl.ax, pl.az], b]); }
  }
  for (const k of near.slice(0, 3)) {
    const way = latticeWay(move, [pl.ax, pl.az], [net.x[k], net.z[k]], pl.ft, 10, 5000);
    if (way) { pl.node = k; return (pl.link = way); }
  }
  // (the nearest nodes can lie across a stream or behind a wall: further
  // ones, with a wider search)
  for (const k of net.nearby(pl.ax, pl.az, 90).slice(0, 12)) {
    const way = latticeWay(move, [pl.ax, pl.az], [net.x[k], net.z[k]], pl.ft, 16, 20000);
    if (way) { pl.node = k; return (pl.link = way); }
  }
  P.bad.push({ place: id, to: 'network' });
  pl.node = near[0] !== undefined ? near[0] : 0;
  return (pl.link = [[pl.ax, pl.az], [net.x[pl.node], net.z[pl.node]]]);
}

// The route from place a to place b: { x, z, y, cum, len, n } sampled every
// half metre (the feet's height at each), or null if it cannot be walked.
export function routeOf(P, a, b) {
  const key = a * 65536 + b;
  if (P.routes.has(key)) return P.routes.get(key);
  const ca = chain(P, a), cb = chain(P, b);
  const pts = [];
  const common = ca.find((k) => cb.includes(k));
  const up = (c, until) => { for (const k of c) { if (k === until) break; const L = linkOf(P, k); for (let i = 0; i < L.length - 1; i++) pts.push(L[i]); } };
  const down = (c, until) => {
    const seg = [];
    for (const k of c) { if (k === until) break; const L = linkOf(P, k); seg.push(L); }
    for (let s = seg.length - 1; s >= 0; s--) { const L = seg[s]; for (let i = L.length - 1; i >= 1; i--) pts.push(L[i]); }
  };
  if (common !== undefined) {
    up(ca, common);
    pts.push([P.places[common].ax, P.places[common].az]);
    down(cb, common);
  } else {
    up(ca, -1);
    const ra = P.places[ca[ca.length - 1]], rb = P.places[cb[cb.length - 1]];
    linkOf(P, ra.id); linkOf(P, rb.id);
    const way = P.net.path(ra.node, rb.node);
    if (way) for (const k of way) pts.push([P.net.x[k], P.net.z[k]]);
    down(cb, -1);
  }
  pts.push([P.places[b].ax, P.places[b].az]);
  // drop repeats
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const q = clean[clean.length - 1]; if (Math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]) > 0.05) clean.push(pts[i]); }
  P.lastPts = clean;
  let line = clean.length > 1 ? sampleRoute(P.move, clean, P.places[a].ft) : { x: Float64Array.of(clean[0][0]), z: Float64Array.of(clean[0][1]), y: Float64Array.of(P.places[a].ft), n: 1 };
  // through a closed door: the last (or first) steps go in through it,
  // straight, at its sill (no player could; the person is gone inside)
  if (line) {
    const pa = P.places[a], pb = P.places[b];
    const thr = (pl) => { const xs = [], zs = []; for (let k = 1; k <= 3; k++) { const f = k / 3; xs.push(pl.ax + (pl.x - pl.ax) * f); zs.push(pl.az + (pl.z - pl.az) * f); } return { xs, zs }; };
    if (pb.kind === 'closed') { const { xs, zs } = thr(pb); line = { x: Float64Array.from([...line.x, ...xs]), z: Float64Array.from([...line.z, ...zs]), y: Float64Array.from([...line.y, pb.floor, pb.floor, pb.floor]), n: line.n + 3 }; }
    if (pa.kind === 'closed') { const { xs, zs } = thr(pa); line = { x: Float64Array.from([...xs.reverse(), ...line.x]), z: Float64Array.from([...zs.reverse(), ...line.z]), y: Float64Array.from([pa.floor, pa.floor, pa.floor, ...line.y]), n: line.n + 3 }; }
  }
  if (line && line.n < 2) line = { x: Float64Array.of(line.x[0], line.x[0]), z: Float64Array.of(line.z[0], line.z[0]), y: Float64Array.of(line.y[0], line.y[0]), n: 2 };
  if (line) {
    const cum = new Float64Array(line.n);
    for (let i = 1; i < line.n; i++) cum[i] = cum[i - 1] + Math.hypot(line.x[i] - line.x[i - 1], line.z[i] - line.z[i - 1]);
    line.cum = cum; line.len = cum[line.n - 1];
    // through a closed door: hidden until the body is clear of the house
    // (at least the last 35 cm; more where the wall is thick or the door deep)
    const clearAt = (k) => !P.p.blocked(line.x[k], line.z[k], line.y[k]);
    line.hideA = 0.35; line.hideB = 0.35;
    if (P.places[a].kind === 'closed') { let k = 0; while (k < line.n - 1 && (k < 3 || !clearAt(k) || !clearAt(k + 1))) k++; line.hideA = Math.max(0.35, cum[Math.min(k + 1, line.n - 1)]); }
    if (P.places[b].kind === 'closed') { let k = line.n - 1; while (k > 0 && (k > line.n - 4 || !clearAt(k) || !clearAt(k - 1))) k--; line.hideB = Math.max(0.35, line.len - cum[Math.max(k - 1, 0)]); }
  } else P.bad.push({ route: [a, b] });
  P.routes.set(key, line);
  return line;
}

// ---- plans ---------------------------------------------------------------------

// A plan: segments in time order covering the day, each
//   { t0, t1, kind: 'stay', at: place, pose, act } or
//   { t0, t1, kind: 'walk', from, to, route, act }
// (hours). A stay inside a closed house is hidden; asleep in a bed lies on it.
export function planOf(P, i, day) {
  const key = i * 100000 + day;
  let plan = P.plans.get(key);
  if (plan) return plan;
  const per = P.persons[i];
  const fc = forecastOf(P.seed, day);
  const plan2 = per.role === 'guard' ? guardPlan(P, per, day) : per.role === 'traveller' ? travellerPlan(P, per, day, fc) : villagerPlan(P, per, day, fc);
  plan = finish(P, per, plan2);
  P.plans.set(key, plan);
  if (P.plans.size > 4000) P.plans.delete(P.plans.keys().next().value);
  return plan;
}

// The day's visits [{ at, from, to, pose, act }] become stays and the walks
// between them (a walk leaves at the stay's end, and the next stay starts on
// arrival; a stay too short for its walk is left out).
function finish(P, per, visits) {
  const segs = [];
  let cur = visits[0], t = 0;
  segs.push({ t0: 0, t1: cur.to, kind: 'stay', at: cur.at, pose: cur.pose, act: cur.act });
  t = cur.to;
  for (let k = 1; k < visits.length; k++) {
    const v = visits[k];
    if (v.at === cur.at) { segs[segs.length - 1].t1 = Math.max(segs[segs.length - 1].t1, v.to); if (v.pose !== segs[segs.length - 1].pose) { segs[segs.length - 1].t1 = Math.max(t, v.from); segs.push({ t0: segs[segs.length - 1].t1, t1: v.to, kind: 'stay', at: v.at, pose: v.pose, act: v.act }); } t = segs[segs.length - 1].t1; cur = v; continue; }
    const route = routeOf(P, cur.at, v.at);
    if (!route) continue;
    const dur = route.len / per.speed / 3600;
    const leave = Math.max(t, v.from - dur * 0.5);
    const arrive = leave + dur;
    if (arrive >= v.to - 0.02 && k < visits.length - 1) continue;
    segs[segs.length - 1].t1 = leave;
    segs.push({ t0: leave, t1: arrive, kind: 'walk', from: cur.at, to: v.at, route, act: v.walkAct || 'walk' });
    segs.push({ t0: arrive, t1: Math.max(arrive, v.to), kind: 'stay', at: v.at, pose: v.pose, act: v.act });
    t = Math.max(arrive, v.to);
    cur = v;
  }
  segs[segs.length - 1].t1 = 24;
  return segs;
}

// rain or mist between a and b in the forecast?
const overlaps = (fc, kind, a, b) => fc.some(([f, t, k]) => k === kind && f < b && t > a);
const rainSpans = (fc) => fc.filter(([, , k]) => k === 'rain').map(([f, t]) => [f, t]);

function villagerPlan(P, per, day, fc) {
  const V = P.villages[per.village], H = V.houses[per.home];
  // (two of a house never reach its door at the same moment: the second
  // keeps a quarter of a minute behind the first, the third behind that)
  const ord = P.persons.filter((q) => q.village === per.village && q.home === per.home && q.id < per.id).length;
  const h0 = (k) => hash2(per.id * 131 + k, day, P.seed + 4701);
  const h = (k) => h0(k);
  const home = H.enter ? H.inside : H.closed;
  const sleepAt = H.enter ? H.bed : H.closed, sitAt = H.enter ? H.sit : H.closed;
  const wake = 5.5 + 0.9 * h(1), bed = 21.2 + 1.3 * h(2);
  const v = [];
  v.push({ at: sleepAt, from: 0, to: wake, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  v.push({ at: H.enter ? (h(3) < 0.5 ? H.hearth : sitAt) : home, from: wake, to: wake + 0.35 + 0.3 * h(4), pose: H.enter ? (h(3) < 0.5 ? POSE.STAND : POSE.SIT) : POSE.HIDDEN, act: 'at home' });
  let t = v[v.length - 1].to;
  const pickOf = (list, k) => list[Math.floor(h(k) * list.length) % list.length];
  // (spots handed out by one's place among the role's people, moving round
  // from day to day, so two of a kind seldom choose the same one)
  const spot = (list, k) => (list.length ? list[(per.rank * 2 + day + Math.floor(h(k) * 2) + k) % list.length] : -1);
  const out = (at, from, to, pose, act) => { if (at >= 0 && to > from + 0.05) v.push({ at, from, to, pose, act }); };
  // a bench seat of one's own for the day (those who sit, in order; one
  // without a seat stands instead)
  const sitters = P.persons.filter((q) => q.village === per.village && (q.role === 'householder' || q.role === 'minder' || q.role === 'wellkeeper'));
  const sr = sitters.indexOf(per), seatOf = () => (V.benches.length && sr >= 0 && sr < V.benches.length ? V.benches[(sr + day) % V.benches.length] : -1);
  const homeAgain = (from, to, act = 'at home') => out(H.enter ? sitAt : home, from, to, H.enter ? POSE.SIT : POSE.HIDDEN, act);
  const role = per.role;
  if (role === 'farmer') {
    // a strip each (the farmers of a village take different spots, moving
    // round them from day to day; the afternoon's another)
    const nf = V.fields.length, own = (k) => V.fields[(per.rank + day * per.peers + k * per.peers) % nf];
    if (h(6) < 0.4) { out(V.wells[(per.rank + day) % V.wells.length] ?? -1, t + 0.1, t + 0.35, POSE.STAND, 'drawing water'); t += 0.4; }
    out(nf ? own(0) : -1, t + 0.1, 11.7 + 0.3 * h(8), POSE.WORK, 'working the field');
    homeAgain(12.0 + 0.2 * h(9), 12.9 + 0.2 * h(10), 'at the midday meal');
    out(nf ? own(1) : -1, 13.3, 17.2 + 0.6 * h(12), POSE.WORK, 'working the field');
  } else if (role === 'fisher') {
    let start = 6.0 + 0.4 * h(5);
    // mist on the water: they wait for it to lift
    for (const [f0, f1, k] of fc) if (k === 'mist' && f0 <= start + 0.5 && f1 > start) start = f1 + 0.2 + 0.4 * h(6);
    if (start < t + 0.1) start = t + 0.1;
    homeAgain(t, start - 0.15);
    out(V.jetty[(per.id + day) % V.jetty.length], start, 11.0 + 0.4 * h(7), POSE.FISH, 'fishing');
    homeAgain(11.5, 13.0 + 0.3 * h(8), 'at the midday meal');
    out(V.jetty[(per.id + day + 1) % V.jetty.length], 13.6, 17.3 + 0.5 * h(9), POSE.FISH, 'fishing');
  } else if (role === 'carter') {
    // to another town and back, by the roads
    const towns = P.towns.filter((tw) => tw.village !== per.village);
    const tw = towns[(per.id + day) % towns.length];
    const dest = tw.fort ? P.fort.front : (P.villages[tw.village].wells[0] ?? P.villages[tw.village].houses[0].step);
    out(H.step, t + 0.1, 7.0 + 0.4 * h(5), POSE.STAND, 'loading the cart');
    out(dest, 7.5, 12.5 + 0.5 * h(6), POSE.STAND, tw.fort ? 'at the fort' : 'trading');
    out(H.step, 13.0, 17.0, POSE.STAND, 'unloading');
  } else if (role === 'keeper') {
    out(V.chapel, t + 0.1, 9.6 + 0.3 * h(5), POSE.SWEEP, 'sweeping the chapel step');
    out(spot(V.greens.length ? V.greens : V.wells, 6), 9.9, 11.6, POSE.STAND, 'talking');
    homeAgain(12.0, 13.0, 'at the midday meal');
    out(V.chapel, 13.5, 16.8 + 0.4 * h(7), POSE.STAND, 'keeping the chapel');
  } else if (role === 'minder' || role === 'wellkeeper') {
    const place1 = role === 'minder' ? spot(V.greens, 5) : spot(V.wells, 5);
    const seat = h(6) < 0.5 ? seatOf() : -1;
    out(place1, t + 0.2, 10.8, POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
    if (seat >= 0) out(seat, 10.9, 12.8, POSE.SIT, 'resting'); else out(place1, 10.9, 12.8, POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
    homeAgain(13.0, 13.7, 'at the midday meal');
    out(role === 'minder' ? spot(V.greens, 7) : spot(V.wells, 7), 13.5, 18.0 + 0.4 * h(8), POSE.STAND, role === 'minder' ? 'minding the green' : 'keeping the well');
  } else {
    // keeping house: the doorstep, the well, a neighbour, the green
    out(H.step, t + 0.1, 8.6 + 0.6 * h(5), POSE.STAND, 'at the door');
    out(spot(V.wells, 6), 8.9 + 0.5 * h(7), 9.5 + 0.5 * h(7), POSE.STAND, 'drawing water');
    if (h(8) < 0.7) {
      const nb = V.houses[(per.home + 1 + Math.floor(h(9) * (V.houses.length - 1))) % V.houses.length];
      out(nb.step, 10.0, 10.9 + 0.4 * h(10), POSE.STAND, 'visiting a neighbour');
    }
    // midday on the green (or by the well, or under the market shelter):
    // where the village meets
    const meet = V.shelter.length && per.rank % 3 === 2 ? V.shelter[per.rank % V.shelter.length] : spot(V.greens.length ? V.greens : V.wells, 13);
    if (h(15) < 0.75) out(meet, 11.1 + 0.3 * h(16), 12.7 + 0.3 * h(17), POSE.STAND, 'talking');
    homeAgain(12.9 + 0.3 * h(18), 14.4 + h(11));
    const seat = seatOf();
    if (seat >= 0 && h(12) < 0.6) out(seat, 15.0, 16.4, POSE.SIT, 'resting');
    else out(spot(V.greens.length ? V.greens : V.wells, 19), 15.0, 16.4, POSE.STAND, 'talking');
    out(H.step, 16.8, 18.0 + 0.5 * h(14), POSE.STAND, 'at the door');
  }
  // rain: out-of-doors work is left for shelter (a barn, the market shelter,
  // or home) while it rains, each person after their own short while
  const spans = rainSpans(fc);
  const sheltered = [];
  for (const vi of v) {
    const pk = P.places[vi.at].kind;
    const outdoors = ['field', 'jetty', 'green', 'well', 'bench', 'door', 'chapel', 'gate'].includes(pk);
    let pieces = [vi];
    if (outdoors) for (const [r0, r1] of spans) {
      const next = [];
      for (const pc of pieces) {
        const a = r0 + 0.1 + 0.35 * h(30 + Math.floor(r0)), b = r1 + 0.15 + 0.3 * h(40 + Math.floor(r1));
        if (b <= pc.from || a >= pc.to) { next.push(pc); continue; }
        if (a > pc.from + 0.1) next.push({ ...pc, to: a });
        const shelter = pk === 'field' && V.barns.length ? V.barns[per.id % V.barns.length] : V.shelter.length && pk === 'green' ? V.shelter[per.id % V.shelter.length] : (H.enter ? sitAt : home);
        next.push({ at: shelter, from: Math.max(a, pc.from), to: Math.min(b, pc.to), pose: P.places[shelter].kind === 'closed' ? POSE.HIDDEN : P.places[shelter].kind === 'sit' ? POSE.SIT : POSE.STAND, act: 'sheltering from the rain' });
        if (b < pc.to - 0.1) next.push({ ...pc, from: b });
      }
      pieces = next;
    }
    sheltered.push(...pieces);
  }
  // evening: home by dusk, awake by the fire, then to bed
  const last = sheltered[sheltered.length - 1];
  const back = Math.max(last.to + 0.1, 18.6 + 0.9 * h(20));
  sheltered.push({ at: H.enter ? sitAt : home, from: back, to: bed, pose: H.enter ? POSE.SIT : POSE.HIDDEN, act: 'at home' });
  sheltered.push({ at: sleepAt, from: bed, to: 24, pose: H.enter ? POSE.SLEEP : POSE.HIDDEN, act: 'asleep' });
  const shift = ord * 0.0042;
  if (shift) for (const vi of sheltered) { if (vi.from > 0) vi.from += shift; if (vi.to < 24) vi.to += shift; }
  return sheltered.sort((a, b) => a.from - b.from);
}

// The guards: three watches of eight hours (6-14, 14-22, 22-6), three to a
// watch: one at the gate, two walking their beats on the wall. The next
// watch leaves the keep early, so a post is never left until its relief has
// come. Off watch: asleep in a bunk for eight hours, else in the hall.
function guardPlan(P, per, day) {
  const F = P.fort, h = (k) => hash2(per.id * 131 + k, day, P.seed + 4801);
  const starts = [6, 14, 22], s0 = starts[per.shift];
  const post = per.post === 0 ? F.post : F.beats.length ? F.beats[(per.post - 1) % F.beats.length].walk : F.post;
  // (a watch sleeps together: a bunk each by post; the watches take turns)
  const bunk = F.bunks[per.post % F.bunks.length];
  const pose = per.post === 0 ? POSE.STAND : POSE.WALK;
  const act = per.post === 0 ? 'keeping the gate' : 'walking the wall';
  // the hour the watch begins and ends on this day
  const v = [];
  const sleepFrom = (s0 + 8 + 0.5) % 24, sleepTo = (sleepFrom + 7.5) % 24;
  const onDuty = (t) => ((t - s0 + 24) % 24) < 8;
  const asleep = (t) => ((t - sleepFrom + 24) % 24) < 7.5;
  // build the day hour by hour in pieces: duty, sleep, the hall
  const bounds = [0, 24, s0 % 24, (s0 + 8) % 24, sleepFrom, sleepTo].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b);
  for (let k = 0; k < bounds.length - 1; k++) {
    const a = bounds[k], b = bounds[k + 1], mid = (a + b) / 2;
    if (b - a < 1e-6) continue;
    // (the next watch goes up early: a quarter of an hour before the hour;
    // the watch ending comes down once relieved)
    if (onDuty(mid)) {
      const a2 = a === s0 % 24 ? a - 0.25 : a, b2 = b === (s0 + 8) % 24 ? b + 0.05 : b;
      v.push({ at: post, from: Math.max(0, a2), to: Math.min(24, b2), pose, act, duty: true });
    } else if (asleep(mid)) v.push({ at: bunk, from: a, to: b, pose: POSE.SLEEP, act: 'asleep in the barracks' });
    else {
      // the hall (a spot of one's own: each guard their own of the hall's
      // spots), or a turn in the yard
      const own = F.hallSpots.length ? F.hallSpots[per.guard % F.hallSpots.length] : F.hall;
      const yard = F.yard[per.guard % F.yard.length];
      if (b - a > 2 && h(Math.floor(a)) < 0.5) {
        v.push({ at: own, from: a, to: (a + b) / 2, pose: POSE.STAND, act: 'off watch' });
        v.push({ at: yard, from: (a + b) / 2, to: b, pose: POSE.STAND, act: 'off watch' });
      } else v.push({ at: own, from: a, to: b, pose: POSE.STAND, act: 'off watch' });
    }
  }
  // overlapping ends: the duty piece wins (it starts early); trim the rest
  v.sort((x, y) => x.from - y.from || (y.duty ? 1 : 0) - (x.duty ? 1 : 0));
  for (let k = 1; k < v.length; k++) if (v[k].from < v[k - 1].to) { if (v[k].duty) v[k - 1].to = v[k].from; else v[k].from = v[k - 1].to; }
  // (the three of a watch keep a quarter of a minute apart, so they do not
  // walk in one another's steps)
  const sh = per.post * 0.0042;
  if (sh) for (const vi of v) { if (vi.from > 0) vi.from += sh; if (vi.to < 24) vi.to += sh; }
  return v.filter((x) => x.to > x.from + 1e-3);
}

// The travellers: from town to town along the roads, a town a day, resting
// on its benches (or by its well, or in the fort's yard) and staying the
// night there sitting up.
function travellerPlan(P, per, day, fc) {
  const T = P.towns, n = T.length, h = (k) => hash2(per.id * 131 + k, day, P.seed + 4901);
  const at = (d) => T[((per.traveller * 2 + d) % n + n) % n];
  const restOf = (tw, k) => {
    if (tw.fort) return P.fort.yard[(per.traveller + k) % P.fort.yard.length];
    const V = P.villages[tw.village];
    const list = V.benches.length ? V.benches : V.wells.length ? V.wells : [V.houses[0].step];
    return list[(per.traveller + k) % list.length];
  };
  const seatPose = (pl) => (P.places[pl].kind === 'bench' ? POSE.SIT : POSE.STAND);
  const A = restOf(at(day), 0), B = restOf(at(day + 1), 0), Bw = at(day + 1).fort ? P.fort.yard[(per.traveller + 2) % P.fort.yard.length] : (P.villages[at(day + 1).village].wells[1] ?? B);
  const v = [];
  v.push({ at: A, from: 0, to: 8.3 + 0.9 * h(1), pose: seatPose(A), act: 'resting' });
  let leave = v[0].to;
  // a traveller waits out heavy rain before setting off
  for (const [f0, f1, k] of fc) if (k === 'rain' && f0 <= leave + 0.3 && f1 > leave) leave = f1 + 0.2;
  // (by the well by day; a bench only from the evening, when the village's
  // own sitters have gone in)
  v.push({ at: Bw, from: leave + 0.1, to: 19.2 + 0.5 * h(2), pose: POSE.STAND, act: 'resting' });
  v.push({ at: B, from: 19.8 + 0.4 * h(3), to: 24, pose: seatPose(B), act: 'resting' });
  return v;
}

// ---- where someone is ---------------------------------------------------------

// How far along its route a walk segment is at an hour (metres).
export function alongOf(P, i, seg, hour) {
  return seg.kind === 'walk' ? Math.min(seg.route.len, Math.max(0, (hour - seg.t0) * 3600 * P.persons[i].speed)) : 0;
}

// The segment of a plan at an hour.
export function segmentAt(plan, hour) {
  let lo = 0, hi = plan.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (plan[m].t0 <= hour) lo = m; else hi = m - 1; }
  return plan[lo];
}

// A person's state at (day, hour), written to out[o .. o + FS): see
// world/people/figure.js. Returns the segment (for the tools and the menu).
export function stateAt(P, i, day, hour, out, o) {
  const per = P.persons[i], plan = planOf(P, i, day), seg = segmentAt(plan, hour);
  let x, z, y, yaw, pose, phase = 0, room = -1, aux = 0;
  const night = hour >= DUSK || hour < DAWN;
  if (seg.kind === 'walk') {
    const R = seg.route, s = Math.min(R.len, Math.max(0, (hour - seg.t0) * 3600 * per.speed));
    // the sample at distance s
    let lo = 0, hi = R.n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R.cum[m] <= s) lo = m; else hi = m - 1; }
    const j = Math.min(lo, R.n - 2), seg0 = R.cum[j + 1] - R.cum[j], f = seg0 > 1e-9 ? (s - R.cum[j]) / seg0 : 0;
    x = R.x[j] + (R.x[j + 1] - R.x[j]) * f; z = R.z[j] + (R.z[j + 1] - R.z[j]) * f; y = R.y[j] + (R.y[j + 1] - R.y[j]) * f;
    // facing: along the route a little ahead (smoother than one sample)
    const k2 = Math.min(R.n - 1, j + 3), k1 = Math.max(0, j - 2);
    yaw = Math.atan2(R.x[k2] - R.x[k1], R.z[k2] - R.z[k1]);
    pose = POSE.WALK; phase = (s / STRIDE) % 1;
    // through a closed door: gone once past it
    const to = P.places[seg.to];
    if (to.kind === 'closed' && R.len - s < R.hideB) pose = POSE.HIDDEN;
    const from = P.places[seg.from];
    if (from.kind === 'closed' && s < R.hideA) pose = POSE.HIDDEN;
  } else {
    const pl = P.places[seg.at];
    x = pl.x; z = pl.z; y = pl.ft; yaw = pl.yaw; pose = seg.pose;
    if (pose === POSE.SIT) { aux = (pl.seat ?? y + 0.45) - y; }
    if (pose === POSE.SLEEP && pl.kind === 'bed') { y = pl.floor; aux = pl.top - pl.floor; }
    // a beat on the wall: up and down it with the clock (the same at
    // midnight on both days, so the watch runs on)
    if (pl.kind === 'walk' && pose === POSE.WALK) {
      const beat = P.fort.beats.find((b) => b.walk === seg.at);
      const T = (day * 24 + hour) * 3600 * 0.8 / beat.len + per.id * 0.37;
      const tri = T % 2, u = tri < 1 ? tri : 2 - tri;
      x = beat.a[0] + (beat.b[0] - beat.a[0]) * u; z = beat.a[1] + (beat.b[1] - beat.a[1]) * u; y = beat.y;
      yaw = tri < 1 ? Math.atan2(beat.b[0] - beat.a[0], beat.b[1] - beat.a[1]) : Math.atan2(beat.a[0] - beat.b[0], beat.a[1] - beat.b[1]);
      phase = (T * beat.len / STRIDE) % 1;
      // (the second guard on the same beat walks it half a beat behind)
    }
    if (pose === POSE.STAND || pose === POSE.WORK || pose === POSE.SWEEP) {
      // a slow look about, from the clock
      yaw += 0.35 * Math.sin((day * 24 + hour) * 9.7 + per.id * 1.3);
    }
    if (pl.kind === 'in' || pl.kind === 'sit' || pl.kind === 'bed' || pl.kind === 'hearth' || pl.kind === 'hall') room = roomOfPerson(P, per, pl);
  }
  if (seg.kind === 'walk' && (P.places[seg.from].kind === 'in' || P.places[seg.to].kind === 'in' || P.places[seg.from].kind === 'hall' || P.places[seg.to].kind === 'hall')) {
    // indoors part of the way: the room while inside the walls
    const r2 = roomAt(P.world.kit, x, z, y + 0.02);
    room = r2;
  }
  // a light out of doors after dark: a torch for the watch, a lantern for the rest
  let light = LIGHT.NONE;
  if (night && room < 0 && pose !== POSE.HIDDEN && pose !== POSE.SLEEP) light = per.role === 'guard' ? LIGHT.TORCH : (pose === POSE.WALK || per.role === 'traveller') ? LIGHT.LANTERN : LIGHT.NONE;
  out[o + S.X] = x; out[o + S.Z] = z; out[o + S.FEET] = y; out[o + S.YAW] = yaw; out[o + S.HEAD] = 0;
  out[o + S.POSE] = pose; out[o + S.PHASE] = phase; out[o + S.LIGHT] = light; out[o + S.ROOM] = room;
  out[o + S.TOP] = per.top; out[o + S.BOTTOM] = per.bottom; out[o + S.HAT] = per.hat; out[o + S.SKIN] = per.skin;
  out[o + S.HATK] = per.hatK; out[o + S.TOOL] = pose === POSE.SLEEP || pose === POSE.SIT || room >= 0 ? TOOL.NONE : per.tool;
  out[o + S.SCALE] = per.scale; out[o + S.AUX] = aux; out[o + S.ID] = per.id;
  return seg;
}

function roomOfPerson(P, per, pl) {
  if (pl.room !== undefined) return pl.room;
  pl.room = roomAt(P.world.kit, pl.x, pl.z, (pl.floor ?? pl.ft) + 0.02);
  return pl.room;
}

// Who is at home and awake in each house (the light groups of its windows):
// out[group] = 1 if lit.
export function litGroups(P, day, hour, out) {
  out.fill(0);
  for (const per of P.persons) {
    if (per.village === undefined) continue;
    const seg = segmentAt(planOf(P, per.id, day), hour);
    if (seg.kind !== 'stay' || seg.pose === POSE.SLEEP) continue;
    const pl = P.places[seg.at];
    if (pl.kind === 'closed' || pl.kind === 'sit' || pl.kind === 'in' || pl.kind === 'hearth') {
      const H = P.villages[per.village].houses[per.home];
      if (hour >= 16.5 || hour < 9) out[H.group] = 1;
    }
  }
  return out;
}
