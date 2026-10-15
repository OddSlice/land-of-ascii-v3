// Building the people of a world (phase 4a; the rules are in
// src/world/people/people.js): who lives where, their places (doorsteps,
// beds, spots by the well, on the green, in the fields, at the fort), each
// hung from the network by a line the player could walk, and each person's
// looks. Built once, the same on every thread.
import { hash2 } from '../noise.js';
import { MAT } from '../../contract.js';
import { Player } from '../../app/player.js';
import { groundAt } from '../objects.js';
import { frame, keepBunks } from '../kit-pieces.js';
import { furnitureSpots } from '../kit-village.js';
import { roomAt } from '../kit.js';
import { SCALE } from '../scale.js';
import { makeMove, latticeWay, clearLine } from './walk.js';
import { GIVEN, BYNAME, ROLES } from './names.js';
import { HATK, TOOL } from './figure.js';
import { Net } from './net.js';

const TAU = Math.PI * 2;
const CLOTH = [MAT.LINEN, MAT.RUSSET, MAT.OCHRE, MAT.MOSS, MAT.SLATE, MAT.UMBER, MAT.CHARCOAL];
const LEGS = [MAT.UMBER, MAT.CHARCOAL, MAT.SLATE, MAT.LEATHER, MAT.MOSS];

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
    const pl = v.plan, V = { q, pattern: pl.pattern, centre: pl.centre, houses: [], wells: [], greens: [], benches: [], fields: [], jetty: [], chapel: -1, barns: [], shelter: [], pastures: [], folds: [], name: `village ${q + 1}` };
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
    const pasGate = new Map();
    for (const pa of pl.paths || []) {
      if (pa.to !== 'field') continue;
      const ex = pa.x[0], ez = pa.z[0];
      // (phase 4b: a pasture is the flock's, not worked: its path's end is its gate)
      const nb = (pl.fields || []).reduce((b, f) => (!b || Math.hypot(f.x - ex, f.z - ez) < Math.hypot(b.x - ex, b.z - ez) ? f : b), null);
      if (nb && nb.pasture) { if (!pasGate.has(nb)) pasGate.set(nb, [ex, ez]); continue; }
      const f = (pl.fields || []).filter((f) => !f.pasture).reduce((b, f) => (!b || Math.hypot(f.x - ex, f.z - ez) < Math.hypot(b.x - ex, b.z - ez) ? f : b), null);
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
    // (phase 4b) the pastures: a gate where the footpath ends, and spots on
    // a grid inside, each walkable from the gate and back; the folds: a
    // gate outside the gap, the inside, and a place for each sheep
    for (const f of pl.fields || []) {
      if (!f.pasture) continue;
      const ca = Math.cos(f.a), sa = Math.sin(f.a), toW = (u, w) => [f.x + u * ca - w * sa, f.z + u * sa + w * ca];
      // (the footpath's end, else the middles of its sides outside the
      // wall's gaps, nearest the village first: the first from which the
      // road network can be reached; a pasture between other walled fields
      // can have its footpath's end shut in)
      const reaches = ([x, z]) => {
        const ft = p.supportAt(x, z, G(x, z) + 0.3);
        if (p.blocked(x, z, ft)) return false;
        const near = net.nearby(x, z, 90).slice(0, 8);
        for (const k of near) if (clearLine(move, [x, z], [net.x[k], net.z[k]], ft)) return true;
        for (const k of near.slice(0, 4)) if (latticeWay(move, [x, z], [net.x[k], net.z[k]], ft, 16, 20000)) return true;
        return false;
      };
      const sidesOut = [[f.L + 2.5, 0], [-f.L - 2.5, 0], [0, f.W + 2.5], [0, -f.W - 2.5]].map((uw) => toW(...uw))
        .sort((A2, B2) => Math.hypot(A2[0] - pl.centre.x, A2[1] - pl.centre.z) - Math.hypot(B2[0] - pl.centre.x, B2[1] - pl.centre.z));
      const tries = [...(pasGate.get(f) ? [pasGate.get(f)] : []), ...sidesOut];
      const gp = tries.find(reaches) || tries[0];
      const gate = place('pastgate', gp[0], gp[1], G(gp[0], gp[1]), 0);
      const gpl = P.places[gate], spots = [];
      const S2 = SCALE.animals.pastureSpot;
      for (let w = -f.W + S2; w <= f.W - S2 + 1e-6; w += S2) for (let u = -f.L + S2; u <= f.L - S2 + 1e-6; u += S2) {
        const [x, z] = toW(u, w), ft = p.supportAt(x, z, G(x, z) + 0.3);
        if (p.blocked(x, z, ft) || !clearLine(move, [gpl.ax, gpl.az], [x, z], gpl.ft) || !clearLine(move, [x, z], [gpl.ax, gpl.az], ft)) continue;
        spots.push(place('pasture', x, z, G(x, z), 0, gate, { u, w }));
      }
      // (its lee: the side nearest trees within 30 m, else nearest the village)
      const m = SCALE.animals.pastureEdge, toward = (() => {
        let best = null;
        for (const t of world.objects.trees) { const d = Math.hypot(t.x - f.x, t.z - f.z) - Math.hypot(f.L, f.W); if (d < 30 && (!best || d < best[0])) best = [d, t.x, t.z]; }
        return best ? [best[1], best[2]] : [pl.centre.x, pl.centre.z];
      })();
      const lu = (toward[0] - f.x) * ca + (toward[1] - f.z) * sa, lw = -(toward[0] - f.x) * sa + (toward[1] - f.z) * ca;
      const lee = [Math.max(-f.L + m, Math.min(f.L - m, lu)), Math.max(-f.W + m, Math.min(f.W - m, lw))];
      V.pastures.push({ field: (pl.fields || []).indexOf(f), x: f.x, z: f.z, a: f.a, ca, sa, L: f.L, W: f.W, kind: f.pasture, gate, spots, lee });
    }
    for (const fd of pl.folds || []) {
      const og = place('foldgate', fd.gate[0], fd.gate[1], G(fd.gate[0], fd.gate[1]), 0);
      const inside = place('foldin', fd.gateIn[0], fd.gateIn[1], G(fd.gateIn[0], fd.gateIn[1]), 0, og);
      const ca = Math.cos(fd.a), sa = Math.sin(fd.a), slots = [], m = SCALE.animals.foldMargin;
      for (let w = -fd.hd + m; w <= fd.hd - m + 1e-6; w += SCALE.animals.foldSlot) for (let u = -fd.hw + m; u <= fd.hw - m + 1e-6; u += SCALE.animals.foldSlot) {
        const x = fd.x + u * ca - w * sa, z = fd.z + u * sa + w * ca;
        slots.push([x, z, G(x, z)]);
      }
      const pas = V.pastures.find((pp) => pp.field === fd.pasture);
      V.folds.push({ x: fd.x, z: fd.z, a: fd.a, hw: fd.hw, hd: fd.hd, gate: og, inside, slots, pasture: V.pastures.indexOf(pas) });
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
    // (phase 4b) a shepherd for each fold, first, so they are never left out
    for (const fd of V.folds) if (fd.pasture >= 0) roles.push('shepherd');
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
  // (phase 4b) each shepherd's flock (by their rank); each village's dog
  // follows its first shepherd, else someone who keeps house
  for (const V of P.villages) {
    const sh = P.persons.filter((q) => q.village === V.q && q.role === 'shepherd');
    const withPasture = V.folds.map((fd, i) => [fd, i]).filter(([fd]) => fd.pasture >= 0);
    sh.forEach((per, k) => { per.flock = withPasture[k] ? withPasture[k][1] : -1; });
    const owner = sh[0] || P.persons.find((q) => q.village === V.q && q.role === 'householder') || P.persons.find((q) => q.village === V.q);
    V.dogOwner = V.folds.length && owner ? owner.id : -1;
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
  else if (role === 'shepherd') { hatK = h(6) < 0.5 ? HATK.HAT : HATK.HOOD; tool = TOOL.STAFF; }
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
