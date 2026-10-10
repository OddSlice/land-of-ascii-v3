// The Look Lab's scene, by hand. A fixed greybox valley on a 512 x 512 grid,
// one cell = one metre. x runs east, z runs north, y is up (metres).
//
//   north edge   mountain ridge to ~120 m, snow on top
//                conifer stand A (west)        conifer stand B (north of the lake)
//                                      lake with a sand shore (east)
//   z 157..160   stone wall, x 196..316, 6 m high, crenellated, arched gate at x 254..258
//                torch south of the gate, left of it
//                dirt road from the start to the gate
//   south        low rounded hill (west), the start, long shallow rises to the rims

export const SEED = 20261009;
export const N = 512;              // cells per side
export const EYE = 1.7;            // eye height above the feet, metres

export const GROUND = 11.0;        // meadow level at the wall
export const WATER = 9.0;          // lake surface

export const WALL = {
  x0: 196, x1: 316,                // cells x0 .. x1-1 (120 m)
  z0: 157, z1: 160,                // cells z0 .. z1-1 (3 m thick)
  base: GROUND - 2,                // spans start below the ground
  top: GROUND + 6,                 // walkway height
  merlon: 1.5,                     // merlon height above the walkway
  merlonW: 2, merlonGap: 2,        // merlons 2 m wide, 2 m apart
};

export const GATE = {
  x0: 254, x1: 258,                // 4 m wide
  jamb: 2.8,                       // where the arch springs, above the ground
  cx: 256, r: 2,                   // a semicircle: crown at 4.8 m
};

export const ROAD = {
  // centre line from the start to just through the gate
  points: [[258, 20], [251, 58], [253, 100], [256, 138], [256, 157], [256, 167]],
  half: 2.0,                       // half width, metres
  soft: 0.7,                       // soft edge
};

export const LAKE = { x: 362, z: 262, rx: 50, rz: 33, angle: 0.25, depth: 4.2 };
export const HILL = { x: 148, z: 98, r: 78, h: 13 };
export const RIDGE = {
  z0: 368, z1: 482, base: 48,      // a massif rising toward the north edge
  // peaks on it: x, z, height above the massif, radius
  peaks: [[204, 474, 72, 118], [346, 484, 58, 104], [92, 466, 36, 90], [456, 458, 42, 86]],
};

export const TORCH = { x: 252.3, z: 155.7, height: 2.1 };

export const STANDS = [
  { x: 198, z: 262, rx: 40, rz: 32, count: 20, gap: 4.4 },   // west of the meadow
  { x: 364, z: 316, rx: 58, rz: 17, count: 90, gap: 2.7, tall: 1.2 },   // a thick stand along the lake's far shore
];

export const BUSHES = [
  [244.5, 88], [266, 120], [238, 140], [281, 176], [228, 214], [338, 206], [430, 300], [178, 300],
];

// The player starts on the road looking north to the gate.
export const START = { x: 252.6, z: 86, yaw: 0, pitch: 0 };
