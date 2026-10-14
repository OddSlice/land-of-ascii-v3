// What the signposts say (0.5.5). Each village has a signpost where its
// road meets the main road (src/world/gen/village.js), an arm along each
// way. An arm now names the places its way leads to, nearest first by the
// road, with how far: the village itself, the other villages, the fort.
//
// The way to each place is the people's road network (the same one they
// walk, src/world/people/people.js): the shortest way there from the post,
// and the arm it leaves by (the arm nearest its way over the first 50 m,
// within 65 degrees). A place no arm leads toward is left off.
//
// Worked out one post at a time, when the page has a moment (`step`), or at
// once for a post you come up to before then.
import { namesOf } from './places.js';

const TAU = Math.PI * 2;
const wrap = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

export class Signs {
  constructor(world, net) {
    this.world = world; this.net = net;
    const names = namesOf(world), s = world.sites;
    const desc = world.kitDesc || {};
    this.posts = (desc.pieces || []).filter((p) => p.kind === 'signpost').map((p) => ({ x: p.at[0], z: p.at[1], y: p.base, arms: p.arms.map((a) => ({ a, to: [] })), done: false }));
    // the places a post can name
    this.dests = s.villages.map((v, q) => ({ name: names.villages[q], x: v.plan ? v.plan.centre.x : v.x, z: v.plan ? v.plan.centre.z : v.z, kind: 'village' }));
    if (s.fort && s.fort.gate) { const g = s.fort.gate; this.dests.push({ name: 'the fort', x: g.x + g.out[0] * 5, z: g.z + g.out[1] * 5, kind: 'fort' }); }
    this.next = 0;
  }

  // the network node nearest (x, z), within r metres
  node(x, z, r) { const k = this.net.nearby(x, z, r); return k.length ? k[0] : -1; }

  // Work out post i's arms.
  read(i) {
    const P = this.posts[i], net = this.net;
    if (P.done) return P;
    P.done = true;
    const from = this.node(P.x, P.z, 12);
    if (from < 0) return P;
    for (const d of this.dests) {
      const to = this.node(d.x, d.z, 150);
      if (to < 0) continue;
      const way = net.path(from, to);
      if (!way || way.length < 2) continue;
      // its length, and the way it leaves the post: the mean of the
      // directions to its points 8 to 50 m out (a road can bend at once)
      let len = 0, lx = net.x[way[0]], lz = net.z[way[0]], sx = 0, sz = 0;
      for (const k of way) {
        len += Math.hypot(net.x[k] - lx, net.z[k] - lz); lx = net.x[k]; lz = net.z[k];
        const ex = net.x[k] - P.x, ez = net.z[k] - P.z, e = Math.hypot(ex, ez);
        if (len <= 50 && e > 8) { sx += ex / e; sz += ez / e; }
      }
      const dir = sx || sz ? Math.atan2(sz, sx) : null;
      if (dir === null || len < 25) continue;
      let best = null, bd = 65 * Math.PI / 180;
      for (const arm of P.arms) { const e = Math.abs(wrap(arm.a - dir)); if (e < bd) { bd = e; best = arm; } }
      if (best) best.to.push({ name: d.name, kind: d.kind, dist: len });
    }
    for (const arm of P.arms) arm.to.sort((a, b) => a.dist - b.dist).splice(3);
    return P;
  }

  // One post more, when the page has a moment; false when all are read.
  step() {
    while (this.next < this.posts.length && this.posts[this.next].done) this.next++;
    if (this.next >= this.posts.length) return false;
    this.read(this.next++);
    return true;
  }

  // The post you stand by (within `r` metres, about your level), read: or null.
  near(x, z, feet, r = 4.5) {
    for (let i = 0; i < this.posts.length; i++) {
      const P = this.posts[i];
      if (Math.abs(P.x - x) > r || Math.abs(P.z - z) > r || Math.hypot(P.x - x, P.z - z) > r || Math.abs(P.y - feet) > 2.5) continue;
      return this.read(i);
    }
    return null;
  }
}

// An arm's direction as a yaw (0 north, clockwise): the arms' angles are
// measured from +x toward +z.
export const armYaw = (a) => Math.atan2(Math.cos(a), Math.sin(a));
