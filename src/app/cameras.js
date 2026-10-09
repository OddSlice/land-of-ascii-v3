// Five fixed cameras, each framed to match one of the reference thumbnails
// (reference/thumbs/, private). C cycles them; each brings its time of day.
// Angles in degrees: yaw 0 looks north, 90 east; pitch up is positive.
export const CAMERAS = [
  { name: 'road to the wall', ref: '04-1.png', refLabel: 'TheSketchit, ASCII Fort 0:03 (road)', x: 254.6, z: 96, yaw: 0, pitch: 0, time: 'day' },
  { name: 'meadow, cloud shadow, ridge', ref: '04-5.png', refLabel: 'TheSketchit, ASCII Fort 0:57 (mountains)', x: 272, z: 212, yaw: -12, pitch: 2, time: 'day' },
  { name: 'lake shore, treeline', ref: '04-6.png', refLabel: 'TheSketchit, ASCII Fort 1:07 (lake)', x: 317, z: 207, yaw: 30, pitch: -4, time: 'day' },
  { name: 'gate at night, torch', ref: '02-1.png', refLabel: 'TheSketchit, day & night 0:11 (gate, torch)', x: 256, z: 158.8, yaw: 180, pitch: 0, time: 'night' },
  { name: 'dusk across the wall', ref: '03-4.png', refLabel: 'TheSketchit, ray collision 0:36 (dusk wall)', x: 172, z: 150, yaw: 75, pitch: 2, time: 'dusk' },
];
