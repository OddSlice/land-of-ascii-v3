// The world check's wayfaring (tools/world-check.mjs): favours, places
// and the scripted player who knows only the words.
import { SCALE } from '../../src/world/scale.js';
import { groundAt } from '../../src/world/objects.js';
import { buildPeople, planOf, routeOf } from '../../src/world/people/people.js';
import { POSE } from '../../src/world/people/figure.js';
import { placesOf, sightLine } from '../../src/game/places.js';
import { buildFavours, favourWords, START_DAY, START_HOUR } from '../../src/game/favours.js';
import { playFavour } from './reader.mjs';

export function wayChecks(w) {
  const t0 = performance.now();
  const P = buildPeople(w), places = placesOf(w), fav = buildFavours(w, P, places), p = P.p;
  const out = { favours: fav.list.length, kinds: { carry: 0, find: 0, tell: 0 }, chains: fav.list.filter((f) => f.parent).length, fails: [], places: places.list.length };
  for (const f of fav.list) out.kinds[f.kind]++;
  const T = w.terrain, NN = w.NN;
  const fail = (m) => out.fails.push(m);
  // the first meeting
  const m = fav.meet;
  if (!m) fail('no first meeting');
  else {
    const rd = w.roads[0], dRoad = Math.min(...Array.from({ length: rd.n }, (_, i) => Math.hypot(rd.x[i] - m.spot.x, rd.z[i] - m.spot.z)));
    out.meet = { person: P.persons[m.person].name, role: P.persons[m.person].role, minutes: +((m.arrive - START_HOUR) * 60).toFixed(2), walk: Math.round(m.rin.len), back: Math.round(m.rout.len),
      fromRoad: +dRoad.toFixed(2), fromSpawn: +Math.hypot(m.spot.x - w.start.x, m.spot.z - w.start.z).toFixed(1), waits: +((m.leave - m.arrive) * 60).toFixed(0) };
    if (out.meet.minutes > 2) fail(`the first giver reaches the road ${out.meet.minutes} min after the start`);
    if (dRoad < 1.2 || dRoad > 2.6) fail(`the first giver stands ${dRoad.toFixed(2)} m from the road's middle`);
    if (out.meet.fromSpawn < 15) fail('the first giver stands on the spawn');
    // (their way out walked again by the move rule, and the spot clear)
    for (const R of [m.rin, m.rout]) {
      let x = R.x[0], z = R.z[0], ft = R.y[0];
      for (let k = 1; k < R.n; k++) {
        const L = Math.hypot(R.x[k] - x, R.z[k] - z);
        if (L < 1e-6) continue;
        const r = P.move(x, z, ft, (R.x[k] - x) / L, (R.z[k] - z) / L, L);
        if (!r) { if (k >= R.n - 3 || k <= 3) { x = R.x[k]; z = R.z[k]; ft = R.y[k]; continue; } fail(`the first giver's way stops at ${R.x[k].toFixed(1)},${R.z[k].toFixed(1)}`); break; }
        [x, z, ft] = r;
      }
    }
    if (p.blocked(m.spot.x, m.spot.z, m.spot.ft)) fail('the first giver stands inside something');
    if (!fav.first) fail('no first favour');
  }
  // every favour: the people, the thing, the ways
  const usual = fav.usual;
  const fromOf = (f) => (f.first ? m.spot.place : usual.get(f.giver).place);
  out.lens = [];
  for (const f of fav.list) {
    if (!P.persons[f.giver]) { fail(`${f.id}: no giver`); continue; }
    if (!f.first && !usual.get(f.giver)) fail(`${f.id}: the giver has no usual place`);
    const a = fromOf(f);
    if (f.dest !== undefined) {
      const du = usual.get(f.dest);
      if (!du) { fail(`${f.id}: the one it is for has no usual place`); continue; }
      const r = routeOf(P, a, du.place);
      if (!r) fail(`${f.id}: ${P.persons[f.dest].name} cannot be reached from the giver`);
      else out.lens.push(Math.round(r.len));
      if (f.kind === 'tell' && !routeOf(P, du.place, a)) fail(`${f.id}: no way back to the giver`);
    } else {
      const s2 = f.spot;
      const r = routeOf(P, a, s2.place), b = routeOf(P, s2.place, a);
      if (!r || !b) fail(`${f.id}: the lost thing cannot be reached`); else out.lens.push(Math.round(r.len));
      // (not in a shape, in water, or on a road or path)
      const ft = p.supportAt(s2.x, s2.z, groundAt(T, s2.x, s2.z) + 0.3), j = Math.round(s2.z) * NN + Math.round(s2.x);
      if (p.blocked(s2.x, s2.z, ft)) fail(`${f.id}: the lost thing is inside a shape`);
      if (T.wWater[j] > 20 || w.terrain.levels[0].H[j] - T.ground[j] > 0.05) fail(`${f.id}: the lost thing is in water`);
      if ((T.wRoad && T.wRoad[j] > 20) || (T.wPath && T.wPath[j] > 20)) fail(`${f.id}: the lost thing is on a road or path`);
    }
  }
  // everyone a favour is for, and every giver, met for two hours each day
  const DAYS = 28, least = [];
  const who = new Set([...fav.list.filter((f) => f.dest !== undefined).map((f) => f.dest), ...fav.list.filter((f) => !f.first).map((f) => f.giver)]);
  let worst = Infinity;
  for (const i of who) {
    for (let d = 0; d < DAYS; d++) {
      let hrs = 0;
      for (const sg of planOf(P, i, d)) if (sg.kind === 'stay' && sg.pose !== POSE.HIDDEN && sg.pose !== POSE.SLEEP) hrs += sg.t1 - sg.t0;
      if (hrs < worst) worst = hrs;
      if (hrs < 2) least.push(`${P.persons[i].name} day ${d}: ${hrs.toFixed(2)} h`);
    }
  }
  out.meetable = { people: who.size, days: DAYS, least: +worst.toFixed(2), short: least };
  for (const x of least) fail(`can be met for under two hours: ${x}`);
  // every place the journal lists can be found by walking to it
  const G = T.ground, S2 = T.levels[0].H, N = w.N, ok = new Uint8Array(NN * NN);
  for (let j = 0; j < NN * NN; j++) { const i = j % NN, k = (j - i) / NN; if (i < 1 || k < 1 || i > N - 1 || k > N - 1) continue; ok[j] = 1; }
  const seen = new Uint8Array(NN * NN), q = new Int32Array(NN * NN);
  let h = 0, tq = 0; const s0 = Math.round(w.start.z) * NN + Math.round(w.start.x); seen[s0] = 1; q[tq++] = s0;
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (h < tq) { const j = q[h++]; for (const [dx, dz, dd] of nb) { const m2 = j + dz * NN + dx; if (seen[m2] || !ok[m2]) continue; if (G[m2] - G[j] > SCALE.climb * dd && S2[m2] - G[m2] < 0.05) continue; seen[m2] = 1; q[tq++] = m2; } }
  out.found = [];
  for (const pl of places.list) {
    let yes = false;
    for (const pt of pl.at) {
      for (const fr of [0, 0.3, 0.6, 0.9]) {
        for (let a = 0; a < (fr ? 24 : 1) && !yes; a++) {
          const x = Math.round(pt[0] + Math.cos(a * Math.PI / 12) * pl.D * fr), z = Math.round(pt[1] + Math.sin(a * Math.PI / 12) * pl.D * fr);
          if (x < 1 || z < 1 || x > N - 1 || z > N - 1 || !seen[z * NN + x]) continue;
          const eye = Math.max(G[z * NN + x], S2[z * NN + x] - 1.55) + 1.7;
          if (Math.hypot(pt[0] - x, pt[1] - z) < 6 || sightLine(w, x, z, eye, pt[0], pt[1], pt[2], pl.own)) yes = true;
        }
        if (yes) break;
      }
      if (yes) break;
    }
    out.found.push([pl.id, yes]);
    if (!yes) fail(`${pl.title} cannot be found by walking to it`);
  }
  // the scripted player: one favour of each kind, from the words alone
  out.play = [];
  for (const kind of ['carry', 'find', 'tell']) {
    const fst = fav.first ? fav.list.find((x) => x.id === fav.first) : null;
    const f = (fst && fst.kind === kind ? fst : null) || fav.list.find((x) => x.kind === kind);
    if (!f) { fail(`no ${kind} favour`); continue; }
    const words = favourWords(f, P, usual, 2);
    const start = fromOf(f), sx = P.places[start];
    const lake = (places.list.find((x) => x.kind === 'lake') || { at: [] }).at;
    const r = playFavour(w, P, places.names, f, words, start, { x: sx.x, z: sx.z }, START_DAY, lake);
    out.play.push({ id: f.id, kind, ok: r.ok, why: r.why, minutes: +r.minutes.toFixed(2), metres: r.metres, wrong: r.legs.filter((l) => /wrong|to (?!the)/.test(l.why)).length, read: r.read, words });
    if (!r.ok) fail(`the scripted player could not do ${f.id} (${kind}): ${r.why}`);
    else if (r.minutes < 4 || r.minutes > 12) fail(`${f.id} (${kind}) took ${r.minutes.toFixed(1)} min of walking`);
  }
  // (and every other favour's words too: each must be enough to do it)
  out.every = { done: 0, of: 0, minutes: [] };
  for (const f of fav.list) {
    const words = favourWords(f, P, usual, 2), start = fromOf(f), sx = P.places[start];
    const lake = (places.list.find((x) => x.kind === 'lake') || { at: [] }).at;
    const r = playFavour(w, P, places.names, f, words, start, { x: sx.x, z: sx.z }, START_DAY, lake);
    out.every.of++;
    if (r.ok) { out.every.done++; out.every.minutes.push(+r.minutes.toFixed(2)); } else fail(`the words of ${f.id} (${f.kind}) are not enough: ${r.why}`);
  }
  out.ms = Math.round(performance.now() - t0);
  out.ok = !out.fails.length;
  return out;
}
