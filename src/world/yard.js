// The building yard (phase 3a, ?yard=1): every piece of the building kit
// standing alone on flat meadow, each at three angles (square to the grid,
// and turned 25 and 60 degrees), so each can be looked at near, at middle
// distance and far, by day and at night. Built from constants on every
// thread, like the Look Lab.
//
// With ?proto=1 it also holds phase 3a's two prototypes of the same three
// pieces (a crenellated wall with a gate arch, a round tower, a timber house
// with a pitched roof): once as per-cell spans on the 1 m grid, like the
// lab's wall, and once as the kit's exact shapes, each square to the grid
// and turned 30 degrees (docs/phase3a.md, section 1).
import { fbm, vnoise } from './noise.js';
import { makeLevels, materialCode } from './terrain.js';
import { floorField } from './objects.js';
import { buildClouds } from './sky.js';
import { KitBuilder, compileKit } from './kit.js';
import { buildStructure } from './kit-pieces.js';
import { emptySpans } from './spans.js';
import { protoSpans, protoShapes, PROTO } from './proto.js';
import { SCALE } from './scale.js';

export const YARD_N = 512;
export const YARD_GROUND = 10;
const SEED = 3031;
const D = Math.PI / 180;
const W = SCALE.kit.wall;

// The pieces, each at three angles: rows 45 m apart, angles 50 m apart.
export const YARD_ANGLES = [0, 25, 60];
const ROW0 = 70, COL0 = 140, ROWS = 46, COLS = 56;
export const YARD_ROWS = ['gate', 'square tower', 'round tower', 'keep', 'stair', 'house', 'well', 'torches', 'window'];

function piecesAt(name, x, z, a, base, seed) {
  const f = (u, w) => [x + u * Math.cos(a) - w * Math.sin(a), z + u * Math.sin(a) + w * Math.cos(a)];
  const G = SCALE.kit.gate;
  switch (name) {
    case 'gate': {
      // the gate between two short runs of wall, outside to local -w
      const half = G.length / 2;
      return [
        { kind: 'wall', a: f(-half - 12, 0), b: f(-half + 0.3, 0), base, out: -1, seed },
        { kind: 'wall', a: f(half - 0.3, 0), b: f(half + 12, 0), base, out: -1, seed: seed + 1 },
        { kind: 'gate', at: f(0, 0), angle: a, base, out: -1, seed: seed + 2 },
      ];
    }
    case 'square tower':
    case 'round tower': {
      // a corner of two short walls meeting at the tower, the yard to +w
      const round = name === 'round tower', size = round ? 4.0 : 4.1;
      const t1 = a + Math.PI, t2 = a + Math.PI / 2 + Math.PI;     // walls leave toward -u and -w
      const e1 = f(-(size - 0.4), 0), e2 = f(0, -(size - 0.4));
      return [
        { kind: 'tower', shape: round ? 'round' : 'square', at: f(0, 0), size, base, inward: a + Math.PI / 4, walls: [a + Math.PI, a - Math.PI / 2], seed },
        { kind: 'wall', a: f(-size - 10, 0), b: e1, base, out: -1, seed: seed + 1 },
        { kind: 'wall', a: e2, b: f(0, -size - 10), base, out: -1, seed: seed + 2 },
      ].map((p) => (p.kind === 'wall' ? p : { ...p, walls: [t1, t2] }));
    }
    case 'keep':
      return [{ kind: 'keep', at: f(0, 0), angle: a, base, w: 7, d: 5.5, seed }];
    case 'stair': {
      // a short run of wall with the stair up its inner face (+w)
      return [
        { kind: 'wall', a: f(-8, 0), b: f(8, 0), base, out: -1, seed },
        { kind: 'stair', at: f(-6.5, W.thick / 2 + SCALE.kit.stair.width / 2), angle: a, base, seed: seed + 1 },
      ];
    }
    case 'house':
      return [{ kind: 'house', at: f(0, 0), angle: a, base, w: 3.7, d: 2.7, seed }];
    case 'well':
      return [{ kind: 'well', at: f(0, 0), angle: a, base, seed }];
    case 'torches': {
      const [nx, nz] = [-Math.sin(a), Math.cos(a)];
      return [
        { kind: 'torch', at: f(-3, 2), base, mount: 'post' },
        { kind: 'window', at: f(3, 0), angle: a, base, seed },
        { kind: 'torch', at: f(5.2, 0.6), y: base + 2.6, mount: 'bracket', normal: [nx, nz] },
      ];
    }
    case 'window':
      return [{ kind: 'window', at: f(0, 0), angle: a, base, seed }];
    default: return [];
  }
}

export function yardLayout() {
  const pieces = [];
  YARD_ROWS.forEach((name, r) => {
    YARD_ANGLES.forEach((deg, c) => {
      const x = COL0 + c * COLS, z = ROW0 + r * ROWS;
      pieces.push(...piecesAt(name, x, z, deg * D, YARD_GROUND, 900 + r * 10 + c * 100));
    });
  });
  return { pieces };
}

// The cameras C cycles: each piece turned 25 degrees, near and at middle
// distance, then the whole yard far off.
export function yardCameras() {
  const cams = [];
  // (yaw: degrees from north toward east, as the player's)
  const look = (x, z, tx, tz) => Math.atan2(tx - x, tz - z) * 180 / Math.PI;
  // each piece turned 25 degrees, seen from its front (where its door or
  // its stair is), a little to the side of square on
  const a = 25 * D;
  const FRONT = { gate: a - Math.PI / 2, 'square tower': a + Math.PI / 4, 'round tower': a + Math.PI / 4, keep: a, stair: a + Math.PI / 2,
    house: a + Math.PI / 2, well: a - Math.PI / 2, torches: a + Math.PI / 2, window: a - Math.PI / 2 };
  YARD_ROWS.forEach((name, r) => {
    const tx = COL0 + COLS, tz = ROW0 + r * ROWS;
    const near = name === 'well' || name === 'torches' || name === 'window' ? 10 : name === 'house' ? 15 : name === 'keep' ? 28 : name === 'stair' ? 18 : 22;
    const f = FRONT[name] + 0.35;
    const x = tx + Math.cos(f) * near, z = tz + Math.sin(f) * near;
    cams.push({ name: `${name}, near`, x, z, yaw: look(x, z, tx, tz), pitch: name === 'keep' ? 12 : name === 'well' ? -4 : 5, time: 'day' });
  });
  const mx = COL0 + COLS, mz = ROW0 + 2 * ROWS;
  cams.push({ name: 'the yard, middle distance', x: mx - 60, z: ROW0 - 60, yaw: look(mx - 60, ROW0 - 60, mx, mz), pitch: 2, time: 'day' });
  cams.push({ name: 'the yard, far', x: mx + 150, z: ROW0 - 140, yaw: look(mx + 150, ROW0 - 140, mx, mz + 60), pitch: 1, time: 'day' });
  cams.push({ name: 'the yard at night', x: mx - 40, z: ROW0 - 30, yaw: look(mx - 40, ROW0 - 30, mx, ROW0 + ROWS), pitch: 3, time: 'night' });
  // inside the turned gate's passage, looking through it to the yard side (+w)
  const ga = 25 * D, gx = COL0 + COLS, gz = ROW0;
  cams.push({ name: 'inside the gate passage', x: gx - Math.sin(ga) * -2.5, z: gz + Math.cos(ga) * -2.5, yaw: look(0, 0, -Math.sin(ga), Math.cos(ga)), pitch: 2, time: 'day', y: YARD_GROUND + 1.7 });
  // on the turned gate's wall walk, looking along it
  const wx = gx - Math.cos(ga) * 10, wz = gz - Math.sin(ga) * 10;
  cams.push({ name: 'on the wall walk', x: wx, z: wz, yaw: look(wx, wz, gx + Math.cos(ga) * 14, gz + Math.sin(ga) * 14), pitch: -3, time: 'dusk', y: YARD_GROUND + W.height + 1.7 });
  return cams;
}

export function buildYard({ proto = false } = {}) {
  const t0 = performance.now();
  const N = YARD_N, NN = N + 1;
  const ground = new Float32Array(NN * NN).fill(YARD_GROUND);
  const tone = new Float32Array(NN * NN), fine = new Float32Array(NN * NN);
  for (let k = 0; k <= N; k++) for (let i = 0; i <= N; i++) {
    const j = k * NN + i;
    tone[j] = fbm(i / 11, k / 11, SEED + 21, 3);
    fine[j] = vnoise(i / 2.1, k / 2.1, SEED + 22) * 0.7 + vnoise(i / 0.9, k / 0.9, SEED + 23) * 0.3;
  }
  const zero = () => new Uint8Array(NN * NN);
  const wWater = zero(), surface = ground.slice();
  // (with the prototypes: a pond before each of their rows, so both show
  // in water)
  if (proto) {
    for (const [z0, z1] of PROTO.ponds) {
      for (let k = z0 - 3; k <= z1 + 3; k++) for (let i = 40; i <= 480; i++) {
        const j = k * NN + i, e = Math.min(k - z0, z1 - k, i - 42, 478 - i);
        if (e < -2) continue;
        ground[j] = YARD_GROUND - Math.max(0, Math.min(1, (e + 2) / 3)) * 1.0;
        if (e >= 0) { wWater[j] = 255; surface[j] = YARD_GROUND - 0.35; }
      }
    }
  }
  const levels = makeLevels(surface, N);
  const terrain = { N, NN, ground, levels, wWater, wRoad: zero(), wSand: zero(), wRock: zero(), wSnow: zero(), tone, fine, maxH: YARD_GROUND };
  terrain.wFloor = floorField(terrain, []);
  terrain.code = materialCode(terrain);
  // (with ?proto=1 the yard holds only the prototypes)
  const b = new KitBuilder();
  let spans = emptySpans();
  if (proto) { buildStructure(b, protoShapes()); spans = protoSpans(); }
  else buildStructure(b, yardLayout());
  const kit = compileKit(b);
  const torches = kit.torches.map((t) => ({ ...t }));
  const cams = proto ? PROTO.cameras : yardCameras();
  return {
    kind: 'yard', N, NN, center: [N / 2, N / 2], viewDist: 1e9,
    terrain, spans, kit, objects: { trees: [], bushes: [], torches, water: proto ? YARD_GROUND - 0.35 : -1e9 },
    clouds: buildClouds(), cameras: cams, start: { x: cams[0].x, z: cams[0].z, yaw: cams[0].yaw, pitch: 0 },
    buildMs: performance.now() - t0,
  };
}
