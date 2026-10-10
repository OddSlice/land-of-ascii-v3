// Nine fixed cameras, each framed to match one of the reference thumbnails
// (reference/thumbs/, private). C cycles them; each brings its time of day.
// Angles in degrees: yaw 0 looks north, 90 east; pitch up is positive.
export const CAMERAS = [
  { name: 'road to the wall', ref: '04-1.png', refLabel: 'TheSketchit, ASCII Fort 0:03 (road)', x: 252.6, z: 86, yaw: 0, pitch: 0, time: 'day' },
  { name: 'meadow, cloud shadow, ridge', ref: '04-5.png', refLabel: 'TheSketchit, ASCII Fort 0:57 (mountains)', x: 262, z: 225, yaw: -8, pitch: 2, time: 'day' },
  { name: 'lake shore, treeline', ref: '04-6.png', refLabel: 'TheSketchit, ASCII Fort 1:07 (lake)', x: 327, z: 232.5, yaw: -12, pitch: -7, time: 'day' },
  { name: 'gate at night, torch', ref: '02-1.png', refLabel: 'TheSketchit, day & night 0:11 (gate, torch)', x: 257.4, z: 149.6, yaw: -14, pitch: 2, time: 'night' },
  { name: 'dusk across the wall', ref: '03-4.png', refLabel: 'TheSketchit, ray collision 0:36 (dusk wall)', x: 182, z: 112, yaw: 58, pitch: 2, time: 'dusk' },
  { name: 'low over the lake', ref: '04-3.png', refLabel: 'TheSketchit, ASCII Fort 0:35 (reflection)', x: 356, z: 229.6, yaw: 2, pitch: -12, time: 'day' },
  // trees at every distance: a stand's edge across the meadow, inside the
  // far-shore stand looking out, and that stand as a far treeline
  { name: 'forest edge across the meadow', ref: '03-3.png', refLabel: 'TheSketchit, ray collision 0:25 (conifers)', x: 276, z: 248, yaw: -97, pitch: 1, time: 'day' },
  { name: 'inside the stand, looking out', ref: '02-6.png', refLabel: 'TheSketchit, day & night 1:03 (forest)', x: 356, z: 320, yaw: 175, pitch: 3, time: 'day' },
  { name: 'far treeline', ref: '04-2.png', refLabel: 'TheSketchit, ASCII Fort 0:24 (hill shadow)', x: 345, z: 60, yaw: 4, pitch: 1, time: 'day' },
];
