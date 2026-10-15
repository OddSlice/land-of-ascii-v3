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
//
// The parts: the way network (net.js), who the people are and their places
// (build.js), the routes between places (routes.js), each day's plan
// (plans.js), and here where someone is at any moment (stateAt) and which
// houses are lit (litGroups).
import { roomAt } from '../kit.js';
import { S, POSE, TOOL, LIGHT } from './figure.js';
import { planOf } from './plans.js';

export { buildPeople } from './build.js';
export { routeOf } from './routes.js';
export { planOf, flockCentre } from './plans.js';

export const DUSK = 18.4, DAWN = 6.1;           // hours people carry a light out of doors
const STRIDE = 1.3;                             // metres a walk's cycle (two steps) covers

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

// Who is at home in each house (by the light groups of its windows):
// out[group] bit 1 if its windows are lit (someone awake at home after
// dark), bit 2 if someone sleeps there, bit 4 if someone is awake at home.
export function litGroups(P, day, hour, out) {
  out.fill(0);
  for (const per of P.persons) {
    if (per.village === undefined) continue;
    const seg = segmentAt(planOf(P, per.id, day), hour);
    // (asleep, in a bed one can see or behind closed doors, is dark)
    if (seg.kind !== 'stay') continue;
    const H = P.villages[per.village].houses[per.home];
    if (seg.pose === POSE.SLEEP || seg.act.startsWith('asleep')) { out[H.group] |= 2; continue; }
    const pl = P.places[seg.at];
    if (pl.kind === 'closed' || pl.kind === 'sit' || pl.kind === 'in' || pl.kind === 'hearth') {
      out[H.group] |= 4;
      if (hour >= 16.5 || hour < 9) out[H.group] |= 1;
    }
  }
  return out;
}
