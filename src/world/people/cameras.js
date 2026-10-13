// The fixed cameras that look at people (phase 4a), from the people's own
// data, so every seed has them: a green at midday (or a village's centre,
// where no village has a green), the wall walk at night seen from the
// courtyard, and a traveller on the road on the first day.
import { planOf } from './people.js';

const deg = (r) => r * 180 / Math.PI;

export function peopleCameras(world, P) {
  const cams = [];
  // a green at midday, from its edge, across it
  const V = P.villages.find((v) => v.greens.length) || P.villages[0];
  if (V) {
    const pl = world.sites.villages[V.q].plan;
    const c = pl.green ? { x: pl.green.x, z: pl.green.z, r: pl.green.r } : { x: pl.centre.x, z: pl.centre.z, r: 12 };
    // from the side the lane comes in, or the south
    const a = pl.lanes && pl.lanes[0] ? Math.atan2(pl.lanes[0].z[pl.lanes[0].n - 1] - c.z, pl.lanes[0].x[pl.lanes[0].n - 1] - c.x) : Math.PI / 2;
    const x = c.x + Math.cos(a) * (c.r + 3), z = c.z + Math.sin(a) * (c.r + 3);
    cams.push({ name: `village ${V.q + 1} (${V.pattern}), at midday`, x, z, yaw: deg(Math.atan2(c.x - x, c.z - z)), pitch: -2, time: 'noon', stand: true });
  }
  // the wall walk at night, from the courtyard
  if (P.fort && P.fort.beats.length) {
    // (back across the yard and off to one end, so the walk runs away along
    // the wall, its parapet and its guard against the sky)
    const b = P.fort.beats[0], dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], L = Math.hypot(dx, dz);
    const mx = b.a[0] + dx * 0.55, mz = b.a[1] + dz * 0.55, base = P.fort.base;
    let x = b.a[0] + dx * 0.15 - b.out[0] * 24, z = b.a[1] + dz * 0.15 - b.out[1] * 24;
    // (inside the yard: pulled toward the gate's inner point if not)
    const yd = P.places[P.fort.inner];
    for (let k = 0; k < 10 && P.p.blocked(x, z, base); k++) { x += (yd.x - x) * 0.2; z += (yd.z - z) * 0.2; }
    const d = Math.hypot(mx - x, mz - z);
    cams.push({ name: 'the wall walk at night, from the courtyard', x, z, y: base + 1.7, yaw: deg(Math.atan2(mx - x, mz - z)), pitch: deg(Math.atan2(b.y + 1.0 - base - 1.7, d)), time: 'night' });
    void L;
  }
  // a traveller on the road, the first day: eleven metres ahead, turned to
  // meet them, halfway through their walk
  const T = P.persons.find((p) => p.role === 'traveller');
  if (T) {
    const seg = planOf(P, T.id, 0).find((s) => s.kind === 'walk' && s.route.len > 150);
    if (seg) {
      const R = seg.route, hour = seg.t0 + (seg.t1 - seg.t0) * 0.5;
      const s = (hour - seg.t0) * 3600 * T.speed;
      let k = 0; while (k < R.n - 1 && R.cum[k] < s + 11) k++;
      const k0 = Math.max(0, k - 6);
      cams.push({ name: 'a traveller on the road', x: R.x[k], z: R.z[k], y: R.y[k] + 1.7, yaw: deg(Math.atan2(R.x[k0] - R.x[k], R.z[k0] - R.z[k])), pitch: -2, time: hour });
    }
  }
  return cams;
}
