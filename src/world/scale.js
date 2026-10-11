// The scale of the generated world: the numbers every later phase builds
// to. docs/scale.md explains each one; change them there and here together.
// Distances are metres, speeds metres a second, slopes rise over run.

export const SCALE = {
  // the map: one cell is one metre, 2048 cells a side, no wrapping
  N: 2048,
  sea: 20,                    // sea level (heights are metres above a datum under the deepest sea)
  viewDist: 1500,             // how far the march goes

  // the body
  eye: 1.7,                   // eye above the feet
  chest: 1.3,                 // water deeper than this and you swim
  swimEye: 0.15,              // swimming, the eye sits this far above the surface
  walk: 4.5,                  // along the ground, whatever the slope
  run: 8,
  wade: 0.45,                 // walking speed is scaled down to this share at chest depth
  swim: 1.2,
  fly: 50,                    // F: free flight, for looking around
  climb: 1.0,                 // steepest ground you can walk up (tan 45 degrees)
  slide: 1.19,                // ground steeper than this (tan 50 degrees) slides you down
  slideSpeed: 6,

  // the land
  range: { top: 300, snow: 235, front: 430 },   // mountains close the north and east
  coast: 240,                 // the sea closes the south and west: the shore lies about this far in
  lowlandSlope: 0.08,         // the lowland's usual steepest, in the long rises

  // water
  river: { minWidth: 3, maxWidth: 14, ford: 0.6 },   // fords: water no deeper than this
  // things on the land
  trees: { target: 12000, height: [11, 24], spacing: 5 },
  road: { width: 4, maxSlope: 0.12 },
  wall: { length: 120, thick: 3, height: 6, gate: 4 },

  // the backdrop (phase 2a): the range going on past the north and east
  // edges as receding ridgelines, never walkable. Each runs `dist` metres
  // outside the edges (rounding the corner on an arc), its heights above the
  // sea between `low` and `high` with peaks `wave` metres apart; snow from
  // `snow`, trees below `tree` (heights above the sea). They stand to their full
  // height where the map's own edge beside them (smoothed over `reach`
  // metres along it) is `mount[1]` metres above the sea, and fall away to
  // nothing where it is `mount[0]` (coast, and out past the map's corners).
  // Profiles are kept every `step` metres, from `west` to `south`.
  backdrop: {
    step: 8, west: -2600, south: -2600, reach: 900, mount: [110, 210],
    // the faces' lean along the line, smoothed over these windows (metres)
    // from the crest down (each window three times the last)
    windows: [24, 72, 216, 648],
    // the faces lean back from the map at this slope (rise over run), and
    // turn along the line by `lean` times the line's own slope near a crest,
    // so a peak has a lit flank and a shaded one
    face: 0.8, lean: 2.2,
    layers: [
      { dist: 450, low: 200, high: 580, wave: 1100, snow: 450, tree: 210 },
      { dist: 1400, low: 320, high: 840, wave: 1700, snow: 560, tree: 220 },
      { dist: 3200, low: 440, high: 980, wave: 2600, snow: 640, tree: 230 },
    ],
  },
};
