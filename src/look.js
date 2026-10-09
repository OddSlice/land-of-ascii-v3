// The look of Land of Ascii v3, in one data file.
//
// Everything a person tunes by eye lives here: colours per time of day,
// each material's glyph family and ladder, how glyphs are inked, haze, light
// levels. Renderer code reads this file and never hard-codes a colour.
//
// Rules this file must keep (from the brief and reference/RESEARCH.md):
// - the cell's background carries the lit colour of the surface; the glyph is a
//   slightly lighter or darker tint of the same hue;
// - each family is a ladder from light marks to heavy marks; light picks the
//   rung (brighter surface, lighter mark), so at night the heavy rungs carry
//   what light there is;
// - muted: nothing fully saturated, nothing pure black, every channel clamped;
// - lit and shadowed grass differ mainly in brightness.
//
// Colours are sRGB hex. Three keyframes (day, dusk, night) are blended by the
// height of the sun, so time can run between them.

export const LOOK = {
  // Camera: vertical field of view in degrees. The eye is 1.7 m up (world/layout.js).
  fovY: 60,

  // Hours the 1, 2, 3 keys jump to.
  hours: { day: 14.0, dusk: 17.85, night: 23.0 },

  // Clamps applied to every colour after lighting, haze and ink.
  clamp: {
    min: 10,        // no channel below this: nothing pure black
    max: 236,       // no channel above this
    maxSat: 0.62,   // (max - min) / max of a colour is pulled down to this
  },

  // Ordered dither between rungs of a ladder, in rungs (0 = hard steps).
  dither: 0.7,

  // Light to colour: a surface's colour sits between its shade and lit
  // colours at light^curve, so shadows deepen faster than highlights.
  curve: 1.45,

  // How much a material's detail (its tone) moves the rung up or down the
  // ladder, so neighbouring cells do not all wear the same glyph. The detail
  // is fixed to the land, so this does not crawl as you walk.
  toneRung: 0.45,

  // Haze: the share of the horizon colour mixed in at distance d is
  // 1 - exp(-d / dist), times `max`.
  // Glyph contrast fades with the same haze, times `glyphFade`.
  haze: { glyphFade: 0.9 },

  // Glyph families, light to heavy. Any character works; the atlas draws the
  // shade blocks (░ ▒ ▓ █) itself when the font gets them wrong at small sizes.
  // `ink`: how far the glyph colour sits from the background, as a share of
  // the background: negative is darker, positive lighter. `lit` applies on
  // fully lit surfaces, `dark` in full shadow and at night; in between it is
  // blended by light. `floor` keeps glyphs visible on near-black cells.
  // `emissive`: the ladder runs the other way (a brighter star or flame is a
  // heavier mark), because the mark is the light.
  // `tone`: how strongly the material's detail (patches, joints, strata)
  // changes its colour.
  materials: {
    sky:     { glyphs: ' ',          ink: { lit: 0.00, dark: 0.00 } },
    cloud:   { glyphs: ' .:░▒',      ink: { lit: -0.07, dark: 0.12 } },
    sun:     { glyphs: '@',          ink: { lit: -0.06, dark: -0.06 }, emissive: true },
    moon:    { glyphs: '@',          ink: { lit: -0.10, dark: -0.10 }, emissive: true },
    star:    { glyphs: '.+*',        ink: { lit: 0.9, dark: 0.9 }, emissive: true },
    grass:   { glyphs: ',:;"+*%#',   ink: { lit: -0.30, dark: 0.50 }, tone: 0.20 },
    dirt:    { glyphs: '.:-=+#',     ink: { lit: -0.26, dark: 0.48 }, tone: 0.10 },
    sand:    { glyphs: '.,:;=+',     ink: { lit: -0.24, dark: 0.46 }, tone: 0.08 },
    rock:    { glyphs: ':=%#▒▓',     ink: { lit: -0.26, dark: 0.48 }, tone: 0.14 },
    snow:    { glyphs: '.-=+*',      ink: { lit: -0.14, dark: 0.36 }, tone: 0.06 },
    water:   { glyphs: '-~=≈',       ink: { lit: 0.16, dark: 0.40 }, tone: 0.0 },
    stone:   { glyphs: ':=#▒▓█',     ink: { lit: -0.24, dark: 0.46 }, tone: 0.18 },
    conifer: { glyphs: ':^*%#&▒',    ink: { lit: -0.28, dark: 0.50 }, tone: 0.12 },
    trunk:   { glyphs: ':|!I#',      ink: { lit: -0.28, dark: 0.46 } },
    bush:    { glyphs: ':o%&@',      ink: { lit: -0.28, dark: 0.50 }, tone: 0.10 },
    wood:    { glyphs: ':|!I',       ink: { lit: -0.15, dark: 0.30 } },
    flame:   { glyphs: '*^&@',       ink: { lit: 0.25, dark: 0.25 }, emissive: true },
  },

  // Ink floor: on near-black cells the glyph is lightened by at least this
  // colour times the ink amount, so night glyphs still carry light.
  inkFloor: '#2a2c34',

  // Keyframes. Every material has `lit` (full sun) and `shade` (no direct
  // light) colours; the resolve step blends between them by the light that
  // reaches the surface.
  keys: {
    day: {
      sky:    { high: '#465b9a', horizon: '#62769a', glow: '#9aa7bd', glowSize: 0.12 },
      cloud:  { lit: '#dfe1e8', shade: '#4c5070' },
      light:  { ambient: 0.30, direct: 0.80, cloudShadow: 0.62, castShadow: 0.92 },
      haze:   { colour: '#6f819e', dist: 700, max: 0.72 },
      torch:  { colour: '#ffb060', strength: 0.04 },
      stars:  0,
      sun:    '#f4eedc',
      moon:   '#c8ccd6',
      grass:  { lit: '#6f8a3e', shade: '#2f3b29' },
      dirt:   { lit: '#8f7d64', shade: '#433a33' },
      sand:   { lit: '#93805e', shade: '#4a4036' },
      rock:   { lit: '#8a7e6d', shade: '#383842' },
      snow:   { lit: '#d6cfc6', shade: '#737586' },
      water:  { lit: '#334152', shade: '#2a3544', sky: '#647693' },
      stone:  { lit: '#9a958d', shade: '#4d4b50' },
      conifer:{ lit: '#3f5239', shade: '#212b20' },
      trunk:  { lit: '#5e4b3a', shade: '#2e2620' },
      bush:   { lit: '#55703a', shade: '#28331f' },
      wood:   { lit: '#6a5340', shade: '#342a22' },
      flame:  '#ffc070',
    },
    dusk: {
      sky:    { high: '#35345c', horizon: '#7a5a64', glow: '#c48a6e', glowSize: 0.30 },
      cloud:  { lit: '#cba189', shade: '#4a3f58' },
      light:  { ambient: 0.30, direct: 0.55, cloudShadow: 0.25, castShadow: 0.80 },
      haze:   { colour: '#5e4d5c', dist: 420, max: 0.85 },
      torch:  { colour: '#ff9f50', strength: 0.30 },
      stars:  0.15,
      sun:    '#f0b07a',
      moon:   '#b8b6c4',
      grass:  { lit: '#4f5838', shade: '#23292a' },
      dirt:   { lit: '#6a5650', shade: '#2e2829' },
      sand:   { lit: '#6e5c50', shade: '#30292a' },
      rock:   { lit: '#625560', shade: '#2f2a33' },
      snow:   { lit: '#a8949a', shade: '#4f4859' },
      water:  { lit: '#3f3f55', shade: '#2c2c3e', sky: '#6a5568' },
      stone:  { lit: '#776466', shade: '#3e383f' },
      conifer:{ lit: '#2c3430', shade: '#1a1f1e' },
      trunk:  { lit: '#3e3230', shade: '#221c1c' },
      bush:   { lit: '#36402e', shade: '#1d221c' },
      wood:   { lit: '#4c3a32', shade: '#261e1b' },
      flame:  '#ffb060',
    },
    night: {
      sky:    { high: '#121520', horizon: '#1d2230', glow: '#283044', glowSize: 0.10 },
      cloud:  { lit: '#3b3b47', shade: '#1a1b23' },
      light:  { ambient: 0.22, direct: 0.42, cloudShadow: 0.15, castShadow: 0.70 },
      haze:   { colour: '#1a1e29', dist: 330, max: 0.80 },
      torch:  { colour: '#ffb15a', strength: 0.55 },
      stars:  1,
      sun:    '#f4eedc',
      moon:   '#c9ccd4',
      grass:  { lit: '#20252a', shade: '#121418' },
      dirt:   { lit: '#25242a', shade: '#131317' },
      sand:   { lit: '#27262a', shade: '#141417' },
      rock:   { lit: '#252429', shade: '#131316' },
      snow:   { lit: '#3c3f4c', shade: '#1d1f28' },
      water:  { lit: '#1b2029', shade: '#11141b', sky: '#20263a' },
      stone:  { lit: '#29282e', shade: '#141418' },
      conifer:{ lit: '#17191c', shade: '#0e0f12' },
      trunk:  { lit: '#1c1a1a', shade: '#0f0e0f' },
      bush:   { lit: '#191c1c', shade: '#0f1011' },
      wood:   { lit: '#221d1a', shade: '#110f0e' },
      flame:  '#ffb468',
    },
  },
};
