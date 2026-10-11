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
  // mountains close the north and east: peaks rise between `climb` metres
  // past the front to `top` plus `rise`, as the share of that climb to the
  // power `steep` (phase 2a: from 70 to 400 m, 1.45, 45 m, so they stand
  // higher at the back and no steeper at the front; phase 1: 50 to 380 m,
  // 1.25, 20 m); toward the edges they even out into a shoulder `shoulder`
  // metres under `top`; snow lies from `snow` metres up, judged also by how
  // far a point stands above the ground round it (phase 2b, `snowRelief`:
  // [over how many metres, metres lower for each metre it stands above]), so
  // a crest just over the line stays bare instead of wearing a thin white line
  range: { top: 300, rise: 50, steep: 1.45, climb: [70, 390], shoulder: 95, snow: 235, snowRelief: [160, 1.2], front: 430 },
  coast: 240,                 // the sea closes the south and west: the shore lies about this far in
  beach: 16,                  // beaches run about this far up from the sea (phase 2a; 34 before)
  lowlandSlope: 0.08,         // the lowland's usual steepest, in the long rises

  // water
  river: { minWidth: 3, maxWidth: 14, ford: 0.6 },   // fords: water no deeper than this
  // things on the land
  trees: { target: 12000, height: [11, 24], spacing: 5 },
  // copses (phase 2a): about `count` small clumps of `trees` conifers in the
  // open lowland, at least `apart` metres apart, trees `spacing` apart
  copses: { count: 32, trees: [5, 30], apart: 140, spacing: 4.5 },
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
    // snow caps a peak above its line by this share of its height over it
    cap: 0.55,
    layers: [
      { dist: 450, low: 200, high: 580, wave: 1100, snow: 480, tree: 210 },
      { dist: 1400, low: 320, high: 840, wave: 1700, snow: 620, tree: 220 },
      { dist: 3200, low: 440, high: 980, wave: 2600, snow: 700, tree: 230 },
    ],
  },
};
