// Moving through the world. WASD walks at 4.5 m/s (Shift runs at 8), gravity
// pulls, the wall and tree trunks block, the gate can be walked through and
// the wall's top walked along.
//
// The lab and the stress scene keep their simple rules: walking speed is
// horizontal and water deeper than half a metre stops you.
//
// The generated world (`rules: 'world'`) has the rules a real landscape needs
// (the numbers are in world/scale.js):
// - walking speed is measured along the ground, so hills neither speed you
//   up nor let you glide down;
// - ground steeper than 45 degrees cannot be walked up, and ground steeper
//   than 50 degrees slides you down it;
// - you wade, slower as the water deepens, to chest depth, then swim slowly
//   with the eye just above the surface;
// - falling does no harm;
// - F toggles flying at 50 m/s, for looking around (W and S fly where you
//   look, Space rises).
import { EYE } from '../world/layout.js';
import { groundAt } from '../world/objects.js';
import { archY, spanAt, SPAN_ARCH, SPAN_MERLON } from '../world/spans.js';
import { SCALE } from '../world/scale.js';
import { supportAt as kitSupport, bodyBlocked } from '../world/kit.js';

const WALK = 4.5, RUN = 8, RADIUS = 0.3, STEP = 0.6, HEAD = 1.8, GRAVITY = 18;
// (phase 3a) points round the body's edge: on a building's edge you stand
// on whatever any part of you is over, and step off only once clear of it
const RING8 = Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4) * (RADIUS - 0.02), Math.sin(k * Math.PI / 4) * (RADIUS - 0.02)]);

export class Player {
  constructor(world, { rules = 'lab' } = {}) {
    this.world = world;
    this.rules = rules;
    this.x = 0; this.z = 0; this.feet = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.flying = false;
    this.mode = 'walk';           // walk, wade, swim, slide, fly, fall
    // trunks in 16 m buckets, so collisions only look at the trees nearby
    const T = world.objects.trees, B = 16, n = Math.ceil(world.N / B);
    this.tb = { B, n, cells: Array.from({ length: n * n }, () => []) };
    for (const t of T) {
      const gx = Math.min(n - 1, Math.max(0, Math.floor(t.x / B))), gz = Math.min(n - 1, Math.max(0, Math.floor(t.z / B)));
      this.tb.cells[gz * n + gx].push(t);
    }
    this.surface = { ground: world.terrain.levels[0].H, N: world.terrain.N, NN: world.terrain.NN };
    // (phase 3a) the building kit's shapes: walked on and blocking exactly as drawn
    this.kit = world.kit && world.kit.np ? world.kit : null;
  }

  get eye() { return this.feet + EYE; }

  place(x, z, yaw, pitch, feet) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = pitch;
    this.feet = feet !== undefined ? feet : this.rules === 'world' ? this.restAt(x, z) : this.supportAt(x, z, 1e9);
    this.vy = 0;
  }

  toggleFly() {
    this.flying = !this.flying;
    this.vy = 0;
    this.mode = this.flying ? 'fly' : 'fall';
  }

  // The highest thing to stand on at (x, z) that is not above the feet by
  // more than a step (or `reach`): the ground, or the top of a span or a
  // building's shape (`ring`: under any part of the body, not only its
  // middle).
  supportAt(x, z, feet, ring = false, reach = STEP) {
    let y = groundAt(this.world.terrain, x, z);
    const sp = this.world.spans, N = this.world.N;
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix >= 0 && iz >= 0 && ix < N && iz < N) {
      const s = spanAt(sp, ix, iz);
      const top = s >= 0 ? sp.y1[s] + (sp.flags[s] & SPAN_MERLON ? sp.merlon : 0) : 0;
      if (s >= 0 && top <= feet + reach) y = Math.max(y, top);
    }
    if (this.kit) {
      let k = kitSupport(this.kit, x, z, feet + reach);
      if (ring) for (const [cx, cz] of RING8) { const kk = kitSupport(this.kit, x + cx, z + cz, feet + reach); if (kk > k) k = kk; }
      if (k > y) y = k;
    }
    return y;
  }

  // What the feet rest on where they stand (under any part of the body),
  // unless rising onto it would put the head into something: then what is
  // under the body no higher than the feet are.
  standOn(x, z, feet) {
    const g = this.supportAt(x, z, feet, true);
    return g > feet + 1e-3 && this.blocked(x, z, g) ? this.supportAt(x, z, feet, true, 1e-3) : g;
  }

  // Where the feet rest at (x, z): on the ground, or swimming in deep water.
  restAt(x, z) {
    const g = this.supportAt(x, z, 1e9), w = groundAt(this.surface, x, z);
    return w - g > SCALE.chest ? w + SCALE.swimEye - EYE : g;
  }

  // Would a body standing with its feet at `feet` at (x, z) hit anything?
  blocked(x, z, feet) {
    const N = this.world.N;
    if (x < 1 || z < 1 || x > N - 1 || z > N - 1) return true;
    const sp = this.world.spans, GATE = sp.gate;
    const lo = feet + STEP, hi = feet + HEAD;
    for (let iz = Math.floor(z - RADIUS); iz <= Math.floor(z + RADIUS); iz++) {
      for (let ix = Math.floor(x - RADIUS); ix <= Math.floor(x + RADIUS); ix++) {
        if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const s = spanAt(sp, ix, iz);
        if (s < 0) continue;
        let y0 = sp.y0[s];
        if (sp.flags[s] & SPAN_ARCH) {
          // the arch is lowest at the body's outer edge
          const ex = Math.abs(x - GATE.cx) + RADIUS;
          y0 = archY(GATE.cx + Math.min(ex, GATE.r), GATE);
        }
        const top = sp.y1[s] + (sp.flags[s] & SPAN_MERLON ? sp.merlon : 0);
        if (y0 < hi && top > lo) return true;
      }
    }
    if (this.kit && bodyBlocked(this.kit, x, z, lo, hi, RADIUS)) return true;
    const { B, n, cells } = this.tb;
    const gx = Math.floor(x / B), gz = Math.floor(z / B);
    for (let a = gz - 1; a <= gz + 1; a++) {
      for (let b = gx - 1; b <= gx + 1; b++) {
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        for (const t of cells[a * n + b]) {
          const dx = x - t.x, dz = z - t.z, r = 0.3 + RADIUS;
          if (dx * dx + dz * dz < r * r && feet < t.trunkTop) return true;
        }
      }
    }
    if (this.rules !== 'world') {
      // no wading in deeper than half a metre
      const T = this.world.terrain;
      const g = groundAt(T, x, z), w = groundAt(this.surface, x, z);
      if (w - g > 0.5 && feet < w) return true;
    }
    return false;
  }

  update(dt, keys) {
    if (this.rules === 'world') { this.updateWorld(dt, keys); return; }
    let f = 0, s = 0;
    if (keys.KeyW) f += 1;
    if (keys.KeyS) f -= 1;
    if (keys.KeyD) s += 1;
    if (keys.KeyA) s -= 1;
    const speed = keys.ShiftLeft || keys.ShiftRight ? RUN : WALK;
    const len = Math.hypot(f, s);
    if (len > 0) {
      f /= len; s /= len;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const mx = (f * sy + s * cy) * speed * dt, mz = (f * cy - s * sy) * speed * dt;
      // move in small steps so nothing is skipped, sliding along what blocks
      const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.2));
      for (let i = 0; i < steps; i++) this.tryMove(mx / steps, mz / steps);
    }
    // gravity and stepping
    const ground = this.standOn(this.x, this.z, this.feet);
    if (this.feet > ground + 1e-3) {
      this.vy -= GRAVITY * dt;
      this.feet += this.vy * dt;
      if (this.feet <= ground) { this.feet = ground; this.vy = 0; }
    } else {
      this.feet = ground;
      this.vy = 0;
    }
  }

  tryMove(mx, mz) {
    for (const [ax, az] of [[mx, mz], [mx, 0], [0, mz]]) {
      if (!ax && !az) continue;
      const nx = this.x + ax, nz = this.z + az;
      const g = this.supportAt(nx, nz, this.feet);
      if (g > this.feet + STEP) continue;
      const feet = g > this.feet ? g : this.feet;
      if (this.blocked(nx, nz, feet)) continue;
      this.x = nx; this.z = nz; this.feet = feet;
      return;
    }
  }

  // ---- the generated world's rules -------------------------------------------

  // Slope of the ground at (x, z): rise over run, and the way down.
  slopeAt(x, z) {
    const T = this.world.terrain, e = 0.5;
    const sx = (groundAt(T, x + e, z) - groundAt(T, x - e, z)) / (2 * e), sz = (groundAt(T, x, z + e) - groundAt(T, x, z - e)) / (2 * e);
    return { s: Math.hypot(sx, sz), dx: -sx, dz: -sz };
  }

  depthAt(x, z) { return groundAt(this.surface, x, z) - groundAt(this.world.terrain, x, z); }

  updateWorld(dt, keys) {
    let f = 0, s = 0;
    if (keys.KeyW) f += 1;
    if (keys.KeyS) f -= 1;
    if (keys.KeyD) s += 1;
    if (keys.KeyA) s -= 1;
    const len = Math.hypot(f, s);
    if (len > 0) { f /= len; s /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const ux = f * sy + s * cy, uz = f * cy - s * sy;
    const N = this.world.N;
    if (this.flying) {
      // where you look, including up and down; Space rises
      const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
      let vx = (f * sy * cp + s * cy), vz = (f * cy * cp - s * sy), vy = f * spch + (keys.Space ? 1 : 0);
      const vl = Math.hypot(vx, vy, vz);
      if (vl > 0) {
        const k = SCALE.fly * dt / vl;
        this.x = Math.min(N - 1, Math.max(1, this.x + vx * k));
        this.z = Math.min(N - 1, Math.max(1, this.z + vz * k));
        this.feet += vy * k;
      }
      // never into the ground or the water
      this.feet = Math.max(this.feet, groundAt(this.surface, this.x, this.z) + 0.5 - EYE + 0.2, this.supportAt(this.x, this.z, this.feet));
      this.mode = 'fly';
      return;
    }
    const depth = this.depthAt(this.x, this.z);
    const swimming = depth > SCALE.chest;
    if (len > 0) {
      let speed;
      if (swimming) speed = SCALE.swim;
      else {
        speed = keys.ShiftLeft || keys.ShiftRight ? SCALE.run : SCALE.walk;
        // wading: slower as the water deepens
        if (depth > 0) speed *= 1 - (1 - SCALE.wade) * Math.min(1, depth / SCALE.chest);
      }
      // the distance to go along the ground, in steps of at most 0.2 m
      let budget = speed * dt;
      for (let guard = 0; budget > 1e-6 && guard < 64; guard++) {
        const h = Math.min(0.2, budget);
        const done = swimming ? this.trySwim(ux * h, uz * h) : this.tryWalk(ux, uz, h);
        if (done <= 0) break;
        budget -= done;
      }
    }
    // standing, sliding, falling or floating
    const d2 = this.depthAt(this.x, this.z), wl = groundAt(this.surface, this.x, this.z);
    const ground = this.standOn(this.x, this.z, this.feet);
    // past chest depth you float, the eye just above the surface (where the
    // bottom is not yet that deep, the feet stay on it)
    const rest = d2 > SCALE.chest ? Math.max(ground, wl + SCALE.swimEye - EYE) : ground;
    if (this.feet > rest + 1e-3) {
      // falling (no harm done on landing), into water or onto the ground
      this.vy -= GRAVITY * dt;
      this.feet += this.vy * dt;
      if (this.feet <= rest) { this.feet = rest; this.vy = 0; }
      this.mode = this.feet <= rest ? (d2 > SCALE.chest ? 'swim' : 'walk') : 'fall';
      return;
    }
    if (d2 > SCALE.chest) { this.feet = rest; this.vy = 0; this.mode = 'swim'; return; }
    this.feet = ground; this.vy = 0;
    // too steep to stand on: slide down it
    const sl = this.slopeAt(this.x, this.z);
    if (sl.s > SCALE.slide && Math.abs(ground - groundAt(this.world.terrain, this.x, this.z)) < 1e-3) {
      const dl = Math.hypot(sl.dx, sl.dz) || 1, step = SCALE.slideSpeed * dt;
      const nx = this.x + sl.dx / dl * step, nz = this.z + sl.dz / dl * step;
      if (!this.blocked(nx, nz, this.feet - 1)) { this.x = nx; this.z = nz; this.feet = this.supportAt(nx, nz, this.feet); }
      this.mode = 'slide';
      return;
    }
    this.mode = d2 > 0.05 ? 'wade' : 'walk';
  }

  // One step taking h metres along the ground, in direction (ux, uz) (or,
  // sliding along what blocks, along one axis of it): on a slope the step is
  // shorter across the map, so hills slow you down both ways. Returns the
  // distance used along the ground (0: blocked).
  tryWalk(ux, uz, h) {
    for (const [ax, az] of [[ux, uz], [ux, 0], [0, uz]]) {
      const al = Math.hypot(ax, az);
      if (al < 1e-6) continue;
      // how steep the way ahead is, then a step that long along it
      const probe = h * al;
      const k = (this.supportAt(this.x + ax * h, this.z + az * h, this.feet) - this.feet) / probe;
      const run = probe / Math.sqrt(1 + k * k), nx = this.x + ax / al * run, nz = this.z + az / al * run;
      const g = this.supportAt(nx, nz, this.feet);
      const rise = g - this.feet;
      // ground steeper than 45 degrees cannot be walked up (a span's step can)
      const onGround = g <= groundAt(this.world.terrain, nx, nz) + 1e-3;
      if (onGround ? rise > SCALE.climb * run + 1e-3 : rise > STEP) continue;
      // (and where it would come down, if it steps off something: phase 3a)
      if (this.blocked(nx, nz, Math.max(g, this.feet)) || (g < this.feet - 0.05 && this.blocked(nx, nz, g))) continue;
      // follow the ground down; a drop steeper than this is a fall instead
      const follow = rise > 0 || -rise < Math.max(0.15, 2 * run);
      // (nor onto the edge of something a step up that the head has no room
      // to rise onto, with nothing under the body at its own height: it
      // would fall with that thing inside it)
      if (this.kit) {
        const fa = follow ? g : this.feet, gr = this.supportAt(nx, nz, fa, true);
        if (gr > fa + 1e-3 && this.blocked(nx, nz, gr) && this.supportAt(nx, nz, fa, true, 1e-3) < fa - 0.05) continue;
      }
      this.x = nx; this.z = nz;
      if (follow) this.feet = g;
      return Math.hypot(run, follow ? rise : 0) / al;
    }
    return 0;
  }

  // One swimming stroke: free in the water, and out onto a bank wherever
  // the bank is not too steep to walk up.
  trySwim(mx, mz) {
    const nx = this.x + mx, nz = this.z + mz, h = Math.hypot(mx, mz);
    const g = this.supportAt(nx, nz, 1e9), wl = groundAt(this.surface, nx, nz);
    if (g > wl - SCALE.chest && (g - groundAt(this.world.terrain, this.x, this.z)) > SCALE.climb * h + 0.02) return 0;
    if (this.blocked(nx, nz, Math.max(this.feet, g))) return 0;
    this.x = nx; this.z = nz;
    if (g > this.feet) this.feet = g;
    return h;
  }
}
