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
// faded with distance, as a person's), 2 for a flame.
import { MAT } from '../contract.js';

const L = MAT.LINEN, O = MAT.OCHRE, U = MAT.UMBER, T = MAT.TIMBER, I = MAT.IRON, H = MAT.LEATHER, R = MAT.RUSSET, C = MAT.CHARCOAL;

// Lying on the ground.
export const LYING = {
  bundle: [[0, 0, 0.17, 0.12, 0, 0.12, L], [0, 0, 0.175, 0.03, 0, 0.125, U]],
  basket: [[0, 0, 0.17, 0.13, 0, 0.16, O], [0, 0, 0.02, 0.13, 0.16, 0.24, O, 1]],
  jar: [[0, 0, 0.07, 0.07, 0, 0.15, R], [0, 0, 0.045, 0.045, 0.15, 0.19, L]],
  rope: [[0, 0, 0.16, 0.16, 0, 0.07, O]],
  sack: [[0, 0, 0.18, 0.14, 0, 0.22, L], [0, 0, 0.05, 0.05, 0.22, 0.28, L]],
  letter: [[0, 0, 0.1, 0.07, 0, 0.02, L]],
  knife: [[0, 0.05, 0.02, 0.09, 0, 0.025, I, 1], [0, -0.07, 0.022, 0.05, 0, 0.03, T, 1]],
  tool: [[0, 0.06, 0.025, 0.11, 0, 0.025, I, 1], [0, -0.08, 0.025, 0.07, 0, 0.03, T, 1]],
  hoe: [[0, 0, 0.022, 0.62, 0, 0.045, T, 1], [0, 0.62, 0.09, 0.05, 0, 0.04, I, 1]],
  oldlantern: [[0, 0, 0.065, 0.065, 0, 0.03, I], [0, 0, 0.05, 0.05, 0.03, 0.17, C], [0, 0, 0.065, 0.065, 0.17, 0.2, I]],
  pouch: [[0, 0, 0.09, 0.07, 0, 0.08, H]],
  bucket: [[0, 0, 0.13, 0.13, 0, 0.26, T], [0, 0, 0.135, 0.135, 0.2, 0.23, I]],
  staff: [[0, 0, 0.025, 0.8, 0, 0.05, T, 1]],
};

// Held in the hand, seen from just behind it: the same things, upright and
// compact (a hoe or a staff held short), a little smaller than true so they
// sit at the foot of the view without filling it.
const small = (parts, k = 0.72) => parts.map(([u, w, hx, hz, y0, y1, m, f]) => [u * k, w * k, hx * k, hz * k, y0 * k, y1 * k, m, f]);
export const HELD = {
  ...Object.fromEntries(Object.entries(LYING).map(([k, v]) => [k, small(v)])),
  hoe: [[0, 0, 0.02, 0.02, -0.25, 0.3, T, 1], [0, 0.04, 0.08, 0.04, 0.3, 0.34, I]],
  staff: [[0, 0, 0.022, 0.022, -0.3, 0.35, T, 1]],
  tool: [[0, 0, 0.025, 0.02, -0.06, 0.06, T, 1], [0, 0.02, 0.02, 0.03, 0.06, 0.2, I, 1]],
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

// Where the hands hold things, from the eye: forward, right (left is
// negative) and down, metres; and how a walking stride sways them.
export const HANDS = { fwd: 0.8, right: 0.36, left: -0.36, down: 0.5, sway: 0.018, stride: 1.3 };
