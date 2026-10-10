// Walking on the ground: WASD at 4.5 m/s (Shift 8), gravity, the wall and
// tree trunks block, the gate can be walked through and the wall's top
// walked along, the lake is not walked into past wading depth.
import { EYE } from '../world/layout.js';
import { groundAt } from '../world/objects.js';
import { archY, SPAN_ARCH, SPAN_MERLON } from '../world/spans.js';

const WALK = 4.5, RUN = 8, RADIUS = 0.3, STEP = 0.6, HEAD = 1.8, GRAVITY = 18;

export class Player {
  constructor(world) {
    this.world = world;
    this.x = 0; this.z = 0; this.feet = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0;
  }

  get eye() { return this.feet + EYE; }

  place(x, z, yaw, pitch, feet) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = pitch;
    this.feet = feet !== undefined ? feet : this.supportAt(x, z, 1e9);
    this.vy = 0;
  }

  // The highest thing to stand on at (x, z) that is not above the feet by
  // more than a step: the ground, or the top of a span.
  supportAt(x, z, feet) {
    let y = groundAt(this.world.terrain, x, z);
    const sp = this.world.spans, N = this.world.N;
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix >= 0 && iz >= 0 && ix < N && iz < N) {
      const s = sp.idx[iz * N + ix];
      const top = s >= 0 ? sp.y1[s] + (sp.flags[s] & SPAN_MERLON ? sp.merlon : 0) : 0;
      if (s >= 0 && top <= feet + STEP) y = Math.max(y, top);
    }
    return y;
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
        const s = sp.idx[iz * N + ix];
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
    for (const t of this.world.objects.trees) {
      const dx = x - t.x, dz = z - t.z, r = 0.3 + RADIUS;
      if (dx * dx + dz * dz < r * r && feet < t.trunkTop) return true;
    }
    // no wading in deeper than half a metre
    const T = this.world.terrain;
    const g = groundAt(T, x, z), w = groundAt({ ground: T.levels[0].H, N: T.N, NN: T.NN }, x, z);
    if (w - g > 0.5 && feet < w) return true;
    return false;
  }

  update(dt, keys) {
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
    const ground = this.supportAt(this.x, this.z, this.feet);
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
}

