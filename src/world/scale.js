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
};
