// Five fixed cameras, each framed to match one of the reference thumbnails
// (reference/thumbs/, private). C cycles them; each brings its time of day.
// Angles in degrees: yaw 0 looks north, 90 east; pitch up is positive.
export const CAMERAS = [
  { name: 'road to the wall', ref: '04-1.png', refLabel: 'TheSketchit, ASCII Fort 0:03 (road)', x: 252.6, z: 86, yaw: 0, pitch: 0, time: 'day' },
  { name: 'meadow, cloud shadow, ridge', ref: '04-5.png', refLabel: 'TheSketchit, ASCII Fort 0:57 (mountains)', x: 262, z: 225, yaw: -8, pitch: 2, time: 'day' },
  { name: 'lake shore, treeline', ref: '04-6.png', refLabel: 'TheSketchit, ASCII Fort 1:07 (lake)', x: 313, z: 243, yaw: 50, pitch: -8, time: 'day' },
  { name: 'gate at night, torch', ref: '02-1.png', refLabel: 'TheSketchit, day & night 0:11 (gate, torch)', x: 257.4, z: 149.6, yaw: -14, pitch: 2, time: 'night' },
  { name: 'dusk across the wall', ref: '03-4.png', refLabel: 'TheSketchit, ray collision 0:36 (dusk wall)', x: 182, z: 112, yaw: 58, pitch: 2, time: 'dusk' },
];
