// The world check's people, animals and wild ground detail
// (tools/world-check.mjs).
import { SCALE } from '../../src/world/scale.js';
import { groundAt } from '../../src/world/objects.js';
import { Player } from '../../src/app/player.js';
import { bodyBlocked } from '../../src/world/kit.js';
import { buildPeople, planOf, stateAt, alongOf, litGroups, segmentAt, routeOf } from '../../src/world/people/people.js';
import { adjust } from '../../src/world/people/meet.js';
import { FS, S as PS, POSE } from '../../src/world/people/figure.js';
import { buildAnimals } from '../../src/world/animals/build.js';
import { animalsAt } from '../../src/world/animals/state.js';
import { settle } from '../../src/world/animals/meet.js';
import { AS, A as AI, APOSE, KIND as AK, SPEC, KIND_NAMES } from '../../src/world/animals/kinds.js';
import { makeMove } from './check-places.mjs';

// ---- 11. People (phase 4a) ------------------------------------------------
// Every person has a home with a door that can be reached and a plan for
// each of ten days running; every route in those plans can be walked by the
// player's rules (walked again here, point to point); sampled every ten
// game minutes over three days, nobody is inside a wall, a fence or any
// closed shape, in water deeper than a ford, off a bridge's or a jetty's
// deck where they stand on one, or on the same spot as anyone else; the
// wall walk and the gate have a guard at every hour; a house's windows are
// lit only when someone inside is awake; the same seed, day and hour give
// the same positions and poses, byte for byte, from a fresh start.
export function peopleChecks(w) {
  const t0 = performance.now();
  const P = buildPeople(w), n = P.persons.length, out = { persons: n, roles: {} };
  for (const per of P.persons) out.roles[per.role] = (out.roles[per.role] || 0) + 1;
  const p = new Player(w, { rules: 'world' }), move = makeMove(w, p), STEP = 0.6, HEAD = 1.8, R = 0.3;
  // homes and their doors
  const homeFails = [];
  for (const per of P.persons) {
    if (per.village === undefined) continue;
    const H = P.villages[per.village].houses[per.home], st = P.places[H.step];
    const ok = routeTo(P, H.step);
    if (!ok) homeFails.push(`${per.name}'s door at ${Math.round(st.x)},${Math.round(st.z)}`);
  }
  out.homes = { fails: homeFails };
  // ten days of plans, every route walked again
  const DAYS = 10, routes = new Set(), routeFails = [];
  let segs = 0;
  for (let d = 0; d < DAYS; d++) for (let i = 0; i < n; i++) {
    const plan = planOf(P, i, d);
    if (!plan || !plan.length || plan[0].t0 !== 0 || plan[plan.length - 1].t1 !== 24) routeFails.push(`${P.persons[i].name} day ${d}: no whole plan`);
    for (const sg of plan) {
      segs++;
      if (sg.kind !== 'walk') continue;
      if (!sg.route) { routeFails.push(`${P.persons[i].name} day ${d}: a route that cannot be walked`); continue; }
      routes.add(sg.route);
    }
  }
  let walked = 0;
  for (const R2 of routes) {
    walked++;
    // through a closed door the last steps go in at its sill: those are not walked
    let x = R2.x[0], z = R2.z[0], ft = R2.y[0], bad = -1;
    for (let k = 1; k < R2.n; k++) {
      const L = Math.hypot(R2.x[k] - x, R2.z[k] - z);
      if (L < 1e-6) continue;
      const r = move(x, z, ft, (R2.x[k] - x) / L, (R2.z[k] - z) / L, L);
      if (!r) { if (k >= R2.n - 3 || k <= 3) { x = R2.x[k]; z = R2.z[k]; ft = R2.y[k]; continue; } bad = k; break; }
      [x, z, ft] = r;
    }
    if (bad >= 0) routeFails.push(`a route stops at ${R2.x[bad].toFixed(1)},${R2.z[bad].toFixed(1)}`);
  }
  out.plans = { days: DAYS, segments: segs, routes: walked, fails: routeFails };
  // three days, every ten minutes
  const st = new Float32Array(n * FS), segsAt = new Array(n), along = new Float64Array(n), lit = new Uint8Array(200);
  const bad = { inside: 0, water: 0, deck: 0, same: 0, guardGate: 0, guardWall: 0, lit: 0 }, ex = [];
  const surface = { ground: w.terrain.levels[0].H, N: w.N, NN: w.NN };
  const decks = [];
  for (const b of w.sites.bridges || []) decks.push({ x: b.x, z: b.z, a: b.a, hl: b.len / 2, hw: SCALE.kit.bridge.half, y: b.y });
  for (const v of w.sites.villages) if (v.plan && v.plan.jetty) { const j = v.plan.jetty, L = Math.hypot(j.b[0] - j.a[0], j.b[1] - j.a[1]); decks.push({ x: (j.a[0] + j.b[0]) / 2, z: (j.a[1] + j.b[1]) / 2, a: Math.atan2(j.b[1] - j.a[1], j.b[0] - j.a[0]), hl: L / 2, hw: SCALE.kit.jetty.width, y: j.y }); }
  const onDeck = (x, z) => decks.find((D) => { const ox = x - D.x, oz = z - D.z, u = ox * Math.cos(D.a) + oz * Math.sin(D.a), v2 = -ox * Math.sin(D.a) + oz * Math.cos(D.a); return Math.abs(u) < D.hl - 0.6 && Math.abs(v2) < D.hw - 0.2; });
  let samples = 0;
  for (let d = 0; d < 3; d++) for (let m = 0; m < 24 * 6; m++) {
    const hour = m / 6;
    for (let i = 0; i < n; i++) { const sg = stateAt(P, i, d, hour, st, i * FS); segsAt[i] = sg; along[i] = alongOf(P, i, sg, hour); }
    adjust(st, n, segsAt, along, null, P.p);
    let gate = 0, wall = 0;
    for (let i = 0; i < n; i++) {
      const o = i * FS, pose = st[o + PS.POSE], x = st[o + PS.X], z = st[o + PS.Z], ft = st[o + PS.FEET];
      const per = P.persons[i];
      if (per.role === 'guard' && segsAt[i].kind === 'stay') { const k = P.places[segsAt[i].at].kind; if (k === 'post') gate++; if (k === 'walk') wall++; }
      if (pose === POSE.HIDDEN) continue;
      samples++;
      // (sitting on a seat or lying on a bed, the body is on the shape: not inside it)
      if (pose !== POSE.SIT && pose !== POSE.SLEEP && bodyBlocked(w.kit, x, z, ft + STEP + 0.02, ft + HEAD - 0.02, R * 0.85)) { bad.inside++; if (ex.length < 6) ex.push(`${per.name} inside at ${x.toFixed(1)},${z.toFixed(1)} day ${d} ${hour.toFixed(2)} (${segsAt[i].kind} ${segsAt[i].act})`); }
      const dk = onDeck(x, z);
      if (dk && Math.abs(ft - dk.y) > 0.35 && pose !== POSE.SIT) { bad.deck++; if (ex.length < 6) ex.push(`${per.name} off the deck at ${x.toFixed(1)},${z.toFixed(1)} feet ${ft.toFixed(2)} deck ${dk.y.toFixed(2)}`); }
      const water = groundAt(surface, x, z) - groundAt(w.terrain, x, z);
      if (!dk && water > SCALE.river.ford + 0.05 && ft < groundAt(surface, x, z) - 0.1) { bad.water++; if (ex.length < 6) ex.push(`${per.name} in ${water.toFixed(2)} m of water at ${x.toFixed(1)},${z.toFixed(1)}`); }
      for (let j = i + 1; j < n; j++) {
        const oj = j * FS;
        if (st[oj + PS.POSE] === POSE.HIDDEN || Math.abs(st[oj + PS.FEET] - ft) > 1.2) continue;
        if (Math.hypot(st[oj + PS.X] - x, st[oj + PS.Z] - z) < 0.5) { bad.same++; if (ex.length < 6) ex.push(`${per.name} and ${P.persons[j].name} on one spot at ${x.toFixed(1)},${z.toFixed(1)} day ${d} ${hour.toFixed(2)}`); }
      }
    }
    if (m % 6 === 0 && P.fort) { if (!gate) bad.guardGate++; if (!wall) bad.guardWall++; }
    // the windows: lit only with someone awake inside (and after dark, lit then)
    litGroups(P, d, hour, lit);
    for (const V of P.villages) for (const H of V.houses) {
      const res = P.persons.filter((q) => q.village === V.q && q.home === H.k);
      const awake = res.some((q) => { const sg = segmentAt(planOf(P, q.id, d), hour); return sg.kind === 'stay' && sg.pose !== POSE.SLEEP && !sg.act.startsWith('asleep') && ['closed', 'sit', 'in', 'hearth'].includes(P.places[sg.at].kind); });
      const dark = hour >= 16.5 || hour < 9;
      if ((lit[H.group] & 1) && !awake) bad.lit++;
      if (!(lit[H.group] & 1) && awake && dark) bad.lit++;
    }
  }
  out.samples = { samples, ...bad, examples: ex };
  // the same again from a fresh start
  const P2 = buildPeople(w), sta = new Float32Array(n * FS), stb = new Float32Array(n * FS);
  let differ = 0;
  for (const [d, h] of [[0, 6.5], [1, 12.25], [2, 19.9], [4, 23.5]]) {
    for (let i = 0; i < n; i++) { stateAt(P, i, d, h, sta, i * FS); stateAt(P2, i, d, h, stb, i * FS); }
    for (let k = 0; k < sta.length; k++) if (sta[k] !== stb[k] && !(Number.isNaN(sta[k]) && Number.isNaN(stb[k]))) differ++;
  }
  out.same = differ === 0;
  out.ms = Math.round(performance.now() - t0);
  out.bad = P.bad.length;
  out.ok = !homeFails.length && !routeFails.length && !bad.inside && !bad.water && !bad.deck && !bad.same && !bad.guardGate && !bad.guardWall && !bad.lit && out.same && !P.bad.length;
  return out;
}
// (phase 4b) the animals' checks (12)
export function animalChecks(w) {
  const t0 = performance.now();
  const P = buildPeople(w), A = buildAnimals(w, P), out = { counts: {}, groups: A.groups.length };
  for (let k = 0; k < KIND_NAMES.length; k++) out.counts[KIND_NAMES[k]] = A.count[k] || 0;
  const T = w.terrain, NN = w.NN;
  const surface = { ground: T.levels[0].H, N: w.N, NN };
  // presence
  const missing = [];
  for (const V of P.villages) {
    const gs = A.groups.filter((g) => g.village === V.q);
    const flocks = gs.filter((g) => g.type === 'flock');
    if (!flocks.length) missing.push(`village ${V.q + 1}: no flock`);
    if (V.folds.length < flocks.length || !V.folds.length) missing.push(`village ${V.q + 1}: a flock without a fold`);
    if (!P.persons.some((q) => q.village === V.q && q.role === 'shepherd')) missing.push(`village ${V.q + 1}: no shepherd`);
    if (!gs.some((g) => g.type === 'hens')) missing.push(`village ${V.q + 1}: no hens`);
    if (!gs.some((g) => g.type === 'dog')) missing.push(`village ${V.q + 1}: no dog`);
    for (const f of flocks) if (f.members.length < 8 || f.members.length > 20) missing.push(`village ${V.q + 1}: a flock of ${f.members.length}`);
  }
  for (const t of ['deer', 'hare', 'ducks', 'gulls', 'crow', 'finches', 'kites']) if (!A.groups.some((g) => g.type === t)) missing.push(`no ${t}`);
  out.missing = missing;
  // where each may be
  const inRect = (R, x, z, m) => { const ox = x - R.x, oz = z - R.z, ca = Math.cos(R.a), sa = Math.sin(R.a); return Math.abs(ox * ca + oz * sa) <= R.hw + m && Math.abs(-ox * sa + oz * ca) <= R.hd + m; };
  const inPas = (PA, x, z, m) => { const ox = x - PA.x, oz = z - PA.z; return Math.abs(ox * PA.ca + oz * PA.sa) <= PA.L + m && Math.abs(-ox * PA.sa + oz * PA.ca) <= PA.W + m; };
  const nearLine = (R, x, z, m) => { if (!R) return false; for (let k = 0; k < R.n - 1; k++) { const ax = R.x[k], az = R.z[k], bx = R.x[k + 1], bz = R.z[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); if (Math.hypot(ax + dx * f - x, az + dz * f - z) <= m) return true; } return false; };
  const wet = (x, z) => T.wWater[Math.round(z) * NN + Math.round(x)] > 127;
  const habitat = (g, o, st, day) => {
    const x = st[o + AI.X], z = st[o + AI.Z], y = st[o + AI.Y], pose = st[o + AI.POSE];
    switch (g.type) {
      case 'flock': {
        if (inRect(g.F, x, z, 0.3) || inPas(g.PA, x, z, 0.3)) return true;
        const plan = planOf(P, g.shepherd, day);
        return plan.some((sg) => sg.lead && nearLine(sg.route, x, z, 4)) || Math.hypot(x - g.F.x, z - g.F.z) < 8;
      }
      case 'herd': return inPas(g.PA, x, z, 0.3);
      case 'hens': return Math.hypot(x - g.door[0], z - g.door[1]) < 14;
      case 'dog': return true;
      case 'deer': return Object.values(g.ways).some((R) => nearLine(R, x, z, 8)) || Math.hypot(x - g.bed[0], z - g.bed[1]) < 8;
      case 'hare': return g.spots.some((p) => Math.hypot(p[0] - x, p[1] - z) < 3);
      case 'ducks': return pose === APOSE.SWIM ? wet(x, z) : Math.hypot(x - g.bank[0], z - g.bank[1]) < 4 || wet(x, z);
      case 'gulls': return pose === APOSE.FLY ? y > groundAt(surface, x, z) + 1 : g.perches.some((p) => Math.hypot(p[0] - x, p[1] - z) < 1.5);
      case 'crow': return pose === APOSE.FLY ? Math.hypot(x - g.perch.x, z - g.perch.z) < SCALE.animals.crowCircle + 2 : Math.hypot(x - g.perch.x, z - g.perch.z) < 0.5;
      case 'finches': return pose === APOSE.FLY ? y > groundAt(T, x, z) + 2 : g.copses.some((c) => Math.hypot(c[0] - x, c[1] - z) < 9);
      case 'kites': return y > groundAt(T, x, z) + 40;
    }
    return true;
  };
  const n0 = A.members.length, st = new Float32Array(n0 * AS), ids = new Int32Array(n0);
  const bad = { inside: 0, overlap: 0, water: 0, outside: 0, unfolded: 0, nan: 0 }, ex = [];
  let samples = 0, nightChecks = 0;
  const note = (s2) => { if (ex.length < 8) ex.push(s2); };
  for (let d = 0; d < 3; d++) for (let m = 0; m < 24 * 6; m++) {
    const hour = m / 6;
    const n = animalsAt(A, d, hour, [], st, ids);
    const left = settle(st, n, [], P.p);
    bad.overlap += left;
    if (left) note(`${left} pairs too close on day ${d} at ${hour.toFixed(2)}`);
    for (let i = 0; i < n; i++) {
      const o = i * AS, mb = A.members[ids[i]], g = A.groups[mb.group], pose = st[o + AI.POSE], kind = mb.kind;
      if (pose === APOSE.HIDDEN) continue;
      samples++;
      const x = st[o + AI.X], z = st[o + AI.Z], y = st[o + AI.Y];
      if (![x, z, y, st[o + AI.YAW]].every(Number.isFinite)) { bad.nan++; note(`${KIND_NAMES[kind]} ${ids[i]} not a number`); continue; }
      const sp = SPEC[kind], sc = st[o + AI.SCALE] || 1, fly = pose === APOSE.FLY, perch = pose === APOSE.PERCH;
      // inside something (a bird in the air or perched: its body only)
      const lo = fly ? y - 0.05 : y + (perch ? 0.1 : 0.12), hi = fly ? y + 0.05 : y + Math.max(0.15, sp.back * sc * (pose === APOSE.LIE ? 0.5 : 0.9));
      const r = fly || perch ? 0.08 : sp.r * sc * 0.6, h = fly || perch ? 0 : Math.max(0, sp.len * sc / 2 - sp.r * sc * 0.8);
      const fx = Math.sin(st[o + AI.YAW]) * h, fz = Math.cos(st[o + AI.YAW]) * h;
      if (pose !== APOSE.SWIM && (bodyBlocked(w.kit, x, z, lo, hi, r) || (h > 0 && (bodyBlocked(w.kit, x + fx, z + fz, lo, hi, r) || bodyBlocked(w.kit, x - fx, z - fz, lo, hi, r))))) { bad.inside++; note(`${KIND_NAMES[kind]} ${ids[i]} (${g.type}) inside a shape at ${x.toFixed(1)},${z.toFixed(1)},${y.toFixed(1)} day ${d} ${hour.toFixed(2)} pose ${pose}`); }
      // in water
      if (!fly && !perch && kind !== AK.DUCK) {
        const depth = groundAt(surface, x, z) - groundAt(T, x, z);
        if (wet(x, z) && depth > 0.15 && y < groundAt(surface, x, z) - 0.05) { bad.water++; note(`${KIND_NAMES[kind]} ${ids[i]} in ${depth.toFixed(2)} m of water at ${x.toFixed(1)},${z.toFixed(1)} day ${d} ${hour.toFixed(2)} pose ${pose}`); }
      }
      if (!habitat(g, o, st, d)) { bad.outside++; note(`${KIND_NAMES[kind]} ${ids[i]} (${g.type}) out of its place at ${x.toFixed(1)},${z.toFixed(1)} day ${d} ${hour.toFixed(2)} pose ${pose}`); }
      if (g.type === 'flock' && (hour >= 21.5 || hour < 5)) { nightChecks++; if (!inRect(g.F, x, z, 0.05)) { bad.unfolded++; note(`a sheep of flock ${g.id} out of its fold at night, ${x.toFixed(1)},${z.toFixed(1)} day ${d} ${hour.toFixed(2)}`); } }
    }
  }
  out.samples = { samples, nightChecks, ...bad, examples: ex };
  // a walker coming up to each deer group, hare and crow
  const walk = { groups: 0, ok: 0, fails: [] };
  for (const g of A.groups) {
    if (!['deer', 'hare', 'crow'].includes(g.type)) continue;
    // a time it is at rest (a deer grazing the edge at dawn; a hare in its
    // form; a crow on its perch)
    let hour = g.type === 'deer' ? 6.5 : 11;
    const n0g = g.members.length, base = new Float32Array(n0g * AS), cur = new Float32Array(n0g * AS), id2 = new Int32Array(n0g);
    if (g.type === 'crow') for (let k = 0; k < 40; k++) { animalsAt(A, 0, hour, [], base, id2, [g]); if (base[AI.POSE] === APOSE.PERCH) break; hour += 0.05; }
    animalsAt(A, 0, hour, [], base, id2, [g]);
    let cx = 0, cz = 0;
    for (let k = 0; k < n0g; k++) { cx += base[k * AS + AI.X]; cz += base[k * AS + AI.Z]; }
    cx /= n0g; cz /= n0g;
    walk.groups++;
    // from 90 m out, on open ground
    let dir = null;
    for (let k = 0; k < 16 && !dir; k++) {
      const b = k * Math.PI / 8, x = cx + Math.sin(b) * 90, z = cz + Math.cos(b) * 90;
      if (x > 2 && z > 2 && x < w.N - 2 && z < w.N - 2 && !wet(x, z)) dir = b;
    }
    if (dir === null) { walk.fails.push(`${g.type} ${g.id}: no open approach`); continue; }
    let alertAt = -1, fleeAt = -1, maxMove = 0;
    for (let dd = 90; dd >= 3; dd -= 0.5) {
      const wx = cx + Math.sin(dir) * dd, wz = cz + Math.cos(dir) * dd;
      animalsAt(A, 0, hour, [wx, wz, groundAt(T, wx, wz)], cur, id2, [g]);
      let al = 0, mv = 0;
      for (let k = 0; k < n0g; k++) {
        const o = k * AS;
        al = Math.max(al, cur[o + AI.ALERT], cur[o + AI.HEAD] > 0.5 && base[o + AI.HEAD] <= 0.5 ? 1 : 0);
        mv = Math.max(mv, Math.hypot(cur[o + AI.X] - base[o + AI.X], cur[o + AI.Z] - base[o + AI.Z], cur[o + AI.Y] - base[o + AI.Y]));
      }
      if (alertAt < 0 && al >= 0.5) alertAt = dd;
      if (fleeAt < 0 && mv > 0.5) fleeAt = dd;
      maxMove = Math.max(maxMove, mv);
    }
    // gone again: all back where they were
    animalsAt(A, 0, hour, [cx + 400, cz + 400, 0], cur, id2, [g]);
    let back = true;
    for (let k = 0; k < cur.length; k++) if (Math.abs(cur[k] - base[k]) > 1e-4) back = false;
    const need = g.type === 'deer' ? 8 : g.type === 'hare' ? 5 : 3;
    const ok = alertAt > 0 && fleeAt > 0 && alertAt > fleeAt + 2 && maxMove >= need && back;
    if (ok) walk.ok++; else walk.fails.push(`${g.type} ${g.id}: alert at ${alertAt} m, moves at ${fleeAt} m, at most ${maxMove.toFixed(1)} m, back ${back ? 'yes' : 'NO'}`);
    if (!walk.first) walk.first = {};
    if (!walk.first[g.type]) walk.first[g.type] = { alertAt, fleeAt, moved: +maxMove.toFixed(1) };
  }
  out.walker = walk;
  // the same from a fresh start
  const A2 = buildAnimals(w, buildPeople(w)), sa = new Float32Array(n0 * AS), sb = new Float32Array(n0 * AS), ia = new Int32Array(n0), ib = new Int32Array(n0);
  let differ = 0;
  for (const [d, h] of [[0, 6.5], [1, 12.25], [2, 19.9], [4, 23.5]]) {
    const na = animalsAt(A, d, h, [], sa, ia), nb = animalsAt(A2, d, h, [], sb, ib);
    settle(sa, na, [], P.p); settle(sb, nb, [], A2.P.p);
    if (na !== nb) differ++;
    for (let k = 0; k < na * AS; k++) if (sa[k] !== sb[k]) differ++;
  }
  out.same = differ === 0;
  out.ms = Math.round(performance.now() - t0);
  out.ok = !missing.length && !bad.inside && !bad.overlap && !bad.water && !bad.outside && !bad.unfolded && !bad.nan && walk.ok === walk.groups && out.same;
  return out;
}

// (phase 4b) the wild ground detail's checks (13)
export function wildChecks(w) {
  const pieces = ((w.kitDesc && w.kitDesc.pieces) || []).filter((p) => ['boulder', 'outcrop', 'log', 'stump', 'reeds'].includes(p.kind));
  const T = w.terrain, NN = w.NN, out = { counts: {}, fails: [] };
  for (const p of pieces) out.counts[p.kind] = (out.counts[p.kind] || 0) + 1;
  // the places to keep clear: doors, the fort's gate, bridges' and jetties' ends
  const P = buildPeople(w), keep = [];
  for (const pl of P.places) if (pl.kind === 'door' || pl.kind === 'gate' || pl.kind === 'jettyfoot' || pl.kind === 'foldgate' || pl.kind === 'pastgate') keep.push([pl.x, pl.z, pl.kind]);
  for (const b of w.sites.bridges || []) { const ca = Math.cos(b.a), sa = Math.sin(b.a), h = b.len / 2; keep.push([b.x + ca * h, b.z + sa * h, 'bridge'], [b.x - ca * h, b.z - sa * h, 'bridge']); }
  for (const v of w.sites.villages) if (v.plan && v.plan.jetty) keep.push([v.plan.jetty.a[0], v.plan.jetty.a[1], 'jetty']);
  const paths = T.wPath || null;
  for (const p of pieces) {
    const [x, z] = p.at, r = p.kind === 'log' ? p.len / 2 + p.r : p.r * (p.kind === 'outcrop' ? 2.2 : 1.3);
    // on a road or a footpath: any cell under it
    let road = 0;
    for (let k = Math.floor(z - r); k <= Math.ceil(z + r); k++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (Math.hypot(i - x, k - z) > r || i < 0 || k < 0 || i > w.N || k > w.N) continue;
      const j = k * NN + i;
      if (T.wRoad[j] > 90 || (paths && paths[j] > 90)) road++;
    }
    if (road && p.kind !== 'reeds') out.fails.push(`${p.kind} on a road or path at ${x.toFixed(1)},${z.toFixed(1)}`);
    for (const [kx, kz, what] of keep) if (Math.hypot(kx - x, kz - z) < r + 1.5) out.fails.push(`${p.kind} at ${x.toFixed(1)},${z.toFixed(1)} by a ${what}`);
  }
  out.ok = !out.fails.length;
  return out;
}
// 14. (phase 5a) Wayfaring.

export function routeTo(P, place) {
  // (a home's door can be reached: a route from it to the village's first well, or any other place)
  const other = P.places.find((q) => q.id !== place && q.via < 0);
  return !!(other && planRoute(P, place, other.id));
}
export function planRoute(P, a, b) { try { return routeOf(P, a, b); } catch { return null; } }
