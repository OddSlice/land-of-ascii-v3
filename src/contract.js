// The fixed contract between the three renderer layers.
//
//   scene backend  ->  HitBuffer  ->  resolve  ->  CellBuffer  ->  presenter
//
// A scene backend answers, for every cell of the screen, what its ray hit.
// It writes a HitBuffer and nothing else. The resolve step turns a HitBuffer
// into a CellBuffer (one glyph, one foreground and one background colour per
// cell) using src/look.js. The presenter draws a CellBuffer. Any backend that
// fills a HitBuffer as described here can replace the CPU one without
// touching resolve or the presenter.
//
// Both buffers are plain Uint8Arrays, row-major over the cells they cover,
// HIT_STRIDE / CELL_STRIDE bytes per cell, so they can be transferred between
// threads or read back from a GPU render target without conversion.

// ---- Materials -------------------------------------------------------------
// The ids are part of the contract. Names match the keys of LOOK.materials.
export const MAT = {
  SKY: 0, CLOUD: 1, SUN: 2, MOON: 3, STAR: 4,
  GRASS: 5, DIRT: 6, SAND: 7, ROCK: 8, SNOW: 9, WATER: 10,
  STONE: 11, CONIFER: 12, TRUNK: 13, BUSH: 14, WOOD: 15, FLAME: 16,
  BED: 17,                         // the silt of a lake or river bed
  FLOOR: 18,                       // the needle-strewn ground under a stand of trees
  FOAM: 19,                        // foam floating at the waterline (phase 2a; only ever in R2)
};
export const MAT_NAMES = Object.keys(MAT).map((k) => k.toLowerCase());
export const MAT_COUNT = MAT_NAMES.length;
// Not a material: an empty record (a cell with no water has no R1 or R2).
export const MAT_NONE = 255;

// ---- HitBuffer: 24 bytes per cell = three records of 8 bytes ------------------
// R0 (bytes 0..7)    what the cell's own ray hit.
// R1 (bytes 8..15)   for a water cell, what the ray reflected off the water
//                    surface hit (terrain, wall, tree, sky, cloud, sun, ...),
//                    with the same fields; `dist` is the second leg, from the
//                    water to the hit. MAT_NONE where R0 is not water.
// R2 (bytes 16..23)  for a water cell, what the ray refracted into the water
//                    hit: the bed (BED, SAND, ...), lit as any surface; `dist`
//                    is the length of the path through the water, which the
//                    resolve step turns into depth colour. MAT_NONE elsewhere.
//                    Or (phase 2a) FOAM, where foam floats at the waterline:
//                    lit as the surface, `tone` how much of the cell the foam
//                    covers (255 = all), `dist` the path to the bed as above
//                    (0: none marched); resolve draws the water with a sandy
//                    bed under it and the foam over it by that share.
// R1 (bytes 8..15)   also (phase 2a), for a cell that is NOT water: MAT_NONE,
//                    or, where a skyline covers only part of the cell (the
//                    land in R0 rising into it from below), what lies behind
//                    the rest of it (sky, cloud, a far ridgeline), whose [4]
//                    is then the share of the cell the land covers (its own
//                    glow is taken as none); resolve blends the two by it.
// For a water cell R0's `tone` is the Fresnel share of the mirror (with the
// ripples), and R0's shadow, cloud and glow are those of the surface point.
// A backend that does no water rays leaves R1 and R2 MAT_NONE and resolve
// falls back to a flat water colour. A GPU backend can fill the three records
// from six RGBA8 render targets.
//
// Every record:
// [0] mat     material id (MAT)
// [1] light   direct light reaching the surface from the sun or moon,
//             0..255 = 0..1 (the shading from the surface normal; cast
//             shadows are NOT applied here).
//             Sky: elevation of the ray, 0 = horizon or below, 255 = zenith.
//             Cloud: 0 = grey underside .. 255 = sunlit top.
//             Sun, moon, flame: brightness of the light source.
//             Star: elevation, as for the sky.
// [2] shadow  cast shadow from terrain, walls and trees, 0 = lit .. 255 = fully shadowed
//             Cloud: the sky's elevation behind it (as the sky's light).
// [3] cloud   cloud shadow, 0 = none .. 255 = deepest
//             Cloud: the sky's closeness to the sun behind it (as the sky's tone).
//             Star (phase 2b): the same, the sky's closeness to the sun.
// [4] glow    point light (the torch), 0..255
// [5] tone    material detail, 0..255 with 128 = none (patches, joints, strata).
//             Sky: closeness to the sun, 255 * (1 - angle / pi).
//             Star: brightness of the star.
//             Water (R0): Fresnel share of the mirror, 0..255.
//             Flame: how much of the drawn flame is really flame, 255 = all.
//             A distant flame is drawn at least two rows tall so it cannot
//             blink; below its true size it is faded toward what is behind
//             it (resolve takes that from the next cell up its column, or
//             down, for a reflection).
//             Cloud: coverage, 255 = solid; less at the edge, where the cloud
//             dissolves into the sky behind it.
// [6..7] dist distance along the ray in decimetres, little-endian uint16;
//             65535 = infinitely far (sky).
export const HIT_STRIDE = 24;
export const REC = 8;              // bytes per record; R1 at +REC, R2 at +2 REC
export const H_MAT = 0, H_LIGHT = 1, H_SHADOW = 2, H_CLOUD = 3, H_GLOW = 4, H_TONE = 5, H_DIST = 6;
export const DIST_FAR = 65535;

// ---- CellBuffer: 8 bytes per cell --------------------------------------------
// [0..2] background r, g, b
// [3]    glyph index into the atlas (src/glyphs.js)
// [4..6] foreground (glyph) r, g, b
// [7]    unused (0)
// Uploaded as an RGBA8 texture two texels wide per cell.
export const CELL_STRIDE = 8;

// ---- Frame description ------------------------------------------------------
// What every backend and resolve call receives (plain data, cloneable):
// {
//   seq,                      frame number
//   cam: { x, y, z, yaw, pitch }   eye position (m) and angles (radians;
//                             yaw 0 looks north (+z), positive turns east;
//                             pitch positive looks up)
//   cols, rows,               cell grid
//   fovY,                     vertical field of view (radians)
//   aspect,                   width / height of the picture in pixels
//   hour,                     time of day, 0..24
//   t,                        animation clock in seconds (clouds, flame)
//   look: { tree, cloud, meadow, shallows, air, night }   the look candidates
//                             and rules in use (LOOK.choices); missing keys
//                             take the defaults
//   day,                      (phase 2a) whole days since day 0, which the
//                             moon's phase follows; missing means day 0
//   weather: { mix, wet, drift }   (phase 2b) how much of each kind of
//                             weather applies (mix: { clear, fair, overcast,
//                             rain, mist }, missing kinds 0), how wet the
//                             ground is (0..1) and how many metres east the
//                             clouds have drifted beyond the animation
//                             clock's drift; every layer blends the kinds'
//                             numbers in src/look.js by the mix
//                             (src/weather.js). Missing means fair, dry, no
//                             drift: exactly the look before weather.
// }
// (phase 2b) Resolve also reads one thing from the world besides the frame:
// the mist's floor (the ground smoothed over its surroundings,
// src/weather.js mistFloorOf), only while there is mist; it is world data,
// not the backend's, so another backend still needs only fill a HitBuffer.
// Cell (cx, cy) has its centre at screen position
//   x = 2 (cx + 0.5) / cols - 1,  y = 1 - 2 (cy + 0.5) / rows   (both -1..1)
// and looks along camera-space (x tan(fovX/2), y tan(fovY/2), 1).
