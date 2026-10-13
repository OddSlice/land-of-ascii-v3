// Animals on the main thread (phase 4b): each frame, every animal's state at
// the frame's day and hour (src/world/animals/state.js), reacting to you and
// to the people outdoors near them, the meetings (meet.js), and the large
// ones near you as bodies you cannot walk through. The frame carries the
// states to the render workers, so every worker draws the same animals.
import { buildAnimals } from '../world/animals/build.js';
import { animalsAt } from '../world/animals/state.js';
import { settle } from '../world/animals/meet.js';
import { birdMarks } from '../world/animals/shapes.js';
import { AS, A, APOSE, KIND, SPEC, KIND_NAMES } from '../world/animals/kinds.js';
import { FS, S, POSE } from '../world/people/figure.js';

// (the kinds you cannot walk through: the rest are too small to stop you)
// (meetings are worked out within this of you: past it a small overlap
// cannot be seen; measured as |dx| + |dz|)
const SETTLE_R = 100;
const BODY = new Set([KIND.SHEEP, KIND.COW, KIND.DEER, KIND.DOG]);

export class Animals {
  constructor(world, P) {
    const t0 = performance.now();
    this.world = world; this.P = P;
    this.A = buildAnimals(world, P);
    this.n = this.A.members.length;
    this.st = new Float32Array(Math.max(1, this.n) * AS);
    this.ids = new Int32Array(Math.max(1, this.n));
    this.count = 0;
    this.walkers = [];
    this.bodies = new Float64Array(this.n * 5);
    this.on = true;
    this.updateMs = 0;
    this.left = 0;
    this.buildMs = performance.now() - t0;
  }

  // Everyone's state for (day, hour); `you`: { x, z, feet }; `people`: the
  // people's states this frame (or null). Returns a copy for the frame.
  update(day, hour, you, people, player, weather) {
    const t0 = performance.now();
    const w = this.walkers;
    w.length = 0;
    if (you) w.push(you.x, you.z, you.feet);
    if (people) {
      for (let i = 0, n = people.length / FS; i < n; i++) {
        const o = i * FS;
        if (people[o + S.POSE] === POSE.HIDDEN || people[o + S.ROOM] >= 0) continue;
        w.push(people[o + S.X], people[o + S.Z], people[o + S.FEET]);
      }
    }
    const n = animalsAt(this.A, day, hour, w, this.st, this.ids, null, weather);
    this.left = settle(this.st, n, w, this.P.p, you ? { x: you.x, z: you.z, r: SETTLE_R } : null);
    this.count = n;
    // the large ones near you, as bodies (added to the people's)
    if (player) {
      let k = 0;
      const st = this.st, B = this.bodies;
      for (let i = 0; i < n; i++) {
        const o = i * AS, kind = st[o + A.KIND];
        if (!BODY.has(kind) || st[o + A.POSE] === APOSE.HIDDEN) continue;
        const x = st[o + A.X], z = st[o + A.Z];
        if (Math.abs(x - player.x) > 4 || Math.abs(z - player.z) > 4) continue;
        const sp = SPEC[kind], s = st[o + A.SCALE] || 1, r = sp.r * s, h = Math.max(0, sp.len * s / 2 - r);
        const fx = Math.sin(st[o + A.YAW]) * h, fz = Math.cos(st[o + A.YAW]) * h, y = st[o + A.Y], top = y + sp.back * s;
        // (a body as two circles, its two ends)
        B[k++] = x + fx; B[k++] = z + fz; B[k++] = r; B[k++] = y; B[k++] = top;
        if (h > 0.05) { B[k++] = x - fx; B[k++] = z - fz; B[k++] = r; B[k++] = y; B[k++] = top; }
        if (k > B.length - 10) break;
      }
      if (k) {
        const prev = player.others, m = prev ? prev.length : 0, all = new Float64Array(m + k);
        if (prev) all.set(prev);
        all.set(B.subarray(0, k), m);
        player.others = all;
      }
    }
    this.updateMs = performance.now() - t0;
    return this.st.slice(0, n * AS);
  }

  // The birds far off as marks, for this frame's camera and grid.
  marks(frame) {
    const ty = Math.tan(frame.fovY / 2), colAngle = 2 * ty * frame.aspect / frame.cols;
    if (!this.mk || this.mk.length < this.count * 6) this.mk = new Float32Array(Math.max(6, this.n * 6));
    const A0 = this.A, ids = this.ids;
    const k = birdMarks(this.st, this.count, (i) => A0.members[ids[i]].group, frame.cam, colAngle, this.mk);
    return this.mk.slice(0, k);
  }

  setOn(on) { this.on = !!on; }

  // Counts by kind, for the menu and the tools.
  counts() {
    const out = [];
    for (let k = 0; k < KIND_NAMES.length; k++) out.push({ kind: k, name: KIND_NAMES[k], n: this.A.count[k] || 0 });
    return out;
  }

  // The groups the camera can go to: a flock, a herd, a deer group, a perch.
  groups() {
    return this.A.groups.map((g) => ({ id: g.id, type: g.type, kind: g.kind, n: g.members.length, x: g.home[0], z: g.home[1] }));
  }

  // Where a group is now (the middle of its members this frame), or null.
  where(gid) {
    const st = this.st, g = this.A.groups[gid];
    if (!g) return null;
    let sx = 0, sz = 0, sy = 0, k = 0;
    for (let i = 0; i < this.count; i++) {
      const o = i * AS;
      if (this.A.members[this.ids[i]].group !== gid || st[o + A.POSE] === APOSE.HIDDEN) continue;
      sx += st[o + A.X]; sz += st[o + A.Z]; sy += st[o + A.Y]; k++;
    }
    return k ? { x: sx / k, z: sz / k, y: sy / k, n: k } : { x: g.home[0], z: g.home[1], y: null, n: 0 };
  }
}
