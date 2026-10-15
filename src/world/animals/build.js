// Who the animals are and where they belong (phase 4b), from the world's
// data and the people's (src/world/people/people.js, whose places, routes
// and move rule they share). Built once, the same on every thread.
//
// - farm animals belong to places: a flock to each fold and its pasture
//   (led by its shepherd), cattle to their field, hens to a house, a dog to
//   a person;
// - wild animals to habitats: deer to a forest's edge (a bed and a day spot
//   inside, a grazing spot outside), hares to the open meadow, ducks to
//   shallow, slow water and its bank;
// - birds to the air and to perches: gulls to the coast and the jetties,
//   crows to the fort's battlements and the village roofs (from the kit's
//   shapes), small birds to the copses, a pair of large birds to the high
//   ground.
import { KIND } from './kinds.js';
import { MAT } from '../../contract.js';
import { hash2 } from '../noise.js';
import { groundAt } from '../objects.js';
import { KIND as WK } from '../gen/water.js';
import { SCALE } from '../scale.js';
import { P as KP, P_STRIDE, PF, supportAt as kitSupport, bodyBlocked } from '../kit.js';
import { sampleRoute, clearLine } from '../people/walk.js';

const TAU = Math.PI * 2;
const C = SCALE.animals;

export function buildAnimals(world, P) {
  const seed = world.seed >>> 0, N = world.N, NN = N + 1, T = world.terrain;
  const r = (a, b, k) => hash2(a, b, seed + 5300 + k);
  const G = (x, z) => groundAt(T, x, z);
  const water = (x, z) => { const i = Math.round(x), k = Math.round(z); return i < 1 || k < 1 || i > N - 1 || k > N - 1 || T.wWater[k * NN + i] > 127; };
  const surf = (x, z) => groundAt({ ground: T.levels[0].H, N, NN }, x, z);
  // (what water: the sea at its level, else a lake's or a river's)
  const waterKind = (x, z) => (!water(x, z) ? WK.NONE : surf(x, z) <= SCALE.sea + 0.2 ? WK.SEA : WK.LAKE);
  // how wooded: the trunks within 9 m (the forest field is not kept)
  const TB = 8, tn = Math.ceil((N + 1) / TB), tcell = Array.from({ length: tn * tn }, () => []);
  for (const t of world.objects.trees) { const a = Math.min(tn - 1, Math.floor(t.x / TB)), b = Math.min(tn - 1, Math.floor(t.z / TB)); tcell[b * tn + a].push(t); }
  const trunks = (x, z, d) => {
    let n = 0;
    for (let b = Math.max(0, Math.floor((z - d) / TB)); b <= Math.min(tn - 1, Math.floor((z + d) / TB)); b++) for (let a = Math.max(0, Math.floor((x - d) / TB)); a <= Math.min(tn - 1, Math.floor((x + d) / TB)); a++) for (const t of tcell[b * tn + a]) if (Math.hypot(t.x - x, t.z - z) < d) n++;
    return n;
  };
  const p = P.p, move = P.move;
  const feetAt = (x, z) => p.supportAt(x, z, G(x, z) + 0.3);
  const free = (x, z) => !water(x, z) && !p.blocked(x, z, feetAt(x, z));
  const A = { world, P, seed, members: [], groups: [] };
  const add = (g, kind, n, coat) => {
    g.members = [];
    for (let k = 0; k < n; k++) {
      const id = A.members.length, h = (q) => r(id, q, 11);
      const [m1, m2] = coat(k, h);
      A.members.push({ id, kind, group: A.groups.length, rank: k, scale: 0.9 + 0.2 * h(1), m1, m2 });
      g.members.push(id);
    }
    g.id = A.groups.length; g.kind = kind;
    A.groups.push(g);
    return g;
  };
  // a line from a to b by the walking rules (round what is in the way), or null
  const way = (a, b) => {
    const line = sampleRoute(move, [a, b], feetAt(a[0], a[1]));
    if (!line) return null;
    const cum = new Float64Array(line.n);
    for (let i = 1; i < line.n; i++) cum[i] = cum[i - 1] + Math.hypot(line.x[i] - line.x[i - 1], line.z[i] - line.z[i - 1]);
    line.cum = cum; line.len = cum[line.n - 1];
    return line;
  };
  const forest = (x, z) => trunks(x, z, 9) / 5 - 0.5;
  const roadNear = (x, z, d) => { const j = Math.round(z) * NN + Math.round(x); return T.wRoad[j] > 0 || (T.wPath && T.wPath[j] > 0) || (T.wField && T.wField[j] > 0); };

  // ---- farm animals ------------------------------------------------------------------
  for (const V of P.villages) {
    // a flock to each fold that has a pasture and a shepherd
    for (const per of P.persons) {
      if (per.village !== V.q || per.role !== 'shepherd' || per.flock < 0) continue;
      const F = V.folds[per.flock], PA = V.pastures[F.pasture];
      const n = Math.min(F.slots.length, C.flock[0] + Math.floor(r(V.q, per.flock, 1) * (C.flock[1] - C.flock[0] + 1)));
      const gi = P.places[F.inside], go = P.places[F.gate];
      const exit = way([gi.ax, gi.az], [go.ax, go.az]);
      add({ type: 'flock', village: V.q, fold: per.flock, F, PA, shepherd: per.id, exit, home: [F.x, F.z] }, KIND.SHEEP, n,
        (k, h) => [h(2) < 0.08 ? MAT.CHARCOAL : MAT.WOOL, h(3) < 0.25 ? MAT.LINEN : MAT.CHARCOAL]);
    }
    // cattle in their field
    for (const PA of V.pastures) {
      if (PA.kind !== 'cattle') continue;
      const n = C.herd[0] + Math.floor(r(V.q, 7, 2) * (C.herd[1] - C.herd[0] + 1));
      add({ type: 'herd', village: V.q, PA, home: [PA.x, PA.z] }, KIND.COW, n, (k, h) => [h(2) < 0.4 ? MAT.HIDE : h(2) < 0.7 ? MAT.LINEN : MAT.CHARCOAL, MAT.CHARCOAL]);
    }
    // hens before a house with open ground at its door (not on the lane)
    if (V.folds.length) {
      const houses = V.houses.slice().sort((a, b) => r(V.q, a.k, 3) - r(V.q, b.k, 3));
      for (const H of houses) {
        const st = P.places[H.step];
        const out = [st.x + Math.sin(st.yaw) * 2.5, st.z + Math.cos(st.yaw) * 2.5];
        const spots = [];
        for (let k = 0; k < 10 && spots.length < 6; k++) {
          const a = k * TAU / 10, x = out[0] + Math.cos(a) * 2.2, z = out[1] + Math.sin(a) * 2.2;
          if (free(x, z) && !roadNear(x, z) && clearLine(move, [st.ax, st.az], [x, z], st.ft)) spots.push([x, z]);
        }
        if (spots.length < 4) continue;
        const n = C.hens[0] + Math.floor(r(V.q, H.k, 4) * (C.hens[1] - C.hens[0] + 1));
        add({ type: 'hens', village: V.q, H, door: [st.ax, st.az], spots, home: out }, KIND.HEN, n, (k, h) => [h(2) < 0.5 ? MAT.RUSSET : h(2) < 0.8 ? MAT.LINEN : MAT.CHARCOAL, MAT.OCHRE]);
        break;
      }
    }
    // a dog, following its person
    if (V.dogOwner >= 0) {
      const owner = P.persons[V.dogOwner];
      add({ type: 'dog', village: V.q, owner: owner.id, H: V.houses[owner.home], home: [V.centre.x, V.centre.z] }, KIND.DOG, 1, (k, h) => [[MAT.UMBER, MAT.CHARCOAL, MAT.OCHRE][Math.floor(h(2) * 3)], h(3) < 0.5 ? MAT.LINEN : MAT.CHARCOAL]);
    }
  }
  if (!A.groups.some((g) => g.type === 'flock')) return finish(A);

  // ---- wild animals -------------------------------------------------------------------
  const villagesAt = world.sites.villages.map((v) => [v.plan ? v.plan.centre.x : v.x, v.plan ? v.plan.centre.z : v.z]);
  const awayFromVillages = (x, z, d) => villagesAt.every(([vx, vz]) => Math.hypot(vx - x, vz - z) > d);
  const spread = (list, d) => { const out = []; for (const c of list) if (out.every((o) => Math.hypot(o[0] - c[0], o[1] - c[1]) > d)) out.push(c); return out; };
  // deer at forest edges: a grazing spot outside, a day spot and a bed inside
  {
    const cands = [];
    const g = C.deerGrid;
    for (let gz = 2; gz * g < N - 2; gz++) for (let gx = 2; gx * g < N - 2; gx++) {
      const x = (gx + r(gx, gz, 21)) * g, z = (gz + r(gx, gz, 22)) * g, f = forest(x, z);
      if (f < -0.25 || f > 0.15 || !awayFromVillages(x, z, 160)) continue;
      cands.push([x, z, r(gx, gz, 23)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of spread(cands, C.deerApart)) {
      if (A.groups.filter((q) => q.type === 'deer').length >= C.deer[1]) break;
      // the way out of the forest (down its field) and in
      const e = 3, fx = forest(x + e, z) - forest(x - e, z), fz = forest(x, z + e) - forest(x, z - e), fl = Math.hypot(fx, fz);
      if (fl < 1e-4) continue;
      const ix = fx / fl, iz = fz / fl;
      const edge = [x - ix * 11, z - iz * 11], day = [x + ix * 20, z + iz * 20], bed = [x + ix * 30 - iz * 8, z + iz * 30 + ix * 8];
      // (dry for 6 m round each: the group spreads round its spot)
      const dry = ([px, pz]) => { for (let k = 0; k < 16; k++) for (const d of [2, 4, 6]) if (water(px + Math.cos(k * TAU / 16) * d, pz + Math.sin(k * TAU / 16) * d)) return false; return true; };
      if (!free(...edge) || !free(...day) || !free(...bed) || roadNear(...edge) || trunks(...edge, 6) > 0 || forest(...day) < 0.3 || forest(...bed) < 0.3 || !dry(edge) || !dry(day) || !dry(bed)) continue;
      const ways = { bedEdge: way(bed, edge), edgeDay: way(edge, day), dayEdge: way(day, edge), edgeBed: way(edge, bed) };
      if (!ways.bedEdge || !ways.edgeDay || !ways.dayEdge || !ways.edgeBed) continue;
      // (and dry along their ways too, as wide as the group walks)
      if (Object.values(ways).some((R) => { for (let i = 0; i < R.n; i++) if (!dry([R.x[i], R.z[i]])) return true; return false; })) continue;
      const n = C.deerN[0] + Math.floor(r(Math.round(x), Math.round(z), 24) * (C.deerN[1] - C.deerN[0] + 1));
      add({ type: 'deer', edge, day, bed, ways, home: [x, z], into: [ix, iz] }, KIND.DEER, n, () => [MAT.FAWN, MAT.LINEN]);
    }
  }
  // hares on open meadow, far from villages and roads
  {
    const cands = [];
    const g = C.hareGrid;
    for (let gz = 2; gz * g < N - 2; gz++) for (let gx = 2; gx * g < N - 2; gx++) {
      const x = (gx + r(gx, gz, 31)) * g, z = (gz + r(gx, gz, 32)) * g;
      if (trunks(x, z, 18) > 0 || !free(x, z) || roadNear(x, z) || !awayFromVillages(x, z, 90)) continue;
      const j = Math.round(z) * NN + Math.round(x);
      if (T.wRock[j] > 30 || T.wSand[j] > 30 || T.wRoad[j] || Math.hypot(G(x + 2, z) - G(x - 2, z), G(x, z + 2) - G(x, z - 2)) / 4 > 0.3) continue;
      cands.push([x, z, r(gx, gz, 33)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z] of spread(cands, C.hareApart).slice(0, C.hares)) {
      const spots = [[x, z]];
      for (let k = 0; k < 8 && spots.length < 3; k++) { const a = r(Math.round(x), k, 34) * TAU, d = 6 + 8 * r(Math.round(z), k, 35), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (free(px, pz) && !roadNear(px, pz) && clearLine(move, [x, z], [px, pz], feetAt(x, z))) spots.push([px, pz]); }
      add({ type: 'hare', spots, home: [x, z] }, KIND.HARE, 1, () => [MAT.HARE, MAT.LINEN]);
    }
  }
  // ducks on shallow, slow water by a bank
  {
    const cands = [];
    const g = C.duckGrid;
    for (let gz = 2; gz * g < N - 2; gz++) for (let gx = 2; gx * g < N - 2; gx++) {
      const x = (gx + r(gx, gz, 41)) * g, z = (gz + r(gx, gz, 42)) * g;
      if (waterKind(x, z) !== WK.LAKE) continue;
      const depth = surf(x, z) - G(x, z);
      if (depth < 0.3) continue;
      // a bank within a few metres: dry, clear ground at the water's edge
      let bank = null;
      for (let a = 0; a < 16 && !bank; a++) for (let d = 3; d <= 9 && !bank; d += 1.5) {
        const bx = x + Math.cos(a * TAU / 16) * d, bz = z + Math.sin(a * TAU / 16) * d;
        if (!water(bx, bz) && free(bx, bz) && !roadNear(bx, bz) && water(bx - Math.cos(a * TAU / 16) * 1.2, bz - Math.sin(a * TAU / 16) * 1.2)) {
          // (water all the way out to it: the ducks swim there, not walk)
          let wetWay = true;
          for (let s2 = 0; s2 < d - 1.2 && wetWay; s2 += 0.5) if (!water(x + Math.cos(a * TAU / 16) * s2, z + Math.sin(a * TAU / 16) * s2)) wetWay = false;
          if (wetWay) bank = [bx, bz];
        }
      }
      if (!bank) continue;
      // room to paddle: water all round within the circle
      let ok = true;
      // (finely: their loop and their spread reach 3.3 m out)
      for (let a = 0; a < 24 && ok; a++) for (const rr of [1.2, 2.4, C.duckLoop + 0.4]) { const px = x + Math.cos(a * TAU / 24) * rr, pz = z + Math.sin(a * TAU / 24) * rr; if (!water(px, pz) || surf(px, pz) - G(px, pz) < 0.15) ok = false; }
      if (!ok) continue;
      cands.push([x, z, r(gx, gz, 43), bank, surf(x, z)]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z, , bank, level] of spread(cands, C.duckApart).slice(0, C.ducks)) {
      const n = 2 + (r(Math.round(x), Math.round(z), 44) < 0.5 ? 1 : 0);
      add({ type: 'ducks', at: [x, z], level, bank, home: [x, z] }, KIND.DUCK, n, (k) => [MAT.DUCK, k === 0 ? MAT.DUCKHEAD : MAT.DUCK]);
    }
  }

  // ---- birds --------------------------------------------------------------------------
  // gulls over the coast (the sea's sandy shore), standing on the beach
  {
    const cands = [];
    const g = C.gullGrid;
    for (let gz = 1; gz * g < N - 1; gz++) for (let gx = 1; gx * g < N - 1; gx++) {
      const x = (gx + r(gx, gz, 51)) * g, z = (gz + r(gx, gz, 52)) * g, j = Math.round(z) * NN + Math.round(x);
      if (water(x, z) || T.wSand[j] < 160 || G(x, z) > SCALE.sea + 3) continue;
      // the sea within 30 m
      let sea = null;
      for (let a = 0; a < 8 && !sea; a++) for (let d = 6; d <= 30 && !sea; d += 6) { const px = x + Math.cos(a * TAU / 8) * d, pz = z + Math.sin(a * TAU / 8) * d; if (waterKind(px, pz) === WK.SEA) sea = [px, pz]; }
      if (!sea || !free(x, z)) continue;
      cands.push([x, z, r(gx, gz, 53), sea]);
    }
    cands.sort((a, b) => a[2] - b[2]);
    for (const [x, z, , sea] of spread(cands, C.gullApart).slice(0, C.gullGroups)) {
      const perches = [[x, z, feetAt(x, z)]];
      for (let k = 0; k < 16 && perches.length < C.gulls[1]; k++) { const a = r(Math.round(x), k, 54) * TAU, d = 2 + 5 * r(Math.round(z), k, 55), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (free(px, pz) && T.wSand[Math.round(pz) * NN + Math.round(px)] > 120) perches.push([px, pz, feetAt(px, pz)]); }
      const n = C.gulls[0] + Math.floor(r(Math.round(x), Math.round(z), 56) * (C.gulls[1] - C.gulls[0] + 1));
      add({ type: 'gulls', centre: [sea[0] + (sea[0] - x) * 0.8, sea[1] + (sea[1] - z) * 0.8], perches, level: SCALE.sea, home: [x, z] }, KIND.GULL, n, () => [MAT.GULL, MAT.SLATE]);
    }
    // and on a shore village's jetty
    for (const v of world.sites.villages) {
      const j = v.plan && v.plan.jetty;
      if (!j) continue;
      const L = Math.hypot(j.b[0] - j.a[0], j.b[1] - j.a[1]), ux = (j.b[0] - j.a[0]) / L, uz = (j.b[1] - j.a[1]) / L;
      // (on the deck's middle line, at the deck's own top)
      const perches = [0.72, 0.84, 0.95].map((t) => { const px = j.a[0] + ux * L * t, pz = j.a[1] + uz * L * t; return [px, pz, world.kit ? kitSupport(world.kit, px, pz, j.y + 0.5) : j.y]; })
        .filter((q) => !world.kit || !bodyBlocked(world.kit, q[0], q[1], q[2] + 0.04, q[2] + 0.4, 0.12));
      if (!perches.length) continue;
      add({ type: 'gulls', centre: [j.b[0] + ux * 20, j.b[1] + uz * 20], perches, level: j.y - 0.6, home: [j.b[0], j.b[1]] }, KIND.GULL, 3, () => [MAT.GULL, MAT.SLATE]);
    }
  }
  // crows on the fort's merlons and on village roofs (from the kit's shapes)
  {
    const K = world.kit, S = K ? K.prims : null, perches = [];
    if (K) {
      const fort = world.sites.fort;
      for (let i = 0; i < K.np; i++) {
        const q = i * P_STRIDE;
        if (!(S[q + KP.FLAGS] & PF.CRENEL) || S[q + KP.TYPE] !== 1) continue;
        if (fort && Math.hypot(S[q + KP.CX] - fort.x, S[q + KP.CZ] - fort.z) > 200) continue;
        const per = S[q + KP.PER], mw = S[q + KP.MW], ph = S[q + KP.PH], hx = S[q + KP.HX];
        if (!(per > 0)) continue;
        // the middle of each merlon along its parapet
        for (let k = Math.ceil((-hx + ph) / per); (k + mw / 2) * per - ph < hx; k++) {
          const u = (k + mw / 2) * per - ph;
          if (u < -hx + 0.2 || u > hx - 0.2) continue;
          // (on the merlon's own top, as the shapes have it there)
          const px = S[q + KP.CX] + u * S[q + KP.CA], pz = S[q + KP.CZ] + u * S[q + KP.SA];
          perches.push({ x: px, z: pz, y: kitSupport(K, px, pz, 1e9), yaw: Math.atan2(-S[q + KP.SA], S[q + KP.CA]) + Math.PI / 2, at: 'fort' });
        }
      }
      // roof ridges: the highest of the kit along a house's middle line
      for (const v of world.sites.villages) for (const h of (v.plan ? v.plan.houses : [])) {
        const ca = Math.cos(h.a), sa = Math.sin(h.a);
        for (const t of [-0.45, 0.4]) {
          const x = h.x + ca * h.w * t, z = h.z + sa * h.w * t, y = kitSupport(K, x, z, 1e9);
          if (y > h.floor + 2) perches.push({ x, z, y, yaw: h.a + (t < 0 ? 0 : Math.PI), at: 'roof' });
        }
      }
    }
    const pick = (list, n, k0) => list.map((p2, i) => [r(i, k0, 61), p2]).sort((a, b) => a[0] - b[0]).slice(0, n).map((e) => e[1]);
    // (only where a crow's body is clear of everything: no chimney, no wall above)
    const clear = (q) => !bodyBlocked(K, q.x, q.z, q.y + 0.04, q.y + 0.45, 0.12);
    const fortP = perches.filter((q) => q.at === 'fort' && clear(q)), roofP = perches.filter((q) => q.at === 'roof' && clear(q));
    const chosen = [...spread2(pick(fortP, 40, 1), 6).slice(0, C.crowsFort), ...spread2(pick(roofP, 60, 2), 18).slice(0, C.crowsRoofs)];
    // (each circles 9 m up, or 2 m over the highest shape under its circle)
    const flyY = (pc) => {
      let top = pc.y + 9;
      for (let k = 0; k < 48; k++) for (const rr of [C.crowCircle * 0.35, C.crowCircle * 0.7, C.crowCircle, C.crowCircle + 1]) {
        const x = pc.x + Math.cos(k * TAU / 48) * rr, z = pc.z + Math.sin(k * TAU / 48) * rr;
        top = Math.max(top, kitSupport(K, x, z, 1e9) + 2, G(x, z) + 4);
      }
      return top;
    };
    for (const pc of chosen) add({ type: 'crow', perch: pc, fly: flyY(pc), home: [pc.x, pc.z] }, KIND.CROW, 1, () => [MAT.CROW, MAT.CROW]);
  }
  // small birds: flocks that fly copse to copse
  {
    // (only copses whose crowns are clear of every building shape: the birds
    // perch up to 5 m round the middle, 7 to 11 m up)
    const crownClear = ([x, z]) => {
      if (!world.kit) return true;
      const y = G(x, z) + 9;
      for (let k = 0; k < 9; k++) { const a = k * TAU / 8, d = k === 8 ? 0 : 5.5, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (bodyBlocked(world.kit, px, pz, y - 2.2, y + 2.2, 0.3)) return false; }
      return true;
    };
    const cps = (world.sites.copses || []).filter(crownClear);
    if (cps.length >= 2) {
      for (let f = 0; f < C.finchFlocks; f++) {
        const order = cps.map((c, i) => [r(f, i, 71), c]).sort((a, b) => a[0] - b[0]).map((e) => e[1]).slice(0, 5);
        const tops = order.map(([x, z]) => [x, z, G(x, z) + 9]);
        const n = C.finches[0] + Math.floor(r(f, 1, 72) * (C.finches[1] - C.finches[0] + 1));
        add({ type: 'finches', copses: tops, home: tops[0] }, KIND.FINCH, n, (k, h) => [h(2) < 0.5 ? MAT.UMBER : MAT.HARE, MAT.OCHRE]);
      }
    }
  }
  // a pair of large birds over the high ground
  {
    let best = null;
    for (let z = 120; z < N - 120; z += 32) for (let x = 120; x < N - 120; x += 32) { const y = G(x, z); if (!best || y > best[2]) best = [x, z, y]; }
    if (best) add({ type: 'kites', centre: [best[0], best[1]], ground: best[2], home: [best[0], best[1]] }, KIND.KITE, 2, () => [MAT.UMBER, MAT.CHARCOAL]);
  }
  return finish(A);
}

function spread2(list, d) { const out = []; for (const c of list) if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > d)) out.push(c); return out; }

// counts by kind, for the menu and the tools
function finish(A) {
  A.count = {};
  for (const m of A.members) A.count[m.kind] = (A.count[m.kind] || 0) + 1;
  return A;
}
