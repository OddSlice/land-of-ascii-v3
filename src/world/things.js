// The things a favour has you carry or find (phase 5a), as a few exact
// boxes each in the kit's system, made of materials the people already
// wear and carry (no new colour): a bundle of cloth, a basket, a jar, a coil
// of rope, a sack, a letter, a knife, shears or a sickle, a hoe, a cold
// lantern, a pouch, a bucket, a staff. Each is drawn where it lies on the
// ground until it is found, and in the player's hand while carried; and
// the player's own lantern, lit, in the other hand (src/scene/cpu/figures.js).
//
// A part is [u, w, hx, hz, y0, y1, mat, flags]: centred u to the right and
// w forward of the thing's own point, half sizes hx across and hz along,
// from y0 to y1 above it; flags 1 for a thin part (held at two cells and
// faded with distance, as a person's), 2 for a flame, and (phase 5b) the
// kit's shape above the low bits: ELL an ellipsoid (a bundle of cloth, a
// sack, a fold of a cloak), CYL an upright cylinder (a jar, a bucket, a
// coil of rope), a box otherwise, so a thing reads as what it is.
import { MAT } from '../contract.js';
import { PT } from './kit.js';

export const SHAPE_SHIFT = 4;
const E = PT.ELL << SHAPE_SHIFT, Cy = PT.CYL << SHAPE_SHIFT;

const L = MAT.LINEN, O = MAT.OCHRE, U = MAT.UMBER, T = MAT.TIMBER, I = MAT.IRON, H = MAT.LEATHER, R = MAT.RUSSET, C = MAT.CHARCOAL;

// Lying on the ground.
export const LYING = {
  // cloth tied with a cord, the knot on top
  bundle: [[0, 0, 0.16, 0.13, 0, 0.22, L, E], [0, 0, 0.165, 0.014, -0.004, 0.226, U, E], [0, 0, 0.014, 0.135, -0.004, 0.226, U, E], [0, 0, 0.04, 0.04, 0.19, 0.26, L, E]],
  // (phase 5b) a cloak folded in a heap, its hood's fold on top
  cloak: [[0, 0, 0.22, 0.16, 0, 0.09, R, E], [0.04, -0.03, 0.15, 0.1, 0.05, 0.13, R, E], [-0.02, 0.1, 0.12, 0.05, 0.03, 0.08, U, E]],
  basket: [[0, 0, 0.16, 0.16, 0, 0.15, O, Cy], [0, 0, 0.165, 0.165, 0.12, 0.155, U, Cy], [0, 0, 0.015, 0.13, 0.15, 0.25, O, 1]],
  jar: [[0, 0, 0.075, 0.075, 0, 0.14, R, Cy], [0, 0, 0.045, 0.045, 0.14, 0.19, R, Cy], [0, 0, 0.05, 0.05, 0.185, 0.2, L, Cy]],
  rope: [[0, 0, 0.16, 0.16, 0, 0.07, O, Cy], [0, 0, 0.07, 0.07, 0.01, 0.072, U, Cy]],
  sack: [[0, 0, 0.18, 0.14, 0, 0.24, L, E], [0, 0, 0.05, 0.05, 0.2, 0.3, L, E], [0, 0, 0.055, 0.055, 0.215, 0.235, U, Cy]],
  letter: [[0, 0, 0.1, 0.07, 0, 0.02, L], [0, 0, 0.02, 0.02, 0.018, 0.026, R, Cy]],
  knife: [[0, 0.05, 0.02, 0.09, 0, 0.025, I, 1], [0, -0.07, 0.022, 0.05, 0, 0.03, T, 1]],
  // shears or a sickle: two blades from a pivot, wooden grips
  tool: [[-0.018, 0.08, 0.012, 0.1, 0, 0.02, I, 1], [0.018, 0.08, 0.012, 0.1, 0, 0.02, I, 1], [0, -0.01, 0.025, 0.025, 0, 0.03, I, Cy], [-0.03, -0.09, 0.022, 0.06, 0, 0.03, T, 1], [0.03, -0.09, 0.022, 0.06, 0, 0.03, T, 1]],
  hoe: [[0, 0, 0.022, 0.62, 0, 0.045, T, 1], [0, 0.62, 0.09, 0.05, 0, 0.04, I, 1]],
  // a cold lantern: the lit one's iron cage round dark glass, its ring
  oldlantern: [[0, 0, 0.065, 0.065, 0, 0.03, I], [0, 0, 0.048, 0.048, 0.03, 0.17, C], [0.055, 0.055, 0.008, 0.008, 0.03, 0.17, I, 1], [-0.055, 0.055, 0.008, 0.008, 0.03, 0.17, I, 1],
    [0.055, -0.055, 0.008, 0.008, 0.03, 0.17, I, 1], [-0.055, -0.055, 0.008, 0.008, 0.03, 0.17, I, 1], [0, 0, 0.06, 0.06, 0.17, 0.2, I], [0, 0, 0.025, 0.025, 0.2, 0.23, I, Cy], [0, 0, 0.035, 0.006, 0.23, 0.27, I, 1]],
  pouch: [[0, 0, 0.09, 0.07, 0, 0.09, H, E], [0, 0, 0.03, 0.03, 0.07, 0.11, H, E]],
  bucket: [[0, 0, 0.13, 0.13, 0, 0.26, T, Cy], [0, 0, 0.135, 0.135, 0.2, 0.23, I, Cy], [0, 0, 0.135, 0.135, 0.04, 0.065, I, Cy], [0, 0, 0.12, 0.008, 0.26, 0.36, I, 1]],
  staff: [[0, 0, 0.025, 0.8, 0, 0.05, T, 1]],
};

// Held in the hand, seen from just behind it: the same things, upright and
// compact (a hoe or a staff held short), a little smaller than true so they
// sit at the foot of the view without filling it.
const small = (parts, k = 0.72) => parts.map(([u, w, hx, hz, y0, y1, m, f]) => [u * k, w * k, hx * k, hz * k, y0 * k, y1 * k, m, f]);
export const HELD = {
  ...Object.fromEntries(Object.entries(LYING).map(([k, v]) => [k, small(v)])),
  // (phase 5b) a cloak over the forearm: its fold on top, the rest hanging
  // in front, the hem darker
  cloak: small([[0, 0, 0.22, 0.075, -0.03, 0.08, R, E],
    [-0.1, 0.045, 0.06, 0.018, -0.34, 0.0, R], [0, 0.06, 0.055, 0.018, -0.42, 0.0, R], [0.1, 0.045, 0.06, 0.018, -0.3, 0.0, R],
    [-0.1, 0.046, 0.061, 0.019, -0.37, -0.33, U], [0, 0.061, 0.056, 0.019, -0.45, -0.41, U], [0.1, 0.046, 0.061, 0.019, -0.33, -0.29, U]]),
  hoe: [[0, 0, 0.02, 0.02, -0.25, 0.3, T, 1], [0, 0.04, 0.08, 0.04, 0.3, 0.34, I]],
  staff: [[0, 0, 0.022, 0.022, -0.3, 0.35, T, 1]],
  // shears held by their grips, blades up
  tool: [[-0.022, 0, 0.016, 0.016, -0.08, 0.05, T, 1], [0.022, 0, 0.016, 0.016, -0.08, 0.05, T, 1], [0, 0, 0.022, 0.022, 0.05, 0.075, I, Cy], [-0.01, 0.01, 0.009, 0.014, 0.075, 0.22, I, 1], [0.01, 0.01, 0.009, 0.014, 0.075, 0.21, I, 1]],
  knife: [[0, 0, 0.02, 0.02, -0.05, 0.05, T, 1], [0, 0.01, 0.015, 0.012, 0.05, 0.17, I, 1]],
};

// The player's lantern, lit (as the people's: an iron cage round its flame).
// (a base, four corner posts, a roof and its cap, the flame inside)
export const LANTERN = [
  [0, 0, 0.06, 0.06, -0.03, 0, I], [0, 0, 0.055, 0.055, 0.15, 0.175, I], [0, 0, 0.025, 0.025, 0.175, 0.205, I],
  [0.05, 0.05, 0.008, 0.008, 0, 0.15, I, 1], [-0.05, 0.05, 0.008, 0.008, 0, 0.15, I, 1], [0.05, -0.05, 0.008, 0.008, 0, 0.15, I, 1], [-0.05, -0.05, 0.008, 0.008, 0, 0.15, I, 1],
  [0, 0, 0.024, 0.024, 0.02, 0.12, MAT.FLAME, 2],
];
// (its flame's middle, above the lantern's point)
export const LANTERN_FLAME_Y = 0.07;

// (phase 5b) A lost thing where it lies: `lift` metres proud of the ground
// and `grow` times its size, so it stands out of the grass; it shines
// (src/scene/cpu/build.js: `shine`), catching a lantern's light and the
// moon's as a polished thing does.
export const LOST = { lift: 0.035, grow: 1.2, shine: { light: 0.45, glow: 3, tone: 0.26 } };

// Where the hands hold things, from the eye: forward, right (left is
// negative) and down, metres; and how a walking stride sways them.
export const HANDS = { fwd: 0.8, right: 0.36, left: -0.36, down: 0.5, sway: 0.018, stride: 1.3 };
