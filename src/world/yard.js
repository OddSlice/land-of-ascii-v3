// The building yard (phase 3a, ?yard=1): every piece of the building kit
// standing alone on flat meadow, each at three angles (square to the grid,
// and turned 25 and 60 degrees), so each can be looked at near, at middle
// distance and far, by day and at night. Built from constants on every
// thread, like the Look Lab.
//
// Phase 3b adds the villages' pieces in a second block to the east, each at
// the same three angles, the jetty and the bridges over ponds of their own.
// (Phase 3a's two prototypes, spans against exact shapes, were removed in
// phase 3b, the choice made: docs/phase3a.md, section 1.)
import { fbm, vnoise } from './noise.js';
import { makeLevels, materialCode } from './terrain.js';
import { floorField } from './objects.js';
import { buildClouds } from './sky.js';
import { KitBuilder, compileKit } from './kit.js';
import { buildStructure, frame } from './kit-pieces.js';
import { emptySpans } from './spans.js';
import { SCALE } from './scale.js';
import { FS, S, POSE, HATK, TOOL, LIGHT } from './people/figure.js';
import { furnitureSpots } from './kit-village.js';
import { MAT } from '../contract.js';
import { AS, A as AN, APOSE, KIND, SPEC } from './animals/kinds.js';

export const YARD_N = 512;
export const YARD_GROUND = 10;
const SEED = 3031;
const D = Math.PI / 180;
const W = SCALE.kit.wall;

// The pieces, each at three angles: rows 45 m apart, angles 50 m apart.
export const YARD_ANGLES = [0, 25, 60];
const ROW0 = 70, COL0 = 140, ROWS = 46, COLS = 56;
export const YARD_ROWS = ['gate', 'square tower', 'round tower', 'keep', 'stair', 'house', 'well', 'torches', 'window'];
// (phase 3b) the villages' pieces: rows 33 m apart, angles 55 m apart
const VROW0 = 38, VCOL0 = 318, VROWS = 33, VCOLS = 55;
export const VILLAGE_ROWS = ['cottage', 'hall', 'barn', 'chapel', 'chapel with a tower', 'market shelter', 'jetty', 'fence and gate', 'dry-stone wall',
  'haystack and bench', 'signpost and lantern', 'timber bridge', 'stone bridge', 'inside a cottage'];
const G0 = YARD_GROUND, POND = G0 - 0.35;
// the ponds under the jetty and the bridges: [x0, x1, z0, z1]
function ponds(opts = {}) {
  const out = [];
  // (phase 4b) the pond of the ducks and the reed bed
  if (opts.animals !== false || opts.wild !== false) out.push(...WILD_PONDS);
  VILLAGE_ROWS.forEach((name, r) => {
    const z = VROW0 + r * VROWS;
    YARD_ANGLES.forEach((deg, c) => {
      const x = VCOL0 + c * VCOLS;
      if (name === 'jetty') out.push([x - 1, x + 13, z - 8, z + 8]);
      if (name === 'timber bridge') out.push([x - 5, x + 5, z - 8, z + 8]);
      if (name === 'stone bridge') out.push([x - 8, x + 8, z - 8, z + 8]);
    });
  });
  return out;
}

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

// (phase 3b) a village piece at (x, z) turned a
function villageAt(name, x, z, a, seed) {
  const f = (u, w) => [x + u * Math.cos(a) - w * Math.sin(a), z + u * Math.sin(a) + w * Math.cos(a)];
  const floor = G0 + 0.3, low = G0 - 0.05, house = { at: f(0, 0), angle: a, floor, low, seed, lit: true };
  const line = (us, w = 0) => us.map((u) => [...f(u, w), G0]);
  switch (name) {
    case 'cottage': return [{ kind: 'cottage', ...house, w: 3.0, d: 2.3, roof: 'thatch', walls: MAT.PLASTER2, timber: MAT.TIMBER, chimney: true }];
    case 'hall': return [{ kind: 'hall', ...house, w: 4.1, d: 2.9, roof: 'shingle', walls: MAT.PLASTER3, timber: MAT.TIMBER3, chimney: true }];
    case 'barn': return [{ kind: 'barn', ...house, w: 5.5, d: 3.6, roof: 'thatch' }];
    case 'chapel': return [{ kind: 'chapel', ...house, w: 4.8, d: 2.8 }];
    case 'chapel with a tower': return [{ kind: 'chapel', ...house, at: f(-1.5, 0), w: 4.6, d: 2.7, tower: true }];
    case 'market shelter': return [{ kind: 'shelter', at: f(0, 0), angle: a, base: G0, w: 3.0, d: 2.1, seed }];
    case 'jetty': return [{ kind: 'jetty', a: f(-3, 0), b: f(11, 0), y: POND + SCALE.kit.jetty.above, bed: G0 - 1.35, seed }, { kind: 'lantern', at: f(10.4, 0.6), base: POND + SCALE.kit.jetty.above }];
    case 'fence and gate': return [
      { kind: 'fence', pts: line([-9, -6.6, -4.2, -1.5]), angle: a, seed },
      { kind: 'gateposts', pts: line([-1.5, 1.5]), angle: a, seed: seed + 1 },
      { kind: 'fence', pts: line([1.5, 4.2, 6.6, 9]), angle: a, seed: seed + 2 }];
    case 'dry-stone wall': return [
      { kind: 'drystone', pts: line([-9, -5, -1.5]), seed },
      { kind: 'drystone', pts: line([1.5, 5, 9]), seed: seed + 1 }];
    case 'haystack and bench': return [{ kind: 'haystack', at: f(-3, 0), angle: a, base: G0, seed }, { kind: 'bench', at: f(3.5, 1), angle: a, base: G0, seed: seed + 1 }];
    case 'signpost and lantern': return [{ kind: 'signpost', at: f(0, 0), base: G0, arms: [a, a + 2.2, a - 1.9], seed }, { kind: 'lantern', at: f(3, 0), base: G0 }];
    case 'timber bridge': return [{ kind: 'bridge', style: 'timber', pts: [-8, -4, 0, 4, 8].map((u) => [...f(u, 0), G0 + 1.0]), water: POND, bed: G0 - 1.35, seed }];
    case 'stone bridge': return [{ kind: 'bridge', style: 'stone', arches: 2, pts: [-11, 11].map((u) => [...f(u, 0), G0 + 2.6]), water: POND, bed: G0 - 1.35, seed }];
    case 'inside a cottage': return [{ kind: 'cottage', ...house, w: 3.2, d: 2.5, roof: 'shingle', walls: MAT.PLASTER, timber: MAT.TIMBER2, enter: true }];
    default: return [];
  }
}

export function yardLayout(opts = {}) {
  const pieces = [];
  if (opts.wild !== false) pieces.push(...yardWild());
  YARD_ROWS.forEach((name, r) => {
    YARD_ANGLES.forEach((deg, c) => {
      const x = COL0 + c * COLS, z = ROW0 + r * ROWS;
      pieces.push(...piecesAt(name, x, z, deg * D, YARD_GROUND, 900 + r * 10 + c * 100));
    });
  });
  VILLAGE_ROWS.forEach((name, r) => {
    YARD_ANGLES.forEach((deg, c) => {
      pieces.push(...villageAt(name, VCOL0 + c * VCOLS, VROW0 + r * VROWS, deg * D, 3000 + r * 10 + c * 100));
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
  // (phase 3b) each village piece turned 25 degrees, from its front
  VILLAGE_ROWS.forEach((name, r) => {
    const tx = VCOL0 + VCOLS, tz = VROW0 + r * VROWS, a = 25 * D;
    if (name === 'inside a cottage') {
      // in through its door, toward the hearth
      const [x, z] = [tx - Math.sin(a) * 1.4 + Math.cos(a) * -1.2, tz + Math.cos(a) * 1.4 + Math.sin(a) * -1.2];
      cams.push({ name: 'inside a cottage', x, z, yaw: look(x, z, tx + Math.cos(a) * 2.5, tz + Math.sin(a) * 2.5), pitch: -6, time: 'night', y: G0 + 0.32 + 1.7 });
      return;
    }
    const front = name.endsWith('bridge') || name === 'jetty' ? a - Math.PI / 2 + 0.6 : name.startsWith('chapel') ? a + 0.5 : a + Math.PI / 2 + 0.35;
    const near = name.startsWith('chapel') ? 20 : name.endsWith('bridge') || name === 'jetty' ? 16 : name === 'hall' || name === 'barn' ? 16 : 12;
    const x = tx + Math.cos(front) * near, z = tz + Math.sin(front) * near;
    cams.push({ name: `${name}, near`, x, z, yaw: look(x, z, tx, tz), pitch: name.startsWith('chapel') ? 8 : 3, time: 'day' });
  });
  const vx = VCOL0 + VCOLS, vz = VROW0 + 3 * VROWS;
  cams.push({ name: 'the village pieces at night', x: vx - 70, z: vz - 50, yaw: look(vx - 70, vz - 50, vx, vz + 40), pitch: 2, time: 'night' });
  return cams;
}

export function buildYard(opts = {}) {
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
  // (phase 3b) ponds under the jetty and the bridges, with sloping banks
  for (const [x0, x1, z0, z1] of ponds(opts)) {
    for (let k = z0 - 3; k <= z1 + 3; k++) for (let i = x0 - 3; i <= x1 + 3; i++) {
      const j = k * NN + i, e = Math.min(k - z0, z1 - k, i - x0, x1 - i);
      if (e < -2) continue;
      ground[j] = Math.min(ground[j], YARD_GROUND - Math.max(0, Math.min(1, (e + 2) / 3)) * 1.35);
      if (e >= 0) { wWater[j] = 255; surface[j] = POND; }
    }
  }
  const levels = makeLevels(surface, N);
  const terrain = { N, NN, ground, levels, wWater, wRoad: zero(), wSand: zero(), wRock: zero(), wSnow: zero(), tone, fine, maxH: YARD_GROUND };
  terrain.wFloor = floorField(terrain, []);
  terrain.code = materialCode(terrain);
  const b = new KitBuilder();
  const spans = emptySpans();
  buildStructure(b, yardLayout(opts));
  const kit = compileKit(b);
  const torches = kit.torches.map((t) => ({ ...t }));
  const cams = [...yardCameras(), ...yardPeopleCameras(), ...(opts.animals !== false || opts.wild !== false ? yardAnimalCameras(opts) : [])];
  return {
    kind: 'yard', N, NN, center: [N / 2, N / 2], viewDist: 1e9,
    terrain, spans, kit, objects: { trees: [], bushes: [], torches, water: POND },
    clouds: buildClouds(), cameras: cams, start: { x: cams[0].x, z: cams[0].z, yaw: cams[0].yaw, pitch: 0 },
    buildMs: performance.now() - t0,
  };
}

// (phase 4a) People in the yard: a line of figures in every pose and with
// every tool and light, west of the village pieces' bench row, one sitting
// on that bench and one asleep in the cottage one can go into. Static: the
// yard has no plans. For the cameras below.
const PEOPLE_Z = VROW0 + 9 * VROWS + 3, PEOPLE_X0 = 292;
export function yardFigures() {
  const out = [];
  const put = (x, z, yaw, pose, o) => {
    const st = new Array(FS).fill(0);
    st[S.X] = x; st[S.Z] = z; st[S.FEET] = o.feet ?? G0; st[S.YAW] = yaw; st[S.POSE] = pose; st[S.PHASE] = o.phase ?? 0;
    st[S.LIGHT] = o.light ?? 0; st[S.ROOM] = o.room ?? -1; st[S.TOP] = o.top; st[S.BOTTOM] = o.bottom; st[S.HAT] = o.hat ?? MAT.OCHRE;
    st[S.SKIN] = o.skin ?? MAT.SKIN; st[S.HATK] = o.hatK ?? HATK.BARE; st[S.TOOL] = o.tool ?? TOOL.NONE; st[S.SCALE] = o.scale ?? 1; st[S.AUX] = o.aux ?? 0; st[S.ID] = out.length / FS;
    out.push(...st);
  };
  const f = 0;          // facing +z, toward the cameras
  put(PEOPLE_X0, PEOPLE_Z, f, POSE.STAND, { top: MAT.RUSSET, bottom: MAT.UMBER, hatK: HATK.HAT, tool: TOOL.HOE });
  put(PEOPLE_X0 + 2, PEOPLE_Z, f, POSE.WALK, { top: MAT.LINEN, bottom: MAT.CHARCOAL, hat: MAT.MOSS, hatK: HATK.HOOD, light: LIGHT.LANTERN, phase: 0.25 });
  put(PEOPLE_X0 + 4, PEOPLE_Z, f + 0.4, POSE.WORK, { top: MAT.OCHRE, bottom: MAT.UMBER, hat: MAT.LINEN, hatK: HATK.CAP, tool: TOOL.HOE, skin: MAT.SKIN2 });
  put(PEOPLE_X0 + 6, PEOPLE_Z, f - 0.5, POSE.FISH, { top: MAT.SLATE, bottom: MAT.LEATHER, hat: MAT.UMBER, hatK: HATK.CAP, tool: TOOL.ROD });
  put(PEOPLE_X0 + 8, PEOPLE_Z, f, POSE.SWEEP, { top: MAT.CHARCOAL, bottom: MAT.UMBER, hat: MAT.CHARCOAL, hatK: HATK.HOOD, tool: TOOL.BROOM });
  put(PEOPLE_X0 + 10, PEOPLE_Z, f, POSE.STAND, { top: MAT.SLATE, bottom: MAT.LEATHER, hatK: HATK.HELMET, tool: TOOL.SPEAR, light: LIGHT.TORCH });
  put(PEOPLE_X0 + 12, PEOPLE_Z, f + 0.3, POSE.WALK, { top: MAT.UMBER, bottom: MAT.MOSS, hat: MAT.UMBER, hatK: HATK.HAT, tool: TOOL.PACK, phase: 0.6, skin: MAT.SKIN2, scale: 1.04 });
  put(PEOPLE_X0 + 14, PEOPLE_Z, f, POSE.STAND, { top: MAT.MOSS, bottom: MAT.CHARCOAL, hat: MAT.RUSSET, hatK: HATK.BARE, scale: 0.94 });
  // on the bench of the 'haystack and bench' row (square to the grid)
  const bz = VROW0 + 9 * VROWS;
  put(VCOL0 + 3.5 - 0.4, bz + 1 - 0.04, 0, POSE.SIT, { top: MAT.RUSSET, bottom: MAT.SLATE, hatK: HATK.CAP, hat: MAT.LINEN, aux: SCALE.kit.bench.seat });
  // asleep in the cottage one can go into (square to the grid)
  const cz = VROW0 + 13 * VROWS, F = frame(VCOL0, cz, 0), wt = SCALE.kit.cottage.wallT;
  const fs = furnitureSpots(F, 3.2 - wt, 2.5 - wt, G0 + 0.3 + 0.02, 1);
  put(fs.bed.x, fs.bed.z, fs.bed.yaw, POSE.SLEEP, { top: MAT.LINEN, bottom: MAT.RUSSET, hatK: HATK.BARE, feet: fs.floor, aux: fs.bed.top - fs.floor });
  return Float32Array.from(out);
}

// and the cameras that look at them: near, at middle distance, far and very
// far, and near at night, the bench and the sleeper
export function yardPeopleCameras() {
  const cx = PEOPLE_X0 + 7, z = PEOPLE_Z;
  const look = (x, zz, tx, tz) => Math.atan2(tx - x, tz - zz) / D;
  const cams = [];
  for (const [name, d, pitch, time] of [['people, near', 9, -3, 'day'], ['people, middle distance', 24, -1, 'day'], ['people, far', 70, 0, 'day'], ['people, very far', 160, 0, 'day'], ['people at night, with a lantern and a torch', 9, -3, 'night']]) {
    const x = cx, zz = z + d;
    cams.push({ name, x, z: zz, yaw: look(x, zz, cx, z), pitch, time });
  }
  const bx = VCOL0 + 3.1, bz = VROW0 + 9 * VROWS + 1;
  // in through the door of the cottage one can go into, to the sleeper
  const cz = VROW0 + 13 * VROWS, F = frame(VCOL0, cz, 0), wt = SCALE.kit.cottage.wallT;
  const bed = furnitureSpots(F, 3.2 - wt, 2.5 - wt, G0 + 0.32, 1).bed, [ix, iz] = F.at(-0.2, 0.1);
  cams.push({ name: 'someone asleep', x: ix, z: iz, yaw: look(ix, iz, bed.x, bed.z), pitch: -36, time: 'night', y: G0 + 0.32 + 1.7 });
  cams.push({ name: 'someone on the bench', x: bx + 1.5, z: bz + 3.5, yaw: look(bx + 1.5, bz + 3.5, bx, bz), pitch: -6, time: 'day' });
  return cams;
}

// (phase 4b) The wild ground detail and the animals, west of the fort's
// pieces: a row of each kind of ground detail (three sizes of boulder, an
// outcrop, a log, a stump, a reed bed in a pond), and a row for each kind of
// animal in every pose, standing still. For the cameras below.
const WX0 = 24, WZ = 52, AZ0 = 86, AROWS = 16, AX0 = 30;
const WILD_PONDS = [[WX0 + 84, WX0 + 98, WZ - 7, WZ + 7], [AX0 - 4, AX0 + 5, AZ0 + 6 * AROWS - 4, AZ0 + 6 * AROWS + 4]];
export function yardWild() {
  const g = G0, out = [];
  out.push({ kind: 'boulder', at: [WX0, WZ], a: 0.4, r: 0.35, h: 0.4, top: g, low: g, seed: 70001 });
  out.push({ kind: 'boulder', at: [WX0 + 8, WZ], a: 1.1, r: 0.8, h: 0.8, top: g, low: g, seed: 70002 });
  out.push({ kind: 'boulder', at: [WX0 + 20, WZ], a: 2.0, r: 1.8, h: 1.7, top: g, low: g, seed: 70003 });
  out.push({ kind: 'outcrop', at: [WX0 + 36, WZ], a: 0.3, r: 1.6, h: 1.1, top: g, ground: [], seed: 70004 });
  out.push({ kind: 'log', at: [WX0 + 52, WZ], a: 0.5, len: 5, r: 0.28, base: g - 0.04, seed: 70005 });
  out.push({ kind: 'stump', at: [WX0 + 66, WZ], r: 0.35, h: 0.5, top: g, low: g, seed: 70006 });
  out.push({ kind: 'stump', at: [WX0 + 72, WZ + 1], r: 0.24, h: 0.35, top: g, low: g, seed: 70007 });
  out.push({ kind: 'reeds', at: [WX0 + 86, WZ - 2], r: 2.2, h: 1.6, base: POND, seed: 70008 });
  out.push({ kind: 'reeds', at: [WX0 + 89, WZ + 3], r: 1.6, h: 1.4, base: POND, seed: 70009 });
  return out;
}

// the rows: each kind's poses (in air: y above the ground)
const ROWS4B = [
  [KIND.SHEEP, [APOSE.STAND, APOSE.GRAZE, APOSE.WALK, APOSE.RUN, APOSE.LIE]],
  [KIND.COW, [APOSE.STAND, APOSE.GRAZE, APOSE.WALK, APOSE.LIE]],
  [KIND.HEN, [APOSE.STAND, APOSE.PECK, APOSE.WALK]],
  [KIND.DOG, [APOSE.STAND, APOSE.WALK, APOSE.RUN, APOSE.SIT, APOSE.LIE]],
  [KIND.DEER, [APOSE.STAND, APOSE.GRAZE, APOSE.WALK, APOSE.RUN, APOSE.LIE]],
  [KIND.HARE, [APOSE.SIT, APOSE.RUN]],
  [KIND.DUCK, [APOSE.SWIM, APOSE.SWIM, APOSE.SIT, APOSE.WALK]],
  [KIND.GULL, [APOSE.PERCH, APOSE.FLY, APOSE.FLY]],
  [KIND.CROW, [APOSE.PERCH, APOSE.FLY, APOSE.FLY]],
  [KIND.FINCH, [APOSE.PERCH, APOSE.FLY, APOSE.FLY]],
  [KIND.KITE, [APOSE.FLY, APOSE.FLY]],
];
const COATS = { [KIND.SHEEP]: [MAT.WOOL, MAT.CHARCOAL], [KIND.COW]: [MAT.HIDE, MAT.CHARCOAL], [KIND.HEN]: [MAT.RUSSET, MAT.OCHRE], [KIND.DOG]: [MAT.UMBER, MAT.CHARCOAL],
  [KIND.DEER]: [MAT.FAWN, MAT.LINEN], [KIND.HARE]: [MAT.HARE, MAT.LINEN], [KIND.DUCK]: [MAT.DUCK, MAT.DUCKHEAD], [KIND.GULL]: [MAT.GULL, MAT.SLATE],
  [KIND.CROW]: [MAT.CROW, MAT.CROW], [KIND.FINCH]: [MAT.UMBER, MAT.OCHRE], [KIND.KITE]: [MAT.UMBER, MAT.CHARCOAL] };
export function yardAnimals() {
  const out = [];
  ROWS4B.forEach(([kind, poses], r) => {
    const z = AZ0 + r * AROWS, gap = Math.max(2.4, SPEC[kind].len * 2.2);
    poses.forEach((pose, c) => {
      const st = new Array(AS).fill(0);
      const x = AX0 + c * gap + (kind === KIND.DUCK && c >= 2 ? 6 : 0);
      const fly = pose === APOSE.FLY, swim = pose === APOSE.SWIM;
      st[AN.X] = x; st[AN.Z] = z; st[AN.Y] = swim ? POND - 0.06 : fly ? G0 + 1.6 : pose === APOSE.PERCH ? G0 : G0;
      // (side on to the cameras, which look from +z)
      st[AN.YAW] = Math.PI / 2 + (c % 2 ? 0.35 : 0); st[AN.POSE] = pose; st[AN.PHASE] = fly ? (c === 1 ? 0.25 : 0.75) : pose === APOSE.WALK || pose === APOSE.RUN ? 0.25 : 0;
      st[AN.HEAD] = pose === APOSE.GRAZE || pose === APOSE.LIE ? 0 : 1; st[AN.KIND] = kind; st[AN.ID] = out.length / AS; st[AN.SCALE] = 1;
      st[AN.M1] = COATS[kind][0]; st[AN.M2] = COATS[kind][1]; st[AN.ROOM] = -1; st[AN.SPARE] = 0;
      out.push(...st);
    });
  });
  return Float32Array.from(out);
}

// the cameras: the ground detail near and from a way off, the animals near,
// at middle distance, far and very far, and each row near
export function yardAnimalCameras(opts = {}) {
  const look = (x, zz, tx, tz) => Math.atan2(tx - x, tz - zz) / D;
  const cams = [];
  if (opts.wild !== false) {
    const cx = WX0 + 45;
    cams.push({ name: 'wild ground detail, near', x: WX0 + 14, z: WZ + 9, yaw: look(WX0 + 14, WZ + 9, WX0 + 10, WZ), pitch: -8, time: 'day' });
    cams.push({ name: 'a log, a stump and reeds, near', x: WX0 + 66, z: WZ + 11, yaw: look(WX0 + 66, WZ + 11, WX0 + 70, WZ), pitch: -8, time: 'day' });
    cams.push({ name: 'wild ground detail, far', x: cx, z: WZ + 70, yaw: look(cx, WZ + 70, cx, WZ), pitch: -2, time: 'day' });
  }
  if (opts.animals !== false) {
    // (all the rows from the south-east and above: every row seen; held in
    // the air, as nothing is under them)
    const cx = AX0 + 6, cz = AZ0 + 5 * AROWS;
    for (const [name, d, h] of [['animals, middle distance', 40, 14], ['animals, far', 110, 22], ['animals, very far', 220, 30]]) {
      const x = cx + d * 0.8, z = cz + d * 0.6;
      cams.push({ name, x, z, y: G0 + h, held: true, yaw: look(x, z, cx, cz), pitch: -Math.atan2(h, d) / D, time: 'day' });
    }
    ROWS4B.forEach(([kind, poses], r) => {
      const z = AZ0 + r * AROWS, gap = Math.max(2.4, SPEC[kind].len * 2.2);
      const x0 = AX0, x1 = AX0 + (poses.length - 1) * gap + (kind === KIND.DUCK ? 6 : 0), x = (x0 + x1) / 2;
      const d = Math.max(5, (x1 - x0) * 0.85 + 2), sky = kind >= KIND.GULL ? 1.2 : 0;
      cams.push({ name: `animals: ${['sheep', 'cattle', 'hens', 'dog', 'deer', 'hare', 'ducks', 'gulls', 'crows', 'small birds', 'large birds'][kind]}, near`, x, z: z + d, yaw: look(x, z + d, x, z),
        pitch: -Math.atan2(1.7 - 0.3 - sky, d) / D, time: 'day' });
    });
  }
  return cams;
}
